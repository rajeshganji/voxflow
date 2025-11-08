// VoxFlow - Designer JavaScript
voxLogger.info('VoxFlow designer.js loaded');

let nodeCounter = 0;
let ws = null;
let draggedElement = null;
let currentFlow = null;
let flowId = null;

// Connection management
let connectionMode = {
    active: false,
    sourceConnector: null,
    tempLine: null
};

let connections = []; // Store all connections

// Get flowId from URL
const urlParams = new URLSearchParams(window.location.search);
flowId = urlParams.get('flowId');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    voxLogger.info('DOM loaded, initializing designer page');
    voxLogger.debug('Flow ID from URL:', flowId);
    
    initWebSocket();
    setupDragAndDrop();
    loadFlow();
    setupKeyboardShortcuts();
    setupPropertiesPanel();
    
    // Add global click listener for debugging and edit button handling
    document.addEventListener('click', function(e) {
        console.log('Global click on:', e.target.tagName, e.target.className, e.target.id);
        
        // Handle edit button clicks
        if (e.target.classList.contains('node-edit-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const nodeId = e.target.getAttribute('data-node-id');
            console.log('Edit button clicked for node:', nodeId);
            
            const node = document.getElementById(nodeId);
            if (node) {
                console.log('Found node, calling selectNode');
                selectNode(node);
            } else {
                console.error('Node not found:', nodeId);
            }
            return;
        }
        
        if (e.target.closest('.flow-node')) {
            console.log('Clicked inside a flow-node!', e.target.closest('.flow-node').id);
        }
    });
    
    // Remove the old global editNode function since we're using event delegation now
});

// Initialize WebSocket connection
function initWebSocket() {
    voxLogger.info('Initializing WebSocket connection');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    voxLogger.debug('WebSocket URL:', wsUrl);
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        voxLogger.info('WebSocket connected successfully');
        document.getElementById('wsStatus').textContent = '🟢 Connected';
        document.getElementById('wsStatus').className = 'ws-status connected';
    };
    
    ws.onclose = function() {
        voxLogger.warn('WebSocket disconnected - attempting reconnect in 3s');
        document.getElementById('wsStatus').textContent = '🔴 Disconnected';
        document.getElementById('wsStatus').className = 'ws-status disconnected';
        setTimeout(initWebSocket, 3000);
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        voxLogger.debug('WebSocket message received:', data);
    };
    
    ws.onerror = function(error) {
        voxLogger.error('WebSocket error occurred:', error);
    };
}

// Load flow data
async function loadFlow() {
    voxLogger.info('Loading flow data', { flowId: flowId });
    
    if (!flowId) {
        voxLogger.info('No flowId provided - creating new flow');
        currentFlow = {
            id: null,
            name: 'New IVR Flow',
            description: '',
            nodes: [],
            connections: []
        };
        setupNewFlow();
        return;
    }

    try {
        voxLogger.debug('Fetching flow from API:', flowId);
        const response = await fetch(`/api/designer/flow/${flowId}`);
        voxLogger.debug('Flow API response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        voxLogger.debug('Flow API response data:', data);

        if (data.success) {
            currentFlow = data.flow;
            voxLogger.info('Flow loaded successfully', { flowName: currentFlow.name, nodeCount: currentFlow.nodes?.length || 0 });
            setupExistingFlow();
        } else {
            voxLogger.error('Failed to load flow from API:', data.error);
            setupNewFlow();
        }
    } catch (error) {
        voxLogger.error('Error loading flow:', error);
        setupNewFlow();
    }
}

// Setup for new flow
function setupNewFlow() {
    console.log('Setting up new flow');
    document.getElementById('loadingIndicator').style.display = 'none';
    document.getElementById('dropZone').style.display = 'block';
    document.getElementById('flowInfo').textContent = 'New Flow - Not saved';
    document.getElementById('statusInfo').textContent = 'Ready - Create your first node';
}

// Setup for existing flow
function setupExistingFlow() {
    voxLogger.info('Setting up existing flow', { flowName: currentFlow.name, nodeCount: currentFlow.nodes?.length || 0 });
    document.getElementById('loadingIndicator').style.display = 'none';
    
    // Clear existing connections
    connections = [];
    
    // Update flow info
    document.getElementById('flowInfo').textContent = 
        `${currentFlow.name} - ${currentFlow.nodes?.length || 0} nodes`;
    
    // Render existing nodes
    if (currentFlow.nodes && currentFlow.nodes.length > 0) {
        voxLogger.debug('Rendering existing nodes', { nodeCount: currentFlow.nodes.length });
        currentFlow.nodes.forEach(nodeData => {
            createFlowNodeFromData(nodeData);
        });
        
        // Restore connections after nodes are created
        if (currentFlow.connections && currentFlow.connections.length > 0) {
            voxLogger.debug('Restoring connections', { connectionCount: currentFlow.connections.length });
            setTimeout(() => {
                restoreConnections(currentFlow.connections);
            }, 100); // Small delay to ensure nodes are fully rendered
        }
        
        document.getElementById('dropZone').style.display = 'none';
        document.getElementById('statusInfo').textContent = 
            `Loaded ${currentFlow.nodes.length} nodes, ${currentFlow.connections?.length || 0} connections`;
    } else {
        document.getElementById('dropZone').style.display = 'block';
        document.getElementById('statusInfo').textContent = 'Ready - Add nodes to your flow';
    }
}

// Create flow node from saved data
function createFlowNodeFromData(nodeData) {
    voxLogger.debug('Creating node from saved data', { 
        nodeId: nodeData.id, 
        nodeType: nodeData.type, 
        position: nodeData.position 
    });
    
    const node = document.createElement('div');
    node.className = 'flow-node';
    node.style.left = nodeData.position.x + 'px';
    node.style.top = nodeData.position.y + 'px';
    node.id = nodeData.id;
    node.dataset.nodeType = nodeData.type; // Important: Set the node type
    
    const nodeTypeData = getNodeData(nodeData.type);
    
    node.innerHTML = `
        <div class="node-header">
            <div class="node-icon">${nodeTypeData.icon}</div>
            <div class="node-title">${nodeData.data.label || nodeTypeData.name}</div>
            <button class="node-edit-btn" data-node-id="${nodeData.id}" title="Edit Properties">⚙️</button>
        </div>
        <div class="node-content">${nodeData.data.description || nodeTypeData.description}</div>
    `;
    
    // Restore custom data attributes from saved node data
    if (nodeData.data) {
        for (const [key, value] of Object.entries(nodeData.data)) {
            if (key !== 'label' && key !== 'description') {
                node.dataset[key] = value;
            }
        }
    }
    
    // Add connectors based on node type
    addConnectors(node, nodeData.type);
    
    // Add drag functionality
    addNodeDragHandler(node);
    
    document.getElementById('canvas').appendChild(node);
    nodeCounter++;
    
    // Add immediate click handler with high priority
    setTimeout(() => {
        node.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Direct click handler fired for restored node:', nodeData.id);
            selectNode(node);
        }, true); // Use capture phase to get priority
    }, 100);
    
    voxLogger.debug('Node created from saved data', { 
        nodeId: nodeData.id, 
        hasConnectors: node.querySelectorAll('[data-connector-type]').length > 0 
    });
}

