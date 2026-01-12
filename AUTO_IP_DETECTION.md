# 🔄 Auto IP Detection - คู่มือการใช้งาน

## 📌 สรุปปัญหาและวิธีแก้ไข

### ปัญหา
- ระบบใช้ DHCP ไม่มี Static IP
- IP เปลี่ยนทุกครั้งที่เชื่อมต่อเครือข่ายใหม่
- ต้องแก้ไขไฟล์ `.env` ทุกครั้งที่ IP เปลี่ยน
- WebSocket และ HMR ใช้งานไม่ได้เมื่อ IP เปลี่ยน

### วิธีแก้ไข
- ✅ ระบบตรวจจับ IP อัตโนมัติทุกครั้งที่เริ่มทำงาน
- ✅ อัปเดต WebSocket configuration อัตโนมัติ
- ✅ รองรับทุก IP range (10.x, 192.168.x, 172.x)
- ✅ ไม่ต้องแก้ไขไฟล์ configuration ด้วยตัวเอง

---

## 🚀 วิธีใช้งาน (3 วิธี)

### วิธีที่ 1: ใช้ START_SYSTEM_AUTO.bat (แนะนำ!)
```batch
# Double-click ที่ไฟล์
START_SYSTEM_AUTO.bat
```

**คุณสมบัติ:**
- ตรวจจับ IP อัตโนมัติ
- เริ่ม Backend และ Frontend พร้อมกัน
- แสดง URL ที่สามารถเข้าใงได้ทั้งหมด
- ใช้งานง่ายที่สุด

### วิธีที่ 2: ใช้ PowerShell Script
```powershell
# เปิด PowerShell ที่ root directory
.\start-dev-lan.ps1
```

**คุณสมบัติ:**
- ตรวจจับ IP แบบละเอียด
- แสดง IP ทั้งหมดที่พบในระบบ
- จัดลำดับความสำคัญของ IP (10.x > 192.168.x > 172.x)
- แจ้งเตือนชัดเจนถ้าไม่พบเครือข่าย

### วิธีที่ 3: ใช้ Batch Script
```batch
# เปิด Command Prompt หรือ double-click
.\start-dev-lan.bat
```

**คุณสมบัติ:**
- รองรับ Windows โดยไม่ต้องมี PowerShell
- ตรวจจับ IP ทุก range (10.x, 192.168.x, 172.x)
- แสดงข้อผิดพลาดชัดเจนถ้าไม่พบ IP

---

## 🔍 กลไกการตรวจจับ IP

### PowerShell Version (start-dev-lan.ps1)
```powershell
# 1. ดึง IP ทั้งหมดที่ไม่ใช่ localhost หรือ APIPA
$allIPs = Get-NetIPAddress -AddressFamily IPv4 | 
    Where-Object { 
        $_.IPAddress -notlike "127.*" -and      # ไม่เอา localhost
        $_.IPAddress -notlike "169.254.*" -and  # ไม่เอา APIPA
        $_.PrefixOrigin -eq "Dhcp" -or          # DHCP assigned
        $_.PrefixOrigin -eq "Manual"            # Manually assigned
    }

# 2. จัดเรียงตามความสำคัญ
# Priority: 10.x > 192.168.x > 172.x > อื่นๆ
$localIP = $allIPs | 
    Sort-Object -Property @{Expression={
        if ($_.IPAddress -like "10.*") { 1 }
        elseif ($_.IPAddress -like "192.168.*") { 2 }
        elseif ($_.IPAddress -like "172.*") { 3 }
        else { 4 }
    }} | 
    Select-Object -First 1 -ExpandProperty IPAddress

# 3. ถ้าไม่เจอ IP ให้แสดง error และ exit
if (-not $localIP) {
    Write-Host "❌ Could not auto-detect LAN IP" -ForegroundColor Red
    exit 1
}
```

### Batch Version (start-dev-lan.bat)
```batch
REM 1. ลอง 10.x range ก่อน
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" ^| findstr "10\."') do (
    set LOCAL_IP=%%a
    goto :found_ip
)

REM 2. ลอง 192.168.x range
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" ^| findstr "192\.168\."') do (
    set LOCAL_IP=%%a
    goto :found_ip
)

REM 3. ลอง 172.x range
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" ^| findstr "172\."') do (
    set LOCAL_IP=%%a
    goto :found_ip
)

REM 4. ถ้าไม่เจอ IP ให้แสดง error
echo [ERROR] Could not detect LAN IP address
exit /b 1
```

---

## 📝 การอัปเดต Configuration อัตโนมัติ

เมื่อตรวจจับ IP แล้ว ระบบจะสร้างไฟล์ `frontend/.env.development.local`:

```env
# Dev Server Configuration for LAN Access
HOST=0.0.0.0
PORT=3000

# HMR WebSocket Configuration - อัปเดตอัตโนมัติ
WDS_SOCKET_HOST=10.x.x.x  # ← IP ที่ตรวจจับได้
WDS_SOCKET_PORT=3000
WDS_SOCKET_PATH=/ws

# Fast Refresh Configuration
FAST_REFRESH=true

# Backend API/WS port
REACT_APP_API_PORT=3001

# Disable service worker in development
REACT_APP_SW_ENABLED=false

# Browser settings
BROWSER=none
GENERATE_SOURCEMAP=true
```

