# VoxFlow IVR Flow Documentation

## Overview

The VoxFlow IVR Flow system provides KooKoo-compatible IVR functionality with AI integration. It allows you to build sophisticated voice applications that can handle traditional DTMF flows and modern AI-powered conversations.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   KooKoo API   │───▶│   IVR Flow       │───▶│   AI Streaming  │
│   (XML/HTTP)   │    │   Router         │    │   (/ws)         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   Response       │
                       │   (XML Output)   │
                       └──────────────────┘
```

## Components

### 1. Response Class
Generates KooKoo-compatible XML responses.

**Features:**
- Play text with TTS
- DTMF collection
- Audio streaming
- Call routing
- Conference calls
- Recording

### 2. CollectDtmf Class
Handles DTMF input collection with customizable parameters.

**Features:**
- Maximum digit limits
- Termination characters
- Timeout handling
- Play text/audio during collection

### 3. IVRFlow Class
Main flow controller that processes KooKoo events and generates responses.

**Features:**
- Event-driven processing
- AI integration via WebSocket
- Department routing
- Error handling
- Business hours logic

## API Endpoints

### Main IVR Flow
```
GET/POST /api/ivrflow/
```

**Parameters:**
- `sid` - Session/Call ID
- `event` - KooKoo event (NewCall, GotDTMF, Hangup, etc.)
- `data` - DTMF data or other event data
- `called_number` - Destination number
- `caller_id` - Caller's number
- `phone_no` - Phone number

**Example:**
```bash
curl "http://localhost:3000/api/ivrflow/?sid=call123&event=NewCall"
```

**Response:**
```xml
<response sid="call123">
  <playtext lang="EN" type="ggl" speed="3" quality="best">
    Welcome to VoxFlow AI Agent Portal. Please wait while we connect you to our intelligent assistant.
  </playtext>
  <stream is_sip="true" url="ws://localhost:3000/ws" record="true">520228</stream>
</response>
```

### Custom IVR Flow
```
POST /api/ivrflow/custom
```

**Body Parameters:**
```json
{
  "sid": "call123",
  "event": "NewCall",
  "data": "",
  "flow_type": "emergency|callback|business_hours|department|default",
  "department": "sales|support|billing",
  "priority": "normal|high",
  "language": "en|hi|te|ta"
}
```

### Test Components
```
GET /api/ivrflow/test/:component
```

**Available Components:**
- `welcome` - Test welcome message
- `menu` - Test DTMF menu
- `stream` - Test WebSocket streaming
- `dial` - Test call dialing
- `hangup` - Test call hangup

### Status & Analytics
```
GET /api/ivrflow/status      # Service status
GET /api/ivrflow/analytics   # Usage analytics
```

## Usage Examples

### 1. Basic Welcome Flow
```javascript
const { IVRFlow } = require('../ivr');

// Handle new call
const ivrFlow = new IVRFlow({
  sid: 'call123',
  event: 'NewCall'
});

const response = ivrFlow.processFlow();
console.log(response.getXML());
```

### 2. DTMF Menu Flow
```javascript
// Handle DTMF input
const ivrFlow = new IVRFlow({
  sid: 'call123',
  event: 'GotDTMF',
  data: '1'  // User pressed 1
});

const response = ivrFlow.processFlow();
response.send(res); // Send XML to KooKoo
```

### 3. Custom Department Routing
```javascript
const express = require('express');
const { Response, IVRFlow } = require('../ivr');

app.post('/custom-ivr', (req, res) => {
  const ivrFlow = new IVRFlow({
    sid: req.body.sid,
    event: req.body.event,
    data: req.body.data
  });
  
  // Custom department routing
  if (req.body.department === 'emergency') {
    ivrFlow.handleEmergencyCall();
  } else {
    ivrFlow.processFlow();
  }
  
  const response = ivrFlow.response;
  response.send(res);
});
```

### 4. AI-Powered Conversation
```javascript
// Direct AI integration
const response = new Response('call123');
response.addPlayText('Hello! How can I help you today?');

// Start AI conversation stream
const wsUrl = 'ws://your-domain:8080/ws';
response.addStream('520228', wsUrl, 'true');
response.send(res);
```

## WebSocket Integration

The IVR Flow system integrates with VoxFlow's AI streaming capabilities:

### WebSocket URL Construction
```javascript
// Development
ws://localhost:3000/ws

// Production (realway.com)
ws://your-domain:8080/ws

// With context parameters
ws://your-domain:8080/ws?department=sales&priority=high
```

### Stream Parameters
- `streamNumber` - Identifier for the stream session
- `wsUrl` - WebSocket endpoint URL
- `record` - Enable/disable recording ('true'/'false')

## Configuration

### Environment Variables
```bash
# Server Configuration
NODE_ENV=production
PORT=8080

# WebSocket URLs
STREAM_WS_URL=ws://your-domain:8080/ws
STREAMING_WS_URL=ws://your-domain:8080/ws

# Application URL
VOXFLOW_URL=http://your-domain:8080
```

### Department Routing Map
```javascript
const routingMap = {
  1: { department: "Sales", number: "1234567890" },
  2: { department: "Support", number: "9491593431" },
  3: { department: "Billing", number: "5555555555" },
  0: { department: "Customer Service", number: "9985392390" }
};
```

## Production Deployment

### For realway.com (Port 8080)
```bash
# Use production environment
npm run start:prod

# Or manually
cp .env.production .env
NODE_ENV=production PORT=8080 node server.js
```

### KooKoo Configuration
Point your KooKoo application URL to:
```
http://your-realway-domain:8080/api/ivrflow/
```

## Features

✅ **KooKoo Compatible** - Full XML response compatibility  
✅ **AI Integration** - WebSocket streaming for AI conversations  
✅ **DTMF Support** - Traditional keypad navigation  
✅ **Multi-language** - Support for multiple languages  
✅ **Call Recording** - Built-in recording capabilities  
✅ **Error Handling** - Robust error handling and recovery  
✅ **Business Logic** - Business hours, departments, priorities  
✅ **Testing Tools** - Built-in test endpoints  
✅ **Monitoring** - Real-time status and analytics  

## Testing

### Local Testing
```bash
# Start development server
npm run start:dev

# Test welcome flow
curl "http://localhost:3000/api/ivrflow/?sid=test&event=NewCall"

# Test DTMF input
curl "http://localhost:3000/api/ivrflow/?sid=test&event=GotDTMF&data=1"

# Test components
curl "http://localhost:3000/api/ivrflow/test/welcome"
curl "http://localhost:3000/api/ivrflow/test/menu"
```

### Production Testing
```bash
# Test production endpoint
curl "http://your-domain:8080/api/ivrflow/?sid=test&event=NewCall"

# Check service status
curl "http://your-domain:8080/api/ivrflow/status"
```

## Troubleshooting

### Common Issues

1. **XML Parsing Errors**
   - Ensure all text is properly escaped
   - Check for invalid XML characters

2. **WebSocket Connection Issues**
   - Verify STREAM_WS_URL is correct
   - Check firewall settings for WebSocket traffic

3. **Missing Dependencies**
   ```bash
   npm install xmldom
   ```

4. **Port Conflicts**
   - Ensure port 8080 is available for production
   - Use PORT environment variable to override

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug npm start
```

## Support

For issues or questions:
1. Check the monitor API: `/api/monitor`
2. Review server logs
3. Test individual components: `/api/ivrflow/test/:component`
4. Verify environment configuration