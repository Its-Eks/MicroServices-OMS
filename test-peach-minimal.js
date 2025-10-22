const axios = require('axios');
require('dotenv').config();

async function testPeachMinimal() {
  console.log('🔍 Testing Peach Payments Minimal Checkout...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  try {
    // Test 1: Create checkout with minimal data (no customer/billing info)
    console.log('🔄 Test 1: Creating minimal checkout...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const minimalResponse = await axios.post(createUrl, {
      amount: '1748.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: `minimal_${Date.now()}`,
      successUrl: 'https://oms-client-01ry.onrender.com/payment/success?ref={reference}',
      cancelUrl: 'https://oms-client-01ry.onrender.com/payment/cancelled?ref={reference}'
    }, {
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      timeout: 10000
    });

    const minimalCheckoutId = minimalResponse.data.id;
    console.log('✅ Minimal checkout created:', minimalCheckoutId);

    // Test 2: Create checkout with customer data but no billing
    console.log('\n🔄 Test 2: Creating checkout with customer data...');
    const customerResponse = await axios.post(createUrl, {
      amount: '1748.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: `customer_${Date.now()}`,
      customer: {
        email: 'jesse.mashoana@gmail.com',
        givenName: 'Jesse',
        surname: 'Mashoana'
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

    const customerCheckoutId = customerResponse.data.id;
    console.log('✅ Customer checkout created:', customerCheckoutId);

    // Test different URL patterns
    const baseUrl = 'https://page.peachpayments.com/xnext';
    const testUrls = [
      // Minimal checkout
      `${baseUrl}?checkoutId=${minimalCheckoutId}&entityId=${entityId}`,
      
      // Customer checkout
      `${baseUrl}?checkoutId=${customerCheckoutId}&entityId=${entityId}`,
      
      // Try different page URLs
      `https://page.peachpayments.com/checkout?checkoutId=${minimalCheckoutId}&entityId=${entityId}`,
      `https://page.peachpayments.com/payment?checkoutId=${minimalCheckoutId}&entityId=${entityId}`,
      
      // Try with readonly parameter
      `${baseUrl}?checkoutId=${minimalCheckoutId}&entityId=${entityId}&readonly=true`,
      `${baseUrl}?checkoutId=${minimalCheckoutId}&entityId=${entityId}&mode=card-only`
    ];

    console.log('\n🧪 Testing different URL patterns...\n');

    for (let i = 0; i < testUrls.length; i++) {
      const url = testUrls[i];
      console.log(`${i + 1}. Testing: ${url}`);
      
      try {
        const response = await axios.get(url, {
          timeout: 5000,
          maxRedirects: 0,
          validateStatus: (status) => status < 400
        });
        
        console.log(`   ✅ SUCCESS - Status: ${response.status}`);
        
        // Check if the response contains form fields
        if (response.data && typeof response.data === 'string') {
          const content = response.data.toLowerCase();
          if (content.includes('input') && content.includes('amount')) {
            console.log('   📝 Contains amount input field');
          }
          if (content.includes('input') && content.includes('email')) {
            console.log('   📧 Contains email input field');
          }
          if (content.includes('readonly') || content.includes('disabled')) {
            console.log('   🔒 Contains readonly/disabled attributes');
          }
          if (content.includes('1748.00')) {
            console.log('   💰 Amount pre-filled');
          }
        }
        
      } catch (error) {
        if (error.response && error.response.status >= 300 && error.response.status < 400) {
          console.log(`   ✅ REDIRECT - Status: ${error.response.status}`);
        } else {
          console.log(`   ❌ FAILED - Status: ${error.response?.status || 'No response'}`);
        }
      }
      console.log('');
    }

    console.log('💡 Recommendations:');
    console.log('1. If minimal checkout shows fewer fields, use that approach');
    console.log('2. Consider using your custom payment page for order confirmation');
    console.log('3. Only redirect to Peach for card entry after user confirms order details');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPeachMinimal().catch(console.error);

