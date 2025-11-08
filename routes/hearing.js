const express = require('express');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * WebSocket Stream Client for KooKoo Bi-directional Audio Streaming
 * Handles PCM linear 16-bit 8kHz audio data with real-time transcription
 */
class StreamClient {
    constructor(config = {}) {
        this.config = {
            url: config.url || process.env.STREAM_WS_URL || 'ws://localhost:8080/ws',
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

// Create global stream client instance
const streamClient = new StreamClient({
    url: process.env.STREAM_WS_URL,
    logDir: path.join(__dirname, '../logs/stream')
});

// Initialize stream client on module load
streamClient.initialize().catch(err => {
    logger.error('Failed to initialize stream client', { error: err.message });
});

// API Routes

// Get hearing status and stream connection info
router.get('/', (req, res) => {
    try {
        const status = streamClient.getStatus();
        const hearingInfo = {
            service: 'VoxFlow Hearing Service',
            description: 'Real-time audio streaming and transcription for KooKoo IVR',
            version: '1.0.0',
            capabilities: [
                'PCM Linear 16-bit 8kHz audio processing',
                'Real-time transcription',
                'Bi-directional audio streaming',
                'Multi-language support',
                'Call session management'
            ],
            streamStatus: status,
            endpoints: {
                status: '/api/hearing/status',
                language: '/api/hearing/language/:ucid/:language',
                sendAudio: '/api/hearing/audio/:ucid',
                clearBuffer: '/api/hearing/clear',
                disconnect: '/api/hearing/disconnect'
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
    
    res.json({
        service: 'VoxFlow Hearing Service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        streamConnected: status.connected,
        activeCall: status.currentCall ? status.currentCall.ucid : null
    });
});

// Export the router and stream client for testing
module.exports = router;
module.exports.streamClient = streamClient;