# Peach Payments Integration (Payment Links)

This document describes the Peach Payments Payment Links integration for the onboarding service.

## Overview

- **Payment Links API**: Simple link-based payments with Peach Payments
- **OAuth Authentication**: Uses OAuth 2.0 for secure API access
- **Webhook-based**: All payment status updates come via webhooks
- **Short URLs**: Returns short payment links like `https://l.ppay.io/...`

For detailed implementation guide, see [PEACHPAYMENTS_LINKS_GUIDE.md](./PEACHPAYMENTS_LINKS_GUIDE.md)

## Environment Variables

### Required (Production)

```env
PAYMENT_PROVIDER=peach

# OAuth Credentials
PEACHPAYMENTS_USERNAME=your_payment_links_client_id
PEACHPAYMENTS_PASSWORD=your_payment_links_client_secret
PEACHPAYMENTS_MERCHANT_ID=your_merchant_id
PEACHPAYMENTS_ENTITY_ID=your_entity_id

# API Endpoints
PEACHPAYMENTS_LINKS_BASE_URL=https://links.peachpayments.com
PEACHPAYMENTS_BASE_URL=https://api.peachpayments.com

# Webhook Security
PEACHPAYMENTS_WEBHOOK_SECRET=your_webhook_secret

# Application URLs
BASE_URL=https://microservices-oms.onrender.com
CLIENT_URL=https://oms-xnext.vercel.app
```

### Optional (Sandbox)

For testing, use sandbox URLs:

```env
PEACHPAYMENTS_LINKS_BASE_URL=https://sandbox-links.peachpayments.com
PEACHPAYMENTS_BASE_URL=https://testapi-v2.peachpayments.com
```

**Note:** `PEACHPAYMENTS_USERNAME` and `PEACHPAYMENTS_PASSWORD` are OAuth credentials (Client ID and Client Secret), not user login credentials.

## How It Works

### 1. OAuth Token Management

The service automatically manages OAuth tokens:
- Requests token from OAuth endpoint on first use
- Caches token for its lifetime (typically 4 hours)
- Auto-refreshes when expired
- OAuth endpoints:
  - **Sandbox**: `https://sandbox-dashboard.peachpayments.com/api/oauth/token`
  - **Production**: `https://dashboard.peachpayments.com/api/oauth/token`

### 2. Payment Link Creation

When creating a payment link:

```typescript
POST /api/payments/create
{
  "orderId": "uuid",
  "customerId": "uuid",
  "customerEmail": "customer@example.com",
  "customerName": "John Doe",
  "orderType": "new_install",
  "servicePackage": {
    "name": "Fiber 100",
    "speed": "100/50 Mbps",
    "price": 749,
    "installationFee": 200
  },
  "serviceAddress": { ... }
}
```

The service:
1. Gets OAuth token
2. Calls Payment Links API: `POST /api/channels/{entityId}/payments`
3. Receives short URL: `https://l.ppay.io/abc123`
4. Creates custom payment page URL with embedded link
5. Sends email with payment link

### 3. Payment Flow

1. **Customer receives email** with payment link
2. **Clicks link** → Goes to custom payment page showing order details
3. **Clicks "Proceed to Payment"** → Redirects to Peach Payment Links page
4. **Enters card details** on Peach-hosted page
5. **Payment processed** by Peach Payments
6. **Webhook sent** to `/api/payments/webhook`
7. **Database updated** with payment status
8. **OMS notified** of successful payment

### 4. Webhook Handling

Peach sends webhooks for payment status updates:

**Webhook Payload:**
```json
{
  "payment": {
    "id": "payment-link-id",
    "status": "SUCCESSFUL",
    "merchantInvoiceId": "order-uuid"
  }
}
```

**Status Mapping:**
- `SUCCESSFUL` → `paid`
- `FAILED` → `failed`
- `PENDING` → `pending`

**Signature Verification:**
- HMAC SHA256 with `PEACHPAYMENTS_WEBHOOK_SECRET`
- Header: `x-peach-signature` or `x-webhook-signature`

### 5. Database Schema

**payment_links table:**
```sql
- id: Internal checkout ID
- order_id: Order UUID
- peach_checkout_id: Payment Link ID from Peach
- payment_link_url: Short URL (https://l.ppay.io/...)
- url: Custom payment page URL
- status: pending | paid | failed | expired
- amount_cents: Total amount in cents
- currency: ZAR
- paid_at: Timestamp when paid
```

## API Endpoints

### Create Payment Link
```
POST /api/payments/create
Authorization: Bearer <api-key>
Content-Type: application/json
```

