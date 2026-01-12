# 🧪 FIRMWARE UPLOAD SYSTEM - COMPREHENSIVE TEST SCRIPT
# ทดสอบระบบอัพโหลด Firmware จากเริ่มต้น

Clear-Host

Write-Host "════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🧪 FIRMWARE UPLOAD SYSTEM - TESTING" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# =============================================================================
# PHASE 1: VERIFY SYSTEM COMPONENTS
# =============================================================================

Write-Host "📋 PHASE 1: VERIFY SYSTEM COMPONENTS" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host ""

# Check Backend
Write-Host "Checking Backend (Port 3001)..." -ForegroundColor White
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Backend API: RUNNING" -ForegroundColor Green
        Write-Host "   Response: $($response.Content)" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Backend API: NOT RESPONDING" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Check Frontend
Write-Host "Checking Frontend (Port 3000)..." -ForegroundColor White
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Frontend: RUNNING" -ForegroundColor Green
        Write-Host "   URL: http://localhost:3000" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Frontend: Starting or Not Available Yet" -ForegroundColor Yellow
    Write-Host "   (This is normal if frontend just started)" -ForegroundColor Yellow
}
Write-Host ""

# =============================================================================
# PHASE 2: VERIFY FILE LOCATIONS
# =============================================================================

Write-Host "📋 PHASE 2: VERIFY FILE LOCATIONS" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host ""

$files = @(
    @{Path = "d:\smart\backend\src\index.js"; Name = "Backend Entry Point" },
    @{Path = "d:\smart\frontend\src\components\FirmwareSftpUpload.tsx"; Name = "Upload Component" },
    @{Path = "d:\smart\sftp-firmware-upload.js"; Name = "SFTP Handler Script" },
    @{Path = "d:\smart\backend\.env"; Name = "Configuration File" }
)

foreach ($file in $files) {
    if (Test-Path $file.Path) {
        $size = (Get-Item $file.Path).Length / 1KB
        Write-Host "✅ $($file.Name)" -ForegroundColor Green
        Write-Host "   Path: $($file.Path)" -ForegroundColor Gray
        Write-Host "   Size: $([Math]::Round($size, 1)) KB" -ForegroundColor Gray
    } else {
        Write-Host "❌ $($file.Name) - NOT FOUND" -ForegroundColor Red
        Write-Host "   Path: $($file.Path)" -ForegroundColor Red
    }
    Write-Host ""
}

# =============================================================================
# PHASE 3: TEST API ENDPOINT
# =============================================================================

Write-Host "📋 PHASE 3: TEST API ENDPOINT - VALIDATION" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host ""

Write-Host "Test 1: POST /api/firmware/upload-sftp-v2 (No file - should fail)" -ForegroundColor White
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/firmware/upload-sftp-v2" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{"version":"1.0.0"}' `
        -UseBasicParsing `
        -TimeoutSec 5 `
        -ErrorAction Stop
    Write-Host "Response Status: $($response.StatusCode)" -ForegroundColor Yellow
    Write-Host "Response Body: $($response.Content)" -ForegroundColor Yellow
} catch {
    Write-Host "Expected Error (No file): $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
}
Write-Host ""

# =============================================================================
# PHASE 4: CHECK SFTP CONFIGURATION
# =============================================================================

Write-Host "📋 PHASE 4: CHECK SFTP CONFIGURATION" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host ""

Write-Host "SFTP Server Configuration:" -ForegroundColor White
$envFile = "d:\smart\backend\.env"
$sftp_config = @()

$sftp_config += Get-Content $envFile | Select-String "SFTP_HOST"
$sftp_config += Get-Content $envFile | Select-String "SFTP_PORT"
$sftp_config += Get-Content $envFile | Select-String "SFTP_USER"
$sftp_config += Get-Content $envFile | Select-String "SFTP_REMOTE_PATH"

foreach ($line in $sftp_config) {
    Write-Host "   $line" -ForegroundColor Cyan
}
Write-Host ""

# =============================================================================
# PHASE 5: CHECK NETWORK CONNECTIVITY
# =============================================================================

Write-Host "📋 PHASE 5: CHECK NETWORK CONNECTIVITY" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host ""

Write-Host "Checking SFTP Server (192.168.137.157:8022)..." -ForegroundColor White
$tcpTest = Test-NetConnection -ComputerName "192.168.137.157" -Port 8022 -WarningAction SilentlyContinue

if ($tcpTest.TcpTestSucceeded) {
    Write-Host "✅ SFTP Server: REACHABLE" -ForegroundColor Green
    Write-Host "   Host: 192.168.137.157" -ForegroundColor Green
    Write-Host "   Port: 8022" -ForegroundColor Green
} else {
    Write-Host "❌ SFTP Server: NOT REACHABLE" -ForegroundColor Red
    Write-Host "   Check firewall and network connectivity" -ForegroundColor Red
}
Write-Host ""

# =============================================================================
# PHASE 6: CREATE TEST FIRMWARE FILE
# =============================================================================

Write-Host "📋 PHASE 6: CREATE TEST FIRMWARE FILE" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host ""

