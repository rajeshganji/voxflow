const express = require('express');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

// Import services for streaming integration
const openaiService = require('../services/openaiService');
const flowEngine = require('../services/flowEngine');
const playbackService = require('../services/playbackService');
const AudioProcessor = require('../services/audioProcessor');

const router = express.Router();

/**
 * WebSocket Stream Client for KooKoo Bi-directional Audio Streaming
 * Handles PCM linear 16-bit 8kHz audio data with real-time transcription
 */
class StreamClient {
    constructor(config = {}) {
        // Smart WebSocket URL detection based on environment
        const defaultPort = process.env.NODE_ENV === 'production' ? 8080 : 3000;
        const serverPort = process.env.PORT || defaultPort;
        const defaultWsUrl = `ws://localhost:${serverPort}/ws`;
        
        this.config = {
            url: config.url || process.env.STREAM_WS_URL || defaultWsUrl,
            reconnectInterval: config.reconnectInterval || 5000,
            logDir: config.logDir || path.join(__dirname, '../logs/stream'),
            ...config
        };
        
        this.ws = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.currentCall = null;
        this.audioBuffers = new Map(); // Store audio buffers per call
        
        // Real-time transcription support
        this.audioProcessors = new Map(); // AudioProcessor per call
        this.transcriptionSessions = new Map(); // Transcription results per call
        this.transcriptionInProgress = new Map(); // Prevent concurrent transcriptions per UCID
        this.playbackInProgress = new Map(); // Prevent concurrent playback per UCID
        
        logger.info('StreamClient initialized', {
            url: this.config.url,
            reconnectInterval: this.config.reconnectInterval,
            logDir: this.config.logDir
        });
    }

    /**
     * Initialize the WebSocket client and connect
     */
    async initialize() {
        try {
            await fs.mkdir(this.config.logDir, { recursive: true });
            logger.info('Stream log directory ready', { path: this.config.logDir });
        } catch (err) {
            logger.error('Failed to create stream log directory', { error: err.message });
        }

        if (this.config.url) {
            this.connect();
        } else {
            logger.info('Running in server mode - ready to process incoming messages');
        }
    }

    /**
     * Set language preference for a call's transcription
     */
    setLanguage(ucid, language) {
        const session = this.transcriptionSessions.get(ucid);
        if (session) {
            session.language = language;
            logger.info('Language preference set', { ucid, language });
        } else {
            logger.warn('No transcription session found', { ucid });
        }
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            logger.info('Already connected to stream server');
            return;
        }

        logger.info('Connecting to stream server', { url: this.config.url });

