// VoxFlow - Flows Management JavaScript
console.log('VoxFlow flows.js loaded');

let allFlows = [];
let ws = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing flows page');
    initWebSocket();
    loadFlows();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    console.log('Setting up event listeners');
    
    // New flow button - find by ID
    const newFlowBtn = document.getElementById('newFlowBtn');
    if (newFlowBtn) {
        newFlowBtn.addEventListener('click', showNewFlowModal);
        console.log('New flow button listener attached');
    }
    
    // Refresh button - find by ID
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshFlows);
        console.log('Refresh button listener attached');
    }
    
    // Search box
    const searchBox = document.getElementById('searchBox');
    if (searchBox) {
        searchBox.addEventListener('input', filterFlows);
        console.log('Search box listener attached');
    }
    
    // Modal close button
    const modalCancelBtn = document.getElementById('cancelBtn');
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', hideNewFlowModal);
        console.log('Modal cancel button listener attached');
    }
    
    // Modal create button
    const modalCreateBtn = document.getElementById('createFlowBtn');
    if (modalCreateBtn) {
        modalCreateBtn.addEventListener('click', createNewFlow);
        console.log('Modal create button listener attached');
    }
    
    // Modal X close button
    const modalCloseBtn = document.querySelector('.modal .close');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', hideNewFlowModal);
        console.log('Modal X close button listener attached');
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('newFlowModal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                hideNewFlowModal();
            }
        });
        console.log('Modal outside click listener attached');
    }
}

