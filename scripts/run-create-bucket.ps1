# PowerShell script to create a new public S3 bucket

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
Write-Host "`nCreating new public S3 bucket..." -ForegroundColor Cyan
python scripts/create-public-bucket.py

$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    Write-Host "`nScript completed successfully!" -ForegroundColor Green
    
    # Check if config file was created
    if (Test-Path "new-bucket-config.txt") {
        Write-Host "`nReading new bucket configuration..." -ForegroundColor Cyan
        Get-Content "new-bucket-config.txt"
        
        Write-Host "`n" -NoNewline
        $response = Read-Host "Do you want to update .env file automatically? (y/n)"
        
        if ($response -eq 'y' -or $response -eq 'Y') {
            # Read the new bucket name
            $bucketLine = Get-Content "new-bucket-config.txt" | Select-String "AWS_S3_BUCKET="
            if ($bucketLine) {
                $newBucket = $bucketLine.ToString().Split('=')[1]
                
                # Update .env file
                $envContent = Get-Content ".env"
                $envContent = $envContent -replace 'AWS_S3_BUCKET=.*', "AWS_S3_BUCKET=$newBucket"
                $envContent | Set-Content ".env"
                
                Write-Host "`n.env file updated with new bucket: $newBucket" -ForegroundColor Green
                Write-Host "Please restart your application for changes to take effect." -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "`nScript failed with exit code: $exitCode" -ForegroundColor Red
}

exit $exitCode