// Restore connections from saved data
function restoreConnections(connectionData) {
    voxLogger.info('Restoring connections from saved data', { count: connectionData.length });
    
    connectionData.forEach((connData, index) => {
        try {
            // Find source and target nodes
            const sourceNode = document.getElementById(connData.sourceNodeId);
            const targetNode = document.getElementById(connData.targetNodeId);
            
            if (!sourceNode || !targetNode) {
                voxLogger.warn('Cannot restore connection - nodes not found', {
                    sourceNodeId: connData.sourceNodeId,
                    targetNodeId: connData.targetNodeId,
                    sourceFound: !!sourceNode,
                    targetFound: !!targetNode
                });
                return;
            }
            
            // Debug: Log all available connectors on source node
            const sourceConnectors = sourceNode.querySelectorAll('[data-connector-type]');
            const targetConnectors = targetNode.querySelectorAll('[data-connector-type]');
            
            voxLogger.debug('Available connectors for connection restoration', {
                sourceNodeId: connData.sourceNodeId,
                sourceConnectorTypes: Array.from(sourceConnectors).map(c => c.dataset.connectorType),
                targetNodeId: connData.targetNodeId,
                targetConnectorTypes: Array.from(targetConnectors).map(c => c.dataset.connectorType),
                lookingFor: {
                    source: connData.sourceConnectorType,
                    target: connData.targetConnectorType
                }
            });
            
            // Find source and target connectors
            const sourceConnector = sourceNode.querySelector(`[data-connector-type="${connData.sourceConnectorType}"]`);
            const targetConnector = targetNode.querySelector(`[data-connector-type="${connData.targetConnectorType}"]`);
            
            if (!sourceConnector || !targetConnector) {
                voxLogger.warn('Cannot restore connection - connectors not found', {
                    sourceConnectorType: connData.sourceConnectorType,
                    targetConnectorType: connData.targetConnectorType,
                    sourceConnectorFound: !!sourceConnector,
                    targetConnectorFound: !!targetConnector
                });
                return;
            }
            
            // Create the connection
            voxLogger.debug('Restoring connection', {
                connectionId: connData.id,
                sourceNode: connData.sourceNodeId,
                targetNode: connData.targetNodeId,
                type: connData.type
            });
            
            createConnection(sourceConnector, targetConnector);
            
        } catch (error) {
            voxLogger.error('Error restoring connection', {
                connectionIndex: index,
                connectionData: connData,
                error: error.message
            });
        }
    });
    
    voxLogger.info('Connection restoration completed', {
        attempted: connectionData.length,
        restored: connections.length
    });
}

// Setup drag and drop
function setupDragAndDrop() {
    voxLogger.info('Setting up drag and drop functionality');
    const nodeItems = document.querySelectorAll('.node-item');
    const canvas = document.getElementById('canvas');
    const dropZone = document.getElementById('dropZone');
    
    voxLogger.debug(`Found ${nodeItems.length} draggable node items`);
    
    // Add drag event listeners to node items
    nodeItems.forEach((item, index) => {
        const nodeType = item.dataset.type;
        voxLogger.debug(`Setting up drag for node type: ${nodeType}`);
        
        item.addEventListener('dragstart', function(e) {
            draggedElement = this;
            const nodeType = this.dataset.type;
            voxLogger.dragAction('DRAG_START', `node-template-${nodeType}`, {
                nodeType: nodeType,
                timestamp: Date.now()
            });
            e.dataTransfer.setData('text/plain', nodeType);
        });
        
        item.addEventListener('dragend', function(e) {
            voxLogger.dragAction('DRAG_END', `node-template-${nodeType}`);
            draggedElement = null;
        });
    });
    
    // Canvas drop events with detailed logging
    canvas.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.classList.add('active');
        // Log drag over canvas (throttled)
        if (!canvas._dragOverLogged || Date.now() - canvas._dragOverLogged > 100) {
            voxLogger.mouseAction('DRAG_OVER_CANVAS', 'canvas', {
                x: e.clientX,
                y: e.clientY
            });
            canvas._dragOverLogged = Date.now();
        }
    });
    
    canvas.addEventListener('dragleave', function(e) {
        if (!canvas.contains(e.relatedTarget)) {
            dropZone.classList.remove('active');
            voxLogger.canvasAction('DRAG_LEAVE_CANVAS');
        }
    });
    
    canvas.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('active');
        
        const nodeType = e.dataTransfer.getData('text/plain');
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - canvas.scrollLeft;
        const y = e.clientY - rect.top - canvas.scrollTop;
        
        voxLogger.canvasAction('NODE_DROPPED_ON_CANVAS', {
            nodeType: nodeType,
            position: { x: x, y: y },
            canvasRect: { width: rect.width, height: rect.height }
        });
        
        createFlowNode(nodeType, x, y);
        
        // Hide drop zone after first node
        const nodeCount = canvas.querySelectorAll('.flow-node').length;
        if (nodeCount > 0) {
            dropZone.style.display = 'none';
            voxLogger.canvasAction('DROP_ZONE_HIDDEN', { nodeCount: nodeCount });
        }
    });
}

