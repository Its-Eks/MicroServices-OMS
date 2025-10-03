const axios = require('axios');

async function debugService() {
  console.log('🔍 Debugging Service Configuration...\n');

  try {
    // Check service health
    console.log('1️⃣ Service Health Check...');
    const healthResponse = await axios.get('http://localhost:3004/health');
    console.log('✅ Service is running');

    // Test with a simple request to see what happens
    console.log('\n2️⃣ Testing service authentication...');
    
    const testData = {
      orderId: 'test-123',
      customerId: 'test-123',
      customerEmail: 'test@example.com',
      customerName: 'Test User',
      orderType: 'new_install',
      servicePackage: {
        name: 'wireless',
        speed: '100/20',
        price: 599,
        installationFee: 999,
        installationType: 'professional_install'
      },
      serviceAddress: {
        street: '123 Test St',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001'
      }
    };

    console.log('📤 Sending request with data:', JSON.stringify(testData, null, 2));
    
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
    
    console.log('✅ SUCCESS!');
    console.log('📥 Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success && response.data.data.paymentUrl) {
      if (response.data.data.paymentUrl.includes('checkout.stripe.com')) {
        console.log('🎉 REAL STRIPE URL GENERATED!');
      } else {
        console.log('⚠️  Still using mock URL');
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

debugService();
