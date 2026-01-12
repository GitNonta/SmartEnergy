# Smart Energy Monitoring - Architecture

## ภาพรวมสถาปัตยกรรม

```
┌─────────────────────────────────────────────────────────────┐
│                      MQTT Broker                             │
│                   (202.29.50.41:1883)                        │
│                                                              │
│  Topics: AI205/data, AI205/alerts, AI205/status            │
└──────────────────────┬───────────────────────────────────────┘
                       │ MQTT Protocol
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend Server                            │
│                  (Node.js + Express)                         │
│                   localhost:3001                             │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  MQTT Client                                       │    │
│  │  - Subscribe to AI205/* topics                     │    │
│  │  - Receive real-time energy data                   │    │
│  │  - Process and normalize data                      │    │
│  └────────────┬───────────────────────────────────────┘    │
│               │                                              │
│               ▼                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  InfluxDB Service                                  │    │
│  │  - Write raw data (AI205_raw)                      │    │
│  │  - Write aggregated data (1h, 1d, 1m, MN)         │    │
│  │  - Query historical data                           │    │
│  │  - Calculate energy consumption                    │    │
│  └────────────┬───────────────────────────────────────┘    │
│               │                                              │
│               ▼                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  WebSocket Server                                  │    │
│  │  - Broadcast MQTT messages to clients              │    │
│  │  - Handle client commands                          │    │
│  │  - Auto-reconnect support                          │    │
│  │  - Heartbeat monitoring                            │    │
│  └────────────┬───────────────────────────────────────┘    │
│               │                                              │
│  ┌────────────┴───────────────────────────────────────┐    │
│  │  REST API                                          │    │
│  │  - /api/data/history                               │    │
│  │  - /api/data/downsampled                           │    │
│  │  - /api/energy/daily-realtime                      │    │
│  │  - /api/energy/summary                             │    │
│  └────────────────────────────────────────────────────┘    │
└──────────────────────┬───────────────────────────────────────┘
                       │ WebSocket (ws://localhost:3001)
                       │ HTTP REST API
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Frontend Dashboard                         │
│              (React + TypeScript + Tailwind)                 │
│                   localhost:3000                             │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  WebSocket Client                                  │    │
│  │  - Connect to backend WebSocket                    │    │
│  │  - Receive real-time data                          │    │
│  │  - Auto-reconnect on disconnect                    │    │
│  │  - Heartbeat ping/pong                             │    │
│  └────────────┬───────────────────────────────────────┘    │
│               │                                              │
│               ▼                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  WebSocketContext (React Context)                  │    │
│  │  - Manage connection state                         │    │
│  │  - Store energy data                               │    │
│  │  - Maintain history buffer (300 points)           │    │
│  │  - Handle alerts                                   │    │
│  └────────────┬───────────────────────────────────────┘    │
│               │                                              │
│               ▼                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  UI Components                                     │    │
│  │  - VoltageBlock, CurrentBlock                      │    │
│  │  - PowerFactorBlock, FrequencyBlock                │    │
│  │  - EnergyAccumulatedBlock                          │    │
│  │  - Charts (Recharts + Chart.js)                    │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    InfluxDB Database                         │
│                  (localhost:8086)                            │
│                                                              │
│  Buckets:                                                    │
│  - AI205_raw    (7 days retention)                          │
│  - AI205_1h     (30 days retention)                         │
│  - AI205_1d     (365 days retention)                        │
│  - AI205_1m     (5 years retention)                         │
│  - AI205_MN     (Permanent - billing)                       │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Real-time Data Flow (MQTT → Backend → Frontend)

```
AI205 Device
    │
    │ Publish MQTT message
    ▼
MQTT Broker (202.29.50.41:1883)
    │
    │ Topic: AI205/data
    ▼
Backend MQTT Client
    │
    ├─► InfluxDB (Write raw data)
    │
    └─► WebSocket Server (Broadcast to clients)
            │
            │ WebSocket message
            ▼
        Frontend WebSocket Client
            │
            ▼
        WebSocketContext
            │
            ▼
        UI Components (Display)
```

### 2. Historical Data Flow (Frontend → Backend → InfluxDB)

```
Frontend Component
    │
    │ HTTP GET /api/data/history?range=-1h
    ▼
Backend REST API
    │
    │ Query InfluxDB
    ▼
InfluxDB
    │
    │ Return time-series data
    ▼
Backend
    │
    │ JSON response
    ▼
Frontend Component (Display chart)
```

### 3. Energy Calculation Flow

```
Frontend Component
    │
    │ HTTP GET /api/energy/daily-realtime
    ▼
Backend Energy Calculation Service
    │
    │ Query power data from 00:00 to now
    ▼
InfluxDB (AI205_raw bucket)
    │
    │ Return power_active data points
    ▼
Backend (Trapezoidal Integration)
    │
    │ Calculate: Energy = ∫ Power × Time
    ▼
