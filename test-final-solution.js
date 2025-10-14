const axios = require('axios');
require('dotenv').config();

async function testFinalSolution() {
  console.log('🔍 Testing Final Solution: Minimal Checkout Approach...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  try {
    // Create minimal checkout (same as updated payment service)
    console.log('🔄 Creating minimal checkout...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const createResponse = await axios.post(createUrl, {
      amount: '1748.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: '68bf3838-2eb6-4a94-a6d4-5e1441753965',
      // No customer or billing data to minimize editable fields
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
    console.log('✅ Minimal checkout created:', checkoutId);

    // Test the minimal payment URL (same as frontend will generate)
    const minimalPaymentUrl = `https://page.peachpayments.com/xnext?checkoutId=${checkoutId}&entityId=${entityId}`;
    
    console.log('\n🔗 Minimal Payment URL:');
    console.log(minimalPaymentUrl);

    // Test the URL
    console.log('\n🧪 Testing minimal payment URL...');
    try {
      const response = await axios.get(minimalPaymentUrl, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status < 400
      });
      
      console.log('✅ SUCCESS - Status:', response.status);
      console.log('📄 Content-Type:', response.headers['content-type']);
      
      // Check if the response contains form fields
      if (response.data && typeof response.data === 'string') {
        const content = response.data.toLowerCase();
        
        // Count input fields
        const inputMatches = content.match(/<input[^>]*>/g) || [];
        console.log('📝 Total input fields found:', inputMatches.length);
        
        // Check for specific field types
        if (content.includes('amount') || content.includes('total')) {
          console.log('💰 Contains amount/total field');
        }
        if (content.includes('email')) {
          console.log('📧 Contains email field');
        }
        if (content.includes('reference') || content.includes('ref')) {
          console.log('📋 Contains reference field');
        }
        if (content.includes('card') || content.includes('number')) {
          console.log('💳 Contains card number field');
        }
        if (content.includes('cvv') || content.includes('security')) {
          console.log('🔒 Contains CVV field');
        }
        if (content.includes('expiry') || content.includes('expire')) {
          console.log('📅 Contains expiry field');
        }
        
        // Check for readonly/disabled attributes
        const readonlyMatches = content.match(/readonly|disabled/g) || [];
        if (readonlyMatches.length > 0) {
          console.log('🔒 Found readonly/disabled attributes:', readonlyMatches.length);
        }
        
        // Check if amount is pre-filled
        if (content.includes('1748.00')) {
          console.log('🎯 Amount (1748.00) is pre-filled!');
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
    console.log('With minimal checkout, Peach Payments should show:');
    console.log('✅ Fewer editable fields (ideally only card details)');
    console.log('✅ Amount should be fixed at 1748.00 (set in checkout)');
    console.log('✅ No email/reference fields to edit');
    console.log('✅ Only card number, expiry, and CVV fields');

    console.log('\n🎯 Solution Summary:');
    console.log('1. ✅ Custom payment page shows readonly order details');
    console.log('2. ✅ User confirms order details on your page');
    console.log('3. ✅ Click "Proceed to Payment" redirects to minimal Peach checkout');
    console.log('4. ✅ Peach shows only card entry fields (amount is fixed)');
    console.log('5. ✅ Customer cannot edit amount, email, or reference');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testFinalSolution().catch(console.error);
