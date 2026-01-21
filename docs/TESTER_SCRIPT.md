# SMART Energy Monitor - System Tester Script

เอกสารนี้ระบุขั้นตอนการทดสอบ (Test Plan) เพื่อตรวจสอบความถูกต้องของระบบ Backend, การรับส่งข้อมูล, และความถูกต้องของข้อมูลที่จะแสดงผลบน Frontend

## 1. Unit Testing & Logic Verification

### 1.1 JSON Parser Resilience (Critical)
**เป้าหมาย:** ทดสอบการจัดการข้อมูล JSON ที่ผิดรูปแบบจากอุปกรณ์ IoT (ESP32)
- [ ] **Test Case:** ส่ง MQTT Payload ที่มี Trailing Comma
    - Input: `{"voltage": 220, "current": 5,}`
    - Expected: ระบบต้องไม่ Crash และสามารถแปลงเป็น JSON Object ได้ถูกต้อง
- [ ] **Test Case:** ส่ง Malformed JSON แบบอื่น
    - Input: `{"voltage": 220; "current": 5}` (ใช้ semicolon แทน comma)
    - Expected: ระบบต้อง Log Error แต่ process หลักต้องทำงานต่อได้ (Graceful Failure)

### 1.2 Energy Calculation Logic
**เป้าหมาย:** ตรวจสอบความถูกต้องของการคำนวณค่าไฟและพลังงาน
- [ ] **Test Case:** ตรวจสอบฟังก์ชัน `calculateCost` ใน `energyCalculation.js`
    - Input: Energy = 100 kWh, Rate = 4.0 THB
    - Expected: 400 THB (ต้องไม่มีทศนิยมเพี้ยน เช่น 400.0000001)
- [ ] **Test Case:** ตรวจสอบการแปลงหน่วย (Scaling)
    - Input: ค่าจาก Meter (Ep_total) ที่ส่งมาเป็น int (เช่น 12345)
    - Expected: ระบบต้องหาร 10 หรือ 100 ตาม Spec เพื่อได้ค่า kWh จริง (เช่น 123.45) *ต้องตรวจสอบว่า Logic นี้อยู่ที่ Backend หรือ Firmware*

## 2. Integration Testing (API & Database)

### 2.1 Data Consistency (RAM vs InfluxDB)
**เป้าหมาย:** ตรวจสอบว่าข้อมูล Real-time (RAM) ตรงกับข้อมูลที่บันทึก (DB)
- [ ] **Step 1:** ส่งข้อมูล MQTT เข้ามา 1 packet (Energy + 1 kWh)
- [ ] **Step 2:** เรียก API `/api/energy/state` (อ่านจาก RAM)
- [ ] **Step 3:** รอ 2-3 วินาที แล้วเรียก API `/api/energy/daily-realtime` (อ่านจาก InfluxDB)
- [ ] **Verify:** ค่าที่ได้จากทั้งสอง API ต้องใกล้เคียงกันหรือเท่ากัน

### 2.2 Aggregation Delay (The "Missing Hour" Problem)
**เป้าหมาย:** ตรวจสอบปัญหาข้อมูลกราฟรายวันหายไปในช่วงชั่วโมงล่าสุด
- [ ] **Scenario:** เวลาปัจจุบัน 10:30 น.
- [ ] **Action:** เรียก API `/api/energy/daily-consumption`
- [ ] **Check:** ตรวจสอบข้อมูลของช่วงเวลา 10:00 - 11:00
    - **Pass:** มีข้อมูลพลังงานของ 30 นาทีที่ผ่านมา
    - **Fail:** ข้อมูลเป็น 0 หรือไม่มี Object ของชั่วโมงนี้ (แสดงว่ารอ Downsampling task ทำงาน)

### 2.3 Rate Limiting & Security
- [ ] **Test Case:** Brute-force Login
    - Action: ยิง Request Login ผิด 6 ครั้งติดกัน จาก IP เดิม
    - Expected: ครั้งที่ 6 ต้องได้ HTTP 429 (Too Many Requests)
- [ ] **Test Case:** Restart Server แล้วลอง Login อีกครั้ง
    - Action: สั่ง PM2 restart server แล้วยิง Login ผิดอีกครั้ง
    - Check: ตัวนับจำนวนครั้งถูก Reset หรือไม่ (ถ้าใช่ ถือเป็นความเสี่ยง)

## 3. End-to-End Testing (Simulate IoT -> Frontend)

### 3.1 Flow การแจ้งเตือน (Alert System)
- [ ] **Setup:** ตั้งค่า Threshold Power > 50kW
- [ ] **Action:** จำลองส่ง MQTT `AI205/data` ด้วยค่า `power_active: 55`
- [ ] **Verify 1 (Backend):** Log ต้องขึ้นว่า "Generated alert"
- [ ] **Verify 2 (Database):** ตาราง InfluxDB `alerts` ต้องมี Record ใหม่
- [ ] **Verify 3 (Line):** ได้รับข้อความแจ้งเตือนทาง LINE

### 3.2 Recovery Testing
- [ ] **Scenario:** Ingestor Service ตาย (Crash)
- [ ] **Action:** สั่ง `pm2 stop smart-ingestor` แต่เปิด `smart-api` ไว้
- [ ] **Check:**
    - API `/api/energy/state` ยังต้องตอบสนองได้ (แสดงค่าล่าสุดที่ค้างใน RAM)
    - API `/api/energy/daily-consumption` ยังอ่านค่าเก่าจาก DB ได้
- [ ] **Recovery:** สั่ง `pm2 start smart-ingestor`
- [ ] **Verify:** ระบบกลับมารับ MQTT และเขียนลง DB ต่อเนื่อง