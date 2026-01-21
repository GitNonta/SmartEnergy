# 🛠️ CRITICAL FIX & IMPLEMENTATION PLAN
**Priority:** High (Critical Logic & Syntax Corrections)
**Status:** Pending Implementation

---

## ⚠️ AI System Audit Report: Critical Logic & Syntax Errors
**"ฉันได้พบตำแหน่งข้อผิดพลาดทาง logic และ โค้ดไวยกรณ์ที่ผิดอย่างร้ายแรง ทางฝัง backend โดยมันจะส่งผลกระทบต่อการทำงานทางฝั่ง frontend ซึ่งอาจจะได้ข้อมูลการประมวณผลที่ไม่ถูก โปรดหาข้อผิดพลาดการทำงานเหล่านั้นอย่างละเอียด"**

จากการวิเคราะห์ Source Code ร่วมกับผลการทดสอบ `walkthrough.md.resolved` พบข้อผิดพลาดเชิงโครงสร้างและตรรกะ (Logic) 4 จุดใหญ่ ดังนี้:

### 1. 🔴 Route Shadowing & Dead Code (ข้อผิดพลาดทาง Syntax/Structure)
**ตำแหน่ง:** `server.js` (Line 822-930) vs `src/routes/energyRoutes.js`
- **ข้อผิดพลาด:** มีการเขียน Route `/api/energy/daily-consumption` ซ้ำซ้อนกัน 2 แห่ง
    1. **Hardcoded ใน `server.js`:** ถูกโหลดก่อนและแย่งทำงานไปทั้งหมด
    2. **Modular ใน `energyRoutes.js`:** กลายเป็น **Dead Code** ที่ไม่มีวันถูกเรียกใช้
- **ผลกระทบ:** การแก้ไข Logic ใดๆ ใน `energyRoutes.js` (เช่น การแก้เรื่อง Data Lag) จะไม่มีผลทางฝั่ง Frontend ทำให้ Developer สับสนและเสียเวลา Debug

### 2. 🔴 Financial Calculation Mismatch (ข้อผิดพลาดทาง Logic การเงิน)
**ตำแหน่ง:** `server.js` (Cost History) vs `summaryRoutes.js` (Dashboard)
- **ข้อผิดพลาด:** ใช้สูตรคำนวณเงิน **คนละมาตรฐาน** ในระบบเดียวกัน
    - **Dashboard:** ใช้ `Flat Rate` (หน่วยละ 4 บาท) -> คำนวณแบบหยาบ
    - **Chart:** ใช้ `Progressive Rate` (อัตราก้าวหน้า PEA) -> คำนวณแบบละเอียด
- **ผลกระทบ:** ยอดเงิน "ค่าไฟรวม" ใน Dashboard จะ **ไม่เท่ากับ** ยอดรวมในกราฟแท่ง ทำให้ User ไม่เชื่อถือข้อมูล (Data Trust Issue)

### 3. 🔴 Timezone Logic Error (ข้อผิดพลาดทาง Logic เวลา)
**ตำแหน่ง:** `src/services/influxTasks.js`
- **ข้อผิดพลาด:** Script ของ InfluxDB (Flux) ไม่มีการระบุ `option location`
- **ผลกระทบ:** ระบบจะตัดรอบวัน (Daily Aggregation) ที่เวลา **00:00 UTC (07:00 น. ไทย)** ทำให้ข้อมูลการใช้ไฟช่วง 00:00-06:59 ของเช้านี้ ถูกปัดไปรวมกับยอดของ "เมื่อวาน"

### 4. 🔴 Data Lag in Aggregation (ข้อผิดพลาดทาง Logic การแสดงผล)
**ตำแหน่ง:** `energyRoutes.js`
- **ข้อผิดพลาด:** ดึงข้อมูลจาก `hourly` bucket เพียงอย่างเดียว
- **ผลกระทบ:** กราฟแท่งของ "ชั่วโมงปัจจุบัน" จะเป็น 0 หรือไม่มีข้อมูล จนกว่าจะครบชั่วโมงและ Task ทำงานเสร็จ (Delay ~1 ชั่วโมง)

---

## ✅ STEP-BY-STEP FIX IMPLEMENTATION
ให้ดำเนินการแก้ไขตามลำดับต่อไปนี้ เพื่อเคลียร์ Logic ให้ถูกต้องและแม่นยำ

### STEP 1: ล้าง Code ที่ซ้ำซ้อนใน Server.js (Fix Route Conflict)
**ไฟล์:** `src/server.js`
**การกระทำ:** ลบ (Delete) หรือ Comment Out โค้ดส่วนที่เป็น Route Hardcoded ทิ้งทั้งหมด เพื่อให้ระบบไปใช้ `routes/energyRoutes.js` แทน

```javascript
// ---------------------------------------------------------
// ❌ DELETE or COMMENT OUT these lines in server.js (~Line 822)
// ---------------------------------------------------------
/*
app.get('/api/energy/daily-consumption', async (req, res) => {
  // ... code ...
});

app.get('/api/energy/monthly-chart', async (req, res) => {
  // ... code ...
});

app.get('/api/energy/yearly-chart', async (req, res) => {
   // ... code ...
});

app.get('/api/energy/cost-history', async (req, res) => {
   // ... code ...
});
*/
// ---------------------------------------------------------
// ✅ KEEP ONLY THIS LINE (at the bottom)
// ---------------------------------------------------------
routes.setup(app, { influxService, energyState, firmwareManager });