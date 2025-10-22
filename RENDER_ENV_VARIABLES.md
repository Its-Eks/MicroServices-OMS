# Environment Variables for Render Deployment

Copy these environment variables to your Render service dashboard.

## How to Add in Render

1. Go to your Render dashboard
2. Select your **onboarding-service** 
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Copy each variable below (Key = Value)

---

## Required Environment Variables

### Server Configuration

```
PORT=3004
NODE_ENV=production
```

### Public URLs

```
BASE_URL=https://microservices-oms.onrender.com
CLIENT_URL=https://oms-xnext.vercel.app
```

### Database

```
DATABASE_URL=your_postgres_connection_string_here
```

**Note:** Get this from your Render PostgreSQL dashboard

---

## Payment Provider

```
PAYMENT_PROVIDER=peach
```

---

## Peach Payments - Payment Links (PRODUCTION)

### OAuth Credentials

```
PEACHPAYMENTS_USERNAME=6f5eb30f33d19585d1f77523c878be
```

```
PEACHPAYMENTS_PASSWORD=feAbk6JjQq8CTgpeO02seuRzdWM0lgxCovPb4leHOyqfvbYG5rCcY7S/HQxQERaAYYBUkv/hA0YIx9VJpm9abw==
```

**Note:** Remove the outer quotes when pasting in Render

```
PEACHPAYMENTS_MERCHANT_ID=53125e15f7644009949defede138a974
```

```
PEACHPAYMENTS_ENTITY_ID=8ac9a4cc93de56d70193debc70510437
```

### API Endpoints (Production)

```
PEACHPAYMENTS_LINKS_BASE_URL=https://links.peachpayments.com
```

```
PEACHPAYMENTS_BASE_URL=https://api.peachpayments.com
```

### Webhook Security

```
PEACHPAYMENTS_WEBHOOK_SECRET=3191ec32f1be5081b1b349f9fbba2924
```

---

## OMS Server Integration

```
OMS_SERVER_URL=https://oms-server.onrender.com
```

**Note:** Update this with your actual OMS server URL

```
ONBOARDING_SERVICE_API_KEY=your_service_api_key_here
```

**Note:** Use a secure random string for API authentication between services

---

## Email Configuration (Optional)

```
SMTP_HOST=smtp.gmail.com
```

```
SMTP_PORT=587
```

```
SMTP_USER=noreply@xnext.co.za
```

```
SMTP_PASS=your_smtp_password_here
```

```
SMTP_FROM=Xnext OMS <noreply@xnext.co.za>
```

---

## Payment Redirect URLs

```
SUCCESS_URL=https://oms-xnext.vercel.app/payment/success
```

```
CANCEL_URL=https://oms-xnext.vercel.app/payment/cancelled
```

---

## Mock Payments (Set to false for production)

```
USE_MOCK_PAYMENTS=false
```

---

## Complete Variable List (Copy-Paste Format)

For quick copy-paste into Render (one per line):

```env
PORT=3004
NODE_ENV=production
BASE_URL=https://microservices-oms.onrender.com
CLIENT_URL=https://oms-xnext.vercel.app
DATABASE_URL=your_postgres_connection_string
PAYMENT_PROVIDER=peach
PEACHPAYMENTS_USERNAME=6f5eb30f33d19585d1f77523c878be
PEACHPAYMENTS_PASSWORD=feAbk6JjQq8CTgpeO02seuRzdWM0lgxCovPb4leHOyqfvbYG5rCcY7S/HQxQERaAYYBUkv/hA0YIx9VJpm9abw==
PEACHPAYMENTS_MERCHANT_ID=53125e15f7644009949defede138a974
PEACHPAYMENTS_ENTITY_ID=8ac9a4cc93de56d70193debc70510437
PEACHPAYMENTS_LINKS_BASE_URL=https://links.peachpayments.com
PEACHPAYMENTS_BASE_URL=https://api.peachpayments.com
PEACHPAYMENTS_WEBHOOK_SECRET=3191ec32f1be5081b1b349f9fbba2924
OMS_SERVER_URL=https://oms-server.onrender.com
ONBOARDING_SERVICE_API_KEY=your_service_api_key_here
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@xnext.co.za
SMTP_PASS=your_smtp_password
SMTP_FROM=Xnext OMS <noreply@xnext.co.za>
SUCCESS_URL=https://oms-xnext.vercel.app/payment/success
CANCEL_URL=https://oms-xnext.vercel.app/payment/cancelled
USE_MOCK_PAYMENTS=false
```

