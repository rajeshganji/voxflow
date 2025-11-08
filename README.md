# VoxFlow

VoxFlow is an advanced IVR (Interactive Voice Response) application with a visual drag-drop designer, real-time voice streaming, and AI-powered conversational capabilities.

## 🚀 Features

- 🎨 **Visual Flow Designer**: Drag-and-drop interface for building IVR flows
- 📞 **Kookoo Integration**: Built-in support for Kookoo XML response format
- 🔊 **Real-time Voice Streaming**: Bi-directional audio streaming via WebSockets
- 🤖 **AI-Powered Conversations**: OpenAI integration for speech recognition and response generation
- 🎙️ **Advanced TTS**: ElevenLabs integration for high-quality text-to-speech
- 🌍 **Multi-language Support**: English, Hindi, Telugu, Tamil, Kannada, Malayalam
- 🛠️ **RESTful APIs**: Comprehensive APIs for designer, IVR execution, and voice handling
- 📋 **Comprehensive Logging**: Detailed logging with Winston framework
- ⚡ **Real-time Processing**: Low-latency audio processing pipeline

## 🎯 New: Streaming Client

VoxFlow now includes a powerful streaming client for real-time audio processing with OpenAI transcription and TTS playback. Perfect for live phone conversations with AI agents.

### Key Streaming Features:
- **Real-time Transcription**: Live speech-to-text using OpenAI Whisper
- **Intelligent Response Generation**: Context-aware AI responses
- **Quality Audio Filtering**: Advanced filtering to prevent hallucinations
- **Concurrent Session Management**: Handle multiple calls simultaneously
- **Automatic Language Detection**: Support for multiple Indian languages
- **Graceful Reconnection**: Robust connection handling with auto-retry

[📖 Read the complete Streaming Client Documentation](./docs/STREAMING_CLIENT.md)

## 🚀 Quick Start

### Standard Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configurations
   ```

3. **Start the Server**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

### Streaming Client Setup

1. **Enable Streaming Features**
   ```bash
   cp .env.streaming.example .env
   # Add your OpenAI and ElevenLabs API keys
   ```

2. **Test Streaming Client**
   ```bash
   # Test HTTP API
   node scripts/test-streaming-api.js
   
   # Test WebSocket client
   node scripts/test-streaming.js
   ```

3. **Access Applications**
   - **Designer Interface**: http://localhost:3000
   - **API Documentation**: http://localhost:3000
   - **Streaming Status**: http://localhost:3000/api/hearing/streaming/status

## 📡 API Endpoints

### Designer API (`/api/designer`)
- `GET /api/designer` - Designer interface info
- `GET /api/designer/nodes` - Available node types
- `POST /api/designer/flow` - Save flow design
- `GET /api/designer/flow/:id` - Get saved flow

### IVR Executer API (`/api/ivrexecuter`)
- `POST /api/ivrexecuter` - Execute IVR flow (returns Kookoo XML)
- `GET /api/ivrexecuter/flow/:id` - Get flow execution status
- `POST /api/ivrexecuter/webhook` - Handle Kookoo webhooks

### Voice Hearing API (`/api/hearing`)
- `POST /api/hearing/register` - Register voice streaming client
- `GET /api/hearing/clients` - List registered clients
- `POST /api/hearing/stream` - Receive voice stream data
- `DELETE /api/hearing/unregister/:clientId` - Unregister client
- `GET /api/hearing/status/:clientId` - Get client status
- `POST /api/hearing/test` - Test voice streaming

### 🆕 Streaming API (`/api/hearing/streaming/*`)
- `GET /streaming/status` - Get streaming client status
- `POST /streaming/start` - Start streaming session
- `POST /streaming/audio` - Send audio chunk for processing
- `POST /streaming/language` - Update transcription language
- `POST /streaming/control` - Send control commands
- `POST /streaming/end` - End streaming session

## WebSocket Events

### Client to Server
```json
{
  "type": "voice_stream",
  "streamId": "unique-stream-id",
  "audioData": "base64-encoded-audio",
  "metadata": {
    "format": "wav",
    "sampleRate": 16000,
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### Server to Client
```json
{
  "type": "voice_stream_ack",
  "streamId": "unique-stream-id",
  "status": "received",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Node Types

### Control Nodes
- **Start**: Entry point for IVR flow
- **Transfer**: Transfer call to another number
- **Hangup**: End the call

### Audio Nodes
- **Play Audio**: Play audio message to caller
- **Record**: Record caller voice

### Input Nodes
- **Get Input**: Collect DTMF input from caller

## Kookoo Integration

The application generates Kookoo-compatible XML responses:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <playaudio>
    <url>http://yourserver.com/audio/welcome.wav</url>
  </playaudio>
  <collectdtmf l="1" t="5">
    <url>http://yourserver.com/api/ivrexecuter</url>
  </collectdtmf>
</response>
```

## Development

### Project Structure
```
voxflow/
├── server.js              # Main server file
├── routes/
│   ├── designer.js        # Designer API routes
│   ├── ivrexecuter.js     # IVR execution routes
│   └── hearing.js         # Voice streaming routes
├── utils/
│   └── logger.js          # Logging configuration
├── public/
│   └── index.html         # Designer interface
└── logs/                  # Application logs
```

### Environment Variables
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging level (error/warn/info/debug)

### Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with auto-reload
- `npm test` - Run tests

## Logging

The application uses Winston for comprehensive logging:
- Console output in development
- File logging to `logs/combined.log` and `logs/error.log`
- JSON format with timestamps and metadata

## Next Steps

1. Implement database storage for flows
2. Add authentication and authorization
3. Enhance voice processing with speech-to-text
4. Add more node types and IVR features
5. Implement flow execution engine
6. Add unit and integration tests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.