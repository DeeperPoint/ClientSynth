#!/bin/bash

# Database Migration Runner
# This script runs all database migrations in the correct order

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_URL="${POSTGRES_URL:-postgres://postgres.sntggkfanhpxholkvgqz:QgXOHDLdANvlJQwl@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require}"
SCRIPTS_DIR="./scripts"

echo -e "${BLUE}🚀 Starting Database Migrations${NC}"
echo -e "${BLUE}Database URL: ${DB_URL}${NC}"
echo ""

# Function to run a migration script
run_migration() {
    local script_name="$1"
    local script_path="${SCRIPTS_DIR}/${script_name}"
    
    if [ ! -f "$script_path" ]; then
        echo -e "${RED}❌ Migration script not found: ${script_path}${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}📄 Running migration: ${script_name}${NC}"
    
    if psql "$DB_URL" -f "$script_path" -v ON_ERROR_STOP=1; then
        echo -e "${GREEN}✅ Migration completed: ${script_name}${NC}"
    else
        echo -e "${RED}❌ Migration failed: ${script_name}${NC}"
        return 1
    fi
    echo ""
}

# List of migrations in order
MIGRATIONS=(
    "001_create_core_schema.sql"
    "002_profile_trigger.sql"
    "003_tenant_onboarding.sql"
    "004_job_system_enhancements.sql"
    "005_export_system.sql"
    "006_media_system.sql"
    "008_fix_rls_policies.sql"
    "009_fix_rls_recursion_final.sql"
    "010_enhanced_job_system.sql"
    "011_job_controls_system.sql"
    "012_add_missing_job_columns.sql"
    "013_seeding_infrastructure.sql"
    "014_google_drive_integration.sql"
    "015_intelligence_layer.sql"
    "016_fix_job_processing_schema.sql"
)

# Check if database is accessible
echo -e "${BLUE}🔍 Testing database connection...${NC}"
if psql "$DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection successful${NC}"
else
    echo -e "${RED}❌ Cannot connect to database${NC}"
    echo -e "${RED}Please check your POSTGRES_URL environment variable${NC}"
    exit 1
fi
echo ""

# Run all migrations
for migration in "${MIGRATIONS[@]}"; do
    run_migration "$migration"
done

echo -e "${GREEN}🎉 All migrations completed successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Database Status:${NC}"
echo -e "${BLUE}Tables:${NC}"
psql "$DB_URL" -c "\dt" | head -20

echo ""
echo -e "${BLUE}Functions:${NC}"
psql "$DB_URL" -c "\df" | head -10

echo ""
echo -e "${GREEN}✅ Migration process completed!${NC}"
