# Payment Links Testing Guide

Let's test the Payment Links implementation step by step.

## Prerequisites Check

Before we start, ensure you have:

- [ ] Environment variables configured (local or Render)
- [ ] Database migration completed (`002_add_payment_link_url.sql`)
- [ ] Server running (local: `npm run dev` or Render deployed)
- [ ] Postman installed

## Test 1: Verify Server Configuration

### Check Server Logs

When you start the server, you should see:

```bash
[PaymentService] Using PEACH payment service
Server running on port 3004
```

If you see `MOCK` instead of `PEACH`, check your environment variables.

### Quick Health Check

**Request:**
```
GET http://localhost:3004/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "onboarding-service",
  "provider": "peach"
}
```

---

## Test 2: OAuth Token Generation (Automatic)

The service automatically handles OAuth tokens. Let's verify it works:

### Manual OAuth Test (Optional)

**Request:**
```
POST https://dashboard.peachpayments.com/api/oauth/token
```

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "clientId": "6f5eb30f33d19585d1f77523c878be",
  "clientSecret": "feAbk6JjQq8CTgpeO02seuRzdWM0lgxCovPb4leHOyqfvbYG5rCcY7S/HQxQERaAYYBUkv/hA0YIx9VJpm9abw==",
  "merchantId": "53125e15f7644009949defede138a974"
}
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 14400
}
```

**What to Check:**
- ✅ Status: 200 OK
- ✅ `access_token` present
- ✅ `expires_in: 14400` (4 hours)

---

## Test 3: Create Payment Link (Main Test)

This is the core test that will trigger OAuth and Payment Link creation.

### Request: Create Payment Link

```
POST http://localhost:3004/api/payments/create
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer test_api_key_12345
```

**Body:**
```json
{
  "orderId": "test-{{$timestamp}}",
  "customerId": "cust-001",
  "customerEmail": "test@example.com",
  "customerName": "John Doe",
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

**Expected Response:**
```json
{
  "success": true,
  "message": "Payment link created and email sent successfully",
  "paymentLink": {
    "id": "peach_link_1234567890_abc123",
    "url": "http://localhost:5173/payment?amount=1.00&email=test@example.com&reference=test-1234567890&orderId=test-1234567890&paymentLinkUrl=https://l.ppay.io/abc123&paymentLinkId=ad7741e3-bc91-4b07-8cbd-347517f2809e",
    "checkoutId": "ad7741e3-bc91-4b07-8cbd-347517f2809e",
    "expiresAt": "2025-10-22T12:00:00.000Z"
  }
}
```

### What Happens Behind the Scenes

1. **OAuth Token Request** (automatic):
   ```
   POST https://dashboard.peachpayments.com/api/oauth/token
   ```

2. **Payment Link Creation** (automatic):
   ```
   POST https://links.peachpayments.com/api/channels/8ac9a4cc93de56d70193debc70510437/payments
   Authorization: Bearer {oauth_token}
   ```

3. **Database Storage** (automatic):
   ```sql
   INSERT INTO payment_links (id, order_id, peach_checkout_id, payment_link_url, url, ...)
   ```

### Console Logs to Watch For

```bash
[PaymentService] Requesting OAuth token from Peach Payments...
[PaymentService] OAuth token obtained successfully, expires in: 14400 seconds
[PaymentService] Creating Payment Link: { url: '...', amount: '1.00', merchantInvoiceId: 'test-...' }
[PaymentService] Payment Link created successfully: { id: '...', url: 'https://l.ppay.io/...' }
```

### Troubleshooting Test 3

**Issue: 401 Unauthorized**
- Check `PEACHPAYMENTS_USERNAME`, `PEACHPAYMENTS_PASSWORD`, `PEACHPAYMENTS_MERCHANT_ID`
- Verify credentials are correct

**Issue: "Missing Authentication Token"**
- Check `PEACHPAYMENTS_LINKS_BASE_URL=https://links.peachpayments.com`
- Verify `PEACHPAYMENTS_ENTITY_ID=8ac9a4cc93de56d70193debc70510437`

**Issue: "Missing id or url"**
- Check `PEACHPAYMENTS_ENTITY_ID` is correct
- Verify entity has Payment Links enabled

---

## Test 4: Verify Database Storage

After successful Test 3, check the database:

### SQL Queries

```sql
-- Check payment link created
SELECT id, order_id, peach_checkout_id, payment_link_url, status, amount_cents 
FROM payment_links 
ORDER BY created_at DESC 
LIMIT 5;

-- Should show:
-- id: peach_link_...
-- order_id: test-1234567890
-- peach_checkout_id: uuid from Peach
-- payment_link_url: https://l.ppay.io/...
-- status: pending
-- amount_cents: 100 (R1.00)
```

---

## Test 5: Get Payment Status

### Request: Check Payment Status

```
GET http://localhost:3004/api/payments/{paymentLinkId}/status
```

Replace `{paymentLinkId}` with the `id` from Test 3 response.

**Headers:**
```
Authorization: Bearer test_api_key_12345
```

**Expected Response:**
```json
{
  "id": "peach_link_1234567890_abc123",
  "status": "pending",
  "amount": 100,
  "currency": "ZAR",
  "customerEmail": "test@example.com",
  "reference": "ad7741e3-bc91-4b07-8cbd-347517f2809e",
  "url": "http://localhost:5173/payment?..."
}
```

**What to Check:**
- ✅ Status: 200 OK
- ✅ `status: "pending"` (before payment)
- ✅ `amount: 100` (R1.00 in cents)

---

## Test 6: Test Frontend Payment Page

### Start Frontend (if testing locally)

```bash
cd OMS-client
npm run dev
```

### Open Payment URL

1. Copy the `paymentLink.url` from Test 3 response
2. Open in browser: `http://localhost:5173/payment?amount=1.00&email=...&paymentLinkUrl=...`

### Verify Payment Page

- ✅ Shows order details (amount: R1.00, email: test@example.com)
- ✅ Shows "Proceed to Payment" button
- ✅ Amount, email, reference fields are read-only
- ✅ Payment Link URL is embedded in the page

### Test Payment Button

1. Click "Proceed to Payment"
2. Should redirect to: `https://l.ppay.io/...`
3. Browser console should show: `[PaymentPage] Redirecting to Payment Link: ...`

---

## Test 7: Simulate Webhook (Payment Success)

Since webhooks need a public URL, simulate locally:

### Request: Webhook - Successful Payment

```
POST http://localhost:3004/api/payments/webhook
```

**Headers:**
```
Content-Type: application/json
x-peach-signature: test_signature_for_local_testing
```

**Body:**
```json
{
  "payment": {
    "id": "payment-link-id-from-test-3",
    "status": "SUCCESSFUL",
    "merchantInvoiceId": "test-1234567890",
    "amount": 1.00,
    "currency": "ZAR"
  },
  "timestamp": "2025-10-21T12:00:00Z"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Peach webhook processed successfully"
}
```

### Console Logs to Watch For

```bash
[PaymentService] Processing Peach Payment Links webhook
[PaymentService] Webhook data: { paymentId: '...', paymentStatus: 'SUCCESSFUL', merchantInvoiceId: 'test-...' }
[PaymentService] Payment successful, updating order: test-1234567890
[PaymentService] Order updated and OMS notified for: test-1234567890
```

### Database Verification After Webhook

```sql
-- Check payment link status updated
SELECT id, order_id, status, paid_at 
FROM payment_links 
WHERE order_id = 'test-1234567890';

-- Should show: status = 'paid', paid_at = [timestamp]

-- Check order status updated
SELECT id, status, is_paid, paid_at 
FROM orders 
WHERE id = 'test-1234567890';

-- Should show: status = 'payment_received', is_paid = true, paid_at = [timestamp]
```

---

## Test 8: Verify Payment Status After Webhook

### Request: Check Payment Status Again

```
GET http://localhost:3004/api/payments/{paymentLinkId}/status
```

**Expected Response:**
```json
{
  "id": "peach_link_1234567890_abc123",
  "status": "paid",
  "amount": 100,
  "currency": "ZAR",
  "customerEmail": "test@example.com",
  "reference": "ad7741e3-bc91-4b07-8cbd-347517f2809e",
  "url": "http://localhost:5173/payment?..."
}
```

**What to Check:**
- ✅ Status: 200 OK
- ✅ `status: "paid"` (changed from "pending")

---

## Test 9: Test Failed Payment

### Request: Webhook - Failed Payment

```
POST http://localhost:3004/api/payments/webhook
```

**Body:**
```json
{
  "payment": {
    "id": "payment-link-id-from-test-3",
    "status": "FAILED",
    "merchantInvoiceId": "test-1234567890",
    "amount": 1.00,
    "currency": "ZAR",
    "failureReason": "Insufficient funds"
  },
  "timestamp": "2025-10-21T12:05:00Z"
}
```

### Database Verification

```sql
SELECT id, status FROM payment_links WHERE order_id = 'test-1234567890';
-- Should show: status = 'failed'

SELECT id, status FROM orders WHERE id = 'test-1234567890';
-- Should show: status = 'payment_failed'
```

---

## Testing on Render (Production)

### 1. Deploy to Render

Ensure all environment variables are set in Render dashboard.

### 2. Test Payment Link Creation

```
POST https://microservices-oms.onrender.com/api/payments/create
```

Same body as Test 3, but use production URL.

### 3. Configure Webhook in Peach Dashboard

1. Login to Peach Payments Dashboard
2. Go to Webhooks → Payment Links
3. Add endpoint: `https://microservices-oms.onrender.com/api/payments/webhook`
4. Enable signature verification
5. Use secret: `3191ec32f1be5081b1b349f9fbba2924`

### 4. Test Real Payment

1. Create payment link via API
2. Open payment URL in browser
3. Click "Proceed to Payment"
4. Use test card or real card (small amount)
5. Complete payment on Peach page
6. Check webhook received in Render logs
7. Verify database updated

---

## Complete Testing Checklist

- [ ] Server starts without errors
- [ ] OAuth token generation works (automatic)
- [ ] Payment link creation returns 200 OK
- [ ] Payment link URL contains `paymentLinkUrl` parameter
- [ ] Payment link URL starts with `https://l.ppay.io/`
- [ ] Database has new row in `payment_links` with `status='pending'`
- [ ] Get payment status returns pending before webhook
- [ ] Frontend payment page loads correctly
- [ ] Frontend redirects to Payment Link URL
- [ ] Webhook for successful payment returns 200 OK
- [ ] Database updates: `payment_links.status='paid'`, `orders.is_paid=true`
- [ ] Get payment status returns paid after webhook
- [ ] Failed payment webhook updates status to 'failed'
- [ ] OMS notification sent on successful payment

---

## Common Issues & Solutions

### Issue 1: "ECONNREFUSED localhost:3004"
**Solution:** Start the onboarding service: `npm run dev`

### Issue 2: "Database connection failed"
**Solution:** Ensure PostgreSQL is running and `DATABASE_URL` is correct

### Issue 3: "401 Unauthorized" from Peach
**Solution:** 
- Verify sandbox credentials in `.env`
- Check `PEACHPAYMENTS_USERNAME`, `PEACHPAYMENTS_PASSWORD`, `PEACHPAYMENTS_MERCHANT_ID`

### Issue 4: "Missing Authentication Token"
**Solution:**
- Verify `PEACHPAYMENTS_LINKS_BASE_URL=https://links.peachpayments.com`
- Check `PEACHPAYMENTS_ENTITY_ID=8ac9a4cc93de56d70193debc70510437`

### Issue 5: Webhook signature verification fails
**Solution:**
- For local testing, temporarily skip signature verification
- Or ensure `PEACHPAYMENTS_WEBHOOK_SECRET=3191ec32f1be5081b1b349f9fbba2924`

### Issue 6: Payment link not found in database
**Solution:**
- Run database migration: `002_add_payment_link_url.sql`
- Check database connection

---

## Next Steps After Testing

1. **If all tests pass locally:**
   - Deploy to Render
   - Configure webhook in Peach Dashboard
   - Test with real payment (small amount)

2. **If tests fail:**
   - Check environment variables
   - Verify database migration
   - Review server logs for errors
   - Check Peach Payments credentials

3. **Production deployment:**
   - Monitor logs closely
   - Test with small amounts first
   - Verify webhook delivery
   - Check database updates

---

## Support

- **Peach Payments API Docs:** https://developer.peachpayments.com
- **Project Documentation:** See `PEACH_PAYMENTS_README.md` and `TESTING_PAYMENT_LINKS.md`
- **Migration Guide:** See `PAYMENT_LINKS_MIGRATION.md`

Ready to test! Start with Test 1 and work through each step. Let me know if you encounter any issues! 🚀

