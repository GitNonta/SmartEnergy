# ============================================
# Debug InfluxDB Tasks - Smart Energy Monitoring
# ============================================

# Load from .env file
$envFile = Join-Path $PSScriptRoot "..\backend\.env"
if (Test-Path $envFile) {
    Write-Host "Loading from $envFile..." -ForegroundColor Cyan
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
        $idx = $_.IndexOf('=')
        if ($idx -gt 0) {
            $key = $_.Substring(0, $idx).Trim()
            $value = $_.Substring($idx + 1).Trim().Trim('"').Trim("'")
            switch ($key) {
                "INFLUXDB_URL" { $InfluxUrl = $value }
                "INFLUXDB_ORG" { $InfluxOrg = $value }
                "INFLUXDB_TOKEN" { $InfluxToken = $value }
            }
        }
    }
}

# Default values
if (-not $InfluxUrl) { $InfluxUrl = "http://localhost:8086" }
if (-not $InfluxOrg) { $InfluxOrg = "Ennergy" }

# Check token
if (-not $InfluxToken) {
    Write-Host "ERROR: INFLUX_TOKEN is not set" -ForegroundColor Red
    exit 1
}

$headers = @{ "Authorization" = "Token $InfluxToken" }

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Debug InfluxDB Tasks" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "InfluxDB: $InfluxUrl"
Write-Host "Org: $InfluxOrg"
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "============================================"
Write-Host ""

# ============================================
# 1. ตรวจสอบ InfluxDB Health
# ============================================
Write-Host "[1] ตรวจสอบ InfluxDB Health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$InfluxUrl/health" -Headers $headers -ErrorAction Stop
    Write-Host "    ✓ Status: $($health.status)" -ForegroundColor Green
    Write-Host "    ✓ Version: $($health.version)" -ForegroundColor Green
}
catch {
    Write-Host "    ✗ ไม่สามารถเชื่อมต่อ: $_" -ForegroundColor Red
    exit 1
}

# ============================================
# 2. ดึงรายการ Tasks ทั้งหมด
# ============================================
Write-Host ""
Write-Host "[2] ดึงรายการ Tasks ทั้งหมด..." -ForegroundColor Yellow
try {
    $tasksResponse = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/tasks?org=$InfluxOrg" -Headers $headers
    $tasks = $tasksResponse.tasks
    
    if ($tasks.Count -eq 0) {
        Write-Host "    ⚠ ไม่พบ Tasks ใดๆ" -ForegroundColor Yellow
    }
    else {
        Write-Host "    พบ $($tasks.Count) tasks:" -ForegroundColor Cyan
        Write-Host ""
        
        foreach ($task in $tasks) {
            $statusColor = if ($task.status -eq "active") { "Green" } else { "Red" }
            $statusIcon = if ($task.status -eq "active") { "✓" } else { "✗" }
            
            Write-Host "    ┌─────────────────────────────────────────────" -ForegroundColor Gray
            Write-Host "    │ Task: $($task.name)" -ForegroundColor White
            Write-Host "    │ ID: $($task.id)" -ForegroundColor Gray
            Write-Host "    │ Status: $statusIcon $($task.status)" -ForegroundColor $statusColor
            Write-Host "    │ Every: $($task.every)" -ForegroundColor Gray
            Write-Host "    │ Offset: $($task.offset)" -ForegroundColor Gray
            Write-Host "    │ Created: $($task.createdAt)" -ForegroundColor Gray
            Write-Host "    │ Updated: $($task.updatedAt)" -ForegroundColor Gray
            
            # ดึง Task Runs ล่าสุด
            try {
                $runsResponse = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/tasks/$($task.id)/runs?limit=5" -Headers $headers
                $runs = $runsResponse.runs
                
                if ($runs -and $runs.Count -gt 0) {
                    Write-Host "    │" -ForegroundColor Gray
                    Write-Host "    │ Last 5 Runs:" -ForegroundColor Cyan
                    
                    foreach ($run in $runs) {
                        $runStatusColor = switch ($run.status) {
                            "success" { "Green" }
                            "failed" { "Red" }
                            "started" { "Yellow" }
                            "canceled" { "DarkYellow" }
                            default { "Gray" }
                        }
                        $runIcon = switch ($run.status) {
                            "success" { "✓" }
                            "failed" { "✗" }
                            "started" { "⏳" }
                            "canceled" { "⊘" }
                            default { "?" }
                        }
                        
                        # Convert time to local
                        $scheduledTime = if ($run.scheduledFor) { 
                            [DateTime]::Parse($run.scheduledFor).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss") 
                        }
                        else { "N/A" }
                        
                        Write-Host "    │   $runIcon [$($run.status)] $scheduledTime" -ForegroundColor $runStatusColor
                        
                        # แสดง error ถ้ามี
                        if ($run.status -eq "failed" -and $run.log) {
                            Write-Host "    │      Error: $($run.log | Select-Object -First 1)" -ForegroundColor Red
                        }
                    }
                }
                else {
                    Write-Host "    │ Last Runs: ไม่มีประวัติการรัน" -ForegroundColor Yellow
                }
            }
            catch {
                Write-Host "    │ Last Runs: ไม่สามารถดึงข้อมูลได้" -ForegroundColor Yellow
            }
            
            Write-Host "    └─────────────────────────────────────────────" -ForegroundColor Gray
            Write-Host ""
        }
    }
}
catch {
    Write-Host "    ✗ เกิดข้อผิดพลาด: $_" -ForegroundColor Red
}

