# Update InfluxDB Task from file
# Usage: .\update_task.ps1 -TaskName "aggregate_hourly" -FluxFile "task_hourly.flux"

param(
    [string]$TaskName = "aggregate_hourly",
    [string]$FluxFile = "d:\smart\backend\flux_tasks\task_hourly.flux"
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

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Update InfluxDB Task: $TaskName" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Get Task ID
Write-Host "[1] กำลังค้นหา Task ID..." -ForegroundColor Yellow
$tasksResponse = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/tasks?org=$InfluxOrg" -Headers $headers
$task = $tasksResponse.tasks | Where-Object { $_.name -eq $TaskName }

if (-not $task) {
    Write-Host "    ✗ ไม่พบ Task: $TaskName" -ForegroundColor Red
    exit 1
}

$taskId = $task.id
Write-Host "    ✓ พบ Task ID: $taskId" -ForegroundColor Green

# Read flux file
Write-Host "[2] กำลังอ่านไฟล์ Flux..." -ForegroundColor Yellow
$fluxContent = Get-Content $FluxFile -Raw
Write-Host "    ✓ อ่านไฟล์สำเร็จ ($(($fluxContent.Length)) characters)" -ForegroundColor Green

# Update task
Write-Host "[3] กำลัง Update Task..." -ForegroundColor Yellow

# Build JSON body manually to handle flux script with newlines
$bodyObj = @{
    flux = $fluxContent
    status = "active"
}
$body = $bodyObj | ConvertTo-Json -Depth 10 -Compress

try {
    $response = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/tasks/$taskId" `
        -Method Patch `
        -Headers @{
            "Authorization" = "Token $InfluxToken"
            "Content-Type" = "application/json; charset=utf-8"
        } `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
    
    Write-Host "    ✓ Update สำเร็จ!" -ForegroundColor Green
    Write-Host "    Updated: $($response.updatedAt)" -ForegroundColor Gray
} catch {
    Write-Host "    ✗ เกิดข้อผิดพลาด: $_" -ForegroundColor Red
    exit 1
}

# Trigger run
Write-Host "[4] กำลังทดสอบ Run Task..." -ForegroundColor Yellow
try {
    $runResponse = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/tasks/$taskId/runs" `
        -Method Post `
        -Headers @{
            "Authorization" = "Token $InfluxToken"
            "Content-Type" = "application/json"
        }
    
    Write-Host "    ✓ Triggered Run ID: $($runResponse.id)" -ForegroundColor Green
    Write-Host "    Status: $($runResponse.status)" -ForegroundColor Gray
    
    # Wait and check status
    Start-Sleep -Seconds 5
    $runStatus = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/tasks/$taskId/runs/$($runResponse.id)" -Headers $headers
    Write-Host "    Final Status: $($runStatus.status)" -ForegroundColor $(if($runStatus.status -eq "success"){"Green"}else{"Red"})
    
} catch {
    Write-Host "    ⚠ ไม่สามารถ trigger run: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "เสร็จสิ้น" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
