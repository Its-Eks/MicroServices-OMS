const axios = require('axios');
require('dotenv').config();

async function testPeachParams() {
  console.log('🔍 Testing Peach Payments URL Parameters...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  try {
    // Create a test checkout with specific amount
    console.log('🔄 Creating test checkout...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const createResponse = await axios.post(createUrl, {
      amount: '1748.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: `test_params_${Date.now()}`,
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

    // Test different URL parameter combinations
    const baseUrl = 'https://page.peachpayments.com/xnext';
    const urlVariations = [
      // Basic URL
      `${baseUrl}?checkoutId=${checkoutId}&entityId=${entityId}`,
      
      // With amount parameter
      `${baseUrl}?checkoutId=${checkoutId}&entityId=${entityId}&amount=1748.00`,
      
      // With amount and currency
      `${baseUrl}?checkoutId=${checkoutId}&entityId=${entityId}&amount=1748.00&currency=ZAR`,
      
      // With customer email
      `${baseUrl}?checkoutId=${checkoutId}&entityId=${entityId}&amount=1748.00&email=jesse.mashoana@gmail.com`,
      
      // With reference
      `${baseUrl}?checkoutId=${checkoutId}&entityId=${entityId}&amount=1748.00&reference=68bf3838-2eb6-4a94-a6d4-5e1441753965`,
      
      // All parameters
      `${baseUrl}?checkoutId=${checkoutId}&entityId=${entityId}&amount=1748.00&currency=ZAR&email=jesse.mashoana@gmail.com&reference=68bf3838-2eb6-4a94-a6d4-5e1441753965`,
      
      // Alternative parameter names
      `${baseUrl}?checkoutId=${checkoutId}&entityId=${entityId}&total=1748.00&customerEmail=jesse.mashoana@gmail.com`,
      
      // With readonly flag
      `${baseUrl}?checkoutId=${checkoutId}&entityId=${entityId}&amount=1748.00&readonly=true`,
      
      // With disabled flag
      `${baseUrl}?checkoutId=${checkoutId}&entityId=${entityId}&amount=1748.00&disabled=true`
    ];

    console.log('\n🧪 Testing URL parameter variations...\n');

    for (let i = 0; i < urlVariations.length; i++) {
      const url = urlVariations[i];
      console.log(`${i + 1}. Testing: ${url}`);
      
      try {
        const response = await axios.get(url, {
          timeout: 5000,
          maxRedirects: 0,
          validateStatus: (status) => status < 400
        });
        
        console.log(`   ✅ SUCCESS - Status: ${response.status}`);
        
        // Check if the response contains the amount
        if (response.data && typeof response.data === 'string') {
          if (response.data.includes('1748.00')) {
            console.log('   🎯 Amount found in response!');
          }
          if (response.data.includes('jesse.mashoana@gmail.com')) {
            console.log('   🎯 Email found in response!');
          }
          if (response.data.includes('readonly') || response.data.includes('disabled')) {
            console.log('   🎯 Form fields might be readonly!');
          }
        }
        
      } catch (error) {
        if (error.response && error.response.status >= 300 && error.response.status < 400) {
          console.log(`   ✅ REDIRECT - Status: ${error.response.status}`);
          console.log(`   📍 Location: ${error.response.headers.location}`);
        } else {
          console.log(`   ❌ FAILED - Status: ${error.response?.status || 'No response'}`);
          console.log(`   📄 Error: ${error.response?.data?.result?.description || error.message}`);
        }
      }
      console.log('');
    }

    console.log('💡 Recommendations:');
    console.log('1. If amount parameter works, use it in the payment URL');
    console.log('2. If readonly/disabled parameters work, add them to prevent editing');
    console.log('3. Consider using a custom payment page if Peach doesn\'t support readonly fields');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPeachParams().catch(console.error);
