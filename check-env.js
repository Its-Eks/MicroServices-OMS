// Check environment variables
console.log('🔍 Environment Variables Check:');
console.log('ONBOARDING_SERVICE_API_KEY:', process.env.ONBOARDING_SERVICE_API_KEY ? 'SET' : 'NOT SET');
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'SET' : 'NOT SET');
console.log('USE_MOCK_PAYMENTS:', process.env.USE_MOCK_PAYMENTS);

// Test the same logic as PaymentController
const hasValidStripeKey = process.env.STRIPE_SECRET_KEY && 
                         process.env.STRIPE_SECRET_KEY !== 'sk_test_your_secret_key' &&
                         process.env.STRIPE_SECRET_KEY.startsWith('sk_');

const useMockData = process.env.USE_MOCK_PAYMENTS === 'true' || !hasValidStripeKey;

console.log('\n🎯 Configuration Logic:');
console.log('hasValidStripeKey:', hasValidStripeKey);
console.log('useMockData:', useMockData);
console.log('Will use:', useMockData ? 'MOCK PAYMENTS' : 'REAL STRIPE');

// Test API key validation
const expectedApiKey = 'secure-service-key-change-in-production';
const providedApiKey = 'secure-service-key-change-in-production';
console.log('\n🔐 API Key Check:');
console.log('Expected:', expectedApiKey);
console.log('Provided:', providedApiKey);
console.log('Match:', expectedApiKey === providedApiKey);
