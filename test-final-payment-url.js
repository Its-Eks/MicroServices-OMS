const axios = require('axios');
require('dotenv').config();

async function testFinalPaymentUrl() {
  console.log('🔍 Testing Final Payment URL with Pre-filled Parameters...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  try {
    // Create a test checkout with the exact same data as your order
    console.log('🔄 Creating test checkout with order data...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const createResponse = await axios.post(createUrl, {
      amount: '1748.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: '68bf3838-2eb6-4a94-a6d4-5e1441753965',
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
    }, {
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      timeout: 10000
    });

    const checkoutId = createResponse.data.id;
    console.log('✅ Checkout created:', checkoutId);

    // Build the final payment URL with all parameters (same as frontend will generate)
    const params = new URLSearchParams({
      checkoutId: checkoutId,
      entityId: entityId,
      amount: '1748.00',
      currency: 'ZAR',
      email: 'jesse.mashoana@gmail.com',
      reference: '68bf3838-2eb6-4a94-a6d4-5e1441753965'
    });
    
    const finalPaymentUrl = `https://page.peachpayments.com/xnext?${params.toString()}`;
    
    console.log('\n🔗 Final Payment URL:');
    console.log(finalPaymentUrl);
    console.log('\n📋 URL Parameters:');
    console.log('  checkoutId:', checkoutId);
    console.log('  entityId:', entityId);
    console.log('  amount: 1748.00');
    console.log('  currency: ZAR');
    console.log('  email: jesse.mashoana@gmail.com');
    console.log('  reference: 68bf3838-2eb6-4a94-a6d4-5e1441753965');

    // Test the final URL
    console.log('\n🧪 Testing final payment URL...');
    try {
      const response = await axios.get(finalPaymentUrl, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status < 400
      });
      
      console.log('✅ SUCCESS - Status:', response.status);
      console.log('📄 Content-Type:', response.headers['content-type']);
      
      // Check if the response contains the pre-filled data
      if (response.data && typeof response.data === 'string') {
        const content = response.data.toLowerCase();
        if (content.includes('1748.00')) {
          console.log('🎯 Amount (1748.00) found in response!');
        }
        if (content.includes('jesse.mashoana@gmail.com')) {
          console.log('🎯 Email found in response!');
        }
        if (content.includes('68bf3838-2eb6-4a94-a6d4-5e1441753965')) {
          console.log('🎯 Reference found in response!');
        }
        
        // Check for readonly or disabled attributes
        if (content.includes('readonly') || content.includes('disabled')) {
          console.log('🎯 Form fields appear to be readonly/disabled!');
        }
      }
      
    } catch (error) {
      if (error.response && error.response.status >= 300 && error.response.status < 400) {
        console.log('✅ REDIRECT - Status:', error.response.status);
        console.log('📍 Location:', error.response.headers.location);
      } else {
        console.log('❌ FAILED - Status:', error.response?.status || 'No response');
        console.log('📄 Error:', error.response?.data?.result?.description || error.message);
      }
    }

    console.log('\n💡 Expected Result:');
    console.log('When customers click "Proceed to Payment", they should see:');
    console.log('✅ Amount field pre-filled with 1748.00');
    console.log('✅ Email field pre-filled with jesse.mashoana@gmail.com');
    console.log('✅ Reference field pre-filled with order ID');
    console.log('✅ Fields should be readonly/disabled to prevent editing');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testFinalPaymentUrl().catch(console.error);