# ============================================
# 3. ตรวจสอบ Buckets ที่ใช้
# ============================================
Write-Host ""
Write-Host "[3] ตรวจสอบ Buckets..." -ForegroundColor Yellow
try {
    $bucketsResponse = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/buckets?org=$InfluxOrg" -Headers $headers
    $buckets = $bucketsResponse.buckets | Where-Object { $_.name -match "AI205" }
    
    foreach ($bucket in $buckets) {
        Write-Host "    ✓ $($bucket.name)" -ForegroundColor Green
        Write-Host "      Retention: $(if($bucket.retentionRules[0].everySeconds -eq 0) {'Forever'} else {"$([math]::Round($bucket.retentionRules[0].everySeconds / 86400)) days"})" -ForegroundColor Gray
    }
}
catch {
    Write-Host "    ✗ เกิดข้อผิดพลาด: $_" -ForegroundColor Red
}

# ============================================
# 4. ตรวจสอบข้อมูลล่าสุดในแต่ละ Bucket
# ============================================
Write-Host ""
Write-Host "[4] ตรวจสอบข้อมูลล่าสุดในแต่ละ Bucket..." -ForegroundColor Yellow

$bucketsToCheck = @("AI205_raw", "AI205_hourly", "AI205_daily")

foreach ($bucketName in $bucketsToCheck) {
    Write-Host ""
    Write-Host "    === $bucketName ===" -ForegroundColor Cyan
    
    $fluxQuery = @"
from(bucket:"$bucketName") 
|> range(start: -7d)
|> last()
|> keep(columns: ["_time", "_field", "_value", "_measurement"])
"@
    
    try {
        $result = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/query?org=$InfluxOrg" `
            -Method Post `
            -Headers @{ 
            "Authorization" = "Token $InfluxToken"
            "Content-Type"  = "application/vnd.flux"
            "Accept"        = "application/csv"
        } `
            -Body $fluxQuery
        
        if ($result -and $result.Trim()) {
            # Parse CSV to get last record time
            $lines = $result -split "`n" | Where-Object { $_ -and $_ -notmatch "^," -and $_ -notmatch "^#" }
            if ($lines.Count -gt 1) {
                Write-Host "    ✓ มีข้อมูล" -ForegroundColor Green
                # Show last few fields
                $csvLines = $result -split "`n" | Where-Object { $_ -match "_result" } | Select-Object -First 5
                foreach ($line in $csvLines) {
                    $parts = $line -split ","
                    if ($parts.Count -ge 6) {
                        $time = $parts[5]
                        $field = $parts[7]
                        $value = $parts[6]
                        Write-Host "      $field = $value @ $time" -ForegroundColor Gray
                    }
                }
            }
            else {
                Write-Host "    ⚠ ไม่พบข้อมูลใน 7 วันที่ผ่านมา" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "    ⚠ ไม่พบข้อมูล" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "    ✗ เกิดข้อผิดพลาด: $_" -ForegroundColor Red
    }
}

# ============================================
# 5. ทดสอบรัน Task ด้วยตัวเอง (Dry Run)
# ============================================
Write-Host ""
Write-Host "[5] ตรวจสอบ Task Script Syntax..." -ForegroundColor Yellow

# Check if tasks can be queried for their flux script
try {
    $tasksResponse = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/tasks?org=$InfluxOrg" -Headers $headers
    
    foreach ($task in $tasksResponse.tasks) {
        Write-Host ""
        Write-Host "    === $($task.name) ===" -ForegroundColor Cyan
        
        # Get task details including flux script
        try {
            $taskDetail = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/tasks/$($task.id)" -Headers $headers
            
            # Show first few lines of flux script
            $fluxLines = $taskDetail.flux -split "`n" | Select-Object -First 10
            Write-Host "    Flux Script (first 10 lines):" -ForegroundColor Gray
            foreach ($line in $fluxLines) {
                if ($line.Trim()) {
                    Write-Host "      $line" -ForegroundColor DarkGray
                }
            }
            Write-Host "      ..." -ForegroundColor DarkGray
            
        }
        catch {
            Write-Host "    ✗ ไม่สามารถดึง script: $_" -ForegroundColor Red
        }
    }
}
catch {
    Write-Host "    ✗ เกิดข้อผิดพลาด: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "เสร็จสิ้นการ Debug" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tips:" -ForegroundColor Yellow
Write-Host "  - ถ้า Task status = inactive ให้เปิดใช้งานใน InfluxDB UI" -ForegroundColor Gray
Write-Host "  - ถ้า Task runs failed ให้ดู error message และแก้ไข flux script" -ForegroundColor Gray
Write-Host "  - ถ้าไม่มีข้อมูลใน hourly/daily ให้ตรวจสอบ source bucket มีข้อมูลหรือไม่" -ForegroundColor Gray
Write-Host ""
