#!/usr/bin/env node

/**
 * VoxFlow Streaming API Test Script
 * Tests the HTTP API endpoints for streaming functionality
 */

const axios = require('axios');

const baseURL = process.env.VOXFLOW_URL || 'http://localhost:3000';
const api = axios.create({ baseURL });

console.log('🚀 VoxFlow Streaming API Test');
console.log('==============================');
console.log('Base URL:', baseURL);
console.log('');

async function runAPITest() {
    const testUcid = `api_test_${Date.now()}`;
    
    try {
        console.log('📡 Testing streaming API endpoints...');
        console.log('');
        
        // 1. Check streaming status
        console.log('1️⃣  Checking streaming status...');
        const statusResponse = await api.get('/api/hearing/streaming/status');
        console.log('   Status:', statusResponse.data);
        console.log('');
        
        if (!statusResponse.data.enabled) {
            console.log('⚠️  Streaming client not enabled. Set ENABLE_STREAMING_CLIENT=true');
            return;
        }
        
        // 2. Start streaming session
        console.log('2️⃣  Starting streaming session...');
        const startResponse = await api.post('/api/hearing/streaming/start', {
            ucid: testUcid,
            language: 'en',
            voice: 'alloy'
        });
        console.log('   Start response:', startResponse.data);
        console.log('');
        
        await sleep(1000);
        
        // 3. Send test audio chunk
        console.log('3️⃣  Sending test audio chunk...');
        
        // Generate test audio samples
        const sampleRate = 8000;
        const samples = [];
        for (let i = 0; i < 400; i++) { // 50ms of audio
            samples.push(Math.floor(Math.random() * 1000 - 500)); // Random noise
        }
        
        const audioResponse = await api.post('/api/hearing/streaming/audio', {
            ucid: testUcid,
            samples: samples,
            sampleRate: sampleRate
        });
        console.log('   Audio response:', audioResponse.data);
        console.log('');
        
        await sleep(500);
        
        // 4. Test language control
        console.log('4️⃣  Testing language control...');
        const langResponse = await api.post('/api/hearing/streaming/language', {
            ucid: testUcid,
            language: 'hi'
        });
        console.log('   Language response:', langResponse.data);
        console.log('');
        
        await sleep(500);
        
        // 5. Test control commands
        console.log('5️⃣  Testing control commands...');
        const controlResponse = await api.post('/api/hearing/streaming/control', {
            ucid: testUcid,
            command: 'pause_transcription'
        });
        console.log('   Control response:', controlResponse.data);
        console.log('');
        
        await sleep(500);
        
        // Resume transcription
        const resumeResponse = await api.post('/api/hearing/streaming/control', {
            ucid: testUcid,
            command: 'resume_transcription'
        });
        console.log('   Resume response:', resumeResponse.data);
        console.log('');
        
        await sleep(1000);
        
        // 6. End streaming session
        console.log('6️⃣  Ending streaming session...');
        const endResponse = await api.post('/api/hearing/streaming/end', {
            ucid: testUcid
        });
        console.log('   End response:', endResponse.data);
        console.log('');
        
        // 7. Final status check
        console.log('7️⃣  Final status check...');
        const finalStatus = await api.get('/api/hearing/streaming/status');
        console.log('   Final status:', finalStatus.data);
        console.log('');
        
        console.log('✅ API test completed successfully!');
        
    } catch (error) {
        console.error('❌ API test failed:');
        
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        } else {
            console.error('   Error:', error.message);
        }
        
        console.log('');
        console.log('💡 Tips:');
        console.log('   - Make sure VoxFlow server is running on', baseURL);
        console.log('   - Check that ENABLE_STREAMING_CLIENT=true in your .env');
        console.log('   - Ensure OpenAI API key is configured');
    }
}

/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
runAPITest();