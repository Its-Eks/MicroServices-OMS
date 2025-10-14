// Update order number format to use REF-XXXXX format
console.log('🔧 Updating Order Number Format...\n');

// Current format: ORD-XXXXX (5 digits)
// New format: REF-XXXXX (5 digits) or REF-XXXXXX (6 digits)

function generateOrderNumber(digits = 5) {
  const prefix = 'REF';
  const random = Math.floor(Math.random() * Math.pow(10, digits)).toString().padStart(digits, '0');
  return `${prefix}-${random}`;
}

console.log('📋 Order Number Format Examples:');
console.log('5 digits:', generateOrderNumber(5));
console.log('5 digits:', generateOrderNumber(5));
console.log('5 digits:', generateOrderNumber(5));
console.log('6 digits:', generateOrderNumber(6));
console.log('6 digits:', generateOrderNumber(6));
console.log('6 digits:', generateOrderNumber(6));

console.log('\n💡 Recommendations:');
console.log('1. Use REF-XXXXX (5 digits) for shorter references');
console.log('2. Use REF-XXXXXX (6 digits) for more unique references');
console.log('3. Peach Payments will generate their own longer reference');
console.log('4. Show Peach reference to customers for payment tracking');
console.log('5. Use our REF-XXXXX for internal order tracking');

console.log('\n🔧 Code Changes Needed:');
console.log('1. Update OMS Server: generateOrderNumber() function');
console.log('2. Update Payment Service: use Peach reference for customer display');
console.log('3. Update Frontend: display Peach reference in payment form');
