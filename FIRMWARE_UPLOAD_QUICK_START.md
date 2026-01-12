# 🚀 Firmware SFTP Upload - Quick Start Guide

## Overview

The firmware upload system now uses a new SFTP server (192.168.137.157:8022) instead of the old server (202.29.50.41). All old code has been removed and the system is fully integrated into the frontend UI.

---

## Starting the System

### 1. Backend Setup
```bash
cd d:\smart\backend
npm install ssh2  # Only needed if not already installed
npm start
```

Expected output:
```
✅ Server running on port 3001
✅ WebSocket server initialized
✅ InfluxDB connected
✅ Firmware Manager initialized
```

### 2. Frontend Setup
```bash
cd d:\smart\frontend
npm start
```

Expected output:
```
Compiled successfully!
Local: http://localhost:3000
```

---

## Using the Firmware Upload Feature

### Method 1: Web Interface (Recommended)

1. **Open Frontend**
   - Go to: http://localhost:3000

2. **Navigate to Firmware Upload**
   - Click menu item: **"Firmware Upload"**
   - Or visit directly: http://localhost:3000/firmware-sftp

3. **Upload Firmware**
   - Click **"Click to select firmware file"**
   - Choose a **.bin file** (max 4MB)
   - Enter **firmware version** (e.g., "3.1.0")
   - Add **release notes** (optional)
   - Click **"Upload to SFTP"**

4. **Monitor Progress**
   - See progress bar during upload
   - Get success/error notification
   - Form clears automatically after 3 seconds

### Method 2: Manual Script (Advanced)

For testing or automation:

```bash
node d:\smart\sftp-firmware-upload.js
```

This runs standalone SFTP operations without the backend API.

---

## Configuration

### SFTP Server Details
```
Host: 192.168.137.157
Port: 8022
User: u0_a175
Password: Nontawat01
Remote Path: ./Firmware (relative to home directory)
```

### Environment Variables (.env)
```
SFTP_HOST=192.168.137.157
SFTP_PORT=8022
SFTP_USER=u0_a175
SFTP_PASSWORD=Nontawat01
SFTP_REMOTE_PATH=/Firmware
MQTT_BROKER=192.168.137.157
MQTT_PORT=1883
MQTT_FW_TOPIC=AI205/firmware/info
```

---

## Understanding the Upload Flow

```
Frontend Upload Form
        ↓
User selects .bin file + version + notes
        ↓
POST /api/firmware/upload-sftp-v2
        ↓
Backend validates file
        ↓
Spawn Node.js SFTP script (background process)
        ↓
Script connects to 192.168.137.157:8022
        ↓
Authenticate and upload to ./Firmware directory
        ↓
Delete old .bin files automatically
        ↓
Calculate MD5 hash for verification
        ↓
Return acknowledgment to frontend
        ↓
Display success message to user
        ↓
WebSocket notifies all connected clients
```

---

## File Locations

### Backend
```
d:\smart\backend\
├── src\
│   ├── index.js (main server, POST endpoint)
│   └── services\
│       └── firmwareManager.js (local file handling)
├── firmware\ (local firmware storage)
└── logs\
```

### Frontend
```
d:\smart\frontend\
├── src\
│   ├── App.tsx (route configuration)
│   ├── components\
│   │   ├── MenuBar.tsx (menu integration)
│   │   └── FirmwareSftpUpload.tsx (upload component)
│   └── context\
│       └── WebSocketContext.tsx (real-time updates)
└── public\
```

### Scripts
```
d:\smart\
├── sftp-firmware-upload.js (standalone SFTP operations)
└── .env (configuration)
```

---

## Troubleshooting

### Issue: "Cannot find module 'ssh2'"
**Solution:**
```bash
cd d:\smart\backend
npm install ssh2
```

### Issue: "Connection refused" to SFTP server
**Solutions:**
- Check SFTP server is running: `ping 192.168.137.157`
- Verify port 8022 is open: `Test-NetConnection 192.168.137.157 -Port 8022`
- Check .env credentials are correct

### Issue: "Permission denied" for /Firmware directory
**Solutions:**
- SSH to server and check permissions:
  ```bash
  ssh u0_a175@192.168.137.157 -p 8022
  ls -la /home/u0_a175/
  chmod 755 /home/u0_a175/Firmware
  ```

### Issue: Upload hangs or takes too long
**Solutions:**
- Check network connectivity
- Verify file size < 4MB
- Check backend logs for errors
- Restart backend if needed

### Issue: File uploaded but not showing on SFTP server
**Solutions:**
- SSH to server and check:
  ```bash
  sftp u0_a175@192.168.137.157 -P 8022
  cd Firmware
  ls -la
  ```

