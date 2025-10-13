const axios = require('axios');

async function testPaymentPreFill() {
  try {
    console.log('🧪 Testing Payment Pre-fill Flow...\n');

    // Test data matching the email example
    const paymentRequest = {
      orderId: 'test-order-123',
      customerId: 'customer-456',
      customerEmail: 'adam.reeves@example.com',
      customerName: 'Adam Reeves',
      orderType: 'new_install',
      servicePackage: {
        name: 'internet',
        speed: '100/50 Mbps',
        price: 749.00,
        installationFee: 999.00,
        installationType: 'professional_install'
      },
      serviceAddress: {
        street: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001'
      }
    };

    console.log('📝 Payment Request Data:');
    console.log(JSON.stringify(paymentRequest, null, 2));
    console.log('\n');

    // Test with mock payments first
    console.log('🎭 Testing Mock Payment Service...');
    
    // Set environment to use mock payments
    process.env.USE_MOCK_PAYMENTS = 'true';
    process.env.PAYMENT_PROVIDER = 'peach';
    
    const mockResponse = await axios.post('http://localhost:3004/api/payments/create', paymentRequest, {
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': 'oms-svc-auth-x9k2m8n4p7q1w5e8r3t6y9u2i5o8p1a4s7d0f3g6h9j2k5l8'
      }
    });

    console.log('✅ Mock Payment Response:');
    console.log(JSON.stringify(mockResponse.data, null, 2));
    console.log('\n');

    // Extract the payment URL
    const paymentUrl = mockResponse.data.data.paymentUrl;
    console.log('🔗 Generated Payment URL:');
    console.log(paymentUrl);
    console.log('\n');

    // Parse URL parameters to verify pre-filled data
    const url = new URL(paymentUrl);
    const params = url.searchParams;
    
    console.log('📋 Pre-filled Parameters:');
    console.log(`Amount: R${params.get('amount')}`);
    console.log(`Email: ${params.get('email')}`);
    console.log(`Reference: ${params.get('reference')}`);
    console.log(`Order ID: ${params.get('orderId')}`);
    console.log(`Checkout ID: ${params.get('checkoutId')}`);
    console.log(`Entity ID: ${params.get('entityId')}`);
    console.log('\n');

    // Verify the data matches our request
    const expectedAmount = (paymentRequest.servicePackage.price + paymentRequest.servicePackage.installationFee).toFixed(2);
    const actualAmount = params.get('amount');
    
    console.log('✅ Verification:');
    console.log(`Expected Amount: R${expectedAmount}`);
    console.log(`Actual Amount: R${actualAmount}`);
    console.log(`Amount Match: ${expectedAmount === actualAmount ? '✅' : '❌'}`);
    console.log(`Email Match: ${paymentRequest.customerEmail === params.get('email') ? '✅' : '❌'}`);
    console.log(`Reference Match: ${paymentRequest.orderId === params.get('reference') ? '✅' : '❌'}`);

    console.log('\n🎉 Payment pre-fill test completed!');
    console.log('\n📱 To test the UI:');
    console.log('1. Open the payment URL in your browser');
    console.log('2. Verify that all fields are pre-filled and read-only');
    console.log('3. Click "Pay Now" to proceed to Peach Payments');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testPaymentPreFill();
