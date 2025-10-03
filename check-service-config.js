const axios = require('axios');

async function checkServiceConfig() {
  console.log('🔍 Checking Service Configuration...\n');

  try {
    // Check if service is running
    console.log('1️⃣ Checking service health...');
    const healthResponse = await axios.get('http://localhost:3004/health');
    console.log('✅ Service is running');

    // Try to get service info (if available)
    console.log('\n2️⃣ Checking service configuration...');
    try {
      const configResponse = await axios.get('http://localhost:3004/api/config');
      console.log('✅ Service config:', configResponse.data);
    } catch (error) {
      console.log('ℹ️  No config endpoint available');
    }

    // Test with the exact key from the service
    console.log('\n3️⃣ Testing with service key...');
    const testResponse = await axios.post(
      'http://localhost:3004/api/payments/create',
      {
        orderId: 'test-123',
        customerId: 'test-123', 
        customerEmail: 'test@example.com',
        customerName: 'Test',
        orderType: 'new_install',
        servicePackage: { name: 'test', speed: 'test', price: 100, installationFee: 50, installationType: 'test' },
        serviceAddress: { street: 'test', city: 'test', province: 'test', postalCode: 'test' }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': 'secure-service-key-change-in-production'
        }
      }
    );
    
    console.log('✅ Payment creation successful!');
    console.log('Response:', testResponse.data);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

checkServiceConfig();
