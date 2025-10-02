import axios from 'axios';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type { Pool } from 'pg';

export interface PaymentRequest {
  orderId: string;
  customerId: string;
  customerEmail: string;
  customerName: string;
  orderType: 'new_install' | 'service_change' | 'disconnect';
  servicePackage: {
    name: string;
    speed: string;
    price: number;
    installationFee?: number;
    installationType?: string;
  };
  serviceAddress: {
    street: string;
    city: string;
    province: string;
    postalCode: string;
  };
}

export interface PaymentLink {
  id: string;
  url: string;
  expiresAt: Date;
  checkoutId?: string;
}

export class PaymentService {
  private peachApiUrl: string;
  private peachEntityId: string;
  private peachAccessToken: string;
  private emailTransporter: nodemailer.Transporter;
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
    
    // Initialize Peach Payments
    this.peachApiUrl = process.env.PEACH_API_URL || 'https://eu-test.oppwa.com';
    this.peachEntityId = process.env.PEACH_ENTITY_ID || 'test_entity_id';
    this.peachAccessToken = process.env.PEACH_ACCESS_TOKEN || 'test_access_token';

    // Initialize email transporter
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'noreply@xnext.co.za',
        pass: process.env.SMTP_PASS || 'dummy_password'
      }
    });
  }

  async createPaymentLink(request: PaymentRequest): Promise<PaymentLink> {
    try {
      // Calculate total amount (service + installation) in cents
      const serviceAmount = request.servicePackage.price * 100;
      const installationAmount = (request.servicePackage.installationFee || 0) * 100;
      const totalAmount = serviceAmount + installationAmount;

      // Generate unique checkout ID
      const checkoutId = `checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create Peach Payments checkout
      const checkoutData = {
        entityId: this.peachEntityId,
        amount: (totalAmount / 100).toFixed(2), // Peach expects decimal format
        currency: 'ZAR',
        paymentType: 'DB', // Debit transaction
        merchantTransactionId: request.orderId,
        customer: {
          email: request.customerEmail,
          givenName: request.customerName.split(' ')[0] || 'Customer',
          surname: request.customerName.split(' ').slice(1).join(' ') || 'User'
        },
        billing: {
          street1: request.serviceAddress.street,
          city: request.serviceAddress.city,
          state: request.serviceAddress.province,
          postcode: request.serviceAddress.postalCode,
          country: 'ZA'
        },
        customParameters: {
          orderId: request.orderId,
          customerId: request.customerId,
          orderType: request.orderType,
          servicePackage: request.servicePackage.name
        },
        shopperResultUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/result?checkoutId=${checkoutId}`,
        defaultPaymentMethod: 'CARD'
      };

      // Create checkout with Peach Payments
      const formData = new URLSearchParams();
      formData.append('authentication.userId', this.peachEntityId);
      formData.append('authentication.password', this.peachAccessToken);
      formData.append('authentication.entityId', this.peachEntityId);
      formData.append('entityId', this.peachEntityId);
      formData.append('amount', (totalAmount / 100).toFixed(2));
      formData.append('currency', 'ZAR');
      formData.append('paymentType', 'DB');
      formData.append('merchantTransactionId', request.orderId);
      formData.append('customer.email', request.customerEmail);
      formData.append('customer.givenName', request.customerName.split(' ')[0] || 'Customer');
      formData.append('customer.surname', request.customerName.split(' ').slice(1).join(' ') || 'User');
      formData.append('billing.street1', request.serviceAddress.street);
      formData.append('billing.city', request.serviceAddress.city);
      formData.append('billing.state', request.serviceAddress.province);
      formData.append('billing.postcode', request.serviceAddress.postalCode);
      formData.append('billing.country', 'ZA');
      formData.append('shopperResultUrl', `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/result?checkoutId=${checkoutId}`);
      formData.append('defaultPaymentMethod', 'CARD');

      const response = await axios.post(
        `${this.peachApiUrl}/v1/checkouts`,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (!response.data.id) {
        throw new Error(`Peach Payments checkout creation failed: ${response.data.result?.description || 'Unknown error'}`);
      }

      const peachCheckoutId = response.data.id;
      const paymentUrl = `${this.peachApiUrl}/v1/paymentWidgets.js?checkoutId=${peachCheckoutId}`;

      // Store payment link in database
      await this.db.query(
        `INSERT INTO payment_links (id, order_id, customer_id, peach_checkout_id, url, amount_cents, currency, status, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
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
        ]
      );

      return {
        id: checkoutId,
        url: paymentUrl,
        checkoutId: peachCheckoutId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };
    } catch (error) {
      console.error('[PaymentService] Failed to create payment link:', error);
      throw new Error(`Failed to create payment link: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async sendPaymentEmail(request: PaymentRequest, paymentLink: PaymentLink): Promise<void> {
    try {
      const template = request.orderType === 'new_install' 
        ? this.getNewInstallationTemplate(request, paymentLink)
        : this.getServiceChangeTemplate(request, paymentLink);

      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@xnext.co.za',
        to: request.customerEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      // Log email sent
      await this.db.query(
        `INSERT INTO payment_notifications (payment_link_id, customer_email, notification_type, status, sent_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [paymentLink.id, request.customerEmail, 'payment_request', 'sent']
      );

      console.log(`[PaymentService] Payment email sent to ${request.customerEmail} for order ${request.orderId}`);
    } catch (error) {
      console.error('[PaymentService] Failed to send payment email:', error);
      throw new Error('Failed to send payment email');
    }
  }

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
          <title>Payment Required - New Installation</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .package-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb; }
            .price-breakdown { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .price-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
            .price-total { font-weight: bold; font-size: 1.2em; color: #2563eb; }
            .cta-button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .address { background: #f1f5f9; padding: 15px; border-radius: 6px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🌐 New Internet Installation</h1>
            <p>Complete your payment to proceed with installation</p>
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

            <p><strong>What happens next?</strong></p>
            <ul>
              <li>✅ Complete your payment using the secure link above</li>
              <li>📞 Our team will contact you within 24 hours to schedule installation</li>
              <li>🔧 Professional installation at your premises</li>
              <li>🌐 Enjoy high-speed internet!</li>
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

  async getPaymentStatus(paymentLinkId: string): Promise<any> {
    try {
      // Get payment link from database
      const result = await this.db.query(
        'SELECT * FROM payment_links WHERE id = $1 OR peach_checkout_id = $1',
        [paymentLinkId]
      );

      if (result.rows.length === 0) {
        throw new Error('Payment link not found');
      }

      const paymentRecord = result.rows[0];
      const peachCheckoutId = paymentRecord.peach_checkout_id;

      // Get status from Peach Payments
      const response = await axios.get(
        `${this.peachApiUrl}/v1/checkouts/${peachCheckoutId}/payment`,
        {
          params: {
            'authentication.userId': this.peachEntityId,
            'authentication.password': this.peachAccessToken,
            'authentication.entityId': this.peachEntityId
          }
        }
      );

      const paymentData = response.data;
      let status = 'pending';

      // Map Peach Payments status to our internal status
      if (paymentData.result) {
        const resultCode = paymentData.result.code;
        if (resultCode && /^(000\.000\.|000\.100\.1|000\.[36])/.test(resultCode)) {
          status = 'completed';
        } else if (resultCode && /^(000\.400\.|[4-9]\d{2}\.)/.test(resultCode)) {
          status = 'failed';
        } else if (resultCode && /^(800\.400\.5|100\.400\.500)/.test(resultCode)) {
          status = 'pending';
        }
      }
      
      return {
        id: paymentRecord.id,
        checkoutId: peachCheckoutId,
        status: status,
        amount: paymentData.amount,
        currency: paymentData.currency,
        timestamp: paymentData.timestamp,
        result: paymentData.result
      };
    } catch (error) {
      console.error('[PaymentService] Failed to get payment status:', error);
      throw new Error('Failed to get payment status');
    }
  }

  async handleWebhook(webhookData: any): Promise<void> {
    try {
      // Peach Payments webhook handling
      const checkoutId = webhookData.id;
      const resultCode = webhookData.result?.code;
      
      if (!checkoutId) {
        console.warn('[PaymentService] Webhook received without checkout ID');
        return;
      }

      // Log webhook event
      await this.db.query(
        `INSERT INTO payment_webhook_events (peach_checkout_id, event_type, event_data, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [checkoutId, 'payment_status_update', JSON.stringify(webhookData)]
      );

      // Determine payment status from result code
      let status = 'pending';
      if (resultCode) {
        if (/^(000\.000\.|000\.100\.1|000\.[36])/.test(resultCode)) {
          status = 'completed';
          await this.handlePaymentSuccess(webhookData);
        } else if (/^(000\.400\.|[4-9]\d{2}\.)/.test(resultCode)) {
          status = 'failed';
          await this.handlePaymentFailure(webhookData);
        }
      }

      // Update payment status in database
      await this.db.query(
        `UPDATE payment_links SET status = $1, updated_at = NOW() WHERE peach_checkout_id = $2`,
        [status, checkoutId]
      );

      console.log(`[PaymentService] Webhook processed for checkout ${checkoutId}, status: ${status}`);
    } catch (error) {
      console.error('[PaymentService] Webhook handling failed:', error);
      throw error;
    }
  }

  private async handlePaymentSuccess(webhookData: any): Promise<void> {
    try {
      // Get order ID from payment link
      const result = await this.db.query(
        'SELECT order_id FROM payment_links WHERE peach_checkout_id = $1',
        [webhookData.id]
      );

      if (result.rows.length === 0) {
        console.warn(`[PaymentService] No order found for checkout ${webhookData.id}`);
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

      // Notify order system of payment completion
      console.log(`[PaymentService] Payment completed for order ${orderId}`);
      
      // Here you could trigger the next workflow step
      // await this.notifyOrderSystem(orderId, 'payment_completed');
    } catch (error) {
      console.error('[PaymentService] Failed to handle payment success:', error);
    }
  }

  private async handlePaymentFailure(webhookData: any): Promise<void> {
    try {
      const result = await this.db.query(
        'SELECT order_id FROM payment_links WHERE peach_checkout_id = $1',
        [webhookData.id]
      );

      if (result.rows.length === 0) {
        console.warn(`[PaymentService] No order found for checkout ${webhookData.id}`);
        return;
      }

      const orderId = result.rows[0].order_id;
      
      console.log(`[PaymentService] Payment failed for order ${orderId}:`, webhookData.result?.description);
      
      // Here you could send failure notification email or retry logic
    } catch (error) {
      console.error('[PaymentService] Failed to handle payment failure:', error);
    }
  }

  /**
   * Resend payment email using main server's SMTP
   */
  async resendPaymentEmail(paymentLinkId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[PaymentService] Resending payment email for:', paymentLinkId);

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

        console.log('[PaymentService] Payment reminder email sent successfully');
        return { success: true };
      } else {
        return { success: false, error: emailResponse.data.error || 'Failed to send email' };
      }
    } catch (error: any) {
      console.error('[PaymentService] Error resending payment email:', error);
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