Frontend (Display kWh)
```

## Key Components

### Backend (Node.js)

**1. MQTT Client** (`backend/src/index.js`)
- เชื่อมต่อกับ MQTT broker
- Subscribe topics: AI205/data, AI205/alerts, AI205/status
- Normalize และ process ข้อมูล
- Broadcast ไปยัง WebSocket clients

**2. InfluxDB Service** (`backend/src/services/influxdb.js`)
- Write raw data (3-phase combined + per-phase)
- Query historical data
- Calculate daily energy consumption
- Support multiple buckets (raw, hourly, daily, monthly, billing)

**3. Energy Calculation Service** (`backend/src/services/energyCalculation.js`)
- Calculate energy per phase
- Calculate total energy from power integration
- Get energy from meter reading
- Calculate average power

**4. WebSocket Server** (`backend/src/index.js`)
- Broadcast MQTT messages to all connected clients
- Handle client commands
- Heartbeat monitoring (ping/pong)
- Auto-reconnect support

**5. REST API** (`backend/src/index.js`)
- `/health` - Health check
- `/api/data/history` - Historical data
- `/api/data/downsampled` - Downsampled data
- `/api/energy/daily-realtime` - Daily energy calculation
- `/api/energy/summary` - Energy summary

### Frontend (React + TypeScript)

**1. WebSocket Client** (`frontend/src/services/webSocketClient.ts`)
- Singleton pattern
- Auto-reconnect with exponential backoff
- Heartbeat monitoring
- Message type routing
- Page visibility handling (mobile support)

**2. WebSocketContext** (`frontend/src/context/WebSocketContext.tsx`)
- React Context for WebSocket state
- Store energy data
- Maintain history buffer (300 points, 1 second interval)
- Handle alerts
- Normalize incoming data

**3. UI Components** (`frontend/src/components/`)
- **VoltageBlock** - แสดงแรงดันไฟฟ้า 3 เฟส
- **CurrentBlock** - แสดงกระแสไฟฟ้า 3 เฟส
- **PowerFactorBlock** - แสดง Power Factor 3 เฟส
- **FrequencyBlock** - แสดงความถี่ไฟฟ้า
- **EnergyAccumulatedBlock** - แสดงพลังงานสะสม (รายวัน/รายเดือน/รายปี)
- **Charts** - แสดงกราฟแบบ real-time และ historical

## Configuration

### Backend Environment Variables (`.env`)

```bash
# MQTT Configuration
MQTT_BROKER_HOST=202.29.50.41
MQTT_BROKER_PORT=1883
MQTT_PROTOCOL=mqtt
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password

# Server Configuration
PORT=3001
HOST=0.0.0.0

# InfluxDB Configuration
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your_token
INFLUXDB_ORG=your_org
INFLUXDB_BUCKET_RAW=AI205_raw
```

### Frontend Environment Variables (`.env`)

```bash
# WebSocket Configuration
REACT_APP_WS_URL=ws://localhost:3001

# Application Settings
REACT_APP_AUTO_CONNECT=true
REACT_APP_HISTORY_RETENTION_HOURS=24
```

## Data Models

### MQTT Message Format (AI205/data)

```json
{
  "V1": 230.5,
  "V2": 229.8,
  "V3": 231.2,
  "I1": 15.2,
  "I2": 14.8,
  "I3": 15.6,
  "PF1": 0.92,
  "PF2": 0.89,
  "PF3": 0.94,
  "kWsum": 10.5,
  "kW1": 3.5,
  "kW2": 3.4,
  "kW3": 3.6,
  "Hz": 50.0,
  "Ep_imp": 125.6,
  "timestamp": "2025-10-07T10:00:00Z"
}
```

### WebSocket Message Format

```json
{
  "type": "mqtt_message",
  "messageType": "energy_data",
  "topic": "AI205/data",
  "data": {
    "V1": 230.5,
    "I1": 15.2,
    ...
  },
  "timestamp": "2025-10-07T10:00:00Z",
  "receivedAt": "2025-10-07T10:00:00.123Z"
}
```

### InfluxDB Data Model

**Measurement: energy_3phase** (Combined 3-phase data)
- Tags: device_id, location, measurement_type
- Fields: power_active (W), power_factor, frequency, energy_import, energy_export

**Measurement: energy_per_phase** (Per-phase data)
- Tags: device_id, phase (L1/L2/L3), location
- Fields: voltage (V), current (A), power_active (W), power_factor

## Security Considerations

1. **MQTT Authentication**: Username/password ใน environment variables
2. **CORS**: จำกัด origin ที่อนุญาต
3. **WebSocket**: ไม่มี authentication (ควรเพิ่มใน production)
4. **InfluxDB**: Token-based authentication
5. **Environment Variables**: ไม่ commit `.env` ไฟล์

## Performance Optimizations

1. **Frontend History Buffer**: จำกัด 300 จุด, sampling 1 วินาที
2. **InfluxDB Write**: Batch write, flush ทุก 50 points
3. **WebSocket Broadcast**: ส่งเฉพาะ clients ที่ connected
4. **Data Retention**: แยก buckets ตาม retention policy
5. **Mobile Support**: Page visibility handling, persistent storage

## Deployment

### Development
```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm start
```

### Production
```bash
# Install dependencies
npm run install:all

# Build frontend
npm run build

# Start with PM2
pm2 start ecosystem.config.js
```

## Monitoring

1. **Backend Health**: `GET /health`
2. **MQTT Status**: ตรวจสอบ connection status
3. **InfluxDB Status**: ตรวจสอบ write/query success rate
4. **WebSocket Clients**: จำนวน connected clients
5. **Logs**: Console logs (ควรใช้ logging library ใน production)

## Future Enhancements

1. **Authentication**: JWT-based authentication
2. **User Management**: Multi-user support
3. **Alerts**: Email/SMS notifications
4. **Downsampling**: Automatic data aggregation
5. **Backup**: Automated InfluxDB backup
6. **SSL/TLS**: Secure WebSocket (wss://)
7. **Load Balancing**: Multiple backend instances
8. **Caching**: Redis for frequently accessed data
