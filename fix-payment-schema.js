const { Pool } = require('pg');
require('dotenv').config();

async function fixPaymentSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔧 Fixing payment_links table schema...');
    
    // Add stripe_session_id column if it doesn't exist
    try {
      await pool.query(`
        ALTER TABLE payment_links 
        ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255)
      `);
      console.log('✅ Added stripe_session_id column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✅ stripe_session_id column already exists');
      } else {
        throw error;
      }
    }
    
    // Make peach_checkout_id nullable (in case it's not)
    try {
      await pool.query(`
        ALTER TABLE payment_links 
        ALTER COLUMN peach_checkout_id DROP NOT NULL
      `);
      console.log('✅ Made peach_checkout_id nullable');
    } catch (error) {
      if (error.message.includes('is not a column')) {
        console.log('✅ peach_checkout_id column does not exist (expected for Stripe)');
      } else {
        console.log('⚠️ Could not modify peach_checkout_id:', error.message);
      }
    }
    
    // Add paid_at column if it doesn't exist
    try {
      await pool.query(`
        ALTER TABLE payment_links 
        ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP
      `);
      console.log('✅ Added paid_at column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✅ paid_at column already exists');
      } else {
        throw error;
      }
    }
    
    // Create index for stripe_session_id
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_payment_links_stripe_session_id 
        ON payment_links(stripe_session_id)
      `);
      console.log('✅ Created index for stripe_session_id');
    } catch (error) {
      console.log('⚠️ Could not create index:', error.message);
    }
    
    // Check current table structure
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'payment_links' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Current payment_links table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    console.log('\n🎉 Schema fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing schema:', error.message);
  } finally {
    await pool.end();
  }
}

fixPaymentSchema();
