# SMART Energy Monitor - System Analysis & Tester Script

## ⚠️ AI System Audit Report
**"ฉันได้พบตำแหน่งข้อผิดพลาดทาง logic และ โค้ดไวยกรณ์ที่ผิดอย่างร้ายแรง ทางฝัง backend โดยมันจะส่งผลกระทบต่อการทำงานทางฝั่ง frontend ซึ่งอาจจะได้ข้อมูลการประมวณผลที่ไม่ถูก โปรดหาข้อผิดพลาดการทำงานเหล่านั้นอย่างละเอียด"**

จากการตรวจสอบ Source Code ทั้งหมด ผมพบความผิดปกติที่ส่งผลกระทบต่อความถูกต้องของข้อมูล (Data Integrity) และการแสดงผล (Frontend Consistency) ดังนี้:

### 1. ❌ Route Conflict & Dead Code (การทับซ้อนของ API Endpoint)
**ตำแหน่ง:** `server.js` (บรรทัด ~630) vs `energyRoutes.js`
- **ปัญหา:** ในไฟล์ `server.js` มีการประกาศ Endpoint `app.get('/api/energy/daily-consumption')` เอาไว้แบบ Hardcode แต่ในขณะเดียวกันก็มีการเรียกใช้ `routes.setup` ซึ่งโหลด `energyRoutes.js` ที่มี Endpoint เดียวกัน (`router.get('/daily-consumption')`)
- **Logic Error:** เนื่องจาก Express.js จะทำงานแบบ First-match (เจออันไหนก่อนเอาอันนั้น) ทำให้โค้ดใน `server.js` ทำงานก่อนเสมอ ส่วนโค้ดใน `energyRoutes.js` (ซึ่งดูเหมือนจะเป็นเวอร์ชันที่ใหม่กว่าและ Modular กว่า) **กลายเป็น Dead Code ที่ไม่มีวันถูกเรียกใช้งาน**
- **ผลกระทบ:** หากทีมพัฒนาไปแก้ไข Logic ใน `energyRoutes.js` เพื่อปรับปรุงการคำนวณ Frontend จะไม่เห็นการเปลี่ยนแปลงใดๆ เพราะ Server ยังรัน Logic เก่าที่ฝังอยู่ใน `server.js`

### 2. ❌ Cost Calculation Inconsistency (สูตรคำนวณค่าไฟไม่ตรงกัน)
**ตำแหน่ง:** `server.js` (Endpoint `/api/energy/cost-history`) vs `summaryRoutes.js` (Endpoint `/api/summary/dashboard`)
- **ปัญหา:** มีการใช้มาตรฐานการคำนวณค่าไฟ 2 แบบในระบบเดียวกัน
    1. **Cost History Chart (`server.js`):** ใช้สูตร **Progressive Rate (อัตราก้าวหน้า)** โดยมี `TARIFF_TIERS` (0-15 หน่วย, 16-25 หน่วย ฯลฯ)
    2. **Dashboard Summary (`summaryRoutes.js`):** ใช้สูตร **Flat Rate (อัตราคงที่)** โดยรับค่า `costPerUnit` (Default 4.0) เข้าไปคูณดื้อๆ
- **ผลกระทบ:** ตัวเลข "ค่าไฟรวม" ที่แสดงในกล่อง Dashboard (Summary) จะ **ไม่ตรง** กับยอดรวมในกราฟแท่ง (Chart) ทำให้ User สับสนว่าตกลงค่าไฟคือเท่าไหร่กันแน่ (Logic ผิดพลาดอย่างร้ายแรงในแง่ Accounting)

### 3. ❌ Calculation Method Mismatch (วิธีการคำนวณพลังงานขัดแย้งกัน)
**ตำแหน่ง:** `server.js` vs `influxTasks.js`
- **ปัญหา:**
    - ใน `server.js` (ที่ทำงานอยู่จริง) คำนวณพลังงานรายวันโดยใช้สูตร: `Power (kW) mean * 1 hour` (Integral approximation) จากข้อมูล Raw
    - แต่ใน `influxTasks.js` (ระบบ Downsampling) และ `energyRoutes.js` พยายามใช้ข้อมูล `energy_total` (Cumulative Counter) จาก Bucket `hourly`
- **Logic Error:** การคำนวณจาก Power Mean (ค่าเฉลี่ยกำลังไฟ) ให้ความแม่นยำต่ำกว่าการใช้ค่า Cumulative Counter (มิเตอร์อ่านหน่วย) โดยตรง หากไฟตกหรือข้อมูลขาดช่วง ค่าที่คำนวณได้จาก 2 วิธีนี้จะไม่เท่ากัน
- **ผลกระทบ:** ข้อมูลกราฟรายวันที่แสดงผล อาจจะไม่ตรงกับหน่วยมิเตอร์จริงที่เก็บใน Database ระยะยาว