---

## 🌐 URL ที่ใช้ได้หลังเริ่มระบบ

### เข้าใช้จากเครื่องเดียวกัน
```
Frontend:  http://localhost:3000
Backend:   http://localhost:3001
WebSocket: ws://localhost:3001
```

### เข้าใช้จากอุปกรณ์อื่นในเครือข่าย LAN
```
Frontend:  http://{AUTO_DETECTED_IP}:3000
Backend:   http://{AUTO_DETECTED_IP}:3001
WebSocket: ws://{AUTO_DETECTED_IP}:3001
```

**ตัวอย่าง:**
- Frontend: http://10.224.54.79:3000
- Backend: http://10.224.54.79:3001
- WebSocket: ws://10.224.54.79:3001

---

## ✅ การทำงานของ Dynamic WebSocket

### ใน `frontend/src/config/api.ts`
```typescript
export function getWsUrl(): string {
  // 1. ไม่ใช้ env var ใน development (ให้ auto-detect)
  if (process.env.REACT_APP_WS_URL && process.env.NODE_ENV !== 'development') {
    return process.env.REACT_APP_WS_URL;
  }
  
  // 2. ใช้ hostname จาก browser (อัตโนมัติ!)
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    return `ws://${host}:${getBackendPort()}`;
  }
  
  // 3. Fallback (ไม่มีทางถึงใน browser)
  return `ws://0.0.0.0:${getBackendPort()}`;
}
```

### ผลลัพธ์
- เข้าผ่าน `localhost:3000` → WebSocket ใช้ `ws://localhost:3001` ✅
- เข้าผ่าน `10.224.54.79:3000` → WebSocket ใช้ `ws://10.224.54.79:3001` ✅
- เข้าผ่าน `192.168.1.100:3000` → WebSocket ใช้ `ws://192.168.1.100:3001` ✅

**ไม่ต้องกำหนด IP ในโค้ด - ระบบหาเอง!**

---

## 🔧 Troubleshooting

### ปัญหา: ไม่พบ IP
```
[ERROR] Could not auto-detect LAN IP
```

**วิธีแก้:**
1. ตรวจสอบว่าเชื่อมต่อ WiFi/Ethernet แล้ว
2. เช็ค IP ด้วยคำสั่ง:
   ```powershell
   ipconfig | findstr IPv4
   ```
3. ถ้าเจอ IP แต่ script ไม่เจอ ลองใช้ PowerShell version

### ปัญหา: WebSocket ไม่เชื่อมต่อ
```
WebSocket connection to 'ws://...' failed
```

**วิธีแก้:**
1. ตรวจสอบ Backend กำลังรันอยู่:
   ```powershell
   netstat -ano | findstr :3001
   ```

2. ตรวจสอบ Firewall:
   ```powershell
   .\setup-firewall.bat
   ```

3. Clear browser cache (Ctrl+Shift+R)

4. ตรวจสอบ Console ว่าใช้ WebSocket URL ถูกต้อง:
   ```javascript
   // ดูใน Console
   WebSocket: Connecting to ws://{YOUR_IP}:3001...
   ```

### ปัญหา: HMR ไม่ทำงานบน Mobile
```
Hot reload not working on mobile device
```

**วิธีแก้:**
1. ตรวจสอบว่า Mobile อยู่ WiFi เดียวกับ PC
2. ตรวจสอบ `frontend/.env.development.local`:
   ```env
   WDS_SOCKET_HOST=10.x.x.x  # ต้องเป็น IP ของ PC
   ```
3. Restart dev server:
   ```batch
   START_SYSTEM_AUTO.bat
   ```

### ปัญหา: IP เปลี่ยนหลังเชื่อมต่อใหม่
```
Old IP: 10.224.54.79
New IP: 10.224.54.80
WebSocket fail!
```

**วิธีแก้:**
1. ปิด dev server (Ctrl+C)
2. เริ่มใหม่ (จะตรวจจับ IP ใหม่อัตโนมัติ):
   ```batch
   START_SYSTEM_AUTO.bat
   ```

---

## 📊 ตัวอย่าง Output

### เมื่อเริ่มระบบสำเร็จ
```
🚀 Starting SMART Energy Development Server with LAN Support...
════════════════════════════════════════════════════════════════════════════════

📡 Detecting Network Configuration...
✅ Auto-detected LAN IP: 10.224.54.79
   Other available IPs:
   - 172.27.192.1 (Ethernet 2)

📝 Updating WebSocket configuration...
✅ Updated WDS_SOCKET_HOST to 10.224.54.79

🔧 Starting Backend Server...
✅ Backend starting (Job ID: 2)...

🎨 Starting Frontend Development Server...

════════════════════════════════════════════════════════════════════════════════
✅ Development Server Starting!
════════════════════════════════════════════════════════════════════════════════

📊 Access Dashboard:
   Local:            http://localhost:3000
   LAN:              http://10.224.54.79:3000

🔧 Backend API:
   Local:            http://localhost:3001
   LAN:              http://10.224.54.79:3001

🔌 WebSocket:
   Auto-detect:      ws://{your-access-ip}:3001
   
🔥 Hot Module Replacement: ENABLED on both URLs
💡 Edit any file in src/ and see changes instantly!
```

