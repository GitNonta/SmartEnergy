# API Documentation

## 🔌 Base URL
```
http://localhost:3001
```

## 📡 Endpoints

### 1. Health Check
Check server and services status.

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "mqtt": {
    "connected": true,
    "topics": ["AI205/data", "AI205/alerts", "AI205/status", "AI205/commands"]
  },
  "websocket": {
    "connectedClients": 2
  },
  "influxdb": {
    "connected": true,
    "buckets": {
      "raw": "AI205_raw",
      "hourly": "AI205_hourly",
      "daily": "AI205_daily"
    }
  },
  "uptime": 1234.56,
  "timestamp": "2025-10-15T10:30:00.000Z"
}
```

---

### 2. System Status
Get detailed system status.

```http
GET /api/status
```

**Response:**
```json
{
  "mqtt": {
    "connected": true,
    "broker": "202.29.50.41:1883",
    "topics": {
      "data": "AI205/data",
      "alerts": "AI205/alerts",
      "status": "AI205/status",
      "commands": "AI205/commands"
    }
  },
  "websocket": {
    "port": 8080,
    "connectedClients": 2
  },
  "influxdb": {
    "url": "http://localhost:8086",
    "org": "Nontawat01",
    "buckets": {
      "raw": "AI205_raw",
      "hourly": "AI205_hourly",
      "daily": "AI205_daily"
    }
  },
  "timestamp": "2025-10-15T10:30:00.000Z"
}
```

---

### 3. Get Historical Data
Query historical energy data from InfluxDB.

```http
GET /api/data/history
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `range` | string | `-1h` | Time range (e.g., `-1h`, `-24h`, `-7d`, `-30d`) |
| `deviceId` | string | `AI205` | Device identifier |
| `fields` | string | (all) | Comma-separated field names |

**Examples:**
```bash
# Get last hour of all data
GET /api/data/history?range=-1h

# Get last 24 hours of specific fields
GET /api/data/history?range=-24h&fields=power_active,voltage_L1,current_L1

# Get last 7 days
GET /api/data/history?range=-7d&deviceId=AI205
```

**Response:**
```json
{
  "success": true,
  "count": 720,
  "range": "-1h",
  "deviceId": "AI205",
  "data": [
    {
      "timestamp": "2025-10-15T09:30:00.000Z",
      "voltage_L1": 220.5,
      "voltage_L2": 221.2,
      "voltage_L3": 219.8,
      "current_L1": 15.6,
      "current_L2": 14.8,
      "current_L3": 16.2,
      "power_active": 10.5,
      "power_factor": 0.976,
      "frequency": 50.02,
      "energy_import": 1234567.89
    },
    // ... more data points
  ]
}
```

---

### 4. Get Statistics
Get statistical aggregations for a specific field.

```http
GET /api/data/statistics
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `field` | string | `power_active` | Field name to analyze |
| `range` | string | `-24h` | Time range |
| `deviceId` | string | `AI205` | Device identifier |

**Examples:**
```bash
# Average power over last 24 hours
GET /api/data/statistics?field=power_active&range=-24h

# Voltage statistics for last week
GET /api/data/statistics?field=voltage_L1&range=-7d

# Current analysis for last month
GET /api/data/statistics?field=current_L1&range=-30d
```

**Response:**
```json
{
  "success": true,
  "field": "power_active",
  "range": "-24h",
  "deviceId": "AI205",
  "count": 24,
  "data": [
    {
      "timestamp": "2025-10-15T09:00:00.000Z",
      "value": 10.25
    },
    {
      "timestamp": "2025-10-15T10:00:00.000Z",
      "value": 11.30
    },
    // ... hourly averages
  ]
}
```

---

### 5. Get Recent Data
Get the most recent data points.

```http
GET /api/data/recent
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | `100` | Number of recent points to return |
| `deviceId` | string | `AI205` | Device identifier |

**Examples:**
```bash
# Get last 100 data points
GET /api/data/recent?limit=100

# Get last 500 data points
GET /api/data/recent?limit=500&deviceId=AI205
```

**Response:**
```json
{
  "success": true,
  "count": 100,
  "limit": 100,
  "data": [
    {
      "timestamp": "2025-10-15T10:29:50.000Z",
      "voltage_L1": 220.3,
      "current_L1": 15.4,
      "power_active": 10.2,
      // ... all fields
    },
    // ... last 100 points
  ]
}
```

---

### 6. Publish MQTT Message
Publish a message to MQTT broker (for testing).

```http
POST /api/mqtt/publish
```

**Request Body:**
```json
{
  "topic": "AI205/commands",
  "message": {
    "command": "reset",
    "timestamp": "2025-10-15T10:30:00.000Z"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "topic": "AI205/commands",
  "timestamp": "2025-10-15T10:30:00.000Z"
}
```

