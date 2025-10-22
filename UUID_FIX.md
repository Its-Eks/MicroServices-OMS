# Fix for UUID Error in Payment Link Testing

## The Problem

The error occurs because the database expects `orderId` to be a valid UUID format, but we're using a simple string like `"test-1761129783"`.

## Quick Fix - Use Valid UUID

Replace the `orderId` in your Postman request with a valid UUID:

### Updated Postman Request Body

```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "customerId": "550e8400-e29b-41d4-a716-446655440001",
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

## Alternative Solutions

### Option 1: Generate UUID in Postman

Use Postman's dynamic variables to generate a UUID:

```json
{
  "orderId": "{{$guid}}",
  "customerId": "{{$guid}}",
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

### Option 2: Use Timestamp-based UUID

```json
{
  "orderId": "test-{{$timestamp}}-{{$randomInt}}",
  "customerId": "cust-{{$timestamp}}-{{$randomInt}}",
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

Wait, that won't work either. Let me check the database schema...

## Check Database Schema

Let me verify what the database expects for the `orderId` field:

```sql
-- Check the orders table schema
\d orders;

-- Or check the payment_links table schema
\d payment_links;
```

## Proper UUID Format

Use one of these valid UUID formats:

### Valid UUID Examples:
- `550e8400-e29b-41d4-a716-446655440000`
- `6ba7b810-9dad-11d1-80b4-00c04fd430c8`
- `6ba7b811-9dad-11d1-80b4-00c04fd430c8`

### Generate UUID Online:
- Visit: https://www.uuidgenerator.net/
- Copy a generated UUID

## Updated Testing Request

**POST** `http://localhost:3004/api/payments/create`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer test_api_key_12345
```

**Body:**
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "customerId": "550e8400-e29b-41d4-a716-446655440001",
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

## Expected Response (After Fix)

```json
{
  "success": true,
  "message": "Payment link created and email sent successfully",
  "paymentLink": {
    "id": "peach_link_1234567890_abc123",
    "url": "http://localhost:5173/payment?amount=1.00&email=test@example.com&reference=550e8400-e29b-41d4-a716-446655440000&orderId=550e8400-e29b-41d4-a716-446655440000&paymentLinkUrl=https://l.ppay.io/abc123&paymentLinkId=ad7741e3-bc91-4b07-8cbd-347517f2809e",
    "checkoutId": "ad7741e3-bc91-4b07-8cbd-347517f2809e",
    "expiresAt": "2025-10-22T12:00:00.000Z"
  }
}
```

## Why This Happened

The database schema likely defines `orderId` as:
```sql
order_id UUID NOT NULL
```

UUIDs must follow the format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

## Quick UUID Generator

If you need more UUIDs for testing:

```javascript
// In Postman Pre-request Script
pm.environment.set("test_uuid", pm.variables.replaceIn('{{$guid}}'));
```

Then use `{{test_uuid}}` in your request body.

## Test Again

1. **Update your Postman request** with a valid UUID
2. **Send the request**
3. **Check for the success response**
4. **Look for the Payment Link URL** in the response

Let me know what response you get after using a valid UUID! 🚀