// Create new flow node
function createFlowNode(type, x, y) {
    nodeCounter++;
    const nodeId = `node-${nodeCounter}`;
    
    voxLogger.nodeAction('CREATE_NODE_START', nodeId, {
        type: type,
        position: { x: x, y: y },
        nodeCounter: nodeCounter
    });
    
    const node = document.createElement('div');
    node.className = 'flow-node';
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    node.id = nodeId;
    node.dataset.nodeType = type;
    
    const nodeData = getNodeData(type);
    voxLogger.debug(`Node data for type ${type}:`, nodeData);
    
    node.innerHTML = `
        <div class="node-header">
            <div class="node-icon">${nodeData.icon}</div>
            <div class="node-title">${nodeData.name}</div>
            <button class="node-edit-btn" data-node-id="${nodeId}" title="Edit Properties">⚙️</button>
        </div>
        <div class="node-content">${nodeData.description}</div>
    `;
    
    voxLogger.debug(`Node HTML structure created for ${nodeId}`);
    
    // Add connectors based on node type
    addConnectors(node, type);
    
    // Add drag functionality
    addNodeDragHandler(node);
    
    document.getElementById('canvas').appendChild(node);
    
    // Add immediate click handler with high priority
    setTimeout(() => {
        node.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Direct click handler fired for:', nodeId);
            selectNode(node);
        }, true); // Use capture phase to get priority
    }, 100);
    
    const nodeCount = document.querySelectorAll('.flow-node').length;
    
    voxLogger.nodeAction('CREATE_NODE_COMPLETE', nodeId, {
        type: type,
        position: { x: x, y: y },
        totalNodes: nodeCount
    });
    
    // Update status
    document.getElementById('statusInfo').textContent = `${nodeCount} nodes in flow`;
}

// Add drag handler to a node
function addNodeDragHandler(node) {
    const nodeId = node.id;
    voxLogger.debug(`Adding drag handler to node ${nodeId}`);
    
    // Make the entire node draggable, but exclude connectors
    let isDragging = false;
    let startX, startY, nodeStartX, nodeStartY;
    let dragStarted = false;
    
    node.addEventListener('mousedown', function(e) {
        // Don't start drag if clicking on a connector
        if (e.target.classList.contains('connector')) {
            voxLogger.mouseAction('CLICKED_CONNECTOR_SKIP_DRAG', nodeId, {
                connectorType: e.target.dataset.connectorType
            });
            return;
        }
        
        // Don't start drag if clicking on connection lines
        if (e.target.tagName === 'path' || e.target.tagName === 'svg') {
            voxLogger.mouseAction('CLICKED_CONNECTION_SKIP_DRAG', nodeId);
            return;
        }
        
        voxLogger.dragAction('MOUSE_DOWN_ON_NODE', nodeId, {
            clientX: e.clientX,
            clientY: e.clientY,
            target: e.target.className
        });
        
        dragStarted = false;
        isDragging = false;
        startX = e.clientX;
        startY = e.clientY;
        nodeStartX = parseInt(node.style.left) || 0;
        nodeStartY = parseInt(node.style.top) || 0;
        
        function mouseMoveHandler(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (!dragStarted) {
                dragStarted = true;
                isDragging = true;
                
                voxLogger.dragAction('NODE_DRAG_START', nodeId, {
                    startPosition: { x: nodeStartX, y: nodeStartY },
                    mouseStart: { x: startX, y: startY }
                });
                
                // Change cursor to indicate dragging
                node.style.cursor = 'grabbing';
                document.body.style.cursor = 'grabbing';
                
                // Add visual feedback
                node.style.zIndex = '1000';
                node.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
            }
            
            if (isDragging) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                const newX = nodeStartX + deltaX;
                const newY = nodeStartY + deltaY;
                
                // Constrain to canvas bounds
                const canvas = document.getElementById('canvas');
                const canvasRect = canvas.getBoundingClientRect();
                
                const minX = 0;
                const minY = 0;
                const maxX = Math.max(0, canvasRect.width - 200); // Assume min node width
                const maxY = Math.max(0, canvasRect.height - 100); // Assume min node height
                
                const constrainedX = Math.max(minX, Math.min(maxX, newX));
                const constrainedY = Math.max(minY, Math.min(maxY, newY));
                
                node.style.left = constrainedX + 'px';
                node.style.top = constrainedY + 'px';
                
                // Log position changes (throttled)
                if (!node._lastMoveLog || Date.now() - node._lastMoveLog > 50) {
                    voxLogger.dragAction('NODE_POSITION_UPDATE', nodeId, {
                        position: { x: constrainedX, y: constrainedY },
                        delta: { x: deltaX, y: deltaY }
                    });
                    node._lastMoveLog = Date.now();
                }
                
                // Update connections in real-time
                updateAllConnections();
            }
        }
        
        function mouseUpHandler(e) {
            voxLogger.dragAction('MOUSE_UP_END_DRAG', nodeId);
            
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
            
            // Reset cursor and visual feedback
            node.style.cursor = 'move';
            document.body.style.cursor = 'default';
            node.style.zIndex = 'auto';
            node.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            
            if (isDragging) {
                const finalPosition = { 
                    x: parseInt(node.style.left), 
                    y: parseInt(node.style.top) 
                };
                
                voxLogger.nodeAction('NODE_DRAG_COMPLETE', nodeId, {
                    startPosition: { x: nodeStartX, y: nodeStartY },
                    endPosition: finalPosition,
                    totalDistance: Math.sqrt(
                        Math.pow(finalPosition.x - nodeStartX, 2) + 
                        Math.pow(finalPosition.y - nodeStartY, 2)
                    )
                });
                
                isDragging = false;
                dragStarted = false;
            } else if (!dragStarted) {
                // If not dragging, this was a click - select the node
                voxLogger.nodeAction('NODE_CLICKED_SELECTED', nodeId);
                selectNode(node);
            }
        }
        
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        
        e.preventDefault();
        e.stopPropagation();
    });
    
    // Set initial cursor
    node.style.cursor = 'move';
    
    // Prevent text selection on node
    node.addEventListener('selectstart', function(e) {
        e.preventDefault();
    });
    
    // Add click handler for node selection
    node.addEventListener('click', function(e) {
        console.log('Node click event fired for:', nodeId, 'target:', e.target.className);
        
        // Don't select node if clicking on connector
        if (e.target.classList.contains('connector')) {
            console.log('Clicked on connector, skipping selection');
            return;
        }
        
        console.log('Click valid, calling selectNode');
        e.stopPropagation();
        selectNode(node);
    });
    
    voxLogger.debug(`Drag handler setup complete for node ${nodeId}`);
}

