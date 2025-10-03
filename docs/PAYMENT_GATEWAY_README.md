## Stripe Payment Gateway – Implementation & Testing Guide

This guide explains how the onboarding service integrates with Stripe to generate payment links, send branded emails, and update orders on successful payment via webhooks. It also includes Postman steps and troubleshooting tips.

## Architecture Overview

- **OMS Server**: Creates orders and calls the onboarding service to generate a payment link. Optionally proxies email sending.
- **Onboarding Service**: Creates Stripe Checkout Sessions, stores payment links, sends email via OMS, and processes webhooks.
- **Stripe**: Hosts secure checkout and sends webhook events.
- **Database**: Tracks `payment_links`, `payment_notifications`, and `payment_webhook_events`. Order `is_paid` is updated on success.

Flow:
1. OMS creates order → calls `POST /api/payments/create`.
2. Onboarding creates Stripe session → stores link → sends email.
3. Customer pays on Stripe → Stripe webhook → onboarding sets `orders.is_paid=true` and marks link paid.
4. Frontend redirects to `/payment/success?session_id=...`.

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

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_MODE=test

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

Returns Stripe session status mapped to `pending/completed/expired/failed` with details.

### Resend Payment Email
`POST /api/payments/:paymentLinkId/resend`

Resends via OMS email API. Uses `x-service-key` header internally.

### Stripe Webhook
`POST /api/payments/webhook`

Configure in Stripe Dashboard → Developers → Webhooks:
- URL: `https://YOUR-ONBOARDING-DOMAIN/api/payments/webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`
- Signing secret → set as `STRIPE_WEBHOOK_SECRET`

On `checkout.session.completed` with `payment_status=paid`, the onboarding service:
- Updates `payment_links.status='paid'`, sets `paid_at=NOW()`
- Updates `orders.is_paid=true`

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

- Add route `GET /payment/success` and render a confirmation page.
- The session id is available in the query string `session_id`.

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

- Switched from Peach Payments to Stripe Checkout Sessions
- Added `stripe_session_id`, `paid_at` columns and indices
- Non-blocking email send during payment creation
- Email proxy via OMS `/api/email/send` using `x-service-key`
