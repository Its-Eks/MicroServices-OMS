const axios = require('axios');

async function testAuth() {
  console.log('🔐 Testing Service Authentication...\n');

  try {
    // Test with different API keys
    const apiKeys = [
      'secure-service-key-change-in-production',
      'dev-service-key',
      'oms-svc-auth-key',
      'default-service-key'
    ];

    for (const apiKey of apiKeys) {
      console.log(`Testing with API key: ${apiKey.substring(0, 10)}...`);
      
      try {
        const response = await axios.post(
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
              'x-service-key': apiKey
            }
          }
        );
        
        console.log(`✅ SUCCESS with API key: ${apiKey.substring(0, 10)}...`);
        break;
      } catch (error) {
        if (error.response?.status === 401) {
          console.log(`❌ 401 Unauthorized with: ${apiKey.substring(0, 10)}...`);
        } else {
          console.log(`❌ Other error with: ${apiKey.substring(0, 10)}... - ${error.message}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAuth();
