const { Pool } = require('pg');
require('dotenv').config();

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 Checking payment_links table schema...');
    
    const result = await pool.query(`
      SELECT column_name, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'payment_links' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 payment_links table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} | nullable: ${row.is_nullable} | default: ${row.column_default || 'none'}`);
    });
    
    // Check if peach_checkout_id is nullable
    const peachCheckoutColumn = result.rows.find(row => row.column_name === 'peach_checkout_id');
    if (peachCheckoutColumn) {
      console.log(`\n⚠️  peach_checkout_id is_nullable: ${peachCheckoutColumn.is_nullable}`);
      if (peachCheckoutColumn.is_nullable === 'NO') {
        console.log('❌ This is the problem! peach_checkout_id is NOT NULL but we\'re trying to insert null values.');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