---

## 🎯 สรุป

### ก่อนแก้ไข (Manual IP)
```
❌ ต้องแก้ไข .env ทุกครั้งที่ IP เปลี่ยน
❌ ลืมแก้ → WebSocket fail
❌ HMR ใช้งานไม่ได้บน LAN
```

### หลังแก้ไข (Auto IP)
```
✅ ตรวจจับ IP อัตโนมัติทุกครั้งที่เริ่มระบบ
✅ WebSocket ใช้ hostname จาก browser (dynamic!)
✅ HMR ทำงานบนทุกอุปกรณ์ที่เข้าถึงได้
✅ ไม่ต้องแก้ไขไฟล์อะไรเลย
```

### วิธีใช้งาน (สั้นที่สุด)
```batch
# 1. Double-click
START_SYSTEM_AUTO.bat

# 2. เปิด browser
localhost:3000          # บนเครื่อง PC
10.x.x.x:3000          # บนมือถือ/เครื่องอื่น

# 3. Edit code → Auto reload ทั้ง 2 URL! 🎉
```

---

## 📞 การทดสอบ

### 1. ทดสอบ IP Detection
```powershell
# PowerShell
Get-NetIPAddress -AddressFamily IPv4 | 
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Format-Table IPAddress, InterfaceAlias, PrefixOrigin
```

### 2. ทดสอบ WebSocket URL
```javascript
// เปิด Browser Console (F12)
console.log('WebSocket URL:', wsClient.getUrl());
// ควรเห็น: ws://{your-current-ip}:3001
```

### 3. ทดสอบ HMR
```javascript
// 1. แก้ไข src/App.tsx
// 2. ดูใน Console ควรเห็น:
[HMR] Updated modules:
  • ./src/App.tsx

// 3. หน้าเว็บ refresh อัตโนมัติโดยไม่สูญเสียข้อมูล
```

---

## 🔐 Security Notes

⚠️ **คำเตือน**: ระบบนี้เปิด `HOST=0.0.0.0` เพื่อให้เข้าถึงได้จาก LAN

**ข้อควรระวัง:**
- ใช้ใน Development เท่านั้น
- Production ต้องใช้ HTTPS และ WSS (ไม่ใช่ HTTP/WS)
- ควรมี Authentication ก่อน Deploy
- ปิด Firewall ports เมื่อไม่ใช้งาน

**สำหรับ Production:**
1. ใช้ Reverse Proxy (nginx/Apache)
2. Enable SSL/TLS
3. กำหนด CORS เฉพาะ domain ที่อนุญาต
4. ใช้ Environment Variables จริง (ไม่ใช่ auto-detect)

---

## 📚 ไฟล์ที่เกี่ยวข้อง

```
d:\smart\
├── START_SYSTEM_AUTO.bat        # หลัก: Double-click เริ่มระบบ
├── start-dev-lan.ps1            # PowerShell version
├── start-dev-lan.bat            # Batch version
├── AUTO_IP_DETECTION.md         # ไฟล์นี้
└── frontend\
    ├── .env                     # Base config (ไม่มี IP hardcode)
    ├── .env.development.local   # สร้างอัตโนมัติทุกครั้ง
    └── src\
        └── config\
            └── api.ts           # Dynamic WebSocket URL
```

---

## 💡 Tips & Best Practices

### 1. ใช้ START_SYSTEM_AUTO.bat เป็นหลัก
- ใช้งานง่ายที่สุด
- ตรวจจับ IP อัตโนมัติ
- เริ่มทั้ง Backend และ Frontend

### 2. เก็บหมายเลข Port มาตรฐาน
```
Frontend:  3000
Backend:   3001
MQTT:      1883
InfluxDB:  8086
```

### 3. ตรวจสอบ Network ก่อนเริ่มระบบ
```powershell
# เช็ค connectivity
ping 202.29.50.41  # MQTT Broker
```

### 4. Monitor Logs
```powershell
# Backend logs
tail -f backend/logs/app.log

# Frontend console (Browser F12)
# ควรเห็น:
✅ WebSocket: Connected
🟢 เรียลไทม์ (indicators in components)
```

---

## 🎉 สรุปสุดท้าย

**ระบบ Auto IP Detection ทำให้:**
- ✅ ไม่ต้องแก้ไข IP ใน config files
- ✅ WebSocket ทำงานอัตโนมัติบนทุก IP
- ✅ HMR ใช้งานได้บน localhost และ LAN
- ✅ รองรับ IP ที่เปลี่ยนแปลงจาก DHCP
- ✅ ใช้งานง่าย - Double-click เดียวเสร็จ!

**เริ่มใช้งานเลย:**
```batch
START_SYSTEM_AUTO.bat
```

Happy Coding! 🚀
