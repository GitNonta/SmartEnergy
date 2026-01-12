# ============================================
# ทดสอบดึงข้อมูลเมื่อวาน - Smart Energy Monitoring
# ============================================
# วันนี้: 2025-12-24
# เมื่อวาน: 2025-12-23
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
if (-not $InfluxUrl) { $InfluxUrl = "http://127.0.0.1:8086" }
if (-not $InfluxOrg) { $InfluxOrg = "Ennergy" }

$RawBucket = "AI205_raw"
$HourlyBucket = "AI205_hourly"
$DeviceId = "AI205"

# Check token
if (-not $InfluxToken) {
    Write-Host "ERROR: INFLUX_TOKEN is not set" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "ข้อมูลเมื่อวาน (2025-12-23)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "InfluxDB: $InfluxUrl"
Write-Host "Org: $InfluxOrg"
Write-Host "============================================"
Write-Host ""

# ============================================
# 1. ตรวจสอบว่า InfluxDB ยังทำงานอยู่ไหม
# ============================================
Write-Host "[1] ตรวจสอบสถานะ InfluxDB..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$InfluxUrl/health" -Headers @{ "Authorization" = "Token $InfluxToken" } -ErrorAction Stop
    if ($health.status -eq "pass") {
        Write-Host "    ✓ InfluxDB กำลังทำงานปกติ" -ForegroundColor Green
    }
    else {
        Write-Host "    ✗ InfluxDB มีปัญหา: $($health.status)" -ForegroundColor Red
    }
}
catch {
    Write-Host "    ✗ ไม่สามารถเชื่อมต่อ InfluxDB: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "    DB อาจหยุดทำงาน - กรุณาเริ่ม InfluxDB ก่อน" -ForegroundColor Yellow
    exit 1
}

# ============================================
# 2. ดึงข้อมูล Raw เมื่อวาน - ดูช่วงเวลาที่มีข้อมูล
# ============================================
Write-Host ""
Write-Host "[2] ดึงข้อมูล Raw เมื่อวาน (2025-12-23)..." -ForegroundColor Yellow

$fluxQueryFirst = @"
from(bucket:"$RawBucket") 
|> range(start: 2025-12-23T00:00:00+07:00, stop: 2025-12-24T00:00:00+07:00)
|> filter(fn:(r) => r._measurement == "energy_3phase" and r.device_id == "$DeviceId")
|> filter(fn:(r) => r._field == "energy_total")
|> first()
"@

$fluxQueryLast = @"
from(bucket:"$RawBucket") 
|> range(start: 2025-12-23T00:00:00+07:00, stop: 2025-12-24T00:00:00+07:00)
|> filter(fn:(r) => r._measurement == "energy_3phase" and r.device_id == "$DeviceId")
|> filter(fn:(r) => r._field == "energy_total")
|> last()
"@

$fluxQueryCount = @"
from(bucket:"$RawBucket") 
|> range(start: 2025-12-23T00:00:00+07:00, stop: 2025-12-24T00:00:00+07:00)
|> filter(fn:(r) => r._measurement == "energy_3phase" and r.device_id == "$DeviceId")
|> filter(fn:(r) => r._field == "energy_total")
|> count()
"@

try {
    # Query first record
    $resultFirst = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/query?org=$InfluxOrg" `
        -Method Post `
        -Headers @{ 
        "Authorization" = "Token $InfluxToken"
        "Content-Type"  = "application/vnd.flux"
        "Accept"        = "application/csv"
    } `
        -Body $fluxQueryFirst
    
    # Query last record
    $resultLast = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/query?org=$InfluxOrg" `
        -Method Post `
        -Headers @{ 
        "Authorization" = "Token $InfluxToken"
        "Content-Type"  = "application/vnd.flux"
        "Accept"        = "application/csv"
    } `
        -Body $fluxQueryLast
    
    # Query count
    $resultCount = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/query?org=$InfluxOrg" `
        -Method Post `
        -Headers @{ 
        "Authorization" = "Token $InfluxToken"
        "Content-Type"  = "application/vnd.flux"
        "Accept"        = "application/csv"
    } `
        -Body $fluxQueryCount

    Write-Host ""
    Write-Host "    === ผลลัพธ์ Raw Data ===" -ForegroundColor Cyan
    Write-Host "    [First Record]" -ForegroundColor White
    Write-Host $resultFirst
    Write-Host ""
    Write-Host "    [Last Record]" -ForegroundColor White
    Write-Host $resultLast
    Write-Host ""
    Write-Host "    [Count]" -ForegroundColor White
    Write-Host $resultCount
    
}
catch {
    Write-Host "    ✗ เกิดข้อผิดพลาด: $_" -ForegroundColor Red
}

# ============================================
# 3. ดึงข้อมูล Hourly เมื่อวาน - ดูการใช้พลังงานรายชั่วโมง
# ============================================
Write-Host ""
Write-Host "[3] ดึงข้อมูล Hourly เมื่อวาน..." -ForegroundColor Yellow

