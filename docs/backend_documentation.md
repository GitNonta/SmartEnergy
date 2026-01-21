# SmartEnergy Backend Documentation

## 📋 Overview

SmartEnergy Backend เป็น Node.js + Express.js API Server สำหรับจัดการข้อมูลพลังงาน, การ Authentication, และการสื่อสาร Real-time กับ ESP32 Power Meters

**Tech Stack:**
- 🟢 Node.js + Express.js
- 🐘 PostgreSQL (Users, Config)
- 📊 InfluxDB (Time-Series Data)
- 🔌 WebSocket (Real-time)
- 🔐 JWT Authentication
- 📬 LINE Messaging API

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── server.js         # Main server (85KB)
│   ├── ingestor.js       # ESP32 data ingestion (11KB)
│   ├── routes/           # 11 API route files
│   ├── services/         # 15 business logic services
│   └── middleware/       # Auth middleware
├── bin/                  # Startup scripts
├── scripts/              # Utility scripts
├── flux_tasks/           # InfluxDB Flux queries
├── firmware/             # ESP32 firmware files
└── .env                  # Environment config
```

---

## 🛣️ Routes (11 files)

### Authentication & Users

| Route File | Base Path | Description | Size |
|------------|-----------|-------------|------|
| `authRoutes.js` | `/api/auth` | Login, Logout, Session | 11.6KB |
| `userRoutes.js` | `/api/users` | User CRUD | 11.7KB |
| `adminRoutes.js` | `/api/admin` | Admin functions | 8.8KB |

### Energy & Data

| Route File | Base Path | Description | Size |
|------------|-----------|-------------|------|
| `energyRoutes.js` | `/api/energy` | Energy data queries | 7.2KB |
| `summaryRoutes.js` | `/api/summary` | Statistics & Summary | 4.3KB |
| `dataRoutes.js` | `/api/data` | Raw data export | 2.2KB |

### Device & System

| Route File | Base Path | Description | Size |
|------------|-----------|-------------|------|
| `firmwareRoutes.js` | `/api/firmware` | OTA firmware upload | 3.6KB |
| `layoutRoutes.js` | `/api/layout` | Dashboard layout | 3.7KB |
| `notificationRoutes.js` | `/api/notifications` | Alert settings | 4.0KB |
| `chatRoutes.js` | `/api/chat` | AI Chat endpoints | 3.4KB |
| `index.js` | `/api` | Route aggregator | 4.2KB |

---

## 🔧 Services (15 files)

### Database Services

| Service | Description | Size |
|---------|-------------|------|
| `db.js` | PostgreSQL connection & queries | 14.1KB |
| `influxdb.js` | InfluxDB queries & writes | 75.7KB |
| `influxTasks.js` | Scheduled Flux tasks | 8.4KB |
| `downsampling.js` | Data downsampling | 3.7KB |

### Business Logic

| Service | Description | Size |
|---------|-------------|------|
| `userService.js` | User CRUD operations | 4.5KB |
| `sessionService.js` | Session management | 10.5KB |
| `layoutService.js` | Layout persistence | 5.0KB |
| `energyState.js` | Energy state machine | 10.9KB |
| `energyCalculation.js` | Cost calculations | 2.9KB |

### Device & Firmware

| Service | Description | Size |
|---------|-------------|------|
| `firmwareManager.js` | OTA update manager | 9.3KB |
| `compileService.js` | Arduino compile | 6.1KB |

### External Integrations

| Service | Description | Size |
|---------|-------------|------|
| `aiChatService.js` | ChatGPT/Gemini API | 23.3KB |
| `lineMessagingService.js` | LINE notifications | 12.4KB |
| `alertService.js` | Alert management | 10.5KB |
| `activityLogger.js` | Audit logging | 6.8KB |

---

## 🔐 Middleware (1 file)

| File | Description | Size |
|------|-------------|------|
| `auth.js` | JWT verification & RBAC | 3.0KB |

---

## 📡 API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` | User login, returns JWT |
| POST | `/logout` | Invalidate session |
| GET | `/me` | Get current user info |
| POST | `/refresh` | Refresh JWT token |
| POST | `/change-password` | Change password |

### Users (`/api/users`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all users (Admin) |
| GET | `/:id` | Get user by ID |
| POST | `/` | Create new user |
| PUT | `/:id` | Update user |
| DELETE | `/:id` | Delete user |
| PUT | `/:id/avatar` | Update avatar |