### Get Payment Status
```
GET /api/payments/:paymentLinkId/status
Authorization: Bearer <api-key>
```

### Webhook Handler (Public)
```
POST /api/payments/webhook
Content-Type: application/json
x-peach-signature: <hmac-signature>
```

### Resend Payment Email
```
POST /api/payments/:paymentLinkId/resend
Authorization: Bearer <api-key>
```

## Testing

### 1. Test OAuth Token
```bash
curl -X POST https://sandbox-dashboard.peachpayments.com/api/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "your_client_id",
    "clientSecret": "your_client_secret",
    "merchantId": "your_merchant_id"
  }'
```

### 2. Create Test Payment Link
```bash
curl -X POST http://localhost:3004/api/payments/create \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-order-123",
    "customerId": "test-customer-123",
    "customerEmail": "test@example.com",
    "customerName": "Test User",
    "orderType": "new_install",
    "servicePackage": {
      "name": "Test Package",
      "speed": "100 Mbps",
      "price": 299,
      "installationFee": 0
    },
    "serviceAddress": {
      "street": "123 Test St",
      "city": "Cape Town",
      "province": "Western Cape",
      "postalCode": "8001"
    }
  }'
```

### 3. Test Webhook
```bash
curl -X POST http://localhost:3004/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-peach-signature: your_hmac_signature" \
  -d '{
    "payment": {
      "id": "payment-link-id",
      "status": "SUCCESSFUL",
      "merchantInvoiceId": "test-order-123"
    }
  }'
```

## Troubleshooting

### OAuth Errors

**401 Unauthorized:**
- Check `PEACHPAYMENTS_USERNAME`, `PEACHPAYMENTS_PASSWORD`, and `PEACHPAYMENTS_MERCHANT_ID`
- Ensure credentials have Payment Links access
- Verify using correct OAuth endpoint (sandbox vs production)

**Token Expired:**
- Token auto-refreshes; check logs for refresh errors
- Verify system clock is accurate

### Payment Link Creation Errors

**Missing Authentication Token:**
- Wrong `PEACHPAYMENTS_LINKS_BASE_URL`
- Ensure using `/api/channels/{entityId}/payments` path

**Invalid Entity ID:**
- Verify `PEACHPAYMENTS_ENTITY_ID` matches your account
- Check entity has Payment Links enabled

**Invalid Request Body:**
- Ensure all required fields present: `payment`, `customer`, `checkout`, `options`
- `merchantInvoiceId` must be unique per payment

### Webhook Issues

**Signature Verification Failed:**
- Check `PEACHPAYMENTS_WEBHOOK_SECRET` matches dashboard setting
- Ensure raw request body used for HMAC (no JSON parsing first)
- Verify signature header name (`x-peach-signature` or `x-webhook-signature`)

**Payment Not Updated:**
- Check webhook events table for received webhooks
- Verify `merchantInvoiceId` matches `order_id` in database
- Check logs for payment link lookup errors

### Database Issues

**Payment Link Not Found:**
- Verify `peach_checkout_id` stored correctly
- Check if order created before payment link
- Run migration `002_add_payment_link_url.sql` if column missing

## Migration from Hosted Checkout

If migrating from COPYandPAY hosted checkout:

1. **Update environment variables** (remove old `PEACH_ENDPOINT`, `PEACH_HOSTED_*` vars)
2. **Run database migration**: `002_add_payment_link_url.sql`
3. **Update frontend** to handle `paymentLinkUrl` parameter
4. **Configure webhooks** in Peach dashboard for Payment Links
5. **Test in sandbox** before production deployment

## Security Considerations

1. **OAuth Credentials**: Store securely, never commit to version control
2. **Webhook Secret**: Use strong random value, verify all webhooks
3. **HTTPS Only**: Never use Payment Links over HTTP in production
4. **Signature Verification**: Always verify webhook signatures
5. **Rate Limiting**: Implement rate limits on webhook endpoint

## Support

For issues with:
- **OAuth/API**: Contact Peach Payments support
- **Integration**: Check [PEACHPAYMENTS_LINKS_GUIDE.md](./PEACHPAYMENTS_LINKS_GUIDE.md)
- **Webhooks**: Review webhook events table in database
- **Frontend**: Check browser console and network tab

## Related Documentation

- [PEACHPAYMENTS_LINKS_GUIDE.md](./PEACHPAYMENTS_LINKS_GUIDE.md) - Detailed implementation guide
- [ONBOARDING.md](../ONBOARDING.md) - Service architecture overview
