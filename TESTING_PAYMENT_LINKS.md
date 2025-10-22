# Testing Payment Links Locally with Postman

This guide walks you through testing the complete Payment Links flow using Postman.

## Prerequisites

1. **Postman** installed
2. **Local server** running on `http://localhost:3004`
3. **Peach Payments Sandbox credentials**:
   - Client ID (PEACHPAYMENTS_USERNAME)
   - Client Secret (PEACHPAYMENTS_PASSWORD)
   - Merchant ID
   - Entity ID
4. **Database** running and migrated

## Environment Setup

### 1. Configure Local Environment Variables

Create/update your `.env` file in `onboarding-service/`:

```env
# Server
PORT=3004
NODE_ENV=development
BASE_URL=http://localhost:3004
CLIENT_URL=http://localhost:5173

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/onboarding_db

# Payment Provider
PAYMENT_PROVIDER=peach

# Peach Payments Sandbox
PEACHPAYMENTS_USERNAME=your_sandbox_client_id
PEACHPAYMENTS_PASSWORD=your_sandbox_client_secret
PEACHPAYMENTS_MERCHANT_ID=your_sandbox_merchant_id
PEACHPAYMENTS_ENTITY_ID=your_sandbox_entity_id
PEACHPAYMENTS_LINKS_BASE_URL=https://sandbox-links.peachpayments.com
PEACHPAYMENTS_BASE_URL=https://testapi-v2.peachpayments.com
PEACHPAYMENTS_WEBHOOK_SECRET=test_webhook_secret_12345

# OMS Integration
OMS_SERVER_URL=http://localhost:3003
ONBOARDING_SERVICE_API_KEY=test_api_key_12345
```

### 2. Start Local Server

```bash
cd onboarding-service
npm install
npm run dev
```

You should see:
```
[PaymentService] Using PEACH payment service
Server running on port 3004
```

## Postman Collection Setup

### Create New Collection: "Payment Links Testing"

## Test 1: OAuth Token Generation (Optional - Auto-handled)

The service automatically handles OAuth tokens, but you can test it manually:

### Request: Get OAuth Token

```
POST https://sandbox-dashboard.peachpayments.com/api/oauth/token
```

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "clientId": "your_sandbox_client_id",
  "clientSecret": "your_sandbox_client_secret",
  "merchantId": "your_sandbox_merchant_id"
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
- ✅ `expires_in` is 14400 (4 hours)

---

## Test 2: Create Payment Link

### Request: Create Payment Link

```
POST http://localhost:3004/api/payments/create
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer test_api_key_12345
```

**Body (raw JSON):**
```json
{
  "orderId": "test-order-{{$timestamp}}",
  "customerId": "test-customer-001",
  "customerEmail": "test@example.com",
  "customerName": "John Doe",
  "orderType": "new_install",
  "servicePackage": {
    "name": "Fiber 100 Mbps",
    "speed": "100/50 Mbps",
    "price": 749.00,
    "installationFee": 200.00,
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
    "url": "http://localhost:5173/payment?amount=949.00&email=test@example.com&reference=test-order-1234567890&orderId=test-order-1234567890&paymentLinkUrl=https://l.ppay.io/abc123&paymentLinkId=ad7741e3-bc91-4b07-8cbd-347517f2809e",
    "checkoutId": "ad7741e3-bc91-4b07-8cbd-347517f2809e",
    "expiresAt": "2025-10-22T12:00:00.000Z"
  }
}
```

**What to Check:**
- ✅ Status: 200 OK or 201 Created
- ✅ `success: true`
- ✅ `paymentLink.url` contains `paymentLinkUrl` parameter
- ✅ `paymentLinkUrl` starts with `https://l.ppay.io/` or `https://sandbox-l.ppay.io/`
- ✅ `checkoutId` is a UUID

**Console Logs to Verify:**
```
[PaymentService] Requesting OAuth token from Peach Payments...
[PaymentService] OAuth token obtained successfully, expires in: 14400 seconds
[PaymentService] Creating Payment Link: { url: '...', amount: '949.00', merchantInvoiceId: 'test-order-...' }
[PaymentService] Payment Link created successfully: { id: '...', url: 'https://l.ppay.io/...' }
```

