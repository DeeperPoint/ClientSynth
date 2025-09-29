# Database Migrations

This document explains how to run database migrations for the ClientSynth application.

## Prerequisites

- Node.js and pnpm installed
- PostgreSQL client (`psql`) installed
- `POSTGRES_URL` environment variable set

## Environment Setup

Make sure you have the database URL set in your environment:

```bash
export POSTGRES_URL="postgres://user:password@host:port/database?sslmode=require"
```

Or add it to your `.env` file:

```bash
POSTGRES_URL=postgres://user:password@host:port/database?sslmode=require
```

## Available Commands

### Migration Commands

```bash
# Run all migrations in order
pnpm db:migrate

# Check database status and show tables/functions
pnpm db:migrate:check

# Reset database and run all migrations (⚠️ DESTRUCTIVE)
pnpm db:migrate:reset

# Run a specific migration file
pnpm db:migrate:file 016_fix_job_processing_schema.sql
```

### Database Status Commands

```bash
# Show database status (tables, functions, recent jobs)
pnpm db:status

# Show recent jobs
pnpm db:jobs

# List all tables
pnpm db:tables

# List all functions
pnpm db:functions
```

## Migration Files

Migrations are run in the following order:

1. `001_create_core_schema.sql` - Core database schema
2. `002_profile_trigger.sql` - Profile triggers
3. `003_tenant_onboarding.sql` - Tenant onboarding system
4. `004_job_system_enhancements.sql` - Job system enhancements
5. `005_export_system.sql` - Export system
6. `006_media_system.sql` - Media system
7. `008_fix_rls_policies.sql` - RLS policy fixes
8. `009_fix_rls_recursion_final.sql` - RLS recursion fixes
9. `010_enhanced_job_system.sql` - Enhanced job system
10. `011_job_controls_system.sql` - Job controls system
11. `012_add_missing_job_columns.sql` - Missing job columns
12. `013_seeding_infrastructure.sql` - Seeding infrastructure
13. `014_google_drive_integration.sql` - Google Drive integration
14. `015_intelligence_layer.sql` - Intelligence layer
15. `016_fix_job_processing_schema.sql` - Job processing schema fixes

## Manual Migration

You can also run migrations manually using psql:

```bash
# Run a specific migration
psql "$POSTGRES_URL" -f scripts/016_fix_job_processing_schema.sql

# Run all migrations (bash script)
./scripts/run-migrations.sh
```

## Troubleshooting

### Connection Issues

If you get connection errors:

1. Check your `POSTGRES_URL` environment variable
2. Ensure the database server is running
3. Verify network connectivity
4. Check SSL requirements (`sslmode=require`)

### Migration Failures

If a migration fails:

1. Check the error message in the console
2. Verify the migration file exists and is valid SQL
3. Check for conflicting schema changes
4. Use `pnpm db:migrate:check` to see current database state

### Reset Database

⚠️ **WARNING**: This will delete all data!

```bash
pnpm db:migrate:reset
```

## Development Workflow

### First Time Setup

```bash
# 1. Set environment variables
export POSTGRES_URL="your-database-url"

# 2. Run all migrations
pnpm db:migrate

# 3. Verify setup
pnpm db:status
```

### Adding New Migrations

1. Create a new SQL file in `scripts/` directory
2. Name it with the next sequential number (e.g., `017_new_feature.sql`)
3. Add it to the `MIGRATIONS` array in `scripts/migrate.js`
4. Test with `pnpm db:migrate:file 017_new_feature.sql`

### Production Deployment

```bash
# 1. Backup database first
pg_dump "$POSTGRES_URL" > backup.sql

# 2. Run migrations
pnpm db:migrate

# 3. Verify deployment
pnpm db:status
```

## Migration Script Features

The migration script (`scripts/migrate.js`) provides:

- ✅ **Colorized output** for better readability
- ✅ **Error handling** with detailed error messages
- ✅ **Connection testing** before running migrations
- ✅ **Progress tracking** with success/failure counts
- ✅ **Database status checking** with tables and functions
- ✅ **Individual migration support** for testing
- ✅ **Reset functionality** for development

## Examples

### Check Database Status

```bash
$ pnpm db:status

📊 Database Status:
Tables:
              List of relations
 Schema |      Name       | Type  |  Owner
--------+-----------------+-------+----------
 public | jobs           | table | postgres
 public | media          | table | postgres
 public | schemas        | table | postgres
 public | tenants        | table | postgres

Recent Jobs:
                  id                  |          name           |  status   | total_records | generated_records | progress
--------------------------------------+-------------------------+-----------+---------------+-------------------+----------
 d8b0e181-8d38-4c52-8be1-eae00dbb7e05 | Test Media Insert Fixed | completed |             1 |                 1 |      100
```

### Run Specific Migration

```bash
$ pnpm db:migrate:file 016_fix_job_processing_schema.sql

🎯 Running specific migration: 016_fix_job_processing_schema.sql
🔍 Testing database connection...
✅ Database connection successful
📄 Running migration: 016_fix_job_processing_schema.sql
✅ Migration completed: 016_fix_job_processing_schema.sql
✅ Migration completed successfully!
```

### Reset and Migrate

```bash
$ pnpm db:migrate:reset

⚠️  Resetting database (this will delete all data!)
✅ Database reset successful
🚀 Starting Database Migrations
🔍 Testing database connection...
✅ Database connection successful

📄 Running migration: 001_create_core_schema.sql
✅ Migration completed: 001_create_core_schema.sql
...
🎉 All migrations completed successfully!
```
