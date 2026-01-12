#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# SMART Energy Monitoring System - Application Deployment
# Deploy code, install dependencies, restart service
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "   SMART Energy - Application Deployment"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════
APP_DIR="/opt/smart-energy"
BACKEND_DIR="$APP_DIR/backend"
SOURCE_DIR="/tmp/smart-energy-source"  # Temporary source location

# Git repository (change to your repo)
GIT_REPO="https://github.com/your-org/smart-energy.git"
GIT_BRANCH="main"

# Or use rsync/scp for deployment
USE_GIT=false  # Set to true if using git

echo -e "${BLUE}[Config]${NC} App directory: $APP_DIR"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 1: Stop Current Service (if running)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 1/5]${NC} Stopping current service..."

if pm2 list | grep -q "smart-energy-backend"; then
    pm2 stop smart-energy-backend || true
    echo -e "  ${GREEN}[OK] Service stopped${NC}"
else
    echo -e "  ${YELLOW}[SKIP] Service not running${NC}"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 2: Deploy Source Code
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 2/5]${NC} Deploying source code..."

if [ "$USE_GIT" = true ]; then
    # Git deployment
    if [ -d "$BACKEND_DIR/.git" ]; then
        cd $BACKEND_DIR
        git fetch origin
        git reset --hard origin/$GIT_BRANCH
        echo -e "  ${GREEN}[OK] Updated from git${NC}"
    else
        rm -rf $BACKEND_DIR
        git clone --branch $GIT_BRANCH $GIT_REPO $BACKEND_DIR
        echo -e "  ${GREEN}[OK] Cloned from git${NC}"
    fi
else
    # Manual deployment (copy from local)
    echo -e "  ${YELLOW}[INFO] Using manual deployment mode${NC}"
    echo "  Copy your backend folder to: $BACKEND_DIR"
    echo ""
    
    # Check if backend exists
    if [ ! -d "$BACKEND_DIR/src" ]; then
        echo -e "  ${RED}[ERROR] Backend source not found at $BACKEND_DIR${NC}"
        echo "  Please copy your backend folder first:"
        echo "    scp -r ./backend/* user@server:$BACKEND_DIR/"
        exit 1
    fi
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 3: Install Dependencies
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 3/5]${NC} Installing dependencies..."

cd $BACKEND_DIR

# Clean install
rm -rf node_modules package-lock.json
npm install --production

echo -e "${GREEN}[OK] Dependencies installed${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 4: Setup Environment
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 4/5]${NC} Checking environment..."

ENV_FILE="$BACKEND_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "  ${YELLOW}[WARN] .env file not found, creating template...${NC}"
    
    cat > "$ENV_FILE" << 'EOF'
# SMART Energy Monitoring - Production Environment
NODE_ENV=production

# Server
PORT=3001
HOST=0.0.0.0

# MQTT Broker
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_TOPIC_DATA=+/data

# InfluxDB
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=YOUR_TOKEN_HERE
INFLUXDB_ORG=Ennergy
INFLUXDB_BUCKET_RAW=AI205_raw
INFLUXDB_BUCKET_HOURLY=AI205_hourly
INFLUXDB_BUCKET_DAILY=AI205_daily
INFLUXDB_BUCKET_WEEKLY=AI205_weekly
INFLUXDB_BUCKET_MONTHLY=AI205_monthly
INFLUXDB_BUCKET_YEARLY=AI205_yearly

# Timezone
TIMEZONE=Asia/Bangkok

# CORS
CORS_ORIGINS=http://localhost:3000,https://your-domain.com
EOF
    
    echo -e "  ${YELLOW}[ACTION] Edit $ENV_FILE and set INFLUXDB_TOKEN${NC}"
    echo ""
else
    echo -e "  ${GREEN}[OK] .env file exists${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 5: Start/Restart with PM2
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 5/5]${NC} Starting service with PM2..."

cd $BACKEND_DIR

# Check if ecosystem.config.js exists
if [ ! -f "ecosystem.config.js" ]; then
    echo -e "  ${YELLOW}[WARN] ecosystem.config.js not found, copying...${NC}"
    
    # Copy from deploy folder if exists
    if [ -f "/opt/smart-energy/deploy/ecosystem.config.js" ]; then
        cp /opt/smart-energy/deploy/ecosystem.config.js .
    else
        echo -e "  ${RED}[ERROR] ecosystem.config.js not found${NC}"
        exit 1
    fi
fi

# Start or restart
if pm2 list | grep -q "smart-energy-backend"; then
    pm2 restart ecosystem.config.js
    echo -e "  ${GREEN}[OK] Service restarted${NC}"
else
    pm2 start ecosystem.config.js
    echo -e "  ${GREEN}[OK] Service started${NC}"
fi

# Save PM2 process list
pm2 save

# Setup PM2 startup (run on reboot)
pm2 startup systemd -u $(whoami) --hp $HOME 2>/dev/null || true

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Health Check
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Health Check]${NC} Waiting for service..."

sleep 5

if curl -s http://localhost:3001/health | grep -q "ok"; then
    echo -e "${GREEN}[OK] Backend is healthy!${NC}"
else
    echo -e "${YELLOW}[WARN] Health check failed - check logs${NC}"
    pm2 logs smart-energy-backend --lines 20
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo -e "   ${GREEN}Deployment Complete!${NC}"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "   PM2 Status:"
pm2 status
echo ""
echo "   Useful Commands:"
echo "   - View logs:     pm2 logs smart-energy-backend"
echo "   - Restart:       pm2 restart smart-energy-backend"
echo "   - Stop:          pm2 stop smart-energy-backend"
echo "   - Monitor:       pm2 monit"
echo ""
echo "   Endpoints:"
echo "   - Health:        http://localhost:3001/health"
echo "   - WebSocket:     ws://localhost:3001"
echo ""
echo "════════════════════════════════════════════════════════════════════"