// Get node data by type
function getNodeData(type) {
    const nodeTypes = {
        start: { name: 'Start', icon: '▶', description: 'Entry point' },
        play_audio: { name: 'Play Audio', icon: '🔊', description: 'Play message' },
        get_input: { name: 'Get Input', icon: '⌨️', description: 'Collect DTMF' },
        record: { name: 'Record', icon: '🎤', description: 'Record voice' },
        transfer: { name: 'Transfer', icon: '📞', description: 'Transfer call' },
        hangup: { name: 'Hangup', icon: '📵', description: 'End call' }
    };
    
    return nodeTypes[type] || { name: 'Unknown', icon: '?', description: 'Unknown node' };
}

// Add connectors to a node based on its type
function addConnectors(node, type) {
    const connectors = [];
    
    // Define connector configurations for each node type
    const connectorConfigs = {
        start: {
            outputs: [
                { type: 'next', label: 'Next', position: 'bottom-right' },
                { type: 'disconnect', label: 'Disconnect', position: 'bottom-left' }
            ]
        },
        play_audio: {
            inputs: [{ type: 'input', position: 'left' }],
            outputs: [
                { type: 'next', label: 'Next', position: 'bottom-right' },
                { type: 'disconnect', label: 'Disconnect', position: 'bottom-left' }
            ]
        },
        get_input: {
            inputs: [{ type: 'input', position: 'left' }],
            outputs: [
                { type: 'output', label: 'Success', position: 'right' },
                { type: 'disconnect', label: 'Timeout/Error', position: 'bottom-left' }
            ]
        },
        record: {
            inputs: [{ type: 'input', position: 'left' }],
            outputs: [
                { type: 'output', label: 'Recorded', position: 'right' },
                { type: 'disconnect', label: 'Error', position: 'bottom-left' }
            ]
        },
        transfer: {
            inputs: [{ type: 'input', position: 'left' }],
            outputs: [
                { type: 'disconnect', label: 'Transferred', position: 'bottom' }
            ]
        },
        hangup: {
            inputs: [{ type: 'input', position: 'left' }]
        }
    };
    
    const config = connectorConfigs[type];
    if (!config) return;
    
    // Add input connectors
    if (config.inputs) {
        config.inputs.forEach((connectorInfo, index) => {
            const connector = createConnector('input', connectorInfo.position, connectorInfo.label);
            node.appendChild(connector);
            addConnectorEvents(connector);
        });
    }
    
    // Add output connectors
    if (config.outputs) {
        config.outputs.forEach((connectorInfo, index) => {
            const connector = createConnector(connectorInfo.type, connectorInfo.position, connectorInfo.label);
            node.appendChild(connector);
            addConnectorEvents(connector);
        });
    }
}

// Create a connector element
function createConnector(type, position, label) {
    const connector = document.createElement('div');
    connector.className = `connector ${type}`;
    connector.dataset.connectorType = type;
    connector.dataset.label = label || type;
    connector.title = label || type;
    
    // Position the connector based on type and position
    switch (position) {
        case 'left':
            connector.classList.add('input');
            break;
        case 'right':
            connector.classList.add('output');
            break;
        case 'bottom-left':
            connector.classList.add('disconnect');
            break;
        case 'bottom-right':
            connector.classList.add('next');
            break;
        case 'bottom':
            connector.style.bottom = '-6px';
            connector.style.left = '50%';
            connector.style.transform = 'translateX(-50%)';
            break;
    }
    
    return connector;
}

// Add event handlers for connectors
function addConnectorEvents(connector) {
    const flowNode = connector.closest('.flow-node');
    if (!flowNode) {
        voxLogger.warn('Cannot setup connector events: connector not attached to flow node', {
            connectorType: connector.dataset.connectorType
        });
        return;
    }
    
    const nodeId = flowNode.id;
    const connectorType = connector.dataset.connectorType;
    
    voxLogger.connectorAction('SETUP_CONNECTOR_EVENTS', connectorType, nodeId, {
        position: connector.classList.contains('input') ? 'input' : 
                 connector.classList.contains('output') ? 'output' : 
                 connector.classList.contains('next') ? 'next' : 
                 connector.classList.contains('disconnect') ? 'disconnect' : 'unknown'
    });
    
    // Set higher z-index for connectors to ensure they're clickable
    connector.style.zIndex = '100';
    
    connector.addEventListener('mousedown', function(e) {
        e.stopPropagation(); // Prevent node drag from starting
        e.preventDefault();
        
        voxLogger.connectorAction('CONNECTOR_MOUSEDOWN', connectorType, nodeId, {
            clientX: e.clientX,
            clientY: e.clientY,
            connectionModeActive: connectionMode.active
        });
        
        startConnection(connector, e);
    });
    
    connector.addEventListener('mouseenter', function(e) {
        if (connectionMode.active && connectionMode.sourceConnector !== connector) {
            voxLogger.connectorAction('CONNECTOR_HIGHLIGHT_TARGET', connectorType, nodeId, {
                sourceConnector: connectionMode.sourceConnector?.dataset.connectorType,
                sourceNodeId: connectionMode.sourceConnector?.closest('.flow-node').id
            });
            
            // Highlight as potential target
            connector.style.background = '#ffeb3b';
            connector.style.borderColor = '#ff9800';
            connector.style.transform = connector.style.transform.replace('scale(1.3)', '') + ' scale(1.3)';
        } else if (!connectionMode.active) {
            voxLogger.mouseAction('CONNECTOR_HOVER', `${connectorType}-${nodeId}`);
        }
    });
    
    connector.addEventListener('mouseleave', function(e) {
        if (connectionMode.active && connectionMode.sourceConnector !== connector) {
            voxLogger.connectorAction('CONNECTOR_UNHIGHLIGHT', connectorType, nodeId);
            // Remove highlight
            resetConnectorStyle(connector);
        }
    });
    
    connector.addEventListener('mouseup', function(e) {
        if (connectionMode.active && connectionMode.sourceConnector !== connector) {
            e.stopPropagation();
            e.preventDefault();
            
            voxLogger.connectorAction('CONNECTOR_MOUSEUP_COMPLETE', connectorType, nodeId, {
                sourceConnector: connectionMode.sourceConnector?.dataset.connectorType,
                sourceNodeId: connectionMode.sourceConnector?.closest('.flow-node').id
            });
            
            completeConnection(connector);
        }
    });
    
    // Prevent connectors from interfering with text selection
    connector.addEventListener('selectstart', function(e) {
        e.preventDefault();
    });
}

