# Smart Energy Monitoring Dashboard

A modern real-time energy monitoring system with MQTT integration for AI205 energy meter devices.

## Project Structure

```
smart/
├── frontend/          # React + TypeScript Dashboard
│   ├── src/          # Source code
│   ├── public/       # Static assets
│   └── package.json  # Frontend dependencies
│
├── backend/          # Node.js API Server (Optional)
│   ├── src/          # API source code
│   └── package.json  # Backend dependencies
│
└── README.md         # This file
```

## Quick Start

### 1. Backend (Required - MQTT + WebSocket + API)

```bash
cd backend
npm install
cp .env.example .env
# แก้ไข .env ให้ถูกต้อง (MQTT credentials, InfluxDB config)
npm run dev
```

The backend will be available at `http://localhost:3001`

### 2. Frontend (React Dashboard)

```bash
cd frontend
npm install
npm start
```

The dashboard will be available at `http://localhost:3000`

**หมายเหตุ**: Backend ต้องทำงานก่อน Frontend จึงจะได้รับข้อมูล

## Features

### Backend (Node.js + Express)
- ✅ MQTT client integration (subscribe to AI205/* topics)
- ✅ InfluxDB integration (time-series data storage)
- ✅ WebSocket server (broadcast real-time data to clients)
- ✅ RESTful API endpoints (historical data, energy calculation)
- ✅ Energy calculation service (per-phase, combined, daily)
- ✅ Auto-reconnect and heartbeat monitoring
- ✅ Data normalization and processing

### Frontend Dashboard (React + TypeScript)
- ✅ Real-time energy monitoring (Voltage, Current, Power Factor)
- ✅ WebSocket client (connect to backend only)
- ✅ Interactive charts with Recharts
- ✅ Mini charts for quick data visualization
- ✅ Customizable Y-axis range for chart triggers
- ✅ Historical min/max tracking
- ✅ Responsive design with Tailwind CSS
- ✅ Time range selector (Real-time, 1H, 1D, 1W, 1M, MN)
- ✅ Mobile support (page visibility, persistent storage)

## Technology Stack

### Backend
- Node.js + Express.js
- MQTT.js (Node.js client) - เชื่อมต่อ MQTT broker
- InfluxDB Client - เก็บข้อมูล time-series
- WebSocket (ws) - ส่งข้อมูล real-time ไปยัง frontend
- CORS, dotenv

### Frontend
- React 19.x + TypeScript
- Tailwind CSS + Radix UI
- Recharts + Chart.js
- WebSocket Client - รับข้อมูลจาก backend
- date-fns, clsx

## Architecture

### Data Flow
```
AI205 Device → MQTT Broker → Backend (MQTT Client) → WebSocket → Frontend
```

**Backend** (Node.js):
- เชื่อมต่อ MQTT broker โดยตรง (port 1883)
- ประมวลผลและเก็บข้อมูลใน InfluxDB
- ส่งข้อมูลไปยัง Frontend ผ่าน WebSocket

**Frontend** (React):
- เชื่อมต่อ Backend ผ่าน WebSocket เท่านั้น
- **ไม่ได้เชื่อมต่อ MQTT โดยตรง**
- แสดงผลข้อมูลที่ได้รับจาก Backend

### MQTT Configuration (Backend Only)
- **Broker**: 202.29.50.41
- **Port**: 1883 (MQTT Protocol)
- **Topics**:
  - `AI205/data` - Energy data (V1/V2/V3, I1/I2/I3, PF1/PF2/PF3, etc.)
  - `AI205/alerts` - Alert messages
  - `AI205/status` - Device status

### Data Format (AI205/data)
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
  "Hz": 50.0,
  "Ep_imp": 125.6,
  "timestamp": "2025-10-07T10:00:00Z"
}
```

## Development

### Frontend Development
```bash
cd frontend
npm start          # Development server
npm run build      # Production build
npm test          # Run tests
```

### Backend Development
```bash
cd backend
npm run dev       # Development with nodemon
npm start         # Production mode
```

## Documentation

- [MQTT Integration Guide](MQTT_INTEGRATION.md)
- [Arduino Example](AI205_Arduino_Example.ino)

## License

This project is private and proprietary.
