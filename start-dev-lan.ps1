#!/usr/bin/env pwsh
# ═══════════════════════════════════════════════════════════════════════════
# SMART Energy Development Server - Auto IP Detection
# Automatically detects LAN IP and starts frontend + backend
# ═══════════════════════════════════════════════════════════════════════════

Write-Host "`n🚀 Starting SMART Energy Development Server with LAN Support..." -ForegroundColor Cyan
Write-Host ("═"*80) -ForegroundColor Cyan

# ═══════════════════════════════════════════════════════════════════════════
# Get Local IP Address - AUTO DETECTION
# ═══════════════════════════════════════════════════════════════════════════
Write-Host "`n📡 Detecting Network Configuration..." -ForegroundColor Yellow

# Get all IPv4 addresses (exclude loopback and APIPA)
$allIPs = Get-NetIPAddress -AddressFamily IPv4 | 
    Where-Object { 
        $_.IPAddress -notlike "127.*" -and 
        $_.IPAddress -notlike "169.254.*" -and
        ($_.PrefixOrigin -eq "Dhcp" -or $_.PrefixOrigin -eq "Manual")
    } | 
    Sort-Object -Property @{Expression={
        # Prioritize 10.x, then 192.168.x, then 172.x
        if ($_.IPAddress -like "10.*") { 1 }
        elseif ($_.IPAddress -like "192.168.*") { 2 }
        elseif ($_.IPAddress -like "172.*") { 3 }
        else { 4 }
    }}

$localIP = $allIPs | Select-Object -First 1 -ExpandProperty IPAddress

if (-not $localIP) {
    Write-Host "❌ Could not auto-detect LAN IP" -ForegroundColor Red
    Write-Host "   Please ensure you are connected to a network" -ForegroundColor Yellow
    Write-Host "   Available network adapters:" -ForegroundColor Yellow
    Get-NetIPAddress -AddressFamily IPv4 | Format-Table IPAddress, InterfaceAlias, PrefixOrigin -AutoSize
    exit 1
}

Write-Host "✅ Auto-detected LAN IP: $localIP" -ForegroundColor Green

# Show all detected IPs for reference
if ($allIPs.Count -gt 1) {
    Write-Host "   Other available IPs:" -ForegroundColor Gray
    $allIPs | Select-Object -Skip 1 | ForEach-Object {
        Write-Host "   - $($_.IPAddress) ($($_.InterfaceAlias))" -ForegroundColor Gray
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# Update .env.development.local with current IP
# ═══════════════════════════════════════════════════════════════════════════
Write-Host "`n📝 Updating WebSocket configuration..." -ForegroundColor Yellow

$envContent = @"
# Dev Server Configuration for LAN Access
HOST=0.0.0.0
PORT=3000

# HMR WebSocket Configuration - CRITICAL for LAN access
# Use IP address instead of localhost for LAN devices to connect
WDS_SOCKET_HOST=$localIP
WDS_SOCKET_PORT=3000
WDS_SOCKET_PATH=/ws

# Fast Refresh Configuration
FAST_REFRESH=true

# Backend API/WS port (must match backend PORT in backend/.env)
REACT_APP_API_PORT=3001

# Disable service worker in development (prevents stale cache)
REACT_APP_SW_ENABLED=false

# Avoid opening browser automatically
BROWSER=none

# Disable cache for HMR
GENERATE_SOURCEMAP=true
"@

$envContent | Out-File -FilePath ".\frontend\.env.development.local" -Encoding UTF8 -NoNewline
Write-Host "✅ Updated WDS_SOCKET_HOST to $localIP" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════════════════
# Start Backend Server
# ═══════════════════════════════════════════════════════════════════════════
Write-Host "`n🔧 Starting Backend Server..." -ForegroundColor Yellow

$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD\backend
    npm start
}

Write-Host "✅ Backend starting (Job ID: $($backendJob.Id))..." -ForegroundColor Green
Start-Sleep -Seconds 3

# ═══════════════════════════════════════════════════════════════════════════
# Start Frontend Development Server
# ═══════════════════════════════════════════════════════════════════════════
Write-Host "`n🎨 Starting Frontend Development Server..." -ForegroundColor Yellow

Set-Location .\frontend

Write-Host "`n" -NoNewline
Write-Host ("═"*80) -ForegroundColor Green
Write-Host "✅ Development Server Starting!" -ForegroundColor Green
Write-Host ("═"*80) -ForegroundColor Green
Write-Host ""
Write-Host "📊 Access Dashboard:" -ForegroundColor Cyan
Write-Host "   Local:            http://localhost:3000" -ForegroundColor White
Write-Host "   LAN:              http://${localIP}:3000" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Backend API:" -ForegroundColor Cyan
Write-Host "   Local:            http://localhost:3001" -ForegroundColor White
Write-Host "   LAN:              http://${localIP}:3001" -ForegroundColor White
Write-Host ""
Write-Host "🔌 WebSocket:" -ForegroundColor Cyan
Write-Host "   Auto-detect:      ws://{your-access-ip}:3001" -ForegroundColor White
Write-Host ""
Write-Host "🔥 Hot Module Replacement: ENABLED on both URLs" -ForegroundColor Green
Write-Host "💡 Edit any file in src/ and see changes instantly!" -ForegroundColor Yellow
Write-Host ("═"*80) -ForegroundColor Green
Write-Host ""

# Start frontend (this will block)
npm start
