# Quick Start - Testing Payment Links with Your Credentials

## Your Configuration

Your Peach Payments setup is configured for **Production** environment.

### Environment Variables (Already Configured)

```env
# Payment Provider
PAYMENT_PROVIDER=peach

# Peach Payments - Production
PEACHPAYMENTS_BASE_URL=https://api.peachpayments.com
PEACHPAYMENTS_LINKS_BASE_URL=https://links.peachpayments.com
PEACHPAYMENTS_ENTITY_ID=8ac9a4cc93de56d70193debc70510437
PEACHPAYMENTS_MERCHANT_ID=53125e15f7644009949defede138a974
PEACHPAYMENTS_USERNAME=6f5eb30f33d19585d1f77523c878be
PEACHPAYMENTS_PASSWORD="feAbk6JjQq8CTgpeO02seuRzdWM0lgxCovPb4leHOyqfvbYG5rCcY7S/HQxQERaAYYBUkv/hA0YIx9VJpm9abw=="
PEACHPAYMENTS_WEBHOOK_SECRET=3191ec32f1be5081b1b349f9fbba2924

# Server URLs
BASE_URL=https://microservices-oms.onrender.com
CLIENT_URL=https://oms-xnext.vercel.app
```

⚠️ **Important Notes:**
- These are **PRODUCTION** credentials - use carefully!
- Real payments will be processed
- For testing, consider using Peach Payments sandbox first

## Quick Postman Test

### 1. Create Payment Link

**Request:**
```
POST http://localhost:3004/api/payments/create
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer your_api_key_here
```

**Body:**
```json
{
  "orderId": "test-prod-{{$timestamp}}",
  "customerId": "cust-001",
  "customerEmail": "your-test-email@example.com",
  "customerName": "Test Customer",
  "orderType": "new_install",
  "servicePackage": {
    "name": "Fiber 100 Mbps",
    "speed": "100/50 Mbps",
    "price": 1.00,
    "installationFee": 0.00,
    "installationType": "Professional Installation"
  },
  "serviceAddress": {
    "street": "123 Test Street",
    "city": "Cape Town",
    "province": "Western Cape",
    "postalCode": "8001"
  }
}
```

**Note:** Using `price: 1.00` for testing to minimize costs.

**Expected Response:**
```json
{
  "success": true,
  "paymentLink": {
    "id": "peach_link_...",
    "url": "https://oms-xnext.vercel.app/payment?amount=1.00&email=...&paymentLinkUrl=https://l.ppay.io/...",
    "checkoutId": "uuid-here",
    "expiresAt": "2025-10-22T..."
  }
}
```

### 2. What Happens Automatically

When you create a payment link:

1. **OAuth Token Request** (automatic):
   ```
   POST https://dashboard.peachpayments.com/api/oauth/token
   Body: {
     "clientId": "6f5eb30f33d19585d1f77523c878be",
     "clientSecret": "feAbk6JjQq8CTgpeO02seuRzdWM0lgxCovPb4leHOyqfvbYG5rCcY7S/HQxQERaAYYBUkv/hA0YIx9VJpm9abw==",
     "merchantId": "53125e15f7644009949defede138a974"
   }
   ```

2. **Payment Link Creation** (automatic):
   ```
   POST https://links.peachpayments.com/api/channels/8ac9a4cc93de56d70193debc70510437/payments
   Authorization: Bearer {oauth_token}
   Body: {
     "payment": { "amount": 1.00, "currency": "ZAR", "merchantInvoiceId": "..." },
     "customer": { "email": "...", "givenName": "...", "surname": "..." },
     "checkout": {},
     "options": { "notificationUrl": "https://microservices-oms.onrender.com/api/payments/webhook" }
   }
   ```

3. **Returns Short URL**: `https://l.ppay.io/abc123`

### 3. Test the Complete Flow

1. **Copy the payment URL** from the response
2. **Open in browser**: 
   ```
   https://oms-xnext.vercel.app/payment?amount=1.00&email=...&paymentLinkUrl=https://l.ppay.io/...
   ```
3. **Click "Proceed to Payment"**
4. **You'll be redirected** to: `https://l.ppay.io/...`
5. **Enter test card** (if sandbox) or real card (if production)
6. **Peach processes payment**
7. **Webhook sent** to: `https://microservices-oms.onrender.com/api/payments/webhook`
8. **Database updated** automatically

## Webhook Testing

### Simulate Webhook (Local Testing Only)

If testing locally, you can simulate a webhook:

**Request:**
```
POST http://localhost:3004/api/payments/webhook
```

**Headers:**
```
Content-Type: application/json
x-peach-signature: {calculated-hmac}
```

**Body:**
```json
{
  "payment": {
    "id": "payment-link-id-from-step-1",
    "status": "SUCCESSFUL",
    "merchantInvoiceId": "test-prod-1234567890",
    "amount": 1.00,
    "currency": "ZAR"
  },
  "timestamp": "2025-10-21T12:00:00Z"
}
```

### Calculate HMAC Signature (Node.js)

```javascript
const crypto = require('crypto');

const secret = '3191ec32f1be5081b1b349f9fbba2924';
const body = JSON.stringify({
  payment: {
    id: "payment-link-id",
    status: "SUCCESSFUL",
    merchantInvoiceId: "test-prod-1234567890",
    amount: 1.00,
    currency: "ZAR"
  },
  timestamp: "2025-10-21T12:00:00Z"
});

const signature = crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

console.log('x-peach-signature:', signature);
```

