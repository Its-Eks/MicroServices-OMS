# 🎭 Mock Payment Testing Guide

This guide explains how to test the payment gateway integration using mock data while waiting for your Peach Payments API credentials.

## 🚀 Quick Setup

### 1. Environment Configuration

Copy the example environment file and configure for mock mode:

```bash
cp env.example .env
```

Edit `.env` to enable mock payments:

```env
# Mock Payment Settings (for development)
USE_MOCK_PAYMENTS=true
SEND_MOCK_EMAILS=false

# Keep default test credentials to trigger mock mode
PEACH_ENTITY_ID=test_entity_id
PEACH_ACCESS_TOKEN=test_access_token
```

### 2. Start the Service

```bash
npm run dev
```

You should see: `🎭 [PaymentService] Using mock payment data for development`

## 📋 Testing Scenarios

### Scenario 1: Create Payment Link (New Installation)

**POST** `http://localhost:3004/api/payments/create`

```json
{
  "orderId": "test-order-123",
  "customerId": "test-customer-456",
  "customerEmail": "customer@example.com",
  "customerName": "John Doe",
  "orderType": "new_install",
  "servicePackage": {
    "name": "Fiber Premium 100/20",
    "speed": "100/20 Mbps",
    "price": 899.00,
    "installationFee": 500.00,
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

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "paymentLinkId": "mock_checkout_1696234567890_abc123",
    "paymentUrl": "http://localhost:3004/api/payments/mock-checkout/mock_checkout_1696234567890_abc123",
    "expiresAt": "2024-10-03T10:30:00.000Z",
    "emailSent": true
  }
}
```

### Scenario 2: Create Payment Link (Service Change)

**POST** `http://localhost:3004/api/payments/create`

```json
{
  "orderId": "test-order-789",
  "customerId": "test-customer-456",
  "customerEmail": "customer@example.com",
  "customerName": "Jane Smith",
  "orderType": "service_change",
  "servicePackage": {
    "name": "Fiber Ultra 200/50",
    "speed": "200/50 Mbps",
    "price": 1299.00,
    "installationFee": 200.00
  },
  "serviceAddress": {
    "street": "456 Oak Avenue",
    "city": "Johannesburg",
    "province": "Gauteng",
    "postalCode": "2000"
  }
}
```

### Scenario 3: Check Payment Status

**GET** `http://localhost:3004/api/payments/{paymentLinkId}/status`

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "mock_checkout_1696234567890_abc123",
    "checkoutId": "mock_peach_1696234567890_def456",
    "status": "pending",
    "amount": "1399.00",
    "currency": "ZAR",
    "timestamp": "2024-10-02T10:30:00.000Z",
    "result": {
      "code": "000.200.000",
      "description": "Transaction pending"
    },
    "mockData": true
  }
}
```

**Status Evolution:**
- First 30 seconds: `"status": "pending"`
- After 30 seconds: `"status": "completed"` (80% chance) or `"status": "failed"` (20% chance)

### Scenario 4: Mock Checkout Page

Visit the payment URL from the create response:
`http://localhost:3004/api/payments/mock-checkout/{checkoutId}`

This opens an interactive mock checkout page where you can:
- See payment details
- Choose payment result (Success/Failed/Pending)
- Process mock payment
- Trigger webhook automatically

### Scenario 5: Manual Webhook Testing

**POST** `http://localhost:3004/api/payments/webhook`

```json
{
  "id": "mock_peach_1696234567890_def456",
  "status": "completed",
  "result": {
    "code": "000.100.110",
    "description": "Request successfully processed"
  },
  "mockData": true
}
```

## 🔍 Monitoring & Debugging

### Console Logs

Watch for these log messages:

```
🎭 [MockPaymentService] Initialized with mock data
🎭 [MockPaymentService] Creating mock payment link for order: test-order-123
🎭 [MockPaymentService] Mock payment link created: { checkoutId: '...', amount: 1399, currency: 'ZAR' }
🎭 [MockPaymentService] Mock payment email processed for order test-order-123
🎭 [MockPaymentService] Getting mock payment status for: mock_checkout_...
🎭 [MockPaymentService] Processing mock webhook: { ... }
🎭 [MockPaymentService] Mock payment completed for order test-order-123
```

