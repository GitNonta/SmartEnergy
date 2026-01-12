# วิธีการตั้งค่า Gemini API สำหรับการวิเคราะห์ความผิดปกติแรงดันไฟฟ้า

## ขั้นตอนการขอ API Key

1. **เข้าสู่ Google AI Studio**
   - ไปที่: https://aistudio.google.com/app/apikey
   - เข้าสู่ระบบด้วย Google Account

2. **สร้าง API Key**
   - คลิก "Create API Key"
   - เลือก Google Cloud Project (หรือสร้างใหม่)
   - คัดลอก API Key ที่ได้

3. **ตั้งค่าใน Project**

   สร้างไฟล์ `.env.local` ใน `frontend/`:
   ```bash
   REACT_APP_GEMINI_API_KEY=AIzaSy...your_api_key_here
   ```

4. **Restart Development Server**
   ```bash
   cd frontend
   npm start
   ```

## การทดสอบ

1. เปิดหน้า Dashboard
2. รอให้เห็นกราฟแรงดันไฟฟ้า 3 เฟส
3. เมื่อแรงดันผิดปกติ (นอกช่วง 218-222V):
   - จะแสดงปุ่ม "✨ วิเคราะห์"
   - คลิกเพื่อให้ AI วิเคราะห์สาเหตุ

## โมเดลที่ใช้

- **gemini-2.0-flash-exp**: โมเดลล่าสุด (Fast & Free)
- รองรับภาษาไทย
- วิเคราะห์สาเหตุความผิดปกติได้แม่นยำ

## Quota & Limits

- **Free Tier**: 15 requests/minute
- **Rate Limit**: 1,500 requests/day
- เพียงพอสำหรับการใช้งานปกติ

## ตัวอย่างการวิเคราะห์

เมื่อแรงดัน Phase 1 = 210V (ต่ำกว่าปกติ):

```
สาเหตุที่เป็นไปได้:
1. โหลดไม่สมดุล - อุปกรณ์ใช้ไฟมากเกินไป
2. แรงดันจ่ายจากระบบไฟฟ้าไม่เสถียร
3. สายไฟหรือเบรกเกอร์มีปัญหา
4. หม้อแปลงใกล้เต็มกำลัง

คำแนะนำ:
- ตรวจสอบโหลดไฟฟ้าทั้ง 3 เฟส
- ติดต่อช่างไฟฟ้าตรวจสอบระบบ
```

## หมายเหตุ

- ไม่ควร commit `.env.local` เข้า Git
- ไฟล์ `.env.local` ถูก ignore โดย `.gitignore` แล้ว
- API Key เป็นความลับ - เก็บรักษาให้ดี
