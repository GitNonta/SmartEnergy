# Firmware Update System Guide

## Overview

System untuk mengelola dan mendistribusikan firmware updates ke device ESP (AI205) melalui MQTT broker.

**Architecture:**
```
Frontend (Upload UI)
    ↓
Backend (Express + Multer)
    ├→ File validation & storage
    ├→ MQTT publish firmware info
    └→ HTTP serve .bin files
    
Device (ESP)
    ↓
MQTT Subscribe (AI205/firmware/info)
    ↓
HTTP GET /firmware/<filename>.bin
    ↓
OTA Update & Reboot
```

---

## Backend Setup

### 1. File Structure

```
backend/
├── src/
│   ├── index.js                    (main server)
│   └── services/
│       └── firmwareManager.js      (firmware handling)
├── firmware/                        (firmware storage)
│   ├── AI205_3.0.0.bin
│   ├── AI205_3.1.0.bin
│   └── ...
└── package.json
```

### 2. Environment Variables

Add to `.env`:

```env
# Firmware Configuration
MQTT_FW_TOPIC=AI205/firmware/info              # Topic untuk firmware info
FW_MAX_SIZE=4194304                             # 4MB max file size
FW_STORAGE_PATH=./firmware                      # Folder untuk simpan .bin files

# Existing configs (keep these)
MQTT_BROKER_HOST=202.29.50.41
MQTT_BROKER_PORT=1883
MQTT_PROTOCOL=mqtt
MQTT_USERNAME=s6710886217
MQTT_PASSWORD=nkey5632
```

### 3. Install Dependencies

```bash
cd backend
npm install multer
```

### 4. API Endpoints

#### **POST /api/firmware/upload**
Upload dan announce firmware baru

**Request:**
```bash
curl -X POST http://localhost:3001/api/firmware/upload \
  -F "firmware=@AI205_3.1.0.bin" \
  -F "version=3.1.0" \
  -F "notes=Bug fixes and performance improvements"
```

**Response:**
```json
{
  "ok": true,
  "message": "Firmware uploaded and published successfully",
  "info": {
    "device": "AI205",
    "version": "3.1.0",
    "filename": "1732550000_AI205_3.1.0.bin",
    "size": 1048576,
    "md5": "abc123def456...",
    "notes": "Bug fixes and performance improvements",
    "timestamp": "2025-11-26T10:33:20.000Z",
    "url": "/firmware/1732550000_AI205_3.1.0.bin",
    "originalName": "AI205_3.1.0.bin",
    "uploadedPath": "/firmware/1732550000_AI205_3.1.0.bin"
  }
}
```

---

#### **GET /api/firmware/list**
List semua firmware yang tersedia

**Response:**
```json
{
  "ok": true,
  "count": 2,
  "firmwares": [
    {
      "filename": "1732550000_AI205_3.1.0.bin",
      "size": 1048576,
      "md5": "abc123def456...",
      "uploadedAt": 1732550000000,
      "uploadedAtFormatted": "2025-11-26T10:33:20.000Z"
    },
    {
      "filename": "1732549900_AI205_3.0.0.bin",
      "size": 1024000,
      "md5": "xyz789uvw012...",
      "uploadedAt": 1732549900000,
      "uploadedAtFormatted": "2025-11-26T10:31:40.000Z"
    }
  ]
}
```

---

#### **GET /api/firmware/info/:filename**
Get info tentang specific firmware file

**Example:**
```bash
curl http://localhost:3001/api/firmware/info/1732550000_AI205_3.1.0.bin
```

**Response:**
```json
{
  "ok": true,
  "info": {
    "filename": "1732550000_AI205_3.1.0.bin",
    "size": 1048576,
    "md5": "abc123def456...",
    "uploadedAt": 1732550000000,
    "uploadedAtFormatted": "2025-11-26T10:33:20.000Z"
  }
}
```

---

#### **POST /api/firmware/announce/:filename**
Announce existing firmware ke devices via MQTT

