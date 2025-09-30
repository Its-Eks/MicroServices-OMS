import { Request, Response, Router } from 'express';
import { OnboardingService } from '../services/onboarding.service';
import { SlaService } from '../services/sla.service';

export class OnboardingController {
  private router: Router;
  private customers: any[] = [];

  constructor(private onboardingService: OnboardingService) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Define specific/literal routes BEFORE parameterized ":id" routes to avoid conflicts

    // Customer creation (hybrid integration support)
    this.router.post('/customers', this.createCustomer.bind(this));
    this.router.get('/customers', this.listCustomers.bind(this));

    // Onboarding management (non-parameterized first)
    this.router.post('/initiate', this.initiateOnboarding.bind(this));
    this.router.get('/active', this.getActiveOnboardings.bind(this));
    this.router.get('/customer/:customerId', this.getCustomerOnboarding.bind(this));

    // Trial management
    this.router.get('/trials/list', this.getTrialCustomers.bind(this));
    this.router.post('/trials/:id/convert', this.convertTrialToCustomer.bind(this));

    // Analytics
    this.router.get('/analytics/overview', this.getOnboardingAnalytics.bind(this));

    // SLA endpoints (unified for orders and onboarding)
    this.router.get('/sla/order/:orderId', this.getOrderSla.bind(this));
    this.router.get('/sla/onboarding/:id', this.getOnboardingSla.bind(this));