### Issue: Old .bin files not being deleted
**Solutions:**
- Check SFTP user has write permission
- Verify script is finding files correctly
- Check backend logs: `tail -f d:\smart\backend\logs\*`

---

## Testing the System

### Test 1: File Validation
```bash
# Valid file (should succeed)
- Name: AI205_v3.1.0.bin
- Size: 2MB
- Version: 3.1.0

# Invalid files (should fail)
- Name: firmware.txt (wrong extension)
- Name: huge.bin (> 4MB, too large)
- Version field: empty (required)
```

### Test 2: SFTP Connection
```bash
# Run script directly
node d:\smart\sftp-firmware-upload.js

# Expected output:
# ✅ SSH Connection established
# ✅ SFTP subsystem initialized
# 📁 Creating directory ./Firmware...
# 📤 Uploading firmware...
# ✅ Upload complete!
```

### Test 3: WebSocket Updates
```bash
# Open browser DevTools Console
# You should see messages like:
# firmware-sftp-upload-started
# firmware-sftp-upload-success
```

---

## Monitoring

### Check Backend Logs
```bash
# Windows PowerShell
Get-Content d:\smart\backend\logs\* -Tail 20

# Or real-time monitoring
tail -f d:\smart\backend\logs\*
```

### WebSocket Connections
```bash
# In browser DevTools Console
# Look for messages when uploads start/complete
# Format: {"type":"firmware-sftp-upload-started",...}
```

### SFTP Server Files
```bash
# SSH to server
ssh u0_a175@192.168.137.157 -p 8022

# Check uploaded files
ls -lah ./Firmware/
```

---

## API Reference

### Upload Endpoint

```http
POST /api/firmware/upload-sftp-v2

Content-Type: multipart/form-data

Body:
  - firmware: File (.bin, max 4MB)
  - version: String (required)
  - notes: String (optional)

Example Response (Success):
{
  "ok": true,
  "message": "Firmware upload to SFTP initiated",
  "file": {
    "filename": "AI205_v3.1.0.bin",
    "originalName": "AI205_v3.1.0.bin",
    "size": 2097152,
    "version": "3.1.0",
    "notes": "Bug fixes",
    "localPath": "/firmware/AI205_v3.1.0.bin",
    "uploadStarted": "2024-01-20T10:30:00.000Z"
  }
}

Example Response (Error):
{
  "error": "File size exceeds 4MB limit"
}
```

---

## Performance Expectations

| Operation | Duration | Notes |
|-----------|----------|-------|
| File validation | < 100ms | Local check |
| API endpoint response | < 500ms | Immediate return |
| SFTP upload (2MB) | 2-5 seconds | Network dependent |
| Old file cleanup | < 1 second | Automatic |
| MD5 verification | < 1 second | Automatic |
| Total time to completion | 3-7 seconds | Backend process |

---

## Security Notes

⚠️ **Important**:
- SSH2 credentials stored in .env file
- Use strong password for SFTP account
- Restrict access to SFTP server with firewall
- Enable SSH key-based authentication when possible
- Rotate SFTP credentials regularly

---

## Rollback to Old System

If you need to restore the old SFTP system:

```bash
# Restore old files from git
git checkout backend/src/services/sftpFirmwareManager.js
git checkout backend/src/index.js
git checkout frontend/src/App.tsx
git checkout frontend/src/components/MenuBar.tsx

# Restart backend
npm start
```

---

## Support

### Common Questions

**Q: How do I know if the upload succeeded?**  
A: You'll see a green success message and the file appears in the form's localPath URL.

**Q: Can I upload multiple files at once?**  
A: No, upload one file at a time. Form clears after each upload.

**Q: What happens to old firmware files?**  
A: They're automatically deleted from the remote SFTP server during upload.

**Q: Is the upload secure?**  
A: Yes, uses SSH2 encryption. Credentials stored securely in .env.

**Q: What's the maximum file size?**  
A: 4MB limit to prevent resource exhaustion.

---

## Recent Changes (Migration from Old System)

### Deleted
- ❌ `backend/src/services/sftpFirmwareManager.js` (old service)
- ❌ Old SFTP endpoints (4 endpoints)
- ❌ Old SFTP initialization code

### Added
- ✨ `POST /api/firmware/upload-sftp-v2` (new endpoint)
- ✨ `FirmwareSftpUpload.tsx` (React component)
- ✨ `sftp-firmware-upload.js` (standalone script)
- ✨ Menu item "Firmware Upload"
- ✨ Route `/firmware-sftp`

### Server Change
- 🔄 Old: 202.29.50.41:22 → New: 192.168.137.157:8022
- 🔄 Old User: s6710886217 → New User: u0_a175

---

**Last Updated**: 2024-01-20  
**System Status**: ✅ Ready for Use  
**SFTP Server**: 192.168.137.157:8022
