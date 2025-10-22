PeachPayments Payment Links – Quick Integration Guide

This guide documents the flow, endpoints, payloads, and environment variables to create Payment Links through PeachPayments. It covers Sandbox and Production and includes troubleshooting notes we hit.

1) Environment variables (Backend)

Required (Production):
- PEACHPAYMENTS_ENTITY_ID – Payment Links Entity ID (prod)
- PEACHPAYMENTS_MERCHANT_ID – Merchant ID (prod)
- PEACHPAYMENTS_USERNAME – Payment Links Client ID (prod)
- PEACHPAYMENTS_PASSWORD – Payment Links Client Secret (prod)
- PEACHPAYMENTS_LINKS_BASE_URL – https://links.peachpayments.com
- PEACHPAYMENTS_BASE_URL – https://api.peachpayments.com
- PEACHPAYMENTS_WEBHOOK_SECRET – secret used to verify webhooks

Optional (Sandbox):
- PEACHPAYMENTS_SANDBOX_ENTITY_ID
- PEACHPAYMENTS_SANDBOX_MERCHANT_ID
- PEACHPAYMENTS_SANDBOX_USERNAME
- PEACHPAYMENTS_SANDBOX_PASSWORD
- PEACHPAYMENTS_SANDBOX_LINKS_BASE_URL – https://sandbox-links.peachpayments.com
- PEACHPAYMENTS_SANDBOX_BASE_URL – https://testapi-v2.peachpayments.com

Related app settings:
- BASE_URL – backend public URL (used for webhook notificationUrl)
- FRONTEND_URL – frontend public URL (not required for backend-only flow)

Note: PEACHPAYMENTS_USERNAME/PEACHPAYMENTS_PASSWORD are the Payment Links Client ID/Secret, not user login.

2) Auth – Get OAuth token

Sandbox: POST https://sandbox-dashboard.peachpayments.com/api/oauth/token
Production: POST https://dashboard.peachpayments.com/api/oauth/token
Headers: Content-Type: application/json
Body:
{
  "clientId": "<PAYMENT_LINKS_CLIENT_ID>",
  "clientSecret": "<PAYMENT_LINKS_CLIENT_SECRET>",
  "merchantId": "<MERCHANT_ID>"
}
Response: { "access_token": "<TOKEN>", "token_type": "Bearer", "expires_in": 14400 }

3) Create Payment Link (Channels API)

Sandbox base: https://sandbox-links.peachpayments.com
Production base: https://links.peachpayments.com
Endpoint: POST /api/channels/{ENTITY_ID}/payments
Headers:
- Content-Type: application/json
- Accept: application/json
- Authorization: Bearer <ACCESS_TOKEN>

Minimal working body (Production-tested):
{
  "payment": { "amount": 299.00, "currency": "ZAR", "merchantInvoiceId": "TEST_INVOICE_12345" },
  "customer": { "email": "test@example.com", "givenName": "Test", "surname": "User" },
  "checkout": {},
  "options": { "notificationUrl": "https://<your-backend>/api/webhooks/peachpayments" }
}

Success response example:
{ "id": "ad7741e3-bc91-4b07-8cbd-347517f2809e", "url": "https://l.ppay.io/c1ca9a376b3eb795", "queuedNotifications": false }

4) Backend-only endpoint (already implemented)

Route: POST /api/payments/payment-links
Body:
{
  "amount": 299.00,
  "currency": "ZAR",
  "customer_email": "test@example.com",
  "givenName": "Test",
  "surname": "User",
  "merchantInvoiceId": "TEST_INVOICE_12345",
  "notificationUrl": "https://<your-backend>/api/webhooks/peachpayments"
}
Returns: { message, payment_link, payment_id, raw }

5) Curl quick start

Get token (Sandbox):
curl -s -X POST https://sandbox-dashboard.peachpayments.com/api/oauth/token -H "Content-Type: application/json" -d '{"clientId":"<CLIENT_ID>","clientSecret":"<CLIENT_SECRET>","merchantId":"<MERCHANT_ID>"}'

Create link (Sandbox):
curl -s -X POST "https://sandbox-links.peachpayments.com/api/channels/<ENTITY_ID>/payments" -H "Content-Type: application/json" -H "Accept: application/json" -H "Authorization: Bearer <ACCESS_TOKEN>" -d '{"payment":{"amount":299.00,"currency":"ZAR","merchantInvoiceId":"TEST_INVOICE_12345"},"customer":{"email":"test@example.com","givenName":"Test","surname":"User"},"checkout":{},"options":{"notificationUrl":"https://<your-backend>/api/webhooks/peachpayments"}}'

6) Troubleshooting

- Unauthorised / 401: use correct host; header is "Authorization: Bearer <token>"; token not expired; client has Payment Links access for merchant+entity.
- Missing Authentication Token: wrong host or path; use /api/channels/{ENTITY_ID}/payments on Links host.
- Invalid request body: use the minimal working body; include payment.customer.checkout.options; merchantInvoiceId required.
- AWS SigV4 errors: not required for Links when using OAuth Bearer; ensure you’re on the Links Channels API.

7) Webhooks

Set a webhook URL in dashboard. options.notificationUrl should point to a backend route that validates signatures with PEACHPAYMENTS_WEBHOOK_SECRET.

8) Notes

Sandbox and Production may differ slightly. If sandbox misbehaves, validate minimal payload in production when credentials are ready. Keep credentials backend-only; use the provided backend route to centralize calls.

