@echo off
REM ═══════════════════════════════════════════════════════════════════════════
REM SMART Energy Monitoring System - Stop Script
REM Version: 2.0 (Updated: 2025-12-18)
REM Gracefully stops all system components
REM ═══════════════════════════════════════════════════════════════════════════

title SMART Energy System - Shutdown

echo.
echo ════════════════════════════════════════════════════════════════════
echo    SMART Energy Monitoring System - Shutdown
echo ════════════════════════════════════════════════════════════════════
echo.

echo [1/4] Stopping Frontend processes...
taskkill /F /FI "WINDOWTITLE eq SMART Frontend*" >nul 2>&1
echo       [OK] Frontend stopped

echo [2/4] Stopping Backend processes...
taskkill /F /FI "WINDOWTITLE eq SMART Backend*" >nul 2>&1
echo       [OK] Backend stopped

echo [3/4] Stopping remaining Node.js processes...
REM Only kill node processes related to this project (port 3000, 3001)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 :3001" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo       [OK] Node.js processes cleaned up

echo [4/4] Stopping PM2 processes (if any)...
where pm2 >nul 2>&1
if not errorlevel 1 (
    pm2 stop all >nul 2>&1
    echo       [OK] PM2 processes stopped
) else (
    echo       [SKIP] PM2 not installed
)

echo.
echo ════════════════════════════════════════════════════════════════════
echo    System Stopped Successfully
echo ════════════════════════════════════════════════════════════════════
echo.
echo    Ports freed:
echo    - Port 3000: Frontend
echo    - Port 3001: Backend
echo.
echo    Note:
echo    - InfluxDB continues running (manage separately)
echo    - MQTT broker is external (202.29.50.41:1883)
echo.
echo ════════════════════════════════════════════════════════════════════
echo.

pause
