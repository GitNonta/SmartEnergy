# SmartEnergy Frontend Documentation

## 📋 Overview

SmartEnergy Frontend เป็นแอปพลิเคชัน React + TypeScript สำหรับแสดงผลข้อมูลพลังงานแบบ Real-time ผ่าน WebSocket และ REST APIs

**Tech Stack:**
- ⚛️ React 18 + TypeScript
- ⚡ Vite (Build Tool)
- 🎨 TailwindCSS + Custom CSS
- 📊 Recharts + ApexCharts
- 📐 react-grid-layout
- 🌐 i18n (EN/TH)

---

## 📁 Project Structure

```
frontend/src/
├── components/     # 37 Reusable UI Components
├── context/        # 9 React Contexts (State Management)
├── hooks/          # 5 Custom Hooks
├── services/       # 8 API/WebSocket Services
├── features/       # 5 Feature Modules (Pages)
├── styles/         # CSS Modules & Themes
├── config/         # App Configuration
├── translations/   # i18n JSON Files
└── types/          # TypeScript Definitions
```

---

## 🧩 Components (37 files)

### Dashboard Widgets

| Component | Description | Size |
|-----------|-------------|------|
| `ActivePowerBlock.tsx` | Real-time power gauge (kW) | 6.7KB |
| `ActivePowerRealtimeChart.tsx` | Live power trend chart | 30.2KB |
| `VoltageBlock.tsx` | 3-phase voltage display | 15.6KB |
| `VoltageRealtimeChart.tsx` | Voltage analysis chart | 32.9KB |
| `CurrentBlock.tsx` | 3-phase current display | 12.6KB |
| `CurrentRealtimeChart.tsx` | Current analysis chart | 29.3KB |
| `PowerFactorBlock.tsx` | Circular PF gauges | 3.9KB |
| `EnergyCostBlock.tsx` | Cost display (THB) | 17.6KB |
| `EnergyCostHistoryChart.tsx` | Historical cost chart | 20.5KB |
| `EnergyAccumulatedBlock.tsx` | Cumulative kWh display | 26.7KB |
| `EnergyAccumulatedChart.tsx` | Accumulation chart | 23.7KB |
| `StatisticsBlock.tsx` | Comparison metrics | 21.4KB |
| `TimeRangeSummaryPanel.tsx` | Period summary | 17.3KB |
| `FrequencyBlock.tsx` | Frequency display | 7.0KB |
| `HourlyEnergyChart.tsx` | Hourly usage chart | 14.3KB |

### Layout & Navigation

| Component | Description | Size |
|-----------|-------------|------|
| `AppShell.tsx` | Main layout wrapper | 14.1KB |
| `MenuBar.tsx` | Navigation menu | 9.3KB |
| `EditModeToggle.tsx` | Dashboard edit mode | 2.9KB |
| `DeviceSelector.tsx` | Device dropdown | 1.9KB |
| `DateRangePicker.tsx` | Date range selector | 11.6KB |
| `LanguageSelector.tsx` | EN/TH switcher | 3.1KB |

### User & Auth

| Component | Description | Size |
|-----------|-------------|------|
| `ProfileModal.tsx` | User profile editor | 13.2KB |
| `UserMenuDropdown.tsx` | User menu | 7.5KB |
| `ProtectedRoute.tsx` | Auth guard | 2.3KB |
| `SessionWarningModal.tsx` | Session timeout | 3.0KB |

### Device & Admin

| Component | Description | Size |
|-----------|-------------|------|
| `DeviceFirmwareManager.tsx` | OTA firmware upload | 24.0KB |
| `FirmwareSftpUpload.tsx` | SFTP upload | 12.5KB |
| `MqttConnectionPanel.tsx` | MQTT settings | 6.3KB |
| `MqttDebugPanel.tsx` | MQTT debug tool | 12.7KB |
| `LineMessagingSettings.tsx` | LINE notification | 16.3KB |

### Misc

| Component | Description | Size |
|-----------|-------------|------|
| `ChatWidget.tsx` | AI chat interface | 10.5KB |
| `NotificationPopup.tsx` | Notification panel | 15.1KB |
| `InfluxErrorNotification.tsx` | Error alerts | 1.9KB |
| `UpdateBanner.tsx` | Update notification | 1.6KB |
| `UsageSummaryBlock.tsx` | Usage summary | 18.1KB |
| `CustomEnergyCard.tsx` | Custom card | 2.9KB |
| `TimeSelectorBlock.tsx` | Time selector | 0.9KB |

