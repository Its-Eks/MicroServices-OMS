const axios = require('axios');
require('dotenv').config();

async function debugPeachAuth() {
  console.log('🔍 Debugging Peach Payments Authentication...\n');

  // Check environment variables
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://sandbox-card.peachpayments.com';
  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;

  console.log('📋 Environment Variables:');
  console.log('  PEACH_ENDPOINT:', peachEndpoint);
  console.log('  PEACH_HOSTED_ENTITY_ID:', entityId ? `${entityId.substring(0, 8)}...` : 'NOT SET');
  console.log('  PEACH_HOSTED_ACCESS_TOKEN:', accessToken ? `${accessToken.substring(0, 20)}...` : 'NOT SET');
  console.log('  PAYMENT_PROVIDER:', process.env.PAYMENT_PROVIDER || 'not set');

  if (!entityId) {
    console.error('\n❌ PEACH_HOSTED_ENTITY_ID is required');
    return;
  }

  if (!accessToken) {
    console.error('\n❌ PEACH_HOSTED_ACCESS_TOKEN is required');
    return;
  }

  // Test different endpoints
  const endpoints = [
    'https://sandbox-card.peachpayments.com',
    'https://card.peachpayments.com',
    'https://test.oppwa.com',
    'https://eu-test.oppwa.com'
  ];

  for (const endpoint of endpoints) {
    console.log(`\n🧪 Testing endpoint: ${endpoint}`);
    
    try {
      const createUrl = `${endpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
      
      const response = await axios.post(createUrl, {
        amount: '1.00',
        currency: 'ZAR',
        paymentType: 'DB',
        merchantTransactionId: `test_${Date.now()}`,
        customer: {
          email: 'test@example.com',
          givenName: 'Test',
          surname: 'User'
        },
        billing: {
          street1: '123 Test St',
          city: 'Cape Town',
          state: 'western-cape',
          postcode: '8001',
          country: 'ZA'
        },
        successUrl: 'https://example.com/success?ref={reference}',
        cancelUrl: 'https://example.com/cancel?ref={reference}'
      }, {
        headers: { 
          Authorization: `Bearer ${accessToken}`, 
          'Content-Type': 'application/json' 
        },
        timeout: 10000
      });

      console.log('  ✅ SUCCESS!');
      console.log('  📄 Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data.reference) {
        const paymentUrl = `${endpoint}/v1/checkouts/${response.data.reference}/payment?entityId=${entityId}`;
        console.log('  🔗 Payment URL:', paymentUrl);
      }
      
      break; // Stop on first success
      
    } catch (error) {
      console.log('  ❌ FAILED');
      if (error.response) {
        console.log('  📄 Status:', error.response.status);
        console.log('  📄 Data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('  📄 Error:', error.message);
      }
    }
  }

  // Test with different authentication methods
  console.log('\n🔐 Testing different authentication methods...');
  
  // Test with Basic Auth (if token looks like base64)
  if (accessToken && !accessToken.startsWith('Bearer ')) {
    try {
      const basicAuth = Buffer.from(accessToken).toString('base64');
      const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
      
      const response = await axios.post(createUrl, {
        amount: '1.00',
        currency: 'ZAR',
        paymentType: 'DB',
        merchantTransactionId: `test_basic_${Date.now()}`
      }, {
        headers: { 
          Authorization: `Basic ${basicAuth}`, 
          'Content-Type': 'application/json' 
        },
        timeout: 10000
      });

      console.log('  ✅ Basic Auth SUCCESS!');
      console.log('  📄 Response:', JSON.stringify(response.data, null, 2));
      
    } catch (error) {
      console.log('  ❌ Basic Auth FAILED');
      if (error.response) {
        console.log('  📄 Status:', error.response.status);
        console.log('  📄 Data:', JSON.stringify(error.response.data, null, 2));
      }
    }
  }
}

debugPeachAuth().catch(console.error);
