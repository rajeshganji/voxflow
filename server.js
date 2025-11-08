const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Import routers
const designerRoutes = require('./routes/designer');
const ivrExecuterRoutes = require('./routes/ivrexecuter');
const hearingRoutes = require('./routes/hearing');
const flowViewRoutes = require('./routes/flowview');

// Import logger
const logger = require('./utils/logger');

const app = express();
const port = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "data:", "blob:"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// API Routes
app.use('/api/designer', designerRoutes);
app.use('/api/ivrexecuter', ivrExecuterRoutes);
app.use('/api/hearing', hearingRoutes);
app.use('/flowJsonView', flowViewRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'VoxFlow Server is running!',
    version: '1.0.0',
    endpoints: {
      designer: '/api/designer',
      ivrExecuter: '/api/ivrexecuter', 
      hearing: '/api/hearing',
      websocket: '/ws'
    }
  });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientId = require('uuid').v4();
  ws.clientId = clientId;
  
  logger.info('WebSocket connection established', {
    clientId: clientId,
    ip: req.socket.remoteAddress,
    userAgent: req.headers['user-agent']
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connection',
    message: 'Connected to VoxFlow WebSocket server',
    clientId: clientId,
    timestamp: new Date().toISOString()
  }));

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      logger.info('WebSocket message received', {
        clientId: clientId,
        messageType: data.type || 'unknown',
        dataSize: message.length
      });

      // Handle different message types
      switch (data.type) {
        case 'voice_stream':
          handleVoiceStream(ws, data);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
        default:
          logger.warn('Unknown message type received', { 
            clientId: clientId, 
            type: data.type 
          });
      }
    } catch (error) {
      logger.error('Error parsing WebSocket message', {
        clientId: clientId,
        error: error.message,
        rawMessage: message.toString()
      });
    }
  });

  // Handle connection close
  ws.on('close', (code, reason) => {
    logger.info('WebSocket connection closed', {
      clientId: clientId,
      code: code,
      reason: reason.toString()
    });
  });

  // Handle errors
  ws.on('error', (error) => {
    logger.error('WebSocket error', {
      clientId: clientId,
      error: error.message,
      stack: error.stack
    });
  });
});

// Handle voice streaming
function handleVoiceStream(ws, data) {
  logger.info('Voice stream data received', {
    clientId: ws.clientId,
    streamId: data.streamId,
    dataSize: data.audioData ? data.audioData.length : 0
  });

  // Echo back confirmation (for now)
  ws.send(JSON.stringify({
    type: 'voice_stream_ack',
    streamId: data.streamId,
    timestamp: new Date().toISOString(),
    status: 'received'
  }));
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn('404 Not Found', {
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`
  });
});

// Start server
server.listen(port, () => {
  logger.info('VoxFlow server started', {
    service: 'voxflow',
    port: port,
    environment: process.env.NODE_ENV || 'development'
  });
  
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
    : `http://localhost:${port}`;
  
  console.log(`🚀 VoxFlow server running on port ${port}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🎨 Designer: ${baseUrl}/api/designer`);
  console.log(`📞 IVR Executer: ${baseUrl}/api/ivrexecuter`);
  console.log(`🎧 Hearing: ${baseUrl}/api/hearing`);
  console.log(`🔍 Flow JSON Viewer: ${baseUrl}/flowJsonView`);
});

// Increase max listeners to prevent warning
server.setMaxListeners(20);
wss.setMaxListeners(20);

// Graceful shutdown
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('\nForce shutdown...');
    process.exit(1);
  }
  
  isShuttingDown = true;
  console.log(`\n${signal} received, shutting down gracefully...`);
  logger.info(`${signal} received, shutting down gracefully`, { service: 'voxflow' });
  
  // Set a timeout to force exit if graceful shutdown takes too long
  const forceExit = setTimeout(() => {
    console.log('Forced shutdown after timeout');
    logger.error('Forced shutdown after timeout', { service: 'voxflow' });
    process.exit(1);
  }, 5000);
  
  // Close servers
  Promise.all([
    new Promise((resolve) => {
      wss.close((err) => {
        if (err) logger.error('Error closing WebSocket server', { error: err.message });
        else logger.info('WebSocket server closed');
        resolve();
      });
    }),
    new Promise((resolve) => {
      server.close((err) => {
        if (err) logger.error('Error closing HTTP server', { error: err.message });
        else logger.info('HTTP server closed');
        resolve();
      });
    })
  ]).then(() => {
    clearTimeout(forceExit);
    console.log('Server shutdown complete');
    process.exit(0);
  }).catch(() => {
    clearTimeout(forceExit);
    process.exit(1);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));