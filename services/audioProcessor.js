/**
 * Audio Processor for Real-time Speech Transcription
 * Converts PCM samples from Ozonetel to WAV format
 * Handles buffering, silence detection, and chunking
 */

class AudioProcessor {
    constructor(ucid, config = {}) {
        this.ucid = ucid;
        
        // Configuration
        this.config = {
            minAudioDuration: config.minAudioDuration || 1000,      // Min 1 second
            maxAudioDuration: config.maxAudioDuration || 5000,      // Max 5 seconds
            silenceThreshold: config.silenceThreshold || 1000,      // 1 second silence
            silenceAmplitude: config.silenceAmplitude || 100,       // Amplitude threshold
            sampleRate: config.sampleRate || 8000,                  // Default 8kHz
            bitsPerSample: config.bitsPerSample || 16,              // 16-bit
            channels: config.channels || 1                          // Mono
        };
        
        // Audio buffer
        this.samples = [];
        this.totalSamples = 0;
        this.startTime = Date.now();
        this.lastAudioTime = Date.now();
        
        // Silence detection
        this.consecutiveSilentPackets = 0;
        
        console.log(`[AudioProcessor] Created for ${ucid}`, this.config);
    }

    /**
     * Add incoming audio samples to buffer
     */
    addSamples(samples, sampleRate = 8000) {
        if (!samples || samples.length === 0) {
            console.warn(`[AudioProcessor] Empty samples received for ${this.ucid}`);
            return;
        }

        // Store samples
        this.samples.push(...samples);
        this.totalSamples += samples.length;
        
        // Check if packet contains audio or silence
        const isAudioPresent = this.detectAudioActivity(samples);
        
        if (isAudioPresent) {
            this.lastAudioTime = Date.now();
            this.consecutiveSilentPackets = 0;
        } else {
            this.consecutiveSilentPackets++;
        }
        
        // Log progress (every 100 packets = ~2 seconds at 8kHz)
        if (this.totalSamples % 16000 === 0) { // Every 2 seconds
            const duration = this.getDurationMs();
            console.log(`[AudioProcessor] ${this.ucid}: ${this.totalSamples} samples (~${duration}ms)`);
        }
    }

    /**
     * Detect if samples contain actual audio or silence
     */
    detectAudioActivity(samples) {
        // Calculate RMS (Root Mean Square) to detect audio energy
        const sum = samples.reduce((acc, sample) => acc + (sample * sample), 0);
        const rms = Math.sqrt(sum / samples.length);
        
        const hasAudio = rms > this.config.silenceAmplitude;
        
        // Debug log every 50 packets to monitor silence detection
        if (this.totalSamples % 8000 === 0) { // Every 1 second
            console.log(`[AudioProcessor] ${this.ucid}: RMS=${rms.toFixed(2)}, Threshold=${this.config.silenceAmplitude}, Audio=${hasAudio}, SilentPackets=${this.consecutiveSilentPackets}`);
        }
        
        return hasAudio;
    }

    /**
     * Check if we should send audio to API
     */
    shouldSendToAPI() {
        const duration = this.getDurationMs();
        const hasMinAudio = duration >= this.config.minAudioDuration;
        const hasMaxAudio = duration >= this.config.maxAudioDuration;
        const silenceDetected = this.isSilent();
        
        // Send if:
        // 1. Reached max duration (force send to prevent too-long chunks)
        if (hasMaxAudio) {
            console.log(`[AudioProcessor] ${this.ucid}: Max duration reached (${duration}ms) - sending`);
            return true;
        }
        
        // 2. Silence detected ONLY if we have minimum audio first
        if (silenceDetected && hasMinAudio) {
            const silenceDuration = Date.now() - this.lastAudioTime;
            console.log(`[AudioProcessor] ${this.ucid}: Silence detected (${silenceDuration}ms quiet) after ${duration}ms audio - sending`);
            return true;
        }
        
        // 3. Don't send if only silence detected without min audio
        if (silenceDetected && !hasMinAudio) {
            console.log(`[AudioProcessor] ${this.ucid}: Silence detected but insufficient audio (${duration}ms < ${this.config.minAudioDuration}ms) - NOT sending`);
            return false;
        }
        
        return false;
    }