// WebSocket connection
function initWebSocket() {
    console.log('Initializing WebSocket connection');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log('WebSocket URL:', wsUrl);
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('WebSocket connected');
        document.getElementById('wsStatus').textContent = '🟢 Connected';
        document.getElementById('wsStatus').className = 'ws-status connected';
    };
    
    ws.onclose = function() {
        console.log('WebSocket disconnected');
        document.getElementById('wsStatus').textContent = '🔴 Disconnected';
        document.getElementById('wsStatus').className = 'ws-status disconnected';
        setTimeout(initWebSocket, 3000);
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

// Load flows from API
async function loadFlows() {
    console.log('Loading flows from API...');
    try {
        const response = await fetch('/api/designer/flows');
        console.log('API Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API Response data:', data);
        
        if (data.success) {
            allFlows = data.flows;
            console.log('Loaded flows:', allFlows.length);
            updateStatistics(data.statistics);
            renderFlowsTable(allFlows);
        } else {
            console.error('API returned success: false');
            showError('Failed to load flows: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error loading flows:', error);
        showError('Error loading flows: ' + error.message);
    }
}

// Update statistics cards
function updateStatistics(stats) {
    console.log('Updating statistics:', stats);
    document.getElementById('totalFlows').textContent = stats.totalFlows;
    document.getElementById('activeFlows').textContent = stats.activeFlows;
    document.getElementById('draftFlows').textContent = stats.draftFlows;
    document.getElementById('totalNodes').textContent = stats.totalNodes;
}

// Render flows table
function renderFlowsTable(flows) {
    console.log('Rendering flows table with', flows.length, 'flows');
    const content = document.getElementById('flowsContent');
    
    if (flows.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <h3>No IVR Flows Yet</h3>
                <p>Create your first IVR flow to get started</p>
                <button class="btn btn-primary create-first-flow" style="margin-top: 16px;">
                    ➕ Create First Flow
                </button>
            </div>
        `;
        
        // Add event listener for create first flow button
        const createFirstBtn = content.querySelector('.create-first-flow');
        if (createFirstBtn) {
            createFirstBtn.addEventListener('click', showNewFlowModal);
        }
        return;
    }
    
    const table = `
        <table class="flows-table">
            <thead>
                <tr>
                    <th>Flow Name</th>
                    <th>Nodes</th>
                    <th>Status</th>
                    <th>Last Updated</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${flows.map((flow, index) => `
                    <tr>
                        <td>
                            <div class="flow-name" data-flow-id="${flow.id}" data-action="open">
                                ${flow.name}
                            </div>
                            ${flow.description ? `<div class="flow-description">${flow.description}</div>` : ''}
                        </td>
                        <td>${flow.nodeCount}</td>
                        <td>
                            <span class="status-badge status-${flow.status}">
                                ${flow.status}
                            </span>
                        </td>
                        <td>${formatDate(flow.lastUpdated)}</td>
                        <td>
                            <div class="flow-actions">
                                <button class="action-btn" data-flow-id="${flow.id}" data-action="edit" title="Edit">
                                    ✏️
                                </button>
                                <button class="action-btn" data-flow-id="${flow.id}" data-action="duplicate" title="Duplicate">
                                    📋
                                </button>
                                <button class="action-btn delete" data-flow-id="${flow.id}" data-action="delete" title="Delete">
                                    🗑️
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    content.innerHTML = table;
    
    // Add event listeners for all flow actions
    setupFlowActionListeners();
}

// Setup event listeners for flow actions
function setupFlowActionListeners() {
    console.log('Setting up flow action listeners');
    
    // Flow name click handlers
    const flowNames = document.querySelectorAll('.flow-name[data-action="open"]');
    flowNames.forEach(element => {
        element.addEventListener('click', function() {
            const flowId = this.getAttribute('data-flow-id');
            openFlow(flowId);
        });
    });
    
    // Action button handlers
    const actionButtons = document.querySelectorAll('.action-btn[data-flow-id]');
    actionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const flowId = this.getAttribute('data-flow-id');
            const action = this.getAttribute('data-action');
            
            switch(action) {
                case 'edit':
                    openFlow(flowId);
                    break;
                case 'duplicate':
                    duplicateFlow(flowId);
                    break;
                case 'delete':
                    deleteFlow(flowId);
                    break;
            }
        });
    });
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return 'Today';
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}

// Filter flows based on search
function filterFlows() {
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
    console.log('Filtering flows with term:', searchTerm);
    const filteredFlows = allFlows.filter(flow => 
        flow.name.toLowerCase().includes(searchTerm) ||
        (flow.description && flow.description.toLowerCase().includes(searchTerm))
    );
    renderFlowsTable(filteredFlows);
}

// Open flow in designer
function openFlow(flowId) {
    console.log('Opening flow:', flowId);
    window.location.href = `/designer.html?flowId=${flowId}`;
}

// Show new flow modal
function showNewFlowModal() {
    console.log('Showing new flow modal');
    document.getElementById('newFlowModal').style.display = 'block';
    document.getElementById('flowName').value = '';
    document.getElementById('flowDescription').value = '';
    document.getElementById('flowName').focus();
}

// Hide new flow modal
function hideNewFlowModal() {
    console.log('Hiding new flow modal');
    document.getElementById('newFlowModal').style.display = 'none';
}

// Create new flow
async function createNewFlow() {
    const name = document.getElementById('flowName').value.trim();
    const description = document.getElementById('flowDescription').value.trim();
    
    console.log('Creating new flow:', { name, description });
    
    if (!name) {
        alert('Please enter a flow name');
        return;
    }
    
    try {
        const response = await fetch('/api/designer/flow/new', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        
        console.log('Create flow response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Create flow response:', data);
        
        if (data.success) {
            hideNewFlowModal();
            window.location.href = `/designer.html?flowId=${data.flow.id}`;
        } else {
            alert('Failed to create flow: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating flow:', error);
        alert('Error creating flow: ' + error.message);
    }
}

// Duplicate flow
async function duplicateFlow(flowId) {
    if (!confirm('Create a copy of this flow?')) return;
    
    console.log('Duplicating flow:', flowId);
    
    try {
        const response = await fetch(`/api/designer/flow/${flowId}/duplicate`, {
            method: 'POST'
        });
        
        console.log('Duplicate flow response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Duplicate flow response:', data);
        
        if (data.success) {
            await loadFlows(); // Refresh the list
            alert('Flow duplicated successfully!');
        } else {
            alert('Failed to duplicate flow: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error duplicating flow:', error);
        alert('Error duplicating flow: ' + error.message);
    }
}

// Delete flow
async function deleteFlow(flowId) {
    if (!confirm('Are you sure you want to delete this flow? This action cannot be undone.')) return;
    
    console.log('Deleting flow:', flowId);
    
    try {
        const response = await fetch(`/api/designer/flow/${flowId}`, {
            method: 'DELETE'
        });
        
        console.log('Delete flow response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Delete flow response:', data);
        
        if (data.success) {
            await loadFlows(); // Refresh the list
            alert('Flow deleted successfully!');
        } else {
            alert('Failed to delete flow: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting flow:', error);
        alert('Error deleting flow: ' + error.message);
    }
}

// Refresh flows
function refreshFlows() {
    console.log('Refreshing flows');
    loadFlows();
}

// Show error message
function showError(message) {
    console.error('Showing error:', message);
    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <h3>Error Loading Flows</h3>
            <p>${message}</p>
            <button class="btn btn-primary error-retry" style="margin-top: 16px;">
                🔄 Try Again
            </button>
        </div>
    `;
    
    document.getElementById('flowsContent').innerHTML = '';
    document.getElementById('flowsContent').appendChild(errorDiv);
    
    // Add event listener for retry button
    const retryBtn = errorDiv.querySelector('.error-retry');
    if (retryBtn) {
        retryBtn.addEventListener('click', loadFlows);
    }
}