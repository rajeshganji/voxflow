const express = require('express');
const router = express.Router();
const path = require('path');
const flowCache = require('../utils/flowCache');

// Serve the flow JSON view page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'flowJsonView.html'));
});

// Get all flows in JSON format
router.get('/api/flows', async (req, res) => {
  try {
    const flows = await flowCache.getAllFlows();
    
    // Transform flows into a more readable format
    const transformedFlows = flows.map(flow => {
      // Get the full flow data to extract flowData
      const fullFlow = flowCache.getFlow(flow.id);
      
      return {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        status: flow.status,
        created: fullFlow?.createdAt || fullFlow?.created,
        lastUpdated: flow.lastUpdated,
        nodeCount: flow.nodeCount || 0,
        flowData: {
          nodes: fullFlow?.nodes || [],
          connections: fullFlow?.connections || [],
          metadata: fullFlow?.metadata || {},
          version: '1.0'
        }
      };
    });
    
    res.json({
      success: true,
      count: transformedFlows.length,
      flows: transformedFlows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching flows for JSON view:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get specific flow JSON
router.get('/api/flow/:id', async (req, res) => {
  try {
    const flowId = req.params.id;
    const flow = await flowCache.getFlow(flowId);
    
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found'
      });
    }
    
    // Return detailed flow structure
    res.json({
      success: true,
      flow: {
        metadata: {
          id: flow.id,
          name: flow.name,
          description: flow.description,
          status: flow.status,
          created: flow.createdAt || flow.created,
          lastUpdated: flow.lastUpdated,
          nodeCount: flow.nodes ? flow.nodes.length : 0
        },
        flowStructure: {
          nodes: flow.nodes || [],
          connections: flow.connections || [],
          metadata: flow.metadata || {},
          version: '1.0'
        },
        ivrStructure: generateIVRStructure(flow)
      }
    });
  } catch (error) {
    console.error('Error fetching flow JSON:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate IVR-compatible structure from flow data
function generateIVRStructure(flow) {
  if (!flow.nodes || !Array.isArray(flow.nodes)) {
    return {
      version: '1.0',
      flow: {
        name: flow.name,
        nodes: [],
        transitions: []
      }
    };
  }
  
  const nodes = flow.nodes.map(node => ({
    id: node.id,
    type: node.type,
    position: node.position,
    properties: generateNodeProperties(node)
  }));
  
  const transitions = (flow.connections || []).map(conn => ({
    from: conn.sourceNodeId,
    to: conn.targetNodeId,
    condition: conn.type || 'next',
    properties: conn.properties || {}
  }));
  
  return {
    version: '1.0',
    flow: {
      name: flow.name,
      description: flow.description,
      nodes: nodes,
      transitions: transitions,
      startNode: findStartNode(nodes)
    }
  };
}

function generateNodeProperties(node) {
  const baseProps = {
    label: node.data?.label || node.type,
    description: node.data?.description || ''
  };
  
  switch (node.type) {
    case 'start':
      return {
        ...baseProps,
        action: 'initialize_call',
        message: 'Call started'
      };
    case 'play_audio':
      return {
        ...baseProps,
        action: 'play_message',
        message: node.data?.audioText || 'Welcome to our service',
        audioFile: node.data?.audioUrl || null,
        volume: node.data?.volume || 50,
        loop: node.data?.loop === 'true'
      };
    case 'get_input':
      return {
        ...baseProps,
        action: 'collect_dtmf',
        prompt: node.data?.promptText || 'Please enter your choice',
        maxDigits: parseInt(node.data?.maxDigits) || 1,
        timeout: parseInt(node.data?.timeout) * 1000 || 5000
      };
    case 'record':
      return {
        ...baseProps,
        action: 'record_voice',
        prompt: node.data?.promptText || 'Please leave your message after the beep',
        maxDuration: parseInt(node.data?.maxDuration) * 1000 || 30000,
        beep: node.data?.beepEnabled === 'true',
        format: node.data?.format || 'wav'
      };
    case 'transfer':
      return {
        ...baseProps,
        action: 'transfer_call',
        destination: node.data?.transferNumber || 'agent',
        timeout: parseInt(node.data?.timeout) * 1000 || 30000,
        callerId: node.data?.callerId || null
      };
    case 'hangup':
      return {
        ...baseProps,
        action: 'end_call',
        message: 'Thank you for calling'
      };
    default:
      return {
        ...baseProps,
        action: 'unknown',
        type: node.type
      };
  }
}

function findStartNode(nodes) {
  const startNode = nodes.find(node => node.type === 'start');
  return startNode ? startNode.id : null;
}

module.exports = router;