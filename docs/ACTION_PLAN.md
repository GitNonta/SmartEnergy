# ACTION PLAN: SMART Energy System Fixes & Deployment
**Date:** 2026-01-22
**Status:** Ready for Implementation

เอกสารนี้ระบุขั้นตอนการแก้ไขปัญหาทางเทคนิค (Technical Fixes) และการเตรียมระบบเพื่อใช้งานจริง (Deployment Setup) โดยแบ่งเป็น 3 ระยะตามลำดับความสำคัญ

---

## 🛑 Phase 1: Critical Bug Fixes (API Sync)
**เป้าหมาย:** แก้ไขปัญหา Endpoint ไม่ตรงกันที่ทำให้ Test Script และ Frontend เรียกใช้งานไม่ได้

### 1.1 Fix Notification Endpoint
**ปัญหา:** Frontend/Test เรียก `/api/notifications/settings` แต่ Backend มีแค่ `/api/notifications/line/config`
**วิธีแก้ไข:** เพิ่ม Route Alias ในไฟล์ `src/routes/notificationRoutes.js` เพื่อให้รองรับทั้ง 2 URL

**Action:** เปิดไฟล์ `src/routes/notificationRoutes.js` และเพิ่มโค้ดนี้ก่อน `return router;`

```javascript
  // Alias for compatibility with Frontend/Test Script
  router.get('/settings', (req, res) => {
    // Redirect logic internal or call getStatus
    try {
        const status = lineMessagingService.getStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
  });
  
  router.post('/settings', (req, res) => {
    // Forward to update config
    try {
      const { channelAccessToken, subscribers } = req.body;
      lineMessagingService.updateConfig({ channelAccessToken, subscribers });
      res.json({ success: true, message: 'Configuration updated (via alias)' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });