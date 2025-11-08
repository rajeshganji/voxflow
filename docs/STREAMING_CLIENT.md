# VoxFlow Streaming Client

Real-time audio processing system for bi-directional streaming with OpenAI transcription and TTS playback.

## 🎯 Features

- **Real-time Audio Streaming**: Continuous audio processing with low latency
- **OpenAI Integration**: Live transcription using Whisper API
- **TTS Playback**: AI-generated responses via ElevenLabs TTS
- **Multi-language Support**: English, Hindi, Telugu, Tamil, Kannada, Malayalam
- **Silence Detection**: Intelligent voice activity detection
- **Quality Filtering**: Removes hallucinations and false positives
- **Concurrent Protection**: Prevents overlapping transcriptions/playback
- **Graceful Reconnection**: Automatic reconnection with session recovery

## 🚀 Quick Start

### 1. Configuration

Copy the environment configuration:

```bash
cp .env.streaming.example .env
```

Edit `.env` with your API keys:

```bash
# Enable streaming client
ENABLE_STREAMING_CLIENT=true

# API Keys
OPENAI_API_KEY=your_openai_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# WebSocket URL (adjust if needed)
STREAMING_WS_URL=ws://localhost:8080/streaming
```

### 2. Start Server

```bash
npm start
```

### 3. Test API

```bash
# Test via HTTP API
node scripts/test-streaming-api.js

# Test direct WebSocket client
node scripts/test-streaming.js
```

## 📡 WebSocket Protocol

### Client → Server Messages

#### Stream Start
```json
{
  "type": "stream_start",
  "ucid": "call_12345",
  "language": "en",
  "voice": "alloy"
}
```

#### Audio Chunk
```json
{
  "type": "audio_chunk",
  "ucid": "call_12345",
  "data": {
    "samples": [123, 456, 789, ...],
    "sampleRate": 8000,
    "bitsPerSample": 16,
    "channelCount": 1,
    "numberOfFrames": 400,
    "timestamp": 1699123456789
  }
}
```

#### Control Commands
```json
{
  "type": "control",
  "ucid": "call_12345",
  "command": "set_language",
  "params": { "language": "hi" }
}
```

#### Stream End
```json
{
  "type": "stream_end",
  "ucid": "call_12345"
}
```

### Server → Client Events

#### Transcription
```json
{
  "event": "transcription",
  "ucid": "call_12345",
  "text": "Hello, how can I help you?",
  "language": "en",
  "isPartial": false,
  "timestamp": 1699123456789
}
```

#### Response Played
```json
{
  "event": "response_played",
  "ucid": "call_12345",
  "userText": "I need help",
  "success": true
}
```

#### Stream Ended
```json
{
  "event": "stream_ended",
  "ucid": "call_12345",
  "duration": 45000,
  "stats": {
    "totalAudioMs": 42000,
    "transcriptionChunks": 8,
    "playbackChunks": 5
  },
  "finalTranscription": "Complete conversation text..."
}
```

## 🛠 HTTP API Endpoints

### Start Streaming Session
```http
POST /api/hearing/streaming/start
Content-Type: application/json

{
  "ucid": "call_12345",
  "language": "en",
  "voice": "alloy"
}
```

### Send Audio Chunk
```http
POST /api/hearing/streaming/audio
Content-Type: application/json

{
  "ucid": "call_12345",
  "samples": [123, 456, 789, ...],
  "sampleRate": 8000
}
```

### Update Language
```http
POST /api/hearing/streaming/language
Content-Type: application/json

{
  "ucid": "call_12345",
  "language": "hi"
}
```

### Control Commands
```http
POST /api/hearing/streaming/control
Content-Type: application/json

{
  "ucid": "call_12345",
  "command": "pause_transcription"
}
```

Available commands:
- `pause_transcription` - Pause transcription processing
- `resume_transcription` - Resume transcription processing
- `set_voice` - Change TTS voice

### End Streaming Session
```http
POST /api/hearing/streaming/end
Content-Type: application/json

{
  "ucid": "call_12345"
}
```

### Get Status
```http
GET /api/hearing/streaming/status
```

## ⚙️ Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `ENABLE_STREAMING_CLIENT` | `false` | Enable streaming client |
| `STREAMING_WS_URL` | `ws://localhost:8080/streaming` | WebSocket server URL |
| `STREAMING_BUFFER_MS` | `2000` | Audio buffer duration (ms) |
| `STREAMING_SILENCE_MS` | `1000` | Silence detection threshold (ms) |
| `MIN_SPEECH_DURATION` | `1500` | Minimum speech duration (ms) |
| `DEFAULT_TRANSCRIPTION_LANGUAGE` | `en` | Default language code |
| `DEFAULT_TTS_VOICE` | `alloy` | Default TTS voice |
| `ECHO_MODE` | `false` | Echo mode for testing |

## 🌍 Language Support

| Language | Code | Whisper Support | TTS Support |
|----------|------|-----------------|-------------|
| English | `en` | ✅ Native | ✅ Native |
| Hindi | `hi` | ✅ Native | ✅ Native |
| Telugu | `te` | ⚡ Auto-detect | ✅ Native |
| Tamil | `ta` | ⚡ Auto-detect | ✅ Native |
| Kannada | `kn` | ⚡ Auto-detect | ✅ Native |
| Malayalam | `ml` | ⚡ Auto-detect | ✅ Native |
| Auto-detect | `auto` | ✅ | ✅ |

> **Note**: Languages not natively supported by Whisper use auto-detection mode.

## 🎙️ Audio Format Requirements

- **Sample Rate**: 8kHz (8000 Hz)
- **Bit Depth**: 16-bit signed integers
- **Channels**: Mono (1 channel)
- **Format**: PCM linear
- **Chunk Size**: 400 samples (50ms) recommended
- **Range**: -32768 to 32767

## 🔧 Audio Processing Pipeline

```
Raw Audio → Validation → Buffering → Silence Detection → 
OpenAI Whisper → Hallucination Filter → Intent Detection → 
AI Response → ElevenLabs TTS → Audio Conversion → Playback
```

### Quality Filters

1. **Duration Filter**: Minimum 1.5 seconds of speech
2. **Energy Filter**: RMS threshold to detect actual speech
3. **Hallucination Filter**: Remove common Whisper false positives
4. **Duplicate Filter**: Prevent repeated transcriptions
5. **Concurrent Filter**: Prevent overlapping operations

## 🐛 Debugging

### Enable Debug Logs
```bash
export LOG_LEVEL=debug
npm start
```

### Common Issues

**Streaming client not connecting:**
```bash
# Check WebSocket URL
echo $STREAMING_WS_URL

# Test server connectivity
curl http://localhost:3000/api/hearing/streaming/status
```

**Transcription not working:**
```bash
# Verify OpenAI API key
echo $OPENAI_API_KEY

# Check audio format
curl -X POST http://localhost:3000/api/hearing/streaming/audio \
  -H "Content-Type: application/json" \
  -d '{"ucid":"test","samples":[100,-100,200,-200]}'
```

**TTS playback failing:**
```bash
# Verify ElevenLabs API key
echo $ELEVENLABS_API_KEY

# Test TTS directly
curl -X POST http://localhost:3000/api/playback/text \
  -H "Content-Type: application/json" \
  -d '{"ucid":"test","text":"Hello world"}'
```

### Log Analysis

Key log patterns to monitor:

```bash
# Successful transcription
grep "Transcription received" logs/app.log

# Audio validation failures
grep "Audio validation" logs/app.log

# Hallucination filtering
grep "FILTERED" logs/app.log

# Playback status
grep "Response played" logs/app.log
```

## 📊 Performance Metrics

- **Transcription Latency**: ~500-1500ms
- **TTS Generation**: ~300-800ms
- **Total Response Time**: ~1-3 seconds
- **Audio Buffer**: 2-4 seconds continuous
- **Memory Usage**: ~50MB per active session
- **Concurrent Sessions**: Limited by API rate limits

## 🔐 Security Considerations

1. **API Key Protection**: Store in environment variables
2. **WebSocket Authentication**: Implement if needed
3. **Rate Limiting**: Monitor API usage
4. **Audio Privacy**: Temporary storage only
5. **Session Isolation**: Each UCID is independent

## 🚀 Production Deployment

### Railway.app Configuration

```bash
# Build command
npm install

# Start command
npm start

# Environment variables
ENABLE_STREAMING_CLIENT=true
OPENAI_API_KEY=${{ OPENAI_API_KEY }}
ELEVENLABS_API_KEY=${{ ELEVENLABS_API_KEY }}
```

### Docker Configuration

```dockerfile
# Add to Dockerfile
EXPOSE 8080
ENV STREAMING_WS_URL=ws://0.0.0.0:8080/streaming
```

### Load Balancing

For multiple instances, ensure:
- Session affinity (sticky sessions)
- Shared storage for audio buffers
- WebSocket connection persistence

## 📈 Monitoring

Key metrics to track:

- Active streaming sessions
- Transcription accuracy rate
- Response generation time
- TTS playback success rate
- WebSocket connection stability
- API rate limit usage

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test with both scripts
4. Update documentation
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.