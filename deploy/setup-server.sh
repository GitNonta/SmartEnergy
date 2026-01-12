#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# SMART Energy Monitoring System - Server Setup Script
# Target: Ubuntu 22.04 LTS
# Run once on fresh server
# ═══════════════════════════════════════════════════════════════════════════

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "   SMART Energy Monitoring System - Server Setup"
echo "   Ubuntu 22.04 LTS"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR] Please run as root: sudo ./setup-server.sh${NC}"
    exit 1
fi

echo -e "${GREEN}[OK] Running as root${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 1: System Update
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 1/7]${NC} Updating system packages..."

apt-get update
apt-get upgrade -y
apt-get install -y curl wget gnupg2 software-properties-common apt-transport-https ca-certificates lsb-release

echo -e "${GREEN}[OK] System updated${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 2: Install Node.js LTS (v20.x)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 2/7]${NC} Installing Node.js LTS..."

# Remove old NodeSource if exists
rm -f /etc/apt/sources.list.d/nodesource.list

# Install via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify
node --version
npm --version

echo -e "${GREEN}[OK] Node.js installed: $(node --version)${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 3: Install InfluxDB v2
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 3/7]${NC} Installing InfluxDB v2..."

# Add InfluxDB repository
wget -qO- https://repos.influxdata.com/influxdata-archive_compat.key | gpg --dearmor | tee /etc/apt/trusted.gpg.d/influxdata-archive_compat.gpg > /dev/null
echo "deb [signed-by=/etc/apt/trusted.gpg.d/influxdata-archive_compat.gpg] https://repos.influxdata.com/debian stable main" | tee /etc/apt/sources.list.d/influxdata.list

apt-get update
apt-get install -y influxdb2 influxdb2-cli

# Enable and start InfluxDB
systemctl enable influxdb
systemctl start influxdb

# Wait for InfluxDB to be ready
echo "Waiting for InfluxDB to start..."
sleep 5

echo -e "${GREEN}[OK] InfluxDB installed and running${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 4: Install Mosquitto MQTT Broker
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 4/7]${NC} Installing Mosquitto MQTT Broker..."

apt-get install -y mosquitto mosquitto-clients

# Configure Mosquitto
cat > /etc/mosquitto/conf.d/smart-energy.conf << 'EOF'
# SMART Energy Monitoring - Mosquitto Configuration

# MQTT Port (standard)
listener 1883
protocol mqtt

# WebSocket Port (for browser clients)
listener 9001
protocol websockets

# Allow anonymous (for development - restrict in production)
allow_anonymous true

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type all

# Persistence
persistence true
persistence_location /var/lib/mosquitto/
EOF

# Enable and restart Mosquitto
systemctl enable mosquitto
systemctl restart mosquitto

echo -e "${GREEN}[OK] Mosquitto installed and configured${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 5: Install PM2 (Process Manager)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 5/7]${NC} Installing PM2..."

npm install -g pm2

# Install PM2 log rotate
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

echo -e "${GREEN}[OK] PM2 installed with log rotation${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 6: Configure Firewall (UFW)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 6/7]${NC} Configuring Firewall..."

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH (critical - prevent lockout)
ufw allow ssh

# Web Server
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"

# SMART Energy Ports
ufw allow 3000/tcp comment "Node.js Backend"
ufw allow 3001/tcp comment "Node.js WebSocket"
ufw allow 1883/tcp comment "MQTT"
ufw allow 9001/tcp comment "MQTT WebSocket"
ufw allow 8086/tcp comment "InfluxDB"

# Enable UFW
echo "y" | ufw enable

echo -e "${GREEN}[OK] Firewall configured${NC}"
ufw status
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 7: Create Application Directory
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 7/7]${NC} Creating application directory..."

# Create app directory
APP_DIR="/opt/smart-energy"
mkdir -p $APP_DIR
mkdir -p $APP_DIR/backend
mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/backups

# Set ownership (change 'ubuntu' to your user)
chown -R ubuntu:ubuntu $APP_DIR

echo -e "${GREEN}[OK] Application directory created: $APP_DIR${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo -e "   ${GREEN}Server Setup Complete!${NC}"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "   Installed Components:"
echo "   - Node.js $(node --version)"
echo "   - npm $(npm --version)"
echo "   - InfluxDB v2"
echo "   - Mosquitto MQTT Broker"
echo "   - PM2 Process Manager"
echo ""
echo "   Service Status:"
systemctl is-active influxdb && echo "   - InfluxDB: Running" || echo "   - InfluxDB: Stopped"
systemctl is-active mosquitto && echo "   - Mosquitto: Running" || echo "   - Mosquitto: Stopped"
echo ""
echo "   Next Steps:"
echo "   1. Run: ./init-influxdb.sh (setup InfluxDB buckets/tasks)"
echo "   2. Run: ./deploy-app.sh (deploy application)"
echo ""
echo "   Access Points:"
echo "   - InfluxDB UI: http://YOUR_IP:8086"
echo "   - MQTT Broker: mqtt://YOUR_IP:1883"
echo ""
echo "════════════════════════════════════════════════════════════════════"
