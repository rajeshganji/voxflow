/**
 * WebSocket Stream Server - Receives events from Ozonetel
 * This server accepts connections from Ozonetel and forwards events to StreamClient handlers
 */

const WebSocket = require('ws');

class StreamServer {
    constructor(server, streamClient) {
        console.log('[StreamServer] 🚀 CONSTRUCTOR CALLED - Initializing...');
        this.streamClient = streamClient;
        this.connections = new Map();
        this.ucidToConnection = new Map(); // Map UCID to WebSocket connection
        this.server = server;
        this.recentRejections = new Map(); // Track rejections for rate limiting
        
        // Clean up old rejection logs every 5 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [ip, timestamp] of this.recentRejections.entries()) {
                if (now - timestamp > 300000) { // 5 minutes
                    this.recentRejections.delete(ip);
                }
            }
        }, 300000);
        
        console.log('[StreamServer] Creating WebSocket.Server with noServer mode');
        
        // Create WebSocket server in noServer mode - handle upgrades manually
        this.wss = new WebSocket.Server({ 
            noServer: true
        });
        
        console.log('[StreamServer] WebSocket.Server created in noServer mode');
        console.log('[StreamServer] Setting up manual upgrade handler on HTTP server...');
        
        // Manually handle upgrade requests BEFORE Express middleware
        this.server.on('upgrade', (request, socket, head) => {
            console.log('[StreamServer] 📡 UPGRADE EVENT RECEIVED!');
            console.log('[StreamServer] Request URL:', request.url);
            console.log('[StreamServer] Request headers:', request.headers);
            
            // Only handle /ws path - reject others silently to reduce log noise
            if (request.url !== '/ws') {
                // Log only unique IPs to reduce spam (rate limit logging)
                const clientIP = request.headers['x-forwarded-for'] || 
                              request.headers['x-real-ip'] || 
                              request.connection.remoteAddress || 
                              'unknown';
                
                if (!this.recentRejections) this.recentRejections = new Map();
                const now = Date.now();
                const lastLog = this.recentRejections.get(clientIP);
                
                // Only log once per IP per minute to reduce noise
                if (!lastLog || (now - lastLog) > 60000) {
                    console.log(`[StreamServer] ❌ WebSocket rejected - IP: ${clientIP}, path: ${request.url}`);
                    this.recentRejections.set(clientIP, now);
                }
                
                socket.destroy();
                return;
            }
            
            console.log('[StreamServer] ✅ Handling upgrade for /ws');
            
            this.wss.handleUpgrade(request, socket, head, (ws) => {
                console.log('[StreamServer] 🎯 handleUpgrade callback - emitting connection');
                this.wss.emit('connection', ws, request);
            });
        });
        
        // Handle connection events
        this.wss.on('connection', (ws, req) => {
            console.log('[StreamServer] 🎯 CONNECTION EVENT FIRED!');
            console.log('[StreamServer] Request URL:', req.url);
            this.handleConnection(ws, req);
        });
        
        this.wss.on('error', (error) => {
            console.error('[StreamServer] ❌ WebSocket Server Error:', error);
        });

        console.log('[StreamServer] ✅ WebSocket stream server ready with manual upgrade handling for /ws');
    }

    handleConnection(ws, req) {
        console.log('[StreamServer] 🔵 handleConnection() called');
        const clientIp = req.socket.remoteAddress;
        const protocol = req.connection.encrypted ? 'wss' : 'ws';
        
        console.log('\n========== WEBSOCKET CONNECTION ESTABLISHED ==========');
        console.log(`[StreamServer] Protocol: ${protocol}://`);
        console.log(`[StreamServer] Client IP: ${clientIp}`);
        console.log(`[StreamServer] Client Port: ${req.socket.remotePort}`);
        console.log(`[StreamServer] Request Method: ${req.method}`);
        console.log(`[StreamServer] Request URL: ${req.url}`);
        console.log(`[StreamServer] HTTP Version: ${req.httpVersion}`);
        console.log(`[StreamServer] User-Agent: ${req.headers['user-agent'] || 'NOT PROVIDED'}`);
        console.log(`[StreamServer] Connection headers:`, JSON.stringify(req.headers, null, 2));

        // Generate connection ID
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.connections.set(connectionId, ws);
        
        // Track message statistics
        ws.messageCount = 0;
        ws.totalBytesReceived = 0;
        
        console.log(`[StreamServer] Connection ID: ${connectionId}`);
        console.log(`[StreamServer] Total active connections: ${this.connections.size}`);
        console.log('[StreamServer] WebSocket ready state:', ws.readyState);
        console.log('[StreamServer] Max payload size: 100 MB');
        console.log('=====================================================\n');

        ws.on('message', (data) => {
            ws.messageCount++;
            ws.totalBytesReceived += data.length;
            console.log(`[StreamServer] ⚡ Message #${ws.messageCount} received on connection ${connectionId}`);
            console.log(`[StreamServer] This message size: ${data.length} bytes`);
            console.log(`[StreamServer] Total bytes received: ${ws.totalBytesReceived} bytes`);
            this.handleMessage(ws, data, connectionId);
        });

        ws.on('close', (code, reason) => {
            console.log('\n========== WEBSOCKET CONNECTION CLOSED ==========');
            console.log('[StreamServer] Connection ID:', connectionId);
            console.log('[StreamServer] Close Code:', code);
            console.log('[StreamServer] Close Reason:', reason ? reason.toString() : 'No reason provided');
            console.log('[StreamServer] Client IP:', clientIp);
            console.log('[StreamServer] Time connected:', new Date().toISOString());
            console.log('[StreamServer] Messages received:', ws.messageCount || 0);
            console.log('[StreamServer] Total bytes received:', ws.totalBytesReceived || 0);
            console.log('[StreamServer] Remaining connections:', this.connections.size - 1);
            
            // Log standard close codes
            const closeCodes = {
                1000: 'Normal Closure',
                1001: 'Going Away',
                1002: 'Protocol Error',
                1003: 'Unsupported Data',
                1005: 'No Status Received',
                1006: 'Abnormal Closure',
                1007: 'Invalid frame payload data',
                1008: 'Policy Violation',
                1009: 'Message too big',
                1010: 'Missing Extension',
                1011: 'Internal Error',
                1012: 'Service Restart',
                1013: 'Try Again Later',
                1014: 'Bad Gateway',
                1015: 'TLS Handshake'
            };
            
            if (closeCodes[code]) {
                console.log(`[StreamServer] Close Code Meaning: ${closeCodes[code]}`);
            }
            
            console.log('================================================\n');
            this.connections.delete(connectionId);
        });

        ws.on('error', (error) => {
            console.error('\n========== WEBSOCKET ERROR ==========');
            console.error('[StreamServer] Connection ID:', connectionId);
            console.error('[StreamServer] Client IP:', clientIp);
            console.error('[StreamServer] Error Type:', error.name);
            console.error('[StreamServer] Error Message:', error.message);
            console.error('[StreamServer] Error Code:', error.code || 'N/A');
            console.error('[StreamServer] Error Stack:', error.stack);
            console.error('[StreamServer] WebSocket State:', ws.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)');
            console.error('====================================\n');
        });

        ws.on('ping', () => {
            console.log('[StreamServer] 💓 Ping received from', connectionId);
        });

        ws.on('pong', () => {
            console.log('[StreamServer] 💓 Pong received from', connectionId);
        });

        // Send acknowledgment
        console.log(`[StreamServer] Sending connection acknowledgment to ${connectionId}`);
        try {
            ws.send(JSON.stringify({
                type: 'connected',
                connectionId,
                timestamp: new Date().toISOString(),
                message: 'Connected to AI Agent Portal WebSocket Server'
            }));
            console.log(`[StreamServer] ✅ Acknowledgment sent successfully to ${connectionId}`);
            console.log('\n========== CONNECTION FULLY ESTABLISHED AND READY ==========');
            console.log('[StreamServer] Connection is now ready to receive messages');
            console.log('[StreamServer] Waiting for Ozonetel stream events...');
            console.log('===========================================================\n');
        } catch (error) {
            console.error(`[StreamServer] ❌ Failed to send acknowledgment to ${connectionId}:`, error.message);
            console.error('[StreamServer] This may cause the connection to fail');
        }
    }

    /**
     * Send audio samples to Ozonetel via WebSocket
     * @param {string} ucid - Call ID
     * @param {Array<number>} samples - PCM audio samples (16-bit signed integers)
     * @returns {Promise<boolean>} - Success status
     */
    async sendAudioToOzonetel(ucid, samples) {
        try {
            const ws = this.ucidToConnection.get(ucid);
            
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.error('[StreamServer] ❌ No active connection for UCID:', ucid);
                return false;
            }

            // CRITICAL: Remove DC offset to eliminate clicks (center audio at zero)
            const cleanedSamples = this._removeDCOffset(samples);
            
            // CRITICAL: Apply crossfade from last packet to prevent clicks between chunks
            const smoothedSamples = this._applyCrossfade(ucid, cleanedSamples);
            
            // Send in 400-sample packets (50ms at 8kHz) - matching Ozonetel format
            const PACKET_SIZE = 400;
            let packetsSent = 0;
            
            for (let i = 0; i < smoothedSamples.length; i += PACKET_SIZE) {
                let chunk = smoothedSamples.slice(i, i + PACKET_SIZE);
                
                // CRITICAL: Fade-out padding instead of zeros to prevent click at end
                if (chunk.length < PACKET_SIZE) {
                    chunk = this._applyFadeoutPadding(chunk, PACKET_SIZE);
                }
                
                if (chunk.length === PACKET_SIZE) {
                    // CRITICAL: Match Ozonetel's EXACT format (type: "media", not event: "media")
                    const packet = {
                        type: 'media',
                        ucid: ucid,
                        data: {
                            samples: chunk,
                            bitsPerSample: 16,
                            sampleRate: 8000,
                            channelCount: 1,
                            numberOfFrames: chunk.length,
                            type: 'data'
                        }
                    };
                    
                    ws.send(JSON.stringify(packet));
                    packetsSent++;
                }
            }
            
            // Store last sample for next chunk's crossfade
            if (smoothedSamples.length > 0) {
                if (!this._lastSamples) this._lastSamples = new Map();
                this._lastSamples.set(ucid, smoothedSamples[smoothedSamples.length - 1]);
            }
            
            console.log(`[StreamServer] 📤 Sent ${packetsSent} audio packets (${smoothedSamples.length} samples) to UCID: ${ucid}`);
            
            return true;

        } catch (error) {
            console.error('[StreamServer] ❌ Error sending audio to Ozonetel:', error.message);
            return false;
        }
    }
    
    /**
     * CRITICAL FIX #1: Remove DC offset to eliminate clicks
     * Centers audio at zero to prevent popping sounds
     */
    _removeDCOffset(samples) {
        if (!samples || samples.length === 0) return samples;
        
        // Calculate mean
        const mean = samples.reduce((sum, val) => sum + val, 0) / samples.length;
        
        // Subtract mean from all samples
        return samples.map(sample => Math.round(sample - mean));
    }
    
    /**
     * CRITICAL FIX #2: Apply crossfade from previous packet's last sample
     * Eliminates clicks at packet boundaries
     */
    _applyCrossfade(ucid, samples) {
        if (!samples || samples.length === 0) return samples;
        if (!this._lastSamples) this._lastSamples = new Map();
        
        const lastSample = this._lastSamples.get(ucid) || 0;
        if (lastSample === 0) return samples;
        
        const result = [...samples];
        const fadeLength = Math.min(20, samples.length); // 2.5ms at 8kHz
        
        // Linear crossfade from lastSample to current first samples
        for (let i = 0; i < fadeLength; i++) {
            const t = i / fadeLength; // 0 to 1
            result[i] = Math.round(lastSample * (1 - t) + samples[i] * t);
        }
        
        return result;
    }
    
    /**
     * CRITICAL FIX #3: Fade out padding instead of zero padding
     * Prevents click at end of audio
     */
    _applyFadeoutPadding(samples, targetSize) {
        if (samples.length >= targetSize) return samples;
        
        const result = [...samples];
        const paddingNeeded = targetSize - samples.length;
        const lastValue = samples[samples.length - 1] || 0;
        
        // Create fade-out from lastValue to 0
        for (let i = 0; i < paddingNeeded; i++) {
            const t = i / paddingNeeded; // 0 to 1
            const fadedValue = Math.round(lastValue * (1 - t));
            result.push(fadedValue);
        }
        
        return result;
    }

    /**
     * Send a control message to Ozonetel
     * @param {string} ucid - Call ID
     * @param {string} command - Command type
     * @param {Object} params - Additional parameters
     * @returns {boolean} - Success status
     */
    sendControlMessage(ucid, command, params = {}) {
        try {
            const ws = this.ucidToConnection.get(ucid);
            
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.error('[StreamServer] No active connection for UCID:', ucid);
                return false;
            }

            const message = {
                event: 'control',
                ucid: ucid,
                command: command,
                ...params
            };

            ws.send(JSON.stringify(message));
            console.log('[StreamServer] 📤 Control message sent:', command);
            
            return true;

        } catch (error) {
            console.error('[StreamServer] Error sending control message:', error);
            return false;
        }
    }

    handleMessage(ws, data, connectionId) {
        try {
            const message = JSON.parse(data.toString());
            
            // Track UCID to connection mapping for outbound audio
            if (message.event === 'start' && message.ucid) {
                this.ucidToConnection.set(message.ucid, ws);
                ws.currentUcid = message.ucid;
                
                // Initialize last sample for this call (prevents clicks)
                if (!this._lastSamples) this._lastSamples = new Map();
                this._lastSamples.set(message.ucid, 0);
                
                console.log('[StreamServer] 📌 Mapped UCID to connection:', message.ucid);
            }
            
            // Clean up mapping on stop (but delay to allow any pending playback)
            if (message.event === 'stop' && message.ucid) {
                // Clear last sample for this UCID (prevents clicks on next call)
                if (this._lastSamples) {
                    this._lastSamples.delete(message.ucid);
                }
                
                // Delay deletion to allow final playback to complete
                setTimeout(() => {
                    this.ucidToConnection.delete(message.ucid);
                    console.log('[StreamServer] 🗑️  Removed UCID mapping (delayed):', message.ucid);
                }, 10000); // 10 second delay
                console.log('[StreamServer] 📌 UCID mapping will be removed in 10s:', message.ucid);
            }
            
            // Compact logging - only log important events
            if (message.event === 'start' || message.event === 'stop') {
                console.log(`[StreamServer] 📡 ${message.event.toUpperCase()} - UCID: ${message.ucid}`);
            } else if (message.event === 'media') {
                // Only log every 100th media packet to reduce noise
                if (!this._mediaPacketCount) this._mediaPacketCount = {};
                if (!this._mediaPacketCount[message.ucid]) this._mediaPacketCount[message.ucid] = 0;
                this._mediaPacketCount[message.ucid]++;
                
                if (this._mediaPacketCount[message.ucid] % 100 === 0) {
                    console.log(`[StreamServer] 🎵 MEDIA packet #${this._mediaPacketCount[message.ucid]} - UCID: ${message.ucid}, frames: ${message.data?.numberOfFrames}, rate: ${message.data?.sampleRate}Hz`);
                }
            } else {
                // Log other events compactly
                console.log(`[StreamServer] Event: ${message.event || message.type}, UCID: ${message.ucid}`);
            }

            // Forward to StreamClient message handler
            if (this.streamClient) {
                this.streamClient.handleMessage(data);
            } else {
                console.warn('[StreamServer] ⚠️ No StreamClient available to handle message!');
            }

        } catch (err) {
            console.error('[StreamServer] ❌ Error processing message:', err.message);
            console.error('[StreamServer] Raw data (first 200 chars):', data.toString().substring(0, 200));
        }
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        this.connections.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });
    }

    getStatus() {
        const connections = [];
        this.connections.forEach((ws, connectionId) => {
            connections.push({
                id: connectionId,
                readyState: ws.readyState,
                readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState],
                messageCount: ws.messageCount || 0,
                totalBytesReceived: ws.totalBytesReceived || 0
            });
        });
        
        return {
            activeConnections: this.connections.size,
            connections: connections
        };
    }
}

module.exports = StreamServer;