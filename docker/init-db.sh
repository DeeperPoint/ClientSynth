#!/bin/bash
# Database bootstrap for the docker-compose Postgres container.
#
# Runs once, on first start with an empty data volume (docker-entrypoint-initdb.d).
# Migrations 001-015 are legacy Supabase-era scripts that fail on vanilla
# Postgres (they expect a pre-existing `auth` schema). The consolidated
# bootstrap is 016_postgres_migration.sql, which creates the auth schema,
# users table, and the full core schema; 017+ are incremental top-ups.

set -e

run_lenient() {
  echo ">>> applying $1 (lenient)"
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$1" || echo "!!! $1 reported errors (continuing)"
}

# Consolidated schema bootstrap. Run lenient, matching how the team's
# setup-postgres.sh applies it: 016 has a known benign failure in its
# seed-data tail (ON CONFLICT (name) on seed_categories, which lacks a
# unique constraint) — the schema statements above it all succeed.
run_lenient /migrations/016_postgres_migration.sql

# Post-016 incremental migrations, in numeric order.
for f in /migrations/017_*.sql /migrations/018_*.sql /migrations/019_*.sql /migrations/020_*.sql; do
  [ -e "$f" ] && run_lenient "$f"
done

echo ">>> ClientSynth database bootstrap complete"
