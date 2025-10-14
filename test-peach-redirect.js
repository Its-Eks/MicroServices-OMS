const axios = require('axios');
require('dotenv').config();

async function testPeachRedirect() {
  console.log('🔍 Testing Peach Payments Redirect Endpoint...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  try {
    // Step 1: Create a test checkout
    console.log('🔄 Step 1: Creating test checkout...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const createResponse = await axios.post(createUrl, {
      amount: '1.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: `test_redirect_${Date.now()}`,
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

    const checkoutId = createResponse.data.id;
    console.log('✅ Checkout created:', checkoutId);

    // Step 2: Test our redirect endpoint
    console.log('\n🔄 Step 2: Testing redirect endpoint...');
    const redirectUrl = `http://localhost:3004/api/payments/peach-redirect/${checkoutId}/${encodeURIComponent(entityId)}`;
    console.log('🔗 Redirect URL:', redirectUrl);

    try {
      const redirectResponse = await axios.get(redirectUrl, {
        timeout: 10000,
        maxRedirects: 0, // Don't follow redirects
        validateStatus: (status) => status < 400
      });

      console.log('✅ Redirect endpoint works!');
      console.log('📄 Status:', redirectResponse.status);
      console.log('📄 Headers:', JSON.stringify(redirectResponse.headers, null, 2));

    } catch (redirectError) {
      if (redirectError.response && redirectError.response.status >= 300 && redirectError.response.status < 400) {
        console.log('✅ Redirect endpoint redirects (expected)');
        console.log('📄 Status:', redirectError.response.status);
        console.log('📄 Location:', redirectError.response.headers.location);
        
        // Verify the redirect goes to Peach Payments
        const location = redirectError.response.headers.location;
        if (location && location.includes('peachpayments.com')) {
          console.log('✅ Redirects to Peach Payments correctly!');
        } else {
          console.log('❌ Redirect location unexpected:', location);
        }
      } else {
        console.log('❌ Redirect endpoint failed');
        console.log('📄 Error:', redirectError.message);
        if (redirectError.response) {
          console.log('📄 Status:', redirectError.response.status);
          console.log('📄 Data:', JSON.stringify(redirectError.response.data, null, 2));
        }
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPeachRedirect().catch(console.error);
