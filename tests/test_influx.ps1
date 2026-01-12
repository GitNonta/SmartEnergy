# ============================================
# InfluxDB + Backend Test Suite (PowerShell)
# Smart Energy Monitoring System
# ============================================
# 
# Usage:
#   .\test_influx.ps1
#   (will auto-load from ..\backend\.env)
#
# ============================================

param(
    [string]$InfluxUrl = $env:INFLUX_URL,
    [string]$InfluxOrg = $env:INFLUX_ORG,
    [string]$InfluxToken = $env:INFLUX_TOKEN,
    [string]$BackendUrl = $env:BACKEND_URL
)

# ============================================
# Load from .env file if exists
# ============================================
$envFile = Join-Path $PSScriptRoot "..\backend\.env"
if (Test-Path $envFile) {
    Write-Host "Loading from $envFile..." -ForegroundColor Cyan
    Get-Content $envFile | ForEach-Object {
        # Skip comments and empty lines
        if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
        
        # Split only on FIRST = to handle tokens with = in value
        $idx = $_.IndexOf('=')
        if ($idx -gt 0) {
            $key = $_.Substring(0, $idx).Trim()
            $value = $_.Substring($idx + 1).Trim().Trim('"').Trim("'")
            
            # Set if not already set via param
            switch ($key) {
                "INFLUXDB_URL" { if (-not $InfluxUrl) { $InfluxUrl = $value } }
                "INFLUXDB_ORG" { if (-not $InfluxOrg) { $InfluxOrg = $value } }
                "INFLUXDB_TOKEN" { if (-not $InfluxToken) { $InfluxToken = $value } }
                "BACKEND_URL" { if (-not $BackendUrl) { $BackendUrl = $value } }
            }
        }
    }
}

# Default values
if (-not $InfluxUrl) { $InfluxUrl = "http://127.0.0.1:8086" }
if (-not $InfluxOrg) { $InfluxOrg = "Ennergy" }
if (-not $BackendUrl) { $BackendUrl = "http://localhost:3001" }

$RawBucket = "AI205_raw"
$HourlyBucket = "AI205_hourly"
$DailyBucket = "AI205_daily"
$DeviceId = "AI205"

# Check token
if (-not $InfluxToken) {
    Write-Host "ERROR: INFLUX_TOKEN is not set" -ForegroundColor Red
    Write-Host 'Usage: $env:INFLUX_TOKEN = "your-token"; .\test_influx.ps1'
    exit 1
}

# Results
$TestsPassed = 0
$TestsFailed = 0

