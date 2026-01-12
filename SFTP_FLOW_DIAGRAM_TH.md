# 📋 SFTP Upload Flow Diagram - เส้นทางการอัพโหลด Firmware

## เงื่อนไขการทำงาน

✅ อัพโหลดไฟล์ผ่าน SFTP ไปยังโฟลเดอร์ `Firmware`  
✅ ถ้ายังไม่มีโฟลเดอร์ → สร้าง `mkdir` ใหม่ทันที  
✅ ถ้าโฟลเดอร์มีไฟล์ `.bin` อยู่แล้ว → ลบออกก่อน แล้วอัพโหลดไฟล์ใหม่

---

## 🔄 เส้นทาง SFTP Upload Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     1️⃣  START: USER UPLOAD                          │
│  (ผู้ใช้เลือกไฟล์ .bin ที่ frontend และกดปุ่ม Upload)                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              2️⃣  BACKEND VALIDATION (index.js)                      │
│  • ตรวจสอบไฟล์ (.bin, max 4MB)                                     │
│  • ตรวจสอบ version (required)                                      │
│  • ตรวจสอบ content (valid binary)                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│         3️⃣  SPAWN SFTP PROCESS (sftp-firmware-upload.js)           │
│  • สร้าง child process แบบ detached                                 │
│  • กลับ 200 OK ไปให้ frontend ทันที                                │
│  (ไม่รอให้ upload เสร็จ)                                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│      4️⃣  SSH2 CONNECTION (Background Process)                      │
│  ✅ Connect to 192.168.137.157:8022                                │
│  ✅ Authenticate: u0_a175 / Nontawat01                             │
│  ✅ Init SFTP subsystem                                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│   5️⃣  CHECK FIRMWARE DIRECTORY (./Firmware)                        │
│                                                                      │
│   ┌─ Directory exists? ─────┐                                      │
│   │                         │                                      │
│   ├─ YES → Continue (Step 6)│                                      │
│   │                         │                                      │
│   └─ NO → mkdir ./Firmware  │                                      │
│       (สร้างใหม่ทันที)       │                                      │
│       ✅ Done → Continue (Step 6)                                  │
│                                                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│    6️⃣  LIST FILES IN ./Firmware (readdir)                          │
│  • ดึงรายชื่อไฟล์ทั้งหมดในโฟลเดอร์                                │
│  • Filter ไฟล์ที่ลงท้ายด้วย .bin                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
         ┌────────────────────┴────────────────────┐
         │   7️⃣  OLD .BIN FILES?                  │
         └────────────────────┬────────────────────┘
                              │
              ┌───────────────┴────────────────┐
              │                                │
         YES │                            NO  │
              │                                │
              ▼                                ▼
    ┌──────────────────┐            ┌──────────────────┐
    │ 8️⃣  DELETE OLD  │            │  SKIP DELETION   │
    │                  │            │ → Go to Step 9   │
    │ Loop through     │            │                  │
    │ each .bin file:  │            └──────────────────┘
    │                  │                     │
    │ • unlink()       │                     │
    │ • ./Firmware/    │                     │
    │   file1.bin ✅  │                     │
    │ • ./Firmware/    │                     │
    │   file2.bin ✅  │                     │
    │ • ...            │                     │
    │ (delete all)     │                     │
    │                  │                     │
    └────────┬─────────┘                     │
             │                               │
             └───────────────┬───────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│        9️⃣  UPLOAD NEW FIRMWARE FILE                               │
│                                                                      │
│  • Source: Local file (d:\smart\AI205_final.ino.bin)              │
│  • Destination: ./Firmware/AI205_final.ino.bin                    │
│  • Method: createReadStream() + createWriteStream()               │
│  • Progress: Show 50% → 100%                                      │
│  • Status: ✅ Upload complete                                      │
│                                                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│      🔟  MD5 VERIFICATION (Integrity Check)                        │
│                                                                      │
│  • Calculate local file MD5                                         │
│  • Compare with remote file MD5                                     │
│  • ✅ Match → Success                                              │
│  • ❌ No match → Error                                             │
│                                                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│      1️⃣1️⃣  CLOSE SSH CONNECTION                                    │
│  • Disconnect SFTP subsystem                                        │
│  • Close SSH tunnel                                                 │
│  • Cleanup resources                                                │
│                                                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│      1️⃣2️⃣  WEBSOCKET NOTIFICATION                                  │
│  • Send message to all connected clients                            │
│  • Type: firmware-sftp-upload-success                              │
│  • Data: filename, version, size, md5, timestamp                   │
│                                                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│             ✅  END: UPLOAD COMPLETE                               │
│             File on Remote: 192.168.137.157:8022                   │
│             Path: /home/u0_a175/Firmware/AI205_final.ino.bin      │
│             All old .bin files deleted                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📍 SFTP Server Configuration

