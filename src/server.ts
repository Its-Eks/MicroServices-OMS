import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { OnboardingService } from './services/onboarding.service';
import { QueueService } from './services/queue.service';
import { DatabaseService } from './services/database.service';
import { OnboardingController } from './controllers/onboarding.controller';
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

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3004');
    this.dbService = new DatabaseService();
    this.queueService = new QueueService(this.dbService);
    this.onboardingService = new OnboardingService(this.dbService, this.queueService);
    this.onboardingController = new OnboardingController(this.onboardingService);
  }

  private setupMiddleware(): void {
    // Security and performance
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
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
      
      // Setup middleware and routes
      this.setupMiddleware();
      this.setupRoutes();
      this.setupGracefulShutdown();
      
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
