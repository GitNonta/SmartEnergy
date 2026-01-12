/**
 * SMART Energy - Ingestor Service
 * ================================
 * รับผิดชอบงานหนัก (Heavy Write Operations):
 * - Subscribe MQTT topics
 * - Write raw data to InfluxDB
 * - Run alert detection logic
 * - Send Line notifications
 * - Log alerts to database
 * 
 * ทำงานแยก Process จาก server.js เพื่อไม่ให้ blocking การแสดงผล real-time
 * 
 * Start: npm run start:ingestor
 * PM2:   pm2 start ecosystem.config.js --only ingestor
 */

require('dotenv').config();
const mqtt = require('mqtt');

// Import services
const influxService = require('./services/influxdb');
const alertService = require('./services/alertService');
const lineService = require('./services/lineMessagingService');

// Configuration
const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';
const SERVICE_NAME = 'INGESTOR';

// Helper function
function formatLocal(date = new Date(), tz = TIMEZONE) {
  try {
    const s = date.toLocaleString('sv-SE', { timeZone: tz, hour12: false });
    return s.replace(' ', 'T');
  } catch {
    return date.toISOString();
  }
}

function log(message, type = 'info') {
  const timestamp = formatLocal(new Date());
  const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '📥';
  console.log(`[${timestamp}] ${prefix} [${SERVICE_NAME}] ${message}`);
}

// ========================================
// MQTT Configuration
// ========================================
const mqttConfig = {
  host: process.env.MQTT_BROKER_HOST || '202.29.50.41',
  port: parseInt(process.env.MQTT_BROKER_PORT) || 1883,
  protocol: process.env.MQTT_PROTOCOL || 'mqtt',
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: parseInt(process.env.RECONNECT_PERIOD) || 5000,
  connectTimeout: parseInt(process.env.CONNECT_TIMEOUT) || 30000,
  clientId: process.env.MQTT_CLIENT_ID || `smart_ingestor_${Math.floor(Math.random() * 1e6)}`
};

const topics = {
  data: process.env.MQTT_TOPIC_DATA || 'AI205/data',
  alerts: process.env.MQTT_TOPIC_ALERTS || 'AI205/alerts',
  alert: process.env.MQTT_TOPIC_ALERT || 'AI205/alert',
  status: process.env.MQTT_TOPIC_STATUS || 'AI205/status',
  notifications: process.env.MQTT_TOPIC_NOTIFICATIONS || 'AI205/notifications'
};

// ========================================
// Statistics
// ========================================
const stats = {
  messagesReceived: 0,
  dataWritten: 0,
  alertsGenerated: 0,
  errors: 0,
  startTime: new Date()
};

// ========================================
// MQTT Connection
// ========================================
const mqttUrl = `${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}`;
log(`Connecting to MQTT Broker: ${mqttUrl}`);

const mqttClient = mqtt.connect(mqttUrl, {
  clientId: mqttConfig.clientId,
  username: mqttConfig.username,
  password: mqttConfig.password,
  clean: true,
  reconnectPeriod: mqttConfig.reconnectPeriod,
  connectTimeout: mqttConfig.connectTimeout,
  keepalive: 60,
  resubscribe: true
});

// MQTT Event Handlers
mqttClient.on('connect', () => {
  log(`Connected to MQTT Broker: ${mqttUrl}`);
  
  // Subscribe to all topics
  Object.values(topics).forEach(topic => {
    mqttClient.subscribe(topic, { qos: 1 }, (err) => {
      if (err) {
        log(`Failed to subscribe to ${topic}: ${err.message}`, 'error');
      } else {
        log(`Subscribed to topic: ${topic}`);
      }
    });
  });
});

mqttClient.on('error', (error) => {
  log(`MQTT Error: ${error.message}`, 'error');
  stats.errors++;
});

mqttClient.on('close', () => {
  log('MQTT connection closed', 'warn');
});

mqttClient.on('reconnect', () => {
  log('MQTT Reconnecting...');
});

