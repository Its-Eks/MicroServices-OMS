const { Pool } = require('pg');
require('dotenv').config();

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔧 Running payment_links table migrations...');
    
    // Migration 1: Add customer_email column
    try {
      await pool.query(`
        ALTER TABLE payment_links 
        ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255)
      `);
      console.log('✅ Added customer_email column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✅ customer_email column already exists');
      } else {
        throw error;
      }
    }
    
    // Migration 2: Add stripe_session_id column
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
    
    // Migration 3: Make peach_checkout_id nullable
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
    
    // Migration 4: Add paid_at column
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
    
    // Migration 5: Create indexes
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_payment_links_customer_email 
        ON payment_links(customer_email)
      `);
      console.log('✅ Created index for customer_email');
    } catch (error) {
      console.log('⚠️ Could not create customer_email index:', error.message);
    }
    
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_payment_links_stripe_session_id 
        ON payment_links(stripe_session_id)
      `);
      console.log('✅ Created index for stripe_session_id');
    } catch (error) {
      console.log('⚠️ Could not create stripe_session_id index:', error.message);
    }
    
    // Check final table structure
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'payment_links' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Final payment_links table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    console.log('\n🎉 All migrations completed successfully!');
    
  } catch (error) {
    console.error('❌ Error running migrations:', error.message);
  } finally {
    await pool.end();
  }
}

runMigrations();
