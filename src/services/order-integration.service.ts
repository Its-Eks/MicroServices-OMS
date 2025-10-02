import type { Pool } from 'pg';
import { PaymentService, PaymentRequest } from './payment.service.js';

export interface OrderData {
  id: string;
  orderNumber: string;
  customerId: string;
  orderType: 'new_install' | 'service_change' | 'disconnect';
  status: string;
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
  customer: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export class OrderIntegrationService {
  private db: Pool;
  private paymentService: PaymentService;

  constructor(db: Pool) {
    this.db = db;
    this.paymentService = new PaymentService(db);
  }

  /**
   * Trigger payment request when order reaches validated status
   */
  async handleOrderValidated(orderData: OrderData): Promise<void> {
    try {
      console.log(`[OrderIntegration] Processing validated order: ${orderData.id}`);

      // Create payment request
      const paymentRequest: PaymentRequest = {
        orderId: orderData.id,
        customerId: orderData.customerId,
        customerEmail: orderData.customer.email,
        customerName: `${orderData.customer.firstName} ${orderData.customer.lastName}`,
        orderType: orderData.orderType,
        servicePackage: orderData.servicePackage,
        serviceAddress: orderData.serviceAddress
      };

      // Create payment link and send email
      const paymentLink = await this.paymentService.createPaymentLink(paymentRequest);
      await this.paymentService.sendPaymentEmail(paymentRequest, paymentLink);

      console.log(`[OrderIntegration] Payment request sent for order: ${orderData.id}`);
    } catch (error) {
      console.error(`[OrderIntegration] Failed to process order validation: ${orderData.id}`, error);
      throw error;
    }
  }

  /**
   * Handle payment completion and trigger next workflow step
   */
  async handlePaymentCompleted(orderId: string): Promise<void> {
    try {
      console.log(`[OrderIntegration] Processing payment completion for order: ${orderId}`);

      // Update order status to indicate payment received
      // This could trigger the next step in the workflow (e.g., enrichment)
      await this.notifyMainOMS(orderId, 'payment_completed');

      console.log(`[OrderIntegration] Payment completion processed for order: ${orderId}`);
    } catch (error) {
      console.error(`[OrderIntegration] Failed to process payment completion: ${orderId}`, error);
      throw error;
    }
  }

  /**
   * Notify main OMS of payment status changes
   */
  private async notifyMainOMS(orderId: string, event: string): Promise<void> {
    try {
      const mainOmsUrl = process.env.MAIN_OMS_URL || 'http://localhost:3003';
      
      // In a real implementation, you would make an HTTP request to the main OMS
      // For now, we'll just log the notification
      console.log(`[OrderIntegration] Would notify main OMS: ${mainOmsUrl}/webhooks/payment/${event}`, {
        orderId,
        event,
        timestamp: new Date().toISOString()
      });

      // Example implementation:
      // const response = await fetch(`${mainOmsUrl}/webhooks/payment/${event}`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${process.env.API_KEY}`
      //   },
      //   body: JSON.stringify({
      //     orderId,
      //     event,
      //     timestamp: new Date().toISOString()
      //   })
      // });
      
      // if (!response.ok) {
      //   throw new Error(`Failed to notify main OMS: ${response.statusText}`);
      // }
    } catch (error) {
      console.error('[OrderIntegration] Failed to notify main OMS:', error);
      // Don't throw here - we don't want payment processing to fail if notification fails
    }
  }

  /**
   * Parse service package information from order data
   */
  private parseServicePackage(orderData: any): OrderData['servicePackage'] {
    const serviceDetails = orderData.serviceDetails || orderData.service_details || {};
    const bandwidth = serviceDetails.bandwidth || serviceDetails.service_package || 'Unknown';
    
    // Parse South African packages
    const packageMap: Record<string, { name: string; speed: string; price: number; installationFee?: number }> = {
      '20/10': { name: 'Fiber Basic', speed: '20/10 Mbps', price: 399, installationFee: 0 },
      '50/50': { name: 'Fiber Standard', speed: '50/50 Mbps', price: 599, installationFee: 0 },
      '100/50': { name: 'Fiber Premium', speed: '100/50 Mbps', price: 749, installationFee: 0 },
      '200/100': { name: 'Fiber Pro', speed: '200/100 Mbps', price: 999, installationFee: 1199 },
      '500/250': { name: 'Fiber Ultra', speed: '500/250 Mbps', price: 1299, installationFee: 1499 },
      '1000/500': { name: 'Fiber Max', speed: '1000/500 Mbps', price: 1599, installationFee: 1699 },
      '25/5': { name: 'Wireless Basic', speed: '25/5 Mbps', price: 299, installationFee: 699 },
      '50/10': { name: 'Wireless Standard', speed: '50/10 Mbps', price: 449, installationFee: 899 },
      '100/20': { name: 'Wireless Premium', speed: '100/20 Mbps', price: 699, installationFee: 1099 }
    };

    const packageInfo = packageMap[bandwidth] || {
      name: 'Custom Package',
      speed: bandwidth,
      price: 599, // Default price
      installationFee: 799
    };

    return {
      ...packageInfo,
      installationType: serviceDetails.installationType || 'professional_install'
    };
  }

  /**
   * Create order data from various input formats
   */
  createOrderData(rawOrderData: any): OrderData {
    return {
      id: rawOrderData.id,
      orderNumber: rawOrderData.order_number || rawOrderData.orderNumber,
      customerId: rawOrderData.customer_id || rawOrderData.customerId,
      orderType: rawOrderData.order_type || rawOrderData.orderType || 'new_install',
      status: rawOrderData.status || rawOrderData.current_state,
      servicePackage: this.parseServicePackage(rawOrderData),
      serviceAddress: {
        street: rawOrderData.service_address?.street || rawOrderData.serviceAddress?.street || '',
        city: rawOrderData.service_address?.city || rawOrderData.serviceAddress?.city || '',
        province: rawOrderData.service_address?.province || rawOrderData.serviceAddress?.province || '',
        postalCode: rawOrderData.service_address?.postal_code || rawOrderData.service_address?.postalCode || rawOrderData.serviceAddress?.postalCode || ''
      },
      customer: {
        firstName: rawOrderData.customer?.first_name || rawOrderData.customer?.firstName || 'Customer',
        lastName: rawOrderData.customer?.last_name || rawOrderData.customer?.lastName || '',
        email: rawOrderData.customer?.email || ''
      }
    };
  }
}
