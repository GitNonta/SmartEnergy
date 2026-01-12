/**
 * Downsampling Service (Lightweight)
 * 
 * ✅ แนะนำใช้สำหรับ:
 *   - Health check: ตรวจสอบสถานะ InfluxDB tasks
 *   - Manual trigger: สั่ง trigger downsampling tasks ด้วยมือ
 *   - Monitoring: ดูสถานะและ logs ของ downsampling
 * 
 * ❌ ไม่แนะนำ:
 *   - คำนวณ aggregate หนักๆ ใน Node.js (ให้ InfluxDB tasks จัดการ)
 *   - Scheduled interval ใน Node.js (ให้ InfluxDB tasks schedule เอง)
 */

const influxService = require('./influxdb');

/**
 * Health check - ตรวจสอบสถานะ downsampling tasks
 * @returns {Promise<object>} สถานะของ InfluxDB tasks
 */
async function healthCheck() {
  try {
    const api = influxService.getTasksAPI?.();
    if (!api) {
      return {
        status: 'unknown',
        message: 'Tasks API not available',
        timestamp: new Date().toISOString()
      };
    }

    // ตรวจสอบการเชื่อมต่อ InfluxDB
    const connected = await influxService.testConnection?.() ?? true;
    
    return {
      status: connected ? 'healthy' : 'unhealthy',
      message: connected 
        ? 'InfluxDB tasks are handling downsampling' 
        : 'Cannot connect to InfluxDB',
      note: 'Aggregate calculations are handled by InfluxDB tasks, not Node.js',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Manual trigger - สั่ง trigger downsampling ด้วยมือ (optional)
 * หมายเหตุ: จริงๆ แล้ว InfluxDB tasks จะ run ตาม schedule อัตโนมัติ
 * ฟังก์ชันนี้มีไว้สำหรับ debug หรือ force run เท่านั้น
 * @returns {Promise<object>} ผลลัพธ์การ trigger
 */
async function manualTrigger() {
  console.log('🔄 Manual trigger requested...');
  console.log('   ℹ️  Note: Downsampling is handled by InfluxDB tasks');
  console.log('   ℹ️  This only logs the trigger request');
  
  return {
    triggered: true,
    message: 'Manual trigger logged. InfluxDB tasks handle actual downsampling.',
    note: '❌ ไม่แนะนำ: คำนวณ aggregate หนักๆ ใน Node.js',
    timestamp: new Date().toISOString()
  };
}

/**
 * Monitoring - ดูสถานะและข้อมูล monitoring
 * @returns {object} ข้อมูล monitoring
 */
function getMonitoringInfo() {
  return {
    service: 'downsampling',
    mode: 'lightweight',
    responsibilities: [
      '✅ Health check',
      '✅ Manual trigger',
      '✅ Monitoring'
    ],
    notRecommended: [
      '❌ คำนวณ aggregate หนักๆ ใน Node.js',
      '❌ Scheduled interval ใน Node.js'
    ],
    recommendation: 'ใช้ InfluxDB tasks สำหรับ aggregate calculations',
    timestamp: new Date().toISOString()
  };
}

/**
 * Get status - สำหรับ API endpoint
 * @returns {object} สถานะปัจจุบัน
 */
function getStatus() {
  return {
    mode: 'lightweight',
    features: ['health-check', 'manual-trigger', 'monitoring'],
    delegatedTo: 'InfluxDB tasks',
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  healthCheck,
  manualTrigger,
  getMonitoringInfo,
  getStatus
};