    // Parameterized ":id" routes
    this.router.get('/:id', this.getOnboardingStatus.bind(this));
    this.router.patch('/:id/assign', this.assignOnboarding.bind(this));
    this.router.post('/:id/notify', this.notifyOnboarding.bind(this));
    this.router.put('/:id/step/:stepId', this.updateOnboardingStep.bind(this));
    this.router.get('/:id/steps', this.getOnboardingSteps.bind(this));
  }

  public getRouter(): Router {
    return this.router;
  }

  private async getOrderSla(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params as any;
      if (!orderId) {
        res.status(400).json({ success: false, error: { message: 'orderId is required' } });
        return;
      }
      const sla = new SlaService((this.onboardingService as any).dbService);
      const data = await sla.getOrderSla(orderId);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error?.message || 'Failed to compute order SLA' } });
    }
  }

  private async getOnboardingSla(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params as any;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'onboarding id is required' } });
        return;
      }
      const sla = new SlaService((this.onboardingService as any).dbService);
      const data = await sla.getOnboardingSla(id);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error?.message || 'Failed to compute onboarding SLA' } });
    }
  }

  // New: Create customer (lightweight, works in limited/mock mode)
  private async createCustomer(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body || {};
      const address = body.address || {};

      // Normalize snake_case
      const createReq = {
        first_name: body.first_name ?? body.firstName,
        last_name: body.last_name ?? body.lastName,
        email: body.email,
        phone: body.phone,
        address: {
          street: address.street,
          city: address.city,
          state: address.state,
          postal_code: address.postal_code ?? address.postalCode ?? address.zipCode,
          country: address.country,
        },
        customer_type: body.customer_type ?? body.customerType ?? 'individual',
        is_trial: body.is_trial ?? body.isTrial ?? false,
        trial_start_date: body.trial_start_date ?? body.trialStartDate ?? null,
        trial_end_date: body.trial_end_date ?? body.trialEndDate ?? null,
      };

      // Basic validation
      const missing = ['first_name', 'last_name', 'email', 'phone'].filter(k => !(createReq as any)[k]);
      const addrMissing = ['street', 'city', 'state', 'postal_code', 'country'].filter(k => !(createReq.address as any)[k]);
      if (missing.length || addrMissing.length) {
        res.status(400).json({
          success: false,
          error: {
            message: `Missing required fields: ${[...missing, ...addrMissing].join(', ')}`,
            code: 'INVALID_CUSTOMER_DATA'
          }
        });
        return;
      }

      // Try DB persistence first
      try {
        const saved = await this.onboardingService.createCustomer(createReq as any);
        res.status(201).json({ success: true, data: saved });
        return;
      } catch (dbError: any) {
        console.warn('DB create failed, falling back to in-memory store:', dbError?.message || dbError);
      }

      // Fallback: in-memory
      const fallbackCustomer = {
        id: `cust_${Date.now()}`,
        customer_number: `CUST-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
        ...createReq,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any;

      this.customers.unshift(fallbackCustomer);
      res.status(201).json({ success: true, data: fallbackCustomer, message: 'Stored in-memory (DB unavailable)' });
    } catch (error: any) {
      console.error('Error creating customer:', error);
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to create customer', code: 'CUSTOMER_CREATE_FAILED' }
      });
    }
  }

  private async listCustomers(req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, data: this.customers, count: this.customers.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message || 'Failed to list customers' } });
    }
  }

  // Onboarding Management Endpoints
  private async initiateOnboarding(req: Request, res: Response): Promise<void> {
    try {
      const { customerId, orderId, onboardingType, assignedTo } = req.body;

      // Validation
      if (!customerId || !onboardingType) {
        res.status(400).json({
          success: false,
          error: {
            message: 'customerId and onboardingType are required',
            code: 'MISSING_REQUIRED_FIELDS'
          }
        });
        return;
      }

      if (!['new_customer', 'trial'].includes(onboardingType)) {
        res.status(400).json({
          success: false,
          error: {
            message: 'onboardingType must be either "new_customer" or "trial"',
            code: 'INVALID_ONBOARDING_TYPE'
          }
        });
        return;
      }

      const result = await this.onboardingService.initiateOnboarding({
        customerId,
        orderId,
        onboardingType,
        assignedTo
      });

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error initiating onboarding:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'ONBOARDING_INITIATION_FAILED'
        }
      });
    }
  }

  private async getOnboardingStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Onboarding ID is required',
            code: 'MISSING_ONBOARDING_ID'
          }
        });
        return;
      }

      const onboarding = await this.onboardingService.getOnboardingStatus(id);

      if (!onboarding) {
        res.status(404).json({
          success: false,
          error: {
            message: 'Onboarding not found',
            code: 'ONBOARDING_NOT_FOUND'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: onboarding
      });
    } catch (error: any) {
      console.error('Error getting onboarding status:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'ONBOARDING_STATUS_FETCH_FAILED'
        }
      });
    }
  }

  private async getActiveOnboardings(req: Request, res: Response): Promise<void> {
    try {
      const list = await this.onboardingService.getActiveOnboardings();
      res.json({ success: true, data: list, total: list.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch active onboardings' } });
    }
  }

  private async assignOnboarding(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { assignedTo } = req.body;
      if (!id || !assignedTo) {
        res.status(400).json({ success: false, error: { message: 'id and assignedTo are required' } });
        return;
      }
      await this.onboardingService.assignOnboarding(id, assignedTo);
      res.json({ success: true, message: 'Assignment updated' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message || 'Failed to assign onboarding' } });
    }
  }

  private async notifyOnboarding(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { type, template, variables, email } = req.body || {};
      if (!id || !type) {
        res.status(400).json({ success: false, error: { message: 'id and type are required' } });
        return;
      }
      await this.onboardingService.notifyOnboarding(id, { type, template, variables, email });
      res.json({ success: true, message: 'Notification queued' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message || 'Failed to queue notification' } });
    }
  }

  private async getCustomerOnboarding(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;

      if (!customerId) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Customer ID is required',
            code: 'MISSING_CUSTOMER_ID'
          }
        });
        return;
      }

      const onboarding = await this.onboardingService.getCustomerOnboarding(customerId);

      if (!onboarding) {
        res.status(404).json({
          success: false,
          error: {
            message: 'No active onboarding found for customer',
            code: 'NO_ACTIVE_ONBOARDING'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: onboarding
      });
    } catch (error: any) {
      console.error('Error getting customer onboarding:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'CUSTOMER_ONBOARDING_FETCH_FAILED'
        }
      });
    }
  }

  private async updateOnboardingStep(req: Request, res: Response): Promise<void> {
    try {
      const { id, stepId } = req.params;
      const { notes, metadata } = req.body;

      if (!id || !stepId) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Onboarding ID and Step ID are required',
            code: 'MISSING_REQUIRED_PARAMS'
          }
        });
        return;
      }

      await this.onboardingService.updateOnboardingStep(id, {
        stepId,
        notes,
        metadata
      });

      res.json({
        success: true,
        message: 'Onboarding step updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating onboarding step:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'ONBOARDING_STEP_UPDATE_FAILED'
        }
      });
    }
  }

  private async getOnboardingSteps(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Onboarding ID is required',
            code: 'MISSING_ONBOARDING_ID'
          }
        });
        return;
      }

      const steps = await this.onboardingService.getOnboardingSteps(id);

      res.json({
        success: true,
        data: steps
      });
    } catch (error: any) {
      console.error('Error getting onboarding steps:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'ONBOARDING_STEPS_FETCH_FAILED'
        }
      });
    }
  }

  // Trial Management Endpoints
  private async getTrialCustomers(req: Request, res: Response): Promise<void> {
    try {
      const trials = await this.onboardingService.getTrialCustomers();

      res.json({
        success: true,
        data: {
          customers: trials,
          total: trials.length
        }
      });
    } catch (error: any) {
      console.error('Error getting trial customers:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'TRIAL_CUSTOMERS_FETCH_FAILED'
        }
      });
    }
  }

  private async convertTrialToCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Onboarding ID is required',
            code: 'MISSING_ONBOARDING_ID'
          }
        });
        return;
      }

      await this.onboardingService.convertTrialToCustomer(id);

      res.json({
        success: true,
        message: 'Trial converted to customer successfully'
      });
    } catch (error: any) {
      console.error('Error converting trial to customer:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'TRIAL_CONVERSION_FAILED'
        }
      });
    }
  }

  // Analytics Endpoints
  private async getOnboardingAnalytics(req: Request, res: Response): Promise<void> {
    try {
      // This would typically query the database for analytics
      // For now, returning mock data
      const analytics = {
        totalOnboardings: 150,
        activeOnboardings: 25,
        completedOnboardings: 120,
        trialCustomers: 35,
        conversionRate: 68.5,
        averageCompletionTime: 8.2,
        completionRate: 94.2
      };

      res.json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      console.error('Error getting onboarding analytics:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'ANALYTICS_FETCH_FAILED'
        }
      });
    }
  }

  // Webhook Handlers
  public async handleEmailWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { event, data } = req.body;

      console.log('Email webhook received:', { event, data });

      // Handle different email events
      switch (event) {
        case 'delivered':
          // Email was delivered successfully
          break;
        case 'opened':
          // Email was opened by recipient
          break;
        case 'clicked':
          // Link in email was clicked
          break;
        case 'bounced':
          // Email bounced
          break;
        default:
          console.log('Unknown email event:', event);
      }

      res.json({ success: true, message: 'Webhook processed' });
    } catch (error: any) {
      console.error('Error processing email webhook:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'EMAIL_WEBHOOK_PROCESSING_FAILED'
        }
      });
    }
  }

  public async handleShippingWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { trackingNumber, status, customerId, orderId } = req.body;

      console.log('Shipping webhook received:', { trackingNumber, status, customerId, orderId });

      // Update onboarding step based on shipping status
      if (status === 'shipped') {
        // Find the onboarding for this customer/order
        const onboarding = await this.onboardingService.getCustomerOnboarding(customerId);
        if (onboarding) {
          await this.onboardingService.updateOnboardingStep(onboarding.id, {
            stepId: 'equipment_shipped',
            metadata: { trackingNumber, status }
          });
        }
      }

      res.json({ success: true, message: 'Shipping webhook processed' });
    } catch (error: any) {
      console.error('Error processing shipping webhook:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'SHIPPING_WEBHOOK_PROCESSING_FAILED'
        }
      });
    }
  }

  public async handleEquipmentWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { equipmentId, status, customerId } = req.body;

      console.log('Equipment webhook received:', { equipmentId, status, customerId });

      // Handle equipment-related events
      switch (status) {
        case 'installed':
          // Equipment was installed
          const onboarding = await this.onboardingService.getCustomerOnboarding(customerId);
          if (onboarding) {
            await this.onboardingService.updateOnboardingStep(onboarding.id, {
              stepId: 'installation_completed',
              metadata: { equipmentId, status }
            });
          }
          break;
        case 'activated':
          // Equipment was activated
          const activeOnboarding = await this.onboardingService.getCustomerOnboarding(customerId);
          if (activeOnboarding) {
            await this.onboardingService.updateOnboardingStep(activeOnboarding.id, {
              stepId: 'service_activated',
              metadata: { equipmentId, status }
            });
          }
          break;
        default:
          console.log('Unknown equipment status:', status);
      }

      res.json({ success: true, message: 'Equipment webhook processed' });
    } catch (error: any) {
      console.error('Error processing equipment webhook:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: 'EQUIPMENT_WEBHOOK_PROCESSING_FAILED'
        }
      });
    }
  }
}
