import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { OnboardingService } from './services/onboarding.service';
import { QueueService } from './services/queue.service';
import { DatabaseService } from './services/database.service';
import { OnboardingController } from './controllers/onboarding.controller';
import { PaymentController } from './controllers/payment.controller';
import { PaymentService } from './services/payment.service';
import { ReconcilerService } from './services/reconciler.service';
import { serviceAuthMiddleware, serviceCorsPolicyMiddleware } from './middleware/service-auth.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';

dotenv.config();

class OnboardingServer {
  private app: express.Application;
  private port: number;
  private onboardingService: OnboardingService;
  private queueService: QueueService;
  private dbService: DatabaseService;
  private onboardingController: OnboardingController;
  private paymentController: PaymentController;
  private reconcilerService?: ReconcilerService;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3004');
    this.dbService = new DatabaseService();
    this.queueService = new QueueService(this.dbService);
    this.onboardingService = new OnboardingService(this.dbService, this.queueService);
    this.onboardingController = new OnboardingController(this.onboardingService);
    this.paymentController = new PaymentController(this.dbService.getPool());
  }

  // Register Stripe webhook route BEFORE JSON body parser to preserve raw body
  private registerRawWebhookRoute(): void {
    // Public Stripe webhook (verified with STRIPE_WEBHOOK_SECRET inside controller)
    // Use express.raw to obtain the exact payload Buffer for signature verification
    this.app.post(
      '/api/payments/webhook',
      express.raw({ type: 'application/json' }),
      this.paymentController['handleWebhook'].bind(this.paymentController)
    );
  }

  private setupMiddleware(): void {
    // Security and performance
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"]
        }
      }
    }));
    // Service-to-service CORS policy
    this.app.use(serviceCorsPolicyMiddleware);
    
    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
      credentials: true
    }));
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use(requestLogger);
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        service: 'onboarding-service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // API routes
    this.app.use('/api/onboarding', this.onboardingController.getRouter());
    
    // Payment routes with selective authentication
    // Stripe webhook is registered earlier with express.raw

    // Public confirm endpoint (no auth)
    this.app.post('/api/payments/confirm', this.paymentController.confirmPayment.bind(this.paymentController));

    // Mock checkout pages should be publicly accessible (no auth required)
    if (process.env.USE_MOCK_PAYMENTS === 'true') {
      this.app.get('/api/payments/mock-checkout/:checkoutId', this.paymentController.getMockCheckoutPage.bind(this.paymentController));
    }

    // All other payment routes require service-to-service authentication
    this.app.use('/api/payments', serviceAuthMiddleware, this.paymentController.router);

    // Queue stats endpoint
    this.app.get('/api/queues/stats', async (req, res) => {
      try {
        const stats = await this.queueService.getQueueStats();
        res.json({ success: true, stats });
      } catch (error: any) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });
    
    // Webhook endpoints
    this.app.post('/webhooks/email', this.onboardingController.handleEmailWebhook.bind(this.onboardingController));
    this.app.post('/webhooks/shipping', this.onboardingController.handleShippingWebhook.bind(this.onboardingController));
    this.app.post('/webhooks/equipment', this.onboardingController.handleEquipmentWebhook.bind(this.onboardingController));

    // Error handling
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);
      
      try {
        await this.dbService.disconnect();
        await this.queueService.disconnect();
        console.log('All connections closed successfully');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting Onboarding Service...\n');
      
      // Initialize services with error handling
      try {
        await this.dbService.connect();
        console.log('✅ Database connections established');
      } catch (dbError) {
        console.warn('⚠️  Database connection failed, running in limited mode:', (dbError as Error).message);
        console.log('📝 Service will start with mock data capabilities');
      }
      
      try {
        await this.queueService.initialize();
        console.log('✅ Queue service initialized');
      } catch (queueError) {
        console.warn('⚠️  Queue service failed to initialize:', (queueError as Error).message);
        console.log('📝 Service will run without background job processing');
      }
      
      // Register webhook route with raw body BEFORE general middleware that parses JSON
      this.registerRawWebhookRoute();
      // Setup middleware and routes
      this.setupMiddleware();
      this.setupRoutes();
      this.setupGracefulShutdown();
      
      // Start reconciler (payment status validator) every 6 hours by default
      try {
        const provider = process.env.PAYMENT_PROVIDER === 'peach' ? 'peach' : 'stripe';
        const paymentService = new PaymentService(this.dbService.getPool(), provider as any);
        const intervalMinutes = parseInt(process.env.RECONCILE_INTERVAL_MINUTES || '360');
        const minAgeMinutes = parseInt(process.env.RECONCILE_MIN_AGE_MINUTES || '10');
        this.reconcilerService = new ReconcilerService(this.dbService.getPool(), paymentService, {
          runIntervalMs: intervalMinutes * 60 * 1000,
          batchSize: 50,
          minAgeMinutes
        });
        this.reconcilerService.start();
      } catch (recErr) {
        console.warn('⚠️  Reconciler not started:', (recErr as Error).message);
      }
      
      // Start server
      this.app.listen(this.port, () => {
        console.log('✅ Onboarding Service Ready!');
        console.log(`📡 Server running on port ${this.port}`);
        console.log(`🔗 Health check: http://localhost:${this.port}/health`);
        console.log(`📋 API endpoints: http://localhost:${this.port}/api/onboarding`);
        console.log(`🎣 Webhooks: http://localhost:${this.port}/webhooks/*\n`);
      });

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new OnboardingServer();
server.start().catch(error => {
  console.error('Failed to start onboarding service:', error);
  process.exit(1);
});

export default server;
