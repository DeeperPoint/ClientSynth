#!/bin/bash

echo "🚀 Setting up PostgreSQL with Docker for Client Synth..."

# Step 1: Start PostgreSQL with Docker
echo "📦 Starting PostgreSQL container..."
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

# Check if container is running
if ! docker ps | grep -q client_synth_db; then
    echo "❌ Failed to start PostgreSQL container"
    exit 1
fi

echo "✅ PostgreSQL container is running"

# Step 2: Wait for database to be ready
echo "🔍 Checking database connection..."
until docker exec client_synth_db pg_isready -U postgres; do
    echo "⏳ Waiting for database to be ready..."
    sleep 2
done

echo "✅ Database is ready"

# Step 3: Run the migration script
echo "📋 Running database migration..."
docker exec -i client_synth_db psql -U postgres -d client_synth_db < scripts/016_postgres_migration.sql

if [ $? -eq 0 ]; then
    echo "✅ Database migration completed successfully"
else
    echo "❌ Database migration failed"
    exit 1
fi

# Step 4: Test the connection
echo "🧪 Testing database connection..."
docker exec client_synth_db psql -U postgres -d client_synth_db -c "SELECT 'Database connection successful' as status;"

echo "🎉 PostgreSQL setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Copy env.example to .env and update the values"
echo "2. Install dependencies: npm install"
echo "3. Run the test script: npx tsx scripts/test-postgres-migration.ts"
echo "4. Start the application: npm run dev"
echo ""
echo "🔗 Database connection: postgresql://postgres:postgres@localhost:5432/client_synth_db"
