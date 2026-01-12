# Backend

Smart Energy Monitoring Dashboard - Backend API Server

## Features

### 📡 Data Management
- Real-time MQTT data collection
- InfluxDB time-series storage
- Automatic data downsampling (hourly, daily, monthly)
- WebSocket real-time updates

### 🔋 Energy Monitoring
- Real-time power consumption tracking
- Energy calculation (Wh, kWh)
- Daily/monthly energy summaries
- Billing data management

### 📤 **Firmware Upload via SFTP** ⭐ NEW
- Upload firmware files to remote SFTP server
- Automatic old file deletion
- MD5 checksum verification
- MQTT notification to devices
- Real-time progress tracking
- Connection testing and file listing

## Prerequisites
- Node.js >= 16.x
- npm or yarn

## Installation

```bash
cd backend
npm install
```

## Environment Setup

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update the `.env` file with your configuration

### MQTT Configuration
```dotenv
MQTT_BROKER_HOST=192.168.137.157
MQTT_BROKER_PORT=1883
MQTT_USERNAME=Nontawat01
MQTT_PASSWORD=nkey5632
```

### SFTP Firmware Upload Configuration ⭐ NEW
```dotenv
SFTP_HOST=202.29.50.41
SFTP_PORT=22
SFTP_USER=s6710886217
SFTP_PASSWORD=nkey5632
SFTP_REMOTE_PATH=/home/s6710886217/public_html/firmware
MQTT_FW_TOPIC=AI205/firmware/info
```

### Downsampling Scheduler
Configure periodic aggregation of raw data into hourly/daily/monthly/billing buckets via ENV:

- `DOWNSAMPLING_ENABLED` (default: `true`) — enable/disable the scheduler
- `DOWNSAMPLING_INTERVAL_MINUTES` (default: `60`) — run interval in minutes

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The API will be available at `http://localhost:3001` and via LAN at `http://<your-ip>:3001`.

In development, CORS allows any origin for convenience. In production, configure allowed origins:

```bash
# Windows PowerShell example
set CORS_ORIGINS=http://localhost:3000,http://10.224.54.79:3000
```

## API Endpoints

### Health Check
```
GET /api/health
```

### Historical Data (raw)
```
GET /api/data/history?range=-1h&deviceId=AI205&fields=power_active
```

### Downsampled Bucket Data
Query directly from aggregated buckets (raw|1h|1d|1m|mn):
```
GET /api/data/bucket?bucket=1d&range=-7d&deviceId=AI205&type=combined
GET /api/data/bucket?bucket=1h&range=-1d&deviceId=AI205&type=per_phase&phase=L1
```

### Firmware Management ⭐ NEW

**Upload Firmware to SFTP**
```
POST /api/firmware/upload-sftp
```
Upload firmware file, delete old files, and notify devices

**Publish Existing Firmware**
```
POST /api/firmware/sftp/publish/:filename
```
Publish local firmware file to SFTP server

**Test SFTP Connection**
```
GET /api/firmware/sftp/test
```

**List Remote Firmware Files**
```
GET /api/firmware/sftp/list
```

**See:** `SFTP_FIRMWARE_API.md` for complete API documentation

## 📚 Documentation

### Firmware Upload System ⭐ NEW
- **`SFTP_FIRMWARE_README.md`** - Backend SFTP system overview
- **`SFTP_FIRMWARE_API.md`** - Complete API documentation
- **`SFTP_FIRMWARE_QUICK_START.md`** - Quick start guide with examples
- **`SFTP_FIRMWARE_TESTING.md`** - Testing guide and scripts
- **`SFTP_ARCHITECTURE.md`** - Architecture and design details
- **`SFTP_FIRMWARE_IMPLEMENTATION_SUMMARY.md`** - Implementation summary
- **`CHANGELOG_SFTP_FIRMWARE.md`** - Release notes and changes

### Other Documentation
- **`API_DOCUMENTATION.md`** - Complete API documentation
- **`ENERGY_CALCULATION.md`** - Energy calculation methodology
- **`DOWNSAMPLING_GUIDE.md`** - Data downsampling configuration

## Project Structure

```
backend/
├── src/
│   ├── index.js                      # Main server file
│   └── services/
│       ├── firmwareManager.js        # Local firmware management
│       ├── sftpFirmwareManager.js    # SFTP firmware upload ⭐ NEW
│       ├── influxdb.js              # InfluxDB service
│       ├── energyCalculation.js     # Energy calculation
│       └── downsampling.js          # Data aggregation
├── firmware/                         # Local firmware storage
├── logs/                            # Application logs
├── .env                             # Configuration file
├── .env.example                     # Configuration template
├── package.json                     # Dependencies
├── SFTP_FIRMWARE_README.md          # ⭐ NEW
├── SFTP_FIRMWARE_API.md             # ⭐ NEW
├── SFTP_FIRMWARE_QUICK_START.md     # ⭐ NEW
├── SFTP_FIRMWARE_TESTING.md         # ⭐ NEW
├── SFTP_ARCHITECTURE.md             # ⭐ NEW
├── SFTP_FIRMWARE_IMPLEMENTATION_SUMMARY.md  # ⭐ NEW
├── CHANGELOG_SFTP_FIRMWARE.md       # ⭐ NEW
├── upload-firmware.bat              # ⭐ NEW (Windows)
├── upload-firmware.sh               # ⭐ NEW (Linux/macOS)
└── README.md                        # This file
```

## Quick Start - Firmware Upload ⭐ NEW

### 1. Test Connection
```bash
curl http://localhost:3001/api/firmware/sftp/test
```

### 2. Upload Firmware
```bash
curl -X POST http://localhost:3001/api/firmware/upload-sftp \
  -F "firmware=@firmware.bin" \
  -F "version=3.1.0" \
  -F "notes=Bug fix release"
```

### 3. Monitor MQTT
```bash
mosquitto_sub -h 192.168.137.157 -u Nontawat01 -P nkey5632 \
  -t "AI205/firmware/info" -v
```

### 4. Windows Upload Script
```bash
upload-firmware.bat firmware.bin 3.1.0 "Release notes"
```

### 5. Linux/macOS Upload Script
```bash
./upload-firmware.sh firmware.bin 3.1.0 "Release notes"
```

See `SFTP_FIRMWARE_QUICK_START.md` for detailed examples.

## Future Enhancements

- [ ] Implement MQTT message broker integration
- [ ] Add database support (PostgreSQL/MongoDB)
- [ ] Create RESTful API endpoints for energy data
- [ ] Add authentication and authorization
- [ ] Implement data logging and analytics
- [ ] Add WebSocket support for real-time updates
- [ ] **Firmware signing and verification**
- [ ] **Version history tracking**
- [ ] **Scheduled firmware updates**
- [ ] **Firmware rollback capability**

## Support & Troubleshooting

### Firmware Upload Issues
See `SFTP_FIRMWARE_TESTING.md` for detailed troubleshooting.

**Quick Tests:**
```bash
# Test SFTP connection
curl http://localhost:3001/api/firmware/sftp/test

# List remote files
curl http://localhost:3001/api/firmware/sftp/list

# Check backend logs
npm run dev
```

### Common Issues
1. **SFTP Connection Fails** → Check SFTP_HOST and credentials in .env
2. **File Upload Timeout** → Check file size and network
3. **MQTT Not Receiving** → Verify MQTT broker and topic name
4. **Permission Denied** → Check SFTP directory permissions

---

**Last Updated:** December 9, 2025
**Status:** ✅ Production Ready

