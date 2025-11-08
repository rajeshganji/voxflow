const express = require('express');
const { IVRFlow, Response, CollectDtmf } = require('../ivr');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Main IVR Flow Handler
 * Processes incoming KooKoo requests and returns XML responses
 */
router.all('/', (req, res) => {
    const startTime = Date.now();
    
    try {
        // Extract parameters from query string or body
        const params = {
            sid: req.query.sid || req.body?.sid || '',
            event: req.query.event || req.body?.event || '',
            data: req.query.data || req.body?.data || '',
            called_number: req.query.called_number || req.body?.called_number || '',
            caller_id: req.query.caller_id || req.body?.caller_id || '',
            phone_no: req.query.phone_no || req.body?.phone_no || ''
        };

        console.log(`📞 [IVR-REQUEST] SID:${params.sid} Event:${params.event} Data:${params.data} From:${params.caller_id}`);

        logger.info('[IVR] Processing flow request', {
            component: 'IVRRoutes',
            sid: params.sid,
            event: params.event,
            data: params.data,
            caller_id: params.caller_id,
            called_number: params.called_number
        });

        // Create and process IVR flow
        const ivrFlow = new IVRFlow(params);
        const response = ivrFlow.processFlow();

        // Log the XML response for debugging
        const xmlResponse = response.getXML();
        const processingTime = Date.now() - startTime;
        
        console.log(`✅ [IVR-RESPONSE] SID:${params.sid} Time:${processingTime}ms`);
        console.log(`📄 [XML-RESPONSE]\n${xmlResponse}`);
        
        logger.ivrResponse(params.sid, params.event, xmlResponse, processingTime);

        // Send XML response
        console.log(`📤 [IVR-SEND] SID:${params.sid} Sending XML response`);
        
        response.send(res);

    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        console.error(`❌ [IVR-ERROR] ${error.message} (${processingTime}ms)`);
        
        logger.error('[IVR] Error processing flow', {
            component: 'IVRRoutes',
            error: error.message,
            stack: error.stack,
            params: req.query,
            body: req.body,
            processingTimeMs: processingTime
        });

        // Send error response
        const errorResponse = new Response();
        errorResponse.addPlayText('Sorry, an error occurred. Please try again later.', 3);
        errorResponse.addHangup();
        
        const errorXml = errorResponse.getXML();
        console.log(`📄 [ERROR-XML]\n${errorXml}`);
        
        errorResponse.send(res);
    }
});

/**
 * Custom IVR Flow Handler
 * Allows for custom flow processing with additional parameters
 */
router.post('/custom', (req, res) => {
    try {
        const { 
            sid, 
            event, 
            data, 
            flow_type = 'default',
            department,
            priority = 'normal',
            language = 'en'
        } = req.body;

        logger.info('[IVR] Processing custom flow', {
            sid, 
            event, 
            data, 
            flow_type, 
            department, 
            priority,
            language
        });

        const ivrFlow = new IVRFlow({ sid, event, data });
        
        // Handle custom flow types
        switch (flow_type) {
            case 'emergency':
                ivrFlow.handleEmergencyCall();
                break;
                
            case 'callback':
                ivrFlow.handleCallbackScheduling();
                break;
                
            case 'business_hours':
                ivrFlow.handleBusinessHours();
                break;
                
            case 'department':
                if (department) {
                    ivrFlow.handleDepartmentRouting(department, data);
                } else {
                    ivrFlow.handleWelcomeMenu();
                }
                break;
                
            default:
                ivrFlow.processFlow();
        }

        const response = ivrFlow.response;
        const xmlResponse = response.getXML();
        
        logger.info('[IVR] Generated custom XML response', {
            sid,
            flow_type,
            xml: xmlResponse
        });

        response.send(res);

    } catch (error) {
        logger.error('[IVR] Error processing custom flow', {
            error: error.message,
            stack: error.stack,
            body: req.body
        });

        const errorResponse = new Response();
        errorResponse.addPlayText('Sorry, an error occurred in custom flow. Please try again.', 3);
        errorResponse.addHangup();
        errorResponse.send(res);
    }
});

/**
 * Test IVR Response Generator
 * For testing different IVR components
 */
router.get('/test/:component', (req, res) => {
    try {
        const { component } = req.params;
        const { sid = 'test_' + Date.now() } = req.query;
        
        const response = new Response(sid);
        
        switch (component) {
            case 'welcome':
                response.addPlayText('Welcome to VoxFlow IVR Test. This is a test message.', 3);
                break;
                
            case 'menu':
                const dtmf = new CollectDtmf(1, '#', 5000);
                dtmf.addPlayText('Test Menu: Press 1 for Sales, Press 2 for Support, Press 0 for Operator.', 3);
                response.addCollectDtmf(dtmf);
                break;
                
            case 'stream':
                response.addPlayText('Starting test stream connection.', 3);
                response.addStream('520228', 'ws://localhost:8080/ws', 'true');
                break;
                
            case 'dial':
                response.addPlayText('Test dial functionality.', 3);
                response.addDial('1234567890', { 
                    record: 'true', 
                    timeout: '30' 
                });
                break;
                
            case 'hangup':
                response.addPlayText('Test completed. Goodbye.', 3);
                response.addHangup();
                break;
                
            default:
                response.addPlayText('Unknown test component. Available: welcome, menu, stream, dial, hangup.', 3);
        }
        
        logger.info('[IVR] Generated test response', {
            component,
            sid,
            xml: response.getXML()
        });
        
        response.send(res);
        
    } catch (error) {
        logger.error('[IVR] Error in test endpoint', {
            error: error.message,
            component: req.params.component
        });
        
        res.status(500).json({
            error: 'Test failed',
            message: error.message
        });
    }
});

/**
 * IVR Status and Configuration
 */
router.get('/status', (req, res) => {
    try {
        const status = {
            service: 'VoxFlow IVR Flow',
            version: '1.0.0',
            status: 'active',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            websocket_url: process.env.STREAM_WS_URL || 'ws://localhost:8080/ws',
            components: {
                Response: 'available',
                CollectDtmf: 'available', 
                IVRFlow: 'available'
            },
            endpoints: {
                main_flow: '/api/ivrflow/',
                custom_flow: '/api/ivrflow/custom',
                test: '/api/ivrflow/test/:component',
                status: '/api/ivrflow/status'
            },
            features: {
                kookoo_compatible: true,
                xml_responses: true,
                websocket_streaming: true,
                ai_integration: true,
                dtmf_collection: true,
                audio_playback: true,
                call_recording: true
            }
        };
        
        res.json(status);
        
    } catch (error) {
        logger.error('[IVR] Error getting status', { error: error.message });
        res.status(500).json({
            error: 'Failed to get IVR status',
            message: error.message
        });
    }
});

/**
 * IVR Flow Analytics
 */
router.get('/analytics', (req, res) => {
    try {
        // This would typically connect to a database or analytics service
        const analytics = {
            total_calls: 0,
            successful_flows: 0,
            failed_flows: 0,
            average_duration: 0,
            most_used_features: [],
            error_rate: 0,
            last_updated: new Date().toISOString(),
            note: 'Analytics feature placeholder - connect to your analytics service'
        };
        
        res.json(analytics);
        
    } catch (error) {
        logger.error('[IVR] Error getting analytics', { error: error.message });
        res.status(500).json({
            error: 'Failed to get IVR analytics',
            message: error.message
        });
    }
});

module.exports = router;