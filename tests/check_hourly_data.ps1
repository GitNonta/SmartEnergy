# ตรวจสอบข้อมูลใน AI205_hourly bucket
$envFile = "d:\smart\backend\.env"
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $idx = $_.IndexOf('=')
    if ($idx -gt 0) {
        $key = $_.Substring(0, $idx).Trim()
        $value = $_.Substring($idx + 1).Trim().Trim('"').Trim("'")
        if ($key -eq "INFLUXDB_TOKEN") { $script:InfluxToken = $value }
    }
}

$headers = @{
    "Authorization" = "Token $InfluxToken"
    "Content-Type"  = "application/vnd.flux"
    "Accept"        = "application/csv"
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "ตรวจสอบข้อมูลใน AI205_hourly" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# 1. นับจำนวนข้อมูลทั้งหมด
Write-Host ""
Write-Host "[1] นับจำนวนข้อมูลทั้งหมดใน AI205_hourly..." -ForegroundColor Yellow
$q = @'
from(bucket:"AI205_hourly") 
|> range(start: 0) 
|> group()
|> count()
'@
$result = Invoke-RestMethod -Uri "http://localhost:8086/api/v2/query?org=Ennergy" -Method Post -Headers $headers -Body $q
Write-Host $result

# 2. ดู measurements ที่มี
Write-Host ""
Write-Host "[2] Measurements ที่มีใน AI205_hourly..." -ForegroundColor Yellow
$q = @'
import "influxdata/influxdb/schema"
schema.measurements(bucket: "AI205_hourly")
'@
$result = Invoke-RestMethod -Uri "http://localhost:8086/api/v2/query?org=Ennergy" -Method Post -Headers $headers -Body $q
Write-Host $result

# 3. ดูช่วงเวลาล่าสุดของข้อมูล
Write-Host ""
Write-Host "[3] ข้อมูลล่าสุดใน AI205_hourly..." -ForegroundColor Yellow
$q = @'
from(bucket:"AI205_hourly") 
|> range(start: -90d)
|> filter(fn: (r) => r._measurement == "energy_3phase")
|> last()
|> keep(columns: ["_time", "_field", "_value", "_measurement"])
'@
$result = Invoke-RestMethod -Uri "http://localhost:8086/api/v2/query?org=Ennergy" -Method Post -Headers $headers -Body $q
Write-Host $result

# 4. เช็คว่า raw มีข้อมูลไหม (เพื่อให้ aggregate_hourly ทำงานได้)
Write-Host ""
Write-Host "[4] ข้อมูลล่าสุดใน AI205_raw (ต้องมีเพื่อให้ hourly aggregate ได้)..." -ForegroundColor Yellow
$q = @'
from(bucket:"AI205_raw") 
|> range(start: -2h)
|> filter(fn: (r) => r._measurement == "energy_3phase")
|> filter(fn: (r) => r._field == "energy_total")
|> last()
'@
$result = Invoke-RestMethod -Uri "http://localhost:8086/api/v2/query?org=Ennergy" -Method Post -Headers $headers -Body $q
Write-Host $result

# 5. ทดสอบรัน aggregate_hourly query ด้วยตัวเอง
Write-Host ""
Write-Host "[5] ทดสอบรัน aggregate_hourly query (dry-run)..." -ForegroundColor Yellow
$q = @'
import "timezone"
option location = timezone.location(name: "Asia/Bangkok")

from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_total")
  |> group(columns: ["_measurement", "_field", "device_id"])
  |> aggregateWindow(every: 1h, fn: last, createEmpty: false)
  |> difference(nonNegative: true)
'@
$result = Invoke-RestMethod -Uri "http://localhost:8086/api/v2/query?org=Ennergy" -Method Post -Headers $headers -Body $q
Write-Host "Result:"
Write-Host $result

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
