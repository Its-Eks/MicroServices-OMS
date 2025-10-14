const axios = require('axios');
require('dotenv').config();

async function testPaymentFlow() {
  console.log('🔍 Testing Complete Payment Flow...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  console.log('📋 Configuration:');
  console.log('  PEACH_ENDPOINT:', peachEndpoint);
  console.log('  Entity ID:', entityId.substring(0, 8) + '...');
  console.log('  Access Token:', accessToken.substring(0, 20) + '...');

  try {
    // Step 1: Create checkout (same as your service does)
    console.log('\n🔄 Step 1: Creating checkout...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const checkoutData = {
      amount: '1748.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: '5c78726a-d419-496c-8ea1-8c634d7f7945',
      customer: {
        email: 'jesse.mashoana@gmail.com',
        givenName: 'Jesse',
        surname: 'Mashoana'
      },
      billing: {
        street1: '123 Test Street',
        city: 'Cape Town',
        state: 'Western Cape',
        postcode: '8000',
        country: 'ZA'
      },
      successUrl: 'https://oms-client-01ry.onrender.com/payment/success?ref={reference}',
      cancelUrl: 'https://oms-client-01ry.onrender.com/payment/cancelled?ref={reference}'
    };

    console.log('📤 Request URL:', createUrl);
    console.log('📤 Request Data:', JSON.stringify(checkoutData, null, 2));

    const createResponse = await axios.post(createUrl, checkoutData, {
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      timeout: 20000
    });

    console.log('✅ Checkout created successfully!');
    console.log('📄 Response:', JSON.stringify(createResponse.data, null, 2));

    const reference = createResponse.data.id || createResponse.data.reference;
    if (!reference) {
      console.error('❌ No reference returned from checkout creation');
      return;
    }

    // Step 2: Build payment URL (same as your frontend does)
    console.log('\n🔄 Step 2: Building payment URL...');
    const paymentUrl = `${peachEndpoint}/v1/checkouts/${reference}/payment?entityId=${entityId}`;
    console.log('🔗 Payment URL:', paymentUrl);

    // Step 3: Test the payment URL (this is what fails)
    console.log('\n🔄 Step 3: Testing payment URL...');
    try {
      const paymentResponse = await axios.get(paymentUrl, {
        headers: { 
          Authorization: `Bearer ${accessToken}`
        },
        timeout: 10000,
        maxRedirects: 0, // Don't follow redirects
        validateStatus: (status) => status < 400 // Accept redirects as success
      });

      console.log('✅ Payment URL accessible!');
      console.log('📄 Status:', paymentResponse.status);
      console.log('📄 Headers:', JSON.stringify(paymentResponse.headers, null, 2));

    } catch (redirectError) {
      if (redirectError.response && redirectError.response.status >= 300 && redirectError.response.status < 400) {
        console.log('✅ Payment URL redirects (expected for hosted checkout)');
        console.log('📄 Status:', redirectError.response.status);
        console.log('📄 Location:', redirectError.response.headers.location);
      } else {
        console.log('❌ Payment URL failed');
        console.log('📄 Error:', redirectError.message);
        if (redirectError.response) {
          console.log('📄 Status:', redirectError.response.status);
          console.log('📄 Data:', JSON.stringify(redirectError.response.data, null, 2));
        }
      }
    }

    // Step 4: Test without authentication (as browser would)
    console.log('\n🔄 Step 4: Testing payment URL without auth (browser simulation)...');
    try {
      const browserResponse = await axios.get(paymentUrl, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status < 400
      });

      console.log('✅ Payment URL works without auth!');
      console.log('📄 Status:', browserResponse.status);

    } catch (browserError) {
      if (browserError.response && browserError.response.status >= 300 && browserError.response.status < 400) {
        console.log('✅ Payment URL redirects without auth (expected)');
        console.log('📄 Status:', browserError.response.status);
        console.log('📄 Location:', browserError.response.headers.location);
      } else {
        console.log('❌ Payment URL failed without auth');
        console.log('📄 Error:', browserError.message);
        if (browserError.response) {
          console.log('📄 Status:', browserError.response.status);
          console.log('📄 Data:', JSON.stringify(browserError.response.data, null, 2));
        }
      }
    }

  } catch (error) {
    console.error('❌ Payment flow failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPaymentFlow().catch(console.error);