## Production Webhook Setup

### In Peach Payments Dashboard:

1. **Login** to Peach Payments Dashboard
2. **Navigate to** Webhooks → Payment Links
3. **Add Endpoint:**
   - URL: `https://microservices-oms.onrender.com/api/payments/webhook`
   - Method: POST
   - Events: All Payment Events
4. **Enable Signature** with secret: `3191ec32f1be5081b1b349f9fbba2924`
5. **Save** and test delivery

## Checking Logs

### Backend Logs (Render)

```bash
# View logs on Render dashboard or via CLI
# Look for:
[PaymentService] Requesting OAuth token from Peach Payments...
[PaymentService] OAuth token obtained successfully, expires in: 14400 seconds
[PaymentService] Creating Payment Link: {...}
[PaymentService] Payment Link created successfully: { id: '...', url: 'https://l.ppay.io/...' }
```

### Database Verification

```sql
-- Check payment link created
SELECT id, order_id, peach_checkout_id, payment_link_url, status, amount_cents 
FROM payment_links 
ORDER BY created_at DESC 
LIMIT 5;

-- Check webhook events received
SELECT peach_checkout_id, event_type, created_at, processed 
FROM payment_webhook_events 
ORDER BY created_at DESC 
LIMIT 10;

-- Check order status after payment
SELECT id, status, is_paid, paid_at 
FROM orders 
WHERE id = 'your-order-id';
```

## Testing Checklist

- [ ] Server running (local or Render)
- [ ] Database migrated (002_add_payment_link_url.sql)
- [ ] Environment variables configured
- [ ] Create payment link via Postman ✓
- [ ] OAuth token obtained automatically ✓
- [ ] Payment link URL received (https://l.ppay.io/...) ✓
- [ ] Frontend payment page loads ✓
- [ ] Redirect to Payment Links works ✓
- [ ] Webhook endpoint configured in Peach Dashboard ✓
- [ ] Test payment with small amount (R1.00) ✓
- [ ] Webhook received and processed ✓
- [ ] Database updated: payment_links.status = 'paid' ✓
- [ ] Database updated: orders.is_paid = true ✓

## Common Issues & Solutions

### Issue 1: OAuth Token Fails

**Error:** `401 Unauthorized` from OAuth endpoint

**Check:**
- Username (Client ID) is correct: `6f5eb30f33d19585d1f77523c878be`
- Password (Client Secret) has quotes removed in code
- Merchant ID is correct: `53125e15f7644009949defede138a974`

**Solution:**
```typescript
// In code, ensure password is used without outer quotes
const clientSecret = process.env.PEACHPAYMENTS_PASSWORD; // Already correct
```

### Issue 2: Payment Link Creation Fails

**Error:** `Missing Authentication Token` or `Invalid Entity ID`

**Check:**
- Links Base URL: `https://links.peachpayments.com` (production)
- Entity ID: `8ac9a4cc93de56d70193debc70510437`
- OAuth token was obtained successfully

**Debug:**
```bash
# Check server logs for OAuth token
# Should see: "OAuth token obtained successfully"
```

### Issue 3: Webhook Not Received

**Check:**
- Webhook URL in Peach Dashboard: `https://microservices-oms.onrender.com/api/payments/webhook`
- Server is accessible (not localhost for production webhooks)
- Webhook secret matches: `3191ec32f1be5081b1b349f9fbba2924`

**Test Webhook Delivery:**
- Peach Dashboard → Webhooks → Test Delivery
- Check server logs for incoming webhook

### Issue 4: Signature Verification Fails

**Error:** `Invalid Peach Payment Links webhook signature`

**Solution:**
- Ensure `PEACHPAYMENTS_WEBHOOK_SECRET=3191ec32f1be5081b1b349f9fbba2924`
- Verify raw request body used for HMAC (not parsed JSON)
- Check header name: `x-peach-signature` or `x-webhook-signature`

## Safety Tips for Production

1. **Start with small amounts** (R1.00) for testing
2. **Monitor logs closely** for first few transactions
3. **Check database** after each test payment
4. **Use test email addresses** you control
5. **Document successful test** before rolling out to customers
6. **Keep credentials secure** - never commit to git
7. **Set up alerts** for payment failures
8. **Monitor OAuth token refresh** (every 4 hours)

## Next Steps

1. ✅ Test locally with Postman (use small amount)
2. ✅ Verify OAuth token generation
3. ✅ Check payment link creation
4. ✅ Configure webhook in Peach Dashboard
5. ✅ Test end-to-end payment flow
6. ✅ Verify database updates
7. ✅ Test with real card (small amount)
8. 🚀 Deploy to production when confident

## Support

- **Peach Payments Support:** For credential or API issues
- **Technical Issues:** Check `TESTING_PAYMENT_LINKS.md` for detailed troubleshooting
- **Webhook Issues:** Review `PEACH_PAYMENTS_README.md` webhook section

---

**Your Setup:** Production-ready with real credentials
**Entity ID:** 8ac9a4cc93de56d70193debc70510437
**Merchant ID:** 53125e15f7644009949defede138a974
**Webhook Secret:** 3191ec32f1be5081b1b349f9fbba2924

Ready to test! 🚀

