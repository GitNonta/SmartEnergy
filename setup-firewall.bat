@echo off
REM ═══════════════════════════════════════════════════════════════════════════
REM SMART Energy Monitoring System - Windows Firewall Configuration
REM Version: 2.0 (Updated: 2025-12-18)
REM Required: Run as Administrator
REM ═══════════════════════════════════════════════════════════════════════════

title SMART Energy - Firewall Setup

echo.
echo ════════════════════════════════════════════════════════════════════
echo    SMART Energy Monitoring System
echo    Windows Firewall Configuration v2.0
echo ════════════════════════════════════════════════════════════════════
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running as Administrator
) else (
    echo [ERROR] This script requires Administrator privileges
    echo.
    echo Please right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

echo.
echo [1/5] Removing old firewall rules (if any)...

netsh advfirewall firewall delete rule name="SMART Energy Backend" >nul 2>&1
netsh advfirewall firewall delete rule name="SMART Energy Frontend" >nul 2>&1
netsh advfirewall firewall delete rule name="SMART Energy InfluxDB" >nul 2>&1
netsh advfirewall firewall delete rule name="SMART Energy MQTT" >nul 2>&1
netsh advfirewall firewall delete rule name="SMART Energy WebSocket" >nul 2>&1
netsh advfirewall firewall delete rule name="SMART Energy Node.js" >nul 2>&1
echo       [OK] Old rules removed

echo.
echo [2/5] Creating Inbound Rules...

REM Backend API + WebSocket (Port 3001)
netsh advfirewall firewall add rule ^
    name="SMART Energy Backend" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=3001 ^
    description="SMART Energy Backend API and WebSocket server"
echo       [OK] Port 3001 (Backend API + WebSocket) - Allowed

REM Frontend Dev Server (Port 3000)
netsh advfirewall firewall add rule ^
    name="SMART Energy Frontend" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=3000 ^
    description="SMART Energy React Frontend Development Server"
echo       [OK] Port 3000 (Frontend) - Allowed

REM InfluxDB (Port 8086)
netsh advfirewall firewall add rule ^
    name="SMART Energy InfluxDB" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=8086 ^
    description="InfluxDB Time-Series Database for SMART Energy"
echo       [OK] Port 8086 (InfluxDB) - Allowed

REM MQTT (Port 1883) - typically outbound only, but allow inbound if local broker
netsh advfirewall firewall add rule ^
    name="SMART Energy MQTT" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=1883 ^
    description="MQTT Broker for IoT device communication"
echo       [OK] Port 1883 (MQTT) - Allowed

echo.
echo [3/5] Creating Program Rules...

REM Allow Node.js (common paths)
if exist "%ProgramFiles%\nodejs\node.exe" (
    netsh advfirewall firewall add rule ^
        name="SMART Energy Node.js" ^
        dir=in ^
        action=allow ^
        program="%ProgramFiles%\nodejs\node.exe" ^
        description="Node.js runtime for SMART Energy"
    echo       [OK] Node.js (Program Files) - Allowed
)

if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    netsh advfirewall firewall add rule ^
        name="SMART Energy Node.js Local" ^
        dir=in ^
        action=allow ^
        program="%LOCALAPPDATA%\Programs\nodejs\node.exe" ^
        description="Node.js runtime for SMART Energy (Local)"
    echo       [OK] Node.js (Local) - Allowed
)

echo.
echo [4/5] Verifying Rules...

echo.
echo Installed Firewall Rules:
netsh advfirewall firewall show rule name="SMART Energy Backend" | findstr "Rule Name Enabled Action LocalPort"
netsh advfirewall firewall show rule name="SMART Energy Frontend" | findstr "Rule Name Enabled Action LocalPort"
netsh advfirewall firewall show rule name="SMART Energy InfluxDB" | findstr "Rule Name Enabled Action LocalPort"

echo.
echo [5/5] Complete!

echo.
echo ════════════════════════════════════════════════════════════════════
echo    Firewall Configuration Complete
echo ════════════════════════════════════════════════════════════════════
echo.
echo    Ports Opened:
echo    - 3000/TCP: Frontend Dashboard (React)
echo    - 3001/TCP: Backend API + WebSocket
echo    - 8086/TCP: InfluxDB
echo    - 1883/TCP: MQTT (optional)
echo.
echo    System Architecture:
echo    +--------+     +--------+     +----------+     +--------+
echo    | ESP32  | --> |  MQTT  | --> | Backend  | --> | InfluxDB|
echo    | AI205  |     | Broker |     | :3001    |     | :8086  |
echo    +--------+     +--------+     +----+-----+     +--------+
echo                                       |
echo                                       v (WebSocket)
echo                                  +---------+
echo                                  | Frontend|
echo                                  | :3000   |
echo                                  +---------+
echo.
echo    Management Commands:
echo    - View all rules:  netsh advfirewall firewall show rule name=all
echo    - Delete a rule:   netsh advfirewall firewall delete rule name="SMART Energy Backend"
echo    - Disable a rule:  netsh advfirewall firewall set rule name="SMART Energy Backend" new enable=no
echo.
echo ════════════════════════════════════════════════════════════════════
echo.

pause