### 4. ❌ Timezone Awareness in Aggregation (ตัดรอบวันผิดเวลา)
**ตำแหน่ง:** `influxTasks.js`
- **ปัญหา:** ใน Script ของ InfluxDB Flux Task สำหรับการทำ Aggregate รายวัน (`aggregateWindow(every: 1d)`) ไม่มีการระบุ `option location` หรือ Timezone offset
- **Logic Error:** InfluxDB จะตัดรอบวันที่เวลา 00:00 UTC ซึ่งตรงกับ **07:00 น. ของประเทศไทย**
- **ผลกระทบ:** ยอดการใช้พลังงานของ "วันนี้" จะรวมเอา 7 ชั่วโมงแรกของวันพรุ่งนี้เข้าไปด้วย หรือค่าของช่วงเช้า (00:00-06:59) จะถูกปัดไปเป็นของเมื่อวาน ทำให้รายงานรายวันผิดเพี้ยนทั้งหมด

---

## 🛠️ Tester Script (ขั้นตอนการทดสอบเพื่อยืนยันข้อผิดพลาด)

ให้ QA หรือ Developer ใช้ Script นี้ในการยิงทดสอบระบบเพื่อยืนยัน Bug ที่รายงานข้างต้น

### Step 1: Verify Route Conflict
1. แก้ไขไฟล์ `energyRoutes.js` ที่ endpoint `/daily-consumption` โดยเพิ่ม `console.log(">>>> ENERGY ROUTES HIT <<<<");`
2. Restart Server
3. ยิง API: `GET /api/energy/daily-consumption`
4. **Expected Result (ถ้าถูกต้อง):** ต้องเห็น Log `>>>> ENERGY ROUTES HIT <<<<`
5. **Actual Result (Bug):** ไม่เห็น Log ดังกล่าว (เพราะไปเข้า Route ใน `server.js` แทน)

### Step 2: Verify Cost Mismatch
1. เตรียมข้อมูล: บันทึกข้อมูลหลอกๆ ให้มีการใช้ไฟ 100 หน่วย (kWh) ใน 1 วัน
2. ยิง API 1: `GET /api/summary/dashboard?costPerUnit=4`
    - คาดการณ์: 100 * 4 = **400 บาท**
3. ยิง API 2: `GET /api/energy/cost-history` (ซึ่งใช้ Progressive Rate)
    - คาดการณ์: คำนวณตาม Tier (2.3488... + 4.4217...) จะได้ประมาณ **~350-450 บาท** (ไม่เท่ากับ 400 เป๊ะ)
4. **Result:** เปรียบเทียบค่า `totalCost` จากทั้งสอง API ถ้าไม่เท่ากัน = Bug confirmed

### Step 3: Verify Timezone Cutoff
1. ดูข้อมูลกราฟรายวัน (`/api/energy/daily-consumption`)
2. เปรียบเทียบข้อมูลช่วงเวลา **00:00 - 06:59**
3. **Check:** ข้อมูลช่วงนี้ไปโผล่ในกราฟของ "วันนี้" หรือ "เมื่อวาน"?
    - หากระบบตัดรอบผิด (UTC) ข้อมูลหลังเที่ยงคืนไทย จะยังถูกนับเป็นวันเก่าจนกว่าจะถึง 7 โมงเช้า

### Step 4: JSON Syntax Resilience
1. จำลองส่ง MQTT Message ที่ผิดรูปแบบ: `{"V1": 220, "I1": 5,}` (มี comma เกินท้ายสุด)
2. ดู Console Log ของ `smart-ingestor`
3. **Check:**
    - หากใช้ `JSON.parse` โดยไม่มี Regex แก้ไขก่อน -> **App Crash**
    - หากมี Regex `replace(/,\s*}$/, '}')` -> **Pass (รอดตาย)** แต่ต้องระวังกรณี `{"data": [1,2,]}` (Array trailing comma) ซึ่ง Regex นี้อาจแก้ไม่ได้

---

## 📝 Recommendations (ข้อแนะนำในการแก้ไข)

1. **Cleanup Server.js:** ลบ Route `app.get('/api/energy/...')` และ `app.get('/api/summary/...')` ออกจาก `server.js` ให้หมด แล้วให้ใช้ผ่าน `routes.setup()` เท่านั้น เพื่อให้ Code เป็น Modular จริงๆ
2. **Unify Cost Logic:** สร้าง Service กลาง `calculateElectricityBill(kWh)` ใน `energyCalculation.js` ที่รองรับ Progressive Rate แล้วให้ทั้ง Dashboard และ Chart เรียกใช้ฟังก์ชันเดียวกัน
3. **Fix Timezone:** เพิ่ม `import "timezone"` และ `option location = timezone.location(name: "Asia/Bangkok")` ในไฟล์ `influxTasks.js` ทุก Task
4. **Use Counter Difference:** เปลี่ยน Logic การคำนวณพลังงานรายวัน ให้ใช้ `difference()` ของค่า `Ep_total` (หน่วยมิเตอร์สะสม) แทนการใช้ `mean(power) * time` เพื่อความแม่นยำสูงสุด