        try {
            this.ws = new WebSocket(this.config.url);

            this.ws.on('open', () => this.handleOpen());
            this.ws.on('message', (data) => this.handleMessage(data));
            this.ws.on('close', (code, reason) => this.handleClose(code, reason));
            this.ws.on('error', (error) => this.handleError(error));
        } catch (err) {
            logger.error('Stream connection error', { error: err.message });
            this.scheduleReconnect();
        }
    }

    /**
     * Handle WebSocket connection open
     */
    handleOpen() {
        logger.info('Connected to stream server');
        this.isConnected = true;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    async handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            logger.debug('Stream message received', { event: message.event, type: message.type });

            switch (message.event) {
                case 'start':
                    await this.handleStartEvent(message);
                    break;
                
                case 'media':
                    await this.handleMediaEvent(message);
                    break;
                
                case 'stop':
                    await this.handleStopEvent(message);
                    break;
                
                default:
                    logger.warn('Unknown stream event', { event: message.event });
                    await this.logEvent('unknown', message);
            }
        } catch (err) {
            logger.error('Error processing stream message', { 
                error: err.message,
                stack: err.stack,
                rawData: data.toString().substring(0, 200) 
            });
        }
    }

    /**
     * Handle call start event
     */
    async handleStartEvent(message) {
        const { ucid, did } = message;
        
        logger.info('Call started', { ucid, did });

        this.currentCall = {
            ucid,
            did,
            startTime: new Date().toISOString(),
            mediaPackets: 0,
            firstMediaReceived: false
        };

        // Initialize audio buffer for this call
        this.audioBuffers.set(ucid, []);
        
        // Initialize transcription session
        const defaultLanguage = process.env.DEFAULT_TRANSCRIPTION_LANGUAGE || 'en';
        this.transcriptionSessions.set(ucid, {
            startTime: Date.now(),
            chunks: [],
            finalTranscription: '',
            totalChunks: 0,
            errors: 0,
            language: defaultLanguage
        });
        
        logger.info('Transcription session created', { ucid, language: defaultLanguage });

        await this.logEvent('start', message);
    }

    /**
     * Handle media (audio) event
     */
    async handleMediaEvent(message) {
        const { ucid, data } = message;

        if (!this.currentCall || this.currentCall.ucid !== ucid) {
            logger.warn('Received media for unknown call', { ucid });
            return;
        }

        const { samples, bitsPerSample, sampleRate, channelCount, numberOfFrames, type } = data;

        // Check if this is the first packet (16kHz - should be ignored)
        if (!this.currentCall.firstMediaReceived) {
            if (sampleRate === 16000) {
                logger.debug('First media packet ignored', { ucid, sampleRate, numberOfFrames });
                this.currentCall.firstMediaReceived = true;
                await this.logEvent('media_first_ignored', { ucid, sampleRate, numberOfFrames });
                return;
            }
            this.currentCall.firstMediaReceived = true;
        }

        // Process subsequent packets (8kHz)
        if (sampleRate === 8000) {
            this.currentCall.mediaPackets++;
            
            // Store audio samples
            const buffer = this.audioBuffers.get(ucid);
            if (buffer) {
                buffer.push({
                    timestamp: new Date().toISOString(),
                    samples,
                    bitsPerSample,
                    sampleRate,
                    channelCount,
                    numberOfFrames,
                    type
                });
            }

            // Process audio for transcription periodically
            if (this.currentCall.mediaPackets % 50 === 0 && samples && samples.length > 0) {
                await this.processAudioForTranscription(ucid, samples, sampleRate);
            }

            // Log every 100th packet
            if (this.currentCall.mediaPackets % 100 === 0) {
                logger.debug('Media packets received', { 
                    ucid, 
                    packetNumber: this.currentCall.mediaPackets,
                    sampleRate,
                    numberOfFrames,
                    channelCount
                });

                await this.logEvent('media', {
                    ucid,
                    packetNumber: this.currentCall.mediaPackets,
                    sampleRate,
                    numberOfFrames,
                    channelCount,
                    samplesCount: samples.length
                });
            }
        }
    }

    /**
     * Process audio for transcription (simplified version)
     */
    async processAudioForTranscription(ucid, samples, sampleRate) {
        const session = this.transcriptionSessions.get(ucid);
        if (!session || this.transcriptionInProgress.get(ucid)) {
            return;
        }

        try {
            this.transcriptionInProgress.set(ucid, true);
            
            // Simple audio validation
            const sum = samples.reduce((acc, s) => acc + (s * s), 0);
            const rms = Math.sqrt(sum / samples.length);
            const MIN_SPEECH_RMS = 300;
            
            if (rms < MIN_SPEECH_RMS) {
                logger.debug('Audio energy too low, skipping transcription', { ucid, rms });
                return;
            }

            // Simulate transcription result (replace with actual OpenAI integration)
            const mockTranscription = {
                text: `Mock transcription for audio chunk ${session.totalChunks + 1}`,
                language: session.language,
                durationMs: 2000
            };

            // Store transcription chunk
            session.chunks.push({
                timestamp: Date.now(),
                text: mockTranscription.text,
                language: mockTranscription.language,
                durationMs: mockTranscription.durationMs
            });
            session.totalChunks++;

            logger.info('Transcription chunk processed', {
                ucid,
                chunkNumber: session.totalChunks,
                text: mockTranscription.text,
                language: mockTranscription.language
            });

            await this.logEvent('transcription_chunk', {
                ucid,
                chunkNumber: session.totalChunks,
                text: mockTranscription.text,
                language: mockTranscription.language,
                durationMs: mockTranscription.durationMs
            });

        } catch (error) {
            logger.error('Transcription processing error', { ucid, error: error.message });
            if (session) {
                session.errors++;
            }
        } finally {
            this.transcriptionInProgress.delete(ucid);
        }
    }

    /**
     * Handle call stop event
     */
    async handleStopEvent(message) {
        const { ucid, did } = message;
        
        logger.info('Call ended', { ucid, did });

        if (this.currentCall && this.currentCall.ucid === ucid) {
            const endTime = new Date().toISOString();
            const callSummary = {
                ...this.currentCall,
                endTime,
                totalMediaPackets: this.currentCall.mediaPackets
            };

            logger.info('Call summary', callSummary);
            
            // Finalize transcription
            await this.finalizeTranscription(ucid);

            // Clean up flags
            this.transcriptionInProgress.delete(ucid);
            this.playbackInProgress.delete(ucid);

            // Save audio buffer to file
            await this.saveAudioBuffer(ucid);

            await this.logEvent('stop', { ...message, summary: callSummary });

            // Cleanup
            this.audioBuffers.delete(ucid);
            this.currentCall = null;
        }
    }

    /**
     * Finalize transcription
     */
    async finalizeTranscription(ucid) {
        try {
            const session = this.transcriptionSessions.get(ucid);
            if (!session) {
                logger.warn('No transcription session to finalize', { ucid });
                return;
            }

            // Combine all transcription chunks
            const chunks = session.chunks || [];
            const deduplicatedChunks = [];
            let lastText = null;
            
            for (const chunk of chunks) {
                const text = chunk.text?.trim() || '';
                if (text.length > 0 && text !== lastText) {
                    deduplicatedChunks.push(text);
                    lastText = text;
                }
            }
            
            const finalText = deduplicatedChunks.join(' ').replace(/\s+/g, ' ').trim();
            const totalDuration = Date.now() - session.startTime;
            
            logger.info('Final transcription completed', {
                ucid,
                totalDuration: totalDuration / 1000,
                totalChunks: session.totalChunks,
                deduplicatedChunks: deduplicatedChunks.length,
                errors: session.errors,
                finalText: finalText || '(No speech detected)'
            });

            session.finalTranscription = finalText;
            
            await this.logEvent('transcription_final', {
                ucid,
                finalText,
                totalChunks: session.totalChunks,
                totalDurationMs: totalDuration,
                errors: session.errors
            });
            
            // Cleanup
            this.transcriptionSessions.delete(ucid);

        } catch (error) {
            logger.error('Error finalizing transcription', { ucid, error: error.message });
        }
    }

    /**
     * Handle WebSocket close
     */
    handleClose(code, reason) {
        logger.warn('Stream connection closed', { code, reason: reason.toString() });
        this.isConnected = false;
        this.scheduleReconnect();
    }

    /**
     * Handle WebSocket error
     */
    handleError(error) {
        logger.error('Stream WebSocket error', { error: error.message });
        
        if (error.code === 'ECONNREFUSED') {
            logger.info('Stream server not available, will retry...');
        }
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }

        logger.info('Scheduling reconnect', { interval: this.config.reconnectInterval });
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            logger.info('Attempting to reconnect to stream server');
            this.connect();
        }, this.config.reconnectInterval);
    }

    /**
     * Send audio data back to server
     */
    sendAudio(ucid, audioData) {
        if (!this.isConnected || !this.ws) {
            logger.error('Cannot send audio: Not connected');
            return false;
        }

        try {
            const message = {
                event: 'media',
                type: 'media',
                ucid,
                data: {
                    samples: audioData.samples,
                    bitsPerSample: 16,
                    sampleRate: 8000,
                    channelCount: 1,
                    numberOfFrames: audioData.samples.length,
                    type: 'data'
                }
            };

            this.ws.send(JSON.stringify(message));
            logger.debug('Audio data sent', { ucid, samplesCount: audioData.samples.length });
            return true;
        } catch (err) {
            logger.error('Error sending audio', { error: err.message });
            return false;
        }
    }

    /**
     * Send clear buffer command
     */
    clearBuffer() {
        if (!this.isConnected || !this.ws) {
            logger.error('Cannot clear buffer: Not connected');
            return false;
        }

        try {
            this.ws.send(JSON.stringify({ command: 'clearBuffer' }));
            logger.info('Clear buffer command sent');
            return true;
        } catch (err) {
            logger.error('Error sending clearBuffer', { error: err.message });
            return false;
        }
    }

    /**
     * Send call disconnect command
     */
    disconnectCall() {
        if (!this.isConnected || !this.ws) {
            logger.error('Cannot disconnect call: Not connected');
            return false;
        }

        try {
            this.ws.send(JSON.stringify({ command: 'callDisconnect' }));
            logger.info('Call disconnect command sent');
            return true;
        } catch (err) {
            logger.error('Error sending callDisconnect', { error: err.message });
            return false;
        }
    }

    /**
     * Log event to file
     */
    async logEvent(eventType, data) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                eventType,
                data
            };

            const filename = `stream_events_${new Date().toISOString().split('T')[0]}.jsonl`;
            const filepath = path.join(this.config.logDir, filename);

            await fs.appendFile(filepath, JSON.stringify(logEntry) + '\n');
        } catch (err) {
            logger.error('Error logging stream event', { error: err.message });
        }
    }

    /**
     * Save audio buffer to file
     */
    async saveAudioBuffer(ucid) {
        try {
            const buffer = this.audioBuffers.get(ucid);
            if (!buffer || buffer.length === 0) {
                logger.debug('No audio buffer to save', { ucid });
                return;
            }

            const filename = `audio_${ucid}_${Date.now()}.json`;
            const filepath = path.join(this.config.logDir, filename);

            // Save only metadata, not the actual samples
            const audioData = {
                ucid,
                timestamp: new Date().toISOString(),
                totalPackets: buffer.length,
                summary: buffer.map(p => ({
                    timestamp: p.timestamp,
                    sampleRate: p.sampleRate,
                    samplesCount: p.samples?.length || 0,
                    numberOfFrames: p.numberOfFrames
                }))
            };

            await fs.writeFile(filepath, JSON.stringify(audioData));
            logger.info('Audio metadata saved', { filename, packets: buffer.length });
        } catch (err) {
            logger.error('Error saving audio buffer', { error: err.message });
        }
    }

    /**
     * Get current connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            url: this.config.url,
            currentCall: this.currentCall,
            readyState: this.ws ? this.ws.readyState : null
        };
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        logger.info('Disconnecting stream client');
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.currentCall = null;
        this.audioBuffers.clear();
        this.transcriptionSessions.clear();
        this.transcriptionInProgress.clear();
        this.playbackInProgress.clear();
    }
}

/**
 * Streaming WebSocket Client for Real-time Audio Processing
 * Handles continuous audio streams, real-time transcription, and TTS playback
 */
