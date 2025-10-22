# Payment Links Migration - Implementation Summary

This document summarizes the migration from Peach Payments COPYandPAY hosted checkout to Payment Links API.

## What Changed

### Backend Changes

#### 1. Payment Service (`onboarding-service/src/services/payment.service.ts`)

**Added:**
- OAuth token management with caching (`getOAuthToken()` method)
- Private properties: `accessToken`, `tokenExpiry`

**Replaced:**
- Payment link creation logic in `createPaymentLink()` method
  - Now uses Payment Links API instead of COPYandPAY
  - Creates short Payment Links URLs (https://l.ppay.io/...)
  - Stores both custom page URL and Payment Link URL in database

**Updated:**
- `handlePeachWebhook()` - Complete rewrite for Payment Links webhook format
  - New signature verification for Payment Links
  - New payload structure (payment.id, payment.status, payment.merchantInvoiceId)
  - Status mapping: SUCCESSFUL → paid, FAILED → failed, PENDING → pending

- `confirmPeachReference()` - Database-only confirmation
  - Removed API call to Peach for status check
  - Now queries database status (updated by webhooks)

#### 2. Payment Controller (`onboarding-service/src/controllers/payment.controller.ts`)

**Removed:**
- `redirectToPeachPayment()` method
- Route: `GET /peach-redirect/:checkoutId/:entityId`

#### 3. Database Migration (`onboarding-service/src/migrations/002_add_payment_link_url.sql`)

**Added:**
- `payment_link_url` column to `payment_links` table
- Index on `payment_link_url` for faster lookups

### Frontend Changes

#### 4. Payment Page (`OMS-client/src/pages/pages/payment/page.tsx`)

**Updated Interface:**
```typescript
interface PaymentData {
  amount: string;
  email: string;
  reference: string;
  orderId: string;
  paymentLinkUrl?: string;      // NEW
  paymentLinkId?: string;        // NEW
  checkoutId?: string;           // Now optional (legacy)
  entityId?: string;             // Now optional (legacy)
}
```

**Updated Logic:**
- `useEffect()` - Extracts new `paymentLinkUrl` and `paymentLinkId` parameters
- `handlePayment()` - Redirects to Payment Link URL instead of building checkout URL
- Maintains backward compatibility with old checkout flow

### Documentation

#### 5. New/Updated Documentation

- **Updated:** `onboarding-service/docs/PEACH_PAYMENTS_README.md`
  - Complete rewrite for Payment Links
  - Includes OAuth, API endpoints, webhook handling
  - Troubleshooting guide
  
- **Added:** `onboarding-service/PAYMENT_LINKS_MIGRATION.md` (this file)
  
- **Existing:** `onboarding-service/docs/PEACHPAYMENTS_LINKS_GUIDE.md` (referenced)

## Environment Variables

### Old Variables (REMOVED)
```env
PEACH_ENDPOINT=https://sandbox-card.peachpayments.com
PEACH_HOSTED_ENTITY_ID=...
PEACH_HOSTED_ACCESS_TOKEN=...
```

### New Variables (REQUIRED)
```env
# OAuth Credentials
PEACHPAYMENTS_USERNAME=payment_links_client_id
PEACHPAYMENTS_PASSWORD=payment_links_client_secret
PEACHPAYMENTS_MERCHANT_ID=merchant_id
PEACHPAYMENTS_ENTITY_ID=entity_id

# API Endpoints
PEACHPAYMENTS_LINKS_BASE_URL=https://links.peachpayments.com
PEACHPAYMENTS_BASE_URL=https://api.peachpayments.com

# Webhook Security
PEACHPAYMENTS_WEBHOOK_SECRET=webhook_secret

# Existing (unchanged)
PAYMENT_PROVIDER=peach
BASE_URL=https://microservices-oms.onrender.com
CLIENT_URL=https://oms-xnext.vercel.app
```

## Deployment Checklist

### Pre-Deployment

- [ ] Obtain Payment Links credentials from Peach Payments
- [ ] Configure OAuth credentials (client ID, client secret, merchant ID)
- [ ] Get Payment Links entity ID
- [ ] Generate webhook secret
- [ ] Test in Sandbox environment

### Database Migration

- [ ] Run migration: `002_add_payment_link_url.sql`
- [ ] Verify `payment_link_url` column added
- [ ] Verify index created

### Environment Configuration

- [ ] Update environment variables in production
- [ ] Remove old `PEACH_*` variables
- [ ] Add new `PEACHPAYMENTS_*` variables
- [ ] Verify `BASE_URL` is correct for webhook callbacks

### Peach Dashboard Configuration

- [ ] Configure webhook URL: `{BASE_URL}/api/payments/webhook`
- [ ] Enable webhook signatures
- [ ] Copy webhook secret to `PEACHPAYMENTS_WEBHOOK_SECRET`
- [ ] Test webhook delivery

### Testing

- [ ] Test OAuth token generation
- [ ] Create test payment link
- [ ] Verify short URL format (https://l.ppay.io/...)
- [ ] Complete test payment flow
- [ ] Verify webhook received and processed
- [ ] Check database updates (payment_links and orders tables)
- [ ] Verify OMS notification sent
- [ ] Test failed payment handling

### Frontend Deployment

- [ ] Deploy updated payment page
- [ ] Test payment link from email
- [ ] Verify custom page displays correctly
- [ ] Test "Proceed to Payment" button
- [ ] Verify redirect to Payment Links URL

### Monitoring

- [ ] Monitor OAuth token requests/refreshes
- [ ] Check webhook delivery success rate
- [ ] Verify payment link creation success rate
- [ ] Monitor database for payment status updates
- [ ] Check logs for any errors

## API Flow Changes

### Before (COPYandPAY)

1. Backend: POST `/v1/checkouts` → Get checkout ID
2. Backend: Build URL `{endpoint}/v1/checkouts/{id}/payment?entityId={entityId}`
3. Frontend: Redirect to custom page with `checkoutId` and `entityId`
4. Frontend: Redirect to Peach hosted checkout
5. Peach: GET status via API after redirect

### After (Payment Links)

1. Backend: OAuth token request (if needed)
2. Backend: POST `/api/channels/{entityId}/payments` → Get short URL
3. Backend: Store Payment Link URL in database
4. Frontend: Redirect to custom page with `paymentLinkUrl`
5. Frontend: Redirect directly to Payment Link URL
6. Webhook: Peach sends status updates to backend
7. Backend: Updates database based on webhook

## Key Differences

| Feature | COPYandPAY | Payment Links |
|---------|------------|---------------|
| **Authentication** | Bearer token (static) | OAuth (dynamic, auto-refresh) |
| **Payment URL** | Long URL with entityId | Short URL (l.ppay.io) |
| **Status Updates** | API polling | Webhooks only |
| **Confirmation** | API GET request | Database query |
| **Redirect Flow** | Multi-step | Direct link |
| **Session Management** | Checkout sessions | Payment Links |

## Troubleshooting

### OAuth Token Issues

**Problem:** 401 Unauthorized when creating payment link

**Solution:**
- Verify `PEACHPAYMENTS_USERNAME`, `PEACHPAYMENTS_PASSWORD`, `PEACHPAYMENTS_MERCHANT_ID`
- Check OAuth endpoint (sandbox vs production)
- Ensure credentials have Payment Links access

### Payment Link Creation Fails

**Problem:** "Missing id or url" in response

**Solution:**
- Verify `PEACHPAYMENTS_ENTITY_ID` is correct
- Check entity has Payment Links enabled
- Ensure `PEACHPAYMENTS_LINKS_BASE_URL` is correct
- Review request payload matches API requirements

### Webhooks Not Received

**Problem:** Payment status not updating

**Solution:**
- Verify webhook URL configured in Peach dashboard
- Check `BASE_URL` environment variable
- Ensure webhook endpoint is publicly accessible
- Review webhook events table for delivery attempts
- Check signature verification (correct secret)

### Database Errors

**Problem:** Column "payment_link_url" does not exist

**Solution:**
- Run migration `002_add_payment_link_url.sql`
- Verify migration applied successfully

### Frontend Errors

**Problem:** "Unable to proceed with payment"

**Solution:**
- Check browser console for errors
- Verify `paymentLinkUrl` in URL parameters
- Ensure payment page properly extracts parameters
- Check network tab for failed redirects

## Rollback Plan

If issues arise, you can temporarily rollback:

1. Revert environment variables to old `PEACH_*` format
2. Revert code changes to previous commit
3. Payment Links can be disabled without affecting database
4. Old payment links will still work if webhooks configured

**Note:** Do NOT delete `payment_link_url` column after rollback. It's safe to leave unused.

## Support Contacts

- **Peach Payments Support:** For OAuth, API, webhook issues
- **Development Team:** For integration code issues
- **Database Admin:** For migration issues

## Success Metrics

After deployment, monitor:
- OAuth token success rate: >99%
- Payment link creation success rate: >95%
- Webhook delivery success rate: >98%
- Payment completion rate: Similar to previous
- Average payment time: Should improve (fewer redirects)

## Next Steps

1. Monitor production for 48 hours
2. Review error logs daily for first week
3. Gather user feedback on payment experience
4. Consider removing legacy COPYandPAY code after 1 month
5. Update operational documentation with new flow

---

**Migration Completed:** [Date]
**Implemented By:** AI Assistant
**Reviewed By:** [To be filled]
**Production Deployment:** [To be scheduled]