$testBinPath = "d:\smart\backend\firmware\test_upload.bin"

if (-not (Test-Path "d:\smart\backend\firmware")) {
    New-Item -ItemType Directory -Path "d:\smart\backend\firmware" -Force | Out-Null
}

Write-Host "Creating test firmware file..." -ForegroundColor White

# Create a test binary file (512KB with pattern)
$testData = New-Object byte[] (512 * 1024)
for ($i = 0; $i -lt $testData.Length; $i++) {
    $testData[$i] = [byte]($i % 256)
}
[System.IO.File]::WriteAllBytes($testBinPath, $testData)

if (Test-Path $testBinPath) {
    $size = (Get-Item $testBinPath).Length / 1024
    Write-Host "✅ Test firmware file created" -ForegroundColor Green
    Write-Host "   Path: $testBinPath" -ForegroundColor Green
    Write-Host "   Size: $([Math]::Round($size, 1)) KB" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to create test file" -ForegroundColor Red
}
Write-Host ""

# =============================================================================
# PHASE 7: FRONTEND ACCESS INSTRUCTIONS
# =============================================================================

Write-Host "════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ TEST SETUP COMPLETE" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "📊 System Status:" -ForegroundColor Yellow
Write-Host "  • Backend API: http://localhost:3001" -ForegroundColor White
Write-Host "  • Frontend UI: http://localhost:3000" -ForegroundColor White
Write-Host "  • Upload Page: http://localhost:3000/firmware-sftp" -ForegroundColor White
Write-Host ""

Write-Host "📝 MANUAL TEST STEPS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  OPEN FRONTEND" -ForegroundColor Cyan
Write-Host "   URL: http://localhost:3000" -ForegroundColor White
Write-Host "   • Wait for page to load" -ForegroundColor Gray
Write-Host "   • Check for 'Firmware Upload' menu item" -ForegroundColor Gray
Write-Host ""

Write-Host "2️⃣  NAVIGATE TO UPLOAD PAGE" -ForegroundColor Cyan
Write-Host "   • Click 'Firmware Upload' in menu" -ForegroundColor White
Write-Host "   • Or visit: http://localhost:3000/firmware-sftp" -ForegroundColor White
Write-Host ""

Write-Host "3️⃣  SELECT TEST FILE" -ForegroundColor Cyan
Write-Host "   Path: $testBinPath" -ForegroundColor White
Write-Host "   • Click 'Click to select firmware file' button" -ForegroundColor Gray
Write-Host "   • Select: $testBinPath" -ForegroundColor Gray
Write-Host "   • Or use any existing .bin file (max 4MB)" -ForegroundColor Gray
Write-Host ""

Write-Host "4️⃣  ENTER VERSION" -ForegroundColor Cyan
Write-Host "   Example: 1.0.0" -ForegroundColor White
Write-Host "   • Required field" -ForegroundColor Gray
Write-Host ""

Write-Host "5️⃣  ADD RELEASE NOTES (Optional)" -ForegroundColor Cyan
Write-Host "   Example: 'Test firmware upload'" -ForegroundColor White
Write-Host ""

Write-Host "6️⃣  CLICK 'Upload to SFTP'" -ForegroundColor Cyan
Write-Host "   • Should show progress bar" -ForegroundColor White
Write-Host "   • Wait for success message" -ForegroundColor White
Write-Host "   • Form clears automatically" -ForegroundColor Gray
Write-Host ""

Write-Host "7️⃣  VERIFY UPLOAD SUCCESS" -ForegroundColor Cyan
Write-Host "   Check in browser DevTools:" -ForegroundColor White
Write-Host "   • Console: Look for success messages" -ForegroundColor Gray
Write-Host "   • Network: Check POST request response" -ForegroundColor Gray
Write-Host ""

Write-Host "8️⃣  VERIFY FILE ON SFTP SERVER" -ForegroundColor Cyan
Write-Host "   SSH to server:" -ForegroundColor White
Write-Host "   • ssh u0_a175@192.168.137.157 -p 8022" -ForegroundColor Gray
Write-Host "   • Password: Nontawat01" -ForegroundColor Gray
Write-Host "   • ls -la ./Firmware/" -ForegroundColor Gray
Write-Host ""

Write-Host "════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔍 DEBUGGING & LOGS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Backend Console Logs:" -ForegroundColor White
Write-Host "  • Watch for SFTP operations output" -ForegroundColor Gray
Write-Host ""

Write-Host "Backend Files:" -ForegroundColor White
Write-Host "  • Logs: d:\smart\backend\logs\" -ForegroundColor Gray
Write-Host "  • Firmware: d:\smart\backend\firmware\" -ForegroundColor Gray
Write-Host ""

Write-Host "Browser DevTools:" -ForegroundColor White
Write-Host "  • Press F12 to open DevTools" -ForegroundColor Gray
Write-Host "  • Console tab: Error messages" -ForegroundColor Gray
Write-Host "  • Network tab: API requests" -ForegroundColor Gray
Write-Host ""

Write-Host "════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "✨ Ready for testing! Start with step 1 above." -ForegroundColor Green
Write-Host ""
