#!/usr/bin/env node

/**
 * Simple OpenAI API Test
 * Tests the OpenAI integration directly
 */

require('dotenv').config();
const openaiService = require('./services/openaiService');

async function testOpenAI() {
    console.log('🤖 Testing OpenAI Integration');
    console.log('=============================');
    console.log('API Key set:', !!process.env.OPENAI_API_KEY);
    console.log('Service enabled:', openaiService.enabled);
    console.log('');
    
    if (!openaiService.enabled) {
        console.error('❌ OpenAI service not enabled');
        return;
    }

    try {
        console.log('1️⃣  Testing intent detection...');
        const intentResult = await openaiService.detectIntent(
            'Hello, I need help with my account balance',
            ['greeting', 'help', 'account_balance', 'complaint']
        );
        
        console.log('   Intent result:', intentResult);
        console.log('');

        console.log('2️⃣  Testing response generation...');
        const response = await openaiService.generateResponse(
            'Hello, I need help with my account balance',
            [],
            'You are a helpful customer service agent. Keep responses concise.'
        );
        
        console.log('   Generated response:', response);
        console.log('');

        console.log('✅ OpenAI integration test completed successfully!');
        
    } catch (error) {
        console.error('❌ OpenAI test failed:', error.message);
    }
}

testOpenAI();