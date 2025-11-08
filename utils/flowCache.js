const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

class FlowCache {
  constructor() {
    this.cacheDir = path.join(__dirname, '..', 'cache');
    this.flowsFile = path.join(this.cacheDir, 'flows.json');
    this.init();
  }

  init() {
    try {
      // Create cache directory if it doesn't exist
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        logger.info('Cache directory created', { path: this.cacheDir });
      }

      // Create flows file if it doesn't exist
      if (!fs.existsSync(this.flowsFile)) {
        this.saveFlowsData({});
        logger.info('Flows cache file created', { path: this.flowsFile });
      }
    } catch (error) {
      logger.error('Error initializing flow cache', { error: error.message });
    }
  }

  loadFlowsData() {
    try {
      const data = fs.readFileSync(this.flowsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error loading flows data', { error: error.message });
      return {};
    }
  }

  saveFlowsData(data) {
    try {
      fs.writeFileSync(this.flowsFile, JSON.stringify(data, null, 2));
      logger.info('Flows data saved successfully');
    } catch (error) {
      logger.error('Error saving flows data', { error: error.message });
      throw error;
    }
  }

  // Get all flows
  getAllFlows() {
    try {
      const flows = this.loadFlowsData();
      const flowList = Object.values(flows).map(flow => ({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        lastUpdated: flow.lastUpdated,
        nodeCount: flow.nodes ? flow.nodes.length : 0,
        status: flow.status || 'draft'
      }));

      logger.info('Retrieved all flows', { count: flowList.length });
      return flowList;
    } catch (error) {
      logger.error('Error getting all flows', { error: error.message });
      return [];
    }
  }

  // Get specific flow by ID
  getFlow(flowId) {
    try {
      const flows = this.loadFlowsData();
      const flow = flows[flowId];
      
      if (!flow) {
        logger.warn('Flow not found', { flowId: flowId });
        return null;
      }

      logger.info('Flow retrieved', { flowId: flowId, name: flow.name });
      return flow;
    } catch (error) {
      logger.error('Error getting flow', { flowId: flowId, error: error.message });
      return null;
    }
  }

  // Save or update a flow
  saveFlow(flowData) {
    try {
      const flows = this.loadFlowsData();
      
      // Generate ID if new flow
      if (!flowData.id) {
        flowData.id = uuidv4();
        flowData.createdAt = new Date().toISOString();
      }

      // Update timestamps
      flowData.lastUpdated = new Date().toISOString();
      
      // Set default values
      if (!flowData.name) {
        flowData.name = `IVR Flow ${new Date().toLocaleDateString()}`;
      }
      if (!flowData.status) {
        flowData.status = 'draft';
      }

      // Save flow
      flows[flowData.id] = flowData;
      this.saveFlowsData(flows);

      logger.info('Flow saved successfully', { 
        flowId: flowData.id, 
        name: flowData.name,
        nodeCount: flowData.nodes ? flowData.nodes.length : 0
      });

      return {
        success: true,
        flowId: flowData.id,
        message: 'Flow saved successfully'
      };
    } catch (error) {
      logger.error('Error saving flow', { error: error.message });
      throw error;
    }
  }

  // Delete a flow
  deleteFlow(flowId) {
    try {
      const flows = this.loadFlowsData();
      
      if (!flows[flowId]) {
        logger.warn('Cannot delete - flow not found', { flowId: flowId });
        return { success: false, message: 'Flow not found' };
      }

      const flowName = flows[flowId].name;
      delete flows[flowId];
      this.saveFlowsData(flows);

      logger.info('Flow deleted successfully', { flowId: flowId, name: flowName });
      return { success: true, message: 'Flow deleted successfully' };
    } catch (error) {
      logger.error('Error deleting flow', { flowId: flowId, error: error.message });
      throw error;
    }
  }

  // Create a new empty flow
  createNewFlow(name, description) {
    try {
      const newFlow = {
        id: uuidv4(),
        name: name || `New IVR Flow ${new Date().toLocaleDateString()}`,
        description: description || '',
        nodes: [],
        connections: [],
        settings: {
          welcomeMessage: '',
          timeoutDuration: 5000,
          maxRetries: 3
        },
        status: 'draft',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      const flows = this.loadFlowsData();
      flows[newFlow.id] = newFlow;
      this.saveFlowsData(flows);

      logger.info('New flow created', { 
        flowId: newFlow.id, 
        name: newFlow.name 
      });

      return newFlow;
    } catch (error) {
      logger.error('Error creating new flow', { error: error.message });
      throw error;
    }
  }

  // Duplicate a flow
  duplicateFlow(flowId) {
    try {
      const originalFlow = this.getFlow(flowId);
      if (!originalFlow) {
        return { success: false, message: 'Original flow not found' };
      }

      const duplicatedFlow = {
        ...originalFlow,
        id: uuidv4(),
        name: `Copy of ${originalFlow.name}`,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      const flows = this.loadFlowsData();
      flows[duplicatedFlow.id] = duplicatedFlow;
      this.saveFlowsData(flows);

      logger.info('Flow duplicated', { 
        originalId: flowId, 
        newId: duplicatedFlow.id,
        name: duplicatedFlow.name
      });

      return { success: true, flow: duplicatedFlow };
    } catch (error) {
      logger.error('Error duplicating flow', { flowId: flowId, error: error.message });
      throw error;
    }
  }

  // Get flow statistics
  getStats() {
    try {
      const flows = this.loadFlowsData();
      const flowArray = Object.values(flows);
      
      const stats = {
        totalFlows: flowArray.length,
        draftFlows: flowArray.filter(f => f.status === 'draft').length,
        activeFlows: flowArray.filter(f => f.status === 'active').length,
        totalNodes: flowArray.reduce((sum, flow) => sum + (flow.nodes ? flow.nodes.length : 0), 0),
        lastActivity: flowArray.length > 0 
          ? Math.max(...flowArray.map(f => new Date(f.lastUpdated).getTime()))
          : null
      };

      logger.info('Flow statistics generated', stats);
      return stats;
    } catch (error) {
      logger.error('Error getting flow stats', { error: error.message });
      return {
        totalFlows: 0,
        draftFlows: 0,
        activeFlows: 0,
        totalNodes: 0,
        lastActivity: null
      };
    }
  }
}

// Create singleton instance
const flowCache = new FlowCache();

module.exports = flowCache;