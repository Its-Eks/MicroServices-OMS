import { Router, Request, Response } from 'express';
import { PaymentService, PaymentRequest } from '../services/payment.service';
import { MockPaymentService } from '../services/mock-payment.service';
import type { Pool } from 'pg';

export class PaymentController {
  public router: Router;
  private paymentService: PaymentService | MockPaymentService;
  private useMockData: boolean;

  constructor(db: Pool) {
    this.router = Router();
    
    // Determine if we should use mock data
    this.useMockData = process.env.PEACH_ENTITY_ID === 'test_entity_id' || 
                      process.env.PEACH_ACCESS_TOKEN === 'test_access_token' ||
                      process.env.NODE_ENV === 'development' ||
                      process.env.USE_MOCK_PAYMENTS === 'true';
    
    // Initialize appropriate service
    this.paymentService = this.useMockData 
      ? new MockPaymentService(db)
      : new PaymentService(db);
    
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Create payment link and send email
    this.router.post('/create', this.createPaymentRequest.bind(this));
    
    // Get payment status
    this.router.get('/:paymentLinkId/status', this.getPaymentStatus.bind(this));
    
    // Peach Payments webhook endpoint
    this.router.post('/webhook', this.handleWebhook.bind(this));
    
    // Resend payment email
    this.router.post('/:paymentLinkId/resend', this.resendPaymentEmail.bind(this));
    
    // Mock checkout page is handled directly in server.ts to bypass authentication
  }

  private async createPaymentRequest(req: Request, res: Response): Promise<void> {
    try {
      const paymentRequest: PaymentRequest = {
        orderId: req.body.orderId,
        customerId: req.body.customerId,
        customerEmail: req.body.customerEmail,
        customerName: req.body.customerName,
        orderType: req.body.orderType,
        servicePackage: {
          name: req.body.servicePackage.name,
          speed: req.body.servicePackage.speed,
          price: parseFloat(req.body.servicePackage.price),
          installationFee: req.body.servicePackage.installationFee ? parseFloat(req.body.servicePackage.installationFee) : undefined,
          installationType: req.body.servicePackage.installationType
        },
        serviceAddress: req.body.serviceAddress
      };

      // Validate required fields
      if (!paymentRequest.orderId || !paymentRequest.customerEmail || !paymentRequest.servicePackage.name) {
        res.status(400).json({
          success: false,
          error: { message: 'Missing required fields: orderId, customerEmail, servicePackage.name' }
        });
        return;
      }

      // Create payment link
      const paymentLink = await this.paymentService.createPaymentLink(paymentRequest);

      // Send payment email
      await this.paymentService.sendPaymentEmail(paymentRequest, paymentLink);

      res.json({
        success: true,
        data: {
          paymentLinkId: paymentLink.id,
          paymentUrl: paymentLink.url,
          expiresAt: paymentLink.expiresAt,
          emailSent: true
        }
      });
    } catch (error: any) {
      console.error('[PaymentController] Create payment request failed:', error);
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to create payment request' }
      });
    }
  }

  private async getPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { paymentLinkId } = req.params;
      
      const status = await this.paymentService.getPaymentStatus(paymentLinkId);
      
      res.json({
        success: true,
        data: status
      });
    } catch (error: any) {
      console.error('[PaymentController] Get payment status failed:', error);
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to get payment status' }
      });
    }
  }

  private async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Peach Payments webhook handling
      const webhookSecret = process.env.PEACH_WEBHOOK_SECRET;
      
      // In production, you should verify the webhook signature
      // For now, we'll process the webhook data directly
      const webhookData = req.body;

      if (!webhookData.id) {
        res.status(400).json({ error: 'Invalid webhook data - missing checkout ID' });
        return;
      }

      await this.paymentService.handleWebhook(webhookData);

      res.json({ 
        success: true,
        message: 'Webhook processed successfully',
        checkoutId: webhookData.id 
      });
    } catch (error: any) {
      console.error('[PaymentController] Webhook handling failed:', error);
      res.status(400).json({
        success: false,
        error: { message: error.message || 'Webhook handling failed' }
      });
    }
  }

  private async resendPaymentEmail(req: Request, res: Response): Promise<void> {
    try {
      const { paymentLinkId } = req.params;
      
      // Get payment link details from database
      const result = await this.paymentService.getPaymentStatus(paymentLinkId);
      
      if (!result.success) {
        res.status(404).json({
          success: false,
          error: { message: 'Payment link not found' }
        });
        return;
      }

      // Use the payment service to resend the email
      const resendResult = await this.paymentService.resendPaymentEmail(paymentLinkId);
      
      if (resendResult.success) {
        res.json({
          success: true,
          message: 'Payment email resent successfully',
          data: {
            paymentLinkId,
            emailSent: true
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: resendResult.error || 'Failed to resend payment email' }
        });
      }
    } catch (error: any) {
      console.error('[PaymentController] Resend payment email failed:', error);
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to resend payment email' }
      });
    }
  }

  public async getMockCheckoutPage(req: Request, res: Response): Promise<void> {
    try {
      const { checkoutId } = req.params;
      
      if (!this.useMockData) {
        res.status(404).json({ error: 'Mock checkout not available in production mode' });
        return;
      }

      // Type assertion since we know it's MockPaymentService in mock mode
      const mockService = this.paymentService as MockPaymentService;
      const html = await mockService.getMockCheckoutPage(checkoutId);
      
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error: any) {
      console.error('[PaymentController] Mock checkout page failed:', error);
      res.status(500).send('<h1>Error loading mock checkout page</h1>');
    }
  }
}
