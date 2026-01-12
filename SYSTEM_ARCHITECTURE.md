# System Architecture & Startup Sequence

## 🔄 Correct Service Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                    STARTUP SEQUENCE                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1️⃣  InfluxDB (port 8086)                                   │
│      │                                                       │
│      │ ✅ Health check: /health returns 200 OK             │
│      │                                                       │
│      ▼                                                       │
│  2️⃣  Backend (port 3001)                                    │
│      │                                                       │
│      │ ✅ Connects to InfluxDB                              │
│      │ ✅ Connects to MQTT (202.29.50.41:1883)              │
│      │ ✅ Starts WebSocket server                           │
│      │ ✅ Exposes REST API endpoints                        │
│      │                                                       │
│      ▼                                                       │
│  3️⃣  Frontend (port 3000)                                   │
│      │                                                       │
│      │ ✅ Detects backend on port 3001                      │
│      │ ✅ Connects to WebSocket                             │
│      │ ✅ Fetches initial data                              │
│      │                                                       │
│      ▼                                                       │
│  ✅ SYSTEM READY                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## ❌ What Happened (Error State)

```
┌─────────────────────────────────────────────────────────────┐
│                    ACTUAL (BROKEN)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ❌ InfluxDB NOT RUNNING                                    │
│      │                                                       │
│      │                                                       │
│      ▼                                                       │
│  💥 Backend CRASHES                                         │
│      │                                                       │
│      │ ❌ ECONNREFUSED :8086                                │
│      │ 💀 Dies during downsampling init                     │
│      │                                                       │
│      │ Port 3001 remains FREE                               │
│      │                                                       │
│      ▼                                                       │
│  🔀 Frontend #1 (port 3000) ✅ OK                           │
│  🔀 Frontend #2 (port 3001) ⚠️  WRONG PORT!                │
│      │                                                       │
│      │ Frontend connects to ITSELF on 3001                  │
│      │ Requests: /api/energy/daily-realtime                 │
│      │ Response: HTML error "Cannot GET..."                 │
│      │                                                       │
│      ▼                                                       │
│  💥 ERROR: Expected JSON, got text/html                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Service Communication Flow (Normal Operation)

```
┌───────────┐         ┌──────────┐         ┌──────────┐
│  Browser  │◄───────►│ Frontend │◄───────►│ Backend  │
│           │         │  :3000   │         │  :3001   │
└───────────┘         └──────────┘         └─────┬────┘
                                                  │
                      HTTP REST API               │
                      WebSocket (real-time)       │
                                                  │
                         ┌────────────────────────┼────────────┐
                         │                        │            │
                         ▼                        ▼            ▼
                   ┌──────────┐          ┌──────────┐   ┌─────────┐
                   │ InfluxDB │          │   MQTT   │   │  ESP32  │
                   │  :8086   │          │  Broker  │   │ Device  │
                   └──────────┘          └──────────┘   └─────────┘
                   Time-series DB        202.29.50.41   AI205
```

## 🔌 Port Allocation

| Port | Service | Purpose | URL |
|------|---------|---------|-----|
| **3000** | Frontend | React Dev Server | http://localhost:3000 |
| **3001** | Backend | Express API + WebSocket | http://localhost:3001 |
| **8086** | InfluxDB | Time-series Database | http://localhost:8086 |
| **1883** | MQTT Broker | IoT Messages (external) | mqtt://202.29.50.41:1883 |

## 🛠️ Backend Dependencies

```
Backend (Node.js)
├── ✅ Express (HTTP server)
├── ✅ ws (WebSocket server)
├── ⚠️  MQTT client → External broker (202.29.50.41)
│   └── Topics: AI205/data, AI205/alerts, AI205/status, AI205/commands
├── ❌ InfluxDB client → LOCAL database (localhost:8086)
│   └── Buckets: raw (7d), hourly (30d), daily (365d), monthly (5y), billing (∞)
└── ⏰ Downsampling scheduler
    └── Runs every 60 minutes
    └── 💥 CRASHES if InfluxDB unreachable
