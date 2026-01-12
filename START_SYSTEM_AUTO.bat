@echo off
REM ═══════════════════════════════════════════════════════════════════════════
REM SMART Energy Monitoring System - Auto Startup Script
REM Version: 2.0 (Updated: 2025-12-18)
REM Features:
REM   - Auto IP Detection for LAN access
REM   - InfluxDB health check before start
REM   - Backend + Frontend concurrent startup
REM ═══════════════════════════════════════════════════════════════════════════

title SMART Energy System Startup

echo.
echo ════════════════════════════════════════════════════════════════════
echo    SMART Energy Monitoring System - Auto Startup
echo    Version 2.0 - Golden Roadmap Compliant
echo ════════════════════════════════════════════════════════════════════
echo.

REM Check if PowerShell is available
powershell -Command "Write-Host 'PowerShell detected' -ForegroundColor Green" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PowerShell not found. Please install PowerShell.
    pause
    exit /b 1
)

REM ═══════════════════════════════════════════════════════════════════════════
REM Step 1: Pre-flight Checks
REM ═══════════════════════════════════════════════════════════════════════════
echo [1/5] Pre-flight Checks...

REM Check if Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)
echo       [OK] Node.js found

REM Check if npm is installed
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)
echo       [OK] npm found

echo.

REM ═══════════════════════════════════════════════════════════════════════════
REM Step 2: Check InfluxDB
REM ═══════════════════════════════════════════════════════════════════════════
echo [2/5] Checking InfluxDB...

powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8086/health' -TimeoutSec 5 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
    echo       [WARN] InfluxDB not running on localhost:8086
    echo       [INFO] System will start but historical data features may not work
    echo.
    choice /C YN /M "Continue without InfluxDB? (Y/N)"
    if errorlevel 2 (
        echo [ABORT] Please start InfluxDB first
        pause
        exit /b 1
    )
) else (
    echo       [OK] InfluxDB is running
)
echo.

REM ═══════════════════════════════════════════════════════════════════════════
REM Step 3: Detect LAN IP
REM ═══════════════════════════════════════════════════════════════════════════
echo [3/5] Detecting LAN IP Address...

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4 Address"') do (
    set LANIP=%%a
    goto :gotip
)
:gotip
set LANIP=%LANIP: =%
echo       [OK] LAN IP: %LANIP%
echo.

REM ═══════════════════════════════════════════════════════════════════════════
REM Step 4: Start Backend
REM ═══════════════════════════════════════════════════════════════════════════
echo [4/5] Starting Backend Server...

cd /d "%~dp0backend"
if not exist node_modules (
    echo       [INFO] Installing backend dependencies...
    call npm install
)

start "SMART Backend" cmd /k "npm run dev"
echo       [OK] Backend starting on port 3001

REM Wait for backend to be ready
echo       [INFO] Waiting for backend to be ready...
timeout /t 5 /nobreak >nul

REM Check backend health
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3001/health' -TimeoutSec 10 -UseBasicParsing; if ($r.StatusCode -eq 200) { Write-Host '      [OK] Backend is ready' -ForegroundColor Green; exit 0 } } catch { Write-Host '      [WARN] Backend may still be starting...' -ForegroundColor Yellow; exit 0 }"
echo.

REM ═══════════════════════════════════════════════════════════════════════════
REM Step 5: Start Frontend
REM ═══════════════════════════════════════════════════════════════════════════
echo [5/5] Starting Frontend Server...

cd /d "%~dp0frontend"
if not exist node_modules (
    echo       [INFO] Installing frontend dependencies...
    call npm install
)

REM Set HOST for LAN access
set HOST=0.0.0.0
start "SMART Frontend" cmd /k "set HOST=0.0.0.0 && npm start"
echo       [OK] Frontend starting on port 3000
echo.

REM ═══════════════════════════════════════════════════════════════════════════
REM Summary
REM ═══════════════════════════════════════════════════════════════════════════
echo ════════════════════════════════════════════════════════════════════
echo    SMART Energy System Started Successfully!
echo ════════════════════════════════════════════════════════════════════
echo.
echo    Access Points:
echo    - Frontend:  http://localhost:3000
echo    - Frontend:  http://%LANIP%:3000 (LAN)
echo    - Backend:   http://localhost:3001
echo    - Backend:   http://%LANIP%:3001 (LAN)
echo    - InfluxDB:  http://localhost:8086
echo.
echo    Quick Commands:
echo    - Stop all:  Run STOP_SYSTEM.bat
echo    - Logs:      Check the terminal windows
echo.
echo    System Components:
echo    - MQTT Topic: AI205/data (from 202.29.50.41:1883)
echo    - InfluxDB Bucket: AI205_raw
echo    - Real-time: WebSocket on port 3001
echo.
echo ════════════════════════════════════════════════════════════════════
echo.

pause
