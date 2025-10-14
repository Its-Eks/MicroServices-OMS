// Fix environment variables for Peach Payments
console.log('🔧 Fixing Peach Payments Environment Variables...\n');

// Current problematic URLs
const currentSuccessUrl = 'https://oms-client-01ry.onrender.com//payment/success?ref={reference}';
const currentCancelUrl = 'https://oms-client-01ry.onrender.com//payment/cancelled?ref={reference}';

// Fixed URLs (remove double slashes)
const fixedSuccessUrl = 'https://oms-client-01ry.onrender.com/payment/success?ref={reference}';
const fixedCancelUrl = 'https://oms-client-01ry.onrender.com/payment/cancelled?ref={reference}';

console.log('❌ Current SUCCESS_URL:', currentSuccessUrl);
console.log('✅ Fixed SUCCESS_URL:', fixedSuccessUrl);
console.log('');
console.log('❌ Current CANCEL_URL:', currentCancelUrl);
console.log('✅ Fixed CANCEL_URL:', fixedCancelUrl);
console.log('');

console.log('📋 Updated Environment Variables:');
console.log('PEACH_CHANNEL=hosted');
console.log('PAYMENT_PROVIDER=peach');
console.log('PEACH_ENDPOINT=https://card.peachpayments.com');
console.log('PEACH_HOSTED_ENTITY_ID=8acda4ca914fc80501915a6e33712d5f');
console.log('PEACH_HOSTED_ACCESS_TOKEN=OGFjZGE0Y2I5MTRmYzY1YzAxOTE1NWZkMWQxYTFkY2J8Qk1Sc3NwZDc1SDNlc1JHOQ==');
console.log('PEACH_PAYMENT_PAGE_URL=https://page.peachpayments.com/xnext');
console.log('SUCCESS_URL=' + fixedSuccessUrl);
console.log('CANCEL_URL=' + fixedCancelUrl);
console.log('');

console.log('🚀 Next Steps:');
console.log('1. Update your Render environment variables with the fixed URLs');
console.log('2. Deploy the updated onboarding service with the redirect endpoint');
console.log('3. Deploy the updated frontend with the new payment flow');
