/**
 * Simple Console Logger for VoxFlow
 * Lightweight logging for Railway deployment - no file writing
 */

class VoxLogger {
    constructor() {
        this.colors = {
            ERROR: '\x1b[31m', // Red
            WARN: '\x1b[33m',  // Yellow
            INFO: '\x1b[36m',  // Cyan
            DEBUG: '\x1b[35m', // Magenta
            RESET: '\x1b[0m'
        };
    }

    formatMessage(level, component, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const color = this.colors[level] || '';
        const reset = this.colors.RESET;
        
        const baseInfo = `${timestamp} [${level}] [${component}]`;
        const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
        
        return `${color}${baseInfo} ${message}${reset} ${metaStr}`;
    }

    log(level, component, message, meta = {}) {
        console.log(this.formatMessage(level, component, message, meta));
    }

    // Convenience methods
    error(component, message, meta = {}) {
        this.log('ERROR', component, message, meta);
    }

    warn(component, message, meta = {}) {
        this.log('WARN', component, message, meta);
    }

    info(component, message, meta = {}) {
        this.log('INFO', component, message, meta);
    }

    debug(component, message, meta = {}) {
        this.log('DEBUG', component, message, meta);
    }

    // IVR Flow tracking
    ivrRequest(sid, event, data, requestParams = {}) {
        console.log(`🔄 [IVR-REQUEST] SID:${sid} Event:${event} Data:${data}`, JSON.stringify(this.sanitizeParams(requestParams)));
    }

    ivrResponse(sid, event, responseXml, processingTime = 0) {
        console.log(`✅ [IVR-RESPONSE] SID:${sid} Event:${event} Time:${processingTime}ms`);
        console.log(`📄 [XML-RESPONSE]`, this.formatXml(responseXml));
    }

    // WebSocket connection tracking
    wsConnection(eventType, connectionId, meta = {}) {
        console.log(`🔌 [WEBSOCKET-${eventType.toUpperCase()}] ID:${connectionId}`, JSON.stringify(meta));
    }

    // API call tracking
    apiCall(method, endpoint, params = {}, responseData = {}, statusCode = 200, duration = 0) {
        console.log(`🌐 [API] ${method} ${endpoint} ${statusCode} (${duration}ms)`, JSON.stringify(this.sanitizeParams(params)));
    }

    // Audio processing tracking
    audioProcessing(operation, sid, meta = {}) {
        console.log(`🎵 [AUDIO-${operation.toUpperCase()}] SID:${sid}`, JSON.stringify(meta));
    }

    // Performance tracking
    performance(component, operation, duration, meta = {}) {
        console.log(`⏱️  [PERFORMANCE] ${component}-${operation}: ${duration}ms`, JSON.stringify(meta));
    }

    // Flow state tracking
    flowState(sid, currentState, nextState, trigger, meta = {}) {
        console.log(`🔀 [FLOW] SID:${sid} ${currentState} → ${nextState} (${trigger})`, JSON.stringify(meta));
    }

    // Request cycle tracking
    requestCycle(phase, requestId, meta = {}) {
        console.log(`📨 [REQUEST-${phase}] ID:${requestId}`, JSON.stringify(meta));
    }

    // Session tracking
    sessionTracking(action, sessionId, type, meta = {}) {
        console.log(`👤 [SESSION-${action.toUpperCase()}] ${type} ID:${sessionId}`, JSON.stringify(meta));
    }

    // Utility methods
    sanitizeParams(params) {
        if (!params || typeof params !== 'object') return params;
        
        const sanitized = { ...params };
        const sensitiveKeys = ['password', 'token', 'api_key', 'secret', 'auth'];
        
        for (const key in sanitized) {
            if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                sanitized[key] = '***REDACTED***';
            }
        }
        
        return sanitized;
    }

    formatXml(xml) {
        if (typeof xml !== 'string') return xml;
        
        // Basic XML formatting for better readability
        return xml
            .replace(/></g, '>\n<')
            .replace(/^\s*\n/gm, '')
            .trim();
    }
}

// Create singleton instance
const logger = new VoxLogger();

module.exports = logger;

module.exports = logger;