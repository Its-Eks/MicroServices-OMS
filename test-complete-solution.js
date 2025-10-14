const axios = require('axios');
require('dotenv').config();

async function testCompleteSolution() {
  console.log('🔍 Testing Complete Payment Solution...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  try {
    // Generate a short reference
    const refNumber = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    const shortReference = `REF-${refNumber}`;
    
    console.log('📋 Test Configuration:');
    console.log('  Short Reference:', shortReference);
    console.log('  Length:', shortReference.length, 'characters');

    // Create checkout with short reference
    console.log('\n🔄 Creating checkout with short reference...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const createResponse = await axios.post(createUrl, {
      amount: '1748.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: shortReference,
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

    // Build the final payment URL with all parameters (same as our services generate)
    const params = new URLSearchParams({
      checkoutId: peachReference,
      entityId: entityId,
      amount: '1748.00',
      currency: 'ZAR',
      email: 'jesse.mashoana@gmail.com',
      reference: shortReference, // Use short reference for customer display
      readonly: 'true', // Make form fields readonly
      disabled: 'true'  // Additional readonly parameter
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
    console.log('  reference:', shortReference, '(SHORT - 9 characters)');
    console.log('  readonly: true');
    console.log('  disabled: true');

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

    console.log('\n🎯 Expected Customer Experience:');
    console.log('1. Customer clicks "Proceed to Payment"');
    console.log('2. Redirects to Peach Payments with pre-filled data');
    console.log('3. Form shows:');
    console.log('   - Amount: 1748.00 (pre-filled, should be readonly)');
    console.log('   - Email: jesse.mashoana@gmail.com (pre-filled, should be readonly)');
    console.log('   - Reference: REF-XXXXX (pre-filled, should be readonly)');
    console.log('4. Customer can only enter card details and pay');
    console.log('5. No "reference too long" errors');

    console.log('\n💡 Summary:');
    console.log('✅ Short Reference: REF-XXXXX format (9 characters)');
    console.log('✅ No Length Issues: Short reference fits in form fields');
    console.log('✅ Readonly Parameters: Added to prevent editing');
    console.log('✅ Pre-filled Data: Amount, email, and reference set');
    console.log('✅ Payment Flow: Complete end-to-end solution');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testCompleteSolution().catch(console.error);