// Reset connector style to default
function resetConnectorStyle(connector) {
    const type = connector.dataset.connectorType;
    switch (type) {
        case 'next':
            connector.style.background = '#4caf50';
            connector.style.borderColor = '#4caf50';
            break;
        case 'disconnect':
            connector.style.background = '#f44336';
            connector.style.borderColor = '#f44336';
            break;
        default:
            connector.style.background = '#fff';
            connector.style.borderColor = '#2196f3';
            break;
    }
}

// Select node
function selectNode(node) {
    voxLogger.nodeAction('SELECT_NODE', node.id, { 
        nodeType: node.dataset.nodeType,
        position: { x: node.style.left, y: node.style.top }
    });
    
    console.log('selectNode called for:', node.id, 'type:', node.dataset.nodeType);
    
    // Remove selection from other nodes
    document.querySelectorAll('.flow-node').forEach(n => n.classList.remove('selected'));
    
    // Select this node
    node.classList.add('selected');
    
    console.log('Node selected, calling showNodeProperties...');
    
    // Show properties panel
    showNodeProperties(node);
}

// Show node properties panel
function showNodeProperties(node) {
    console.log('showNodeProperties called for node:', node.id);
    
    const panel = document.getElementById('propertiesPanel');
    const nodeTypeBadge = document.getElementById('nodeTypeBadge');
    const nodeIdInfo = document.getElementById('nodeIdInfo');
    const nodeLabel = document.getElementById('nodeLabel');
    const nodeDescription = document.getElementById('nodeDescription');
    const nodeSpecificFields = document.getElementById('nodeSpecificFields');
    
    console.log('Panel elements found:', {
        panel: !!panel,
        nodeTypeBadge: !!nodeTypeBadge,
        nodeIdInfo: !!nodeIdInfo,
        nodeLabel: !!nodeLabel,
        nodeDescription: !!nodeDescription,
        nodeSpecificFields: !!nodeSpecificFields
    });
    
    if (!panel) {
        console.error('Properties panel not found!');
        return;
    }
    
    voxLogger.nodeAction('SHOW_PROPERTIES', node.id, {
        nodeType: node.dataset.nodeType
    });
    
    // Get node data
    const nodeType = node.dataset.nodeType;
    const nodeId = node.id;
    const label = node.querySelector('.node-title')?.textContent || '';
    const description = node.querySelector('.node-content')?.textContent || '';
    
    console.log('Node data:', { nodeType, nodeId, label, description });
    
    // Update panel content
    if (nodeTypeBadge) nodeTypeBadge.textContent = nodeType.toUpperCase();
    if (nodeIdInfo) nodeIdInfo.textContent = `Node ID: ${nodeId}`;
    if (nodeLabel) nodeLabel.value = label;
    if (nodeDescription) nodeDescription.value = description;
    
    // Clear previous specific fields
    if (nodeSpecificFields) {
        nodeSpecificFields.innerHTML = '';
        console.log('Cleared previous specific fields');
    }
    
    // Add node-specific fields based on type
    addNodeSpecificFields(nodeType, nodeSpecificFields, node);
    
    // Store current node reference
    panel.dataset.currentNodeId = nodeId;
    
    console.log('About to show panel, current classes:', panel.className);
    
    // Show panel
    panel.classList.add('active');
    
    console.log('Panel should be visible now, classes:', panel.className);
}

// Add node-specific fields based on node type
function addNodeSpecificFields(nodeType, container, node) {
    switch(nodeType) {
        case 'transfer':
            addField(container, 'transferNumber', 'text', 'Transfer Number', node.dataset.transferNumber || '');
            addField(container, 'timeout', 'number', 'Timeout (seconds)', node.dataset.timeout || '30');
            break;
            
        case 'play_audio':
            addField(container, 'audioUrl', 'text', 'Audio URL', node.dataset.audioUrl || '');
            addField(container, 'audioText', 'textarea', 'Audio Text (TTS)', node.dataset.audioText || '');
            break;
            
        case 'record':
            addField(container, 'maxDuration', 'number', 'Max Duration (seconds)', node.dataset.maxDuration || '60');
            addField(container, 'beep', 'checkbox', 'Play Beep Before Recording', node.dataset.beep === 'true');
            break;
            
        case 'get_input':
            addField(container, 'maxDigits', 'number', 'Max Digits', node.dataset.maxDigits || '1');
            addField(container, 'timeout', 'number', 'Timeout (seconds)', node.dataset.timeout || '10');
            addField(container, 'validDigits', 'text', 'Valid Digits', node.dataset.validDigits || '0123456789#*');
            break;
            
        case 'conditional':
            addField(container, 'condition', 'text', 'Condition', node.dataset.condition || '');
            addField(container, 'variable', 'text', 'Variable', node.dataset.variable || '');
            break;
            
        // Add more node types as needed
        default:
            // No specific fields for this node type
            break;
    }
}

// Helper function to add form fields
function addField(container, fieldName, fieldType, labelText, defaultValue = '') {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    const label = document.createElement('label');
    label.className = 'form-label';
    label.setAttribute('for', fieldName);
    label.textContent = labelText;
    
    let input;
    if (fieldType === 'textarea') {
        input = document.createElement('textarea');
        input.className = 'form-textarea';
        input.value = defaultValue;
    } else if (fieldType === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = defaultValue === true || defaultValue === 'true';
    } else {
        input = document.createElement('input');
        input.type = fieldType;
        input.className = 'form-input';
        input.value = defaultValue;
    }
    
    input.id = fieldName;
    input.name = fieldName;
    
    formGroup.appendChild(label);
    formGroup.appendChild(input);
    container.appendChild(formGroup);
}

