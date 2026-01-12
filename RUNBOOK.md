# SMART Energy Monitoring System - Production Runbook

**Version:** 1.0  
**Updated:** 2025-12-18  
**Owner:** Operations Team

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Service Startup Order](#service-startup-order)
3. [Incident Response Procedures](#incident-response-procedures)
4. [Maintenance Procedures](#maintenance-procedures)
5. [Monitoring & Alerts](#monitoring--alerts)

---

## System Overview

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌──────────┐
│  ESP32  │───▶│  MQTT   │───▶│ Node.js │───▶│ InfluxDB │
│  AI205  │    │ Broker  │    │ Backend │    │ Database │
└─────────┘    └─────────┘    └────┬────┘    └──────────┘
                                   │
                                   ▼ WebSocket
                              ┌─────────┐
                              │Frontend │
                              │ React   │
                              └─────────┘
```

| Component | Port | Health Check |
|-----------|------|--------------|
| InfluxDB | 8086 | `GET /health` |
| Backend | 3001 | `GET /health` |
| Frontend | 3000 | HTTP 200 |
| MQTT | 1883 | TCP connect |

---

## Service Startup Order

**CRITICAL: Services MUST be started in this order:**

```
1. InfluxDB → 2. Backend → 3. Frontend
```

### Windows
```powershell
# Start InfluxDB (if local)
influxd

# Start Backend + Frontend
cd D:\smart
.\START_SYSTEM_AUTO.bat
```

### Linux
```bash
# Start InfluxDB
sudo systemctl start influxdb

# Start Backend
cd /opt/smart/backend && npm run dev &

# Start Frontend  
cd /opt/smart/frontend && npm start &
```

---

## Incident Response Procedures

### 🔴 INC-01: InfluxDB Disk Full

**Symptoms:**
- Write errors in backend logs: `disk full` or `out of space`
- Historical data not appearing
- Dashboard shows stale data

**Recovery Steps:**

```bash
# 1. Check disk space
df -h /var/lib/influxdb

# 2. Check bucket sizes
influx bucket list

# 3. Option A: Delete old data from raw bucket
influx delete \
  --bucket AI205_raw \
  --start 2024-01-01T00:00:00Z \
  --stop 2024-06-01T00:00:00Z

# 4. Option B: Reduce retention policy
influx bucket update \
  --name AI205_raw \
  --retention 7d

# 5. Force compaction
influxd inspect report-tsm --detailed /var/lib/influxdb/engine
```

**Prevention:**
- Set raw bucket retention to 30 days max
- Monitor disk usage (alert at 80%)

---

### 🔴 INC-02: Node.js Backend Crash

**Symptoms:**
- WebSocket disconnected on frontend
- No real-time data updates
- Backend health check fails

**Recovery Steps:**

```powershell
# Windows
# 1. Check if process exists
Get-Process node -ErrorAction SilentlyContinue

# 2. Kill orphan processes
taskkill /F /IM node.exe

# 3. Restart using script
cd D:\smart
.\START_SYSTEM_AUTO.bat
```

```bash
# Linux
# 1. Check process
pgrep -f "node.*backend"

# 2. Kill and restart
pkill -f "node.*backend"
cd /opt/smart/backend && npm run dev &
```

**Root Cause Investigation:**
```bash
# Check for memory leaks
node --inspect backend/src/index.js

# Check last error
tail -100 /var/log/smart-backend.log
```

---

### 🔴 INC-03: InfluxDB Task Failure

**Symptoms:**
- Aggregated buckets (hourly/daily) not updating
- Historical charts show gaps

**Recovery Steps:**

```bash
# 1. List tasks
influx task list

# 2. Check task status
influx task log list --task-id <TASK_ID>

# 3. Re-run failed task manually
influx task run retry --task-id <TASK_ID> --run-id <RUN_ID>

# 4. If task is disabled, enable it
influx task update --id <TASK_ID> --status active
```

**If tasks don't exist:**
```bash
# Deploy tasks from flux files
cd D:\smart\backend\flux_tasks
influx apply -f task_hourly.flux
influx apply -f task_daily.flux
influx apply -f task_weekly.flux
influx apply -f task_monthly.flux
influx apply -f task_yearly.flux
```

---

### 🔴 INC-04: MQTT Broker Outage

**Symptoms:**
- Backend logs: `MQTT connection lost`
- No new data from devices
- ESP32 status: disconnected

**Recovery Steps:**

```bash
# 1. Check MQTT broker (external: 202.29.50.41)
nc -zv 202.29.50.41 1883

# 2. Backend auto-reconnects every 5 seconds
# Just wait or restart backend

# 3. If broker is down, contact network team
# Escalation: network@company.com
```

**Node.js has auto-reconnect enabled:**
```javascript
// Configured in backend/src/index.js
reconnectPeriod: 5000  // Every 5 seconds
```

---

### 🟡 INC-05: Frontend Not Loading

**Symptoms:**
- Browser shows error or blank page
- Can't access http://localhost:3000

**Recovery Steps:**

```powershell
# 1. Check if frontend is running
netstat -ano | findstr :3000

# 2. Restart frontend
cd D:\smart\frontend
npm start

# 3. Clear browser cache and retry
# Ctrl+Shift+R in browser
```

---

## Maintenance Procedures

### Daily Checks
- [ ] Backend health: `GET http://localhost:3001/health`
- [ ] InfluxDB health: `GET http://localhost:8086/health`
- [ ] Check disk usage: `df -h` (Linux) or `wmic logicaldisk` (Windows)

### Weekly Checks
- [ ] Review InfluxDB task logs for failures
- [ ] Check aggregated bucket data is current
- [ ] Review backend error logs

### Monthly Checks
- [ ] Verify backup procedures
- [ ] Update dependencies: `npm audit fix`
- [ ] Review and rotate logs

---

## Monitoring & Alerts

### Health Check Endpoints

| Endpoint | Expected | Check Interval |
|----------|----------|----------------|
| `GET /health` (Backend) | `{"ok":true}` | 30s |
| `GET /health` (InfluxDB) | `{"status":"pass"}` | 60s |
| WebSocket | Connected | 30s |

### Key Metrics to Monitor

```bash
# Backend metrics endpoint
GET http://localhost:3001/api/system/metrics

# Returns:
# - mqttMetrics.messageCount
# - mqttMetrics.disconnectCount
# - influxMetrics.writeFailCount
# - influxMetrics.droppedPointsCount
```

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Disk Usage | 70% | 85% |
| MQTT Disconnects/hour | 3 | 10 |
| InfluxDB Write Failures | 5 | 20 |
| Backend Memory | 500MB | 800MB |

---

## Emergency Contacts

| Role | Contact |
|------|---------|
| On-Call Engineer | (Define) |
| InfluxDB Support | influxdata.com/support |
| Network Team | (Define) |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-18 | Ops Team | Initial runbook |