class StreamingClient {
    constructor(config = {}) {
        // Smart WebSocket URL detection based on environment
        const defaultPort = process.env.NODE_ENV === 'production' ? 8080 : 3000;
        const serverPort = process.env.PORT || defaultPort;
        const defaultWsUrl = `ws://localhost:${serverPort}/ws`;
        
        this.config = {
            url: config.url || process.env.STREAMING_WS_URL || defaultWsUrl,
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
        
        // Active streaming sessions
        this.streamingSessions = new Map(); // ucid -> session data
        this.audioProcessors = new Map();   // ucid -> AudioProcessor
        this.transcriptionBuffers = new Map(); // ucid -> accumulated transcription
        this.playbackQueues = new Map();    // ucid -> playback queue
        
        // Streaming state
        this.isTranscribing = new Map();    // ucid -> boolean
        this.isPlayingBack = new Map();     // ucid -> boolean
        
        logger.info('StreamingClient initialized for real-time audio processing', {
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
        
        logger.info('Starting streaming client...');
        this.connect();
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            logger.info('StreamingClient already connected');
            return;
        }

        logger.info('StreamingClient connecting to:', this.config.url);

        try {
            this.ws = new WebSocket(this.config.url);

            this.ws.on('open', () => this.handleOpen());
            this.ws.on('message', (data) => this.handleMessage(data));
            this.ws.on('close', (code, reason) => this.handleClose(code, reason));
            this.ws.on('error', (error) => this.handleError(error));

        } catch (err) {
            logger.error('StreamingClient connection error', { error: err.message });
            this.scheduleReconnect();
        }
    }

    /**
     * Handle connection open
     */
    handleOpen() {
        logger.info('StreamingClient connected to streaming server');
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
    }

    /**
     * Handle incoming WebSocket messages
     */
    async handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            logger.debug('StreamingClient received event:', message.event || message.type);

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
                    logger.warn('StreamingClient unknown message type:', message.type);
            }
            
        } catch (err) {
            logger.error('StreamingClient error processing message', { error: err.message });
        }
    }

    /**
     * Handle stream start event
     */
    async handleStreamStart(message) {
        const { ucid, language = 'en', voice = 'alloy' } = message;
        
        logger.info('StreamingClient audio stream started', { ucid, language, voice });
        
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
        
        logger.info('StreamingClient session initialized', { ucid });
    }

    /**
     * Handle incoming audio chunks for real-time processing
     */
    async handleAudioChunk(message) {
        const { ucid, data } = message;
        const processor = this.audioProcessors.get(ucid);
        const session = this.streamingSessions.get(ucid);
        
        if (!processor || !session) {
            logger.warn('StreamingClient no session found for audio chunk:', ucid);
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
     * Process audio chunk with OpenAI transcription
     */
    async processAudioChunk(ucid) {
        const processor = this.audioProcessors.get(ucid);
        const session = this.streamingSessions.get(ucid);
        const buffer = this.transcriptionBuffers.get(ucid);
        
        if (!processor || !session || !buffer) {
            logger.warn('StreamingClient missing components for transcription:', ucid);
            return;
        }

        // Prevent concurrent transcriptions
        if (this.isTranscribing.get(ucid)) {
            logger.debug('StreamingClient transcription already in progress for', ucid);
            return;
        }

        try {
            this.isTranscribing.set(ucid, true);
            
            // Get WAV buffer from processor
            const wavBuffer = processor.toWAVBuffer();
            if (!wavBuffer) {
                logger.warn('StreamingClient no WAV buffer generated for', ucid);
                return;
            }

            const processorInfo = processor.getInfo();
            logger.debug('StreamingClient processing audio chunk for transcription', {
                ucid,
                durationMs: processorInfo.durationMs,
                samples: processorInfo.totalSamples,
                language: session.language
            });

            // Validate audio quality
            if (!this.validateAudioChunk(processor)) {
                logger.debug('StreamingClient audio chunk validation failed - skipping');
                processor.reset();
                return;
            }

            // Transcribe with OpenAI
            const transcriptionResult = await openaiService.speechToText(wavBuffer, session.language);
            const text = transcriptionResult.text?.trim() || '';
            const detectedLanguage = transcriptionResult.language || session.language;

            logger.info('StreamingClient transcription received', {
                ucid,
                text: text.substring(0, 100),
                language: detectedLanguage
            });

            // Filter out hallucinations and junk
            if (!this.isValidTranscription(text)) {
                logger.debug('StreamingClient filtered invalid transcription:', text);
                processor.reset();
                return;
            }

            // Update transcription buffer
            if (buffer) {
                buffer.finalText += (buffer.finalText ? ' ' : '') + text;
                buffer.language = detectedLanguage;
            }

            logger.info('StreamingClient valid transcription:', text);

            // Trigger immediate conversational response
            if (text && !this.isPlayingBack.get(ucid)) {
                await this.generateAndPlayResponse(ucid, text);
            }
            
            // Reset processor for next chunk
            processor.reset();
            session.transcriptionChunks++;
            
        } catch (error) {
            logger.error('StreamingClient error processing audio chunk', { ucid, error: error.message });
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
            return false;
        }

        // Check audio energy (RMS)
        const samples = processor.samples;
        const sum = samples.reduce((acc, s) => acc + (s * s), 0);
        const rms = Math.sqrt(sum / samples.length);
        
        const MIN_RMS = 250; // Minimum energy threshold
        if (rms < MIN_RMS) {
            return false;
        }
        
        return true;
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
            logger.debug('StreamingClient skipping response - session not found or playback in progress');
            return;
        }

        try {
            this.isPlayingBack.set(ucid, true);
            
            logger.debug('StreamingClient generating conversational response', {
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
                logger.info('StreamingClient response played successfully', { ucid });
            } else {
                logger.error('StreamingClient failed to play response', { ucid });
            }

        } catch (error) {
            logger.error('StreamingClient error generating response', { ucid, error: error.message });
        } finally {
            this.isPlayingBack.set(ucid, false);
        }
    }

    /**
     * Handle stream end event
     */
    async handleStreamEnd(message) {
        const { ucid } = message;
        
        logger.info('StreamingClient ending audio stream for', ucid);
        
        // Get final session stats
        const session = this.streamingSessions.get(ucid);
        const buffer = this.transcriptionBuffers.get(ucid);
        
        if (session && buffer) {
            const duration = Date.now() - session.startTime;
            
            logger.info('StreamingClient stream session summary', {
                ucid,
                duration: duration + 'ms',
                totalAudioMs: session.totalAudioMs,
                transcriptionChunks: session.transcriptionChunks,
                playbackChunks: session.playbackChunks,
                finalText: buffer.finalText.substring(0, 200)
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
        
        logger.info('StreamingClient control command', { ucid, command });
        
        switch (command) {
            case 'set_language':
                if (this.streamingSessions.has(ucid)) {
                    this.streamingSessions.get(ucid).language = params.language;
                    this.transcriptionBuffers.get(ucid).language = params.language;
                    logger.info('StreamingClient language updated', { ucid, language: params.language });
                }
                break;
                
            case 'set_voice':
                if (this.streamingSessions.has(ucid)) {
                    this.streamingSessions.get(ucid).voice = params.voice;
                    logger.info('StreamingClient voice updated', { ucid, voice: params.voice });
                }
                break;
                
            case 'pause_transcription':
                this.isTranscribing.set(ucid, true); // Block new transcriptions
                logger.info('StreamingClient transcription paused for', ucid);
                break;
                
            case 'resume_transcription':
                this.isTranscribing.set(ucid, false);
                logger.info('StreamingClient transcription resumed for', ucid);
                break;
                
            default:
                logger.warn('StreamingClient unknown control command:', command);
        }
    }

    /**
     * Cleanup session data
     */
    cleanupSession(ucid) {
        logger.debug('StreamingClient cleaning up session data for', ucid);
        
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
            logger.error('StreamingClient cannot send message - not connected');
            return false;
        }
    }

    /**
     * Handle connection close
     */
    handleClose(code, reason) {
        logger.info('StreamingClient connection closed', { code, reason: reason?.toString() });
        this.isConnected = false;
        this.scheduleReconnect();
    }

    /**
     * Handle connection error
     */
    handleError(error) {
        logger.error('StreamingClient WebSocket error', { error: error.message });
    }

    /**
     * Schedule reconnection
     */
    scheduleReconnect() {
        if (this.reconnectTimer) return;
        
        logger.info('StreamingClient scheduling reconnection in', this.config.reconnectInterval, 'ms');
        
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
        logger.info('StreamingClient shutting down...');
        
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
        logger.info('StreamingClient shutdown complete');
    }
}

// Create global stream client instance
const streamClient = new StreamClient({
    url: process.env.STREAM_WS_URL,
    logDir: path.join(__dirname, '../logs/stream')
});

// Create global streaming client instance
const streamingClient = new StreamingClient({
    url: process.env.STREAMING_WS_URL,
    streamingBufferMs: parseInt(process.env.STREAMING_BUFFER_MS) || 2000,
    silenceThreshold: parseInt(process.env.STREAMING_SILENCE_MS) || 1000,
    minSpeechDuration: parseInt(process.env.MIN_SPEECH_DURATION) || 1500
});

// Initialize stream client on module load
streamClient.initialize().catch(err => {
    logger.error('Failed to initialize stream client', { error: err.message });
});

// Initialize streaming client on module load
streamingClient.initialize().catch(err => {
    logger.error('Failed to initialize streaming client', { error: err.message });
});

// API Routes

// Get hearing status and stream connection info
router.get('/', (req, res) => {
    try {
        const status = streamClient.getStatus();
        const streamingStatus = streamingClient.getStatus();
        const hearingInfo = {
            service: 'VoxFlow Hearing Service',
            description: 'Real-time audio streaming and transcription for KooKoo IVR',
            version: '1.0.0',
            capabilities: [
                'PCM Linear 16-bit 8kHz audio processing',
                'Real-time transcription',
                'Bi-directional audio streaming',
                'Multi-language support',
                'Call session management',
                'Streaming client for continuous processing'
            ],
            streamStatus: status,
            streamingStatus: streamingStatus,
            endpoints: {
                status: '/api/hearing/status',
                language: '/api/hearing/language/:ucid/:language',
                sendAudio: '/api/hearing/audio/:ucid',
                clearBuffer: '/api/hearing/clear',
                disconnect: '/api/hearing/disconnect',
                streamingStart: '/api/hearing/streaming/start',
                streamingAudio: '/api/hearing/streaming/audio',
                streamingEnd: '/api/hearing/streaming/end',
                streamingStatus: '/api/hearing/streaming/status'
            },
            features: {
                openaiEnabled: !!process.env.OPENAI_API_KEY,
                elevenlabsEnabled: !!process.env.ELEVENLABS_API_KEY,
                streamingEnabled: true
            }
        };

        res.json(hearingInfo);
    } catch (error) {
        logger.error('Error getting hearing info', { error: error.message });
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// Get stream connection status
router.get('/status', (req, res) => {
    try {
        const status = streamClient.getStatus();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            streamConnection: status
        });
    } catch (error) {
        logger.error('Error getting stream status', { error: error.message });
        res.status(500).json({ 
            success: false,
            error: 'Failed to get stream status',
            message: error.message 
        });
    }
});

// Set language preference for a call
router.post('/language/:ucid/:language', (req, res) => {
    try {
        const { ucid, language } = req.params;
        
        // Validate language code
        const supportedLanguages = ['en', 'hi', 'te', 'ta', 'kn', 'ml', 'auto'];
        if (!supportedLanguages.includes(language)) {
            return res.status(400).json({
                success: false,
                error: 'Unsupported language',
                supportedLanguages
            });
        }

        streamClient.setLanguage(ucid, language);
        
        res.json({
            success: true,
            ucid,
            language,
            message: `Language preference set to ${language}`
        });
        
        logger.info('Language preference updated', { ucid, language });
    } catch (error) {
        logger.error('Error setting language preference', { error: error.message });
        res.status(500).json({ 
            success: false,
            error: 'Failed to set language preference',
            message: error.message 
        });
    }
});

// Send audio data to stream
router.post('/audio/:ucid', (req, res) => {
    try {
        const { ucid } = req.params;
        const { samples } = req.body;
        
        if (!samples || !Array.isArray(samples)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid audio data - samples array required'
            });
        }

        const result = streamClient.sendAudio(ucid, { samples });
        
        if (result) {
            res.json({
                success: true,
                ucid,
                samplesCount: samples.length,
                message: 'Audio data sent successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to send audio data'
            });
        }
        
        logger.debug('Audio data API call', { ucid, samplesCount: samples.length, result });
    } catch (error) {
        logger.error('Error in audio data API', { error: error.message });
        res.status(500).json({ 
            success: false,
            error: 'Failed to process audio data',
            message: error.message 
        });
    }
});

// Clear audio buffer
router.post('/clear', (req, res) => {
    try {
        const result = streamClient.clearBuffer();
        
        if (result) {
            res.json({
                success: true,
                message: 'Audio buffer cleared successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to clear audio buffer'
            });
        }
        
        logger.info('Clear buffer API call', { result });
    } catch (error) {
        logger.error('Error in clear buffer API', { error: error.message });
        res.status(500).json({ 
            success: false,
            error: 'Failed to clear buffer',
            message: error.message 
        });
    }
});

// Disconnect current call
router.post('/disconnect', (req, res) => {
    try {
        const result = streamClient.disconnectCall();
        
        if (result) {
            res.json({
                success: true,
                message: 'Call disconnect command sent successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to send disconnect command'
            });
        }
        
        logger.info('Disconnect call API call', { result });
    } catch (error) {
        logger.error('Error in disconnect call API', { error: error.message });
        res.status(500).json({ 
            success: false,
            error: 'Failed to disconnect call',
            message: error.message 
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    const status = streamClient.getStatus();
    const streamingStatus = streamingClient.getStatus();
    
    res.json({
        service: 'VoxFlow Hearing Service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        streamConnected: status.connected,
        activeCall: status.currentCall ? status.currentCall.ucid : null,
        streamingClient: {
            enabled: true,
            connected: streamingStatus.connected,
            activeSessions: streamingStatus.activeSessions
        }
    });
});

// =============================================================================
// STREAMING CLIENT API ENDPOINTS
// =============================================================================

// Start streaming session
router.post('/streaming/start', (req, res) => {
    try {
        const { ucid, language = 'en', voice = 'alloy' } = req.body;

        if (!ucid) {
            return res.status(400).json({
                success: false,
                error: 'UCID is required'
            });
        }

        // Send start streaming message to client
        const sent = streamingClient.send({
            type: 'stream_start',
            ucid,
            language,
            voice,
            timestamp: Date.now()
        });

        if (sent) {
            res.json({
                success: true,
                message: 'Streaming session started',
                ucid,
                language,
                voice
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to start streaming session - client not connected'
            });
        }

        logger.info('Streaming session start requested', { ucid, language, voice });

    } catch (error) {
        logger.error('Error starting streaming session', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to start streaming session',
            message: error.message
        });
    }
});

// Send audio chunk for real-time processing
router.post('/streaming/audio', (req, res) => {
    try {
        const { ucid, samples, sampleRate = 8000, timestamp } = req.body;

        if (!ucid || !samples) {
            return res.status(400).json({
                success: false,
                error: 'UCID and samples are required'
            });
        }

        // Send audio chunk to streaming client
        const sent = streamingClient.send({
            type: 'audio_chunk',
            ucid,
            data: {
                samples,
                sampleRate,
                bitsPerSample: 16,
                channelCount: 1,
                numberOfFrames: samples.length,
                timestamp: timestamp || Date.now()
            }
        });

        if (sent) {
            res.json({
                success: true,
                message: 'Audio chunk processed',
                samples: samples.length
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to process audio chunk - client not connected'
            });
        }

    } catch (error) {
        logger.error('Error processing audio chunk', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to process audio chunk',
            message: error.message
        });
    }
});

// End streaming session
router.post('/streaming/end', (req, res) => {
    try {
        const { ucid } = req.body;

        if (!ucid) {
            return res.status(400).json({
                success: false,
                error: 'UCID is required'
            });
        }

        // Send end streaming message to client
        const sent = streamingClient.send({
            type: 'stream_end',
            ucid,
            timestamp: Date.now()
        });

        if (sent) {
            res.json({
                success: true,
                message: 'Streaming session ended',
                ucid
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to end streaming session - client not connected'
            });
        }

        logger.info('Streaming session end requested', { ucid });

    } catch (error) {
        logger.error('Error ending streaming session', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to end streaming session',
            message: error.message
        });
    }
});

// Set language for streaming session
router.post('/streaming/language', (req, res) => {
    try {
        const { ucid, language } = req.body;

        if (!ucid || !language) {
            return res.status(400).json({
                success: false,
                error: 'UCID and language are required'
            });
        }

        // Send language control message
        const sent = streamingClient.send({
            type: 'control',
            ucid,
            command: 'set_language',
            params: { language }
        });

        if (sent) {
            res.json({
                success: true,
                message: 'Language updated',
                ucid,
                language
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to update language - client not connected'
            });
        }

        logger.info('Streaming language updated', { ucid, language });

    } catch (error) {
        logger.error('Error updating streaming language', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to update language',
            message: error.message
        });
    }
});

// Get streaming client status
router.get('/streaming/status', (req, res) => {
    try {
        const status = streamingClient.getStatus();

        res.json({
            success: true,
            enabled: true,
            ...status
        });

    } catch (error) {
        logger.error('Error getting streaming status', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get streaming status',
            message: error.message
        });
    }
});

// Control streaming transcription (pause/resume)
router.post('/streaming/control', (req, res) => {
    try {
        const { ucid, command, params = {} } = req.body;

        if (!ucid || !command) {
            return res.status(400).json({
                success: false,
                error: 'UCID and command are required'
            });
        }

        // Valid commands
        const validCommands = ['pause_transcription', 'resume_transcription', 'set_voice'];
        
        if (!validCommands.includes(command)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid command',
                validCommands
            });
        }

        // Send control message
        const sent = streamingClient.send({
            type: 'control',
            ucid,
            command,
            params
        });

        if (sent) {
            res.json({
                success: true,
                message: `Command '${command}' sent successfully`,
                ucid,
                command,
                params
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to send control command - client not connected'
            });
        }

        logger.info('Streaming control command sent', { ucid, command, params });

    } catch (error) {
        logger.error('Error sending streaming control command', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to send control command',
            message: error.message
        });
    }
});

// Export the router and clients for testing
module.exports = router;
module.exports.streamClient = streamClient;
module.exports.streamingClient = streamingClient;