/**
 * Monitoring and Logging Routes
 * Provides real-time access to application logs and metrics
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const router = express.Router();

// Get recent logs
router.get('/logs', (req, res) => {
    try {
        const logType = req.query.type || 'combined';
        const lines = parseInt(req.query.lines) || 100;
        const component = req.query.component;
        
        logger.info('Log retrieval request', {
            component: 'Monitoring',
            logType,
            lines,
            filterComponent: component,
            requestedBy: req.ip
        });

        const logsDir = path.join(__dirname, '../logs');
        const today = new Date().toISOString().split('T')[0];
        let logFile;
        
        if (component) {
            logFile = path.join(logsDir, `${component.toLowerCase()}-${today}.log`);
        } else {
            logFile = path.join(logsDir, `${logType}.log`);
        }

        if (!fs.existsSync(logFile)) {
            return res.json({
                error: 'Log file not found',
                file: logFile,
                availableFiles: fs.readdirSync(logsDir).filter(f => f.endsWith('.log'))
            });
        }

        const logContent = fs.readFileSync(logFile, 'utf8');
        const logLines = logContent.trim().split('\n').slice(-lines);
        
        const parsedLogs = logLines.map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return { rawLine: line };
            }
        }).filter(log => log);

        res.json({
            logFile,
            totalLines: logLines.length,
            logs: parsedLogs,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error retrieving logs', {
            component: 'Monitoring',
            error: error.message,
            stack: error.stack
        });
        
        res.status(500).json({
            error: 'Failed to retrieve logs',
            message: error.message
        });
    }
});

// Get log files list
router.get('/logs/files', (req, res) => {
    try {
        const logsDir = path.join(__dirname, '../logs');
        
        if (!fs.existsSync(logsDir)) {
            return res.json({ files: [] });
        }

        const files = fs.readdirSync(logsDir)
            .filter(file => file.endsWith('.log'))
            .map(file => {
                const filePath = path.join(logsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: stats.size,
                    modified: stats.mtime,
                    created: stats.birthtime
                };
            })
            .sort((a, b) => b.modified - a.modified);

        res.json({ files });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to list log files',
            message: error.message
        });
    }
});

// Real-time log streaming endpoint
router.get('/logs/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const logType = req.query.type || 'combined';
    const logsDir = path.join(__dirname, '../logs');
    const logFile = path.join(logsDir, `${logType}.log`);

    logger.info('Log streaming started', {
        component: 'Monitoring',
        logFile,
        clientIP: req.ip
    });

    let lastPosition = 0;

    const checkForNewLogs = () => {
        if (fs.existsSync(logFile)) {
            const stats = fs.statSync(logFile);
            if (stats.size > lastPosition) {
                const stream = fs.createReadStream(logFile, {
                    start: lastPosition,
                    encoding: 'utf8'
                });
                
                stream.on('data', (chunk) => {
                    res.write(chunk);
                });
                
                stream.on('end', () => {
                    lastPosition = stats.size;
                });
            }
        }
    };

    // Check for new logs every second
    const interval = setInterval(checkForNewLogs, 1000);

    // Clean up when client disconnects
    req.on('close', () => {
        clearInterval(interval);
        logger.info('Log streaming ended', {
            component: 'Monitoring',
            clientIP: req.ip
        });
    });

    // Send initial logs
    checkForNewLogs();
});

// Get system metrics and status
router.get('/metrics', (req, res) => {
    try {
        const logsDir = path.join(__dirname, '../logs');
        const today = new Date().toISOString().split('T')[0];
        
        // Count log entries by level
        const logCounts = {
            error: 0,
            warn: 0,
            info: 0,
            debug: 0
        };

        const combinedLogFile = path.join(logsDir, 'combined.log');
        if (fs.existsSync(combinedLogFile)) {
            const logContent = fs.readFileSync(combinedLogFile, 'utf8');
            const lines = logContent.trim().split('\n');
            
            lines.forEach(line => {
                try {
                    const logEntry = JSON.parse(line);
                    if (logEntry.level && logCounts.hasOwnProperty(logEntry.level)) {
                        logCounts[logEntry.level]++;
                    }
                } catch {}
            });
        }

        const metrics = {
            timestamp: new Date().toISOString(),
            server: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                version: process.version,
                platform: process.platform
            },
            logs: logCounts,
            environment: {
                nodeEnv: process.env.NODE_ENV,
                port: process.env.PORT,
                hasOpenAI: !!process.env.OPENAI_API_KEY,
                hasElevenLabs: !!process.env.ELEVENLABS_API_KEY
            }
        };

        res.json(metrics);

    } catch (error) {
        res.status(500).json({
            error: 'Failed to retrieve metrics',
            message: error.message
        });
    }
});

// Real-time monitoring dashboard
router.get('/dashboard', (req, res) => {
    const dashboardHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>VoxFlow Monitoring Dashboard</title>
        <style>
            body { font-family: monospace; background: #1a1a1a; color: #00ff00; padding: 20px; }
            .container { max-width: 1200px; margin: 0 auto; }
            .section { background: #2a2a2a; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .logs { height: 400px; overflow-y: auto; background: #000; padding: 10px; border-radius: 3px; }
            .log-line { padding: 2px 0; border-bottom: 1px solid #333; }
            .error { color: #ff4444; }
            .warn { color: #ffaa00; }
            .info { color: #00aa00; }
            .debug { color: #aaaaaa; }
            .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
            .metric { background: #333; padding: 10px; border-radius: 3px; text-align: center; }
            button { background: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 3px; cursor: pointer; margin: 5px; }
            button:hover { background: #45a049; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 VoxFlow Real-time Monitoring Dashboard</h1>
            
            <div class="section">
                <h2>System Metrics</h2>
                <div id="metrics" class="metrics">Loading...</div>
            </div>
            
            <div class="section">
                <h2>Real-time Logs</h2>
                <div>
                    <button onclick="clearLogs()">Clear</button>
                    <button onclick="toggleAutoScroll()">Auto Scroll: ON</button>
                </div>
                <div id="logs" class="logs"></div>
            </div>
        </div>

        <script>
            let autoScroll = true;
            let logContainer = document.getElementById('logs');
            
            // Fetch metrics every 5 seconds
            function updateMetrics() {
                fetch('/api/monitoring/metrics')
                    .then(r => r.json())
                    .then(data => {
                        const metrics = document.getElementById('metrics');
                        metrics.innerHTML = \`
                            <div class="metric">
                                <h3>Uptime</h3>
                                <p>\${Math.floor(data.server.uptime / 3600)}h \${Math.floor((data.server.uptime % 3600) / 60)}m</p>
                            </div>
                            <div class="metric">
                                <h3>Memory</h3>
                                <p>\${Math.round(data.server.memory.used / 1024 / 1024)}MB</p>
                            </div>
                            <div class="metric">
                                <h3>Environment</h3>
                                <p>\${data.environment.nodeEnv}</p>
                            </div>
                            <div class="metric">
                                <h3>Error Count</h3>
                                <p>\${data.logs.error}</p>
                            </div>
                            <div class="metric">
                                <h3>Info Count</h3>
                                <p>\${data.logs.info}</p>
                            </div>
                        \`;
                    });
            }
            
            // Stream logs
            function startLogStream() {
                const eventSource = new EventSource('/api/monitoring/logs/stream');
                eventSource.onmessage = function(event) {
                    try {
                        const logData = JSON.parse(event.data);
                        addLogLine(logData);
                    } catch (e) {
                        addLogLine({ level: 'info', message: event.data, timestamp: new Date().toISOString() });
                    }
                };
            }
            
            function addLogLine(logData) {
                const line = document.createElement('div');
                line.className = \`log-line \${logData.level}\`;
                line.innerHTML = \`[\${logData.timestamp}] \${logData.level.toUpperCase()}: \${logData.message}\`;
                logContainer.appendChild(line);
                
                if (autoScroll) {
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
                
                // Keep only last 1000 lines
                while (logContainer.children.length > 1000) {
                    logContainer.removeChild(logContainer.firstChild);
                }
            }
            
            function clearLogs() {
                logContainer.innerHTML = '';
            }
            
            function toggleAutoScroll() {
                autoScroll = !autoScroll;
                event.target.textContent = 'Auto Scroll: ' + (autoScroll ? 'ON' : 'OFF');
            }
            
            // Initialize
            updateMetrics();
            setInterval(updateMetrics, 5000);
            startLogStream();
        </script>
    </body>
    </html>
    `;
    
    res.send(dashboardHTML);
});

module.exports = router;