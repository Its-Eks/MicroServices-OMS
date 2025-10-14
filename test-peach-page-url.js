const axios = require('axios');
require('dotenv').config();

async function testPeachPageUrl() {
  console.log('🔍 Testing Peach Payments Page URL Method...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';
  const pageUrl = process.env.PEACH_PAYMENT_PAGE_URL || 'https://page.peachpayments.com/xnext';

  console.log('📋 Configuration:');
  console.log('  PEACH_ENDPOINT:', peachEndpoint);
  console.log('  PEACH_PAYMENT_PAGE_URL:', pageUrl);
  console.log('  Entity ID:', entityId ? `${entityId.substring(0, 8)}...` : 'NOT SET');
  console.log('  Access Token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'NOT SET');

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  try {
    // Test 1: Try the page URL directly
    console.log('\n🧪 Test 1: Testing page URL directly...');
    try {
      const pageResponse = await axios.get(pageUrl, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status < 400
      });
      console.log('✅ Page URL accessible');
      console.log('📄 Status:', pageResponse.status);
    } catch (pageError) {
      if (pageError.response && pageError.response.status >= 300 && pageError.response.status < 400) {
        console.log('✅ Page URL redirects (expected)');
        console.log('📄 Status:', pageError.response.status);
        console.log('📄 Location:', pageError.response.headers.location);
      } else {
        console.log('❌ Page URL failed');
        console.log('📄 Error:', pageError.message);
      }
    }

    // Test 2: Create checkout and try different URL patterns
    console.log('\n🧪 Test 2: Creating checkout and testing URL patterns...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const createResponse = await axios.post(createUrl, {
      amount: '1.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: `test_page_${Date.now()}`,
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
      successUrl: 'https://oms-client-01ry.onrender.com/payment/success?ref={reference}',
      cancelUrl: 'https://oms-client-01ry.onrender.com/payment/cancelled?ref={reference}'
    }, {
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      timeout: 10000
    });

    const checkoutId = createResponse.data.id;
    console.log('✅ Checkout created:', checkoutId);

    // Test different URL patterns
    const urlPatterns = [
      `${peachEndpoint}/v1/checkouts/${checkoutId}/payment?entityId=${entityId}`,
      `${pageUrl}?checkoutId=${checkoutId}&entityId=${entityId}`,
      `${pageUrl}/${checkoutId}?entityId=${entityId}`,
      `https://page.peachpayments.com/checkout/${checkoutId}?entityId=${entityId}`
    ];

    for (const url of urlPatterns) {
      console.log(`\n🔗 Testing: ${url}`);
      try {
        const response = await axios.get(url, {
          timeout: 5000,
          maxRedirects: 0,
          validateStatus: (status) => status < 400
        });
        console.log('  ✅ SUCCESS - Status:', response.status);
      } catch (error) {
        if (error.response && error.response.status >= 300 && error.response.status < 400) {
          console.log('  ✅ REDIRECT - Status:', error.response.status);
          console.log('  📍 Location:', error.response.headers.location);
        } else {
          console.log('  ❌ FAILED - Status:', error.response?.status || 'No response');
          console.log('  📄 Error:', error.response?.data?.result?.description || error.message);
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

testPeachPageUrl().catch(console.error);
