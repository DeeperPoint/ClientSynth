# PowerShell script to set up PostgreSQL with Docker for Client Synth

Write-Host "🚀 Setting up PostgreSQL with Docker for Client Synth..." -ForegroundColor Green

# Step 1: Start PostgreSQL with Docker
Write-Host "📦 Starting PostgreSQL container..." -ForegroundColor Yellow
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
Write-Host "⏳ Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check if container is running
$containerStatus = docker ps --filter "name=client_synth_db" --format "table {{.Names}}"
if ($containerStatus -notlike "*client_synth_db*") {
    Write-Host "❌ Failed to start PostgreSQL container" -ForegroundColor Red
    exit 1
}

Write-Host "✅ PostgreSQL container is running" -ForegroundColor Green

# Step 2: Wait for database to be ready
Write-Host "🔍 Checking database connection..." -ForegroundColor Yellow
do {
    $isReady = docker exec client_synth_db pg_isready -U postgres 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
} while ($LASTEXITCODE -ne 0)

Write-Host "✅ Database is ready" -ForegroundColor Green

# Step 3: Run the migration script
Write-Host "📋 Running database migration..." -ForegroundColor Yellow
Get-Content scripts/016_postgres_migration.sql | docker exec -i client_synth_db psql -U postgres -d client_synth_db

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database migration completed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Database migration failed" -ForegroundColor Red
    exit 1
}

# Step 4: Test the connection
Write-Host "🧪 Testing database connection..." -ForegroundColor Yellow
docker exec client_synth_db psql -U postgres -d client_synth_db -c "SELECT 'Database connection successful' as status;"

Write-Host "🎉 PostgreSQL setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Copy env.example to .env and update the values" -ForegroundColor White
Write-Host "2. Install dependencies: npm install" -ForegroundColor White
Write-Host "3. Run the test script: npx tsx scripts/test-postgres-migration.ts" -ForegroundColor White
Write-Host "4. Start the application: npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "🔗 Database connection: postgresql://postgres:postgres@localhost:5432/client_synth_db" -ForegroundColor Cyan
