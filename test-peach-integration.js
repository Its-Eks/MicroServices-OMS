/*
  Quick Peach Payments API Keys Test

  Usage:
    PEACH_ENDPOINT=https://test.oppwa.com \
    PEACH_ACCESS_TOKEN=your_access_token \
    node test-peach-integration.js

  Optional env:
    PEACH_MERCHANT_ID, SUCCESS_URL, CANCEL_URL

  What it does:
    - Validates required envs
    - Sends a minimal Hosted Checkout create request
    - Prints the returned reference and redirect URL on success
    - Exits non-zero on failure (useful for CI checks)
*/

const axios = require('axios');

async function main() {
  const endpoint = process.env.PEACH_ENDPOINT || 'https://test.oppwa.com';
  const accessToken = 'OGFjZGE0Y2I5MTRmYzY1YzAxOTE1NWZkMWQxYTFkY2J8Qk1Sc3NwZDc1SDNlc1JHOQ==';
  const merchantId = process.env.PEACH_MERCHANT_ID || '8acda4ca914fc80501915a6e33712d5f';
  const successUrl = process.env.SUCCESS_URL || 'http://localhost:5173/payment/success?ref={reference}';
  const cancelUrl = process.env.CANCEL_URL || 'http://localhost:5173/payment/cancelled?ref={reference}';

  if (!accessToken) {
    console.error('❌ PEACH_ACCESS_TOKEN is required');
    process.exit(1);
  }

  console.log('🔧 Testing Peach API credentials...');
  console.log('  PEACH_ENDPOINT:', endpoint);
  console.log('  PEACH_MERCHANT_ID:', merchantId);

  try {
    const amountZAR = '1.00'; // small test amount
    const payload = {
      amount: amountZAR,
      currency: 'ZAR',
      merchantTransactionId: `test_${Date.now()}`,
      customer: {
        email: 'test@example.com',
        givenName: 'Test'
      },
      billing: {
        street1: '1 Test Street',
        city: 'Cape Town',
        state: 'WC',
        postcode: '8001',
        country: 'ZA'
      },
      successUrl,
      cancelUrl
    };

    const url = `${endpoint.replace(/\/+$/g, '')}/v1/checkouts`;
    const resp = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const ref = resp.data?.reference || resp.data?.id || resp.data?.checkoutId;
    const redirectUrl = resp.data?.redirectUrl || resp.data?.paymentLink || resp.data?.url;
    if (!ref || !redirectUrl) {
      console.error('❌ Peach response missing reference or redirect URL');
      console.error('Response snippet:', JSON.stringify(resp.data, null, 2).slice(0, 1000));
      process.exit(2);
    }

    console.log('✅ Peach API keys verified: checkout created');
    console.log('  reference:', ref);
    console.log('  redirectUrl:', redirectUrl);
    process.exit(0);
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error('❌ Peach API test failed');
    if (status) console.error('  HTTP status:', status);
    if (data) console.error('  Response:', JSON.stringify(data, null, 2).slice(0, 2000));
    if (err?.code) console.error('  Code:', err.code);
    if (err?.message) console.error('  Message:', err.message);
    console.error('\nHints:');
    console.error('- Ensure PEACH_ACCESS_TOKEN is valid and belongs to the same entity as the webhook/config');
    console.error('- Use PEACH_ENDPOINT=https://test.oppwa.com for sandbox');
    console.error('- Some tenants require whitelisted callback/redirect URLs in the Back Office');
    process.exit(3);
  }
}

main().catch((e) => {
  console.error('❌ Unexpected error:', e?.message || e);
  process.exit(4);
});


