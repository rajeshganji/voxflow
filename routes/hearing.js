const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// WebSocket clients registry for voice streaming
const voiceClients = new Map();

// POST /api/hearing/register - Register a client for voice streaming
router.post('/register', (req, res) => {
  const { clientId, streamConfig } = req.body;
  
  if (!clientId) {
    return res.status(400).json({
      error: 'Client ID is required'
    });
  }
  
  logger.info('Voice streaming client registered', {
    clientId: clientId,
    config: streamConfig
  });
  
  // Store client configuration
  voiceClients.set(clientId, {
    id: clientId,
    config: streamConfig || {},
    registeredAt: new Date(),
    status: 'registered'
  });
  
  res.json({
    success: true,
    clientId: clientId,
    message: 'Client registered for voice streaming'
  });
});

// GET /api/hearing/clients - Get all registered voice clients
router.get('/clients', (req, res) => {
  logger.info('Voice clients list requested');
  
  const clients = Array.from(voiceClients.values());
  
  res.json({
    clients: clients,
    count: clients.length
  });
});

// POST /api/hearing/stream - Receive voice stream data
router.post('/stream', (req, res) => {
  const { clientId, streamData, metadata } = req.body;
  
  if (!clientId || !streamData) {
    return res.status(400).json({
      error: 'Client ID and stream data are required'
    });
  }
  
  logger.info('Voice stream data received via HTTP', {
    clientId: clientId,
    dataSize: JSON.stringify(streamData).length,
    timestamp: metadata?.timestamp,
    format: metadata?.format || 'unknown'
  });
  
  // Process voice stream data
  processVoiceStream(clientId, streamData, metadata);
  
  res.json({
    success: true,
    message: 'Voice stream data processed',
    timestamp: new Date().toISOString()
  });
});

// DELETE /api/hearing/unregister/:clientId - Unregister a voice client
router.delete('/unregister/:clientId', (req, res) => {
  const { clientId } = req.params;
  
  if (voiceClients.has(clientId)) {
    voiceClients.delete(clientId);
    
    logger.info('Voice streaming client unregistered', {
      clientId: clientId
    });
    
    res.json({
      success: true,
      message: 'Client unregistered successfully'
    });
  } else {
    res.status(404).json({
      error: 'Client not found'
    });
  }
});

// GET /api/hearing/status/:clientId - Get client streaming status
router.get('/status/:clientId', (req, res) => {
  const { clientId } = req.params;
  
  const client = voiceClients.get(clientId);
  
  if (!client) {
    return res.status(404).json({
      error: 'Client not found'
    });
  }
  
  logger.info('Voice client status requested', {
    clientId: clientId
  });
  
  res.json({
    client: client,
    isActive: client.status === 'streaming',
    uptime: Date.now() - client.registeredAt.getTime()
  });
});

// POST /api/hearing/test - Test voice streaming endpoint
router.post('/test', (req, res) => {
  const testData = {
    type: 'voice_stream',
    clientId: 'test-client',
    streamData: {
      audioData: 'base64_encoded_audio_data_here',
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      duration: 1000
    },
    metadata: {
      timestamp: new Date().toISOString(),
      sequenceId: 1,
      isComplete: false
    }
  };
  
  logger.info('Voice streaming test data generated');
  
  res.json({
    message: 'Test voice stream data',
    example: testData,
    websocketUrl: 'ws://localhost:3000',
    httpUrl: 'http://localhost:3000/api/hearing/stream'
  });
});

// Function to process voice stream data
function processVoiceStream(clientId, streamData, metadata) {
  try {
    // Update client status
    if (voiceClients.has(clientId)) {
      const client = voiceClients.get(clientId);
      client.status = 'streaming';
      client.lastStreamAt = new Date();
      voiceClients.set(clientId, client);
    }
    
    // Log stream details
    logger.info('Processing voice stream', {
      clientId: clientId,
      format: streamData.format,
      sampleRate: streamData.sampleRate,
      channels: streamData.channels,
      duration: streamData.duration,
      sequenceId: metadata?.sequenceId
    });
    
    // Here you would typically:
    // 1. Save audio data to storage
    // 2. Process with speech-to-text
    // 3. Trigger IVR flow based on voice input
    // 4. Send response back via WebSocket
    
    // For now, just acknowledge processing
    logger.info('Voice stream processed successfully', {
      clientId: clientId,
      processedAt: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error processing voice stream', {
      clientId: clientId,
      error: error.message,
      stack: error.stack
    });
  }
}

module.exports = router;