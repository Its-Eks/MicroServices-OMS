## Payment Gateway – Stripe (legacy) and Peach (current)

This guide explains how the onboarding service integrates with Stripe to generate payment links, send branded emails, and update orders on successful payment via webhooks. It also includes Postman steps and troubleshooting tips.

## Architecture Overview

- **OMS Server**: Creates orders and calls the onboarding service to generate a payment link. Optionally proxies email sending.
- **Onboarding Service**: Creates checkout sessions (Stripe) or Peach references, stores payment links, sends email via OMS, and processes webhooks.
- **Stripe/Peach**: Hosts secure checkout and sends webhook events.
- **Database**: Tracks `payment_links`, `payment_notifications`, and `payment_webhook_events`. Order `is_paid` is updated on success.

Flow:
1. OMS creates order → calls `POST /api/payments/create`.
2. Onboarding creates checkout (Stripe session or Peach reference) → stores link → sends email.
3. Customer pays → Gateway webhook → onboarding sets `orders.is_paid=true` and marks link paid.
4. Frontend redirects to `/payment/success` with either `?session_id=...` (Stripe) or `?ref=...` (Peach).

## Prerequisites

- Stripe account (test mode)
- Database reachable by onboarding service
- OMS Server running with SMTP configured and `/api/email/send` available
- Frontend route `GET /payment/success`

## Environment Variables

Set these in onboarding service (local `.env` or Render dashboard):

```env
# Server
PORT=3004
NODE_ENV=production

# Database
DATABASE_URL=postgres://user:pass@host:5432/db
POSTGRES_SSL=true

# Provider switch
PAYMENT_PROVIDER=peach

# Stripe (legacy)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_MODE=test

# Peach
PEACH_ENDPOINT=https://test.oppwa.com
PEACH_MERCHANT_ID=your_merchant_id
PEACH_ACCESS_TOKEN=your_access_token
PEACH_WEBHOOK_SECRET=your_webhook_hmac_secret

# Behavior
USE_MOCK_PAYMENTS=false
CLIENT_URL=https://your-oms-client.example.com  # or http://localhost:5173

# OMS integration (email proxy)
OMS_SERVER_URL=https://oms-server-ntlv.onrender.com
ONBOARDING_SERVICE_API_KEY=your-service-key

# SMTP fallback (only used if OMS email proxy fails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@xnext.co.za
SMTP_PASS=your_password
SMTP_FROM=noreply@xnext.co.za
```

Notes:
- `USE_MOCK_PAYMENTS=false` forces real Stripe if `STRIPE_SECRET_KEY` starts with `sk_` and is not the example value.
- `CLIENT_URL` defines the success/cancel redirect targets.
- The email proxy uses `POST ${OMS_SERVER_URL}/api/email/send` with header `x-service-key: ONBOARDING_SERVICE_API_KEY`.

## Database Migrations

Ensure these migrations have run in onboarding and OMS databases:

- Onboarding:
  - `002_add_customer_email_to_payment_links.sql`
  - `003_stripe_migration.sql` (adds `stripe_session_id`, `paid_at`, makes old Peach column nullable)

- OMS:
  - `013_add_is_paid_to_orders.sql` (adds `is_paid` boolean and backfills)

## Key Endpoints (Onboarding Service)

### Create Payment
`POST /api/payments/create`

Headers:
- `Content-Type: application/json`
- `x-service-key: {{ONBOARDING_SERVICE_API_KEY}}`

Body:
```json
{
  "orderId": "uuid",
  "customerId": "uuid", 
  "customerEmail": "customer@example.com",
  "customerName": "John Doe",
  "orderType": "new_install",
  "servicePackage": {
    "name": "Fiber 100/50 Mbps",
    "speed": "100/50 Mbps",
    "price": 749,
    "installationFee": 999,
    "installationType": "professional_install"
  },
  "serviceAddress": {
    "street": "123 Main Street",
    "city": "Cape Town", 
    "province": "Western Cape",
    "postalCode": "8001"
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "paymentLinkId": "stripe_checkout_...",
    "paymentUrl": "https://checkout.stripe.com/c/pay/...",
    "expiresAt": "2025-10-03T10:00:00.000Z",
    "emailSent": true
  }
}
```

