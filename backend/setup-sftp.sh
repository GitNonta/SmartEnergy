#!/usr/bin/env bash
# Installation and Setup Script for SFTP Firmware Upload System

set -e

echo "================================"
echo "SFTP Firmware Upload System Setup"
echo "================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "✅ npm version: $(npm --version)"
echo ""

# Navigate to backend directory
if [ -d "backend" ]; then
    cd backend
    echo "📁 Changed to backend directory"
else
    echo "❌ backend directory not found"
    exit 1
fi

echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "✅ Dependencies installed successfully"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found"
    echo ""
    echo "Creating .env file with SFTP configuration..."
    
    cat > .env << 'EOF'
# MQTT Broker Configuration
MQTT_BROKER_HOST=192.168.137.157
MQTT_BROKER_PORT=1883
MQTT_PROTOCOL=mqtt
MQTT_USERNAME=Nontawat01
MQTT_PASSWORD=nkey5632

# MQTT Topics
MQTT_TOPIC_DATA=AI205/data
MQTT_TOPIC_ALERTS=AI205/alerts
MQTT_TOPIC_STATUS=AI205/status
MQTT_TOPIC_COMMANDS=AI205/commands

# WebSocket Server Configuration
WS_PORT=8080
WS_HOST=0.0.0.0

# Express Server Configuration  
PORT=3001
HOST=0.0.0.0

# Application Settings
AUTO_CONNECT=true
RECONNECT_PERIOD=5000
CONNECT_TIMEOUT=30000
HISTORY_RETENTION_HOURS=24

# CORS Settings (Frontend URL)
FRONTEND_URL=http://localhost:3000

# SFTP Server Configuration (for firmware upload)
SFTP_HOST=202.29.50.41
SFTP_PORT=22
SFTP_USER=s6710886217
SFTP_PASSWORD=nkey5632
SFTP_REMOTE_PATH=/home/s6710886217/public_html/firmware

# MQTT Firmware Topic
MQTT_FW_TOPIC=AI205/firmware/info

# InfluxDB Configuration
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=rft_M6WkVq5f48jzITJTVjDLR1wdvSUiThfVP4PH4LIZi6PgiZjUtfiVo7_KItFRYe4yzpwssxuO9VXUzhUFuQ==
INFLUXDB_ORG=Ennergy
INFLUXDB_BUCKET_RAW=AI205_raw
INFLUXDB_BUCKET_1H=AI205_1h
INFLUXDB_BUCKET_1D=AI205_1d
INFLUXDB_BUCKET_1M=AI205_1m
INFLUXDB_BUCKET_MN=AI205_MN
EOF

    echo "✅ .env file created"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "================================"
echo "Setup Complete! ✅"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Update .env with your configuration"
echo "2. Start backend: npm start (or npm run dev)"
echo "3. Test SFTP: curl http://localhost:3001/api/firmware/sftp/test"
echo "4. Upload firmware: See SFTP_FIRMWARE_QUICK_START.md"
echo ""
echo "Documentation:"
echo "  📖 SFTP_FIRMWARE_API.md - API documentation"
echo "  🚀 SFTP_FIRMWARE_QUICK_START.md - Quick start guide"
echo "  🧪 SFTP_FIRMWARE_TESTING.md - Testing guide"
echo "  📋 README.md - Backend overview"
echo ""