// Hide node properties panel
function hideNodeProperties() {
    const panel = document.getElementById('propertiesPanel');
    panel.classList.remove('active');
    panel.dataset.currentNodeId = '';
    
    // Clear selection
    document.querySelectorAll('.flow-node.selected').forEach(n => {
        n.classList.remove('selected');
    });
    
    voxLogger.nodeAction('HIDE_PROPERTIES');
}

// Save node properties
function saveNodeProperties() {
    const panel = document.getElementById('propertiesPanel');
    const nodeId = panel.dataset.currentNodeId;
    
    if (!nodeId) {
        voxLogger.warn('Cannot save node properties: no node selected');
        return;
    }
    
    const node = document.getElementById(nodeId);
    if (!node) {
        voxLogger.error('Cannot save node properties: node not found', { nodeId });
        return;
    }
    
    voxLogger.nodeAction('SAVE_PROPERTIES_START', nodeId);
    
    const nodeLabel = document.getElementById('nodeLabel').value;
    const nodeDescription = document.getElementById('nodeDescription').value;
    
    // Update basic node properties
    const titleElement = node.querySelector('.node-title');
    const contentElement = node.querySelector('.node-content');
    
    if (titleElement) titleElement.textContent = nodeLabel;
    if (contentElement) contentElement.textContent = nodeDescription;
    
    // Save node-specific properties
    const nodeType = node.dataset.nodeType;
    const specificFields = document.getElementById('nodeSpecificFields');
    
    // Save all specific field values as data attributes
    const inputs = specificFields.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        if (input.type === 'checkbox') {
            node.dataset[input.name] = input.checked.toString();
        } else {
            node.dataset[input.name] = input.value;
        }
    });
    
    voxLogger.nodeAction('SAVE_PROPERTIES_COMPLETE', nodeId, {
        nodeType: nodeType,
        label: nodeLabel,
        description: nodeDescription,
        dataAttributes: Object.keys(node.dataset)
    });
    
    // Show success feedback
    const saveBtn = document.getElementById('saveNodeBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saved!';
    saveBtn.style.background = '#4caf50';
    
    setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.background = '';
    }, 1500);
    
    // Auto-save the flow
    if (typeof saveFlow === 'function') {
        setTimeout(() => {
            saveFlow().catch(err => {
                voxLogger.error('Auto-save failed after property update', { error: err.message });
            });
        }, 500);
    }
}

// Setup properties panel event listeners
function setupPropertiesPanel() {
    voxLogger.info('Setting up properties panel event listeners');
    
    const closeBtn = document.getElementById('closeProperties');
    const saveBtn = document.getElementById('saveNodeBtn');
    
    // Close properties panel
    closeBtn?.addEventListener('click', hideNodeProperties);
    
    // Save node properties
    saveBtn?.addEventListener('click', saveNodeProperties);
    
    // Click outside canvas to hide properties
    document.getElementById('canvas')?.addEventListener('click', function(e) {
        // Only hide if clicking on canvas itself, not on nodes
        if (e.target.id === 'canvas') {
            hideNodeProperties();
        }
    });
    
    voxLogger.debug('Properties panel event listeners setup complete');
}

// Clear canvas
function clearCanvas() {
    if (!confirm('Are you sure you want to clear all nodes?')) return;
    
    console.log('Clearing canvas');
    const canvas = document.getElementById('canvas');
    const nodes = canvas.querySelectorAll('.flow-node');
    nodes.forEach(node => node.remove());
    
    document.getElementById('dropZone').style.display = 'block';
    document.getElementById('statusInfo').textContent = 'Canvas cleared';
    nodeCounter = 0;
}

// Save flow
async function saveFlow() {
    voxLogger.info('Initiating flow save operation');
    const nodes = [];
    document.querySelectorAll('.flow-node').forEach(node => {
        // Collect all data attributes (node-specific properties)
        const nodeData = {
            label: node.querySelector('.node-title').textContent,
            description: node.querySelector('.node-content').textContent
        };
        
        // Add all custom data attributes
        for (const [key, value] of Object.entries(node.dataset)) {
            if (key !== 'nodeType') {  // Skip nodeType as it's stored separately
                nodeData[key] = value;
            }
        }
        
        nodes.push({
            id: node.id,
            type: node.dataset.nodeType || node.querySelector('.node-title').textContent.toLowerCase().replace(/ /g, '_'),
            position: { 
                x: parseInt(node.style.left) || 0, 
                y: parseInt(node.style.top) || 0
            },
            data: nodeData
        });
    });
    
    // Convert connections to serializable format
    const connectionData = connections.map(conn => ({
        id: conn.id,
        sourceNodeId: conn.source.closest('.flow-node').id,
        targetNodeId: conn.target.closest('.flow-node').id,
        sourceConnectorType: conn.source.dataset.connectorType,
        targetConnectorType: conn.target.dataset.connectorType,
        type: conn.source.dataset.connectorType // next, disconnect, output, etc.
    }));
    
    const flowData = {
        id: currentFlow ? currentFlow.id : null,
        name: currentFlow ? currentFlow.name : 'New IVR Flow',
        description: currentFlow ? currentFlow.description : '',
        nodes: nodes,
        connections: connectionData,
        metadata: {
            version: '1.0',
            created: currentFlow ? currentFlow.created : new Date().toISOString(),
            lastModified: new Date().toISOString(),
            nodeCount: nodes.length,
            connectionCount: connectionData.length
        }
    };
    
    voxLogger.info('Flow data prepared for save', { 
        flowId: flowData.id,
        nodeCount: nodes.length,
        connectionCount: connectionData.length
    });
    
    try {
        document.getElementById('statusInfo').textContent = 'Saving...';
        
        voxLogger.debug('Sending save request to API');
        const response = await fetch('/api/designer/flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flowData })
        });
        
        voxLogger.debug('Save API response received', { status: response.status });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        voxLogger.debug('Save API response data', data);
        
        if (data.success) {
            // Update current flow reference
            currentFlow = flowData;
            currentFlow.id = data.flowId;
            
            voxLogger.info('Flow saved successfully', { 
                flowId: data.flowId,
                nodeCount: nodes.length,
                connectionCount: connectionData.length
            });
            
            document.getElementById('statusInfo').textContent = 'Flow saved successfully';
            document.getElementById('flowInfo').textContent = 
                `${currentFlow.name} - ${nodes.length} nodes - Saved`;
        } else {
            throw new Error(data.message || 'Save failed');
        }
    } catch (error) {
        voxLogger.error('Flow save failed', { error: error.message });
        document.getElementById('statusInfo').textContent = 'Save failed: ' + error.message;
        throw error;
    }
}