---

## 🔄 Contexts (9 files)

| Context | Description | Size |
|---------|-------------|------|
| `AuthContext.tsx` | JWT auth, login/logout | 11.2KB |
| `WebSocketContext.tsx` | Real-time data streaming | 17.3KB |
| `DashboardLayoutContext.tsx` | Grid layout state | 7.1KB |
| `InfluxContext.tsx` | InfluxDB data provider | 5.1KB |
| `LanguageContext.tsx` | i18n provider | 2.9KB |
| `TimeRangeContext.tsx` | Date range state | 4.7KB |
| `MqttContext.tsx` | MQTT connection state | 9.6KB |
| `ChatContext.tsx` | AI chat state | 4.2KB |
| `NavigationContext.tsx` | Navigation state | 0.01KB |

---

## 🪝 Custom Hooks (5 files)

| Hook | Description | Size |
|------|-------------|------|
| `useApi.ts` | API request wrapper | 5.8KB |
| `useEnergy.ts` | Energy data hook | 5.1KB |
| `useEnergyKPIs.ts` | KPI calculations | 2.6KB |
| `useHistoricalData.ts` | Historical data fetch | 7.6KB |
| `useVersion.ts` | App version check | 3.2KB |

---

## 🌐 Services (8 files)

| Service | Description | Size |
|---------|-------------|------|
| `webSocketClient.ts` | WebSocket connection | 11.7KB |
| `influxService.ts` | InfluxDB API calls | 12.5KB |
| `authService.ts` | Auth API calls | 2.8KB |
| `userService.ts` | User CRUD API | 6.1KB |
| `layoutService.ts` | Layout persistence | 2.5KB |
| `mqttConnection.ts` | MQTT broker | 9.5KB |
| `mqttService.ts` | MQTT messaging | 5.9KB |
| `aiService.ts` | AI/ChatGPT API | 9.6KB |

---

## 📄 Feature Modules (5 folders)

| Feature | Page | Description |
|---------|------|-------------|
| `dashboard/` | `DashboardPage.tsx` | Main monitoring dashboard |
| `auth/` | `LoginPage.tsx` | User login page |
| `admin/` | `UserManagement.tsx` | Admin user panel |
| `alerts/` | Alerts page | Alert management |
| `status/` | Status page | System status |

---

## 🎨 Styling

```
styles/
├── base/           # Reset, variables, theme
├── components/     # Component-specific CSS
│   └── blocks/     # Widget block styles
├── features/       # Feature page styles
└── responsive/     # Mobile, tablet, ultrawide
```

**Theme Support:** Light / Dark mode via `ThemeContext`

---

## 🌍 Internationalization

| Language | File | Status |
|----------|------|--------|
| English | `translations/en.json` | ✅ Complete |
| Thai | `translations/th.json` | ✅ Complete |

---

## ⚙️ Configuration

| File | Purpose |
|------|---------|
| `config/defaultDashboardLayout.ts` | Default widget positions |
| `config/api.ts` | API endpoints |
| `vite.config.ts` | Build configuration |

---

## 🚀 Development

```bash
# Install dependencies
cd frontend && npm install

# Start dev server (port 5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 📊 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        AppShell                             │
│  ┌─────────────┐  ┌─────────────────────────────────────┐   │
│  │  MenuBar    │  │         DashboardPage               │   │
│  │  ─────────  │  │  ┌─────────┐ ┌─────────┐ ┌───────┐  │   │
│  │  Dashboard  │  │  │ Energy  │ │ Active  │ │Voltage│  │   │
│  │  Admin      │  │  │  Cost   │ │ Power   │ │ Block │  │   │
│  │  Settings   │  │  └─────────┘ └─────────┘ └───────┘  │   │
│  │             │  │  ┌─────────┐ ┌─────────┐ ┌───────┐  │   │
│  │             │  │  │Current  │ │Power    │ │Stats  │  │   │
│  │             │  │  │ Block   │ │Factor   │ │Block  │  │   │
│  └─────────────┘  │  └─────────┘ └─────────┘ └───────┘  │   │
│                   └─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📈 Data Flow

```
ESP32 → Backend (WebSocket) → WebSocketContext → Components → UI
                ↓
         InfluxDB → influxService → useHistoricalData → Charts
```

---

*Generated: 2026-01-21 | SmartEnergy v1.0*