**Troubleshooting:**

If you get **401 Unauthorized**:
- Verify `PEACHPAYMENTS_USERNAME`, `PEACHPAYMENTS_PASSWORD`, `PEACHPAYMENTS_MERCHANT_ID`
- Check credentials are for sandbox, not production

If you get **"Missing Authentication Token"**:
- Verify `PEACHPAYMENTS_LINKS_BASE_URL` is correct
- Ensure using `/api/channels/{entityId}/payments` path

If you get **"Missing id or url"**:
- Check `PEACHPAYMENTS_ENTITY_ID` is correct
- Verify entity has Payment Links enabled in Peach dashboard

---

## Test 3: Check Payment Status

### Request: Get Payment Status

```
GET http://localhost:3004/api/payments/{paymentLinkId}/status
```

Replace `{paymentLinkId}` with the `id` from Test 2 response (e.g., `peach_link_1234567890_abc123`).

**Headers:**
```
Authorization: Bearer test_api_key_12345
```

**Expected Response:**
```json
{
  "id": "peach_link_1234567890_abc123",
  "status": "pending",
  "amount": 94900,
  "currency": "ZAR",
  "customerEmail": "test@example.com",
  "reference": "ad7741e3-bc91-4b07-8cbd-347517f2809e",
  "url": "http://localhost:5173/payment?..."
}
```

**What to Check:**
- ✅ Status: 200 OK
- ✅ `status: "pending"` (before payment)
- ✅ `amount` in cents (94900 = R949.00)

---

## Test 4: Simulate Webhook (Successful Payment)

Since webhooks need a public URL, you can simulate a webhook locally:

### Request: Webhook - Successful Payment

```
POST http://localhost:3004/api/payments/webhook
```

**Headers:**
```
Content-Type: application/json
x-peach-signature: [calculated-hmac-signature]
```

**Body (raw JSON):**
```json
{
  "payment": {
    "id": "ad7741e3-bc91-4b07-8cbd-347517f2809e",
    "status": "SUCCESSFUL",
    "merchantInvoiceId": "test-order-1234567890",
    "amount": 949.00,
    "currency": "ZAR"
  },
  "timestamp": "2025-10-21T10:30:00Z"
}
```

**Calculate HMAC Signature (Optional for local testing):**

If you want to test signature verification:

```javascript
// In Postman Pre-request Script
const crypto = require('crypto-js');
const secret = 'test_webhook_secret_12345';
const body = JSON.stringify(pm.request.body.raw);
const signature = crypto.HmacSHA256(body, secret).toString();
pm.environment.set('webhook_signature', signature);
```

Then in Headers:
```
x-peach-signature: {{webhook_signature}}
```

**For Quick Testing (Skip Signature Verification):**

Temporarily comment out signature verification in code or set header to any value if secret not configured.

**Expected Response:**
```json
{
  "success": true,
  "message": "Peach webhook processed successfully"
}
```

**What to Check:**
- ✅ Status: 200 OK
- ✅ `success: true`

**Console Logs to Verify:**
```
[PaymentService] Processing Peach Payment Links webhook
[PaymentService] Webhook signature verified (if secret configured)
[PaymentService] Webhook data: { paymentId: '...', paymentStatus: 'SUCCESSFUL', merchantInvoiceId: '...' }
[PaymentService] Payment successful, updating order: test-order-1234567890
[PaymentService] Order updated and OMS notified for: test-order-1234567890
```

**Database Verification:**

Check the database after webhook:

```sql
-- Check payment link status
SELECT id, order_id, status, paid_at 
FROM payment_links 
WHERE order_id = 'test-order-1234567890';

-- Should show: status = 'paid', paid_at = [timestamp]

-- Check order status
SELECT id, status, is_paid, paid_at 
FROM orders 
WHERE id = 'test-order-1234567890';

-- Should show: status = 'payment_received', is_paid = true, paid_at = [timestamp]
```

---

## Test 5: Verify Payment Status After Webhook

### Request: Get Payment Status Again

```
GET http://localhost:3004/api/payments/{paymentLinkId}/status
```

