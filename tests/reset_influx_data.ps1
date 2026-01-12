# ============================================
# Reset All InfluxDB Data - Smart Energy Monitoring
# ============================================
# ⚠️ WARNING: This script will DELETE ALL DATA in all buckets!
# Run this script at 00:00 on 2025-12-25 to start fresh
# ============================================

param(
    [switch]$Confirm = $false,
    [switch]$DryRun = $false
)

# Load env
$envFile = "d:\smart\backend\.env"
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $idx = $_.IndexOf('=')
    if ($idx -gt 0) {
        $key = $_.Substring(0, $idx).Trim()
        $value = $_.Substring($idx + 1).Trim().Trim('"').Trim("'")
        switch ($key) {
            "INFLUXDB_URL" { $script:InfluxUrl = $value }
            "INFLUXDB_ORG" { $script:InfluxOrg = $value }
            "INFLUXDB_TOKEN" { $script:InfluxToken = $value }
        }
    }
}

if (-not $InfluxUrl) { $InfluxUrl = "http://localhost:8086" }
if (-not $InfluxOrg) { $InfluxOrg = "Ennergy" }

$headers = @{ "Authorization" = "Token $InfluxToken" }

# Buckets to reset
$bucketsToReset = @(
    "AI205_raw",
    "AI205_hourly", 
    "AI205_daily",
    "AI205_weekly",
    "AI205_monthly",
    "AI205_yearly"
)

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host "⚠️  RESET ALL INFLUXDB DATA  ⚠️" -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Red
Write-Host ""
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host "InfluxDB: $InfluxUrl" -ForegroundColor Gray
Write-Host "Org: $InfluxOrg" -ForegroundColor Gray
Write-Host ""
Write-Host "Buckets to reset:" -ForegroundColor Yellow
foreach ($bucket in $bucketsToReset) {
    Write-Host "  - $bucket" -ForegroundColor Yellow
}
Write-Host ""

if ($DryRun) {
    Write-Host "[DRY RUN MODE] No data will be deleted" -ForegroundColor Cyan
    Write-Host ""
}

if (-not $Confirm -and -not $DryRun) {
    Write-Host "⚠️  This will DELETE ALL DATA in the buckets above!" -ForegroundColor Red
    Write-Host ""
    $response = Read-Host "Type 'DELETE ALL' to confirm"
    if ($response -ne "DELETE ALL") {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "Starting reset..." -ForegroundColor Cyan
Write-Host ""

foreach ($bucketName in $bucketsToReset) {
    Write-Host "Processing $bucketName..." -ForegroundColor White
    
    if ($DryRun) {
        Write-Host "  [DRY RUN] Would delete all data from $bucketName" -ForegroundColor Cyan
        continue
    }
    
    # Get bucket ID
    try {
        $bucketsResponse = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/buckets?name=$bucketName&org=$InfluxOrg" -Headers $headers
        $bucket = $bucketsResponse.buckets | Where-Object { $_.name -eq $bucketName }
        
        if (-not $bucket) {
            Write-Host "  ⚠ Bucket not found: $bucketName" -ForegroundColor Yellow
            continue
        }
        
        $bucketId = $bucket.id
        
        # Delete all data using the delete endpoint
        # Delete from beginning of time to now
        $deleteBody = @{
            start = "1970-01-01T00:00:00Z"
            stop = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        } | ConvertTo-Json
        
        $null = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/delete?org=$InfluxOrg&bucket=$bucketName" `
            -Method Post `
            -Headers @{
                "Authorization" = "Token $InfluxToken"
                "Content-Type" = "application/json"
            } `
            -Body $deleteBody
        
        Write-Host "  ✓ Deleted all data from $bucketName" -ForegroundColor Green
        
    } catch {
        Write-Host "  ✗ Error: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Reset Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "All buckets have been cleared. New data will start collecting now." -ForegroundColor White
Write-Host ""
