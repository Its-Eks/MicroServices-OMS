const axios = require('axios');

async function testStripeIntegration() {
  console.log('🧪 Testing Stripe Integration...\n');

  try {
    // Test 1: Check onboarding service health
    console.log('1️⃣ Checking onboarding service health...');
    const healthResponse = await axios.get('http://localhost:3004/health');
    console.log('✅ Onboarding service is running');

    // Test 2: Create a test payment request
    console.log('\n2️⃣ Testing payment creation with real Stripe...');
    const paymentRequest = {
      orderId: 'test-order-' + Date.now(),
      customerId: 'test-customer-123',
      customerEmail: 'test@example.com',
      customerName: 'Test Customer',
      orderType: 'new_install',
      servicePackage: {
        name: 'Fiber 100/50 Mbps',
        speed: '100/50 Mbps',
        price: 749,
        installationFee: 999,
        installationType: 'professional'
      },
      serviceAddress: {
        street: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001'
      }
    };

    const paymentResponse = await axios.post(
      'http://localhost:3004/api/payments/create',
      paymentRequest,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': 'secure-service-key-change-in-production'
        }
      }
    );

    if (paymentResponse.data.success) {
      console.log('✅ Payment link created successfully!');
      console.log('🔗 Payment URL:', paymentResponse.data.data.paymentUrl);
      
      // Check if it's a real Stripe URL
      if (paymentResponse.data.data.paymentUrl.includes('checkout.stripe.com')) {
        console.log('🎉 SUCCESS: Real Stripe checkout URL generated!');
        console.log('💰 Amount: R' + (paymentResponse.data.data.paymentUrl.includes('cs_test_') ? 'Test' : 'Live') + ' payment');
      } else {
        console.log('❌ Still using mock payment URL');
      }
    } else {
      console.log('❌ Payment creation failed:', paymentResponse.data.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Run the test
testStripeIntegration();
