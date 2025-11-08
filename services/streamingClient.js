/**
 * Streaming WebSocket Client for Real-time Audio Processing
 * Handles continuous audio streams, real-time transcription, and TTS playback
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const OpenAI = require('openai');
const audioConverter = require('./audioConverter');
const AudioProcessor = require('./audioProcessor');
const elevenlabsService = require('./elevenlabsService');
const flowEngine = require('./flowEngine');

class StreamingClient extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            url: config.url || process.env.STREAMING_WS_URL || 'ws://localhost:8080/streaming',
            reconnectInterval: config.reconnectInterval || 3000,
            openaiApiKey: process.env.OPENAI_API_KEY,
            streamingBufferMs: config.streamingBufferMs || 2000, // 2 seconds buffer
            silenceThreshold: config.silenceThreshold || 1000,   // 1 second silence
            minSpeechDuration: config.minSpeechDuration || 1500,  // 1.5 seconds minimum
            ...config
        };
        
        this.ws = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        
        // OpenAI streaming setup
        this.openai = new OpenAI({
            apiKey: this.config.openaiApiKey
        });
        
        // Active streaming sessions
        this.streamingSessions = new Map(); // ucid -> session data
        this.audioProcessors = new Map();   // ucid -> AudioProcessor
        this.transcriptionBuffers = new Map(); // ucid -> accumulated transcription
        this.playbackQueues = new Map();    // ucid -> playback queue
        
        // Streaming state
        this.isTranscribing = new Map();    // ucid -> boolean
        this.isPlayingBack = new Map();     // ucid -> boolean
        
        console.log('[StreamingClient] 🎯 Initialized for real-time audio processing', {
            url: this.config.url,
            openaiEnabled: !!this.config.openaiApiKey,
            bufferMs: this.config.streamingBufferMs
        });
    }

    /**
     * Initialize and connect to streaming server
     */
    async initialize() {
        if (!this.config.openaiApiKey) {
            throw new Error('OpenAI API key required for streaming transcription');
        }
        
        console.log('[StreamingClient] 🚀 Starting streaming client...');
        this.connect();
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('[StreamingClient] Already connected');
            return;
        }

        console.log('[StreamingClient] Connecting to streaming server:', this.config.url);

        try {
            this.ws = new WebSocket(this.config.url);

            this.ws.on('open', () => this.handleOpen());
            this.ws.on('message', (data) => this.handleMessage(data));
            this.ws.on('close', (code, reason) => this.handleClose(code, reason));
            this.ws.on('error', (error) => this.handleError(error));

        } catch (err) {
            console.error('[StreamingClient] Connection error:', err);
            this.scheduleReconnect();
        }
    }

    /**
     * Handle connection open
     */
    handleOpen() {
        console.log('[StreamingClient] ✅ Connected to streaming server');
        this.isConnected = true;
        this.clearReconnectTimer();
        
        // Send client capabilities
        this.send({
            type: 'client_ready',
            capabilities: {
                realTimeTranscription: true,
                ttsPlayback: true,
                languages: ['en', 'hi', 'te', 'ta', 'kn', 'ml'],
                bufferMs: this.config.streamingBufferMs
            }
        });
        
        this.emit('connected');
    }

    /**
     * Handle incoming WebSocket messages
     */
    async handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type || message.event) {
                case 'stream_start':
                    await this.handleStreamStart(message);
                    break;
                    
                case 'audio_chunk':
                case 'media':
                    await this.handleAudioChunk(message);
                    break;
                    
                case 'stream_end':
                    await this.handleStreamEnd(message);
                    break;
                    
                case 'control':
                    await this.handleControl(message);
                    break;
                    
                default:
                    console.log('[StreamingClient] Unknown message type:', message.type);
            }
            
        } catch (err) {
            console.error('[StreamingClient] Error processing message:', err);
        }
    }

    /**
     * Handle stream start event
     */
    async handleStreamStart(message) {
        const { ucid, language = 'en', voice = 'alloy' } = message;
        
        console.log('[StreamingClient] 🎙️  Starting audio stream', { ucid, language, voice });
        
        // Initialize streaming session
        this.streamingSessions.set(ucid, {
            ucid,
            language,
            voice,
            startTime: Date.now(),
            totalAudioMs: 0,
            transcriptionChunks: 0,
            playbackChunks: 0
        });
        
        // Initialize audio processor for real-time processing
        this.audioProcessors.set(ucid, new AudioProcessor(ucid, {
            minAudioDuration: this.config.minSpeechDuration,
            maxAudioDuration: this.config.streamingBufferMs * 2, // 4 seconds max
            silenceThreshold: this.config.silenceThreshold,
            silenceAmplitude: 300, // Higher threshold for streaming
            sampleRate: 8000
        }));
        
        // Initialize transcription buffer
        this.transcriptionBuffers.set(ucid, {
            partialText: '',
            finalText: '',
            language: language
        });
        
        // Initialize playback queue
        this.playbackQueues.set(ucid, []);
        
        // Reset state flags
        this.isTranscribing.set(ucid, false);
        this.isPlayingBack.set(ucid, false);
        
        console.log('[StreamingClient] ✅ Streaming session initialized for', ucid);
        this.emit('stream_started', { ucid, language, voice });
    }

    /**
     * Handle incoming audio chunks for real-time processing
     */
    async handleAudioChunk(message) {
        const { ucid, data } = message;
        const processor = this.audioProcessors.get(ucid);
        const session = this.streamingSessions.get(ucid);
        
        if (!processor || !session) {
            console.warn('[StreamingClient] No session found for audio chunk:', ucid);
            return;
        }

        // Extract audio samples
        const { samples, sampleRate = 8000 } = data;
        
        if (!samples || samples.length === 0) {
            return;
        }

        // Add samples to processor
        processor.addSamples(samples, sampleRate);
        session.totalAudioMs += (samples.length / sampleRate) * 1000;
        
        // Check if we should process this chunk for transcription
        if (processor.shouldSendToAPI() && !this.isTranscribing.get(ucid)) {
            await this.processAudioChunk(ucid);
        }
    }

    /**
     * Process audio chunk with OpenAI Streaming API
     */
    async processAudioChunk(ucid) {
        const processor = this.audioProcessors.get(ucid);
        const session = this.streamingSessions.get(ucid);
        const buffer = this.transcriptionBuffers.get(ucid);
        
        if (!processor || !session || !buffer) {
            console.warn('[StreamingClient] Missing components for transcription:', ucid);
            return;
        }

        // Prevent concurrent transcriptions
        if (this.isTranscribing.get(ucid)) {
            console.log('[StreamingClient] Transcription already in progress for', ucid);
            return;
        }

        try {
            this.isTranscribing.set(ucid, true);
            
            // Get WAV buffer from processor
            const wavBuffer = processor.toWAVBuffer();
            if (!wavBuffer) {
                console.warn('[StreamingClient] No WAV buffer generated for', ucid);
                return;
            }

            const processorInfo = processor.getInfo();
            console.log('[StreamingClient] 🎤 Processing audio chunk for transcription', {
                ucid,
                durationMs: processorInfo.durationMs,
                samples: processorInfo.totalSamples,
                language: session.language
            });

            // Validate audio quality
            if (!this.validateAudioChunk(processor)) {
                console.log('[StreamingClient] ⚠️  Audio chunk validation failed - skipping');
                processor.reset();
                return;
            }

            // Start streaming transcription with OpenAI
            await this.streamTranscription(ucid, wavBuffer, session.language);
            
            // Reset processor for next chunk
            processor.reset();
            session.transcriptionChunks++;
            
        } catch (error) {
            console.error('[StreamingClient] Error processing audio chunk:', error);
        } finally {
            this.isTranscribing.set(ucid, false);
        }
    }

    /**
     * Validate audio chunk quality before transcription
     */
    validateAudioChunk(processor) {
        const info = processor.getInfo();
        
        // Check minimum duration
        if (info.durationMs < 1000) {
            console.log('[StreamingClient] Audio too short:', info.durationMs, 'ms');
            return false;
        }

        // Check audio energy (RMS)
        const samples = processor.samples;
        const sum = samples.reduce((acc, s) => acc + (s * s), 0);
        const rms = Math.sqrt(sum / samples.length);
        
        const MIN_RMS = 250; // Minimum energy threshold
        if (rms < MIN_RMS) {
            console.log('[StreamingClient] Audio energy too low:', rms.toFixed(2));
            return false;
        }

        console.log('[StreamingClient] ✅ Audio validation passed:', {
            duration: info.durationMs,
            rms: rms.toFixed(2)
        });
        
        return true;
    }

    /**
     * Stream transcription using OpenAI's real-time API
     */
    async streamTranscription(ucid, audioBuffer, language) {
        try {
            console.log('[StreamingClient] 🌊 Starting streaming transcription for', ucid);
            
            // Create blob from buffer for OpenAI API
            const blob = new Blob([audioBuffer], { type: 'audio/wav' });
            const file = new File([blob], 'audio.wav', { type: 'audio/wav' });

            // Use OpenAI transcription with streaming-like behavior
            // Note: OpenAI doesn't have true streaming transcription yet, but we can simulate it
            const startTime = Date.now();
            
            const transcription = await this.openai.audio.transcriptions.create({
                file: file,
                model: 'whisper-1',
                language: language === 'auto' ? undefined : language,
                response_format: 'verbose_json',
                prompt: 'This is a phone conversation. Please transcribe clearly.' // Context hint
            });

            const transcriptionTime = Date.now() - startTime;
            const text = transcription.text?.trim() || '';
            const detectedLanguage = transcription.language || language;

            console.log('[StreamingClient] 📝 Transcription received', {
                ucid,
                text: text.substring(0, 100),
                language: detectedLanguage,
                duration: transcriptionTime + 'ms'
            });

            // Filter out hallucinations and junk
            if (!this.isValidTranscription(text)) {
                console.log('[StreamingClient] 🚫 Filtered invalid transcription:', text);
                return;
            }

            // Update transcription buffer
            const buffer = this.transcriptionBuffers.get(ucid);
            if (buffer) {
                buffer.finalText += (buffer.finalText ? ' ' : '') + text;
                buffer.language = detectedLanguage;
            }

            console.log('[StreamingClient] ✅ Valid transcription:', text);

            // Emit transcription event
            this.emit('transcription', {
                ucid,
                text,
                language: detectedLanguage,
                isPartial: false,
                timestamp: Date.now()
            });

            // Trigger immediate conversational response
            if (text && !this.isPlayingBack.get(ucid)) {
                await this.generateAndPlayResponse(ucid, text);
            }

        } catch (error) {
            console.error('[StreamingClient] Streaming transcription error:', error);
            throw error;
        }
    }

    /**
     * Validate transcription text quality
     */
    isValidTranscription(text) {
        if (!text || text.trim().length < 2) return false;
        
        // Filter common Whisper hallucinations
        const hallucinations = [
            /^thank you\.?$/i,
            /^thanks\.?$/i,
            /^you$/i,
            /^\.{3,}$/,
            /^\s*$/,
            /^[\s\.,!?]+$/
        ];
        
        return !hallucinations.some(pattern => pattern.test(text.trim()));
    }

    /**
     * Generate AI response and play back via TTS
     */
    async generateAndPlayResponse(ucid, userText) {
        const session = this.streamingSessions.get(ucid);
        
        if (!session || this.isPlayingBack.get(ucid)) {
            console.log('[StreamingClient] Skipping response - session not found or playback in progress');
            return;
        }

        try {
            this.isPlayingBack.set(ucid, true);
            
            console.log('[StreamingClient] 🤖 Generating conversational response...', {
                ucid,
                userText: userText.substring(0, 80)
            });

            // Use flow engine for conversational response
            const success = await flowEngine.executeConversationalFlow(
                ucid,
                userText,
                {
                    language: session.language,
                    voice: session.voice
                }
            );

            if (success) {
                session.playbackChunks++;
                console.log('[StreamingClient] ✅ Response played successfully');
                
                this.emit('response_played', {
                    ucid,
                    userText,
                    success: true
                });
            } else {
                console.error('[StreamingClient] Failed to play response');
            }

        } catch (error) {
            console.error('[StreamingClient] Error generating response:', error);
        } finally {
            this.isPlayingBack.set(ucid, false);
        }
    }

    /**
     * Handle stream end event
     */
    async handleStreamEnd(message) {
        const { ucid } = message;
        
        console.log('[StreamingClient] 📴 Ending audio stream for', ucid);
        
        // Get final session stats
        const session = this.streamingSessions.get(ucid);
        const buffer = this.transcriptionBuffers.get(ucid);
        
        if (session && buffer) {
            const duration = Date.now() - session.startTime;
            
            console.log('[StreamingClient] 📊 Stream session summary:', {
                ucid,
                duration: duration + 'ms',
                totalAudioMs: session.totalAudioMs,
                transcriptionChunks: session.transcriptionChunks,
                playbackChunks: session.playbackChunks,
                finalText: buffer.finalText.substring(0, 200)
            });
            
            this.emit('stream_ended', {
                ucid,
                duration,
                stats: {
                    totalAudioMs: session.totalAudioMs,
                    transcriptionChunks: session.transcriptionChunks,
                    playbackChunks: session.playbackChunks
                },
                finalTranscription: buffer.finalText
            });
        }

        // Cleanup session data
        this.cleanupSession(ucid);
    }

    /**
     * Handle control messages
     */
    async handleControl(message) {
        const { ucid, command, params } = message;
        
        console.log('[StreamingClient] 🎛️  Control command:', command, 'for', ucid);
        
        switch (command) {
            case 'set_language':
                if (this.streamingSessions.has(ucid)) {
                    this.streamingSessions.get(ucid).language = params.language;
                    this.transcriptionBuffers.get(ucid).language = params.language;
                    console.log('[StreamingClient] Language updated:', params.language);
                }
                break;
                
            case 'set_voice':
                if (this.streamingSessions.has(ucid)) {
                    this.streamingSessions.get(ucid).voice = params.voice;
                    console.log('[StreamingClient] Voice updated:', params.voice);
                }
                break;
                
            case 'pause_transcription':
                this.isTranscribing.set(ucid, true); // Block new transcriptions
                console.log('[StreamingClient] Transcription paused for', ucid);
                break;
                
            case 'resume_transcription':
                this.isTranscribing.set(ucid, false);
                console.log('[StreamingClient] Transcription resumed for', ucid);
                break;
                
            default:
                console.log('[StreamingClient] Unknown control command:', command);
        }
    }

    /**
     * Cleanup session data
     */
    cleanupSession(ucid) {
        console.log('[StreamingClient] 🧹 Cleaning up session data for', ucid);
        
        // Clear audio processor
        const processor = this.audioProcessors.get(ucid);
        if (processor) {
            processor.destroy();
            this.audioProcessors.delete(ucid);
        }
        
        // Clear all session data
        this.streamingSessions.delete(ucid);
        this.transcriptionBuffers.delete(ucid);
        this.playbackQueues.delete(ucid);
        this.isTranscribing.delete(ucid);
        this.isPlayingBack.delete(ucid);
    }

    /**
     * Send message to server
     */
    send(message) {
        if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            return true;
        } else {
            console.error('[StreamingClient] Cannot send message - not connected');
            return false;
        }
    }

    /**
     * Handle connection close
     */
    handleClose(code, reason) {
        console.log('[StreamingClient] Connection closed:', { code, reason: reason?.toString() });
        this.isConnected = false;
        this.scheduleReconnect();
        this.emit('disconnected', { code, reason });
    }

    /**
     * Handle connection error
     */
    handleError(error) {
        console.error('[StreamingClient] WebSocket error:', error);
        this.emit('error', error);
    }

    /**
     * Schedule reconnection
     */
    scheduleReconnect() {
        if (this.reconnectTimer) return;
        
        console.log('[StreamingClient] Scheduling reconnection in', this.config.reconnectInterval, 'ms');
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.config.reconnectInterval);
    }

    /**
     * Clear reconnection timer
     */
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * Get client status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            activeSessions: this.streamingSessions.size,
            sessions: Array.from(this.streamingSessions.values()),
            config: {
                url: this.config.url,
                bufferMs: this.config.streamingBufferMs,
                silenceThreshold: this.config.silenceThreshold
            }
        };
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        console.log('[StreamingClient] 🛑 Shutting down streaming client...');
        
        // Clear reconnection timer
        this.clearReconnectTimer();
        
        // Cleanup all sessions
        for (const ucid of this.streamingSessions.keys()) {
            this.cleanupSession(ucid);
        }
        
        // Close WebSocket connection
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.isConnected = false;
        console.log('[StreamingClient] ✅ Shutdown complete');
    }
}

module.exports = StreamingClient;