```
┌─────────────────────────────────────────────────────────┐
│          SFTP SERVER DETAILS                            │
├─────────────────────────────────────────────────────────┤
│  Host:       192.168.137.157                           │
│  Port:       8022                                      │
│  User:       u0_a175                                   │
│  Password:   Nontawat01                               │
│  Protocol:   SSH2 (SFTP)                              │
│                                                        │
│  Remote Home:  /home/u0_a175                          │
│  Target Dir:   ./Firmware (relative to home)          │
│                = /home/u0_a175/Firmware               │
│                                                        │
│  Uploaded File Path:                                  │
│  /home/u0_a175/Firmware/[filename].bin               │
└─────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Flow

```
┌──────────────────────────────────────┐
│ 1. SSH2 Key Exchange                 │
│    • Generate session key            │
│    • Establish secure tunnel         │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│ 2. User Authentication               │
│    • Username: u0_a175               │
│    • Password: Nontawat01            │
│    • Verify credentials              │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│ 3. SFTP Subsystem Init               │
│    • Start SFTP protocol             │
│    • Ready for file operations       │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│ 4. Encrypted File Transfer           │
│    • AES-256-CTR encryption          │
│    • Secure data channels            │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│ 5. Integrity Verification            │
│    • MD5 hash calculation            │
│    • Compare local vs remote         │
│    • Ensure no corruption            │
└──────────────────────────────────────┘
```

---

## 📊 Data Flow Timeline

```
Time    Event                           Status
────────────────────────────────────────────────────
T0      User selects .bin file          ⏱️ Frontend
T0+100ms  Validation complete             ✅ Passed
T0+200ms  API call to backend             📤 POST request
T0+300ms  Backend validation              ✅ Passed
T0+400ms  Return 200 OK to user           ✅ Immediate
T0+500ms  SPAWN SFTP process              🔄 Background
T0+2s    SSH2 connection                 ✅ Connected
T0+3s    Directory check                 ✅ Exists
T0+4s    List .bin files                 📋 Found 2 old files
T0+5s    Delete old file 1               🗑️ Deleted
T0+6s    Delete old file 2               🗑️ Deleted
T0+8s    Upload new firmware             📤 Uploading...
T0+12s   Upload complete                 ✅ 100%
T0+13s   MD5 verification                ✅ Match
T0+14s   Close SSH connection             🔌 Disconnected
T0+15s   WebSocket notification sent      📢 All clients
────────────────────────────────────────────────────
Total time: ~15 seconds (background)
User sees: ✅ Success at T0+400ms
```

---

## 🎯 SFTP Operations Sequence

```
┌─────────────────────────────────────────────────────────┐
│ OPERATION 1: Connect                                    │
├─────────────────────────────────────────────────────────┤
│ client.connect({                                        │
│   host: '192.168.137.157',                             │
│   port: 8022,                                          │
│   username: 'u0_a175',                                 │
│   password: 'Nontawat01'                               │
│ })                                                      │
│ → ssh2.ready()                                          │
│ → sftp.subsystem()                                      │
│ Result: ✅ SFTP connection ready                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ OPERATION 2: Check Directory                           │
├─────────────────────────────────────────────────────────┤
│ sftp.stat('./Firmware', (err, stats) => {             │
│   if (err) {                                            │
│     // Directory doesn't exist                          │
│     sftp.mkdir('./Firmware', () => {})                │
│   } else {                                              │
│     // Directory exists                                 │
│   }                                                     │
│ })                                                      │
│ Result: ✅ Directory ensured                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ OPERATION 3: List Old Files                            │
├─────────────────────────────────────────────────────────┤
│ sftp.readdir('./Firmware', (err, files) => {          │
│   files.filter(f => f.filename.endsWith('.bin'))      │
│   → [file1.bin, file2.bin]                             │
│ })                                                      │
│ Result: ✅ Old files identified                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ OPERATION 4: Delete Old Files                          │
├─────────────────────────────────────────────────────────┤
│ for each oldFile in binFiles:                          │
│   sftp.unlink(./Firmware/oldFile.bin, () => {})       │
│                                                         │
│ Example:                                                │
│   sftp.unlink('./Firmware/AI205_v3.0.0.bin', ...)    │
│   sftp.unlink('./Firmware/AI205_v3.1.0.bin', ...)    │
│ Result: ✅ All old files deleted                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ OPERATION 5: Upload New File                           │
├─────────────────────────────────────────────────────────┤
│ readStream = fs.createReadStream(local_file)          │
│ writeStream = sftp.createWriteStream(remote_file)     │
│                                                         │
│ readStream.pipe(writeStream)                           │
│                                                         │
│ Source: d:\smart\AI205_final.ino.bin                  │
│ Target: ./Firmware/AI205_final.ino.bin                │
│ Size: 2097152 bytes (2MB)                             │
│ Progress: 50% → 100%                                  │
│ Result: ✅ File uploaded                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ OPERATION 6: Verify MD5                                │
├─────────────────────────────────────────────────────────┤
│ Local MD5:  hash_of_local_file                         │
│ Remote MD5: Calculate after upload                     │
│                                                         │
│ if (localMD5 === remoteMD5) {                          │
│   Result: ✅ File integrity verified                  │
│ } else {                                                │
│   Result: ❌ File corrupted - ERROR                    │
│ }                                                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ OPERATION 7: Disconnect                                │
├─────────────────────────────────────────────────────────┤
│ client.end()                                            │
│ → Close SFTP subsystem                                 │
│ → Terminate SSH tunnel                                 │
│ Result: ✅ Clean disconnect                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 Complete Example Walkthrough

