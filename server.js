// Load environment variables
require('dotenv').config();

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

// Import logger and StreamServer
const logger = require('./utils/logger');
const StreamServer = require('./services/streamServer');

const app = express();
const port = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Import stream client for StreamServer integration
const { streamClient } = require('./routes/hearing');

// Create StreamServer for handling Ozonetel stream connections
const streamServer = new StreamServer(server, streamClient);

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
      websocket: '/ws',
      monitor: '/api/monitor'
    }
  });
});

// Monitoring API route
app.get('/api/monitor', (req, res) => {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    // Get StreamServer status if available
    let streamServerStatus = {
      available: false,
      activeConnections: 0,
      connections: []
    };
    
    if (streamServer) {
      streamServerStatus = {
        available: true,
        ...streamServer.getStatus()
      };
    }
    
    // Get hearing service status
    let hearingStatus = {
      streamClientConnected: false,
      streamingClientConnected: false,
      activeSessions: 0
    };
    
    try {
      const { streamClient } = require('./routes/hearing');
      if (streamClient) {
        const status = streamClient.getStatus();
        hearingStatus.streamClientConnected = status.connected || false;
        hearingStatus.activeSessions = status.activeSessions || 0;
      }
    } catch (err) {
      logger.warn('Could not get hearing service status', { error: err.message });
    }
    
    const monitorData = {
      server: {
        status: 'running',
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        uptimeSeconds: Math.floor(uptime),
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      },
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
      },
      websockets: {
        streamServer: streamServerStatus,
        hearing: hearingStatus
      },
      endpoints: {
        total: 5,
        active: [
          { path: '/api/designer', status: 'active' },
          { path: '/api/ivrexecuter', status: 'active' },
          { path: '/api/hearing', status: 'active' },
          { path: '/flowJsonView', status: 'active' },
          { path: '/ws', status: 'active', type: 'websocket' }
        ]
      },
      health: {
        status: 'healthy',
        checks: {
          server: 'ok',
          memory: memoryUsage.heapUsed < memoryUsage.heapTotal * 0.9 ? 'ok' : 'warning',
          websockets: streamServerStatus.available ? 'ok' : 'no_connections'
        }
      }
    };
    
    res.json(monitorData);
    
    logger.info('Monitor API accessed', { 
      connections: streamServerStatus.activeConnections,
      uptime: Math.floor(uptime)
    });
    
  } catch (error) {
    logger.error('Error in monitor API', { error: error.message });
    res.status(500).json({
      server: { status: 'error' },
      error: 'Failed to retrieve monitoring data',
      message: error.message
    });
  }
});

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
  console.log(`📡 Stream WebSocket server ready at /ws (handled by StreamServer)`);
  console.log(`🎨 Designer: ${baseUrl}/api/designer`);
  console.log(`📞 IVR Executer: ${baseUrl}/api/ivrexecuter`);
  console.log(`🎧 Hearing: ${baseUrl}/api/hearing`);
  console.log(`� Monitor: ${baseUrl}/api/monitor`);
  console.log(`�🔍 Flow JSON Viewer: ${baseUrl}/flowJsonView`);
});

// Increase max listeners to prevent warning
server.setMaxListeners(20);

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
      if (streamServer) {
        console.log('Closing StreamServer...');
        // StreamServer doesn't have a close method, but connections will close with server
      }
      resolve();
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