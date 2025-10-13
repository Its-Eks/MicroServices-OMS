const axios = require('axios');

async function testPaymentConfig() {
  console.log('🔍 Testing Payment Service Configuration...\n');

  try {
    // Test the payment endpoint with valid UUIDs
    const paymentRequest = {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      customerId: '550e8400-e29b-41d4-a716-446655440001',
      customerEmail: 'jesse.mashoana@gmail.com',
      customerName: 'Test Customer',
      orderType: 'new_install',
      servicePackage: {
        name: 'Internet Service',
        speed: '100/50 Mbps',
        price: 749,
        installationFee: 999,
        installationType: 'professional'
      },
      serviceAddress: {
        street: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8000'
      }
    };

    console.log('📤 Sending payment request...');
    console.log('Request data:', JSON.stringify(paymentRequest, null, 2));

    const response = await axios.post('http://localhost:3004/api/payments/create', paymentRequest, {
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': 'oms-svc-auth-x9k2m8n4p7q1w5e8r3t6y9u2i5o8p1a4s7d0f3g6h9j2k5l8'
      },
      timeout: 10000
    });

    console.log('\n✅ Payment request successful!');
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.log('\n❌ Payment request failed!');
    console.log('Error status:', error.response?.status);
    console.log('Error message:', error.response?.data || error.message);
    
    if (error.response?.data?.error) {
      console.log('Detailed error:', error.response.data.error);
    }
  }
}

testPaymentConfig();