// Update all connection lines when nodes are moved
function updateAllConnections() {
    connections.forEach(connection => {
        updateConnectionPath(connection);
    });
}

// Connection management functions
function startConnection(sourceConnector, event) {
    const sourceNodeId = sourceConnector.closest('.flow-node').id;
    
    voxLogger.connectionAction('START_CONNECTION', sourceConnector.dataset.connectorType, {
        sourceNodeId: sourceNodeId,
        eventPosition: {
            clientX: event.clientX,
            clientY: event.clientY
        }
    });
    
    connectionMode.active = true;
    connectionMode.sourceConnector = sourceConnector;
    
    // Create temporary connection line
    const canvas = document.getElementById('canvas');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '15';
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#2196f3');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '5,5');
    
    svg.appendChild(path);
    canvas.appendChild(svg);
    
    connectionMode.tempLine = { svg, path };
    
    voxLogger.connectionAction('TEMP_LINE_CREATED', sourceConnector.dataset.connectorType, {
        sourceNodeId: sourceNodeId
    });
    
    // Add mousemove listener to update temporary line
    document.addEventListener('mousemove', updateTempConnection);
    document.addEventListener('mouseup', cancelConnection);
    
    // Highlight source connector
    sourceConnector.style.background = '#ffeb3b';
    sourceConnector.style.borderColor = '#ff9800';
    
    voxLogger.connectorAction('CONNECTOR_HIGHLIGHTED_SOURCE', sourceConnector.dataset.connectorType, sourceNodeId);
}

function updateTempConnection(event) {
    if (!connectionMode.active || !connectionMode.tempLine) return;
    
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const sourceRect = connectionMode.sourceConnector.getBoundingClientRect();
    
    const startX = sourceRect.left + sourceRect.width / 2 - canvasRect.left;
    const startY = sourceRect.top + sourceRect.height / 2 - canvasRect.top;
    const endX = event.clientX - canvasRect.left;
    const endY = event.clientY - canvasRect.top;
    
    voxLogger.mouseAction('TEMP_CONNECTION_UPDATE', 'canvas', {
        source: { x: startX, y: startY },
        target: { x: endX, y: endY },
        sourceConnector: connectionMode.sourceConnector.dataset.connectorType
    });
    
    const pathData = createCurvePath(startX, startY, endX, endY);
    connectionMode.tempLine.path.setAttribute('d', pathData);
}

function completeConnection(targetConnector) {
    const sourceConnector = connectionMode.sourceConnector;
    const sourceNodeId = sourceConnector.closest('.flow-node').id;
    const targetNodeId = targetConnector.closest('.flow-node').id;
    
    voxLogger.connectionAction('COMPLETE_CONNECTION', targetConnector.dataset.connectorType, {
        sourceNodeId: sourceNodeId,
        targetNodeId: targetNodeId,
        sourceConnector: sourceConnector.dataset.connectorType,
        targetConnector: targetConnector.dataset.connectorType
    });
    
    // Validate connection (output to input, etc.)
    if (validateConnection(sourceConnector, targetConnector)) {
        createConnection(sourceConnector, targetConnector);
        voxLogger.connectionAction('CONNECTION_VALIDATED_AND_CREATED', 'success', {
            sourceNodeId: sourceNodeId,
            targetNodeId: targetNodeId
        });
    } else {
        voxLogger.warn('Invalid connection attempt blocked', {
            source: { type: sourceConnector.dataset.connectorType, nodeId: sourceNodeId },
            target: { type: targetConnector.dataset.connectorType, nodeId: targetNodeId }
        });
    }
    
    cancelConnection();
}

function cancelConnection() {
    voxLogger.connectionAction('CANCEL_CONNECTION', connectionMode.sourceConnector?.dataset.connectorType || 'none');
    
    if (connectionMode.tempLine) {
        voxLogger.connectionAction('REMOVE_TEMP_LINE');
        connectionMode.tempLine.svg.remove();
    }
    
    if (connectionMode.sourceConnector) {
        voxLogger.connectorAction('RESET_CONNECTOR_STYLE', 
            connectionMode.sourceConnector.dataset.connectorType,
            connectionMode.sourceConnector.closest('.flow-node').id
        );
        resetConnectorStyle(connectionMode.sourceConnector);
    }
    
    connectionMode.active = false;
    connectionMode.sourceConnector = null;
    connectionMode.tempLine = null;
    
    document.removeEventListener('mousemove', updateTempConnection);
    document.removeEventListener('mouseup', cancelConnection);
    
    voxLogger.debug('Connection mode cancelled and cleaned up');
}

function validateConnection(sourceConnector, targetConnector) {
    const sourceType = sourceConnector.dataset.connectorType;
    const targetType = targetConnector.dataset.connectorType;
    const sourceNode = sourceConnector.closest('.flow-node');
    const targetNode = targetConnector.closest('.flow-node');
    
    voxLogger.connectionAction('VALIDATE_CONNECTION', 'check', {
        sourceType: sourceType,
        targetType: targetType,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        sameNode: sourceNode === targetNode
    });
    
    // Can't connect to same node
    if (sourceNode === targetNode) {
        voxLogger.warn('Connection validation failed: Cannot connect to same node', {
            sourceNodeId: sourceNode.id
        });
        return false;
    }
    
    // Can't connect input to input or output to output
    if (sourceType === 'input' || targetType === 'output' || 
        targetType === 'next' || targetType === 'disconnect') {
        voxLogger.warn('Connection validation failed: Invalid connector combination', {
            sourceType: sourceType,
            targetType: targetType
        });
        return false;
    }
    
    // Check if connection already exists
    const existingConnection = connections.find(conn => 
        conn.source === sourceConnector && conn.target === targetConnector
    );
    
    if (existingConnection) {
        voxLogger.warn('Connection validation failed: Connection already exists', {
            existingConnectionId: existingConnection.id
        });
        return false;
    }
    
    voxLogger.connectionAction('CONNECTION_VALIDATION_SUCCESS', 'valid', {
        sourceType: sourceType,
        targetType: targetType,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id
    });
    
    return true;
}

