const axios = require('axios');

async function testStripeOnly() {
  console.log('🧪 Testing Stripe Payment Link Creation...\n');

  try {
    const testData = {
      orderId: '756c0509-9d1e-49a6-8c22-797366a410d2',
      customerId: '7308d209-a5be-49a9-8692-26abe87f7c8b',
      customerEmail: 'jesse.mashoana@gmail.com',
      customerName: 'Jesse Mashoana',
      orderType: 'new_install',
      servicePackage: {
        name: 'wireless',
        speed: '100/20',
        price: 599,
        installationFee: 999,
        installationType: 'professional_install'
      },
      serviceAddress: {
        street: '123 main street',
        city: 'Cape Town',
        province: 'western-cape',
        postalCode: '8001'
      }
    };

    console.log('📤 Creating payment link...');
    
    const response = await axios.post(
      'http://localhost:3004/api/payments/create',
      testData,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': 'oms-svc-auth-x9k2m8n4p7q1w5e8r3t6y9u2i5o8p1a4s7d0f3g6h9j2k5l8'
        }
      }
    );
    
    console.log('✅ Payment link created!');
    console.log('📥 Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success && response.data.data.paymentUrl) {
      const paymentUrl = response.data.data.paymentUrl;
      if (paymentUrl.includes('checkout.stripe.com')) {
        console.log('🎉 SUCCESS: REAL STRIPE CHECKOUT URL!');
        console.log('🔗 Payment URL:', paymentUrl);
        console.log('💰 This is a real Stripe payment link that customers can use to pay!');
      } else if (paymentUrl.includes('mock-checkout')) {
        console.log('⚠️  Still using mock payment URL');
        console.log('🔗 Mock URL:', paymentUrl);
      } else {
        console.log('❓ Unknown payment URL type:', paymentUrl);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testStripeOnly();
