const openaiService = require('./openaiService');

/**
 * Simple Flow Execution Engine
 * Executes IVR flows and generates responses
 */
class FlowEngine {
    constructor() {
        this.sessions = new Map(); // Store session state
    }

    /**
     * Get or create session for a call
     */
    getSession(callId) {
        if (!this.sessions.has(callId)) {
            this.sessions.set(callId, {
                callId,
                startTime: Date.now(),
                currentStep: 'start',
                conversationHistory: [],
                context: {}
            });
        }
        return this.sessions.get(callId);
    }

    /**
     * Clear session data
     */
    clearSession(callId) {
        this.sessions.delete(callId);
        console.info('[FlowEngine] Session cleared', { callId });
    }

    /**
     * Execute conversational flow with real-time transcription and playback
     * @param {string} ucid - Call ID from Ozonetel
     * @param {string} transcriptionText - Transcribed user speech
     * @param {Object} options - Flow options { language, voice }
     * @returns {Promise<boolean>} - Success status
     */
    async executeConversationalFlow(ucid, transcriptionText, options = {}) {
        try {
            const { language = 'en', voice = 'alloy' } = options;
            const session = this.getSession(ucid);
            
            console.info('[FlowEngine] Executing conversational flow', {
                ucid,
                userInput: transcriptionText.substring(0, 100),
                language,
                voice
            });

            // Check ECHO MODE (for testing)
            const echoMode = process.env.ECHO_MODE === 'true';
            
            let responseText;
            
            if (echoMode) {
                // ECHO MODE: Just repeat what user said
                console.info('[FlowEngine] ECHO MODE: Repeating user input');
                responseText = `You said: ${transcriptionText}`;
            } else {
                // CONVERSATIONAL MODE: Use AI to generate intelligent responses
                
                // Step 1: Detect intent from transcription
                console.info('[FlowEngine] Detecting intent...');
                const intentResult = await openaiService.detectIntent(
                    transcriptionText,
                    ['greeting', 'help', 'complaint', 'query', 'goodbye', 'unknown']
                );

                console.info('[FlowEngine] Intent detected:', intentResult);
                session.context.lastIntent = intentResult.intent;
                session.context.lastConfidence = intentResult.confidence;

                // Step 2: Generate AI response based on intent and conversation history
                console.info('[FlowEngine] Generating AI response...');
                
                const systemContext = `You are a helpful AI assistant in a phone call. 
Keep responses concise and natural for voice interaction (under 50 words).
Current intent: ${intentResult.intent}
Confidence: ${intentResult.confidence}
Language: ${language}`;

                responseText = await openaiService.generateResponse(
                    transcriptionText,
                    session.conversationHistory,
                    systemContext
                );

                console.info('[FlowEngine] Response generated:', responseText.substring(0, 100));

                // Step 3: Add to conversation history
                session.conversationHistory.push(
                    { role: 'user', content: transcriptionText },
                    { role: 'assistant', content: responseText }
                );

                // Limit history to last 10 messages
                if (session.conversationHistory.length > 10) {
                    session.conversationHistory = session.conversationHistory.slice(-10);
                }
            }

            // For now, just log the response (playback service would handle actual TTS)
            console.info('[FlowEngine] Generated response:', responseText);
            console.info('[FlowEngine] Conversational flow completed successfully');
            
            return true;

        } catch (error) {
            console.error('[FlowEngine] Conversational flow error:', error);
            return false;
        }
    }

    /**
     * Execute simple conversational greeting
     * @param {string} ucid - Call ID
     * @param {Object} options - { language, voice }
     * @returns {Promise<boolean>}
     */
    async playGreeting(ucid, options = {}) {
        const { language = 'en', voice = 'alloy' } = options;
        
        const greetings = {
            en: "Hello! Welcome to AI Agent Portal. I'm listening. How can I help you today?",
            hi: "नमस्ते! एआई एजेंट पोर्टल में आपका स्वागत है। मैं सुन रहा हूं। आज मैं आपकी कैसे मदद कर सकता हूं?",
            te: "నమస్కారం! AI ఏజెంట్ పోర్టల్‌కు స్వాగతం. నేను వింటున్నాను. ఈరోజు నేను మీకు ఎలా సహాయం చేయగలను?",
            ta: "வணக்கம்! AI ஏஜென்ட் போர்டலுக்கு வரவேற்கிறோம். நான் கேட்கிறேன். இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?"
        };

        const greeting = greetings[language] || greetings['en'];
        
        console.info('[FlowEngine] Playing greeting:', greeting);
        return true; // Simulate successful playback
    }
}

// Export singleton
module.exports = new FlowEngine();