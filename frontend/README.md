## LAN Development & Hot Reload

To enable real-time HMR updates on other devices in the same network (accessing via `http://<your-ip>:3000`), the following setup is in place:

1. `.env.development.local` sets `HOST=0.0.0.0` so webpack dev server binds all interfaces.
2. Webpack Dev Server socket host forced with `WDS_SOCKET_HOST=<your-ip>` and `WDS_SOCKET_PORT=3000` for stable HMR over LAN.
3. Service Worker is NOT registered in development to prevent stale caching interfering with hot reload.

Run in PowerShell:

```powershell
npm start
```

Then access from another device: `http://10.224.54.79:3000` (replace with your machine's LAN IP).

Backend port synchronization:

Set `REACT_APP_API_PORT` in `.env.development.local` to match the backend `PORT` you start (e.g. 3101 to avoid collisions):

```powershell
set PORT=3101; cd ..\backend; npm run dev
```

Frontend will derive API base automatically: `http://<current-host>:<REACT_APP_API_PORT>` and WS: `ws://<current-host>:<REACT_APP_API_PORT>`.

If HMR doesn’t trigger:
* Ensure firewall allows inbound on TCP 3000.
* Confirm IP in `.env.development.local` matches current LAN IP.
* Restart `npm start` after changing env file.

Production builds continue to use the versioned service worker for cache busting.

# Smart Energy Monitoring - Frontend

React + TypeScript dashboard สำหรับแสดงผลข้อมูลพลังงานแบบ real-time

## Architecture

Frontend ทำหน้าที่ **แสดงผลเท่านั้น** โดยรับข้อมูลจาก Backend ผ่าน WebSocket

```
Backend (localhost:3001)
    │
    │ WebSocket
    ▼
Frontend WebSocket Client
    │
    ▼
WebSocketContext (React Context)
    │
    ▼
UI Components (Display)
```

## ไม่มีการเชื่อมต่อ MQTT โดยตรง

Frontend **ไม่ได้** เชื่อมต่อกับ MQTT broker โดยตรง แต่รับข้อมูลจาก Backend ผ่าน WebSocket แทน

### ข้อดี
- ✅ ลด load ที่ MQTT broker
- ✅ Backend ทำหน้าที่ process และ normalize ข้อมูล
- ✅ Frontend เบาและเร็วขึ้น
- ✅ ง่ายต่อการ scale (หลาย clients ต่อ backend เดียว)
- ✅ Security ดีขึ้น (MQTT credentials อยู่ที่ backend เท่านั้น)

## Installation

```bash
npm install
```

## Configuration

สร้างไฟล์ `.env` จาก `.env.example`:

```bash
cp .env.example .env
```

แก้ไข `.env`:

```bash
# WebSocket Configuration (เชื่อมต่อกับ Backend)
REACT_APP_WS_URL=ws://localhost:3001

# Application Settings
REACT_APP_AUTO_CONNECT=true
REACT_APP_HISTORY_RETENTION_HOURS=24
```

## Development

```bash
npm start
```

เปิดเบราว์เซอร์ที่ http://localhost:3000

## Build

```bash
npm run build
```

## Project Structure

```
frontend/
├── src/
│   ├── components/          # UI Components
│   │   ├── VoltageBlock.tsx
│   │   ├── CurrentBlock.tsx
│   │   ├── PowerFactorBlock.tsx
│   │   ├── FrequencyBlock.tsx
│   │   ├── EnergyAccumulatedBlock.tsx
│   │   └── charts/          # Chart components
│   │
│   ├── context/             # React Context
│   │   └── WebSocketContext.tsx  # WebSocket state management
│   │
│   ├── services/            # Services
│   │   ├── webSocketClient.ts    # WebSocket client (Singleton)
│   │   └── influxService.ts      # InfluxDB API calls
│   │
│   ├── features/            # Feature modules
│   │   └── dashboard/       # Dashboard page
│   │
│   ├── hooks/               # Custom hooks
│   ├── types/               # TypeScript types
│   ├── utils/               # Utility functions
│   │
│   ├── App.tsx              # Main app component
│   └── index.tsx            # Entry point
│
├── public/                  # Static files
├── .env                     # Environment variables (not committed)
├── .env.example             # Environment variables template
├── package.json
└── tsconfig.json
```

## Key Components

### 1. WebSocket Client (`services/webSocketClient.ts`)

Singleton class สำหรับจัดการ WebSocket connection:

```typescript
import webSocketClient from './services/webSocketClient';

// Connect
webSocketClient.connect({
  url: 'ws://localhost:3001',
  autoReconnect: true,
  heartbeat: true
});

// Listen to messages
webSocketClient.on('mqtt_message', (message) => {
  console.log('Received:', message);
});

// Send message
webSocketClient.send({ type: 'ping' });

// Disconnect
webSocketClient.disconnect();
```

Features:
- Auto-reconnect with exponential backoff
- Heartbeat monitoring (ping/pong)
- Message type routing
- Page visibility handling (mobile support)

### 2. WebSocketContext (`context/WebSocketContext.tsx`)

React Context สำหรับแชร์ WebSocket state:

```typescript
import { useWebSocket } from './context/WebSocketContext';

function MyComponent() {
  const {
    isConnected,
    connectionStatus,
    energyData,
    lastUpdate,
    history,
    connect,
    disconnect
  } = useWebSocket();

  return (
    <div>
      Status: {connectionStatus}
      Voltage L1: {energyData?.voltage.f1} V
    </div>
  );
}
```

Features:
- Connection state management
- Energy data storage
- History buffer (300 points, 1 second interval)
- Alert management
- Data normalization

### 3. UI Components

**VoltageBlock** - แสดงแรงดันไฟฟ้า 3 เฟส
```typescript
<VoltageBlock />
```

**CurrentBlock** - แสดงกระแสไฟฟ้า 3 เฟส
```typescript
<CurrentBlock />
```

**PowerFactorBlock** - แสดง Power Factor 3 เฟส
```typescript
<PowerFactorBlock />
```

**FrequencyBlock** - แสดงความถี่ไฟฟ้า
```typescript
<FrequencyBlock />
```

**EnergyAccumulatedBlock** - แสดงพลังงานสะสม
```typescript
<EnergyAccumulatedBlock />
```

## Data Flow

### Real-time Data

```
Backend WebSocket Server
    │
    │ Broadcast message
    ▼
webSocketClient.on('mqtt_message', ...)
    │
    ▼
WebSocketContext (update state)
    │
    ▼
UI Components (re-render)
```

### Historical Data

```
UI Component
    │
    │ HTTP GET /api/data/history
    ▼
Backend REST API
    │
    │ Query InfluxDB
    ▼
UI Component (display chart)
```

## WebSocket Message Types

### 1. Connection Status
```json
{
  "type": "mqtt_status",
  "status": "connected",
  "timestamp": "2025-10-07T10:00:00Z"
}
```

### 2. Energy Data
```json
{
  "type": "mqtt_message",
  "messageType": "energy_data",
  "topic": "AI205/data",
  "data": {
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
    "Hz": 50.0
  },
  "timestamp": "2025-10-07T10:00:00Z"
}
```

### 3. Alert
```json
{
  "type": "mqtt_message",
  "messageType": "alert",
  "topic": "AI205/alerts",
  "data": {
    "level": "warning",
    "message": "High voltage detected"
  },
  "timestamp": "2025-10-07T10:00:00Z"
}
```

### 4. Heartbeat
```json
// Client → Server
{ "type": "ping" }

// Server → Client
{ "type": "pong", "timestamp": "2025-10-07T10:00:00Z" }
```

## API Endpoints (Backend)

### Get Historical Data
```
GET /api/data/history?range=-1h&deviceId=AI205
```

### Get Downsampled Data
```
GET /api/data/downsampled?timeRange=1H&limit=1000
```

### Get Daily Energy
```
GET /api/energy/daily-realtime?deviceId=AI205
```

### Get Energy Summary
```
GET /api/energy/summary?timeRange=1H&deviceId=AI205
```

## Mobile Support

Frontend รองรับการใช้งานบนมือถือ:

1. **Responsive Design**: Tailwind CSS breakpoints
2. **Page Visibility**: Auto-reconnect เมื่อกลับมาที่หน้า app
3. **Persistent Storage**: Request persistent storage API
4. **Service Worker**: (Optional) สำหรับ offline support

## Performance Optimizations

1. **History Buffer**: จำกัด 300 จุด, sampling 1 วินาที
2. **React.memo**: Prevent unnecessary re-renders
3. **useMemo/useCallback**: Optimize expensive calculations
4. **Lazy Loading**: Code splitting with React.lazy
5. **Debounce**: User input handling

## Troubleshooting

### WebSocket ไม่เชื่อมต่อ

1. ตรวจสอบว่า Backend ทำงานที่ `localhost:3001`
2. ตรวจสอบ `.env` ว่า `REACT_APP_WS_URL` ถูกต้อง
3. เปิด Browser Console ดู error messages
4. ตรวจสอบ CORS settings ที่ Backend

### ไม่มีข้อมูลแสดง

1. ตรวจสอบว่า Backend เชื่อมต่อ MQTT broker สำเร็จ
2. ตรวจสอบว่า MQTT broker มีข้อมูลส่งมา
3. เปิด Network tab ดู WebSocket messages
4. ตรวจสอบ `energyData` ใน React DevTools

### Chart ไม่แสดง

1. ตรวจสอบว่ามี `history` data
2. ตรวจสอบ console errors
3. ตรวจสอบ chart library dependencies

## Testing

```bash
npm test
```

## Linting

```bash
npm run lint
```

## Type Checking

```bash
npx tsc --noEmit
```

## Dependencies

### Core
- React 19.x
- TypeScript 4.9.x
- React Scripts 5.x

### UI
- Tailwind CSS 3.x
- Radix UI (Dialog, Select, Tabs, etc.)
- Lucide React (Icons)

### Charts
- Recharts 3.x
- Chart.js 4.x
- React-Chartjs-2 5.x

### Utilities
- date-fns 4.x
- clsx 2.x
- tailwind-merge 3.x

## License

MIT
