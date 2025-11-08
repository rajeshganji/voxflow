const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const flowCache = require('../utils/flowCache');

// GET /api/designer - Serve designer interface or specific flow
router.get('/', (req, res) => {
  const { flowId } = req.query;
  
  if (flowId) {
    // Return specific flow data
    logger.info('Designer interface requested for specific flow', { flowId: flowId });
    
    const flow = flowCache.getFlow(flowId);
    if (!flow) {
      return res.status(404).json({
        error: 'Flow not found',
        flowId: flowId
      });
    }
    
    res.json({
      message: 'VoxFlow Designer Interface',
      version: '1.0.0',
      flow: flow,
      features: {
        dragDrop: true,
        nodeLibrary: true,
        flowBuilder: true
      }
    });
  } else {
    // Return general designer info
    logger.info('Designer interface requested');
    
    res.json({
      message: 'VoxFlow Designer Interface',
      version: '1.0.0',
      features: {
        dragDrop: true,
        nodeLibrary: true,
        flowBuilder: true
      }
    });
  }
});

// GET /api/designer/flows - Get all flows list
router.get('/flows', (req, res) => {
  logger.info('All flows list requested');
  
  try {
    const flows = flowCache.getAllFlows();
    const stats = flowCache.getStats();
    
    res.json({
      success: true,
      flows: flows,
      statistics: stats
    });
  } catch (error) {
    logger.error('Error fetching flows list', { error: error.message });
    res.status(500).json({
      error: 'Failed to fetch flows',
      message: error.message
    });
  }
});

// GET /api/designer/nodes - Get available nodes for sidebar
router.get('/nodes', (req, res) => {
  logger.info('Designer nodes requested');
  
  const nodes = [
    {
      id: 'start',
      name: 'Start',
      type: 'trigger',
      description: 'Entry point for IVR flow',
      icon: 'play-circle',
      category: 'control'
    },
    {
      id: 'play_audio',
      name: 'Play Audio',
      type: 'action',
      description: 'Play audio message to caller',
      icon: 'volume-up',
      category: 'audio',
      properties: {
        audioUrl: { type: 'string', required: true },
        loop: { type: 'boolean', default: false }
      }
    },
    {
      id: 'get_input',
      name: 'Get Input',
      type: 'input',
      description: 'Collect DTMF input from caller',
      icon: 'keyboard',
      category: 'input',
      properties: {
        maxDigits: { type: 'number', default: 1 },
        timeout: { type: 'number', default: 5000 },
        terminator: { type: 'string', default: '#' }
      }
    },
    {
      id: 'record',
      name: 'Record',
      type: 'input',
      description: 'Record caller voice',
      icon: 'microphone',
      category: 'audio',
      properties: {
        maxDuration: { type: 'number', default: 30 },
        beep: { type: 'boolean', default: true }
      }
    },
    {
      id: 'transfer',
      name: 'Transfer',
      type: 'action',
      description: 'Transfer call to another number',
      icon: 'phone-forward',
      category: 'control',
      properties: {
        number: { type: 'string', required: true },
        timeout: { type: 'number', default: 30 }
      }
    },
    {
      id: 'hangup',
      name: 'Hangup',
      type: 'terminator',
      description: 'End the call',
      icon: 'phone-slash',
      category: 'control'
    }
  ];
  
  res.json({
    nodes: nodes,
    categories: ['control', 'audio', 'input']
  });
});

// POST /api/designer/flow - Save flow design
router.post('/flow', (req, res) => {
  const { flowData } = req.body;
  
  if (!flowData) {
    return res.status(400).json({
      error: 'Flow data is required'
    });
  }
  
  try {
    const result = flowCache.saveFlow(flowData);
    
    logger.info('Flow design saved', {
      flowId: result.flowId,
      nodeCount: flowData.nodes ? flowData.nodes.length : 0,
      name: flowData.name
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Error saving flow design', { error: error.message });
    res.status(500).json({
      error: 'Failed to save flow',
      message: error.message
    });
  }
});

// POST /api/designer/flow/new - Create new flow
router.post('/flow/new', (req, res) => {
  const { name, description } = req.body;
  
  try {
    const newFlow = flowCache.createNewFlow(name, description);
    
    logger.info('New flow created via API', {
      flowId: newFlow.id,
      name: newFlow.name
    });
    
    res.json({
      success: true,
      flow: newFlow,
      message: 'New flow created successfully'
    });
  } catch (error) {
    logger.error('Error creating new flow', { error: error.message });
    res.status(500).json({
      error: 'Failed to create new flow',
      message: error.message
    });
  }
});

// POST /api/designer/flow/:id/duplicate - Duplicate flow
router.post('/flow/:id/duplicate', (req, res) => {
  const { id } = req.params;
  
  try {
    const result = flowCache.duplicateFlow(id);
    
    if (result.success) {
      logger.info('Flow duplicated via API', {
        originalId: id,
        newId: result.flow.id
      });
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Error duplicating flow', { flowId: id, error: error.message });
    res.status(500).json({
      error: 'Failed to duplicate flow',
      message: error.message
    });
  }
});

// DELETE /api/designer/flow/:id - Delete flow
router.delete('/flow/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const result = flowCache.deleteFlow(id);
    
    if (result.success) {
      logger.info('Flow deleted via API', { flowId: id });
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Error deleting flow', { flowId: id, error: error.message });
    res.status(500).json({
      error: 'Failed to delete flow',
      message: error.message
    });
  }
});

// GET /api/designer/flow/:id - Get saved flow
router.get('/flow/:id', (req, res) => {
  const { id } = req.params;
  
  logger.info('Flow design requested', { flowId: id });
  
  try {
    const flow = flowCache.getFlow(id);
    
    if (!flow) {
      return res.status(404).json({
        error: 'Flow not found',
        flowId: id
      });
    }
    
    res.json({
      success: true,
      flow: flow
    });
  } catch (error) {
    logger.error('Error fetching flow', { flowId: id, error: error.message });
    res.status(500).json({
      error: 'Failed to fetch flow',
      message: error.message
    });
  }
});

module.exports = router;