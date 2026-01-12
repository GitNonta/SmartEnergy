# SMART Energy Monitoring - Production Deployment Guide

**Target:** Ubuntu 22.04 LTS  
**Version:** 2.0  
**Updated:** 2025-12-18

---

## 📋 Quick Start

```bash
# 1. Copy files to server
scp -r deploy/* user@server:/tmp/deploy/

# 2. SSH to server
ssh user@server

# 3. Run setup (once)
sudo /tmp/deploy/setup-server.sh

# 4. Copy your backend code
scp -r backend/* user@server:/opt/smart-energy/backend/

# 5. Initialize InfluxDB
/tmp/deploy/init-influxdb.sh

# 6. Deploy application
/tmp/deploy/deploy-app.sh
```

---

## 📁 Files Included

| File | Purpose |
|------|---------|
| `setup-server.sh` | Install Node.js, InfluxDB, Mosquitto, PM2, UFW |
| `init-influxdb.sh` | Create buckets and import Flux tasks |
| `deploy-app.sh` | Deploy code and start PM2 |
| `ecosystem.config.js` | PM2 process configuration |

---

## 🔧 Detailed Steps

### Step 1: Server Setup (Run Once)

```bash
sudo chmod +x setup-server.sh
sudo ./setup-server.sh
```

**Installed:**
- Node.js 20 LTS
- InfluxDB v2
- Mosquitto MQTT Broker (ports 1883, 9001)
- PM2 with log rotation
- UFW Firewall

### Step 2: InfluxDB Setup

Access InfluxDB UI and complete initial setup:
```
http://YOUR_IP:8086
```

Or run the initialization script:
```bash
chmod +x init-influxdb.sh
./init-influxdb.sh
```

**Buckets created:**
| Bucket | Retention |
|--------|-----------|
| AI205_raw | 30 days |
| AI205_hourly | Infinite |
| AI205_daily | Infinite |
| AI205_weekly | Infinite |
| AI205_monthly | Infinite |
| AI205_yearly | Infinite |

**Save the token!** You'll need it for `.env`

### Step 3: Deploy Backend

Copy your backend code:
```bash
scp -r backend/* user@server:/opt/smart-energy/backend/
```

Edit environment file:
```bash
nano /opt/smart-energy/backend/.env
```

Required settings:
```env
INFLUXDB_TOKEN=your_token_here
MQTT_BROKER_HOST=localhost  # or external broker IP
```

Run deployment:
```bash
chmod +x deploy-app.sh
./deploy-app.sh
```

### Step 4: Verify

```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs smart-energy-backend

# Health check
curl http://localhost:3001/health
```

---

## 🔒 Security Checklist

- [ ] Change default InfluxDB password
- [ ] Restrict MQTT anonymous access
- [ ] Add SSL/TLS for production
- [ ] Review UFW rules
- [ ] Set up fail2ban

---

## 🛠 Maintenance Commands

```bash
# Restart service
pm2 restart smart-energy-backend

# View logs (last 50 lines)
pm2 logs smart-energy-backend --lines 50

# Monitor resources
pm2 monit

# Update code and restart
cd /opt/smart-energy/backend
git pull origin main
npm install --production
pm2 restart smart-energy-backend
```

---

## 📊 Architecture

```
┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐
│  ESP32   │───▶│ Mosquitto │───▶│ Node.js  │───▶│ InfluxDB │
│  Device  │    │   :1883   │    │  :3001   │    │  :8086   │
└──────────┘    └───────────┘    └────┬─────┘    └──────────┘
                                      │
                                      ▼ WebSocket
                                 ┌─────────┐
                                 │ Browser │
                                 └─────────┘
```

---

## 🚨 Troubleshooting

### Backend won't start
```bash
pm2 logs smart-energy-backend --lines 100
```

### InfluxDB connection failed
```bash
curl http://localhost:8086/health
systemctl status influxdb
```

### MQTT not receiving data
```bash
# Test subscription
mosquitto_sub -h localhost -t '+/data' -v
```

### Port already in use
```bash
lsof -i :3001
kill -9 <PID>
```