### Energy Data (`/api/energy`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/realtime` | Current power readings |
| GET | `/history` | Historical data |
| GET | `/hourly` | Hourly aggregation |
| GET | `/daily` | Daily aggregation |
| GET | `/cost` | Cost calculation |

### Summary (`/api/summary`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/statistics` | Usage statistics |
| GET | `/comparison` | Period comparison |
| GET | `/peak` | Peak usage data |

### Device (`/api/firmware`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/devices` | List devices |
| POST | `/upload` | Upload firmware |
| GET | `/download/:id` | Download firmware |

### Notifications (`/api/notifications`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/settings` | Get LINE settings |
| POST | `/settings` | Save LINE settings |
| POST | `/test` | Test notification |

---

## 🗄️ Database Schema

### PostgreSQL Tables

```sql
-- Users Table
users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE,
  email VARCHAR(100),
  password_hash VARCHAR(255),
  role VARCHAR(20),      -- 'admin' | 'user'
  avatar_url TEXT,
  created_at TIMESTAMP,
  last_login TIMESTAMP
)

-- Sessions Table
sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token VARCHAR(255),
  expires_at TIMESTAMP,
  ip_address VARCHAR(45)
)

-- Audit Logs Table
audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action VARCHAR(100),
  details JSONB,
  timestamp TIMESTAMP
)

-- Dashboard Layouts Table
dashboard_layouts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  layout JSONB,
  updated_at TIMESTAMP
)
```

### InfluxDB Measurements

| Measurement | Fields | Tags |
|-------------|--------|------|
| `energy_data` | voltage_l1, voltage_l2, voltage_l3, current_i1, current_i2, current_i3, power_active, power_factor, energy_kwh | device_id |
| `energy_hourly` | avg_power, total_kwh, cost | device_id |
| `energy_daily` | total_kwh, peak_power, cost | device_id |

---

## 🔌 WebSocket Events

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `energy_update` | `{voltage, current, power, pf, energy}` | Real-time data |
| `device_status` | `{deviceId, online, lastSeen}` | Device status |
| `alert` | `{type, message, severity}` | System alerts |

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe` | `{deviceId}` | Subscribe to device |
| `unsubscribe` | `{deviceId}` | Unsubscribe |

---

## ⚙️ Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `DATABASE_URL` | PostgreSQL URL | `postgresql://...` |
| `INFLUXDB_URL` | InfluxDB URL | `http://localhost:8086` |
| `INFLUXDB_TOKEN` | InfluxDB token | `xxx` |
| `INFLUXDB_ORG` | InfluxDB org | `smartenergy` |
| `INFLUXDB_BUCKET` | InfluxDB bucket | `energy` |
| `JWT_SECRET` | JWT signing key | `secret-key` |
| `JWT_EXPIRY` | Token expiry | `24h` |
| `LINE_CHANNEL_TOKEN` | LINE API token | `xxx` |
| `OPENAI_API_KEY` | ChatGPT API key | `sk-xxx` |
| `GEMINI_API_KEY` | Gemini API key | `xxx` |

---

## 🚀 Development

```bash
# Install dependencies
cd backend && npm install

# Start development server
npm run dev

# Start production server
npm start

# Start with PM2
pm2 start ecosystem.config.js
```

---

## 📊 Data Flow

```
┌─────────────┐     HTTP POST      ┌─────────────┐
│   ESP32     │ ─────────────────► │  ingestor.js│
│ Power Meter │                    │             │
└─────────────┘                    └──────┬──────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │  InfluxDB   │
                                   │  (influxdb.js)
                                   └──────┬──────┘
                                          │
                                          ▼
┌─────────────┐                    ┌─────────────┐
│  Frontend   │ ◄───WebSocket───── │  server.js  │
│   (React)   │                    │  (Express)  │
└─────────────┘                    └─────────────┘
```

---

## 📝 Flux Tasks (InfluxDB)

| Task File | Description |
|-----------|-------------|
| `hourly_aggregation.flux` | Hourly data rollup |
| `daily_aggregation.flux` | Daily data rollup |
| `monthly_aggregation.flux` | Monthly data rollup |
| `cleanup_old_data.flux` | Data retention cleanup |
| `downsampling.flux` | Data downsampling |

---

## 🔒 Security

- ✅ JWT Token Authentication
- ✅ Password hashing (bcrypt)
- ✅ Role-based access control (RBAC)
- ✅ Session management
- ✅ Rate limiting
- ✅ CORS configuration
- ✅ SQL injection prevention (parameterized queries)
- ✅ Audit logging

---

*Generated: 2026-01-21 | SmartEnergy v1.0*
