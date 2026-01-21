# SmartEnergy - Product Specification Document

## 1. Product Overview

**Product Name:** SmartEnergy  
**Version:** 1.0  
**Purpose:** Real-time energy monitoring and management system for industrial and residential electrical installations.

SmartEnergy is a comprehensive energy monitoring platform that collects real-time data from ESP32-based power meters and displays it through an intuitive web dashboard. The system enables users to track energy consumption, costs, and electrical parameters across 3-phase power systems.

---

## 2. Target Users

| User Type | Description |
|-----------|-------------|
| **Facility Managers** | Monitor energy usage across buildings and equipment |
| **Plant Operators** | Track real-time electrical parameters for operational safety |
| **Energy Analysts** | Analyze consumption patterns and identify cost-saving opportunities |
| **Administrators** | Manage users, devices, and system configurations |

---

## 3. Core Features

### 3.1 Real-Time Dashboard
- **Customizable Grid Layout**: Drag-and-drop widget positioning with react-grid-layout
- **View Modes**: Default (read-only) and Custom (editable) layout modes
- **Responsive Design**: Adapts to desktop, tablet, and mobile screens
- **Dark/Light Theme**: User-selectable color schemes

### 3.2 Energy Monitoring Widgets

| Widget | Description |
|--------|-------------|
| **Energy Cost** | Displays current and historical electricity costs in THB |
| **Active Power** | Real-time power consumption gauge (kW) |
| **Voltage Monitor** | 3-phase voltage readings (L1, L2, L3) with trend charts |
| **Current Monitor** | 3-phase current readings with bar visualization |
| **Power Factor** | Circular gauges showing efficiency per phase |
| **Energy Accumulated** | Cumulative kWh usage over selected periods |
| **Statistics Panel** | Comparative analysis (vs yesterday, peak usage, trends) |

### 3.3 Data Visualization
- **Real-time Charts**: WebSocket-powered live updates
- **Historical Charts**: Recharts and ApexCharts for trend analysis
- **Date Range Picker**: Select custom time periods for analysis
- **Export Capabilities**: Data export for reporting

### 3.4 Device Management
- **Device Registration**: Register ESP32 power meters
- **Device Selector**: Switch between multiple monitored locations
- **Firmware Updates**: OTA firmware upload to ESP32 devices
- **Connection Status**: Real-time device connectivity indicators

### 3.5 User Management
- **Authentication**: JWT-based login with session management
- **Role-Based Access**: Admin and standard user roles
- **User CRUD**: Create, read, update, delete user accounts
- **Profile Management**: User profile editing with avatar support

### 3.6 Internationalization
- **Languages Supported**: English (EN), Thai (TH)
- **Localized Formats**: Date, time, and currency formatting per locale

---

## 4. Technical Architecture

### 4.1 Frontend Stack
```
React 18 + TypeScript + Vite
├── State Management: React Context API
├── Styling: TailwindCSS + Custom CSS
├── Charts: Recharts, ApexCharts
├── Layout: react-grid-layout
└── i18n: Custom LanguageContext
```

### 4.2 Backend Stack
```
Node.js + Express.js
├── Database: PostgreSQL (users, config)
├── Time-Series DB: InfluxDB (energy data)
├── Real-time: WebSocket (ws library)
└── Auth: JWT + bcrypt
```

### 4.3 Hardware Integration
```
ESP32 Power Meter
├── Protocol: HTTP POST to /api/ingest
├── Data: Voltage, Current, Power, Energy, PF
└── Updates: OTA firmware via HTTP
```

---

## 5. Data Flow

```
┌─────────────┐     HTTP POST      ┌─────────────┐
│   ESP32     │ ─────────────────► │   Backend   │
│ Power Meter │                    │  (Node.js)  │
└─────────────┘                    └──────┬──────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
             ┌───────────┐         ┌───────────┐         ┌───────────┐
             │ InfluxDB  │         │PostgreSQL │         │  WebSocket│
             │(Time Data)│         │  (Users)  │         │ (Realtime)│
             └───────────┘         └───────────┘         └─────┬─────┘
                                                               │
                                                               ▼
                                                        ┌───────────┐
                                                        │  Frontend │
                                                        │  (React)  │
                                                        └───────────┘
```

---

## 6. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| **Performance** | Dashboard load < 2 seconds, chart updates < 100ms |
| **Availability** | 99.5% uptime target |
| **Scalability** | Support up to 100 concurrent devices |
| **Security** | HTTPS, JWT tokens, password hashing |
| **Browser Support** | Chrome, Firefox, Safari, Edge (latest 2 versions) |
| **Mobile** | Responsive design for iOS/Android browsers |

---

## 7. API Endpoints Summary

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Energy Data
- `GET /api/summary/statistics` - Usage statistics
- `GET /api/summary/comparison` - Period comparison
- `GET /api/summary/peak` - Peak usage data
- `POST /api/ingest` - ESP32 data ingestion

### User Management
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Devices
- `GET /api/devices` - List devices
- `POST /api/devices/firmware` - Upload firmware

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Data accuracy | 99.9% match with physical meters |
| User satisfaction | > 4.0/5.0 rating |
| Adoption rate | 80% daily active users among registered |
| Cost reduction | 10-15% energy savings through awareness |

---

## 9. Future Roadmap

- [ ] AI-powered anomaly detection
- [ ] Predictive maintenance alerts
- [ ] Mobile native apps (iOS/Android)
- [ ] Multi-tenant SaaS deployment
- [ ] Integration with building management systems (BMS)
- [ ] Carbon footprint tracking and reporting

---

*Document Generated: 2026-01-21*  
*Version: 1.0*