### Scenario: Upload AI205_v3.2.0.bin

```
STEP 1: Frontend
   User selects: AI205_v3.2.0.bin
   Version: 3.2.0
   Notes: Bug fixes and performance improvements
   
   → Submit to POST /api/firmware/upload-sftp-v2

STEP 2: Backend Validation
   ✅ File extension: .bin (OK)
   ✅ File size: 2.1MB < 4MB (OK)
   ✅ File content: Valid binary (OK)
   
   → Spawn sftp-firmware-upload.js process

STEP 3: Background Process Starts
   ✅ SSH2 connects to 192.168.137.157:8022
   ✅ SFTP subsystem ready
   
STEP 4: Directory Check
   Query: ./Firmware exists?
   Response: ✅ YES (already created)
   
STEP 5: List Existing Files
   Query: ls ./Firmware
   Result: 
      • AI205_v3.0.0.bin (old)
      • AI205_v3.1.0.bin (old)
      • metadata.txt (keep)
   
STEP 6: Delete Old Firmware
   ✅ Deleting: AI205_v3.0.0.bin
   ✅ Deleting: AI205_v3.1.0.bin
   ℹ️  Keeping: metadata.txt (not .bin)
   
STEP 7: Upload New Firmware
   Source: d:\smart\AI205_final.ino.bin (local)
   Target: ./Firmware/AI205_v3.2.0.bin (remote)
   
   Progress:
   0%   ████░░░░░░░░░░░░░░░░░░░░░░░░░ 2.1MB / 2.1MB
   50%  ████████████████░░░░░░░░░░░░░░ 2.1MB / 2.1MB
   100% ████████████████████████████████ 2.1MB / 2.1MB
   
   ✅ Upload complete

STEP 8: Verify Integrity
   Local MD5:  3f7a9c5b8e2d1f4a9c7e2b5d8a1f4c9e
   Remote MD5: 3f7a9c5b8e2d1f4a9c7e2b5d8a1f4c9e
   
   ✅ Match! File is intact

STEP 9: Disconnect
   ✅ SSH connection closed
   ✅ Resources released

STEP 10: WebSocket Broadcast
   Message: {
     type: 'firmware-sftp-upload-success',
     filename: 'AI205_v3.2.0.bin',
     version: '3.2.0',
     size: 2097152,
     md5: '3f7a9c5b8e2d1f4a9c7e2b5d8a1f4c9e',
     timestamp: '2024-01-20T10:30:00.000Z'
   }
   
   All connected clients receive update ✅

FINAL STATE:
   Remote Server (192.168.137.157:8022)
   └── /home/u0_a175/
       └── ./Firmware/
           ├── AI205_v3.2.0.bin ✅ (NEW)
           └── metadata.txt (unchanged)
```

---

## 📌 Key Points - เงื่อนไขการทำงาน

| เงื่อนไข | ตำแหน่งในโค้ด | สถานะ |
|---------|------------|------|
| 🔹 Upload ผ่าน SFTP | `uploadFile()` | ✅ ใช้ SSH2 |
| 🔹 ไปยังโฟลเดอร์ Firmware | `SFTP_REMOTE_PATH = './Firmware'` | ✅ กำหนด |
| 🔹 ถ้าไม่มี → mkdir | `mkdir()` + error check | ✅ ทำ |
| 🔹 ถ้ามี .bin เก่า → ลบ | `deleteFile()` loop | ✅ ทำ |
| 🔹 Upload ไฟล์ใหม่ | `createWriteStream()` pipe | ✅ ทำ |
| 🔹 Verify MD5 | `calculateMD5()` compare | ✅ ทำ |
| 🔹 Close connection | `client.end()` | ✅ ทำ |

---

**สรุป**: ✅ ระบบ SFTP ของคุณปฏิบัติตามเงื่อนไขทั้งหมดที่คุณขอ!
