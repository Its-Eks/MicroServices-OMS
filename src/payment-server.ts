import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { PaymentController } from './controllers/payment.controller';
import { serviceAuthMiddleware, serviceCorsPolicyMiddleware } from './middleware/service-auth.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';

dotenv.config();

/**
 * Simplified Payment Server
 * Runs only the payment functionality without Redis/Queue dependencies
 * Perfect for testing payment integration while waiting for full infrastructure
 */
class PaymentServer {
  private app: express.Application;
  private port: number;
  private db: Pool;
  private paymentController: PaymentController;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3004');
    
    // Initialize PostgreSQL connection
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/oms_db',
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.paymentController = new PaymentController(this.db);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security and performance
    this.app.use(helmet());
    
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
        service: 'payment-server',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });

    // Database health check
    this.app.get('/health/db', async (req, res) => {
      try {
        await this.db.query('SELECT 1');
        res.json({ status: 'healthy', database: 'connected' });
      } catch (error) {
        res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: error.message });
      }
    });

    // Payment API routes with service authentication
    this.app.use('/api/payments', serviceAuthMiddleware, this.paymentController.router);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Payment Server',
        version: '1.0.0',
        description: 'Simplified payment service for testing',
        endpoints: {
          health: '/health',
          payments: '/api/payments/*'
        },
        features: [
          '🎭 Mock payment processing',
          '📧 Email integration',
          '🔐 Service authentication',
          '📊 Payment status tracking',
          '🎯 Webhook handling'
        ]
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Test database connection
      console.log('🔌 Testing database connection...');
      await this.db.query('SELECT NOW()');
      console.log('✅ Database connection established');

      // Start server
      this.app.listen(this.port, () => {
        console.log('\n🎭 Payment Server Started Successfully!');
        console.log('=====================================');
        console.log(`🚀 Server running on port ${this.port}`);
        console.log(`🌐 Health check: http://localhost:${this.port}/health`);
        console.log(`💳 Payment API: http://localhost:${this.port}/api/payments/*`);
        console.log(`🎯 Mock checkout: http://localhost:${this.port}/api/payments/mock-checkout/*`);
        console.log('=====================================');
        console.log('📋 Features:');
        console.log('   ✅ Mock payment processing');
        console.log('   ✅ Email templates (configurable)');
        console.log('   ✅ Service authentication');
        console.log('   ✅ Payment status tracking');
        console.log('   ✅ Webhook simulation');
        console.log('   ✅ Database integration');
        console.log('   ❌ Redis/Queue (not needed for payments)');
        console.log('=====================================\n');
      });

    } catch (error) {
      console.error('❌ Failed to start payment server:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    console.log('🛑 Shutting down payment server...');
    await this.db.end();
    console.log('✅ Payment server stopped');
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

// Start the server
const server = new PaymentServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
