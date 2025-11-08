const OpenAI = require('openai');

class OpenAIService {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY;
        
        if (!this.apiKey) {
            console.warn('[OpenAI] OPENAI_API_KEY not set - speech features will be disabled');
            this.enabled = false;
            return;
        }
        
        this.client = new OpenAI({
            apiKey: this.apiKey
        });
        
        this.enabled = true;
        console.log('[OpenAI] Service initialized successfully');
    }

    /**
     * Convert speech audio to text using Whisper
     * @param {Buffer} audioBuffer - Audio file buffer (WAV, MP3, etc.)
     * @param {string} language - Language code (e.g., 'en', 'hi', 'auto' for detection)
     * @returns {Promise<{text: string, language: string}>}
     */
    async speechToText(audioBuffer, language = 'en') {
        if (!this.enabled) {
            throw new Error('OpenAI service not enabled - check OPENAI_API_KEY');
        }

        try {
            const startTime = Date.now();
            
            // Map unsupported Indian language codes to auto-detect
            const whisperSupportedLanguages = ['en', 'hi', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'];
            let whisperLanguage = language;
            
            if (language !== 'auto' && !whisperSupportedLanguages.includes(language)) {
                console.log(`[OpenAI] Language '${language}' not directly supported by Whisper, using auto-detect`);
                whisperLanguage = 'auto';
            }
            
            console.log('[OpenAI] Converting speech to text...', { 
                bufferSize: audioBuffer.length,
                requestedLanguage: language,
                whisperLanguage: whisperLanguage
            });
            
            // Create a blob from the buffer for FormData
            const blob = new Blob([audioBuffer], { type: 'audio/wav' });
            const file = new File([blob], 'audio.wav', { type: 'audio/wav' });
            
            const transcription = await this.client.audio.transcriptions.create({
                file: file,
                model: 'whisper-1',
                language: whisperLanguage === 'auto' ? undefined : whisperLanguage,
                response_format: 'verbose_json'
            });
            
            const duration = Date.now() - startTime;
            
            console.log('[OpenAI] Speech-to-text completed in', duration, 'ms', { 
                text: transcription.text,
                detectedLanguage: transcription.language,
                textLength: transcription.text.length
            });
            
            return {
                text: transcription.text,
                language: transcription.language || language
            };
        } catch (error) {
            console.error('[OpenAI] Speech-to-text error:', error.message);
            throw error;
        }
    }

    /**
     * Detect intent from user text using GPT
     * @param {string} userText - User's spoken text
     * @param {Array<string>} possibleIntents - List of expected intents
     * @param {Object} context - Additional context for intent detection
     * @returns {Promise<{intent: string, confidence: number, entities: Object}>}
     */
    async detectIntent(userText, possibleIntents = [], context = {}) {
        if (!this.enabled) {
            throw new Error('OpenAI service not enabled - check OPENAI_API_KEY');
        }

        try {
            console.info('[OpenAI] Detecting intent...', { userText, possibleIntents });
            
            const systemPrompt = `You are an intent detection system for an IVR (phone) application.
Analyze the user's spoken input and determine their intent.

${possibleIntents.length > 0 ? `Expected intents: ${possibleIntents.join(', ')}` : ''}

Respond ONLY with valid JSON in this format:
{
  "intent": "the_detected_intent",
  "confidence": 0.95,
  "entities": {
    "key": "value"
  }
}`;

            const response = await this.client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userText }
                ],
                temperature: 0.3,
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(response.choices[0].message.content);
            
            console.info('[OpenAI] Intent detected', result);
            
            return {
                intent: result.intent || 'unknown',
                confidence: result.confidence || 0.5,
                entities: result.entities || {}
            };
        } catch (error) {
            console.error('[OpenAI] Intent detection error:', error);
            throw error;
        }
    }

    /**
     * Generate conversational response using GPT
     * @param {string} userMessage - User's message
     * @param {Array} conversationHistory - Previous messages
     * @param {string} systemContext - System prompt/context
     * @returns {Promise<string>} AI response
     */
    async generateResponse(userMessage, conversationHistory = [], systemContext = '') {
        if (!this.enabled) {
            throw new Error('OpenAI service not enabled - check OPENAI_API_KEY');
        }

        try {
            console.info('[OpenAI] Generating conversational response...', { userMessage });
            
            const messages = [
                { 
                    role: 'system', 
                    content: systemContext || 'You are a helpful assistant in a phone call. Keep responses concise and natural for voice interaction.' 
                },
                ...conversationHistory,
                { role: 'user', content: userMessage }
            ];

            const response = await this.client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: messages,
                temperature: 0.7,
                max_tokens: 150
            });

            const reply = response.choices[0].message.content;
            
            console.info('[OpenAI] Response generated', { reply });
            
            return reply;
        } catch (error) {
            console.error('[OpenAI] Response generation error:', error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new OpenAIService();