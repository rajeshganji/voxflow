# VoxFlow

VoxFlow is an IVR (Interactive Voice Response) application with a visual drag-drop designer and real-time voice streaming capabilities.

## Features

- 🎨 **Visual Flow Designer**: Drag-and-drop interface for building IVR flows
- 📞 **Kookoo Integration**: Built-in support for Kookoo XML response format
- 🔊 **Voice Streaming**: Real-time voice streaming via WebSockets
- 🛠️ **API Endpoints**: RESTful APIs for designer, IVR execution, and voice handling
- 📋 **Comprehensive Logging**: Detailed logging for all operations

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

3. **Access the Application**
   - **Designer Interface**: http://localhost:3000
   - **API Documentation**: http://localhost:3000 (shows available endpoints)
   - **WebSocket**: ws://localhost:3000

## API Endpoints

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