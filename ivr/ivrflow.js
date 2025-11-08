const Response = require('./response');
const CollectDtmf = require('./collect-dtmf');

class IVRFlow {
    constructor(params = {}) {
        this.sid = params.sid || '';
        this.event = params.event || '';
        this.data = params.data || '';
        this.response = new Response(this.sid);
        
        // Dynamic WebSocket URL based on environment
        this.wsUrl = this.getWebSocketUrl();
    }

    /**
     * Get the appropriate WebSocket URL based on environment
     * @returns {string} WebSocket URL
     */
    getWebSocketUrl() {
        return "ws://voxflow-production.up.railway.app/ws";
        // For production deployment at realway.com
        if (process.env.NODE_ENV === 'production') {
            // Check if running on Railway or other cloud platform
            if (process.env.RAILWAY_PUBLIC_DOMAIN) {
                return `wss://${process.env.RAILWAY_PUBLIC_DOMAIN}/ws`;
            }
            
            // For realway.com production deployment
            const defaultPort = process.env.PORT || 8080;
            const voxflowUrl = process.env.VOXFLOW_URL || `http://localhost:${defaultPort}`;
            return voxflowUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
        }
        
        // For development
        return (
          process.env.STREAM_WS_URL ||
          "ws://voxflow-production.up.railway.app/ws"
        );
    }

    /**
     * Process the IVR flow based on the event
     * @returns {Response} KooKoo response object
     */
    processFlow() {
        try {
            switch (this.event) {
                case '':
                case 'NewCall':
                    this.handleWelcomeMenu();
                    break;
                    
                case 'GotDTMF':
                    this.handleDtmfInput();
                    break;
                    
                case 'Hangup':
                case 'Disconnect':
                    console.log('[IVR] Call ended - SID:', this.sid);
                    this.response.addHangup();
                    break;
                    
                default:
                    console.log('[IVR] Unhandled event:', this.event);
                    this.handleWelcomeMenu();
            }
        } catch (error) {
            console.error('[IVR] Error in flow processing:', error);
            this.handleError(error);
        }

        return this.response;
    }

    /**
     * Handle welcome message and main menu
     */
    handleWelcomeMenu() {
        this.response.addPlayText('Welcome to VoxFlow AI Agent Portal. Please say how can I help you', 3);
    
        // Initialize WebSocket streaming for AI processing
        console.log('[IVR] Starting AI stream with URL:', this.wsUrl);
        this.response.addStream("520228", this.wsUrl, "true");
        
        // Alternative: Show menu for department selection (uncomment to use)
        // const dtmf = new CollectDtmf(1, '#', 5000);
        // dtmf.addPlayText('For Sales, press 1. For Support, press 2. For Billing, press 3. For all other inquiries, press 0.', 3);
        // this.response.addCollectDtmf(dtmf);
    }

    /**
     * Handle DTMF input and route to appropriate department
     */
    handleDtmfInput() {
        console.log('[IVR] Received DTMF:', this.data);
        
        const routingMap = {
            1: {
                department: "Sales",
                number: "1234567890",
                message: "Connecting you to our Sales department for product inquiries and quotes."
            },
            2: {
                department: "Support",
                number: "9491593431",
                message: "Connecting you to our Technical Support team for assistance."
            },
            3: {
                department: "Billing",
                number: "5555555555",
                message: "Connecting you to our Billing department for account and payment inquiries."
            },
            0: {
                department: "Customer Service",
                number: "9985392390",
                message: "Connecting you to our Customer Service team for general assistance."
            }
        };

        const selection = routingMap[this.data];
        
        if (selection) {
            this.response.addPlayText(selection.message, 3);
            
            // Use WebSocket streaming for AI-powered conversation
            console.log('[IVR] Routing to', selection.department, 'via AI stream:', this.wsUrl);
            this.response.addStream(selection.number, this.wsUrl, 'true');
        } else {
            this.response.addPlayText('Invalid selection. Please try again.', 3);
            this.handleWelcomeMenu();
        }
    }

    /**
     * Handle specific department routing with AI assistance
     */
    handleDepartmentRouting(department, phoneNumber) {
        this.response.addPlayText(`You will now be connected to ${department} with AI assistance.`, 3);
        
        // Set context for AI processing
        const contextualWsUrl = `${this.wsUrl}?department=${encodeURIComponent(department)}&phone=${phoneNumber}`;
        this.response.addStream(phoneNumber, contextualWsUrl, 'true');
    }

    /**
     * Handle emergency or priority calls
     */
    handleEmergencyCall() {
        this.response.addPlayText('This is an emergency priority call. Connecting you immediately to our senior support team.', 3);
        
        // Direct connection with high priority flag
        const emergencyWsUrl = `${this.wsUrl}?priority=high&emergency=true`;
        this.response.addStream("911", emergencyWsUrl, 'true');
    }

    /**
     * Handle business hours routing
     */
    handleBusinessHours() {
        const currentHour = new Date().getHours();
        const isBusinessHours = currentHour >= 9 && currentHour <= 17; // 9 AM to 5 PM
        
        if (isBusinessHours) {
            this.response.addPlayText('Our team is available now. Connecting you to our AI assistant.', 3);
            this.response.addStream("520228", this.wsUrl, 'true');
        } else {
            this.response.addPlayText('We are currently outside business hours. Your call will be recorded and prioritized for callback. You can also chat with our AI assistant.', 3);
            
            // After hours AI assistant
            const afterHoursWsUrl = `${this.wsUrl}?mode=afterhours&callback=true`;
            this.response.addStream("520228", afterHoursWsUrl, 'true');
        }
    }

    /**
     * Handle callback scheduling
     */
    handleCallbackScheduling() {
        this.response.addPlayText('To schedule a callback, please provide your details after the tone.', 3);
        
        // Record customer details
        this.response.addRecord('callback_' + this.sid, {
            silence: '3',
            maxduration: '120',
            termchar: '#'
        });
        
        // Then connect to AI for processing
        const callbackWsUrl = `${this.wsUrl}?action=callback&sid=${this.sid}`;
        this.response.addStream("520228", callbackWsUrl, 'true');
    }

    /**
     * Handle any errors in the IVR flow
     * @param {Error} error The error that occurred
     */
    handleError(error) {
        console.error('[IVR] Error:', error);
        this.response.addPlayText('Sorry, an error occurred. Please try again later or contact our support team directly.', 3);
        this.response.addHangup();
    }

    /**
     * Get flow statistics
     * @returns {Object} Flow statistics
     */
    getFlowStats() {
        return {
            sid: this.sid,
            event: this.event,
            data: this.data,
            wsUrl: this.wsUrl,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = IVRFlow;