const axios = require('axios');
require('dotenv').config();

async function testPeachEndpoints() {
  console.log('🔍 Testing Peach Payments Endpoints...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  // Test both sandbox and production endpoints
  const endpoints = [
    {
      name: 'Sandbox (Test)',
      url: 'https://sandbox-card.peachpayments.com',
      description: 'Use this for testing with sandbox credentials'
    },
    {
      name: 'Production (Live)',
      url: 'https://card.peachpayments.com',
      description: 'Use this for live payments with production credentials'
    }
  ];

  for (const endpoint of endpoints) {
    console.log(`🧪 Testing ${endpoint.name}: ${endpoint.url}`);
    console.log(`   ${endpoint.description}`);
    
    try {
      const createUrl = `${endpoint.url}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
      
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

      console.log('   ✅ SUCCESS!');
      console.log('   📄 Code:', response.data.result?.code);
      console.log('   📄 Description:', response.data.result?.description);
      
      if (response.data.id) {
        const paymentUrl = `${endpoint.url}/v1/checkouts/${response.data.id}/payment?entityId=${entityId}`;
        console.log('   🔗 Payment URL:', paymentUrl);
      }
      
    } catch (error) {
      console.log('   ❌ FAILED');
      if (error.response) {
        console.log('   📄 Status:', error.response.status);
        console.log('   📄 Code:', error.response.data?.result?.code);
        console.log('   📄 Description:', error.response.data?.result?.description);
      } else {
        console.log('   📄 Error:', error.message);
      }
    }
    console.log('');
  }

  // Provide recommendations
  console.log('💡 Recommendations:');
  console.log('1. If you\'re testing, use: PEACH_ENDPOINT=https://sandbox-card.peachpayments.com');
  console.log('2. If you\'re going live, use: PEACH_ENDPOINT=https://card.peachpayments.com');
  console.log('3. Make sure your credentials match the environment (sandbox vs production)');
  console.log('4. Update your Render environment variables accordingly');
}

testPeachEndpoints().catch(console.error);
