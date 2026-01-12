@echo off
REM Installation and Setup Script for SFTP Firmware Upload System

setlocal enabledelayedexpansion

echo.
echo ================================
echo SFTP Firmware Upload System Setup
echo ================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js version: %NODE_VERSION%
echo.

REM Check if npm is installed
where npm >nul 2>nul
if errorlevel 1 (
    echo ❌ npm is not installed
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm version: %NPM_VERSION%
echo.

REM Navigate to backend directory
if exist backend (
    cd backend
    echo 📁 Changed to backend directory
) else (
    echo ❌ backend directory not found
    pause
    exit /b 1
)

echo.
echo Installing dependencies...
call npm install

if errorlevel 1 (
    echo ❌ npm install failed
    pause
    exit /b 1
)

echo.
echo ✅ Dependencies installed successfully
echo.

REM Check if .env exists
if not exist .env (
    echo ⚠️  .env file not found
    echo.
    echo Creating .env file with SFTP configuration...
    echo.
    
    (
        echo # MQTT Broker Configuration
        echo MQTT_BROKER_HOST=192.168.137.157
        echo MQTT_BROKER_PORT=1883
        echo MQTT_PROTOCOL=mqtt
        echo MQTT_USERNAME=Nontawat01
        echo MQTT_PASSWORD=nkey5632
        echo.
        echo # MQTT Topics
        echo MQTT_TOPIC_DATA=AI205/data
        echo MQTT_TOPIC_ALERTS=AI205/alerts
        echo MQTT_TOPIC_STATUS=AI205/status
        echo MQTT_TOPIC_COMMANDS=AI205/commands
        echo.
        echo # WebSocket Server Configuration
        echo WS_PORT=8080
        echo WS_HOST=0.0.0.0
        echo.
        echo # Express Server Configuration
        echo PORT=3001
        echo HOST=0.0.0.0
        echo.
        echo # Application Settings
        echo AUTO_CONNECT=true
        echo RECONNECT_PERIOD=5000
        echo CONNECT_TIMEOUT=30000
        echo HISTORY_RETENTION_HOURS=24
        echo.
        echo # CORS Settings
        echo FRONTEND_URL=http://localhost:3000
        echo.
        echo # SFTP Server Configuration (for firmware upload)
        echo SFTP_HOST=202.29.50.41
        echo SFTP_PORT=22
        echo SFTP_USER=s6710886217
        echo SFTP_PASSWORD=nkey5632
        echo SFTP_REMOTE_PATH=/home/s6710886217/public_html/firmware
        echo.
        echo # MQTT Firmware Topic
        echo MQTT_FW_TOPIC=AI205/firmware/info
        echo.
        echo # InfluxDB Configuration
        echo INFLUXDB_URL=http://localhost:8086
        echo INFLUXDB_TOKEN=rft_M6WkVq5f48jzITJTVjDLR1wdvSUiThfVP4PH4LIZi6PgiZjUtfiVo7_KItFRYe4yzpwssxuO9VXUzhUFuQ==
        echo INFLUXDB_ORG=Ennergy
        echo INFLUXDB_BUCKET_RAW=AI205_raw
        echo INFLUXDB_BUCKET_1H=AI205_1h
        echo INFLUXDB_BUCKET_1D=AI205_1d
        echo INFLUXDB_BUCKET_1M=AI205_1m
        echo INFLUXDB_BUCKET_MN=AI205_MN
    ) > .env
    
    echo ✅ .env file created
) else (
    echo ✅ .env file already exists
)

echo.
echo ================================
echo Setup Complete! ✅
echo ================================
echo.
echo Next steps:
echo 1. Update .env with your configuration
echo 2. Start backend: npm start ^(or npm run dev^)
echo 3. Test SFTP: curl http://localhost:3001/api/firmware/sftp/test
echo 4. Upload firmware: See SFTP_FIRMWARE_QUICK_START.md
echo.
echo Documentation:
echo   📖 SFTP_FIRMWARE_API.md - API documentation
echo   🚀 SFTP_FIRMWARE_QUICK_START.md - Quick start guide
echo   🧪 SFTP_FIRMWARE_TESTING.md - Testing guide
echo   📋 README.md - Backend overview
echo.

pause
