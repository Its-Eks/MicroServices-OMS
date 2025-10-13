#!/usr/bin/env node

/**
 * Mock Onboarding Service
 * This version runs without external dependencies (Redis, PostgreSQL, MongoDB)
 * Perfect for testing and development
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class MockOnboardingServer {
  private app: express.Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3004');
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS middleware
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || [
        'http://localhost:3000',
        'https://oms-client-01ry.onrender.com',
        'https://oms-server-ntlv.onrender.com',
        'https://microservices-oms.onrender.com'
      ],
      credentials: true
    }));

    // Compression middleware
    this.app.use(compression());

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'onboarding-service',
        mode: 'mock',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });

    // Mock onboarding endpoints
    this.app.post('/api/onboarding/initiate', (req, res) => {
      const { customerId, orderId, onboardingType } = req.body;
      
      console.log('📝 Mock: Initiating onboarding for customer:', customerId);
      
      res.json({
        success: true,
        data: {
          id: `mock-onboarding-${Date.now()}`,
          customerId,
          orderId,
          onboardingType: onboardingType || 'standard',
          currentStep: 'welcome',
          completionPercentage: 0,
          status: 'in_progress',
          startedAt: new Date().toISOString(),
          steps: [
            { id: 'welcome', name: 'Welcome', status: 'in_progress' },
            { id: 'service-config', name: 'Service Configuration', status: 'pending' },
            { id: 'equipment-delivery', name: 'Equipment Delivery', status: 'pending' },
            { id: 'installation', name: 'Installation', status: 'pending' },
            { id: 'activation', name: 'Activation', status: 'pending' },
            { id: 'follow-up', name: 'Follow-up', status: 'pending' }
          ]
        }
      });
    });

    this.app.get('/api/onboarding/customers/:customerId', (req, res) => {
      const { customerId } = req.params;
      
      console.log('📋 Mock: Getting onboarding for customer:', customerId);
      
      res.json({
        success: true,
        data: {
          id: `mock-onboarding-${customerId}`,
          customerId,
          currentStep: 'service-config',
          completionPercentage: 25,
          status: 'in_progress',
          startedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          steps: [
            { id: 'welcome', name: 'Welcome', status: 'completed' },
            { id: 'service-config', name: 'Service Configuration', status: 'in_progress' },
            { id: 'equipment-delivery', name: 'Equipment Delivery', status: 'pending' },
            { id: 'installation', name: 'Installation', status: 'pending' },
            { id: 'activation', name: 'Activation', status: 'pending' },
            { id: 'follow-up', name: 'Follow-up', status: 'pending' }
          ]
        }
      });
    });

    this.app.post('/api/onboarding/:onboardingId/step/:stepId/complete', (req, res) => {
      const { onboardingId, stepId } = req.params;
      const { notes } = req.body;
      
      console.log('✅ Mock: Completing step:', stepId, 'for onboarding:', onboardingId);
      
      res.json({
        success: true,
        data: {
          id: onboardingId,
          stepId,
          status: 'completed',
          completedAt: new Date().toISOString(),
          notes: notes || 'Step completed successfully',
          nextStep: 'equipment-delivery'
        }
      });
    });

    this.app.get('/api/onboarding/active', (req, res) => {
      console.log('📋 Mock: Getting active onboardings');
      
      res.json({
        success: true,
        data: [
          {
            id: 'mock-onboarding-1',
            customerId: 'customer-1',
            orderId: 'order-1',
            onboardingType: 'standard',
            currentStep: 'service-config',
            completionPercentage: 30,
            assignedTo: 'ops@company.com',
            startedAt: new Date(Date.now() - 5 * 86400000).toISOString() // 5 days ago
          },
          {
            id: 'mock-onboarding-2',
            customerId: 'customer-2',
            orderId: 'order-2',
            onboardingType: 'trial',
            currentStep: 'equipment-delivery',
            completionPercentage: 60,
            assignedTo: 'support@company.com',
            startedAt: new Date(Date.now() - 2 * 86400000).toISOString() // 2 days ago
          }
        ],
        total: 2
      });
    });

    this.app.get('/api/onboarding/analytics/overview', (req, res) => {
      console.log('📊 Mock: Getting onboarding analytics');
      
      res.json({
        success: true,
        data: {
          activeOnboarding: 2,
          completedThisMonth: 5,
          averageCompletionTime: 7.5, // days
          completionRate: 85,
          trialCustomers: 3,
          trialConversions: 2,
          conversionRate: 67
        }
      });
    });

    this.app.get('/api/onboarding/trial-customers', (req, res) => {
      console.log('👥 Mock: Getting trial customers');
      
      res.json({
        success: true,
        data: [
          {
            id: 'mock-trial-1',
            customerId: 'customer-1',
            customer: {
              id: 'customer-1',
              firstName: 'John',
              lastName: 'Doe',
              email: 'john.doe@example.com',
              customerNumber: 'CUST-001',
              trialStartDate: new Date(Date.now() - 7 * 86400000).toISOString() // 7 days ago
            },
            currentStep: 'service-config',
            completionPercentage: 30,
            status: 'in_progress',
            startedAt: new Date(Date.now() - 7 * 86400000).toISOString()
          },
          {
            id: 'mock-trial-2',
            customerId: 'customer-2',
            customer: {
              id: 'customer-2',
              firstName: 'Jane',
              lastName: 'Smith',
              email: 'jane.smith@example.com',
              customerNumber: 'CUST-002',
              trialStartDate: new Date(Date.now() - 3 * 86400000).toISOString() // 3 days ago
            },
            currentStep: 'equipment-delivery',
            completionPercentage: 60,
            status: 'in_progress',
            startedAt: new Date(Date.now() - 3 * 86400000).toISOString()
          }
        ]
      });
    });

    // Catch-all route for undefined endpoints
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
        availableEndpoints: [
          'GET /health',
          'GET /api/onboarding/active',
          'GET /api/onboarding/analytics/overview',
          'POST /api/onboarding/initiate',
          'GET /api/onboarding/customers/:customerId',
          'POST /api/onboarding/:onboardingId/step/:stepId/complete',
          'GET /api/onboarding/trial-customers'
        ]
      });
    });

    // Error handling middleware
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('❌ Error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message || 'Something went wrong'
      });
    });
  }

  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting Mock Onboarding Service...');
      console.log('📝 Running in MOCK mode (no external dependencies)');
      
      this.app.listen(this.port, () => {
        console.log('✅ Mock Onboarding Service Ready!');
        console.log(`📡 Server running on port ${this.port}`);
        console.log(`🌐 Health check: http://localhost:${this.port}/health`);
        console.log('📋 Available endpoints:');
        console.log('  - POST /api/onboarding/initiate');
        console.log('  - GET /api/onboarding/customers/:customerId');
        console.log('  - POST /api/onboarding/:onboardingId/step/:stepId/complete');
        console.log('  - GET /api/onboarding/trial-customers');
        console.log('\n🧪 Ready for testing!');
      });
    } catch (error) {
      console.error('❌ Failed to start mock server:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new MockOnboardingServer();
server.start().catch(console.error);
