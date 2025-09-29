#!/usr/bin/env node

/**
 * Database Migration Runner
 * 
 * Usage:
 *   node scripts/migrate.js                    # Run all migrations
 *   node scripts/migrate.js --check           # Check database status
 *   node scripts/migrate.js --reset           # Reset and run all migrations
 *   node scripts/migrate.js --file 001_*.sql  # Run specific migration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Configuration
const DB_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const SCRIPTS_DIR = path.join(__dirname);

if (!DB_URL) {
  console.error(`${colors.red}❌ Database URL not found. Please set POSTGRES_URL or DATABASE_URL environment variable.${colors.reset}`);
  process.exit(1);
}

// Migration files in order
const MIGRATIONS = [
  '001_create_core_schema.sql',
  '002_profile_trigger.sql',
  '003_tenant_onboarding.sql',
  '004_job_system_enhancements.sql',
  '005_export_system.sql',
  '006_media_system.sql',
  '008_fix_rls_policies.sql',
  '009_fix_rls_recursion_final.sql',
  '010_enhanced_job_system.sql',
  '011_job_controls_system.sql',
  '012_add_missing_job_columns.sql',
  '013_seeding_infrastructure.sql',
  '014_google_drive_integration.sql',
  '015_intelligence_layer.sql',
  '016_fix_job_processing_schema.sql'
];

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, options = {}) {
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: 'pipe',
      ...options 
    });
    return { success: true, output: result };
  } catch (error) {
    return { 
      success: false, 
      error: error.message, 
      output: error.stdout || error.stderr 
    };
  }
}

function testDatabaseConnection() {
  log('🔍 Testing database connection...', 'blue');
  
  const result = execCommand(`psql "${DB_URL}" -c "SELECT 1;"`);
  
  if (result.success) {
    log('✅ Database connection successful', 'green');
    return true;
  } else {
    log(`❌ Cannot connect to database: ${result.error}`, 'red');
    return false;
  }
}

function runMigration(scriptName) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  
  if (!fs.existsSync(scriptPath)) {
    log(`❌ Migration script not found: ${scriptPath}`, 'red');
    return false;
  }
  
  log(`📄 Running migration: ${scriptName}`, 'yellow');
  
  const result = execCommand(`psql "${DB_URL}" -f "${scriptPath}" -v ON_ERROR_STOP=1`);
  
  if (result.success) {
    log(`✅ Migration completed: ${scriptName}`, 'green');
    return true;
  } else {
    log(`❌ Migration failed: ${scriptName}`, 'red');
    log(`Error: ${result.error}`, 'red');
    if (result.output) {
      log(`Output: ${result.output}`, 'red');
    }
    return false;
  }
}

function checkDatabaseStatus() {
  log('📊 Database Status:', 'blue');
  log('Tables:', 'cyan');
  
  const tablesResult = execCommand(`psql "${DB_URL}" -c "\\dt"`);
  if (tablesResult.success) {
    console.log(tablesResult.output);
  }
  
  log('Functions:', 'cyan');
  const functionsResult = execCommand(`psql "${DB_URL}" -c "\\df"`);
  if (functionsResult.success) {
    console.log(functionsResult.output);
  }
  
  log('Recent Jobs:', 'cyan');
  const jobsResult = execCommand(`psql "${DB_URL}" -c "SELECT id, name, status, total_records, generated_records, progress, created_at FROM jobs ORDER BY created_at DESC LIMIT 5;"`);
  if (jobsResult.success) {
    console.log(jobsResult.output);
  }
}

function resetDatabase() {
  log('⚠️  Resetting database (this will delete all data!)', 'yellow');
  
  const resetResult = execCommand(`psql "${DB_URL}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"`);
  
  if (resetResult.success) {
    log('✅ Database reset successful', 'green');
    return true;
  } else {
    log(`❌ Database reset failed: ${resetResult.error}`, 'red');
    return false;
  }
}

function runAllMigrations() {
  log('🚀 Starting Database Migrations', 'blue');
  log(`Database URL: ${DB_URL}`, 'blue');
  log('');
  
  if (!testDatabaseConnection()) {
    process.exit(1);
  }
  
  log('');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const migration of MIGRATIONS) {
    if (runMigration(migration)) {
      successCount++;
    } else {
      failCount++;
      log(`❌ Stopping migration process due to failure in ${migration}`, 'red');
      break;
    }
    log('');
  }
  
  log(`📊 Migration Summary:`, 'blue');
  log(`✅ Successful: ${successCount}`, 'green');
  log(`❌ Failed: ${failCount}`, failCount > 0 ? 'red' : 'green');
  
  if (failCount === 0) {
    log('🎉 All migrations completed successfully!', 'green');
    checkDatabaseStatus();
  } else {
    log('💥 Migration process failed!', 'red');
    process.exit(1);
  }
}

function runSpecificMigration(filename) {
  log(`🎯 Running specific migration: ${filename}`, 'blue');
  
  if (!testDatabaseConnection()) {
    process.exit(1);
  }
  
  if (runMigration(filename)) {
    log('✅ Migration completed successfully!', 'green');
  } else {
    log('❌ Migration failed!', 'red');
    process.exit(1);
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    log('Database Migration Runner', 'bold');
    log('');
    log('Usage:', 'cyan');
    log('  node scripts/migrate.js                    # Run all migrations');
    log('  node scripts/migrate.js --check           # Check database status');
    log('  node scripts/migrate.js --reset           # Reset and run all migrations');
    log('  node scripts/migrate.js --file 001_*.sql  # Run specific migration');
    log('');
    log('Environment Variables:', 'cyan');
    log('  POSTGRES_URL or DATABASE_URL - Database connection string');
    return;
  }
  
  if (args.includes('--check')) {
    checkDatabaseStatus();
    return;
  }
  
  if (args.includes('--reset')) {
    if (resetDatabase()) {
      runAllMigrations();
    } else {
      process.exit(1);
    }
    return;
  }
  
  const fileIndex = args.indexOf('--file');
  if (fileIndex !== -1 && fileIndex + 1 < args.length) {
    const filename = args[fileIndex + 1];
    runSpecificMigration(filename);
    return;
  }
  
  // Default: run all migrations
  runAllMigrations();
}

main();
