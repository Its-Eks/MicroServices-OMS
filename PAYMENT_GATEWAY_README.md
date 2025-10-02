# Payment Gateway Integration

This document describes the payment gateway implementation in the onboarding service.

## Overview

The payment gateway service integrates with Stripe to handle payments for new installations and service changes. It automatically sends payment emails to customers with service package details and pricing.

## Features

- **Stripe Integration**: Secure payment processing using Stripe Payment Links
- **Email Templates**: Beautiful HTML email templates for new installations and service changes
- **Service Package Pricing**: Automatic pricing based on South African ISP packages
- **Webhook Support**: Handles Stripe webhooks for payment status updates
- **Database Tracking**: Tracks payment links, notifications, and webhook events

## API Endpoints

### Create Payment Request
```
POST /api/payments/create
```

**Request Body:**
```json
{
  "orderId": "uuid",
  "customerId": "uuid", 
  "customerEmail": "customer@example.com",
  "customerName": "John Doe",
  "orderType": "new_install", // or "service_change"
  "servicePackage": {
    "name": "Fiber Premium",
    "speed": "100/50 Mbps",
    "price": 749,
    "installationFee": 999,
    "installationType": "professional_install"
  },
  "serviceAddress": {
    "street": "123 Main Street",
    "city": "Cape Town", 
    "province": "western-cape",
    "postalCode": "8001"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentLinkId": "plink_xxx",
    "paymentUrl": "https://checkout.stripe.com/c/pay/xxx",
    "expiresAt": "2025-10-02T14:00:00.000Z",
    "emailSent": true
  }
}
```

### Get Payment Status
```
GET /api/payments/:paymentLinkId/status
```

### Stripe Webhook
```
POST /api/payments/webhook
```

## Service Packages

The system supports the following South African ISP packages:

### Fiber Packages (Uncapped, Best-Effort)
- **20/10 Mbps**: R399/mo, install R0 (self) / R799 (pro)
- **50/50 Mbps**: R599/mo, install R0 / R899
- **100/50 Mbps**: R749/mo, install R0 / R999
- **200/100 Mbps**: R999/mo, pro install R1,199
- **500/250 Mbps**: R1,299/mo, pro install R1,499
- **1000/500 Mbps**: R1,599/mo, pro install R1,699

### Fixed Wireless (LTE/5G, Fair-Use 1-2TB)
- **25/5 Mbps**: R299/mo, install R699 (CPE included)
- **50/10 Mbps**: R449/mo, install R899
- **100/20 Mbps**: R699/mo, install R1,099

## Email Templates

### New Installation Template
- Professional design with service package details
- Installation address and pricing breakdown
- Clear call-to-action button
- Installation process explanation
- 24-hour payment link expiry notice

### Service Change Template
- Similar design adapted for service changes
- Emphasizes upgrade/change benefits
- Service change timeline
- Updated pricing information

## Database Schema

### payment_links
- Stores Stripe payment link information
- Links to orders and customers
- Tracks payment status and expiry

### payment_notifications
- Email notification tracking
- Delivery status and error handling
- Notification type classification

### payment_webhook_events
- Stripe webhook event logging
- Processing status tracking
- Audit trail for debugging

## Environment Variables

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@xnext.co.za
SMTP_PASS=your_password
SMTP_FROM=noreply@xnext.co.za

# Client Configuration
CLIENT_URL=http://localhost:5173
```

## Integration with Order Workflow

The payment gateway integrates with the order workflow as follows:

1. **Order Validated**: When an order reaches "validated" status, a payment request is automatically created
2. **Payment Email Sent**: Customer receives payment email with service details
3. **Payment Completed**: Stripe webhook notifies the system of successful payment
4. **Workflow Continues**: Order proceeds to next step (enrichment/FNO submission)

## Usage Example

```typescript
import { PaymentService } from './services/payment.service';

const paymentService = new PaymentService(db);

// Create payment request
const paymentRequest = {
  orderId: 'order-123',
  customerId: 'customer-456',
  customerEmail: 'john@example.com',
  customerName: 'John Doe',
  orderType: 'new_install',
  servicePackage: {
    name: 'Fiber Premium',
    speed: '100/50 Mbps',
    price: 749,
    installationFee: 999,
    installationType: 'professional_install'
  },
  serviceAddress: {
    street: '123 Main Street',
    city: 'Cape Town',
    province: 'western-cape',
    postalCode: '8001'
  }
};

// Create payment link and send email
const paymentLink = await paymentService.createPaymentLink(paymentRequest);
await paymentService.sendPaymentEmail(paymentRequest, paymentLink);
```

## Security Considerations

- All payment processing is handled by Stripe (PCI compliant)
- Webhook signatures should be verified in production
- Payment links expire after 24 hours
- Email delivery is tracked for audit purposes
- All sensitive data is encrypted in transit

## Testing

To test the payment gateway:

1. Set up Stripe test keys in environment variables
2. Configure SMTP settings for email testing
3. Run the migration to create payment tables
4. Use the API endpoints to create test payment requests
5. Verify email delivery and Stripe dashboard

## Migration

Run the payment tables migration:

```sql
-- Execute onboarding-service/src/migrations/001_payment_tables.sql
```

This creates the necessary tables for payment tracking and email notifications.
