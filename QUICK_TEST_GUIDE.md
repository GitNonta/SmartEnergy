# 🚀 FIRMWARE UPLOAD TEST - QUICK START

## ⚡ TL;DR - Just 3 Steps!

### 1️⃣ Open Frontend
```
http://localhost:3002
```

### 2️⃣ Navigate to Upload
```
Click: "Firmware Upload" in menu
Or: http://localhost:3002/firmware-sftp
```

### 3️⃣ Upload Firmware
```
1. Select: d:\smart\backend\firmware\test_upload.bin
2. Version: 1.0.0
3. Click: "Upload to SFTP"
4. Done! ✅
```

---

## 📊 Current System Status

```
✅ Backend API:        http://localhost:3001
✅ Frontend:           http://localhost:3002  ← START HERE
✅ Upload Component:   Ready
✅ SFTP Server:        192.168.137.157:8022 (configured)
✅ Test File:          Created automatically
```

---

## 🎯 What to Expect

| Step | Duration | What Happens |
|------|----------|--------------|
| Select File | 1s | File name shown |
| Enter Version | 1s | Version stored |
| Click Upload | 0.5s | Backend validates |
| Return 200 OK | 0.5s | ✅ Success message |
| Background Process | 10-15s | SFTP upload runs |
| File Appears | Auto | On SFTP server |

---

## 🔍 Verify Success

### In Browser
- ✅ Success message appears
- ✅ Form clears automatically
- ✅ No error messages in console (F12)

### On SFTP Server
```bash
ssh u0_a175@192.168.137.157 -p 8022
# Password: Nontawat01

ls -la ./Firmware/
# Should show uploaded file ✅
```

---

## ⚠️ If Something Goes Wrong

| Issue | Fix |
|-------|-----|
| Port 3002 doesn't work | Try port 3000: http://localhost:3000 |
| Upload button disabled | Check version field is not empty |
| No success message | Check browser console (F12) for errors |
| File not on SFTP | Check backend console for SFTP logs |
| "Address in use" | Another process using the port - kill it |

---

## 📱 Port Reference

```
Frontend:   http://localhost:3002  (or 3000 if available)
Backend:    http://localhost:3001
SFTP:       192.168.137.157:8022
```

---

## 🎓 Full Process (Detailed)

### Frontend Upload Component Flow

```
User selects .bin file
    ↓
Component validates:
  ✓ File ends with .bin
  ✓ Size < 4MB
    ↓
User enters version (required)
User enters notes (optional)
    ↓
User clicks "Upload to SFTP"
    ↓
Frontend sends: POST /api/firmware/upload-sftp-v2
  Body: { firmware: File, version: "1.0.0", notes: "..." }
    ↓
Backend validates again
    ↓
Backend spawns sftp-firmware-upload.js
    ↓
Backend returns: 200 OK ✅
    ↓
Frontend shows success message
    ↓
Form clears after 3 seconds
    ↓
─────── MEANWHILE (Background) ────────
    ↓
SSH2 connects to 192.168.137.157:8022
    ↓
Auth: u0_a175 / Nontawat01
    ↓
Create ./Firmware directory
    ↓
List existing .bin files
    ↓
Delete all old .bin files
    ↓
Upload new firmware
    ↓
MD5 verification
    ↓
Close connection
    ↓
WebSocket notification sent ✅
```

---

## 📋 Test Checklist

- [ ] Open http://localhost:3002
- [ ] See Energy Platform dashboard
- [ ] See "Firmware Upload" menu item
- [ ] Click "Firmware Upload"
- [ ] See upload component with file selector
- [ ] Click file selector
- [ ] Select test_upload.bin file
- [ ] See filename in selector
- [ ] Enter version: 1.0.0
- [ ] Enter notes: Test upload
- [ ] Click "Upload to SFTP"
- [ ] See progress bar
- [ ] See success message
- [ ] Form clears
- [ ] SSH to SFTP server
- [ ] Verify file exists in ./Firmware/
- [ ] Confirm no old .bin files remain
- [ ] ✅ TEST PASSED!

---

## 🔐 SFTP Server Details

```
Host:       192.168.137.157
Port:       8022
User:       u0_a175
Password:   Nontawat01
Remote Dir: ./Firmware
```

---

## 📞 Support Commands

### Check Backend Status
```bash
curl http://localhost:3001/health
```

### View Backend Logs
```bash
tail -f d:\smart\backend\logs\*
```

### SSH to SFTP Server
```bash
ssh u0_a175@192.168.137.157 -p 8022
# password: Nontawat01
ls -la ./Firmware/
```

### Check Frontend Console
```
Press: F12
Tab: Console
Look for: Error messages
```

---

## ✨ Key Features Being Tested

1. **File Validation**
   - ✓ Only .bin files
   - ✓ Max 4MB size
   - ✓ Required version

2. **Upload Process**
   - ✓ Non-blocking (returns immediately)
   - ✓ Background SFTP upload
   - ✓ Progress tracking

3. **SFTP Operations**
   - ✓ Create directory if needed
   - ✓ Delete old .bin files
   - ✓ Upload new file
   - ✓ Verify MD5 hash

4. **User Experience**
   - ✓ Progress indicator
   - ✓ Success/error messages
   - ✓ Auto form clear
   - ✓ Real-time notifications

---

## 🎯 Success Criteria

✅ All criteria must pass:

- [ ] Upload completes without errors
- [ ] File appears on SFTP server
- [ ] Old .bin files are deleted
- [ ] Success message displays
- [ ] WebSocket notification sent
- [ ] No error messages in console
- [ ] File integrity verified (MD5)

---

**Ready? Start here: http://localhost:3002** 🚀
