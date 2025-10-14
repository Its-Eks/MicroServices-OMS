import nodemailer from 'nodemailer';
import type { Pool } from 'pg';
import { PaymentRequest, PaymentLink } from './payment.service';

/**
 * Mock Payment Service for Development
 * Simulates Peach Payments API responses without making actual API calls
 */
export class MockPaymentService {
  private emailTransporter: nodemailer.Transporter;
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
    
    // Initialize email transporter (same as real service)
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'noreply@xnext.co.za',
        pass: process.env.SMTP_PASS || 'dummy_password'
      }
    });

    console.log('🎭 [MockPaymentService] Initialized with mock data');
  }

  async createPaymentLink(request: PaymentRequest): Promise<PaymentLink> {
    try {
      console.log('🎭 [MockPaymentService] Creating mock payment link for order:', request.orderId);
      
      // Calculate total amount (service + installation) in cents
      const serviceAmount = request.servicePackage.price * 100;
      const installationAmount = (request.servicePackage.installationFee || 0) * 100;
      const totalAmount = serviceAmount + installationAmount;

      // Generate mock checkout ID and URL
      const checkoutId = `mock_checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const peachCheckoutId = `mock_peach_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      // Use custom payment page with pre-filled data
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const amountZAR = (totalAmount / 100).toFixed(2);
      const params = new URLSearchParams({
        amount: amountZAR,
        email: request.customerEmail,
        reference: peachCheckoutId, // Use mock Peach reference for customer display
        orderId: request.orderId,
        checkoutId: peachCheckoutId,
        entityId: 'mock_entity_id'
      });
      const paymentUrl = `${clientUrl}/payment?${params.toString()}`;

      // Store payment link in database (same as real service)
      await this.db.query(
        `INSERT INTO payment_links (id, order_id, customer_id, peach_checkout_id, url, amount_cents, currency, status, expires_at, customer_email, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          checkoutId,
          request.orderId,
          request.customerId,
          peachCheckoutId,
          paymentUrl,
          totalAmount,
          'ZAR',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
          request.customerEmail
        ]
      );

      console.log('🎭 [MockPaymentService] Mock payment link created:', {
        checkoutId,
        peachCheckoutId,
        amount: totalAmount / 100,
        currency: 'ZAR'
      });

      return {
        id: checkoutId,
        url: paymentUrl,
        checkoutId: peachCheckoutId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };
    } catch (error) {
      console.error('🎭 [MockPaymentService] Failed to create mock payment link:', error);
      throw new Error(`Failed to create mock payment link: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async sendPaymentEmail(request: PaymentRequest, paymentLink: PaymentLink): Promise<void> {
    try {
      console.log('🎭 [MockPaymentService] Sending mock payment email to:', request.customerEmail);
      
      const template = request.orderType === 'new_install' 
        ? this.getNewInstallationTemplate(request, paymentLink)
        : this.getServiceChangeTemplate(request, paymentLink);

      // Use main server's email API (same as resend function)
      try {
        const axios = (await import('axios')).default;
        const response = await axios.post(`${process.env.OMS_SERVER_URL || 'http://localhost:3003'}/email/send`, {
          to: request.customerEmail,
          subject: `[MOCK] ${template.subject}`,
          html: this.addMockBanner(template.html),
          text: `[MOCK MODE - Test Email]\n\n${template.text}`
        }, {
          headers: {
            'x-service-api-key': process.env.ONBOARDING_SERVICE_API_KEY || 'secure-service-key-change-in-production'
          }
        });

        if (response.data.success) {
          console.log('✅ [MockPaymentService] Email sent successfully via main server');
        } else {
          console.error('❌ [MockPaymentService] Email sending failed:', response.data);
        }
      } catch (emailError) {
        console.error('❌ [MockPaymentService] Failed to send email via main server:', emailError);
        // Fallback: just log the email content
        console.log('🎭 [MockPaymentService] Mock email content (fallback):', {
          to: request.customerEmail,
          subject: template.subject,
          paymentUrl: paymentLink.url
        });
      }

      // Log email sent (same as real service)
      await this.db.query(
        `INSERT INTO payment_notifications (payment_link_id, customer_email, notification_type, status, sent_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [paymentLink.id, request.customerEmail, 'payment_request', 'sent']
      );

      console.log(`🎭 [MockPaymentService] Mock payment email processed for order ${request.orderId}`);
    } catch (error) {
      console.error('🎭 [MockPaymentService] Failed to send mock payment email:', error);
      throw new Error('Failed to send mock payment email');
    }
  }

  private addMockBanner(html: string): string {
    const mockBanner = `
      <div style="background: #fbbf24; color: #92400e; padding: 15px; text-align: center; font-weight: bold; margin-bottom: 20px; border-radius: 8px;">
        🎭 MOCK PAYMENT MODE - This is a test email for development purposes
      </div>
    `;
    return html.replace('<div class="content">', `${mockBanner}<div class="content">`);
  }

  async getPaymentStatus(paymentLinkId: string): Promise<any> {
    try {
      console.log('🎭 [MockPaymentService] Getting mock payment status for:', paymentLinkId);
      
      // Get payment link from database
      const result = await this.db.query(
        'SELECT * FROM payment_links WHERE id = $1 OR peach_checkout_id = $1',
        [paymentLinkId]
      );

      if (result.rows.length === 0) {
        throw new Error('Payment link not found');
      }

      const paymentRecord = result.rows[0];
      
      // Simulate different payment statuses based on time or random
      const mockStatuses = ['pending', 'completed', 'failed'];
      const randomStatus = mockStatuses[Math.floor(Math.random() * mockStatuses.length)];
      
      // For demo purposes, let's make most payments "completed" after 30 seconds
      const createdAt = new Date(paymentRecord.created_at);
      const now = new Date();
      const ageInSeconds = (now.getTime() - createdAt.getTime()) / 1000;
      
      let status = 'pending';
      if (ageInSeconds > 30) {
        status = Math.random() > 0.2 ? 'completed' : 'failed'; // 80% success rate
      }

      const mockResponse = {
        id: paymentRecord.id,
        checkoutId: paymentRecord.peach_checkout_id,
        status: status,
        amount: (paymentRecord.amount_cents / 100).toFixed(2),
        currency: paymentRecord.currency,
        timestamp: now.toISOString(),
        result: {
          code: status === 'completed' ? '000.100.110' : 
                status === 'failed' ? '800.400.500' : '000.200.000',
          description: status === 'completed' ? 'Request successfully processed' :
                      status === 'failed' ? 'Transaction declined' : 'Transaction pending'
        },
        mockData: true
      };

      console.log('🎭 [MockPaymentService] Mock payment status:', mockResponse);
      return mockResponse;
    } catch (error) {
      console.error('🎭 [MockPaymentService] Failed to get mock payment status:', error);
      throw new Error('Failed to get mock payment status');
    }
  }

  async handleWebhook(webhookData: any): Promise<void> {
    try {
      console.log('🎭 [MockPaymentService] Processing mock webhook:', webhookData);
      
      const checkoutId = webhookData.id || webhookData.checkoutId;
      const status = webhookData.status || 'completed';
      
      if (!checkoutId) {
        console.warn('🎭 [MockPaymentService] Mock webhook received without checkout ID');
        return;
      }

      // Log webhook event
      await this.db.query(
        `INSERT INTO payment_webhook_events (peach_checkout_id, event_type, event_data, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [checkoutId, 'mock_payment_status_update', JSON.stringify({ ...webhookData, mockData: true })]
      );

      // Update payment status in database
      await this.db.query(
        `UPDATE payment_links SET status = $1, updated_at = NOW() WHERE peach_checkout_id = $2`,
        [status, checkoutId]
      );

      if (status === 'completed') {
        await this.handlePaymentSuccess({ id: checkoutId, ...webhookData });
      } else if (status === 'failed') {
        await this.handlePaymentFailure({ id: checkoutId, ...webhookData });
      }

      console.log(`🎭 [MockPaymentService] Mock webhook processed for checkout ${checkoutId}, status: ${status}`);
    } catch (error) {
      console.error('🎭 [MockPaymentService] Mock webhook handling failed:', error);
      throw error;
    }
  }

  private async handlePaymentSuccess(webhookData: any): Promise<void> {
    try {
      const result = await this.db.query(
        'SELECT order_id FROM payment_links WHERE peach_checkout_id = $1',
        [webhookData.id]
      );

      if (result.rows.length === 0) {
        console.warn(`🎭 [MockPaymentService] No order found for mock checkout ${webhookData.id}`);
        return;
      }

      const orderId = result.rows[0].order_id;

      // Update payment_links table
      await this.db.query(
        `UPDATE payment_links SET status = $1, paid_at = NOW() WHERE peach_checkout_id = $2`,
        ['paid', webhookData.id]
      );

      // Update orders table to set isPaid = true
      await this.db.query(
        `UPDATE orders SET is_paid = $1, updated_at = NOW() WHERE id = $2`,
        [true, orderId]
      );

      console.log(`🎭 [MockPaymentService] Mock payment completed for order ${orderId} - isPaid set to true`);
    } catch (error) {
      console.error('🎭 [MockPaymentService] Failed to handle mock payment success:', error);
    }
  }

  private async handlePaymentFailure(webhookData: any): Promise<void> {
    try {
      const result = await this.db.query(
        'SELECT order_id FROM payment_links WHERE peach_checkout_id = $1',
        [webhookData.id]
      );

      if (result.rows.length === 0) {
        console.warn(`🎭 [MockPaymentService] No order found for mock checkout ${webhookData.id}`);
        return;
      }

      const orderId = result.rows[0].order_id;
      console.log(`🎭 [MockPaymentService] Mock payment failed for order ${orderId}`);
    } catch (error) {
      console.error('🎭 [MockPaymentService] Failed to handle mock payment failure:', error);
    }
  }

  // Email templates (same as real service)
  private getNewInstallationTemplate(request: PaymentRequest, paymentLink: PaymentLink) {
    const { servicePackage, serviceAddress, customerName } = request;
    const installationFee = servicePackage.installationFee || 0;
    const total = servicePackage.price + installationFee;

    return {
      subject: `Complete Your Payment - New Internet Installation`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Xnext - Complete Your Payment</title>
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              line-height: 1.6; 
              color: #ffffff; 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
              min-height: 100vh;
            }
            .email-container {
              background: rgba(255, 255, 255, 0.05);
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 20px;
              overflow: hidden;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            }
            .header { 
              background: linear-gradient(45deg, #ff6b35, #ff8c42); 
              color: white; 
              padding: 30px; 
              text-align: center; 
            }
            .logo {
              font-size: 2.5em;
              font-weight: bold;
              margin-bottom: 10px;
              text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            .tagline {
              font-size: 1.1em;
              opacity: 0.9;
              margin-bottom: 15px;
            }
            .content { 
              background: rgba(255, 255, 255, 0.03); 
              padding: 30px; 
              color: #ffffff;
            }
            .package-details { 
              background: rgba(255, 255, 255, 0.05); 
              padding: 25px; 
              border-radius: 12px; 
              margin: 20px 0; 
              border-left: 4px solid #ff6b35;
              border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .price-breakdown { 
              background: rgba(255, 255, 255, 0.05); 
              padding: 25px; 
              border-radius: 12px; 
              margin: 20px 0;
              border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .price-row { 
              display: flex; 
              justify-content: space-between; 
              padding: 12px 0; 
              border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            .price-total { 
              font-weight: bold; 
              font-size: 1.3em; 
              color: #ff6b35;
              border-bottom: none;
              padding-top: 15px;
            }
            .cta-button { 
              display: inline-block; 
              background: linear-gradient(45deg, #ff6b35, #ff8c42); 
              color: white; 
              padding: 18px 35px; 
              text-decoration: none; 
              border-radius: 12px; 
              font-weight: bold; 
              margin: 25px 0;
              box-shadow: 0 4px 15px rgba(255, 107, 53, 0.3);
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .address { 
              background: rgba(255, 255, 255, 0.03); 
              padding: 20px; 
              border-radius: 10px; 
              margin: 15px 0;
              border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .footer { 
              text-align: center; 
              margin-top: 30px; 
              padding-top: 20px; 
              border-top: 1px solid rgba(255, 255, 255, 0.1); 
              color: #b0b0b0; 
              font-size: 0.9em; 
            }
            .steps {
              background: rgba(255, 255, 255, 0.03);
              padding: 20px;
              border-radius: 10px;
              margin: 20px 0;
              border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .steps ul {
              padding-left: 0;
              list-style: none;
            }
            .steps li {
              padding: 8px 0;
              padding-left: 30px;
              position: relative;
            }
            .steps li:before {
              content: "✓";
              position: absolute;
              left: 0;
              color: #ff6b35;
              font-weight: bold;
            }
            h3 {
              color: #ff6b35;
              margin-bottom: 15px;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <div class="logo">Xnext</div>
              <div class="tagline">Connecting You to Tomorrow</div>
              <h2 style="margin: 0; font-size: 1.4em;">🌐 New Internet Installation</h2>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Complete your payment to proceed with installation</p>
            </div>
          
          <div class="content">
            <h2>Hi ${customerName},</h2>
            <p>Thank you for choosing our internet services! Your new installation order is ready for payment.</p>
            
            <div class="package-details">
              <h3>📦 Service Package</h3>
              <p><strong>${servicePackage.name}</strong></p>
              <p>Speed: <strong>${servicePackage.speed}</strong></p>
              <p>Monthly Fee: <strong>R${servicePackage.price.toFixed(2)}</strong></p>
              ${servicePackage.installationType ? `<p>Installation: <strong>${servicePackage.installationType}</strong></p>` : ''}
            </div>

            <div class="address">
              <h4>📍 Installation Address</h4>
              <p>${serviceAddress.street}<br>
              ${serviceAddress.city}, ${serviceAddress.province}<br>
              ${serviceAddress.postalCode}</p>
            </div>

            <div class="price-breakdown">
              <h3>💰 Payment Breakdown</h3>
              <div class="price-row">
                <span>Monthly Service Fee</span>
                <span>R${servicePackage.price.toFixed(2)}</span>
              </div>
              ${installationFee > 0 ? `
              <div class="price-row">
                <span>Installation Fee</span>
                <span>R${installationFee.toFixed(2)}</span>
              </div>` : ''}
              <div class="price-row price-total">
                <span>Total Amount</span>
                <span>R${total.toFixed(2)}</span>
              </div>
            </div>

            <div style="text-align: center;">
              <a href="${paymentLink.url}" class="cta-button">💳 Pay Now - R${total.toFixed(2)}</a>
            </div>

            <div class="steps">
              <h3>What happens next?</h3>
              <ul>
                <li>Complete your payment using the secure link above</li>
                <li>Our team will contact you within 24 hours to schedule installation</li>
                <li>Professional installation at your premises</li>
                <li>Enjoy high-speed internet!</li>
              </ul>
            </div>

            <div class="footer">
              <p><strong>Xnext Internet Services</strong></p>
              <p>📧 support@xnext.co.za | 📞 (011) 123-4567</p>
              <p>Order #${request.orderId}</p>
              <p style="margin-top: 15px; font-size: 0.8em; opacity: 0.7;">This payment link expires in 24 hours for security purposes.</p>
            </div>
          </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${customerName},

Thank you for choosing our internet services! Your new installation order is ready for payment.

Service Package: ${servicePackage.name}
Speed: ${servicePackage.speed}
Monthly Fee: R${servicePackage.price.toFixed(2)}

Installation Address:
${serviceAddress.street}
${serviceAddress.city}, ${serviceAddress.province}
${serviceAddress.postalCode}

Payment Breakdown:
- Monthly Service Fee: R${servicePackage.price.toFixed(2)}
${installationFee > 0 ? `- Installation Fee: R${installationFee.toFixed(2)}` : ''}
Total Amount: R${total.toFixed(2)}

Complete your payment: ${paymentLink.url}

What happens next?
1. Complete your payment using the secure link above
2. Our team will contact you within 24 hours to schedule installation
3. Professional installation at your premises
4. Enjoy high-speed internet!

This payment link expires in 24 hours.

Order #${request.orderId}
Xnext Internet Services
Need help? Contact us at support@xnext.co.za
      `
    };
  }

  private getServiceChangeTemplate(request: PaymentRequest, paymentLink: PaymentLink) {
    const { servicePackage, serviceAddress, customerName } = request;
    const installationFee = servicePackage.installationFee || 0;
    const total = servicePackage.price + installationFee;

    return {
      subject: `Complete Your Payment - Service Change Request`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Required - Service Change</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #7c3aed; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .package-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c3aed; }
            .price-breakdown { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .price-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
            .price-total { font-weight: bold; font-size: 1.2em; color: #7c3aed; }
            .cta-button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .address { background: #f1f5f9; padding: 15px; border-radius: 6px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🔄 Service Change Request</h1>
            <p>Complete your payment to process the service change</p>
          </div>
          
          <div class="content">
            <h2>Hi ${customerName},</h2>
            <p>Your service change request is ready for payment. Complete the payment below to proceed with updating your internet service.</p>
            
            <div class="package-details">
              <h3>📦 New Service Package</h3>
              <p><strong>${servicePackage.name}</strong></p>
              <p>Speed: <strong>${servicePackage.speed}</strong></p>
              <p>New Monthly Fee: <strong>R${servicePackage.price.toFixed(2)}</strong></p>
            </div>

            <div class="address">
              <h4>📍 Service Address</h4>
              <p>${serviceAddress.street}<br>
              ${serviceAddress.city}, ${serviceAddress.province}<br>
              ${serviceAddress.postalCode}</p>
            </div>

            <div class="price-breakdown">
              <h3>💰 Payment Details</h3>
              <div class="price-row">
                <span>New Monthly Service Fee</span>
                <span>R${servicePackage.price.toFixed(2)}</span>
              </div>
              ${installationFee > 0 ? `
              <div class="price-row">
                <span>Service Change Fee</span>
                <span>R${installationFee.toFixed(2)}</span>
              </div>` : ''}
              <div class="price-row price-total">
                <span>Total Amount</span>
                <span>R${total.toFixed(2)}</span>
              </div>
            </div>

            <div style="text-align: center;">
              <a href="${paymentLink.url}" class="cta-button">💳 Pay Now - R${total.toFixed(2)}</a>
            </div>

            <p><strong>What happens next?</strong></p>
            <ul>
              <li>✅ Complete your payment using the secure link above</li>
              <li>🔄 Our team will process your service change within 24-48 hours</li>
              <li>📞 You'll receive confirmation once the change is complete</li>
              <li>🌐 Start enjoying your updated service!</li>
            </ul>

            <p><em>This payment link expires in 24 hours. If you need assistance, please contact our support team.</em></p>
          </div>

          <div class="footer">
            <p>Xnext Internet Services | Order #${request.orderId}</p>
            <p>Need help? Contact us at support@xnext.co.za</p>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${customerName},

Your service change request is ready for payment.

New Service Package: ${servicePackage.name}
Speed: ${servicePackage.speed}
New Monthly Fee: R${servicePackage.price.toFixed(2)}

Service Address:
${serviceAddress.street}
${serviceAddress.city}, ${serviceAddress.province}
${serviceAddress.postalCode}

Payment Details:
- New Monthly Service Fee: R${servicePackage.price.toFixed(2)}
${installationFee > 0 ? `- Service Change Fee: R${installationFee.toFixed(2)}` : ''}
Total Amount: R${total.toFixed(2)}

Complete your payment: ${paymentLink.url}

What happens next?
1. Complete your payment using the secure link above
2. Our team will process your service change within 24-48 hours
3. You'll receive confirmation once the change is complete
4. Start enjoying your updated service!

This payment link expires in 24 hours.

Order #${request.orderId}
Xnext Internet Services
Need help? Contact us at support@xnext.co.za
      `
    };
  }

  // Mock checkout page endpoint
  async getMockCheckoutPage(checkoutId: string): Promise<string> {
    const result = await this.db.query(
      'SELECT * FROM payment_links WHERE id = $1',
      [checkoutId]
    );

    if (result.rows.length === 0) {
      return '<h1>Payment Link Not Found</h1>';
    }

    const payment = result.rows[0];
    const amount = (payment.amount_cents / 100).toFixed(2);

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';">
          <title>Xnext Payment Checkout</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            min-height: 100vh;
            color: #ffffff;
            padding: 20px;
          }
          
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding-top: 40px;
          }
          
          .header {
            text-align: center;
            margin-bottom: 40px;
          }
          
          .logo {
            font-size: 2.5em;
            font-weight: bold;
            color: #ff6b35;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
          }
          
          .tagline {
            color: #b0b0b0;
            font-size: 1.1em;
            margin-bottom: 20px;
          }
          
          .mock-banner { 
            background: linear-gradient(45deg, #ff6b35, #ff8c42);
            color: #ffffff;
            padding: 15px;
            text-align: center;
            font-weight: bold;
            margin-bottom: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(255, 107, 53, 0.3);
            border: 2px solid rgba(255, 255, 255, 0.1);
          }
          
          .payment-card { 
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          }
          
          .payment-header {
            text-align: center;
            margin-bottom: 30px;
          }
          
          .payment-title {
            font-size: 1.8em;
            font-weight: 600;
            color: #ffffff;
            margin-bottom: 10px;
          }
          
          .amount { 
            font-size: 2.2em;
            font-weight: bold;
            color: #ff6b35;
            text-align: center;
            margin-bottom: 30px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
          }
          
          .form-group { 
            margin-bottom: 20px;
          }
          
          label { 
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #e0e0e0;
            font-size: 0.95em;
          }
          
          input, select { 
            width: 100%;
            padding: 15px;
            border: 2px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.05);
            color: #ffffff;
            font-size: 1em;
            transition: all 0.3s ease;
          }
          
          input:focus, select:focus {
            outline: none;
            border-color: #ff6b35;
            box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
          }
          
          input::placeholder {
            color: #888;
          }
          
          .btn { 
            background: linear-gradient(45deg, #ff6b35, #ff8c42);
            color: white;
            padding: 18px 30px;
            border: none;
            border-radius: 12px;
            font-weight: bold;
            cursor: pointer;
            width: 100%;
            font-size: 1.1em;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(255, 107, 53, 0.3);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .btn:hover { 
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 107, 53, 0.4);
          }
          
          .btn:active {
            transform: translateY(0);
          }
          
          .btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            transform: none;
          }
          
          .security-info {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 15px;
            margin-top: 20px;
            font-size: 0.9em;
            color: #b0b0b0;
            text-align: center;
          }
          
          .card-icons {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-top: 20px;
            opacity: 0.7;
          }
          
          .card-icon {
            width: 40px;
            height: 25px;
            background: #333;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8em;
            color: #fff;
          }
          
          @media (max-width: 768px) {
            .container {
              padding-top: 20px;
            }
            
            .payment-card {
              padding: 25px;
              margin: 10px;
            }
            
            .logo {
              font-size: 2em;
            }
            
            .amount {
              font-size: 1.8em;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Xnext</div>
            <div class="tagline">Connecting You to Tomorrow</div>
          </div>
          
          <div class="mock-banner">
            🎭 DEVELOPMENT MODE - Mock Payment Checkout
          </div>
          
          <div class="payment-card">
            <div class="payment-header">
              <h2 class="payment-title">Complete Your Payment</h2>
              <div class="amount">R${amount}</div>
            </div>
            
            <form id="mockPaymentForm">
              <div class="form-group">
                <label>Card Number</label>
                <input type="text" placeholder="4111 1111 1111 1111" value="4111 1111 1111 1111" readonly>
              </div>
              
              <div style="display: flex; gap: 15px;">
                <div class="form-group" style="flex: 1;">
                  <label>Expiry Date</label>
                  <input type="text" placeholder="12/25" value="12/25" readonly>
                </div>
                
                <div class="form-group" style="flex: 1;">
                  <label>CVV</label>
                  <input type="text" placeholder="123" value="123" readonly>
                </div>
              </div>
              
              <div class="form-group" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 15px; text-align: center;">
                <label style="color: #10b981; margin-bottom: 5px;">🎭 Mock Payment Mode</label>
                <p style="margin: 0; font-size: 0.9em; opacity: 0.8;">This will process a successful payment and update isPaid=true</p>
              </div>
              
              <button type="submit" class="btn">Process Payment</button>
            </form>
            
            <div class="card-icons">
              <div class="card-icon">VISA</div>
              <div class="card-icon">MC</div>
              <div class="card-icon">AMEX</div>
            </div>
            
            <div class="security-info">
              🔒 Your payment information is secure and encrypted
            </div>
          </div>
        </div>

        <script>
          document.getElementById('mockPaymentForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Always process as successful payment for "Pay Now" button
            const result = 'success';
            const btn = document.querySelector('.btn');
            
            btn.textContent = 'Processing Payment...';
            btn.disabled = true;
            
            // Add visual feedback
            btn.style.background = 'linear-gradient(45deg, #10b981, #059669)';
            
            // Simulate realistic payment processing time
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Send successful payment webhook to our server
            try {
              const response = await fetch('/api/payments/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: '${payment.peach_checkout_id}',
                  status: 'completed',
                  result: {
                    code: '000.100.110',
                    description: 'Request successfully processed'
                  },
                  mockData: true
                })
              });
              
              if (response.ok) {
                // Show success state
                btn.textContent = '✅ Payment Successful!';
                btn.style.background = 'linear-gradient(45deg, #10b981, #059669)';
                
                // Show success message
                const successDiv = document.createElement('div');
                successDiv.style.cssText = \`
                  background: linear-gradient(45deg, #10b981, #059669);
                  color: white;
                  padding: 20px;
                  border-radius: 12px;
                  margin-top: 20px;
                  text-align: center;
                  font-weight: bold;
                  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
                \`;
                successDiv.innerHTML = \`
                  <h3 style="margin: 0 0 10px 0;">🎉 Payment Completed Successfully!</h3>
                  <p style="margin: 0; opacity: 0.9;">Your order has been paid and will be processed shortly.</p>
                  <p style="margin: 10px 0 0 0; font-size: 0.9em; opacity: 0.8;">isPaid status has been updated to: <strong>true</strong></p>
                \`;
                
                document.querySelector('.payment-card').appendChild(successDiv);
                
                // Auto-close after showing success
                setTimeout(() => {
                  alert('Payment completed successfully! The order isPaid status has been updated to true.');
                  window.close();
                }, 2000);
              } else {
                throw new Error('Payment processing failed');
              }
            } catch (error) {
              console.error('Error:', error);
              btn.textContent = '❌ Payment Failed';
              btn.style.background = 'linear-gradient(45deg, #ef4444, #dc2626)';
              alert('Error processing payment. Please try again.');
              
              // Reset button after error
              setTimeout(() => {
                btn.textContent = 'Process Payment';
                btn.style.background = 'linear-gradient(45deg, #ff6b35, #ff8c42)';
                btn.disabled = false;
              }, 3000);
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Resend payment email using main server's SMTP
   */
  async resendPaymentEmail(paymentLinkId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🎭 [MockPaymentService] Resending payment email for:', paymentLinkId);

      // Get payment link details from database
      const paymentQuery = await this.db.query(
        `SELECT * FROM payment_links WHERE id = $1`,
        [paymentLinkId]
      );

      if (paymentQuery.rows.length === 0) {
        return { success: false, error: 'Payment link not found' };
      }

      const payment = paymentQuery.rows[0];
      
      if (!payment.customer_email) {
        return { success: false, error: 'Customer email not found' };
      }

      // Call main server's email API
      const axios = require('axios');
      const mainServerUrl = process.env.OMS_SERVER_URL || 'http://localhost:3003';
      
      const emailData = {
        to: payment.customer_email,
        subject: '🔔 Payment Reminder - Complete Your Service Setup',
        html: this.getPaymentReminderTemplate(payment),
        text: `Payment reminder for order ${payment.order_id}. Please complete your payment: ${payment.url}`
      };

      const emailResponse = await axios.post(`${mainServerUrl}/email/send`, emailData, {
        headers: {
          'Content-Type': 'application/json',
          'x-service-api-key': process.env.ONBOARDING_SERVICE_API_KEY
        },
        timeout: 10000
      });

      if (emailResponse.data.success) {
        // Log the resend in payment_notifications
        await this.db.query(
          `INSERT INTO payment_notifications (payment_link_id, customer_email, notification_type, status, sent_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [paymentLinkId, payment.customer_email, 'payment_reminder', 'sent']
        );

        console.log('🎭 [MockPaymentService] Payment reminder email sent successfully');
        return { success: true };
      } else {
        return { success: false, error: emailResponse.data.error || 'Failed to send email' };
      }
    } catch (error: any) {
      console.error('🎭 [MockPaymentService] Error resending payment email:', error);
      return { success: false, error: error.message || 'Failed to resend payment email' };
    }
  }

  /**
   * Generate payment reminder email template
   */
  private getPaymentReminderTemplate(payment: any): string {
    const amountZAR = (payment.amount_cents / 100).toFixed(2);
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">🔔 Payment Reminder</h1>
            <p style="color: #666; margin: 10px 0 0 0;">Complete Your Service Setup</p>
          </div>
          
          <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #f59e0b;">
            <h3 style="margin: 0 0 10px 0; color: #92400e;">⏰ Payment Pending</h3>
            <p style="margin: 0; color: #92400e;">Your payment is still pending. Please complete it to activate your service.</p>
          </div>

          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
            <h3 style="margin: 0 0 15px 0; color: #374151;">📋 Payment Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Order ID:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb;">${payment.order_id}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Amount:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb;">R${amountZAR}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Status:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #f59e0b;">${payment.status.toUpperCase()}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${payment.url}" 
               style="display: inline-block; background-color: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              💳 Complete Payment Now
            </a>
          </div>

          <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin-top: 25px; border-left: 4px solid #ef4444;">
            <p style="margin: 0; color: #dc2626; font-size: 14px;">
              <strong>⚠️ Important:</strong> This payment link will expire soon. Please complete your payment to avoid service delays.
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 12px; margin: 0;">
              Need help? Contact our support team<br>
              This is an automated reminder from Xnext ISP Services
            </p>
          </div>
        </div>
      </div>
    `;
  }
}
