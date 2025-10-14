const axios = require('axios');
require('dotenv').config();

async function testReadonlyParams() {
  console.log('🔍 Testing Readonly Parameters for Peach Payments...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  try {
    // Create a test checkout
    console.log('🔄 Creating test checkout...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const createResponse = await axios.post(createUrl, {
      amount: '1748.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: 'REF-41756',
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

    // Test different readonly parameter combinations
    const readonlyTests = [
      // Basic readonly
      {
        name: 'readonly=true',
        params: 'readonly=true'
      },
      // Disabled fields
      {
        name: 'disabled=true',
        params: 'disabled=true'
      },
      // Readonly individual fields
      {
        name: 'readonly=amount,email,reference',
        params: 'readonly=amount,email,reference'
      },
      // Disabled individual fields
      {
        name: 'disabled=amount,email,reference',
        params: 'disabled=amount,email,reference'
      },
      // Locked fields
      {
        name: 'locked=true',
        params: 'locked=true'
      },
      // Editable=false
      {
        name: 'editable=false',
        params: 'editable=false'
      },
      // Form readonly
      {
        name: 'form_readonly=true',
        params: 'form_readonly=true'
      },
      // Multiple readonly flags
      {
        name: 'readonly=true&disabled=true',
        params: 'readonly=true&disabled=true'
      }
    ];

    console.log('\n🧪 Testing readonly parameter combinations...\n');

    for (const test of readonlyTests) {
      const testUrl = `https://page.peachpayments.com/xnext?checkoutId=${checkoutId}&entityId=${entityId}&amount=1748.00&currency=ZAR&email=jesse.mashoana@gmail.com&reference=REF-41756&${test.params}`;
      
      console.log(`Testing: ${test.name}`);
      console.log(`URL: ${testUrl}`);
      
      try {
        const response = await axios.get(testUrl, {
          timeout: 5000,
          maxRedirects: 0,
          validateStatus: (status) => status < 400
        });
        
        console.log('  ✅ SUCCESS - Status:', response.status);
        
        // Check if the response contains readonly indicators
        if (response.data && typeof response.data === 'string') {
          const content = response.data.toLowerCase();
          if (content.includes('readonly') || content.includes('disabled') || content.includes('lock')) {
            console.log('  🎯 Readonly/disabled indicators found in response!');
          }
        }
        
      } catch (error) {
        if (error.response && error.response.status >= 300 && error.response.status < 400) {
          console.log('  ✅ REDIRECT - Status:', error.response.status);
          console.log('  📍 Location:', error.response.headers.location);
        } else {
          console.log('  ❌ FAILED - Status:', error.response?.status || 'No response');
          console.log('  📄 Error:', error.response?.data?.result?.description || error.message);
        }
      }
      console.log('');
    }

    console.log('💡 If readonly parameters don\'t work, we may need to:');
    console.log('1. Use a custom payment page with readonly fields');
    console.log('2. Implement client-side validation to prevent editing');
    console.log('3. Use Peach Payments API to create a locked checkout');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testReadonlyParams().catch(console.error);