**Response (Error):**
```json
{
  "error": "Topic and message are required"
}
```

---

## 🔌 WebSocket Connection

### Connect
```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  console.log('Connected to WebSocket');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### Message Types

#### 1. Connection Established
```json
{
  "type": "connected",
  "message": "Connected to SMART Energy WebSocket Server",
  "mqttStatus": "connected",
  "timestamp": "2025-10-15T10:30:00.000Z"
}
```

#### 2. MQTT Status Update
```json
{
  "type": "mqtt_status",
  "status": "connected",
  "timestamp": "2025-10-15T10:30:00.000Z"
}
```

#### 3. Energy Data Message
```json
{
  "type": "mqtt_message",
  "messageType": "energy_data",
  "topic": "AI205/data",
  "data": {
    "V1": 220.5,
    "V2": 221.2,
    "V3": 219.8,
    "I1": 15.6,
    "I2": 14.8,
    "I3": 16.2,
    "kWsum": 10.5,
    "PFsys": 0.976,
    "Hz": 50.02,
    "Ep_imp": 1234567.89,
    "timestamp": 145586
  },
  "timestamp": "2025-10-15T10:30:00.000Z",
  "receivedAt": "2025-10-15T10:30:00.123Z"
}
```

#### 4. Alert Message
```json
{
  "type": "mqtt_message",
  "messageType": "alert",
  "topic": "AI205/alerts",
  "data": {
    "level": "warning",
    "message": "High temperature detected",
    "value": 45.5
  },
  "timestamp": "2025-10-15T10:30:00.000Z"
}
```

#### 5. Status Message
```json
{
  "type": "mqtt_message",
  "messageType": "status",
  "topic": "AI205/status",
  "data": {
    "ssid": "WiFi_Network",
    "ip": "192.168.1.100",
    "heap_free_kb": 125,
    "cpu_freq_mhz": 160,
    "uptime_sec": 143183
  },
  "timestamp": "2025-10-15T10:30:00.000Z"
}
```

---

## 📊 Data Fields Reference

### Voltage Fields
- `voltage_L1` / `V1` - Phase 1 voltage (V)
- `voltage_L2` / `V2` - Phase 2 voltage (V)
- `voltage_L3` / `V3` - Phase 3 voltage (V)

### Current Fields
- `current_L1` / `I1` - Phase 1 current (A)
- `current_L2` / `I2` - Phase 2 current (A)
- `current_L3` / `I3` - Phase 3 current (A)

### Power Fields
- `power_active` / `kWsum` - Total active power (kW)
- `power_active_L1` / `kW1` - Phase 1 active power (kW)
- `power_active_L2` / `kW2` - Phase 2 active power (kW)
- `power_active_L3` / `kW3` - Phase 3 active power (kW)

### Power Factor
- `power_factor` / `PFsys` - System power factor
- `power_factor_L1` / `PF1` - Phase 1 power factor
- `power_factor_L2` / `PF2` - Phase 2 power factor
- `power_factor_L3` / `PF3` - Phase 3 power factor

### Energy Fields
- `energy_import` / `Ep_imp` - Imported energy (kWh)
- `energy_export` / `Ep_exp` - Exported energy (kWh)
- `energy_total` / `Ep_total` - Total energy (kWh)
- `energy_net` / `Ep_net` - Net energy (kWh)

### Other Fields
- `frequency` / `Hz` - Frequency (Hz)
- `temperature` - Temperature (°C)

---

## 🔍 Time Range Examples

| Range | Description |
|-------|-------------|
| `-5m` | Last 5 minutes |
| `-15m` | Last 15 minutes |
| `-1h` | Last 1 hour |
| `-6h` | Last 6 hours |
| `-12h` | Last 12 hours |
| `-24h` | Last 24 hours |
| `-7d` | Last 7 days |
| `-30d` | Last 30 days |
| `-90d` | Last 90 days |

---

## ⚠️ Error Responses

### 400 Bad Request
```json
{
  "error": "Topic and message are required"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Database connection failed"
}
```

---

## 🔐 Security Notes

1. **CORS**: Configured to accept requests from `http://localhost:3000` (configurable via `FRONTEND_URL` env variable)
2. **Authentication**: Not implemented yet (add JWT tokens for production)
3. **Rate Limiting**: Not implemented yet (consider adding for production)

---

## 📝 Notes

- All timestamps are in ISO 8601 format (UTC)
- Power values are in kW (kilowatts)
- Energy values are in kWh (kilowatt-hours)
- Voltage values are in V (volts)
- Current values are in A (amperes)
- Frequency values are in Hz (hertz)