Email sending is non-blocking. Even if OMS email proxy or SMTP fails, the endpoint returns the Stripe URL.

### Get Payment Status
`GET /api/payments/:paymentLinkId/status`

- Stripe: returns live Stripe session details mapped to `pending/completed/expired/failed`.
- Peach: returns DB-backed status and stored `peach_checkout_id` reference.

### Resend Payment Email
`POST /api/payments/:paymentLinkId/resend`

Resends via OMS email API. Uses `x-service-key` header internally.

### Webhooks (Stripe or Peach)
`POST /api/payments/webhook`

- Stripe mode:
  - Configure Dashboard with URL above and set `STRIPE_WEBHOOK_SECRET`.
  - Events: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`.
  - On completed paid session → mark paid and notify OMS.

- Peach mode:
  - Configure Peach webhook to the same URL.
  - HMAC signature verified using `PEACH_WEBHOOK_SECRET`.
  - Map Peach result codes: `000.000.*` or `000.100.*` → paid; pending/failed otherwise.

## Postman Testing – Step by Step

1) Create Payment
- POST `{{ONBOARDING_URL}}/api/payments/create`
- Headers: `Content-Type: application/json`, `x-service-key: {{SERVICE_API_KEY}}`
- Body: use the example above (ensure UUIDs)
- Expect 200 with `paymentUrl`. Open it to pay on Stripe (use test card 4242 4242 4242 4242).

2) Complete Payment and Redirect
- After paying, Stripe redirects to `{{CLIENT_URL}}/payment/success?session_id=...`
- Ensure your frontend defines a route for `/payment/success`.

3) Verify Payment Status (optional)
- GET `{{ONBOARDING_URL}}/api/payments/{{paymentLinkId}}/status`

4) Resend Email (optional)
- POST `{{ONBOARDING_URL}}/api/payments/{{paymentLinkId}}/resend`

## Frontend

- Route `GET /payment/success` renders a confirmation page.
- Query string contains either `session_id` (Stripe) or `ref` (Peach).

## Mock vs Real Payments

- Real Stripe is used when:
  - `USE_MOCK_PAYMENTS=false` AND a valid `STRIPE_SECRET_KEY` is present (starts with `sk_` and not the example value).
- Mock payments:
  - `USE_MOCK_PAYMENTS=true` OR no valid Stripe key. A mock checkout page is available locally; not exposed in production.

## Troubleshooting

- 401 Unauthorized when creating payment
  - Ensure header is `x-service-key` (not `x-service-api-key`).
  - Confirm the key matches `ONBOARDING_SERVICE_API_KEY`.

- 404 on `POST /api/email/send`
  - Ensure `OMS_SERVER_URL` points to the OMS Server base URL.
  - OMS email endpoint path is `/api/email/send`.

- Email timeouts or failures
  - The create endpoint still returns success (email is non-blocking).
  - Check OMS logs for email delivery. Configure SMTP on OMS.

- Payment link still looks mock
  - Confirm `USE_MOCK_PAYMENTS=false` and `STRIPE_SECRET_KEY` is valid.
  - Check onboarding logs for configuration: it logs whether MOCK or REAL is used.

- Order is not marked paid
  - Verify Stripe webhook is configured and reachable from Stripe.
  - Ensure `STRIPE_WEBHOOK_SECRET` is set and correct.
  - Check onboarding logs for `checkout.session.completed` handling.

## FAQs

- Do I need SMTP credentials in onboarding?
  - Not strictly. Onboarding first calls OMS `/api/email/send`. Only if that fails does it use SMTP fallback.

- Can I test without the frontend?
  - Yes. Use Postman to create payment and open the returned `paymentUrl` to pay. The webhook will update the order.

- How long do payment links last?
  - 24 hours by default. Configured when creating the Stripe Checkout Session.

- Which currency is used?
  - ZAR (`zar`). Amounts sent to Stripe are in cents.

## Security Notes

- Stripe Checkout is PCI compliant; sensitive card data never touches our servers.
- Verify Stripe webhook signatures in production (`STRIPE_WEBHOOK_SECRET`).
- Use separate API keys for environments.

## Change Log (Highlights)

- Added provider switch with Peach as current provider
- Confirm endpoint now accepts `ref` for Peach
- Webhook handler supports Stripe or Peach based on provider