```

## 📡 Data Flow (Real-time)

```
ESP32 Device (AI205)
     │ MQTT publish
     │ Topic: AI205/data
     │ Payload: {Voltage, Current, Power, Energy, ...}
     ▼
MQTT Broker (202.29.50.41:1883)
     │ MQTT subscribe
     ▼
Backend (MQTT Client)
     │ 1. Write to InfluxDB raw bucket
     │ 2. Broadcast to WebSocket clients
     ▼
Frontend (WebSocket Client)
     │ Receive real-time data
     │ Update charts & displays
     ▼
Browser (User)
     └── See live voltage, current, power, energy
```

## 🏗️ Backend API Endpoints

### Health & Status
- `GET /health` - System health check
- `GET /api/status` - Detailed status (WebSocket clients, uptime)

### Energy Calculations
- `GET /api/energy/daily-realtime?deviceId=AI205` - Daily energy (kWh)
- `GET /api/energy/monthly?deviceId=AI205` - Monthly summary
- `GET /api/energy/billing-period?deviceId=AI205` - Billing cycle data

### Historical Data
- `GET /api/data/history?range=-1h&deviceId=AI205` - Time-range query
- `GET /api/data/combined/latest?deviceId=AI205` - Latest reading
- `GET /api/data/statistics?range=-24h&deviceId=AI205` - Min/Max/Avg

### Downsampling
- `GET /api/downsampling/status` - Scheduler status
- `POST /api/downsampling/run` - Manual trigger

## 🐛 Common Error Scenarios

### 1. Backend Crashes on Startup
```
Error: listen EADDRINUSE: address already in use 0.0.0.0:3001
```
**Cause:** Another process on port 3001 (usually duplicate frontend)  
**Fix:** Kill all Node processes, start backend first

### 2. Backend Crashes During Init
```
AggregateError [ECONNREFUSED]: connect ECONNREFUSED 127.0.0.1:8086
```
**Cause:** InfluxDB not running  
**Fix:** Start InfluxDB before backend

### 3. Frontend Gets HTML Instead of JSON
```
Error: Expected JSON, got text/html; charset=utf-8
```
**Cause:** Frontend connecting to wrong server (itself or error page)  
**Fix:** Ensure backend is running on port 3001

### 4. WebSocket 1006 Abnormal Closure
```
WebSocket: Disconnected intentionally
```
**Cause:** Backend not reachable or crashed  
**Fix:** Check backend is running and healthy

## ✅ Health Check Commands

```powershell
# 1. Check InfluxDB
Invoke-WebRequest http://localhost:8086/health
# Expected: StatusCode 200

# 2. Check Backend
Invoke-WebRequest http://localhost:3001/health
# Expected: {"status":"ok","mqtt":{"connected":true},"influxdb":{"connected":true}}

# 3. Check Frontend
Invoke-WebRequest http://localhost:3000
# Expected: HTML with <!DOCTYPE html>

# 4. Check Ports
netstat -ano | findstr "LISTENING" | findstr ":3000"  # Frontend
netstat -ano | findstr "LISTENING" | findstr ":3001"  # Backend
netstat -ano | findstr "LISTENING" | findstr ":8086"  # InfluxDB

# 5. Run Full Test Suite
.\test-connections.ps1
# Expected: 🎉 ALL TESTS PASSED! System is healthy.
```

## 🔐 Security Notes

**Current State:** ⚠️  No authentication, no authorization, no input validation

**Risks Identified:**
- All endpoints publicly accessible
- No rate limiting
- No input sanitization
- CORS allows all origins in dev mode
- No HTTPS (development only)

**Recommended for Production:**
- Add API key authentication
- Implement rate limiting
- Validate all inputs
- Restrict CORS to specific domains
- Use HTTPS with valid certificates
- Add request logging
- Implement user roles

---

**Quick Reference:** If system won't start, always check in this order:
1. Is InfluxDB running? (`netstat -ano | findstr :8086`)
2. Is Backend healthy? (`Invoke-WebRequest http://localhost:3001/health`)
3. Is Frontend accessible? (Open http://localhost:3000 in browser)