**Expected Response:**
```json
{
  "id": "peach_link_1234567890_abc123",
  "status": "paid",
  "amount": 94900,
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

## Test 6: Simulate Failed Payment

### Request: Webhook - Failed Payment

```
POST http://localhost:3004/api/payments/webhook
```

**Body (raw JSON):**
```json
{
  "payment": {
    "id": "ad7741e3-bc91-4b07-8cbd-347517f2809e",
    "status": "FAILED",
    "merchantInvoiceId": "test-order-1234567890",
    "amount": 949.00,
    "currency": "ZAR",
    "failureReason": "Insufficient funds"
  },
  "timestamp": "2025-10-21T10:35:00Z"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Peach webhook processed successfully"
}
```

**Database Verification:**
```sql
SELECT id, status FROM payment_links WHERE order_id = 'test-order-1234567890';
-- Should show: status = 'failed'

SELECT id, status FROM orders WHERE id = 'test-order-1234567890';
-- Should show: status = 'payment_failed'
```

---

## Test 7: Test Frontend Flow (Browser)

1. **Start Frontend:**
   ```bash
   cd OMS-client
   npm run dev
   ```

2. **Open Payment URL from Test 2:**
   - Copy the `paymentLink.url` from Test 2 response
   - Paste in browser: `http://localhost:5173/payment?amount=949.00&email=...&paymentLinkUrl=...`

3. **Verify Payment Page:**
   - ✅ Shows order details (amount, email, reference)
   - ✅ Shows "Proceed to Payment" button
   - ✅ Amount, email, reference fields are read-only

4. **Click "Proceed to Payment":**
   - ✅ Should redirect to Payment Link URL (`https://l.ppay.io/...` or sandbox)
   - ✅ Browser console shows: `[PaymentPage] Redirecting to Payment Link: ...`

---

## Complete Postman Collection JSON

Save this as `Payment_Links_Testing.postman_collection.json`:

```json
{
  "info": {
    "name": "Payment Links Testing",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Get OAuth Token (Optional)",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"clientId\": \"{{PEACH_CLIENT_ID}}\",\n  \"clientSecret\": \"{{PEACH_CLIENT_SECRET}}\",\n  \"merchantId\": \"{{PEACH_MERCHANT_ID}}\"\n}"
        },
        "url": {
          "raw": "https://sandbox-dashboard.peachpayments.com/api/oauth/token",
          "protocol": "https",
          "host": ["sandbox-dashboard", "peachpayments", "com"],
          "path": ["api", "oauth", "token"]
        }
      }
    },
    {
      "name": "2. Create Payment Link",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          },
          {
            "key": "Authorization",
            "value": "Bearer {{API_KEY}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"orderId\": \"test-order-{{$timestamp}}\",\n  \"customerId\": \"test-customer-001\",\n  \"customerEmail\": \"test@example.com\",\n  \"customerName\": \"John Doe\",\n  \"orderType\": \"new_install\",\n  \"servicePackage\": {\n    \"name\": \"Fiber 100 Mbps\",\n    \"speed\": \"100/50 Mbps\",\n    \"price\": 749.00,\n    \"installationFee\": 200.00,\n    \"installationType\": \"Professional Installation\"\n  },\n  \"serviceAddress\": {\n    \"street\": \"123 Test Street\",\n    \"city\": \"Cape Town\",\n    \"province\": \"Western Cape\",\n    \"postalCode\": \"8001\"\n  }\n}"
        },
        "url": {
          "raw": "http://localhost:3004/api/payments/create",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3004",
          "path": ["api", "payments", "create"]
        }
      }
    },
    {
      "name": "3. Get Payment Status",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{API_KEY}}"
          }
        ],
        "url": {
          "raw": "http://localhost:3004/api/payments/{{PAYMENT_LINK_ID}}/status",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3004",
          "path": ["api", "payments", "{{PAYMENT_LINK_ID}}", "status"]
        }
      }
    },
    {
      "name": "4. Webhook - Successful Payment",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          },
          {
            "key": "x-peach-signature",
            "value": "test_signature"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"payment\": {\n    \"id\": \"{{PEACH_PAYMENT_ID}}\",\n    \"status\": \"SUCCESSFUL\",\n    \"merchantInvoiceId\": \"{{ORDER_ID}}\",\n    \"amount\": 949.00,\n    \"currency\": \"ZAR\"\n  },\n  \"timestamp\": \"{{$isoTimestamp}}\"\n}"
        },
        "url": {
          "raw": "http://localhost:3004/api/payments/webhook",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3004",
          "path": ["api", "payments", "webhook"]
        }
      }
    },
    {
      "name": "5. Webhook - Failed Payment",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"payment\": {\n    \"id\": \"{{PEACH_PAYMENT_ID}}\",\n    \"status\": \"FAILED\",\n    \"merchantInvoiceId\": \"{{ORDER_ID}}\",\n    \"amount\": 949.00,\n    \"currency\": \"ZAR\",\n    \"failureReason\": \"Insufficient funds\"\n  },\n  \"timestamp\": \"{{$isoTimestamp}}\"\n}"
        },
        "url": {
          "raw": "http://localhost:3004/api/payments/webhook",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3004",
          "path": ["api", "payments", "webhook"]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "API_KEY",
      "value": "test_api_key_12345"
    },
    {
      "key": "PEACH_CLIENT_ID",
      "value": "your_sandbox_client_id"
    },
    {
      "key": "PEACH_CLIENT_SECRET",
      "value": "your_sandbox_client_secret"
    },
    {
      "key": "PEACH_MERCHANT_ID",
      "value": "your_sandbox_merchant_id"
    },
    {
      "key": "PAYMENT_LINK_ID",
      "value": ""
    },
    {
      "key": "PEACH_PAYMENT_ID",
      "value": ""
    },
    {
      "key": "ORDER_ID",
      "value": ""
    }
  ]
}
```

