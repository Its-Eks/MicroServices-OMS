const { app } = require('@azure/functions');

// Import your existing onboarding service logic
const { OnboardingService } = require('../../src/services/onboarding.service');

app.http('onboarding', {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    authLevel: 'anonymous',
    route: 'onboarding/{*restOfPath}',
    handler: async (request, context) => {
        context.log(`HTTP function processed request for url "${request.url}"`);

        const onboardingService = new OnboardingService();
        const method = request.method;
        const url = new URL(request.url);
        const path = url.pathname.replace('/api/onboarding', '');
        
        // Set CORS headers
        const headers = {
            'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Content-Type': 'application/json'
        };

        // Handle preflight requests
        if (method === 'OPTIONS') {
            return {
                status: 200,
                headers
            };
        }

        try {
            let result;
            
            switch (method) {
                case 'GET':
                    if (path === '/active') {
                        result = await onboardingService.getActiveOnboardings();
                    } else if (path === '/analytics/overview') {
                        result = await onboardingService.getOnboardingAnalytics();
                    } else if (path.match(/^\/[^\/]+$/)) {
                        const id = path.substring(1);
                        result = await onboardingService.getOnboardingStatus(id);
                    }
                    break;
                    
                case 'POST':
                    if (path === '/initiate') {
                        const body = await request.json();
                        result = await onboardingService.initiateOnboarding(body);
                    }
                    break;
                    
                case 'PATCH':
                    if (path.match(/^\/[^\/]+\/assign$/)) {
                        const id = path.split('/')[1];
                        const body = await request.json();
                        result = await onboardingService.assignOnboarding(id, body.assignedTo);
                    }
                    break;
            }

            return {
                status: 200,
                headers,
                body: JSON.stringify({ success: true, data: result })
            };
        } catch (error) {
            context.log.error('Error processing request:', error);
            return {
                status: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    error: { message: error.message } 
                })
            };
        }
    }
});
