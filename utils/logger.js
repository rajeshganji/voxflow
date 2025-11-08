const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'voxflow' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({ filename: 'logs/combined.log' }),
    // IVR specific logs
    new winston.transports.File({ filename: 'logs/ivr-flow.log', level: 'info' }),
    // WebSocket logs
    new winston.transports.File({ filename: 'logs/websocket.log', level: 'debug' }),
    // API logs
    new winston.transports.File({ filename: 'logs/api.log', level: 'info' }),
  ],
});

// If we're not in production then log to the `console` with colorized format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${
          Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
        }`;
      })
    )
  }));
}

// Enhanced logging methods for comprehensive tracking
logger.ivrRequest = function(sid, event, data, requestParams = {}) {
  this.info('IVR Request received', {
    component: 'IVR',
    type: 'REQUEST',
    sid,
    event,
    data,
    requestParams: sanitizeParams(requestParams),
    timestamp: new Date().toISOString()
  });
};

logger.ivrResponse = function(sid, event, responseXml, processingTime = 0) {
  this.info('IVR Response generated', {
    component: 'IVR',
    type: 'RESPONSE',
    sid,
    event,
    responseXml: formatXml(responseXml),
    processingTimeMs: processingTime,
    timestamp: new Date().toISOString()
  });
};

logger.wsConnection = function(eventType, connectionId, meta = {}) {
  this.info(`WebSocket ${eventType}`, {
    component: 'WEBSOCKET',
    type: eventType.toUpperCase(),
    connectionId,
    ...meta,
    timestamp: new Date().toISOString()
  });
};

logger.apiCall = function(method, endpoint, params = {}, responseData = {}, statusCode = 200, duration = 0) {
  this.info(`API Call: ${method} ${endpoint}`, {
    component: 'API',
    method,
    endpoint,
    params: sanitizeParams(params),
    response: responseData,
    statusCode,
    durationMs: duration,
    timestamp: new Date().toISOString()
  });
};

logger.audioProcessing = function(operation, sid, meta = {}) {
  this.info(`Audio processing: ${operation}`, {
    component: 'AUDIO',
    operation,
    sid,
    ...meta,
    timestamp: new Date().toISOString()
  });
};

logger.performance = function(component, operation, duration, meta = {}) {
  this.info(`Performance: ${component} - ${operation}`, {
    component: 'PERFORMANCE',
    operationComponent: component,
    operation,
    durationMs: duration,
    ...meta,
    timestamp: new Date().toISOString()
  });
};

logger.flowState = function(sid, currentState, nextState, trigger, meta = {}) {
  this.debug(`Flow state transition: ${currentState} -> ${nextState}`, {
    component: 'FLOW',
    sid,
    currentState,
    nextState,
    trigger,
    ...meta,
    timestamp: new Date().toISOString()
  });
};

logger.requestCycle = function(phase, requestId, meta = {}) {
  this.debug(`Request cycle: ${phase}`, {
    component: 'REQUEST',
    phase,
    requestId,
    ...meta,
    timestamp: new Date().toISOString()
  });
};

logger.sessionTracking = function(action, sessionId, type, meta = {}) {
  this.info(`Session ${action}: ${type}`, {
    component: 'SESSION',
    action,
    sessionId,
    type,
    ...meta,
    timestamp: new Date().toISOString()
  });
};

// Utility functions
function sanitizeParams(params) {
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

function formatXml(xml) {
  if (typeof xml !== 'string') return xml;
  
  // Basic XML formatting for better readability
  return xml
    .replace(/></g, '>\n<')
    .replace(/^\s*\n/gm, '')
    .trim();
}

module.exports = logger;