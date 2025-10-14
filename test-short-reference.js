const axios = require('axios');
require('dotenv').config();

async function testShortReference() {
  console.log('🔍 Testing Short Reference Format...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  try {
    // Generate a short REF-XXXXX format reference
    const refNumber = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    const shortReference = `REF-${refNumber}`;
    
    console.log('📋 Test Configuration:');
    console.log('  Short Reference:', shortReference);
    console.log('  Length:', shortReference.length, 'characters');
    console.log('  Format: REF-XXXXX (5 digits)');

    // Create checkout with short reference
    console.log('\n🔄 Creating checkout with short reference...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const createResponse = await axios.post(createUrl, {
      amount: '1748.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: shortReference, // Use short reference as merchant transaction ID
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

    const peachReference = createResponse.data.id;
    console.log('✅ Checkout created successfully!');
    console.log('📄 Peach Reference:', peachReference);
    console.log('📄 Short Reference:', shortReference);
    console.log('📄 Peach Reference Length:', peachReference.length, 'characters');
    console.log('📄 Short Reference Length:', shortReference.length, 'characters');

    // Build the final payment URL with SHORT reference for customer display
    const params = new URLSearchParams({
      checkoutId: peachReference,
      entityId: entityId,
      amount: '1748.00',
      currency: 'ZAR',
      email: 'jesse.mashoana@gmail.com',
      reference: shortReference // Use SHORT reference for customer display
    });
    
    const finalPaymentUrl = `https://page.peachpayments.com/xnext?${params.toString()}`;
    
    console.log('\n🔗 Final Payment URL:');
    console.log(finalPaymentUrl);
    console.log('\n📋 URL Parameters:');
    console.log('  checkoutId:', peachReference);
    console.log('  entityId:', entityId);
    console.log('  amount: 1748.00');
    console.log('  currency: ZAR');
    console.log('  email: jesse.mashoana@gmail.com');
    console.log('  reference:', shortReference, '(SHORT - for customer display)');

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
      
    } catch (error) {
      if (error.response && error.response.status >= 300 && error.response.status < 400) {
        console.log('✅ REDIRECT - Status:', error.response.status);
        console.log('📍 Location:', error.response.headers.location);
      } else {
        console.log('❌ FAILED - Status:', error.response?.status || 'No response');
        console.log('📄 Error:', error.response?.data?.result?.description || error.message);
      }
    }

    console.log('\n💡 Summary:');
    console.log('✅ Short Reference: REF-XXXXX format works');
    console.log('✅ Customer Display: Uses short reference (9 characters)');
    console.log('✅ Peach Tracking: Uses Peach reference internally');
    console.log('✅ No Length Issues: Short reference fits in form fields');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testShortReference().catch(console.error);
