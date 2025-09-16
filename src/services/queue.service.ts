import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { DatabaseService } from './database.service';

export interface OnboardingJobData {
  type: 'welcome-email' | 'next-step' | 'equipment-shipped' | 'installation-scheduled' | 'service-activated' | 'follow-up';
  onboardingId: string;
  customerId: string;
  orderId?: string;
  stepId?: string;
  metadata?: any;
}

export interface EmailJobData {
  type: 'welcome' | 'reminder' | 'completion' | 'trial-expiry';
  customerId: string;
  email: string;
  template: string;
  variables: Record<string, any>;
}

export class QueueService {
  private redis: Redis;
  private onboardingQueue!: Queue<OnboardingJobData>;
  private emailQueue!: Queue<EmailJobData>;
  private onboardingWorker!: Worker<OnboardingJobData>;
  private emailWorker!: Worker<EmailJobData>;
  private isInitialized = false;
  private bullConnectionOptions: any;

  constructor(private dbService: DatabaseService) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const parsed = new URL(redisUrl);
    const password = decodeURIComponent(parsed.password || '');
    const host = parsed.hostname || 'localhost';
    const port = parsed.port ? parseInt(parsed.port, 10) : 6379;
    const isTls = parsed.protocol === 'rediss:';

    this.redis = new Redis({
      host,
      port,
      password: password || undefined,
      retryDelayOnFailover: 100,
      // Required by BullMQ to allow blocking ops
      maxRetriesPerRequest: null as unknown as number,
      tls: isTls ? {} : undefined,
    } as any);

    // Connection options passed directly to BullMQ so its internal
    // clients also have maxRetriesPerRequest=null and AUTH
    this.bullConnectionOptions = {
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null as unknown as number,
      enableOfflineQueue: false,
      tls: isTls ? {} : undefined,
    } as any;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🔄 Initializing queue service...');

      // Create queues
      this.onboardingQueue = new Queue<OnboardingJobData>('onboarding', {
        connection: this.bullConnectionOptions,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      this.emailQueue = new Queue<EmailJobData>('email', {
        connection: this.bullConnectionOptions,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 25,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      });

      // Create workers
      this.setupWorkers();

      this.isInitialized = true;
      console.log('✅ Queue service initialized');
    } catch (error) {
      console.error('❌ Queue service initialization failed:', error);
      throw error;
    }
  }

  private setupWorkers(): void {
    // Onboarding worker
    this.onboardingWorker = new Worker<OnboardingJobData>(
      'onboarding',
      async (job: Job<OnboardingJobData>) => {
        const { type, onboardingId, customerId, stepId, metadata } = job.data;
        
        console.log(`Processing onboarding job: ${type} for customer ${customerId}`);

        switch (type) {
          case 'welcome-email':
            await this.processWelcomeEmail(onboardingId, customerId);
            break;
          case 'next-step':
            await this.processNextStep(onboardingId, stepId);
            break;
          case 'equipment-shipped':
            await this.processEquipmentShipped(onboardingId, customerId, metadata);
            break;
          case 'installation-scheduled':
            await this.processInstallationScheduled(onboardingId, customerId, metadata);
            break;
          case 'service-activated':
            await this.processServiceActivated(onboardingId, customerId);
            break;
          case 'follow-up':
            await this.processFollowUp(onboardingId, customerId);
            break;
          default:
            console.warn(`Unknown onboarding job type: ${type}`);
        }
      },
      {
        connection: this.bullConnectionOptions,
        concurrency: 5,
      }
    );

    // Email worker
    this.emailWorker = new Worker<EmailJobData>(
      'email',
      async (job: Job<EmailJobData>) => {
        const { type, customerId, email, template, variables } = job.data;
        
        console.log(`Processing email job: ${type} to ${email}`);

        await this.processEmailJob(type, email, template, variables);
      },
      {
        connection: this.bullConnectionOptions,
        concurrency: 10,
      }
    );

    // Error handling
    this.onboardingWorker.on('failed', (job, err) => {
      console.error(`Onboarding job ${job?.id} failed:`, err);
    });

    this.emailWorker.on('failed', (job, err) => {
      console.error(`Email job ${job?.id} failed:`, err);
    });
  }

