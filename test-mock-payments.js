const axios = require('axios');

const BASE_URL = 'http://localhost:3004/api/payments';

// Test data
const testPaymentRequest = {
  orderId: `test-order-${Date.now()}`,
  customerId: 'test-customer-123',
  customerEmail: 'test@example.com',
  customerName: 'John Doe',
  orderType: 'new_install',
  servicePackage: {
    name: 'Fiber Premium 100/20',
    speed: '100/20 Mbps',
    price: 899.00,
    installationFee: 500.00,
    installationType: 'professional_install'
  },
  serviceAddress: {
    street: '123 Main Street',
    city: 'Cape Town',
    province: 'Western Cape',
    postalCode: '8001'
  }
};

async function testMockPayments() {
  console.log('🎭 Testing Mock Payment System\n');

  try {
    // Test 1: Create Payment Link
    console.log('1️⃣ Creating payment link...');
    const createResponse = await axios.post(`${BASE_URL}/create`, testPaymentRequest);
    
    if (createResponse.data.success) {
      console.log('✅ Payment link created successfully!');
      console.log(`   Payment ID: ${createResponse.data.data.paymentLinkId}`);
      console.log(`   Payment URL: ${createResponse.data.data.paymentUrl}`);
      console.log(`   Expires: ${createResponse.data.data.expiresAt}`);
      console.log(`   Email Sent: ${createResponse.data.data.emailSent}\n`);
      
      const paymentLinkId = createResponse.data.data.paymentLinkId;
      
      // Test 2: Check Payment Status
      console.log('2️⃣ Checking payment status...');
      const statusResponse = await axios.get(`${BASE_URL}/${paymentLinkId}/status`);
      
      if (statusResponse.data.success) {
        console.log('✅ Payment status retrieved successfully!');
        console.log(`   Status: ${statusResponse.data.data.status}`);
        console.log(`   Amount: R${statusResponse.data.data.amount} ${statusResponse.data.data.currency}`);
        console.log(`   Mock Data: ${statusResponse.data.data.mockData}\n`);
      }
      
      // Test 3: Simulate Webhook
      console.log('3️⃣ Simulating payment webhook...');
      const webhookData = {
        id: statusResponse.data.data.checkoutId,
        status: 'completed',
        result: {
          code: '000.100.110',
          description: 'Request successfully processed'
        },
        mockData: true
      };
      
      const webhookResponse = await axios.post(`${BASE_URL}/webhook`, webhookData);
      
      if (webhookResponse.data.success) {
        console.log('✅ Webhook processed successfully!');
        console.log(`   Checkout ID: ${webhookResponse.data.checkoutId}\n`);
      }
      
      // Test 4: Check Updated Status
      console.log('4️⃣ Checking updated payment status...');
      const updatedStatusResponse = await axios.get(`${BASE_URL}/${paymentLinkId}/status`);
      
      if (updatedStatusResponse.data.success) {
        console.log('✅ Updated payment status retrieved!');
        console.log(`   Status: ${updatedStatusResponse.data.data.status}`);
        console.log(`   Mock Data: ${updatedStatusResponse.data.data.mockData}\n`);
      }
      
      console.log('🎉 All mock payment tests completed successfully!');
      console.log('\n📋 Next Steps:');
      console.log('   1. Visit the payment URL in your browser to see the mock checkout page');
      console.log('   2. Check your database for payment records');
      console.log('   3. Review the MOCK_PAYMENT_TESTING_GUIDE.md for more test scenarios');
      
    } else {
      console.error('❌ Failed to create payment link:', createResponse.data.error);
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Connection refused. Make sure the onboarding-service is running on port 3004');
      console.log('\n🚀 To start the service:');
      console.log('   cd onboarding-service');
      console.log('   npm run dev');
    } else if (error.response) {
      console.error('❌ API Error:', error.response.status, error.response.data);
    } else {
      console.error('❌ Test failed:', error.message);
    }
  }
}

// Run the test
testMockPayments();
