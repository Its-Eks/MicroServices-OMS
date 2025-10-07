import axios from 'axios';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import Stripe from 'stripe';
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
  sessionId?: string; // Stripe session ID
}

export class PaymentService {
  private stripe: Stripe | null = null;
  private emailTransporter: nodemailer.Transporter;
  private db: Pool;
  private provider: 'stripe' | 'peach';

  constructor(db: Pool, provider: 'stripe' | 'peach' = (process.env.PAYMENT_PROVIDER === 'peach' ? 'peach' : 'stripe')) {
    this.db = db;
    this.provider = provider;
    
    // Initialize Stripe only if provider is stripe
    if (this.provider === 'stripe') {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        throw new Error('STRIPE_SECRET_KEY is required');
      }
      this.stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2025-09-30.clover', // Use latest stable API version
      });
    }

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

      const successUrl = process.env.SUCCESS_URL || `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/success`;
      const cancelUrl = process.env.CANCEL_URL || `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/cancelled`;

      if (this.provider === 'peach') {
        // Peach COPYandPAY (Hosted Checkout)
        const peachEndpoint = (process.env.PEACH_ENDPOINT || 'https://sandbox-card.peachpayments.com').replace(/\/+$/g, '');
        const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
        const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
        if (!entityId) throw new Error('PEACH_HOSTED_ENTITY_ID is required');
        if (!accessToken) throw new Error('PEACH_HOSTED_ACCESS_TOKEN is required');

        const amountZAR = (totalAmount / 100).toFixed(2);
        const checkoutId = `peach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create checkout (entityId in query string), include success/cancel with {reference}
        const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
        const initResp = await axios.post(createUrl, {
          amount: amountZAR,
          currency: 'ZAR',
          paymentType: 'DB',
          merchantTransactionId: request.orderId,
          customer: {
            email: request.customerEmail,
            givenName: request.customerName
          },
          billing: {
            street1: request.serviceAddress.street,
            city: request.serviceAddress.city,
            state: request.serviceAddress.province,
            postcode: request.serviceAddress.postalCode,
            country: 'ZA'
          },
          successUrl: `${successUrl}?ref={reference}`,
          cancelUrl: `${cancelUrl}?ref={reference}`
        }, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          timeout: 20000
        });

        const ref = initResp.data?.reference || initResp.data?.id || initResp.data?.checkoutId;
        // Build hosted payment page URL explicitly with entityId
        const hostedUrl = ref ? `${peachEndpoint}/v1/checkouts/${encodeURIComponent(ref)}/payment?entityId=${encodeURIComponent(entityId)}` : undefined;
        if (!ref || !hostedUrl) throw new Error('Failed to create Peach checkout');

        await this.db.query(
          `INSERT INTO payment_links (id, order_id, customer_id, peach_checkout_id, stripe_session_id, url, amount_cents, currency, status, expires_at, customer_email, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
          [
            checkoutId,
            request.orderId,
            request.customerId,
            ref,
            null,
            hostedUrl,
            totalAmount,
            'ZAR',
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000),
            request.customerEmail
          ]
        );

        return {
          id: checkoutId,
          url: hostedUrl,
          checkoutId: ref,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        };
      }

      // Stripe branch (legacy)
      const checkoutId = `stripe_checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      if (!this.stripe) throw new Error('Stripe not initialized');
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        {
          price_data: {
            currency: 'zar',
            product_data: {
              name: request.servicePackage.name,
              description: `${request.servicePackage.speed} - ${request.orderType === 'new_install' ? 'New Installation' : 'Service Change'}`,
              metadata: {
                orderId: request.orderId,
                customerId: request.customerId,
                orderType: request.orderType
              }
            },
            unit_amount: serviceAmount,
          },
          quantity: 1,
        }
      ];
      if (installationAmount > 0) {
        lineItems.push({
          price_data: {
            currency: 'zar',
            product_data: {
              name: 'Installation Fee',
              description: request.servicePackage.installationType || 'Professional Installation',
            },
            unit_amount: installationAmount,
          },
          quantity: 1,
        });
      }
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        customer_email: request.customerEmail,
        client_reference_id: request.orderId,
        metadata: {
          orderId: request.orderId,
          customerId: request.customerId,
          orderType: request.orderType,
          servicePackage: request.servicePackage.name,
          checkoutId: checkoutId
        },
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${cancelUrl}?session_id={CHECKOUT_SESSION_ID}`,
        expires_at: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000),
        billing_address_collection: 'required',
        shipping_address_collection: { allowed_countries: ['ZA'] },
        phone_number_collection: { enabled: true },
      });
      if (!session.id || !session.url) {
        throw new Error('Failed to create Stripe checkout session');
      }
      await this.db.query(
        `INSERT INTO payment_links (id, order_id, customer_id, peach_checkout_id, stripe_session_id, url, amount_cents, currency, status, expires_at, customer_email, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          checkoutId,
          request.orderId,
          request.customerId,
          `stripe_migration_${session.id}`,
          session.id,
          session.url,
          totalAmount,
          'ZAR',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000),
          request.customerEmail
        ]
      );
      return { id: checkoutId, url: session.url, sessionId: session.id, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
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

      // Use OMS server's email API instead of direct SMTP
      const omsServerUrl = process.env.OMS_SERVER_URL || 'http://localhost:3003';
      const serviceApiKey = process.env.ONBOARDING_SERVICE_API_KEY || 'oms-svc-auth-x9k2m8n4p7q1w5e8r3t6y9u2i5o8p1a4s7d0f3g6h9j2k5l8';
      
      try {
        // Hosted OMS expects /email/send and header x-service-key
        const emailResponse = await axios.post(`${omsServerUrl}/email/send`, {
          to: request.customerEmail,
          subject: template.subject,
          html: template.html,
          text: template.text
        }, {
          headers: {
            'Content-Type': 'application/json',
            'x-service-key': serviceApiKey
          },
          timeout: 10000
        });

        if (emailResponse.data.success) {
          console.log(`[PaymentService] Payment email sent successfully via OMS server to ${request.customerEmail}`);
        } else {
          throw new Error(`OMS server email failed: ${emailResponse.data.error}`);
        }
      } catch (emailError: any) {
        console.warn('[PaymentService] OMS server email failed, falling back to direct SMTP:', emailError.message);
        
        // Fallback to direct SMTP
        await this.emailTransporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@xnext.co.za',
          to: request.customerEmail,
          subject: template.subject,
          html: template.html,
          text: template.text
        });
        
        console.log(`[PaymentService] Payment email sent via direct SMTP to ${request.customerEmail}`);
      }

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
        'SELECT * FROM payment_links WHERE id = $1 OR stripe_session_id = $1 OR peach_checkout_id = $1',
        [paymentLinkId]
      );

      if (result.rows.length === 0) {
        throw new Error('Payment link not found');
      }

      const paymentRecord = result.rows[0];
      if (this.provider === 'peach') {
        return {
          id: paymentRecord.id,
          status: paymentRecord.status,
          amount: paymentRecord.amount_cents,
          currency: paymentRecord.currency,
          customerEmail: paymentRecord.customer_email,
          reference: paymentRecord.peach_checkout_id,
          url: paymentRecord.url
        };
      }
      if (!this.stripe) throw new Error('Stripe not initialized');
      const stripeSessionId = paymentRecord.stripe_session_id;
      const session = await this.stripe.checkout.sessions.retrieve(stripeSessionId);
      let status = 'pending';
      switch (session.payment_status) {
        case 'paid':
          status = 'completed';
          break;
        case 'unpaid':
          status = session.status === 'expired' ? 'expired' : 'pending';
          break;
        case 'no_payment_required':
          status = 'completed';
          break;
        default:
          status = 'pending';
      }
      return { id: paymentRecord.id, sessionId: stripeSessionId, status, amount: session.amount_total, currency: session.currency?.toUpperCase(), paymentStatus: session.payment_status, sessionStatus: session.status, customerEmail: session.customer_email, paymentIntent: session.payment_intent };
    } catch (error) {
      console.error('[PaymentService] Failed to get payment status:', error);
      throw new Error('Failed to get payment status');
    }
  }

  async handleWebhook(webhookData: any, stripeSignature?: string): Promise<void> {
    try {
      if (this.provider !== 'stripe') {
        throw new Error('handleWebhook is Stripe-only; use handlePeachWebhook for Peach');
      }
      if (!this.stripe) throw new Error('Stripe not initialized');
      let event: Stripe.Event;
      if (stripeSignature) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is required for webhook verification');
        const payload: Buffer | string = Buffer.isBuffer(webhookData) ? (webhookData as Buffer) : JSON.stringify(webhookData);
        if (!Buffer.isBuffer(payload)) console.warn('[PaymentService] Warning: webhook payload is not a Buffer; using JSON string fallback');
        event = this.stripe.webhooks.constructEvent(payload as any, stripeSignature, webhookSecret);
      } else {
        event = webhookData as Stripe.Event;
      }
      const sessionId = (event.data.object as any).id;
      if (!sessionId) { console.warn('[PaymentService] Webhook received without session ID'); return; }
      await this.db.query(
        `INSERT INTO payment_webhook_events (peach_checkout_id, event_type, event_data, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [sessionId, event.type, JSON.stringify(event)]
      );
      switch (event.type) {
        case 'checkout.session.completed':
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.payment_status === 'paid') { await this.handlePaymentSuccess(session); }
          break;
        case 'checkout.session.expired':
          await this.handlePaymentExpired(event.data.object as Stripe.Checkout.Session);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object);
          break;
        default:
          console.log(`[PaymentService] Unhandled webhook event: ${event.type}`);
      }
      console.log(`[PaymentService] Webhook processed for session ${sessionId}, event: ${event.type}`);
    } catch (error) {
      console.error('[PaymentService] Webhook handling failed:', error);
      throw error;
    }
  }

  // Peach: webhook handler with HMAC verification (headers and body)
  async handlePeachWebhook(body: any, headers: Record<string, any>): Promise<void> {
    if (this.provider !== 'peach') throw new Error('Peach webhook called when provider is not peach');
    // NOTE: HMAC details depend on Peach configuration; placeholder verification structure
    const signatureHeader = headers['x-peach-signature'] || headers['x-oppwa-signature'] || headers['x-hmac-signature'];
    const secret = process.env.PEACH_WEBHOOK_SECRET;
    if (secret && signatureHeader) {
      const computed = crypto.createHmac('sha256', secret).update(typeof body === 'string' ? body : JSON.stringify(body)).digest('hex');
      if (computed !== signatureHeader) {
        throw new Error('Invalid Peach webhook signature');
      }
    }
    const ref = body?.reference || body?.id || body?.checkoutId || body?.ndc;
    const code = body?.result?.code || body?.resultCode || body?.result;
    if (!ref) return;
    // Map result codes to status
    const isPaid = typeof code === 'string' && (code.startsWith('000.000') || code.startsWith('000.100'));
    if (isPaid) {
      // Find order by reference
      const res = await this.db.query('SELECT order_id FROM payment_links WHERE peach_checkout_id = $1', [ref]);
      if (res.rows.length === 0) return;
      const orderId = res.rows[0].order_id as string;
      await this.db.query(`UPDATE payment_links SET status = 'paid', paid_at = COALESCE(paid_at, NOW()) WHERE peach_checkout_id = $1`, [ref]);
      await this.db.query(`UPDATE orders SET is_paid = TRUE, status = 'payment_received', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW() WHERE id = $1`, [orderId]);
      await this.notifyOms(orderId, { peachReference: ref });
    }
  }

  /**
   * Confirm a Stripe Checkout Session after redirect without requiring frontend auth.
   */
  async confirmCheckoutSession(sessionId: string): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      if (this.provider !== 'stripe') return { success: false, error: 'Stripe confirmation disabled' };
      if (!this.stripe) throw new Error('Stripe not initialized');
      if (!sessionId) {
        return { success: false, error: 'sessionId is required' };
      }

      // Retrieve session from Stripe
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      // Only proceed if paid
      if (session.payment_status !== 'paid') {
        return { success: false, error: `Session not paid (status=${session.payment_status})` };
      }

      // Resolve orderId via DB, then fallback to client_reference_id or metadata
      let orderId: string | undefined;
      const result = await this.db.query(
        'SELECT order_id FROM payment_links WHERE stripe_session_id = $1',
        [sessionId]
      );
      if (result.rows.length > 0) {
        orderId = result.rows[0].order_id as string;
      } else {
        orderId = (session.client_reference_id as string) || (session.metadata?.orderId as string) || undefined;
      }

      if (!orderId) {
        return { success: false, error: 'Order not associated with session' };
      }

      // Idempotent updates
      await this.db.query(
        `UPDATE payment_links SET status = 'paid', paid_at = COALESCE(paid_at, NOW()) WHERE stripe_session_id = $1`,
        [sessionId]
      );
      await this.db.query(
        `UPDATE orders SET is_paid = TRUE, status = 'payment_received', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW() WHERE id = $1`,
        [orderId]
      );

      await this.notifyOms(orderId, { stripeSessionId: sessionId });

      return { success: true, orderId };
    } catch (error: any) {
      console.error('[PaymentService] confirmCheckoutSession failed:', error);
      return { success: false, error: error.message || 'Failed to confirm session' };
    }
  }

  // Peach: confirm by reference
  async confirmPeachReference(reference: string): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      if (this.provider !== 'peach') return { success: false, error: 'Peach confirmation disabled' };
      if (!reference) return { success: false, error: 'reference is required' };

      const res = await this.db.query('SELECT order_id FROM payment_links WHERE peach_checkout_id = $1', [reference]);
      let orderId: string | undefined = res.rows[0]?.order_id;

      // Query Peach for final status
      const peachEndpoint = (process.env.PEACH_ENDPOINT || 'https://sandbox-card.peachpayments.com').replace(/\/+$/g, '');
      const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
      const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
      if (!entityId || !accessToken) return { success: false, error: 'Missing Peach hosted credentials' };
      const statusUrl = `${peachEndpoint}/v1/checkouts/${encodeURIComponent(reference)}/payment?entityId=${encodeURIComponent(entityId)}`;
      const statusResp = await axios.get(statusUrl, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000, validateStatus: () => true });
      const code = statusResp.data?.result?.code || statusResp.data?.resultCode || statusResp.data?.result;
      const isPaid = typeof code === 'string' && (code.startsWith('000.000') || code.startsWith('000.100'));
      if (!isPaid) return { success: false, error: `Payment status not paid (code=${code || 'unknown'})` };

      if (!orderId) {
        // Fallback: attempt to read merchantTransactionId
        orderId = statusResp.data?.merchantTransactionId || statusResp.data?.merchant?.transactionId;
      }
      if (!orderId) return { success: false, error: 'Order not associated with reference' };

      await this.db.query(`UPDATE payment_links SET status = 'paid', paid_at = COALESCE(paid_at, NOW()) WHERE peach_checkout_id = $1`, [reference]);
      await this.db.query(`UPDATE orders SET is_paid = TRUE, status = 'payment_received', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW() WHERE id = $1`, [orderId]);
      await this.notifyOms(orderId, { peachReference: reference });
      return { success: true, orderId };
    } catch (error: any) {
      console.error('[PaymentService] confirmPeachReference failed:', error);
      return { success: false, error: error.message || 'Failed to confirm reference' };
    }
  }

  private async notifyOms(orderId: string, payload: Record<string, any>): Promise<void> {
    const omsServerUrl = process.env.OMS_SERVER_URL || 'http://localhost:3003';
    const serviceApiKey = process.env.ONBOARDING_SERVICE_API_KEY || 'oms-svc-auth-x9k2m8n4p7q1w5e8r3t6y9u2i5o8p1a4s7d0f3g6h9j2k5l8';
    const body = { orderId, paidAt: new Date().toISOString(), ...payload };
    const headers = { 'Content-Type': 'application/json', 'x-service-key': serviceApiKey } as const;
    const maxRetries = 3;
    const baseDelayMs = 1000;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await axios.post(`${omsServerUrl}/orders/${orderId}/payment/success`, body, { headers, timeout: 10000 });
        console.log(`[PaymentService] OMS notified of payment success for order ${orderId}`);
        break;
      } catch (err: any) {
        const status = err?.response?.status;
        const isTransient = status === 429 || status === 502 || status === 503 || status === 504 || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND';
        if (attempt < maxRetries && isTransient) {
          const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
          console.warn(`[PaymentService] Notify OMS attempt ${attempt + 1} failed (status: ${status || err?.code}). Retrying in ${delay}ms...`);
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }
        console.warn('[PaymentService] Failed to notify OMS of payment success:', err?.message || err);
        break;
      }
    }
  }

  private async handlePaymentSuccess(session: Stripe.Checkout.Session): Promise<void> {
    try {
      // Get order ID from payment link using session ID
      const result = await this.db.query(
        'SELECT order_id FROM payment_links WHERE stripe_session_id = $1',
        [session.id]
      );

      if (result.rows.length === 0) {
        console.warn(`[PaymentService] No order found for session ${session.id}`);
        return;
      }

      const orderId = result.rows[0].order_id;

      // Update payment_links table
      await this.db.query(
        `UPDATE payment_links SET status = $1, paid_at = NOW() WHERE stripe_session_id = $2`,
        ['paid', session.id]
      );

      // Update orders table to set isPaid = true
      await this.db.query(
        `UPDATE orders SET is_paid = $1, updated_at = NOW() WHERE id = $2`,
        [true, orderId]
      );

      // Notify OMS server of payment completion (service-to-service) with retries
      const omsUrl = process.env.OMS_SERVER_URL || 'http://localhost:3003';
      const svcKey = process.env.ONBOARDING_SERVICE_API_KEY || '';
      console.log(`[PaymentService] Payment completed for order ${orderId}, session ${session.id}. OMS_URL=${omsUrl.substring(0, 32)}..., KEY=${svcKey.substring(0, 6)}...`);
      const omsServerUrl = omsUrl;
      const serviceApiKey = svcKey || 'oms-svc-auth-x9k2m8n4p7q1w5e8r3t6y9u2i5o8p1a4s7d0f3g6h9j2k5l8';
      const body = { orderId, stripeSessionId: session.id, paidAt: new Date().toISOString() };
      const headers = { 'Content-Type': 'application/json', 'x-service-key': serviceApiKey } as const;
      const maxRetries = 3;
      const baseDelayMs = 1000;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await axios.post(`${omsServerUrl}/orders/${orderId}/payment/success`, body, { headers, timeout: 10000 });
          console.log(`[PaymentService] OMS notified of payment success for order ${orderId}`);
          break;
        } catch (notifyErr: any) {
          const status = notifyErr?.response?.status;
          const isTransient = status === 429 || status === 502 || status === 503 || status === 504 || notifyErr?.code === 'ECONNRESET' || notifyErr?.code === 'ETIMEDOUT' || notifyErr?.code === 'ENOTFOUND';
          if (attempt < maxRetries && isTransient) {
            const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
            console.warn(`[PaymentService] Notify OMS attempt ${attempt + 1} failed (status: ${status || notifyErr?.code}). Retrying in ${delay}ms...`);
            await new Promise((res) => setTimeout(res, delay));
            continue;
          }
          console.warn('[PaymentService] Failed to notify OMS of payment success:', notifyErr?.message || notifyErr);
          break;
        }
      }
    } catch (error) {
      console.error('[PaymentService] Failed to handle payment success:', error);
    }
  }

  private async handlePaymentFailure(paymentIntent: any): Promise<void> {
    try {
      // Get session ID from payment intent metadata or find by payment intent ID
      const result = await this.db.query(
        `SELECT pl.order_id, pl.stripe_session_id 
         FROM payment_links pl 
         WHERE pl.stripe_session_id IN (
           SELECT id FROM payment_links WHERE stripe_session_id IS NOT NULL
         )`,
        []
      );

      if (result.rows.length === 0) {
        console.warn(`[PaymentService] No order found for payment intent ${paymentIntent.id}`);
        return;
      }

      // Update payment status to failed
      await this.db.query(
        `UPDATE payment_links SET status = $1, updated_at = NOW() WHERE stripe_session_id = $2`,
        ['failed', paymentIntent.id]
      );
      
      console.log(`[PaymentService] Payment failed for payment intent ${paymentIntent.id}:`, paymentIntent.last_payment_error?.message);
      
      // Here you could send failure notification email or retry logic
    } catch (error) {
      console.error('[PaymentService] Failed to handle payment failure:', error);
    }
  }

  private async handlePaymentExpired(session: Stripe.Checkout.Session): Promise<void> {
    try {
      // Update payment status to expired
      await this.db.query(
        `UPDATE payment_links SET status = $1, updated_at = NOW() WHERE stripe_session_id = $2`,
        ['expired', session.id]
      );
      
      console.log(`[PaymentService] Payment session expired: ${session.id}`);
      
      // Here you could send expiration notification email
    } catch (error) {
      console.error('[PaymentService] Failed to handle payment expiration:', error);
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

      // Hosted OMS expects /email/send and header x-service-key
      const emailResponse = await axios.post(`${mainServerUrl}/email/send`, emailData, {
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': process.env.ONBOARDING_SERVICE_API_KEY
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
