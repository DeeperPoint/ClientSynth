# PowerShell script to run make-s3-bucket-public.py with environment variables from .env

# Change to project root
Set-Location $PSScriptRoot\..

# Load environment variables from .env file
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Remove quotes if present
            $value = $value -replace '^["'']|["'']$', ''
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
            Write-Host "Loaded: $name"
        }
    }
} else {
    Write-Host "Error: .env file not found" -ForegroundColor Red
    exit 1
}

# Run the Python script
Write-Host "`nRunning make-s3-bucket-public.py..." -ForegroundColor Cyan
python scripts/make-s3-bucket-public.py

$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    Write-Host "`nScript completed successfully!" -ForegroundColor Green
} else {
    Write-Host "`nScript failed with exit code: $exitCode" -ForegroundColor Red
}

exit $exitCode
