const axios = require('axios');
require('dotenv').config();

async function testReadonlyFunctionality() {
  console.log('🔍 Testing Readonly Functionality...\n');

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

    // Test with readonly parameters (same as our payment service will generate)
    const readonlyUrl = `https://page.peachpayments.com/xnext?checkoutId=${checkoutId}&entityId=${entityId}&amount=1748.00&currency=ZAR&email=jesse.mashoana@gmail.com&reference=REF-41756&readonly=true&disabled=true`;
    
    console.log('\n🔗 Testing readonly URL:');
    console.log(readonlyUrl);
    
    try {
      const response = await axios.get(readonlyUrl, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status < 400
      });
      
      console.log('✅ SUCCESS - Status:', response.status);
      console.log('📄 Content-Type:', response.headers['content-type']);
      
      // Check if the response contains readonly indicators
      if (response.data && typeof response.data === 'string') {
        const content = response.data.toLowerCase();
        console.log('\n🔍 Analyzing response for readonly indicators...');
        
        // Look for readonly attributes
        if (content.includes('readonly') || content.includes('read-only')) {
          console.log('🎯 Found readonly attributes in HTML!');
        }
        
        // Look for disabled attributes
        if (content.includes('disabled')) {
          console.log('🎯 Found disabled attributes in HTML!');
        }
        
        // Look for input field patterns
        if (content.includes('input') && content.includes('type="text"')) {
          console.log('📝 Found text input fields');
        }
        
        // Look for form patterns
        if (content.includes('<form')) {
          console.log('📋 Found form element');
        }
        
        // Check for specific field patterns
        if (content.includes('amount') || content.includes('email') || content.includes('reference')) {
          console.log('📊 Found amount/email/reference fields');
        }
        
        // Save a sample of the HTML for manual inspection
        console.log('\n📄 HTML Sample (first 500 characters):');
        console.log(response.data.substring(0, 500));
        
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

    console.log('\n💡 Next Steps:');
    console.log('1. If readonly parameters work, fields should be non-editable');
    console.log('2. If they don\'t work, we may need to use a custom payment page');
    console.log('3. Test the actual payment flow to see if fields are readonly');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testReadonlyFunctionality().catch(console.error);
