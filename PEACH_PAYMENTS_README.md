# Peach Payments Integration

This document describes the Peach Payments integration for the onboarding service payment gateway.

## Overview

The payment gateway has been updated to use Peach Payments, a leading South African payment processor that supports local payment methods and is well-suited for South African businesses.

## Features

- **Peach Payments Integration**: Secure payment processing using Peach Payments API
- **Local Payment Methods**: Support for South African cards and payment methods
- **Email Templates**: Beautiful HTML email templates for new installations and service changes
- **Service Package Pricing**: Automatic pricing based on South African ISP packages
- **Webhook Support**: Handles Peach Payments webhooks for payment status updates
- **Database Tracking**: Tracks payment links, notifications, and webhook events

## Peach Payments Configuration

### Environment Variables

```env
# Peach Payments Configuration
PEACH_API_URL=https://eu-test.oppwa.com  # Test environment
PEACH_ENTITY_ID=your_entity_id_here
PEACH_ACCESS_TOKEN=your_access_token_here
PEACH_WEBHOOK_SECRET=your_webhook_secret_here
```

### Production URLs
- **Test Environment**: `https://eu-test.oppwa.com`
- **Production Environment**: `https://eu-prod.oppwa.com`

## API Integration

### Checkout Creation

The service creates a Peach Payments checkout using the following parameters:

```javascript
{
  entityId: 'your_entity_id',
  amount: '749.00', // Decimal format
  currency: 'ZAR',
  paymentType: 'DB', // Debit transaction
  merchantTransactionId: 'order_id',
  customer: {
    email: 'customer@example.com',
    givenName: 'John',
    surname: 'Doe'
  },
  billing: {
    street1: '123 Main Street',
    city: 'Cape Town',
    state: 'western-cape',
    postcode: '8001',
    country: 'ZA'
  },
  shopperResultUrl: 'https://yoursite.com/payment/result',
  defaultPaymentMethod: 'CARD'
}
```

### Payment Status Codes

Peach Payments uses specific result codes to indicate payment status:

- **Success**: `000.000.*`, `000.100.1*`, `000.[36]*`
- **Pending**: `800.400.5*`, `100.400.500`
- **Failed**: `000.400.*`, `[4-9]**.*`

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
  "orderType": "new_install",
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
    "paymentLinkId": "checkout_xxx",
    "paymentUrl": "https://eu-test.oppwa.com/v1/paymentWidgets.js?checkoutId=xxx",
    "checkoutId": "peach_checkout_id",
    "expiresAt": "2025-10-02T14:00:00.000Z",
    "emailSent": true
  }
}
```

### Get Payment Status
```
GET /api/payments/:paymentLinkId/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "checkout_xxx",
    "checkoutId": "peach_checkout_id",
    "status": "completed", // pending, completed, failed
    "amount": "749.00",
    "currency": "ZAR",
    "timestamp": "2025-10-01T14:30:00.000Z",
    "result": {
      "code": "000.000.000",
      "description": "Transaction succeeded"
    }
  }
}
```

### Peach Payments Webhook
```
POST /api/payments/webhook
```

## Database Schema Changes

### payment_links Table
```sql
CREATE TABLE payment_links (
  id VARCHAR(255) PRIMARY KEY,
  order_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  peach_checkout_id VARCHAR(255) NOT NULL UNIQUE, -- Changed from stripe_payment_link_id
  url TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'ZAR',
  status VARCHAR(50) DEFAULT 'pending', -- pending, paid, expired, cancelled, failed
  expires_at TIMESTAMP NOT NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### payment_webhook_events Table
```sql
CREATE TABLE payment_webhook_events (
  id SERIAL PRIMARY KEY,
  peach_checkout_id VARCHAR(255), -- Changed from stripe_event_id
  event_type VARCHAR(100) NOT NULL,
  payment_link_id VARCHAR(255) NULL,
  order_id UUID NULL,
  processed BOOLEAN DEFAULT FALSE,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL
);
```

## Payment Flow

1. **Order Validated**: System creates payment request when order reaches "validated" status
2. **Checkout Creation**: Peach Payments checkout is created with order details
3. **Email Sent**: Customer receives payment email with checkout link
4. **Customer Payment**: Customer completes payment on Peach Payments hosted page
5. **Webhook Received**: Peach Payments sends webhook notification
6. **Status Updated**: System updates payment and order status
7. **Workflow Continues**: Order proceeds to next step

## Email Templates

The email templates have been updated to work with Peach Payments:

- Payment links now point to Peach Payments checkout pages
- South African Rand (ZAR) currency formatting
- Local payment method messaging
- Professional design with service package details

## Testing

### Test Environment Setup

1. **Get Test Credentials**: Register for Peach Payments test account
2. **Configure Environment**: Set test API URL and credentials
3. **Test Cards**: Use Peach Payments test card numbers
4. **Webhook Testing**: Use ngrok or similar for webhook testing

### Test Card Numbers

Peach Payments provides test card numbers for different scenarios:

- **Successful Payment**: `4200000000000000`
- **Failed Payment**: `4000000000000002`
- **Insufficient Funds**: `4000000000000119`

## Security Considerations

- All payment processing is handled by Peach Payments (PCI DSS compliant)
- Webhook signatures should be verified in production
- Payment links expire after 24 hours
- All sensitive data is encrypted in transit
- Customer data is handled according to POPIA compliance

## Migration from Stripe

The migration from Stripe to Peach Payments includes:

1. **API Changes**: Updated to use Peach Payments REST API
2. **Database Schema**: Changed column names from `stripe_*` to `peach_*`
3. **Webhook Handling**: Updated to handle Peach Payments webhook format
4. **Status Mapping**: Updated status codes to match Peach Payments responses
5. **Environment Variables**: Updated configuration for Peach Payments

## Advantages of Peach Payments

- **Local Processing**: Payments processed in South Africa
- **Lower Fees**: Competitive rates for South African merchants
- **Local Support**: South African customer support
- **Compliance**: POPIA and local regulatory compliance
- **Payment Methods**: Support for local cards and payment methods
- **Currency**: Native ZAR processing without conversion fees

## Production Deployment

1. **Update Environment Variables**: Switch to production Peach Payments URLs
2. **Run Migration**: Execute database migration for payment tables
3. **Configure Webhooks**: Set up webhook endpoints in Peach Payments dashboard
4. **Test Integration**: Verify payment flow with test transactions
5. **Monitor Logs**: Set up monitoring for payment processing

## Support and Documentation

- **Peach Payments Documentation**: [https://docs.peachpayments.com](https://docs.peachpayments.com)
- **API Reference**: [https://docs.peachpayments.com/reference](https://docs.peachpayments.com/reference)
- **Support**: Contact Peach Payments support for integration assistance
