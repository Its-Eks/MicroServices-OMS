import { DatabaseService } from './database.service';
import { QueueService, OnboardingJobData } from './queue.service';

// Database row types
interface DatabaseRow {
  [key: string]: any;
}

export interface OnboardingData {
  id: string;
  customerId: string;
  orderId?: string;
  onboardingType: 'new_customer' | 'trial';
  currentStep: string;
  completionPercentage: number;
  assignedTo?: string;
  startedAt: Date;
  completedAt?: Date;
  notes?: string;
}

export interface CreateOnboardingRequest {
  customerId: string;
  orderId?: string;
  onboardingType: 'new_customer' | 'trial';
  assignedTo?: string;
}

export interface UpdateStepRequest {
  stepId: string;
  notes?: string;
  metadata?: any;
}

export interface OnboardingStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completedAt?: Date;
  completedBy?: string;
  notes?: string;
}

export interface CreateCustomerRequest {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  customer_type?: 'individual' | 'business';
  is_trial?: boolean;
  trial_start_date?: string | null;
  trial_end_date?: string | null;
}

export class OnboardingService {
  private readonly defaultSteps: OnboardingStep[] = [
    {
      id: 'initiated',
      name: 'Onboarding Initiated',
      description: 'Onboarding process has been started',
      status: 'completed'
    },
    {
      id: 'welcome_sent',
      name: 'Welcome Email Sent',
      description: 'Welcome email has been sent to customer',
      status: 'pending'
    },
    {
      id: 'service_setup',
      name: 'Service Configuration',
      description: 'Configure service parameters and account setup',
      status: 'pending'
    },
    {
      id: 'equipment_ordered',
      name: 'Equipment Ordered',
      description: 'Equipment has been ordered for installation',
      status: 'pending'
    },
    {
      id: 'equipment_shipped',
      name: 'Equipment Shipped',
      description: 'Equipment has been shipped to customer',
      status: 'pending'
    },
    {
      id: 'installation_scheduled',
      name: 'Installation Scheduled',
      description: 'Installation appointment has been scheduled',
      status: 'pending'
    },
    {
      id: 'installation_completed',
      name: 'Installation Completed',
      description: 'Service installation has been completed',
      status: 'pending'
    },
    {
      id: 'service_activated',
      name: 'Service Activated',
      description: 'Service has been activated and tested',
      status: 'pending'
    },
    {
      id: 'follow_up',
      name: 'Follow-up & Support',
      description: 'Post-activation follow-up and support setup',
      status: 'pending'
    },
    {
      id: 'completed',
      name: 'Onboarding Completed',
      description: 'Onboarding process has been completed successfully',
      status: 'pending'
    }
  ];

  constructor(
    public dbService: DatabaseService,
    private queueService: QueueService
  ) {}

  async getActiveOnboardings(): Promise<OnboardingData[]> {
    const result = await this.dbService.query(
      `SELECT id, customer_id, order_id, onboarding_type, current_step, completion_percentage, assigned_to, started_at
       FROM customer_onboarding
       WHERE completed_at IS NULL
       ORDER BY started_at DESC`
    );
    return result.rows.map((row: DatabaseRow) => ({
      id: row.id,
      customerId: row.customer_id,
      orderId: row.order_id,
      onboardingType: row.onboarding_type,
      currentStep: row.current_step,
      completionPercentage: row.completion_percentage,
      assignedTo: row.assigned_to,
      startedAt: row.started_at,
    }));
  }

  async assignOnboarding(onboardingId: string, assignedTo: string): Promise<void> {
    await this.dbService.query(
      'UPDATE customer_onboarding SET assigned_to = $1 WHERE id = $2',
      [assignedTo, onboardingId]
    );
  }