### Database Verification

Check that records are created in:

```sql
-- Payment links
SELECT * FROM payment_links WHERE order_id = 'test-order-123';

-- Email notifications
SELECT * FROM payment_notifications WHERE payment_link_id = 'mock_checkout_...';

-- Webhook events
SELECT * FROM payment_webhook_events WHERE peach_checkout_id = 'mock_peach_...';
```

## 🧪 Advanced Testing

### Test Payment Failures

1. Use the mock checkout page and select "❌ Failed Payment"
2. Or send webhook with failed status:

```json
{
  "id": "mock_peach_1696234567890_def456",
  "status": "failed",
  "result": {
    "code": "800.400.500",
    "description": "Transaction declined"
  }
}
```

### Test Email Integration

Enable email sending in `.env`:

```env
SEND_MOCK_EMAILS=true
SMTP_HOST=your-smtp-host
SMTP_USER=your-email
SMTP_PASS=your-password
```

Emails will be sent with `[MOCK]` prefix and mock banner.

### Load Testing

Create multiple payment links rapidly:

```bash
for i in {1..10}; do
  curl -X POST http://localhost:3004/api/payments/create \
    -H "Content-Type: application/json" \
    -d "{\"orderId\":\"test-order-$i\",\"customerEmail\":\"test$i@example.com\",\"customerName\":\"Test User $i\",\"orderType\":\"new_install\",\"servicePackage\":{\"name\":\"Test Package\",\"speed\":\"100/20\",\"price\":899},\"serviceAddress\":{\"street\":\"Test St\",\"city\":\"Test City\",\"province\":\"Test Province\",\"postalCode\":\"1234\"}}"
done
```

## 🔄 Integration with Order Workflow

### Test Order-to-Payment Flow

1. **Create Order** (via OMS)
2. **Transition to Validated State**
3. **Trigger Payment Request**:

```bash
curl -X POST http://localhost:3004/api/payments/create \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "actual-order-id-from-oms",
    "customerId": "customer-id-from-oms",
    "customerEmail": "customer@example.com",
    "customerName": "Customer Name",
    "orderType": "new_install",
    "servicePackage": {
      "name": "Selected Package",
      "speed": "100/20 Mbps",
      "price": 899.00,
      "installationFee": 500.00
    },
    "serviceAddress": {
      "street": "Customer Address",
      "city": "Customer City",
      "province": "Customer Province",
      "postalCode": "1234"
    }
  }'
```

4. **Complete Mock Payment**
5. **Verify Order Status Update** (when webhook integration is complete)

## 🚨 Troubleshooting

### Mock Mode Not Activating

Check environment variables:
```bash
echo $USE_MOCK_PAYMENTS
echo $PEACH_ENTITY_ID
echo $PEACH_ACCESS_TOKEN
```

Should see:
- `USE_MOCK_PAYMENTS=true` OR
- `PEACH_ENTITY_ID=test_entity_id` OR
- `PEACH_ACCESS_TOKEN=test_access_token`

### Payment Status Not Updating

- Wait 30+ seconds for automatic status change
- Use mock checkout page for immediate status change
- Send manual webhook for instant update

### Database Errors

Ensure migration is run:
```bash
npm run migrate
```

### Email Not Sending

- Check SMTP configuration
- Set `SEND_MOCK_EMAILS=false` to disable actual email sending
- Check console logs for email processing messages

## 🎯 Next Steps

Once you have real Peach Payments credentials:

1. Update `.env` with real credentials:
   ```env
   USE_MOCK_PAYMENTS=false
   PEACH_ENTITY_ID=your_real_entity_id
   PEACH_ACCESS_TOKEN=your_real_access_token
   PEACH_API_URL=https://eu-test.oppwa.com  # or production URL
   ```

2. Restart the service
3. Test with small amounts first
4. Verify webhook signature validation
5. Switch to production URLs when ready

## 📞 Support

If you encounter issues:
1. Check console logs for `🎭 [MockPaymentService]` messages
2. Verify database records are being created
3. Test individual endpoints with Postman
4. Review this guide for common scenarios

The mock system simulates all Peach Payments functionality, so your integration code will work seamlessly when you switch to real credentials!
