// VoxFlow Client-Side Logger
// Enhanced console logging with filename, line numbers, and log levels for designer actions

class VoxFlowClientLogger {
    constructor() {
        this.logLevel = 'DEBUG'; // DEBUG, INFO, WARN, ERROR
        this.logLevels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
    }

    setLogLevel(level) {
        this.logLevel = level.toUpperCase();
        console.log(`[CLIENT-LOGGER] Log level set to: ${this.logLevel}`);
    }

    getCallerInfo() {
        const stack = new Error().stack;
        const stackLines = stack.split('\n');
        // Get the caller (skip this function and the log function)
        const callerLine = stackLines[3] || stackLines[2] || '';
        
        // Extract filename and line number
        const match = callerLine.match(/\/([^\/]+\.js):(\d+):\d+/);
        if (match) {
            return {
                filename: match[1],
                line: match[2]
            };
        }
        
        // Fallback for different stack formats
        const simpleMatch = callerLine.match(/([^\/\\]+\.js):(\d+)/);
        if (simpleMatch) {
            return {
                filename: simpleMatch[1],
                line: simpleMatch[2]
            };
        }
        
        return {
            filename: 'browser',
            line: '?'
        };
    }

    shouldLog(level) {
        return this.logLevels[level] >= this.logLevels[this.logLevel];
    }

    formatMessage(level, message) {
        const caller = this.getCallerInfo();
        const timestamp = new Date().toISOString().substr(11, 12); // HH:MM:SS.sss
        return `[${timestamp}][${level}][${caller.filename}:${caller.line}] ${message}`;
    }

    debug(message, data = null) {
        if (!this.shouldLog('DEBUG')) return;
        
        const formattedMessage = this.formatMessage('DEBUG', message);
        if (data) {
            console.log(formattedMessage, data);
        } else {
            console.log(formattedMessage);
        }
    }

    info(message, data = null) {
        if (!this.shouldLog('INFO')) return;
        
        const formattedMessage = this.formatMessage('INFO', message);
        if (data) {
            console.log(formattedMessage, data);
        } else {
            console.log(formattedMessage);
        }
    }

    warn(message, data = null) {
        if (!this.shouldLog('WARN')) return;
        
        const formattedMessage = this.formatMessage('WARN', message);
        if (data) {
            console.warn(formattedMessage, data);
        } else {
            console.warn(formattedMessage);
        }
    }

    error(message, data = null) {
        if (!this.shouldLog('ERROR')) return;
        
        const formattedMessage = this.formatMessage('ERROR', message);
        if (data) {
            console.error(formattedMessage, data);
        } else {
            console.error(formattedMessage);
        }
    }

    // Special methods for designer actions
    nodeAction(action, nodeId, details = null) {
        this.debug(`NODE_ACTION: ${action} - Node(${nodeId})`, details);
    }

    connectionAction(action, sourceId, targetId, details = null) {
        this.debug(`CONNECTION_ACTION: ${action} - ${sourceId} -> ${targetId}`, details);
    }

    dragAction(action, elementId, position = null) {
        this.debug(`DRAG_ACTION: ${action} - Element(${elementId})`, position);
    }

    mouseAction(action, element, coordinates = null) {
        this.debug(`MOUSE_ACTION: ${action} - ${element}`, coordinates);
    }

    canvasAction(action, details = null) {
        this.debug(`CANVAS_ACTION: ${action}`, details);
    }

    connectorAction(action, connectorType, nodeId, details = null) {
        this.debug(`CONNECTOR_ACTION: ${action} - ${connectorType} on Node(${nodeId})`, details);
    }
}

// Create and export global logger instance
const voxLogger = new VoxFlowClientLogger();

// Log initialization
voxLogger.info('VoxFlow Client Logger initialized');

// Export for use in other files
if (typeof window !== 'undefined') {
    window.voxLogger = voxLogger;
}