  async notifyOnboarding(
    onboardingId: string,
    opts: { type: 'welcome' | 'reminder' | 'completion' | 'trial-expiry'; template?: string; variables?: any; email?: string }
  ): Promise<void> {
    // Fetch email if not provided
    let email = opts.email as string | undefined;
    if (!email) {
      const r = await this.dbService.query(
        `SELECT c.email, co.customer_id
           FROM customer_onboarding co
           JOIN customers c ON c.id = co.customer_id
          WHERE co.id = $1`,
        [onboardingId]
      );
      email = r.rows[0]?.email;
    }

    await this.queueService.addEmailJob({
      type: opts.type,
      email: email || '',
      customerId: 'unknown',
      template: opts.template || opts.type,
      variables: opts.variables || {},
    });
  }

  async createCustomer(request: CreateCustomerRequest): Promise<DatabaseRow> {
    try {
      // Insert into customers table; customer_number generated here
      const customerNumber = `CUST-${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, '0')}`;

      const result = await this.dbService.query(
        `INSERT INTO customers (
           customer_number, first_name, last_name, email, phone, address,
           customer_type, is_trial, trial_start_date, trial_end_date, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, NOW(), NOW()
         ) RETURNING 
           id, customer_number, first_name, last_name, email, phone, address,
           customer_type, is_trial, trial_start_date, trial_end_date, created_at, updated_at`,
        [
          customerNumber,
          request.first_name,
          request.last_name,
          request.email,
          request.phone,
          JSON.stringify(request.address),
          request.customer_type ?? 'individual',
          request.is_trial ?? false,
          request.trial_start_date ?? null,
          request.trial_end_date ?? null,
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error creating customer in DB:', error);
      throw error;
    }
  }

  async initiateOnboarding(request: CreateOnboardingRequest): Promise<OnboardingData> {
    try {
      console.log(`Initiating onboarding for customer ${request.customerId}`);

      // Validate customer exists
      const customerResult = await this.dbService.query(
        'SELECT id, first_name, last_name, email FROM customers WHERE id = $1',
        [request.customerId]
      );

      if (customerResult.rows.length === 0) {
        throw new Error(`Customer ${request.customerId} not found`);
      }

      // Check if onboarding already exists
      const existingResult = await this.dbService.query(
        'SELECT id FROM customer_onboarding WHERE customer_id = $1 AND completed_at IS NULL',
        [request.customerId]
      );

      if (existingResult.rows.length > 0) {
        throw new Error(`Active onboarding already exists for customer ${request.customerId}`);
      }

      // Create onboarding record
      const result = await this.dbService.query(
        `INSERT INTO customer_onboarding 
         (customer_id, order_id, onboarding_type, current_step, completion_percentage, assigned_to, started_at)
         VALUES ($1, $2, $3, 'initiated', 0, $4, NOW())
         RETURNING id, customer_id, order_id, onboarding_type, current_step, completion_percentage, assigned_to, started_at`,
        [request.customerId, request.orderId || null, request.onboardingType, request.assignedTo || null]
      );

      const onboarding = result.rows[0];

      // Queue initial onboarding tasks
      await this.queueService.addOnboardingJob({
        type: 'welcome-email',
        onboardingId: onboarding.id,
        customerId: request.customerId,
        orderId: request.orderId,
      });

      // For trial customers, set up trial-specific workflows
      if (request.onboardingType === 'trial') {
        await this.setupTrialWorkflow(onboarding.id, request.customerId);
      }

      console.log(`Onboarding initiated successfully: ${onboarding.id}`);

      return {
        id: onboarding.id,
        customerId: onboarding.customer_id,
        orderId: onboarding.order_id,
        onboardingType: onboarding.onboarding_type,
        currentStep: onboarding.current_step,
        completionPercentage: onboarding.completion_percentage,
        assignedTo: onboarding.assigned_to,
        startedAt: onboarding.started_at,
        notes: onboarding.notes,
      };
    } catch (error) {
      console.error('Error initiating onboarding:', error);
      throw error;
    }
  }

  async getOnboardingStatus(onboardingId: string): Promise<OnboardingData | null> {
    try {
      const result = await this.dbService.query(
        `SELECT 
           co.id, co.customer_id, co.order_id, co.onboarding_type, co.current_step,
           co.completion_percentage, co.assigned_to, co.started_at, co.completed_at, co.notes,
           c.first_name, c.last_name, c.email, c.customer_number,
           o.order_number, o.service_type, o.service_package,
           o.status AS order_status
         FROM customer_onboarding co
         LEFT JOIN customers c ON co.customer_id = c.id
         LEFT JOIN orders o ON co.order_id = o.id
         WHERE co.id = $1`,
        [onboardingId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      // Mirror onboarding currentStep from linked order status if present
      const mirroredStep = row.order_status ? row.order_status : row.current_step;

      return {
        id: row.id,
        customerId: row.customer_id,
        orderId: row.order_id,
        onboardingType: row.onboarding_type,
        currentStep: mirroredStep,
        completionPercentage: row.completion_percentage,
        assignedTo: row.assigned_to,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        notes: row.notes,
      };
    } catch (error) {
      console.error('Error getting onboarding status:', error);
      throw error;
    }
  }

  async getCustomerOnboarding(customerId: string): Promise<OnboardingData | null> {
    try {
      const result = await this.dbService.query(
        `SELECT 
           co.id, co.customer_id, co.order_id, co.onboarding_type, co.current_step,
           co.completion_percentage, co.assigned_to, co.started_at, co.completed_at, co.notes
         FROM customer_onboarding co
         WHERE co.customer_id = $1 AND co.completed_at IS NULL
         ORDER BY co.started_at DESC
         LIMIT 1`,
        [customerId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        customerId: row.customer_id,
        orderId: row.order_id,
        onboardingType: row.onboarding_type,
        currentStep: row.current_step,
        completionPercentage: row.completion_percentage,
        assignedTo: row.assigned_to,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        notes: row.notes,
      };
    } catch (error) {
      console.error('Error getting customer onboarding:', error);
      throw error;
    }
  }

  async updateOnboardingStep(onboardingId: string, request: UpdateStepRequest): Promise<void> {
    try {
      console.log(`Updating onboarding step: ${onboardingId} -> ${request.stepId}`);

      // Get current onboarding status
      const currentResult = await this.dbService.query(
        'SELECT * FROM customer_onboarding WHERE id = $1',
        [onboardingId]
      );

      if (currentResult.rows.length === 0) {
        throw new Error(`Onboarding ${onboardingId} not found`);
      }

      const currentOnboarding = currentResult.rows[0];

      // Update the step
      await this.dbService.query(
        `UPDATE customer_onboarding 
         SET current_step = $1, 
             completion_percentage = LEAST(100, completion_percentage + $2),
             notes = COALESCE($3, notes)
         WHERE id = $4`,
        [
          request.stepId,
          this.getStepCompletionIncrement(request.stepId),
          request.notes || null,
          onboardingId
        ]
      );

      // Queue next step processing
      await this.queueService.addOnboardingJob({
        type: 'next-step',
        onboardingId,
        customerId: currentOnboarding.customer_id,
        stepId: request.stepId,
        metadata: request.metadata,
      });

      // If this is the final step, mark as completed
      if (request.stepId === 'completed') {
        await this.dbService.query(
          'UPDATE customer_onboarding SET completed_at = NOW() WHERE id = $1',
          [onboardingId]
        );
      }

      console.log(`Onboarding step updated successfully: ${onboardingId} -> ${request.stepId}`);
    } catch (error) {
      console.error('Error updating onboarding step:', error);
      throw error;
    }
  }

  async getTrialCustomers(): Promise<any[]> {
    try {
      const result = await this.dbService.query(
        `SELECT 
           co.id, co.customer_id, co.current_step, co.completion_percentage,
           co.started_at, co.assigned_to,
           c.first_name, c.last_name, c.email, c.customer_number,
           c.trial_start_date, c.trial_end_date
         FROM customer_onboarding co
         JOIN customers c ON co.customer_id = c.id
         WHERE co.onboarding_type = 'trial' AND co.completed_at IS NULL
         ORDER BY co.started_at DESC`
      );

      return result.rows.map((row: DatabaseRow) => ({
        id: row.id,
        customerId: row.customer_id,
        customer: {
          id: row.customer_id,
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
          customerNumber: row.customer_number,
          trialStartDate: row.trial_start_date,
          trialEndDate: row.trial_end_date,
        },
        currentStep: row.current_step,
        completionPercentage: row.completion_percentage,
        assignedTo: row.assigned_to,
        startedAt: row.started_at,
      }));
    } catch (error) {
      console.error('Error getting trial customers:', error);
      throw error;
    }
  }

  async convertTrialToCustomer(onboardingId: string): Promise<void> {
    try {
      console.log(`Converting trial to customer: ${onboardingId}`);

      // Get onboarding details
      const onboarding = await this.getOnboardingStatus(onboardingId);
      if (!onboarding) {
        throw new Error(`Onboarding ${onboardingId} not found`);
      }

      if (onboarding.onboardingType !== 'trial') {
        throw new Error(`Onboarding ${onboardingId} is not a trial`);
      }

      // Update customer to remove trial status
      await this.dbService.query(
        `UPDATE customers 
         SET is_trial = false, trial_end_date = NULL, updated_at = NOW()
         WHERE id = $1`,
        [onboarding.customerId]
      );

      // Update onboarding type
      await this.dbService.query(
        'UPDATE customer_onboarding SET onboarding_type = $1 WHERE id = $2',
        ['new_customer', onboardingId]
      );

      // Queue conversion email
      await this.queueService.addEmailJob({
        type: 'completion',
        customerId: onboarding.customerId,
        email: '', // Will be fetched
        template: 'trial-conversion',
        variables: { customerId: onboarding.customerId }
      });

      console.log(`Trial converted to customer successfully: ${onboardingId}`);
    } catch (error) {
      console.error('Error converting trial to customer:', error);
      throw error;
    }
  }

  async getOnboardingSteps(onboardingId: string): Promise<OnboardingStep[]> {
    try {
      const onboarding = await this.getOnboardingStatus(onboardingId);
      if (!onboarding) {
        throw new Error(`Onboarding ${onboardingId} not found`);
      }

      return this.defaultSteps.map(step => {
        let status: 'pending' | 'in_progress' | 'completed' | 'skipped' = 'pending';

        if (step.id === onboarding.currentStep) {
          status = 'in_progress';
        } else if (this.isStepCompleted(step.id, onboarding.currentStep)) {
          status = 'completed';
        }

        return {
          ...step,
          status
        };
      });
    } catch (error) {
      console.error('Error getting onboarding steps:', error);
      throw error;
    }
  }

  private async setupTrialWorkflow(onboardingId: string, customerId: string): Promise<void> {
    try {
      // Set trial end date (30 days from now)
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30);

      await this.dbService.query(
        'UPDATE customers SET trial_end_date = $1 WHERE id = $2',
        [trialEndDate, customerId]
      );

      // Schedule trial expiry reminder (7 days before expiry)
      const reminderDate = new Date(trialEndDate);
      reminderDate.setDate(reminderDate.getDate() - 7);

      // This would be implemented with a scheduled job
      console.log(`Trial workflow setup for customer ${customerId}, expires ${trialEndDate}`);
    } catch (error) {
      console.error('Error setting up trial workflow:', error);
      throw error;
    }
  }

  private getStepCompletionIncrement(stepId: string): number {
    const increments: Record<string, number> = {
      'initiated': 10,
      'welcome_sent': 10,
      'service_setup': 15,
      'equipment_ordered': 10,
      'equipment_shipped': 15,
      'installation_scheduled': 10,
      'installation_completed': 15,
      'service_activated': 10,
      'follow_up': 5,
      'completed': 0,
    };

    return increments[stepId] || 10;
  }

  private isStepCompleted(stepId: string, currentStep: string): boolean {
    const stepOrder = this.defaultSteps.map(step => step.id);
    const stepIndex = stepOrder.indexOf(stepId);
    const currentIndex = stepOrder.indexOf(currentStep);

    return stepIndex < currentIndex;
  }
}
