# PowerShell script to run all database migrations for Client Synth

Write-Host "Running all database migrations for Client Synth..." -ForegroundColor Green

# Check if container is running
$containerId = docker ps -q -f "name=client_synth_db"
if (-not $containerId) {
    Write-Host "PostgreSQL container 'client_synth_db' is not running." -ForegroundColor Red
    Write-Host "   Please run 'scripts/setup-postgres.ps1' first to start the database." -ForegroundColor Yellow
    exit 1
}

Write-Host "PostgreSQL container is running" -ForegroundColor Green

# Get all SQL migration files sorted by name
$migrationFiles = Get-ChildItem -Path "scripts" -Filter "*.sql" | 
                  Where-Object { $_.Name -match "^\d{3}_" } | 
                  Sort-Object Name

if ($migrationFiles.Count -eq 0) {
    Write-Host "No migration files found in scripts/ directory." -ForegroundColor Yellow
    exit 0
}

Write-Host "Found $($migrationFiles.Count) migration files." -ForegroundColor Cyan

foreach ($file in $migrationFiles) {
    Write-Host "Running migration: $($file.Name)..." -ForegroundColor Yellow
    
    # Run the migration
    # Using Get-Content -Raw to read the whole file, and passing it to docker exec
    # We use cmd /c type to handle encoding issues sometimes seen with Get-Content piping directly in some environments, 
    # but standard piping usually works. Let's try standard piping first.
    
    try {
        $output = Get-Content $file.FullName | docker exec -i client_synth_db psql -U postgres -d client_synth_db 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   Success" -ForegroundColor Green
        } else {
            Write-Host "   Failed" -ForegroundColor Red
            Write-Host $output
            # Ask user if they want to continue? For now, let's stop on error.
            $response = Read-Host "Migration failed. Continue? (y/n)"
            if ($response -ne 'y') {
                exit 1
            }
        }
    } catch {
        Write-Host "   Error executing migration" -ForegroundColor Red
        Write-Host $_
        exit 1
    }
}

Write-Host "All migrations completed!" -ForegroundColor Green
