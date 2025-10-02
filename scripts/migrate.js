const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function runMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'oms_db',
  });

  try {
    console.log('🔄 Running payment tables migration...');
    
    const migrationPath = path.join(__dirname, '..', 'src', 'migrations', '001_payment_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    await pool.query(migrationSQL);
    
    console.log('✅ Payment tables migration completed successfully!');
    console.log('📋 Created tables:');
    console.log('   - payment_links');
    console.log('   - payment_notifications');
    console.log('   - payment_webhook_events');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
