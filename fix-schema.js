const { Pool } = require('pg');
require('dotenv').config();

async function fixSchema() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:password@localhost:5432/oms_database',
    ssl: false
  });

  try {
    console.log('🔧 Fixing payment_links table schema...');
    
    // Make peach_checkout_id nullable
    await pool.query(`
      ALTER TABLE payment_links 
      ALTER COLUMN peach_checkout_id DROP NOT NULL
    `);
    
    console.log('✅ Made peach_checkout_id nullable');
    
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
    
    console.log('🎉 Schema fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing schema:', error.message);
  } finally {
    await pool.end();
  }
}

fixSchema();
