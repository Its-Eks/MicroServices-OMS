# Peach Payments Integration (COPYandPAY Hosted Checkout)

This document describes the Peach Payments COPYandPAY (Hosted Checkout) integration for the onboarding service.

## Overview

- Hosted redirect similar to Stripe Checkout Sessions
- COPYandPAY credentials: Entity ID + Secret Token
- Always include `entityId` in both API requests and hosted URLs

## Sandbox vs Live

Use these bases for COPYandPAY:

- Sandbox: `https://sandbox-card.peachpayments.com/v1`
- Live: `https://card.peachpayments.com/v1`

Do not mix Payment Links (`sandbox-l.ppay.io`) or oppwa/testsecure hosts with this flow for your tenant.

## Environment

```
PAYMENT_PROVIDER=peach
PEACH_CHANNEL=hosted
PEACH_ENDPOINT=https://sandbox-card.peachpayments.com
PEACH_HOSTED_ENTITY_ID=...
PEACH_HOSTED_ACCESS_TOKEN=...
PEACH_WEBHOOK_SECRET=...
SUCCESS_URL=https://your-frontend/payment/success?ref={reference}
CANCEL_URL=https://your-frontend/payment/cancelled?ref={reference}
```

Live: set `PEACH_ENDPOINT=https://card.peachpayments.com` and swap credentials.

## Create Checkout

POST `${PEACH_ENDPOINT}/v1/checkouts?entityId=${PEACH_HOSTED_ENTITY_ID}` with JSON body:
```
{
  "amount": "10.00",
    "currency": "ZAR",
  "paymentType": "DB",
  "merchantTransactionId": "<orderId>",
  "successUrl": ".../payment/success?ref={reference}",
  "cancelUrl": ".../payment/cancelled?ref={reference}"
}
```
Headers: `Authorization: Bearer ${PEACH_HOSTED_ACCESS_TOKEN}`, `Content-Type: application/json`.

Hosted page URL to redirect user: `${PEACH_ENDPOINT}/v1/checkouts/{id}/payment?entityId=${PEACH_HOSTED_ENTITY_ID}`.

## Confirm after redirect

Backend verifies with GET `${PEACH_ENDPOINT}/v1/checkouts/{ref}/payment?entityId=${PEACH_HOSTED_ENTITY_ID}` (Bearer token). On success codes (`000.000*`, `000.100*`) mark order paid and notify OMS.

## Webhooks

Configure in Dashboard → COPYandPAY → Webhooks. Enable signature/HMAC, copy the secret once and set `PEACH_WEBHOOK_SECRET`. Your endpoint must return 200 quickly. HMAC calculation should use the raw JSON payload and the provided secret; compare in constant time.

## Result Codes

- Success: `000.000.*`, `000.100.*`
- Pending: `800.400.5*`, `100.400.500`
- Failure: other `000.400.*` or `800/900.*`

## Notes

- Never reuse an old checkout id after rotating tokens; create a new checkout.
- Remove quotes/whitespace around env values to avoid signature/auth issues.
- Keep Stripe support enabled with `PAYMENT_PROVIDER=stripe` when needed.