function Test-Result {
    param([bool]$Success, [string]$Name)
    if ($Success) {
        Write-Host "  PASS: $Name" -ForegroundColor Green
        $script:TestsPassed++
    }
    else {
        Write-Host "  FAIL: $Name" -ForegroundColor Red
        $script:TestsFailed++
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "InfluxDB + Backend Test Suite (PowerShell)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "InfluxDB: $InfluxUrl"
Write-Host "Org: $InfluxOrg"
Write-Host "Backend: $BackendUrl"
# Debug: Show masked token (first 10 + last 5 chars)
$tokenLen = $InfluxToken.Length
if ($tokenLen -gt 20) {
    $maskedToken = $InfluxToken.Substring(0, 10) + "..." + $InfluxToken.Substring($tokenLen - 5)
    Write-Host "Token: $maskedToken (length: $tokenLen)"
}
else {
    Write-Host "Token: [too short or invalid] (length: $tokenLen)" -ForegroundColor Red
}
Write-Host "============================================"
Write-Host ""

# ============================================
# TEST 1: InfluxDB Health
# ============================================
Write-Host "[1/10] Checking InfluxDB health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$InfluxUrl/health" -Headers @{ "Authorization" = "Token $InfluxToken" } -ErrorAction Stop
    Test-Result ($health.status -eq "pass") "InfluxDB Health"
}
catch {
    Test-Result $false "InfluxDB Health ($_)"
}

# ============================================
# TEST 2: Check Buckets
# ============================================
Write-Host "[2/10] Checking buckets exist..." -ForegroundColor Yellow
try {
    $buckets = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/buckets?org=$InfluxOrg" -Headers @{ "Authorization" = "Token $InfluxToken" }
    $bucketNames = $buckets.buckets | ForEach-Object { $_.name }
    
    $rawExists = $bucketNames -contains $RawBucket
    $hourlyExists = $bucketNames -contains $HourlyBucket
    $dailyExists = $bucketNames -contains $DailyBucket
    
    Write-Host "       $RawBucket : $(if($rawExists){'exists'}else{'NOT FOUND'})" -ForegroundColor $(if ($rawExists) { 'Green' }else { 'Red' })
    Write-Host "       $HourlyBucket : $(if($hourlyExists){'exists'}else{'NOT FOUND'})" -ForegroundColor $(if ($hourlyExists) { 'Green' }else { 'Red' })
    Write-Host "       $DailyBucket : $(if($dailyExists){'exists'}else{'NOT FOUND'})" -ForegroundColor $(if ($dailyExists) { 'Green' }else { 'Red' })
    
    Test-Result ($rawExists -and $hourlyExists -and $dailyExists) "All Buckets Exist"
}
catch {
    Test-Result $false "Bucket Check ($_)"
}

# ============================================
# TEST 3: Write Test Point
# ============================================
Write-Host "[3/10] Writing test point to raw bucket..." -ForegroundColor Yellow
try {
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $testValue = 99999 + (Get-Random -Maximum 1000) / 1000.0
    $lineProtocol = "energy_3phase,device_id=$DeviceId energy_total=$testValue $timestamp"
    
    $null = Invoke-WebRequest -Uri "$InfluxUrl/api/v2/write?org=$InfluxOrg&bucket=$RawBucket&precision=s" `
        -Method Post `
        -Headers @{ "Authorization" = "Token $InfluxToken" } `
        -Body $lineProtocol `
        -ErrorAction Stop
    
    Write-Host "       Value written: $testValue"
    Test-Result $true "Write to Raw"
}
catch {
    Test-Result $false "Write to Raw ($_)"
}

Start-Sleep -Seconds 1

# ============================================
# TEST 4: Query Raw
# ============================================
Write-Host "[4/10] Querying last raw point..." -ForegroundColor Yellow
try {
    $fluxQuery = @"
from(bucket:"$RawBucket") 
|> range(start:-5m) 
|> filter(fn:(r) => r._measurement == "energy_3phase" and r.device_id == "$DeviceId") 
|> last()
"@
    
    $result = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/query?org=$InfluxOrg" `
        -Method Post `
        -Headers @{ 
        "Authorization" = "Token $InfluxToken"
        "Content-Type"  = "application/vnd.flux"
        "Accept"        = "application/csv"
    } `
        -Body $fluxQuery
    
    $hasData = $result -match $DeviceId
    Test-Result $hasData "Query Raw"
}
catch {
    Test-Result $false "Query Raw ($_)"
}

# ============================================
# TEST 5: Check Tasks
# ============================================
Write-Host "[5/10] Checking InfluxDB tasks..." -ForegroundColor Yellow
try {
    $tasks = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/tasks?org=$InfluxOrg" -Headers @{ "Authorization" = "Token $InfluxToken" }
    
    $hourlyTask = $tasks.tasks | Where-Object { $_.name -eq "aggregate_hourly" }
    $dailyTask = $tasks.tasks | Where-Object { $_.name -eq "aggregate_daily" }
    
    $hourlyActive = $hourlyTask -and $hourlyTask.status -eq "active"
    $dailyActive = $dailyTask -and $dailyTask.status -eq "active"
    
    Write-Host "       aggregate_hourly: $(if($hourlyActive){'active'}else{'not found/inactive'})" -ForegroundColor $(if ($hourlyActive) { 'Green' }else { 'Yellow' })
    Write-Host "       aggregate_daily: $(if($dailyActive){'active'}else{'not found/inactive'})" -ForegroundColor $(if ($dailyActive) { 'Green' }else { 'Yellow' })
    
    Test-Result ($hourlyActive -or $dailyActive) "Tasks Check"
}
catch {
    Test-Result $false "Tasks Check ($_)"
}

# ============================================
# TEST 6: Query Hourly
# ============================================
Write-Host "[6/10] Querying hourly bucket..." -ForegroundColor Yellow
try {
    $fluxQuery = @"
from(bucket:"$HourlyBucket") 
|> range(start:-24h) 
|> filter(fn:(r) => r._field == "energy_total") 
|> count()
"@
    
    $result = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/query?org=$InfluxOrg" `
        -Method Post `
        -Headers @{ 
        "Authorization" = "Token $InfluxToken"
        "Content-Type"  = "application/vnd.flux"
    } `
        -Body $fluxQuery
    
    Test-Result $true "Query Hourly"
}
catch {
    Test-Result $false "Query Hourly ($_)"
}

# ============================================
# TEST 7: Backend Health
# ============================================
Write-Host "[7/10] Checking backend health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BackendUrl/health" -ErrorAction Stop
    Test-Result $true "Backend Health"
}
catch {
    Write-Host "       Backend may not be running" -ForegroundColor Yellow
    Test-Result $false "Backend Health"
}

# ============================================
# TEST 8: Backend Energy API
# ============================================
Write-Host "[8/10] Testing energy state API..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BackendUrl/api/energy/state" -ErrorAction Stop
    Test-Result ($null -ne $response) "Energy State API"
}
catch {
    Test-Result $false "Energy State API"
}

# ============================================
# TEST 9: Backend Integrity API
# ============================================
Write-Host "[9/10] Testing integrity check API..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BackendUrl/api/data/integrity-check" -ErrorAction Stop
    Test-Result ($null -ne $response) "Integrity Check API"
}
catch {
    Test-Result $false "Integrity Check API"
}

# ============================================
# TEST 10: Chart API
# ============================================
Write-Host "[10/10] Testing chart hourly API..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BackendUrl/api/chart/hourly?range=-24h" -ErrorAction Stop
    Test-Result ($null -ne $response) "Chart Hourly API"
}
catch {
    Test-Result $false "Chart Hourly API"
}

# ============================================
# SUMMARY
# ============================================
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Failed: $TestsFailed" -ForegroundColor Red
Write-Host ""

if ($TestsFailed -eq 0) {
    Write-Host "All tests passed! System is healthy." -ForegroundColor Green
}
else {
    Write-Host "Some tests failed. Check output above." -ForegroundColor Yellow
}
