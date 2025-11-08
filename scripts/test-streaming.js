#!/usr/bin/env node

/**
 * VoxFlow Streaming Client Test Script
 * Demonstrates real-time audio streaming, transcription, and TTS playback
 */

const StreamingClient = require('../services/streamingClient');
const fs = require('fs');
const path = require('path');

// Test configuration
const config = {
    url: process.env.STREAMING_WS_URL || 'ws://localhost:8080/streaming',
    streamingBufferMs: 2000,
    silenceThreshold: 1000,
    minSpeechDuration: 1500
};

console.log('🚀 VoxFlow Streaming Client Test');
console.log('================================');
console.log('Configuration:', config);
console.log('');

// Create streaming client
const client = new StreamingClient(config);

// Event handlers
client.on('connected', () => {
    console.log('✅ Connected to streaming server');
    console.log('');
    
    // Start test session
    setTimeout(() => {
        runTest();
    }, 1000);
});

client.on('transcription', (data) => {
    console.log('📝 Transcription received:');
    console.log(`   UCID: ${data.ucid}`);
    console.log(`   Language: ${data.language}`);
    console.log(`   Text: "${data.text}"`);
    console.log(`   Timestamp: ${new Date(data.timestamp).toISOString()}`);
    console.log('');
});

client.on('response_played', (data) => {
    console.log('🔊 Response played:');
    console.log(`   UCID: ${data.ucid}`);
    console.log(`   Success: ${data.success}`);
    console.log(`   User text: "${data.userText}"`);
    console.log('');
});

client.on('stream_ended', (data) => {
    console.log('📴 Stream ended:');
    console.log(`   UCID: ${data.ucid}`);
    console.log(`   Duration: ${data.duration}ms`);
    console.log(`   Final transcription: "${data.finalTranscription}"`);
    console.log('   Stats:', data.stats);
    console.log('');
    
    // End test
    setTimeout(() => {
        console.log('✅ Test completed - shutting down...');
        client.shutdown();
        process.exit(0);
    }, 2000);
});

client.on('error', (error) => {
    console.error('❌ Streaming client error:', error.message);
});

client.on('disconnected', (data) => {
    console.log('❌ Disconnected from streaming server:', data);
});

// Initialize client
console.log('🔗 Connecting to streaming server...');
client.initialize().catch(err => {
    console.error('Failed to initialize streaming client:', err.message);
    process.exit(1);
});

/**
 * Run streaming test
 */
async function runTest() {
    console.log('🎙️  Starting streaming test...');
    console.log('');
    
    const testUcid = `test_${Date.now()}`;
    const testLanguage = 'en';
    const testVoice = 'alloy';
    
    try {
        // 1. Start streaming session
        console.log('1️⃣  Starting stream session...');
        client.send({
            type: 'stream_start',
            ucid: testUcid,
            language: testLanguage,
            voice: testVoice
        });
        
        await sleep(1000);
        
        // 2. Send simulated audio chunks
        console.log('2️⃣  Sending audio chunks...');
        
        // Generate test audio samples (simple sine wave)
        const sampleRate = 8000;
        const frequency = 440; // A4 note
        const amplitude = 8000;
        const chunkDuration = 0.05; // 50ms chunks
        const samplesPerChunk = Math.floor(sampleRate * chunkDuration);
        
        // Send 3 seconds of audio (60 chunks)
        for (let chunk = 0; chunk < 60; chunk++) {
            const samples = [];
            
            for (let i = 0; i < samplesPerChunk; i++) {
                const sampleIndex = chunk * samplesPerChunk + i;
                const t = sampleIndex / sampleRate;
                const sample = Math.floor(amplitude * Math.sin(2 * Math.PI * frequency * t));
                samples.push(sample);
            }
            
            client.send({
                type: 'audio_chunk',
                ucid: testUcid,
                data: {
                    samples: samples,
                    sampleRate: sampleRate,
                    bitsPerSample: 16,
                    channelCount: 1,
                    numberOfFrames: samples.length,
                    timestamp: Date.now()
                }
            });
            
            // 50ms between chunks
            await sleep(50);
            
            // Progress indicator
            if (chunk % 10 === 0) {
                const progress = Math.floor((chunk / 60) * 100);
                console.log(`   📡 Sent ${chunk + 1}/60 chunks (${progress}%)`);
            }
        }
        
        await sleep(2000);
        
        // 3. Test control commands
        console.log('3️⃣  Testing control commands...');
        
        // Change language
        client.send({
            type: 'control',
            ucid: testUcid,
            command: 'set_language',
            params: { language: 'hi' }
        });
        
        await sleep(500);
        
        // Change voice
        client.send({
            type: 'control',
            ucid: testUcid,
            command: 'set_voice',
            params: { voice: 'nova' }
        });
        
        await sleep(500);
        
        // 4. End streaming session
        console.log('4️⃣  Ending stream session...');
        client.send({
            type: 'stream_end',
            ucid: testUcid
        });
        
        console.log('✅ Test sequence completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT - shutting down gracefully...');
    client.shutdown();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM - shutting down gracefully...');
    client.shutdown();
    process.exit(0);
});