**Request:**
```bash
curl -X POST http://localhost:3001/api/firmware/announce/1732550000_AI205_3.1.0.bin \
  -H "Content-Type: application/json" \
  -d '{
    "version": "3.1.0",
    "notes": "Critical security patches"
  }'
```

**Response:**
```json
{
  "ok": true,
  "message": "Firmware announcement published",
  "info": {
    "device": "AI205",
    "version": "3.1.0",
    "filename": "1732550000_AI205_3.1.0.bin",
    "size": 1048576,
    "md5": "abc123def456...",
    "notes": "Critical security patches",
    "timestamp": "2025-11-26T10:33:20.000Z",
    "url": "/firmware/1732550000_AI205_3.1.0.bin"
  }
}
```

---

#### **DELETE /api/firmware/:filename**
Delete firmware file

**Example:**
```bash
curl -X DELETE http://localhost:3001/api/firmware/1732550000_AI205_3.1.0.bin
```

**Response:**
```json
{
  "ok": true,
  "message": "Firmware 1732550000_AI205_3.1.0.bin deleted successfully"
}
```

---

#### **GET /firmware/:filename**
Serve firmware file (HTTP GET untuk OTA download)

**Example:**
```bash
curl -O http://localhost:3001/firmware/1732550000_AI205_3.1.0.bin
```

---

## Frontend Setup

### 1. Component Usage

Add Devices page dengan firmware manager:

```tsx
// In AppShell.tsx or Devices page routing
import DeviceFirmwareManager from './components/DeviceFirmwareManager';

<Route path="/devices" element={<DeviceFirmwareManager />} />
```

### 2. Features

- ✅ Upload new firmware (.bin files)
- ✅ List available firmware files with metadata
- ✅ Show connected devices (mock/real from WebSocket)
- ✅ Announce firmware to devices via MQTT
- ✅ Delete old firmware files
- ✅ Real-time upload progress
- ✅ Error handling and validation

### 3. File Requirements

- **Format:** .bin or .firmware
- **Max Size:** 4 MB
- **Checksum:** MD5 (auto-calculated)

---

## Device (ESP) Integration

### Arduino/ESP Code Example

```cpp
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <HTTPUpdate.h>

// MQTT topics
const char* fw_topic = "AI205/firmware/info";

// MQTT callback for firmware updates
void mqtt_callback(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, fw_topic) == 0) {
    // Parse firmware info JSON
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, payload);
    
    const char* url = doc["url"];
    const char* version = doc["version"];
    int size = doc["size"];
    
    Serial.printf("📢 New firmware available: %s (size: %d)\n", version, size);
    
    // Start OTA update
    performOTA(url);
  }
}

void performOTA(const char* url) {
  Serial.printf("🔄 Starting OTA update from: %s\n", url);
  
  WiFiClient client;
  t_httpUpdate_return ret = httpUpdate.update(client, url);
  
  switch(ret) {
    case HTTP_UPDATE_FAILED:
      Serial.printf("❌ OTA Update Failed: %s\n", httpUpdate.getLastErrorString().c_str());
      break;
    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("ℹ️  Already running the latest version");
      break;
    case HTTP_UPDATE_OK:
      Serial.println("✅ OTA Update completed successfully");
      // Device akan reboot otomatis
      break;
  }
}
```

---

## MQTT Message Format

**Topic:** `AI205/firmware/info`

**Payload:**
```json
{
  "device": "AI205",
  "version": "3.1.0",
  "filename": "1732550000_AI205_3.1.0.bin",
  "size": 1048576,
  "md5": "abc123def456...",
  "notes": "Bug fixes and improvements",
  "timestamp": "2025-11-26T10:33:20.000Z",
  "url": "http://192.168.1.100:3001/firmware/1732550000_AI205_3.1.0.bin"
}
```

**Note:** Message published dengan `retain: true` sehingga device baru yang connect otomatis dapat informasi firmware terbaru.