---

## Variables to Update

Before deploying, make sure to update these with your actual values:

1. **DATABASE_URL** - Get from Render PostgreSQL dashboard
2. **OMS_SERVER_URL** - Your actual OMS server URL (if different)
3. **ONBOARDING_SERVICE_API_KEY** - Generate a secure random string
4. **SMTP_PASS** - Your email service password

---

## After Adding Variables

### 1. Configure Peach Payments Webhook

In Peach Payments Dashboard:
- Go to Webhooks → Payment Links
- Add endpoint: `https://microservices-oms.onrender.com/api/payments/webhook`
- Enable signature verification
- Use secret: `3191ec32f1be5081b1b349f9fbba2924`

### 2. Run Database Migration

SSH into Render or use Render Shell:

```bash
# Connect to your database and run:
psql $DATABASE_URL -f src/migrations/002_add_payment_link_url.sql
```

Or run via npm script if you have one.

### 3. Deploy

Click **Manual Deploy** or push to trigger auto-deploy.

### 4. Verify Deployment

Check logs for:
```
[PaymentService] Using PEACH payment service
Server running on port 3004
```

### 5. Test Payment Link Creation

Use Postman to test:
```
POST https://microservices-oms.onrender.com/api/payments/create
```

Watch logs for:
```
[PaymentService] Requesting OAuth token from Peach Payments...
[PaymentService] OAuth token obtained successfully
[PaymentService] Creating Payment Link
[PaymentService] Payment Link created successfully
```

---

## Security Checklist

- [ ] All sensitive values are marked as **Secret** in Render
- [ ] `PEACHPAYMENTS_PASSWORD` has no outer quotes
- [ ] `PEACHPAYMENTS_WEBHOOK_SECRET` matches Peach dashboard
- [ ] `DATABASE_URL` is correct and accessible
- [ ] `ONBOARDING_SERVICE_API_KEY` is a strong random string
- [ ] `USE_MOCK_PAYMENTS=false` for production

---

## Troubleshooting

### OAuth Fails

**Symptom:** "Failed to obtain Peach Payments OAuth token"

**Check:**
- `PEACHPAYMENTS_USERNAME` = `6f5eb30f33d19585d1f77523c878be`
- `PEACHPAYMENTS_PASSWORD` has no outer quotes
- `PEACHPAYMENTS_MERCHANT_ID` = `53125e15f7644009949defede138a974`

### Payment Link Creation Fails

**Symptom:** "Missing Authentication Token"

**Check:**
- `PEACHPAYMENTS_LINKS_BASE_URL` = `https://links.peachpayments.com`
- `PEACHPAYMENTS_ENTITY_ID` = `8ac9a4cc93de56d70193debc70510437`
- OAuth token was obtained (check previous logs)

### Webhooks Not Received

**Check:**
- Webhook URL in Peach Dashboard: `https://microservices-oms.onrender.com/api/payments/webhook`
- `PEACHPAYMENTS_WEBHOOK_SECRET` = `3191ec32f1be5081b1b349f9fbba2924`
- Server is running and accessible

---

## Support

- **Render Issues:** Check Render dashboard logs and metrics
- **Peach Payments:** Contact Peach support for credential issues
- **Code Issues:** Review `TESTING_PAYMENT_LINKS.md` for debugging steps

---

**Deployment Checklist:**

- [ ] All environment variables added to Render
- [ ] Database migration completed
- [ ] Webhook configured in Peach Dashboard
- [ ] Service deployed successfully
- [ ] Test payment link creation
- [ ] Verify webhook delivery
- [ ] Test complete payment flow

Ready to deploy! 🚀