// ========================================
// Message Handler - HEAVY WORK HERE
// ========================================
mqttClient.on('message', async (topic, payload) => {
  stats.messagesReceived++;
  
  try {
    let payloadStr = payload.toString();
    // Fix trailing comma issue from ESP32
    payloadStr = payloadStr.replace(/,\s*}$/, '}');
    
    const message = JSON.parse(payloadStr);
    const deviceId = message.deviceId || 'AI205';
    
    // ========================================
    // Topic: Energy Data (Main workload)
    // ========================================
    if (topic === topics.data) {
      // 1. Write to InfluxDB (HEAVY)
      try {
        await influxService.writeRawData(message, deviceId);
        stats.dataWritten++;
        
        if (process.env.NODE_ENV !== 'production') {
          log(`Data written: ${Object.keys(message).length} fields`);
        }
      } catch (writeError) {
        log(`InfluxDB write failed: ${writeError.message}`, 'error');
        stats.errors++;
      }
      
      // 2. Check Alerts (HEAVY)
      try {
        const alerts = alertService.checkAlerts(message, deviceId);
        
        if (alerts.length > 0) {
          stats.alertsGenerated += alerts.length;
          log(`Generated ${alerts.length} alert(s)`);
          
          // 3. Log alerts to InfluxDB
          for (const alert of alerts) {
            try {
              await influxService.writeAlert(alert);
            } catch (alertWriteError) {
              log(`Alert write failed: ${alertWriteError.message}`, 'error');
            }
          }
          
          // 4. Send Line Notifications (if configured)
          if (lineService && typeof lineService.sendAlertNotification === 'function') {
            for (const alert of alerts) {
              try {
                await lineService.sendAlertNotification(alert);
              } catch (lineError) {
                // Silently fail - Line notification is optional
                if (process.env.NODE_ENV !== 'production') {
                  log(`Line notification failed: ${lineError.message}`, 'warn');
                }
              }
            }
          }
        }
      } catch (alertError) {
        log(`Alert check failed: ${alertError.message}`, 'error');
        stats.errors++;
      }
    }
    
    // ========================================
    // Topic: ESP Alerts
    // ========================================
    else if (topic === topics.alerts || topic === topics.alert) {
      const espAlert = {
        id: `esp_${Date.now()}`,
        deviceId,
        type: message.type || 'esp_alert',
        severity: message.level || 'warning',
        message: message.message || 'ESP device alert',
        value: null,
        rawData: {
          V1: message.V1, V2: message.V2, V3: message.V3,
          I1: message.I1, I2: message.I2, I3: message.I3,
          PFsys: message.PFsys
        },
        timestamp: new Date().toISOString()
      };
      
      // Write ESP alert to InfluxDB
      try {
        await influxService.writeAlert(espAlert);
        stats.alertsGenerated++;
        log(`ESP Alert: [${message.level}] ${message.type} - ${message.message}`);
      } catch (alertWriteError) {
        log(`ESP Alert write failed: ${alertWriteError.message}`, 'error');
      }
    }
    
    // ========================================
    // Topic: Device Status
    // ========================================
    else if (topic === topics.status) {
      // Status updates don't need disk writes
      // Just log for monitoring
      if (process.env.NODE_ENV !== 'production') {
        log(`Device status: ${message.status || 'unknown'}`);
      }
    }
    
    // ========================================
    // Topic: Notifications (Firmware updates, etc.)
    // ========================================
    else if (topic === topics.notifications) {
      if (message.event === 'firmware_updated') {
        const notification = {
          id: `notification_${Date.now()}`,
          deviceId,
          type: 'firmware_updated',
          severity: 'info',
          message: `${message.message}. Version: ${message.version}`,
          version: message.version,
          timestamp: message.timestamp || new Date().toISOString()
        };
        
        try {
          await influxService.writeAlert(notification);
          log(`Firmware notification logged: ${message.version}`);
        } catch (notifyWriteError) {
          log(`Notification write failed: ${notifyWriteError.message}`, 'error');
        }
      }
    }
    
  } catch (parseError) {
    log(`Message parse failed: ${parseError.message}`, 'error');
    stats.errors++;
    
    if (process.env.NODE_ENV !== 'production') {
      console.error('Raw payload:', payload.toString().substring(0, 200));
    }
  }
});

// ========================================
// Startup & Health Check
// ========================================
async function start() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📥 SMART Energy - Ingestor Service');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 MQTT Broker:    ${mqttUrl}`);
  console.log(`📋 Topics:         ${Object.values(topics).join(', ')}`);
  
  // Test InfluxDB connection
  const influxHealth = await influxService.testConnection();
  if (influxHealth.success) {
    console.log(`💾 InfluxDB:       ${process.env.INFLUXDB_URL} ✅`);
    console.log(`📊 Buckets:        ${Object.values(influxService.buckets).join(', ')}`);
  } else {
    console.log(`💾 InfluxDB:       ${process.env.INFLUXDB_URL} ❌`);
    console.log(`⚠️  Warning:       ${influxHealth.error}`);
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  // Stats logging interval (every 5 minutes)
  setInterval(() => {
    const uptime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000 / 60);
    log(`Stats: ${stats.messagesReceived} msgs, ${stats.dataWritten} writes, ${stats.alertsGenerated} alerts, ${stats.errors} errors, uptime ${uptime}m`);
  }, 5 * 60 * 1000);
}

// ========================================
// Graceful Shutdown
// ========================================
process.on('SIGINT', async () => {
  log('Shutting down gracefully...');
  
  mqttClient.end(true);
  
  try {
    await influxService.close();
  } catch (e) {
    // Ignore
  }
  
  console.log('');
  console.log('📊 Final Stats:');
  console.log(`   Messages received: ${stats.messagesReceived}`);
  console.log(`   Data written:      ${stats.dataWritten}`);
  console.log(`   Alerts generated:  ${stats.alertsGenerated}`);
  console.log(`   Errors:            ${stats.errors}`);
  console.log('');
  
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.emit('SIGINT');
});

// Start the service
start();