  // Queue job methods
  async addOnboardingJob(data: OnboardingJobData, delay?: number): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Queue service not initialized; skipping onboarding job enqueue', data);
      return;
    }

    const jobOptions: any = {};
    if (delay) {
      jobOptions.delay = delay;
    }

    await this.onboardingQueue.add(data.type, data, jobOptions);
  }

  async addEmailJob(data: EmailJobData, delay?: number): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Queue service not initialized; skipping email job enqueue', data);
      return;
    }

    const jobOptions: any = {};
    if (delay) {
      jobOptions.delay = delay;
    }

    await this.emailQueue.add(data.type, data, jobOptions);
  }

  // Job processing methods
  private async processWelcomeEmail(onboardingId: string, customerId: string): Promise<void> {
    try {
      // Get customer details
      const customerResult = await this.dbService.query(
        'SELECT email, first_name, last_name FROM customers WHERE id = $1',
        [customerId]
      );

      if (customerResult.rows.length === 0) {
        throw new Error(`Customer ${customerId} not found`);
      }

      const customer = customerResult.rows[0];

      // Queue welcome email
      await this.addEmailJob({
        type: 'welcome',
        customerId,
        email: customer.email,
        template: 'welcome',
        variables: {
          firstName: customer.first_name,
          lastName: customer.last_name,
          customerId,
        }
      });

      // Update onboarding step
      await this.dbService.query(
        'UPDATE customer_onboarding SET current_step = $1, completion_percentage = LEAST(100, completion_percentage + 10) WHERE id = $2',
        ['welcome_sent', onboardingId]
      );

      console.log(`Welcome email queued for customer ${customerId}`);
    } catch (error) {
      console.error('Error processing welcome email:', error);
      throw error;
    }
  }

  private async processNextStep(onboardingId: string, stepId?: string): Promise<void> {
    try {
      // Get current onboarding status
      const result = await this.dbService.query(
        'SELECT * FROM customer_onboarding WHERE id = $1',
        [onboardingId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Onboarding ${onboardingId} not found`);
      }

      const onboarding = result.rows[0];
      
      // Determine next step based on current step
      const nextStep = this.getNextStep(onboarding.current_step);
      
      if (nextStep) {
        // Queue next step job
        await this.addOnboardingJob({
          type: 'next-step',
          onboardingId,
          customerId: onboarding.customer_id,
          stepId: nextStep,
        }, 5000); // 5 second delay
      }

      console.log(`Next step queued for onboarding ${onboardingId}: ${nextStep}`);
    } catch (error) {
      console.error('Error processing next step:', error);
      throw error;
    }
  }

  private async processEquipmentShipped(onboardingId: string, customerId: string, metadata: any): Promise<void> {
    try {
      // Update onboarding step
      await this.dbService.query(
        'UPDATE customer_onboarding SET current_step = $1, completion_percentage = LEAST(100, completion_percentage + 20) WHERE id = $2',
        ['equipment_shipped', onboardingId]
      );

      // Queue installation scheduling
      await this.addOnboardingJob({
        type: 'installation-scheduled',
        onboardingId,
        customerId,
        metadata,
      }, 10000); // 10 second delay

      console.log(`Equipment shipped processed for onboarding ${onboardingId}`);
    } catch (error) {
      console.error('Error processing equipment shipped:', error);
      throw error;
    }
  }

  private async processInstallationScheduled(onboardingId: string, customerId: string, metadata: any): Promise<void> {
    try {
      // Update onboarding step
      await this.dbService.query(
        'UPDATE customer_onboarding SET current_step = $1, completion_percentage = LEAST(100, completion_percentage + 20) WHERE id = $2',
        ['installation_scheduled', onboardingId]
      );

      console.log(`Installation scheduled for onboarding ${onboardingId}`);
    } catch (error) {
      console.error('Error processing installation scheduled:', error);
      throw error;
    }
  }

  private async processServiceActivated(onboardingId: string, customerId: string): Promise<void> {
    try {
      // Update onboarding step
      await this.dbService.query(
        'UPDATE customer_onboarding SET current_step = $1, completion_percentage = 100, completed_at = NOW() WHERE id = $2',
        ['completed', onboardingId]
      );

      // Queue completion email
      await this.addEmailJob({
        type: 'completion',
        customerId,
        email: '', // Will be fetched
        template: 'completion',
        variables: { customerId }
      });

      console.log(`Service activated for onboarding ${onboardingId}`);
    } catch (error) {
      console.error('Error processing service activated:', error);
      throw error;
    }
  }

  private async processFollowUp(onboardingId: string, customerId: string): Promise<void> {
    try {
      // Queue follow-up email
      await this.addEmailJob({
        type: 'reminder',
        customerId,
        email: '', // Will be fetched
        template: 'follow-up',
        variables: { customerId }
      });

      console.log(`Follow-up processed for onboarding ${onboardingId}`);
    } catch (error) {
      console.error('Error processing follow-up:', error);
      throw error;
    }
  }

  private async processEmailJob(type: string, email: string, template: string, variables: Record<string, any>): Promise<void> {
    try {
      // Here you would integrate with your email service (SendGrid, Mailgun, etc.)
      console.log(`Sending ${type} email to ${email} using template ${template}`, variables);
      
      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`Email sent successfully to ${email}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  private getNextStep(currentStep: string): string | null {
    const stepFlow: Record<string, string> = {
      'initiated': 'welcome_sent',
      'welcome_sent': 'service_setup',
      'service_setup': 'equipment_ordered',
      'equipment_ordered': 'equipment_shipped',
      'equipment_shipped': 'installation_scheduled',
      'installation_scheduled': 'installation_completed',
      'installation_completed': 'service_activated',
      'service_activated': 'follow_up',
      'follow_up': 'completed',
    };

    return stepFlow[currentStep] || null;
  }

  // Queue management methods
  async getQueueStats(): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Queue service not initialized');
    }

    const onboardingStats = await this.onboardingQueue.getJobCounts();
    const emailStats = await this.emailQueue.getJobCounts();

    return {
      onboarding: onboardingStats,
      email: emailStats,
    };
  }

  async clearQueues(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Queue service not initialized');
    }

    await Promise.all([
      this.onboardingQueue.obliterate({ force: true }),
      this.emailQueue.obliterate({ force: true }),
    ]);
  }

  async disconnect(): Promise<void> {
    try {
      console.log('🔄 Disconnecting queue service...');

      await Promise.allSettled([
        this.onboardingWorker?.close(),
        this.emailWorker?.close(),
        this.onboardingQueue?.close(),
        this.emailQueue?.close(),
        this.redis.quit(),
      ]);

      this.isInitialized = false;
      console.log('✅ Queue service disconnected');
    } catch (error) {
      console.error('❌ Error during queue service disconnection:', error);
      throw error;
    }
  }
}
