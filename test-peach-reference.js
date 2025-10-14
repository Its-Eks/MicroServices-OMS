const axios = require('axios');
require('dotenv').config();

async function testPeachReference() {
  console.log('🔍 Testing Peach Payments Reference Format...\n');

  const entityId = process.env.PEACH_HOSTED_ENTITY_ID || process.env.PEACH_ENTITY_ID;
  const accessToken = process.env.PEACH_HOSTED_ACCESS_TOKEN || process.env.PEACH_ACCESS_TOKEN;
  const peachEndpoint = process.env.PEACH_ENDPOINT || 'https://card.peachpayments.com';

  if (!entityId || !accessToken) {
    console.error('❌ Missing Peach Payments credentials');
    return;
  }

  try {
    // Create a test checkout to see what reference format Peach uses
    console.log('🔄 Creating test checkout to examine reference format...');
    const createUrl = `${peachEndpoint}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
    
    const createResponse = await axios.post(createUrl, {
      amount: '1.00',
      currency: 'ZAR',
      paymentType: 'DB',
      merchantTransactionId: 'REF-12345', // Test with our format
      customer: {
        email: 'test@example.com',
        givenName: 'Test',
        surname: 'User'
      },
      billing: {
        street1: '123 Test St',
        city: 'Cape Town',
        state: 'western-cape',
        postcode: '8001',
        country: 'ZA'
      },
      successUrl: 'https://example.com/success?ref={reference}',
      cancelUrl: 'https://example.com/cancel?ref={reference}'
    }, {
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      timeout: 10000
    });

    console.log('✅ Checkout created successfully!');
    console.log('📄 Full Response:', JSON.stringify(createResponse.data, null, 2));
    
    const peachReference = createResponse.data.id || createResponse.data.reference;
    console.log('\n🔍 Peach Payments Reference Analysis:');
    console.log('  Peach Reference:', peachReference);
    console.log('  Length:', peachReference?.length || 0);
    console.log('  Format:', peachReference ? 'Alphanumeric with dots' : 'Unknown');
    
    // Test different merchant transaction ID formats
    const testFormats = [
      'REF-12345',
      'REF-123456',
      'ORD-12345',
      'XNEXT-12345',
      '12345',
      'REF12345'
    ];

    console.log('\n🧪 Testing different merchant transaction ID formats...');
    
    for (const format of testFormats) {
      try {
        const testResponse = await axios.post(createUrl, {
          amount: '1.00',
          currency: 'ZAR',
          paymentType: 'DB',
          merchantTransactionId: format,
          customer: {
            email: 'test@example.com',
            givenName: 'Test',
            surname: 'User'
          },
          billing: {
            street1: '123 Test St',
            city: 'Cape Town',
            state: 'western-cape',
            postcode: '8001',
            country: 'ZA'
          },
          successUrl: 'https://example.com/success?ref={reference}',
          cancelUrl: 'https://example.com/cancel?ref={reference}'
        }, {
          headers: { 
            Authorization: `Bearer ${accessToken}`, 
            'Content-Type': 'application/json' 
          },
          timeout: 10000
        });

        console.log(`  ✅ ${format} - SUCCESS`);
        console.log(`     Peach Reference: ${testResponse.data.id}`);
        
      } catch (error) {
        console.log(`  ❌ ${format} - FAILED`);
        if (error.response?.data?.result?.description) {
          console.log(`     Error: ${error.response.data.result.description}`);
        }
      }
    }

    console.log('\n💡 Recommendations:');
    console.log('1. Use Peach Payments reference as the primary reference');
    console.log('2. Use REF-XXXXX format for merchant transaction ID');
    console.log('3. Keep references under 20 characters for compatibility');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPeachReference().catch(console.error);
