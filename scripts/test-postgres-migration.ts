#!/usr/bin/env tsx

/**
 * Test script to verify PostgreSQL migration is working
 * Run with: npx tsx scripts/test-postgres-migration.ts
 */

import { query, getPool } from '../lib/postgres/client'

async function testDatabaseConnection() {
  console.log('🔍 Testing PostgreSQL connection...')
  
  try {
    // Test basic connection
    const result = await query('SELECT NOW() as current_time')
    console.log('✅ Database connection successful')
    console.log('📅 Current time:', result.rows[0].current_time)
    
    // Test if tables exist
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('tenants', 'profiles', 'jobs', 'schemas', 'generated_data', 'media', 'exports')
      ORDER BY table_name
    `)
    
    console.log('📋 Found tables:', tablesResult.rows.map(r => r.table_name))
    
    // Test auth schema
    const authTablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'auth' 
      ORDER BY table_name
    `)
    
    console.log('🔐 Auth tables:', authTablesResult.rows.map(r => r.table_name))
    
    // Test functions
    const functionsResult = await query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name IN ('create_user', 'authenticate_user', 'get_next_job', 'send_job_control_signal')
      ORDER BY routine_name
    `)
    
    console.log('⚙️  Found functions:', functionsResult.rows.map(r => r.routine_name))
    
    console.log('🎉 PostgreSQL migration test completed successfully!')
    
  } catch (error) {
    console.error('❌ Database test failed:', error)
    process.exit(1)
  } finally {
    // Close the pool
    const pool = getPool()
    await pool.end()
    console.log('🔌 Database connection closed')
  }
}

// Run the test
testDatabaseConnection().catch(console.error)