$fluxQueryHourly = @"
from(bucket:"$HourlyBucket") 
|> range(start: 2025-12-23T00:00:00+07:00, stop: 2025-12-24T00:00:00+07:00)
|> filter(fn:(r) => r._measurement == "energy_hourly")
|> filter(fn:(r) => r._field == "energy_consumed" or r._field == "energy_total")
|> sort(columns: ["_time"])
"@

try {
    $resultHourly = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/query?org=$InfluxOrg" `
        -Method Post `
        -Headers @{ 
        "Authorization" = "Token $InfluxToken"
        "Content-Type"  = "application/vnd.flux"
        "Accept"        = "application/csv"
    } `
        -Body $fluxQueryHourly
    
    Write-Host ""
    Write-Host "    === ผลลัพธ์ Hourly Data ===" -ForegroundColor Cyan
    Write-Host $resultHourly
    
}
catch {
    Write-Host "    ✗ เกิดข้อผิดพลาด: $_" -ForegroundColor Red
}

# ============================================
# 4. หาช่องว่างของข้อมูล (Data Gaps) - อาจบ่งบอกว่า DB หยุดทำงาน
# ============================================
Write-Host ""
Write-Host "[4] ตรวจสอบช่องว่างของข้อมูล (Data Gaps)..." -ForegroundColor Yellow

$fluxQueryGaps = @"
from(bucket:"$RawBucket") 
|> range(start: 2025-12-23T00:00:00+07:00, stop: 2025-12-24T00:00:00+07:00)
|> filter(fn:(r) => r._measurement == "energy_3phase" and r.device_id == "$DeviceId")
|> filter(fn:(r) => r._field == "energy_total")
|> elapsed(unit: 1m)
|> filter(fn:(r) => r.elapsed > 5)
|> keep(columns: ["_time", "elapsed"])
"@

try {
    $resultGaps = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/query?org=$InfluxOrg" `
        -Method Post `
        -Headers @{ 
        "Authorization" = "Token $InfluxToken"
        "Content-Type"  = "application/vnd.flux"
        "Accept"        = "application/csv"
    } `
        -Body $fluxQueryGaps
    
    Write-Host ""
    Write-Host "    === ช่องว่างที่มากกว่า 5 นาที ===" -ForegroundColor Cyan
    Write-Host "    (ถ้ามีช่องว่างนาน อาจหมายความว่า DB หยุดทำงานช่วงนั้น)" -ForegroundColor Gray
    Write-Host $resultGaps
    
}
catch {
    Write-Host "    ✗ เกิดข้อผิดพลาด: $_" -ForegroundColor Red
}

# ============================================
# 5. สรุปการใช้พลังงานเมื่อวาน
# ============================================
Write-Host ""
Write-Host "[5] สรุปการใช้พลังงานรวมเมื่อวาน..." -ForegroundColor Yellow

$fluxQuerySummary = @"
firstVal = from(bucket:"$RawBucket") 
|> range(start: 2025-12-23T00:00:00+07:00, stop: 2025-12-24T00:00:00+07:00)
|> filter(fn:(r) => r._measurement == "energy_3phase" and r.device_id == "$DeviceId")
|> filter(fn:(r) => r._field == "energy_total")
|> first()
|> findRecord(fn: (key) => true, idx: 0)

lastVal = from(bucket:"$RawBucket") 
|> range(start: 2025-12-23T00:00:00+07:00, stop: 2025-12-24T00:00:00+07:00)
|> filter(fn:(r) => r._measurement == "energy_3phase" and r.device_id == "$DeviceId")
|> filter(fn:(r) => r._field == "energy_total")
|> last()
|> findRecord(fn: (key) => true, idx: 0)

from(bucket:"$RawBucket") 
|> range(start: 2025-12-23T00:00:00+07:00, stop: 2025-12-24T00:00:00+07:00)
|> filter(fn:(r) => r._measurement == "energy_3phase" and r.device_id == "$DeviceId")
|> filter(fn:(r) => r._field == "energy_total")
|> first()
|> map(fn: (r) => ({
    _time: r._time,
    first_energy: firstVal._value,
    last_energy: lastVal._value,
    consumed: lastVal._value - firstVal._value
}))
"@

try {
    $resultSummary = Invoke-RestMethod -Uri "$InfluxUrl/api/v2/query?org=$InfluxOrg" `
        -Method Post `
        -Headers @{ 
        "Authorization" = "Token $InfluxToken"
        "Content-Type"  = "application/vnd.flux"
        "Accept"        = "application/csv"
    } `
        -Body $fluxQuerySummary
    
    Write-Host ""
    Write-Host "    === สรุปการใช้พลังงาน ===" -ForegroundColor Cyan
    Write-Host $resultSummary
    
}
catch {
    Write-Host "    ✗ เกิดข้อผิดพลาด: $_" -ForegroundColor Red
    Write-Host "    (จะคำนวณจาก first/last แทน)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "เสร็จสิ้นการทดสอบ" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