function createConnection(sourceConnector, targetConnector) {
    const sourceNodeId = sourceConnector.closest('.flow-node').id;
    const targetNodeId = targetConnector.closest('.flow-node').id;
    const sourceType = sourceConnector.dataset.connectorType;
    
    voxLogger.connectionAction('CREATE_CONNECTION', 'permanent', {
        sourceNodeId: sourceNodeId,
        targetNodeId: targetNodeId,
        sourceConnector: sourceType,
        targetConnector: targetConnector.dataset.connectorType
    });
    
    const canvas = document.getElementById('canvas');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.className = 'connection-line';
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '5';
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    
    // Set color based on connection type
    if (sourceType === 'next') {
        path.setAttribute('stroke', '#4caf50');
        svg.classList.add('next');
        voxLogger.connectionAction('CONNECTION_COLOR_SET', 'next-green', { sourceNodeId, targetNodeId });
    } else if (sourceType === 'disconnect') {
        path.setAttribute('stroke', '#f44336');
        svg.classList.add('disconnect');
        voxLogger.connectionAction('CONNECTION_COLOR_SET', 'disconnect-red', { sourceNodeId, targetNodeId });
    } else {
        path.setAttribute('stroke', '#2196f3');
        voxLogger.connectionAction('CONNECTION_COLOR_SET', 'output-blue', { sourceNodeId, targetNodeId });
    }
    
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    
    svg.appendChild(path);
    canvas.appendChild(svg);
    
    // Store connection data
    const connection = {
        id: `connection-${connections.length}`,
        source: sourceConnector,
        target: targetConnector,
        svg: svg,
        path: path
    };
    
    connections.push(connection);
    
    // Make connection selectable
    makeConnectionSelectable(connection);
    
    // Update connection path
    updateConnectionPath(connection);
    
    console.log('Connection created:', connection.id);
}

function updateConnectionPath(connection) {
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const sourceRect = connection.source.getBoundingClientRect();
    const targetRect = connection.target.getBoundingClientRect();
    
    const startX = sourceRect.left + sourceRect.width / 2 - canvasRect.left;
    const startY = sourceRect.top + sourceRect.height / 2 - canvasRect.top;
    const endX = targetRect.left + targetRect.width / 2 - canvasRect.left;
    const endY = targetRect.top + targetRect.height / 2 - canvasRect.top;
    
    const pathData = createCurvePath(startX, startY, endX, endY);
    connection.path.setAttribute('d', pathData);
}

function createCurvePath(startX, startY, endX, endY) {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    const curvature = Math.min(distance / 3, 100);
    
    const cp1X = startX + curvature;
    const cp1Y = startY;
    const cp2X = endX - curvature;
    const cp2Y = endY;
    
    return `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(event) {
        // Only handle shortcuts when focus is on the canvas or design area
        // Don't interfere with system shortcuts or input fields
        if (document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA' ||
            event.target.tagName === 'INPUT' ||
            event.target.tagName === 'TEXTAREA') {
            return; // Let input fields handle their own keyboard events
        }
        
        // Delete selected node or connections with Delete key (not Backspace to avoid browser back)
        if (event.key === 'Delete') {
            event.preventDefault();
            
            const selectedNode = document.querySelector('.flow-node.selected');
            if (selectedNode) {
                deleteNode(selectedNode);
            }
        }
        
        // Clear canvas with Ctrl+Shift+Delete (changed from Ctrl+Shift+C)
        if (event.ctrlKey && event.shiftKey && event.key === 'Delete') {
            event.preventDefault();
            clearCanvas();
        }
        
        // Save with Ctrl+S (only if not in input field)
        if (event.ctrlKey && event.key === 's' && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            saveFlow();
        }
        
        // Escape to cancel connection mode
        if (event.key === 'Escape' && connectionMode.active) {
            event.preventDefault();
            cancelConnection();
        }
        
        // Don't handle any other Ctrl+C or system shortcuts
        if (event.ctrlKey && event.key === 'c') {
            return; // Let system handle Ctrl+C
        }
    });
}

// Delete a node and its connections
function deleteNode(node) {
    if (!confirm('Delete this node and all its connections?')) {
        return;
    }
    
    const nodeId = node.id;
    console.log('Deleting node:', nodeId);
    
    // Remove all connections associated with this node
    const nodeConnectors = node.querySelectorAll('.connector');
    const connectionsToRemove = [];
    
    connections.forEach((connection, index) => {
        if (nodeConnectors.includes(connection.source) || 
            nodeConnectors.includes(connection.target)) {
            connectionsToRemove.push(index);
        }
    });
    
    // Remove connections in reverse order to maintain indices
    connectionsToRemove.reverse().forEach(index => {
        connections[index].svg.remove();
        connections.splice(index, 1);
    });
    
    // Remove the node
    node.remove();
    
    // Update status
    const nodeCount = document.querySelectorAll('.flow-node').length;
    document.getElementById('statusInfo').textContent = `${nodeCount} nodes in flow`;
    
    // Show drop zone if no nodes left
    if (nodeCount === 0) {
        document.getElementById('dropZone').style.display = 'block';
    }
}

// Add connection selection (for future deletion)
function makeConnectionSelectable(connection) {
    connection.svg.style.pointerEvents = 'stroke';
    connection.svg.style.cursor = 'pointer';
    
    connection.svg.addEventListener('click', function(event) {
        event.stopPropagation();
        selectConnection(connection);
    });
}

function selectConnection(connection) {
    // Deselect all other connections
    connections.forEach(conn => {
        conn.path.setAttribute('stroke-width', '2');
        conn.svg.classList.remove('selected');
    });
    
    // Select this connection
    connection.path.setAttribute('stroke-width', '4');
    connection.svg.classList.add('selected');
    
    // Deselect any selected nodes
    document.querySelectorAll('.flow-node.selected').forEach(node => {
        node.classList.remove('selected');
    });
}