---

## Testing Checklist

- [ ] OAuth token request succeeds (optional, auto-handled)
- [ ] Payment link creation returns 200 OK
- [ ] Payment link URL contains `paymentLinkUrl` parameter
- [ ] Payment link URL starts with `https://l.ppay.io/` or sandbox equivalent
- [ ] Database has new row in `payment_links` with `status='pending'`
- [ ] Get payment status returns pending before webhook
- [ ] Webhook for successful payment returns 200 OK
- [ ] Database updates: `payment_links.status='paid'`, `orders.is_paid=true`
- [ ] Get payment status returns paid after webhook
- [ ] Failed payment webhook updates status to 'failed'
- [ ] Frontend payment page loads with correct data
- [ ] Frontend redirects to Payment Link URL on button click

---

## Common Issues

### Issue: "ECONNREFUSED localhost:3004"
**Solution:** Start the onboarding service: `npm run dev`

### Issue: "Database connection failed"
**Solution:** Ensure PostgreSQL is running and `DATABASE_URL` is correct

### Issue: "401 Unauthorized" from Peach
**Solution:** 
- Verify sandbox credentials in `.env`
- Ensure credentials have Payment Links access
- Check you're using sandbox OAuth endpoint

### Issue: "Missing Authentication Token"
**Solution:**
- Verify `PEACHPAYMENTS_LINKS_BASE_URL` is correct
- Check `PEACHPAYMENTS_ENTITY_ID` is set
- Ensure using correct API path

### Issue: Webhook signature verification fails
**Solution:**
- For local testing, you can temporarily skip signature verification
- Or ensure `PEACHPAYMENTS_WEBHOOK_SECRET` matches header value

### Issue: Payment link not found in database
**Solution:**
- Run database migration: `002_add_payment_link_url.sql`
- Check database connection and table creation

---

## Next Steps

Once local testing passes:

1. **Deploy to staging** with real Peach sandbox credentials
2. **Configure ngrok/webhook forwarding** for webhook testing
3. **Test complete flow** with real payment
4. **Move to production** credentials when ready

---

## Support

- **Peach Payments API Docs:** https://developer.peachpayments.com
- **Postman Docs:** https://learning.postman.com
- **Project Documentation:** See `PEACH_PAYMENTS_README.md` and `PAYMENT_LINKS_MIGRATION.md`