    /**
     * Check if current audio is silent
     */
    isSilent() {
        const now = Date.now();
        const silenceDuration = now - this.lastAudioTime;
        return silenceDuration >= this.config.silenceThreshold;
    }

    /**
     * Get current audio duration in milliseconds
     */
    getDurationMs() {
        return (this.totalSamples / this.config.sampleRate) * 1000;
    }

    /**
     * Convert accumulated samples to WAV buffer
     */
    toWAVBuffer() {
        if (this.samples.length === 0) {
            console.warn(`[AudioProcessor] No samples to convert for ${this.ucid}`);
            return null;
        }

        console.log(`[AudioProcessor] Converting ${this.samples.length} samples to WAV...`);
        
        const sampleRate = this.config.sampleRate;
        const numChannels = this.config.channels;
        const bitsPerSample = this.config.bitsPerSample;
        const bytesPerSample = bitsPerSample / 8;
        
        // Calculate sizes
        const dataSize = this.samples.length * bytesPerSample;
        const fileSize = 44 + dataSize; // 44 bytes for WAV header
        
        // Create buffer
        const buffer = Buffer.allocUnsafe(fileSize);
        
        // Write WAV header
        let offset = 0;
        
        // RIFF header
        buffer.write('RIFF', offset); offset += 4;
        buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
        buffer.write('WAVE', offset); offset += 4;
        
        // fmt chunk
        buffer.write('fmt ', offset); offset += 4;
        buffer.writeUInt32LE(16, offset); offset += 4; // fmt chunk size
        buffer.writeUInt16LE(1, offset); offset += 2;  // PCM format
        buffer.writeUInt16LE(numChannels, offset); offset += 2;
        buffer.writeUInt32LE(sampleRate, offset); offset += 4;
        buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, offset); offset += 4; // byte rate
        buffer.writeUInt16LE(numChannels * bytesPerSample, offset); offset += 2; // block align
        buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;
        
        // data chunk
        buffer.write('data', offset); offset += 4;
        buffer.writeUInt32LE(dataSize, offset); offset += 4;
        
        // Write audio samples (16-bit PCM)
        for (let i = 0; i < this.samples.length; i++) {
            buffer.writeInt16LE(this.samples[i], offset);
            offset += 2;
        }
        
        console.log(`[AudioProcessor] WAV created: ${buffer.length} bytes, ${this.getDurationMs()}ms duration`);
        
        return buffer;
    }

    /**
     * Get buffer info for logging
     */
    getInfo() {
        return {
            ucid: this.ucid,
            totalSamples: this.totalSamples,
            durationMs: this.getDurationMs(),
            durationSec: (this.getDurationMs() / 1000).toFixed(2),
            bufferSizeBytes: this.samples.length * 2, // 16-bit = 2 bytes per sample
            sampleRate: this.config.sampleRate,
            isSilent: this.isSilent(),
            consecutiveSilentPackets: this.consecutiveSilentPackets
        };
    }

    /**
     * Reset buffer (after sending to API)
     */
    reset() {
        const info = this.getInfo();
        console.log(`[AudioProcessor] Resetting buffer for ${this.ucid}`, info);
        
        this.samples = [];
        this.totalSamples = 0;
        this.startTime = Date.now();
        this.lastAudioTime = Date.now();
        this.consecutiveSilentPackets = 0;
    }

    /**
     * Clear all data
     */
    destroy() {
        console.log(`[AudioProcessor] Destroying processor for ${this.ucid}`);
        this.samples = null;
        this.totalSamples = 0;
    }
}

module.exports = AudioProcessor;