---

## Workflow

### Upload New Firmware

```
1. User upload .bin file via Frontend
2. Backend validate file (type, size)
3. Save to /backend/firmware/ folder
4. Calculate MD5 hash
5. Publish MQTT message (retain=true)
   └→ Devices subscribe dan download .bin via HTTP
6. Device performs OTA update
7. Device reboot
```

### Announce Existing Firmware

```
1. User select firmware dari list
2. Click "Announce" button
3. Enter version number
4. Backend publish MQTT message
   └→ All subscribed devices get notified
```

---

## Security Considerations

### File Upload Validation
- ✅ Whitelist file extensions (.bin, .firmware)
- ✅ Max file size limit (4MB)
- ✅ Sanitize filenames
- ✅ Virus/malware scan (recommended)

### MQTT Message Signing
```cpp
// Recommended untuk production:
// Sign firmware info dengan HMAC-SHA256
// Device verify signature sebelum download
```

### Secure HTTP Download
```env
# Enable HTTPS for firmware download (production)
USE_HTTPS=true
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

### Version Control
- ✅ Keep MD5 hash untuk verify
- ✅ Keep old firmware versions untuk rollback
- ✅ Log semua update attempts

---

## Testing

### Test Upload via curl

```bash
# Create dummy firmware file
dd if=/dev/zero of=test_firmware.bin bs=1024 count=100

# Upload
curl -X POST http://localhost:3001/api/firmware/upload \
  -F "firmware=@test_firmware.bin" \
  -F "version=3.1.0" \
  -F "notes=Test firmware"

# List firmware
curl http://localhost:3001/api/firmware/list

# Delete
curl -X DELETE http://localhost:3001/api/firmware/test_firmware.bin
```

### Test MQTT Subscription

```bash
# Subscribe to firmware topic
mosquitto_sub -h 202.29.50.41 -u s6710886217 -P nkey5632 -t "AI205/firmware/info"

# Upload firmware via UI atau curl
# Watch messages in subscriber
```

---

## Troubleshooting

### Issue: File upload fails with "Not found"
- **Check:** firmware directory exists at `backend/firmware/`
- **Fix:** Create directory manually if missing
  ```bash
  mkdir -p backend/firmware
  ```

### Issue: Device doesn't receive MQTT message
- **Check:** MQTT broker is running
- **Check:** Device subscribed to correct topic
- **Check:** Message published with `retain: true`
- **Fix:** Test with mosquitto_pub/sub

### Issue: Device can't download .bin file
- **Check:** HTTP server is running on port 3001
- **Check:** Firmware file exists in `/firmware/` directory
- **Check:** Firewall allows HTTP access
- **Fix:** Test with curl:
  ```bash
  curl -v http://192.168.1.100:3001/firmware/filename.bin
  ```

### Issue: MD5 checksum mismatch
- **Check:** File not corrupted during upload
- **Check:** Network connection stable
- **Fix:** Re-upload firmware

---

## Performance Notes

- **File storage:** 4MB per firmware × 10 versions = 40MB max
- **MQTT message size:** ~500 bytes (retained)
- **OTA bandwidth:** ~100 KB/s typical (depends on network)
- **Update time:** ~10-30 seconds per device

---

## Future Enhancements

1. **Rollback support** - Keep previous versions
2. **Staged rollout** - Update devices gradually
3. **Update status tracking** - Monitor device update progress
4. **Signature verification** - Sign firmware with private key
5. **Compression** - Compress .bin files with xz or brotli
6. **Delta updates** - Only send changed blocks
7. **Web dashboard** - Interactive firmware management UI
8. **Notifications** - Email/SMS on successful updates

---

## References

- [MQTT Protocol Specification](https://mqtt.org/)
- [ESP OTA Update Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/ota.html)
- [Express File Upload with Multer](https://github.com/expressjs/multer)
- [Device Firmware Update Best Practices](https://www.ota-update.com/)
