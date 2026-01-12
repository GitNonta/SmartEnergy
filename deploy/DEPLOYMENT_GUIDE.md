# SMART Energy Monitoring System
# Production Deployment Guide

**Version:** 1.0  
**Target OS:** Ubuntu 22.04 LTS  
**Date:** 2025-12-18

---

## TABLE OF CONTENTS

1. [Server Preparation](#section-1-server-preparation)
2. [MQTT Broker Deployment](#section-2-mqtt-broker-deployment)
3. [InfluxDB Deployment](#section-3-influxdb-deployment)
4. [Backend Deployment](#section-4-backend-nodejs-deployment)
5. [InfluxDB Task Deployment](#section-5-influxdb-task-deployment)
6. [Frontend Deployment](#section-6-frontend-deployment)
7. [Startup & Boot Order](#section-7-startup--boot-order)
8. [Post-Deployment Verification](#section-8-post-deployment-verification)
9. [Security & Hardening](#section-9-security--hardening)
10. [Final Acceptance Check](#section-10-final-acceptance-check)

---

# SECTION 1: SERVER PREPARATION

## 1.1 OS Preparation [REQUIRED]

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget gnupg2 software-properties-common \
    apt-transport-https ca-certificates lsb-release git htop

# Set hostname
sudo hostnamectl set-hostname smart-energy-prod
```

## 1.2 Time Synchronization (NTP) [REQUIRED]

```bash
# Install chrony for accurate time
sudo apt install -y chrony

# Verify time sync
chronyc tracking

# Set timezone
sudo timedatectl set-timezone Asia/Bangkok
timedatectl status
```

**Expected Output:**
```
Time zone: Asia/Bangkok (ICT, +0700)
NTP synchronized: yes
```

## 1.3 Firewall Rules [REQUIRED]

```bash
# Enable UFW
sudo ufw enable

# Allow SSH (CRITICAL - do this first!)
sudo ufw allow ssh

# MQTT Broker
sudo ufw allow 1883/tcp comment "MQTT"
sudo ufw allow 9001/tcp comment "MQTT WebSocket"

# InfluxDB
sudo ufw allow 8086/tcp comment "InfluxDB"

# Backend API + WebSocket
sudo ufw allow 3001/tcp comment "Backend"

# Frontend (if serving directly)
sudo ufw allow 80/tcp comment "HTTP"
sudo ufw allow 443/tcp comment "HTTPS"

# Verify
sudo ufw status verbose
```

## 1.4 Required Ports Summary

| Port | Service | Protocol | Direction |
|------|---------|----------|-----------|
| 22 | SSH | TCP | Inbound |
| 80 | HTTP | TCP | Inbound |
| 443 | HTTPS | TCP | Inbound |
| 1883 | MQTT | TCP | Inbound |
| 9001 | MQTT-WS | TCP | Inbound |
| 3001 | Backend | TCP | Inbound |
| 8086 | InfluxDB | TCP | Inbound |

---

# SECTION 2: MQTT BROKER DEPLOYMENT

## 2.1 Install Mosquitto [REQUIRED]

```bash
# Install Mosquitto
sudo apt install -y mosquitto mosquitto-clients

# Verify installation
mosquitto -version
```

## 2.2 Configure Mosquitto [REQUIRED]

```bash
# Create configuration file
sudo tee /etc/mosquitto/conf.d/smart-energy.conf << 'EOF'
# === SMART Energy MQTT Configuration ===

# Standard MQTT listener
listener 1883
protocol mqtt

# WebSocket listener
listener 9001
protocol websockets

# Persistence (retain messages after restart)
persistence true
persistence_location /var/lib/mosquitto/

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type all

# Default QoS
max_inflight_messages 100
max_queued_messages 1000

# Connection settings
max_connections -1
EOF
```

## 2.3 Authentication Setup [REQUIRED for Production]

```bash
# Create password file
sudo mosquitto_passwd -c /etc/mosquitto/passwd mqtt_user
# Enter password when prompted

# Add to config
sudo tee -a /etc/mosquitto/conf.d/smart-energy.conf << 'EOF'

# Authentication
allow_anonymous false
password_file /etc/mosquitto/passwd
EOF

# Restart Mosquitto
sudo systemctl restart mosquitto
```

> ⚠️ **DANGEROUS**: If you skip authentication, anyone can publish to your broker!

## 2.4 Verification [REQUIRED]

```bash
# Check service status
sudo systemctl status mosquitto

# Test subscription (Terminal 1)
mosquitto_sub -h localhost -t 'test/topic' -u mqtt_user -P 'your_password'

# Test publish (Terminal 2)
mosquitto_pub -h localhost -t 'test/topic' -m 'Hello MQTT' -u mqtt_user -P 'your_password'
```

**Expected:** Message "Hello MQTT" appears in Terminal 1

---

# SECTION 3: INFLUXDB DEPLOYMENT

## 3.1 Install InfluxDB v2 [REQUIRED]

```bash
# Add InfluxDB repository
wget -qO- https://repos.influxdata.com/influxdata-archive_compat.key | \
    gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/influxdata-archive_compat.gpg > /dev/null

echo "deb [signed-by=/etc/apt/trusted.gpg.d/influxdata-archive_compat.gpg] \
    https://repos.influxdata.com/debian stable main" | \
    sudo tee /etc/apt/sources.list.d/influxdata.list

# Install
sudo apt update
sudo apt install -y influxdb2 influxdb2-cli

# Enable and start
sudo systemctl enable influxdb
sudo systemctl start influxdb
```

## 3.2 Initial Setup [REQUIRED]

```bash
# Setup via CLI
influx setup \
    --username admin \
    --password 'YourSecurePassword123!' \
    --org Ennergy \
    --bucket AI205_raw \
    --retention 720h \
    --force
```

> ⚠️ **IMPORTANT**: Save the token displayed! You will need it for backend.

## 3.3 Create Buckets [REQUIRED]

```bash
# Raw bucket (30 days retention)
influx bucket create --name AI205_raw --org Ennergy --retention 720h

# Aggregated buckets (infinite retention)
influx bucket create --name AI205_hourly --org Ennergy --retention 0
influx bucket create --name AI205_daily --org Ennergy --retention 0
influx bucket create --name AI205_weekly --org Ennergy --retention 0
influx bucket create --name AI205_monthly --org Ennergy --retention 0
influx bucket create --name AI205_yearly --org Ennergy --retention 0
```

## 3.4 Create Backend Token [REQUIRED]

```bash
# Create token with appropriate permissions
influx auth create \
    --org Ennergy \
    --description "smart-energy-backend" \
    --read-bucket AI205_raw \
    --write-bucket AI205_raw \
    --read-bucket AI205_hourly \
    --read-bucket AI205_daily \
    --read-bucket AI205_weekly \
    --read-bucket AI205_monthly \
    --read-bucket AI205_yearly
```

**Save this token securely!**

## 3.5 Health Check [REQUIRED]

```bash
curl http://localhost:8086/health
```

**Expected:**
```json
{"name":"influxdb","message":"ready for queries and writes","status":"pass"}
```

---

# SECTION 4: BACKEND (NODE.JS) DEPLOYMENT

## 4.1 Install Node.js [REQUIRED]

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Expected: v20.x.x
npm --version   # Expected: 10.x.x
```

## 4.2 Install PM2 [REQUIRED]

```bash
# Install PM2 globally
sudo npm install -g pm2

# Install log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## 4.3 Deploy Backend Code [REQUIRED]

```bash
# Create application directory
sudo mkdir -p /opt/smart-energy/backend
sudo chown -R $USER:$USER /opt/smart-energy

# Copy backend code (from your local machine)
# scp -r ./backend/* user@server:/opt/smart-energy/backend/

# Or clone from git
# git clone https://github.com/your-repo/smart-energy.git /opt/smart-energy

# Install dependencies
cd /opt/smart-energy/backend
npm install --production
```

## 4.4 Environment Variables [REQUIRED]

```bash
# Create .env file
cat > /opt/smart-energy/backend/.env << 'EOF'
# Server
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# MQTT
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_USERNAME=mqtt_user
MQTT_PASSWORD=your_mqtt_password
MQTT_TOPIC_DATA=+/data

# InfluxDB
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=YOUR_INFLUXDB_TOKEN_HERE
INFLUXDB_ORG=Ennergy
INFLUXDB_BUCKET_RAW=AI205_raw

# Timezone
TIMEZONE=Asia/Bangkok
EOF

# Secure the file
chmod 600 /opt/smart-energy/backend/.env
```

> ⚠️ **DANGEROUS**: Never commit .env to git!

## 4.5 PM2 Configuration [REQUIRED]

```bash
# Create ecosystem.config.js
cat > /opt/smart-energy/backend/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'smart-energy-backend',
    script: './src/index.js',
    cwd: '/opt/smart-energy/backend',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/opt/smart-energy/logs/error.log',
    out_file: '/opt/smart-energy/logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

# Create logs directory
mkdir -p /opt/smart-energy/logs
```

## 4.6 Start Backend [REQUIRED]

```bash
cd /opt/smart-energy/backend
pm2 start ecosystem.config.js
pm2 save
```

## 4.7 Auto-Start on Boot [REQUIRED]

```bash
# Generate startup script
pm2 startup systemd -u $USER --hp $HOME

# Follow the command output and run the provided command with sudo
# Example: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Save current processes
pm2 save
```

## 4.8 Verification [REQUIRED]

```bash
# Check PM2 status
pm2 status

# Check health endpoint
curl http://localhost:3001/health
```

**Expected:**
```json
{"status":"ok","mqtt":{"connected":true},"influxdb":{"connected":true}}
```

---

# SECTION 5: INFLUXDB TASK DEPLOYMENT

## 5.1 Create Flux Task Files [REQUIRED]

```bash
mkdir -p /opt/smart-energy/backend/flux_tasks
```

### 5.1.1 Hourly Task

```bash
cat > /opt/smart-energy/backend/flux_tasks/task_hourly.flux << 'EOF'
option task = {name: "aggregate_hourly", every: 1h, offset: 5m}

// Power metrics (mean)
from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active" or r._field == "power_factor" or r._field == "frequency")
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_hourly", org: "Ennergy")

// Energy (difference, handles meter reset)
from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_total")
  |> aggregateWindow(every: 1h, fn: last, createEmpty: false)
  |> difference(nonNegative: true)
  |> to(bucket: "AI205_hourly", org: "Ennergy")
EOF
```

### 5.1.2 Daily Task

```bash
cat > /opt/smart-energy/backend/flux_tasks/task_daily.flux << 'EOF'
option task = {name: "aggregate_daily", every: 1d, offset: 10m}

from(bucket: "AI205_raw")
  |> range(start: -1d)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active" or r._field == "power_factor")
  |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_daily", org: "Ennergy")

from(bucket: "AI205_raw")
  |> range(start: -1d)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_total")
  |> aggregateWindow(every: 1d, fn: last, createEmpty: false)
  |> difference(nonNegative: true)
  |> to(bucket: "AI205_daily", org: "Ennergy")
EOF
```

## 5.2 Deploy Tasks to InfluxDB [REQUIRED]

```bash
# Deploy each task
for f in /opt/smart-energy/backend/flux_tasks/*.flux; do
    echo "Deploying: $f"
    influx task create --org Ennergy --file "$f"
done
```

## 5.3 Verify Tasks [REQUIRED]

```bash
# List all tasks
influx task list --org Ennergy

# Check task logs
influx task log list --task-id <TASK_ID>
```

**Expected:** Tasks show status "active"

---

# SECTION 6: FRONTEND DEPLOYMENT

## 6.1 Build Frontend [REQUIRED]

```bash
# On your development machine
cd frontend
npm install
npm run build
```

## 6.2 Deploy to Server [REQUIRED]

```bash
# Copy build to server
scp -r build/* user@server:/opt/smart-energy/frontend/

# Or on server with nginx
sudo mkdir -p /var/www/smart-energy
sudo cp -r build/* /var/www/smart-energy/
```

## 6.3 Configure Nginx [REQUIRED]

```bash
sudo apt install -y nginx

sudo tee /etc/nginx/sites-available/smart-energy << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    
    root /var/www/smart-energy;
    index index.html;
    
    # React Router support
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket proxy
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/smart-energy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 6.4 Verification [REQUIRED]

```bash
# Check nginx
curl http://localhost

# Access in browser
# http://your-server-ip
```

---

# SECTION 7: STARTUP & BOOT ORDER

## 7.1 Correct Startup Sequence [REQUIRED]

```
1. InfluxDB (must be up before backend)
2. Mosquitto (should be up for MQTT data)
3. Backend (requires InfluxDB + MQTT)
4. Nginx (serves frontend)
```

## 7.2 Systemd Dependencies [OPTIONAL]

```bash
# Create backend service that waits for dependencies
sudo tee /etc/systemd/system/smart-energy-backend.service << 'EOF'
[Unit]
Description=SMART Energy Backend
After=network.target influxdb.service mosquitto.service
Wants=influxdb.service mosquitto.service

[Service]
Type=forking
User=ubuntu
WorkingDirectory=/opt/smart-energy/backend
ExecStart=/usr/bin/pm2 start ecosystem.config.js
ExecReload=/usr/bin/pm2 reload smart-energy-backend
ExecStop=/usr/bin/pm2 stop smart-energy-backend
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable smart-energy-backend
```

## 7.3 Verify Boot Order [REQUIRED]

```bash
# Reboot and verify
sudo reboot

# After reboot, check all services
systemctl status influxdb
systemctl status mosquitto
pm2 status
systemctl status nginx
```

---

# SECTION 8: POST-DEPLOYMENT VERIFICATION

## 8.1 End-to-End Data Flow [REQUIRED]

```bash
# 1. Publish test data to MQTT
mosquitto_pub -h localhost -t 'AI205/data' \
    -u mqtt_user -P 'password' \
    -m '{"V1":230,"I1":10,"power_active":2300,"energy_total":1000}'

# 2. Check backend received it
pm2 logs smart-energy-backend --lines 10

# 3. Query InfluxDB
influx query 'from(bucket: "AI205_raw") |> range(start: -1h) |> limit(n: 5)'
```

## 8.2 Realtime Validation [REQUIRED]

```bash
# Check WebSocket connection
curl -i -N \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    http://localhost:3001/
```

## 8.3 Historical Data Validation [REQUIRED]

```bash
# Wait for hourly task to run or trigger manually
influx task run retry --task-id <HOURLY_TASK_ID>

# Query aggregated data
influx query 'from(bucket: "AI205_hourly") |> range(start: -24h)'
```

## 8.4 Failure Simulation [REQUIRED]

```bash
# Test 1: Stop InfluxDB
sudo systemctl stop influxdb
# Backend should log errors but NOT crash
pm2 status

# Restart InfluxDB
sudo systemctl start influxdb

# Test 2: Restart backend
pm2 restart smart-energy-backend
# Should recover automatically
```

---

# SECTION 9: SECURITY & HARDENING

## 9.1 Secret Management [REQUIRED]

- [ ] InfluxDB token stored in `.env` (not in code)
- [ ] MQTT password in `.env`
- [ ] `.env` file has mode 600
- [ ] `.env` not in git

```bash
chmod 600 /opt/smart-energy/backend/.env
```

## 9.2 Token Scope Separation [REQUIRED]

| Token | Permissions |
|-------|-------------|
| Backend | Read/Write AI205_raw, Read aggregated |
| Admin | All buckets, Tasks, Users |
| Dashboard | Read-only |

## 9.3 Minimal Privileges [REQUIRED]

```bash
# Backend runs as non-root user
# Files owned by application user
sudo chown -R appuser:appuser /opt/smart-energy
```

## 9.4 SSL/TLS [RECOMMENDED]

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com
```

---

# SECTION 10: FINAL ACCEPTANCE CHECK

## 10.1 Deployment Checklist

| Item | Status |
|------|--------|
| **Infrastructure** | |
| [ ] UFW firewall enabled | |
| [ ] NTP synchronized | |
| [ ] Correct ports open | |
| **Services** | |
| [ ] Mosquitto running | |
| [ ] InfluxDB running | |
| [ ] Backend running | |
| [ ] Nginx running | |
| **Configuration** | |
| [ ] MQTT authentication | |
| [ ] InfluxDB token secured | |
| [ ] PM2 startup configured | |
| **Data Flow** | |
| [ ] ESP32 → MQTT works | |
| [ ] MQTT → Backend works | |
| [ ] Backend → InfluxDB works | |
| [ ] WebSocket works | |
| [ ] Flux tasks running | |
| **Recovery** | |
| [ ] Services restart on reboot | |
| [ ] Backend recovers from crash | |
| [ ] Logs accessible | |

## 10.2 Go / No-Go Decision

| Criteria | Required | Actual | Status |
|----------|----------|--------|--------|
| All services running | Yes | | |
| Data flows end-to-end | Yes | | |
| WebSocket connected | Yes | | |
| Tasks executing | Yes | | |
| Auto-restart works | Yes | | |
| Logs accessible | Yes | | |
| Secrets secured | Yes | | |

## 10.3 Final Commands

```bash
# Full system status check
echo "=== InfluxDB ===" && systemctl is-active influxdb
echo "=== Mosquitto ===" && systemctl is-active mosquitto
echo "=== Backend ===" && pm2 pid smart-energy-backend && echo "Running"
echo "=== Nginx ===" && systemctl is-active nginx
echo "=== Health ===" && curl -s http://localhost:3001/health
```

---

## APPROVAL

| Role | Name | Date | Signature |
|------|------|------|-----------|
| DevOps Engineer | | | |
| Project Manager | | | |

---

**DEPLOYMENT COMPLETE**

*Document Version: 1.0*  
*Last Updated: 2025-12-18*
