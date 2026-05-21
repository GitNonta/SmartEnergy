const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

// Import InfluxDB service
const influxService = require('./services/influxdb');
const energyCalc = require('./services/energyCalculation');
const downsampling = require('./services/downsampling');
const FirmwareManager = require('./services/firmwareManager');
const energyState = require('./services/energyState'); // ✅ NEW
const alertService = require('./services/alertService'); // ✅ Alert processing
const { compileService } = require('./services/compileService'); // ✅ Arduino compile
const routes = require('./routes'); // ✅ Modular routes for /api/summary, /api/energy, etc.
const { initDatabase, testConnection: testDbConnection } = require('./services/db'); // ✅ MySQL Database
const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';

function formatLocal(date = new Date(), tz = TIMEZONE) {
  try {
    const s = date.toLocaleString('sv-SE', { timeZone: tz, hour12: false });
    return s.replace(' ', 'T');
  } catch {
    return date.toISOString();
  }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: true, // ✅ Allow all origins (Reflects the request origin)
  credentials: true // Allow cookies/headers
}));
app.use(express.json());

// Cookie parser for HttpOnly JWT cookies
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Middleware: Support binary uploads for firmware
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

// Store connected WebSocket clients
const clients = new Set();

// MQTT Configuration
const mqttConfig = {
  host: process.env.MQTT_BROKER_HOST || '202.29.50.41',
  port: parseInt(process.env.MQTT_BROKER_PORT) || 1883,
  protocol: process.env.MQTT_PROTOCOL || 'mqtt',
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: parseInt(process.env.RECONNECT_PERIOD) || 5000,
  connectTimeout: parseInt(process.env.CONNECT_TIMEOUT) || 30000,
  clientId: process.env.MQTT_CLIENT_ID || `smart_backend_${Math.floor(Math.random() * 1e6)}`
};

// MQTT Topics
const topics = {
  data: process.env.MQTT_TOPIC_DATA || 'AI205/data',
  alerts: process.env.MQTT_TOPIC_ALERTS || 'AI205/alerts',
  alert: process.env.MQTT_TOPIC_ALERT || 'AI205/alert',  // ESP device alerts (singular)
  status: process.env.MQTT_TOPIC_STATUS || 'AI205/status',
  commands: process.env.MQTT_TOPIC_COMMANDS || 'AI205/commands',
  notifications: process.env.MQTT_TOPIC_NOTIFICATIONS || 'AI205/notifications'  // Firmware update notifications
};

// Connect to MQTT Broker
const mqttUrl = `${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}`;
console.log(`🔌 Connecting to MQTT Broker: ${mqttUrl}`);

const mqttClient = mqtt.connect(mqttUrl, {
  clientId: mqttConfig.clientId,
  username: mqttConfig.username,
  password: mqttConfig.password,
  clean: true,
  reconnectPeriod: mqttConfig.reconnectPeriod,
  connectTimeout: mqttConfig.connectTimeout,
  // Additional options for better stability
  keepalive: 60, // Send keepalive every 60 seconds
  protocolVersion: 4, // Use MQTT v3.1.1
  will: {
    topic: 'AI205/status',
    payload: JSON.stringify({ status: 'backend_disconnected', timestamp: new Date().toISOString() }),
    qos: 0,
    retain: false
  }
});

// MQTT Event Handlers
mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker');
  
  // Subscribe to all topics
  Object.values(topics).forEach(topic => {
    mqttClient.subscribe(topic, (err) => {
      if (err) {
        console.error(`❌ Failed to subscribe to ${topic}:`, err);
      } else {
        console.log(`📡 Subscribed to topic: ${topic}`);
      }
    });
  });
  
  // Broadcast connection status to all WebSocket clients
  broadcastToClients({
    type: 'mqtt_status',
    status: 'connected',
    timestamp: new Date().toISOString(),
    timestampLocal: formatLocal(new Date(), TIMEZONE),
    timezone: TIMEZONE
  });

  // Initialize Firmware Manager after MQTT connects
  initializeFirmwareManager();
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT Error:', error);
  broadcastToClients({
    type: 'mqtt_status',
    status: 'error',
    error: error.message,
    timestamp: new Date().toISOString(),
    timestampLocal: formatLocal(new Date(), TIMEZONE),
    timezone: TIMEZONE
  });
});

mqttClient.on('offline', () => {
  console.warn('⚠️  MQTT Client Offline - Will auto-reconnect...');
  broadcastToClients({
    type: 'mqtt_status',
    status: 'offline',
    timestamp: new Date().toISOString(),
    timestampLocal: formatLocal(new Date(), TIMEZONE),
    timezone: TIMEZONE
  });
});

mqttClient.on('reconnect', () => {
  console.log('🔄 MQTT Reconnecting...');
  broadcastToClients({
    type: 'mqtt_status',
    status: 'reconnecting',
    timestamp: new Date().toISOString(),
    timestampLocal: formatLocal(new Date(), TIMEZONE),
    timezone: TIMEZONE
  });
});

mqttClient.on('close', () => {
  console.warn('⚠️  MQTT Connection Closed - Auto-reconnect enabled');
  broadcastToClients({
    type: 'mqtt_status',
    status: 'closed',
    timestamp: new Date().toISOString(),
    timestampLocal: formatLocal(new Date(), TIMEZONE),
    timezone: TIMEZONE
  });
});

// Handle successful reconnection
mqttClient.on('reconnect', () => {
  console.log('🔄 MQTT Reconnected - Resubscribing to topics...');
  
  // Resubscribe to all topics after reconnect
  Object.values(topics).forEach(topic => {
    mqttClient.subscribe(topic, (err) => {
      if (err) {
        console.error(`❌ Failed to resubscribe to ${topic}:`, err);
      } else {
        console.log(`📡 Resubscribed to topic: ${topic}`);
      }
    });
  });
});

// Store recent alerts in memory (last 100)
const recentAlerts = [];
function storeAlert(alert) {
  const alertWithId = {
    id: alert.id || `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    read: alert.read === undefined ? false : alert.read,
    ...alert
  };
  recentAlerts.unshift(alertWithId);
  if (recentAlerts.length > 100) {
    recentAlerts.pop();
  }
}

// Handle incoming MQTT messages
mqttClient.on('message', async (topic, payload) => {
  try {
    let payloadStr = payload.toString();
    // Fix trailing comma issue from ESP32 (invalid JSON)
    // Replace ",}" with "}" at the end of the JSON object
    payloadStr = payloadStr.replace(/,\s*}$/, '}');
    
    const message = JSON.parse(payloadStr);
    
    // Add metadata
    const enrichedMessage = {
      type: 'mqtt_message',
      topic: topic,
      data: message,
      timestamp: message.timestamp || new Date().toISOString(),
      timestampLocal: formatLocal(new Date(), TIMEZONE),
      receivedAt: new Date().toISOString(),
      receivedAtLocal: formatLocal(new Date(), TIMEZONE),
      timezone: TIMEZONE
    };
    
    // Determine message type based on topic
    if (topic === topics.data) {
      enrichedMessage.messageType = 'energy_data';
      
      // ✅ SERVER: ไม่เขียนลง DB - ingestor.js ทำหน้าที่นี้แทน
      // อัปเดต RAM state สำหรับ API response ที่รวดเร็ว
      if (energyState && typeof energyState.updateFromMqtt === 'function') {
        try {
          energyState.updateFromMqtt(message, 'AI205');
        } catch (e) {
          // Ignore - RAM update is optional
        }
      }
      
      // ✅ Real-time alert checking (broadcast only, no write)
      const realtimeAlerts = alertService.checkAlerts(message, 'AI205');
      if (realtimeAlerts.length > 0) {
        console.log(`🚨 Generated ${realtimeAlerts.length} alert(s) from energy data`);
        realtimeAlerts.forEach(alert => {
          storeAlert(alert); // RAM only
          broadcastToClients({
            type: 'mqtt_message',
            messageType: 'alert',
            data: alert,
            timestamp: alert.timestamp,
            timestampLocal: formatLocal(new Date(), TIMEZONE),
            timezone: TIMEZONE
          });
        });
      }
    } else if (topic === topics.alerts || topic === topics.alert) {
      // Handle both AI205/alerts and AI205/alert topics
      enrichedMessage.messageType = 'esp_alert';
      
      // Store the ESP alert for history
      const espAlert = {
        id: `esp_${Date.now()}`,
        deviceId: 'AI205',
        type: message.type || 'esp_alert',
        severity: message.level || 'warning',
        message: message.message || 'ESP device alert',
        value: null,
        rawData: {
          V1: message.V1,
          V2: message.V2,
          V3: message.V3,
          I1: message.I1,
          I2: message.I2,
          I3: message.I3,
          PFsys: message.PFsys
        },
        timestamp: new Date().toISOString()
      };
      storeAlert(espAlert);
      console.log(`🚨 ESP Alert [${message.level}]: ${message.type} - ${message.message}`);
    } else if (topic === topics.status) {
      enrichedMessage.messageType = 'status';
    } else if (topic === topics.notifications) {
      enrichedMessage.messageType = 'notification';
      console.log(`📢 Notification received: ${message.event} - ${message.message}`);
      
      // Store firmware update notification like an alert
      if (message.event === 'firmware_updated') {
        const notification = {
          id: `notification_${Date.now()}`,
          deviceId: 'AI205',
          type: 'firmware_updated',
          severity: 'info',
          message: `${message.message}. Version: ${message.version}`,
          version: message.version,
          timestamp: message.timestamp || new Date().toISOString()
        };
        storeAlert(notification);
      }
    }
    
    // Broadcast to all connected WebSocket clients
    broadcastToClients(enrichedMessage);
    
    // Log (optional, can be disabled in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📨 MQTT Message [${topic}]:`, {
        keys: Object.keys(message),
        timestamp: enrichedMessage.timestamp
      });
    }
  } catch (error) {
    console.error(`❌ Failed to parse MQTT message from ${topic}:`, error);
    console.error('Raw payload:', payload.toString());
  }
});

// WebSocket Server
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`🔗 WebSocket client connected from ${clientIp}`);
  
  clients.add(ws);
  
  // Handle WebSocket errors to prevent crash/spam
  ws.on('error', (err) => {
    if (err.message.includes('Invalid WebSocket frame') || err.message.includes('ECONNRESET')) {
      // Ignore common network/protocol errors
      return;
    }
    console.error('❌ WebSocket error:', err);
  });
  
  // Send welcome message with current MQTT status
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to SMART Energy WebSocket Server',
    mqttStatus: mqttClient.connected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    timestampLocal: formatLocal(new Date(), TIMEZONE),
    timezone: TIMEZONE
  }));
  
  // Handle incoming WebSocket messages (e.g., commands from frontend)
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle different message types
      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString(),
            timestampLocal: formatLocal(new Date(), TIMEZONE),
            timezone: TIMEZONE
          }));
          break;
          
        case 'mqtt_command':
          // Publish command to MQTT
          if (data.topic && data.payload) {
            mqttClient.publish(data.topic, JSON.stringify(data.payload), (err) => {
              if (err) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Failed to publish MQTT command',
                  error: err.message
                }));
              } else {
                ws.send(JSON.stringify({
                  type: 'command_sent',
                  topic: data.topic,
                  timestamp: new Date().toISOString()
                }));
              }
            });
          }
          break;
          
        case 'get_status':
          ws.send(JSON.stringify({
            type: 'status',
            mqtt: {
              connected: mqttClient.connected,
              topics: Object.values(topics)
            },
            websocket: {
              connectedClients: clients.size
            },
            timestamp: new Date().toISOString(),
            timestampLocal: formatLocal(new Date(), TIMEZONE),
            timezone: TIMEZONE
          }));
          break;
          
        default:
          console.warn('⚠️  Unknown WebSocket message type:', data.type);
      }
    } catch (error) {
      console.error('❌ Error handling WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
        error: error.message
      }));
    }
  });
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`❌ WebSocket client disconnected. Remaining clients: ${clients.size}`);
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast message to all connected WebSocket clients
function broadcastToClients(message) {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
      sentCount++;
    }
  });
  
  if (sentCount > 0 && process.env.NODE_ENV !== 'production') {
    console.log(`📤 Broadcasted to ${sentCount} client(s)`);
  }
}

// REST API Endpoints
app.get('/health', async (req, res) => {
  const influxHealth = await influxService.testConnection();
  
  res.json({
    status: 'ok',
    mqtt: {
      connected: mqttClient.connected,
      topics: Object.values(topics)
    },
    websocket: {
      connectedClients: clients.size
    },
    influxdb: {
      connected: influxHealth.success,
      buckets: influxService.buckets
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    serverTimeLocal: formatLocal(new Date(), TIMEZONE),
    timezone: TIMEZONE
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    mqtt: {
      connected: mqttClient.connected,
      broker: `${mqttConfig.host}:${mqttConfig.port}`,
      topics: topics
    },
    websocket: {
      port: process.env.WS_PORT || 8080,
      connectedClients: clients.size
    },
    influxdb: {
      url: process.env.INFLUXDB_URL,
      org: process.env.INFLUXDB_ORG,
      buckets: influxService.buckets
    },
    timestamp: new Date().toISOString(),
    timestampLocal: formatLocal(new Date(), TIMEZONE),
    timezone: TIMEZONE
  });
});

// ===================================
// Device Control APIs (ESP via MQTT)
// ===================================

// POST /api/device/restart - Restart ESP device via MQTT
app.post('/api/device/restart', (req, res) => {
  try {
    if (!mqttClient.connected) {
      return res.status(503).json({
        success: false,
        error: 'MQTT broker not connected'
      });
    }

    const command = {
      action: 'restart',
      timestamp: new Date().toISOString(),
      source: 'backend_api'
    };

    mqttClient.publish(topics.commands, JSON.stringify(command), { qos: 1 }, (err) => {
      if (err) {
        console.error('❌ Failed to publish restart command:', err);
        return res.status(500).json({
          success: false,
          error: 'Failed to send restart command'
        });
      }

      console.log('🔄 Restart command sent to ESP device');
      res.json({
        success: true,
        message: 'Restart command sent to ESP device',
        topic: topics.commands,
        command,
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('❌ Error in /api/device/restart:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/device/command - Send custom command to ESP
app.post('/api/device/command', (req, res) => {
  try {
    if (!mqttClient.connected) {
      return res.status(503).json({
        success: false,
        error: 'MQTT broker not connected'
      });
    }

    const { action, params } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action is required'
      });
    }

    const command = {
      action,
      params: params || {},
      timestamp: new Date().toISOString(),
      source: 'backend_api'
    };

    mqttClient.publish(topics.commands, JSON.stringify(command), { qos: 1 }, (err) => {
      if (err) {
        console.error('❌ Failed to publish command:', err);
        return res.status(500).json({
          success: false,
          error: 'Failed to send command'
        });
      }

      console.log(`📤 Command "${action}" sent to ESP device`);
      res.json({
        success: true,
        message: `Command "${action}" sent to ESP device`,
        topic: topics.commands,
        command,
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('❌ Error in /api/device/command:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/device/status - Request ESP device status via MQTT
app.get('/api/device/request-status', (req, res) => {
  try {
    if (!mqttClient.connected) {
      return res.status(503).json({
        success: false,
        error: 'MQTT broker not connected'
      });
    }

    const command = {
      action: 'status',
      timestamp: new Date().toISOString(),
      source: 'backend_api'
    };

    mqttClient.publish(topics.commands, JSON.stringify(command), { qos: 1 }, (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Failed to request status'
        });
      }

      res.json({
        success: true,
        message: 'Status request sent to ESP device',
        topic: topics.commands,
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// InfluxDB Query APIs

// Get historical data
app.get('/api/data/history', async (req, res) => {
  try {
    const { 
      range = '-1h', 
      deviceId = 'AI205', 
      fields,
      type = 'combined',  // 'combined' or 'per_phase'
      phase              // L1, L2, or L3 (for per_phase)
    } = req.query;
    
    const fieldArray = fields ? fields.split(',') : [];
    
    const data = await influxService.queryData({
      bucket: 'raw',
      range,
      deviceId,
      fields: fieldArray,
      measurementType: type,
      phase
    });
    
    res.json({
      success: true,
      count: data.length,
      range,
      deviceId,
      type,
      phase: phase || 'all',
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get data from a specific downsampled bucket directly
// bucket: raw | 1h | 1d | 1m | mn (or verbose: hourly|daily|monthly|billing)
app.get('/api/data/bucket', async (req, res) => {
  try {
    const {
      bucket = '1h',
      range = '-24h',
      deviceId = 'AI205',
      fields,
      type = 'combined', // 'combined' or 'per_phase'
      phase // L1, L2, or L3 (for per_phase)
    } = req.query;

    const map = {
      'raw': 'raw',
      '1h': 'hourly', 'hourly': 'hourly',
      '1d': 'daily',  'daily': 'daily',
      '1m': 'monthly','monthly': 'monthly',
      'mn': 'billing','billing': 'billing'
    };
    const key = String(bucket).toLowerCase();
    const resolvedBucket = map[key] || 'hourly';

    const fieldArray = fields ? String(fields).split(',') : [];

    const data = await influxService.queryData({
      bucket: resolvedBucket,
      range,
      deviceId,
      fields: fieldArray,
      measurementType: type,
      phase
    });

    res.json({
      success: true,
      bucket: resolvedBucket,
      bucketName: influxService.buckets[resolvedBucket],
      range,
      deviceId,
      type,
      phase: phase || 'all',
      count: data.length,
      data
    });
  } catch (error) {
    console.error('❌ Error in /api/data/bucket:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get per-phase data
app.get('/api/data/phases', async (req, res) => {
  try {
    const { range = '-1h', deviceId = 'AI205', phases } = req.query;
    
    const phaseArray = phases ? phases.split(',') : ['L1', 'L2', 'L3'];
    
    const data = await influxService.queryPerPhaseData({
      range,
      deviceId,
      phases: phaseArray
    });
    
    res.json({
      success: true,
      range,
      deviceId,
      phases: phaseArray,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get combined with phases breakdown
app.get('/api/data/combined-with-phases', async (req, res) => {
  try {
    const { range = '-1h', deviceId = 'AI205', limit = 500 } = req.query;
    
    const data = await influxService.queryCombinedWithPhases({
      range,
      deviceId
    });
    
    // Return success even if data is empty
    res.json({
      success: true,
      range,
      deviceId,
      data: data || { combined: [], phases: { L1: [], L2: [], L3: [] } }
    });
  } catch (error) {
    console.error('❌ Error in /api/data/combined-with-phases:', error);
    // Return partial data instead of 500 error
    res.json({
      success: true,
      range: req.query.range || '-1h',
      deviceId: req.query.deviceId || 'AI205',
      data: { combined: [], phases: { L1: [], L2: [], L3: [] } },
      warning: `Partial data due to: ${error.message}`
    });
  }
});

// Get downsampled data (NEW ENDPOINT for EnergyAccumulatedBlock)
app.get('/api/data/downsampled', async (req, res) => {
  try {
    const { timeRange = 'Real-time', limit = 1000, deviceId = 'AI205' } = req.query;
    
    // Convert timeRange to InfluxDB range format
    let range = '-5m'; // default for Real-time
    if (timeRange !== 'Real-time') {
      const rangeMap = {
        '1H': '-1h',
        '1D': '-1d',
        '1W': '-7d',
        '1M': '-30d',
        'MN': '-365d'
      };
      range = rangeMap[timeRange] || '-5m';
    }
    
    // Query data from InfluxDB
    const data = await influxService.queryData({
      bucket: 'raw',
      range,
      deviceId
    });
    
    res.json({
      success: true,
      timeRange,
      range,
      deviceId,
      count: data.length,
      data
    });
  } catch (error) {
    console.error('❌ Error in /api/data/downsampled:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 🔧 FIX: Route moved to energyRoutes.js
// The following was commented out to resolve Route Conflict
// See: docs/FIX_IMPLEMENTATION.md - STEP 1
// ============================================
/*
// ✅ Get daily consumption breakdown by hour (for 24H chart)
// ใช้ Power × Time (power_avg × 1h) จาก raw bucket โดยตรง
// ⚡ OPTIMIZED: Added caching for faster response

// Cache for daily consumption (30 second TTL)
let dailyConsumptionCache = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 30000; // 30 seconds

app.get('/api/energy/daily-consumption', async (req, res) => {
  try {
    const { deviceId = 'AI205' } = req.query;
    const now = Date.now();
    
    // ⚡ Check cache first
    if (dailyConsumptionCache.data && (now - dailyConsumptionCache.timestamp) < CACHE_TTL_MS) {
      console.log('📊 Daily consumption: Returning cached data');
      return res.json({
        ...dailyConsumptionCache.data,
        cached: true,
        cacheAge: Math.round((now - dailyConsumptionCache.timestamp) / 1000) + 's'
      });
    }
    
    console.log(`📊 Fetching daily consumption (hourly breakdown) for ${deviceId}...`);
    
    // ⚡ OPTIMIZED Flux query - minimal fields, fast aggregation
    const fluxQuery = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      todayStart = date.truncate(t: now(), unit: 1d)
      
      from(bucket: "${influxService.buckets.raw}")
        |> range(start: todayStart)
        |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
        |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
        |> drop(columns: ["_start", "_stop", "_measurement", "_field", "device_id"])
    `;
    
    const rows = await influxService.queryApi.collectRows(fluxQuery);
    console.log(`✅ Got ${rows.length} hourly power data points`);
    
    // Initialize all 24 hours with 0
    const hourlyMap = new Map();
    for (let i = 0; i < 24; i++) {
      hourlyMap.set(i, { power_avg: 0, energy: 0, quality: 'no_data' });
    }
    
    // Process power data - calculate energy = power_avg × 1 hour
    for (const row of rows) {
      const timestamp = new Date(row._time);
      const hour = timestamp.getHours();
      const power_kw = row._value || 0;
      
      // Energy = Power (kW) × Time (1 hour) = kWh
      const energy = power_kw * 1;
      
      if (hourlyMap.has(hour)) {
        const slot = hourlyMap.get(hour);
        slot.power_avg = power_kw;
        slot.energy = energy;
        slot.quality = 'calculated';
      }
    }
    
    // Convert to array format
    const result = [];
    let totalEnergy = 0;
    const currentHour = new Date().getHours();
    
    hourlyMap.forEach((values, hour) => {
      const hourLabel = String(hour).padStart(2, '0') + ':00';
      const energy = hour <= currentHour ? values.energy : 0;
      
      result.push({
        hour: hourLabel,
        energy_total: Number(energy.toFixed(4)),
        power_avg_kw: Number(values.power_avg.toFixed(4)),
        quality: hour <= currentHour ? values.quality : 'future'
      });
      
      if (hour <= currentHour) {
        totalEnergy += energy;
      }
    });
    
    // Sort by hour
    result.sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
    
    console.log(`✅ Daily consumption (Power×Time): ${totalEnergy.toFixed(3)} kWh`);
    
    const responseData = {
      success: true,
      source: 'InfluxDB raw (Power×Time)',
      calculationMethod: 'power_avg × 1h per hour',
      deviceId,
      hourlyData: result,
      totalEnergy: Number(totalEnergy.toFixed(3)),
      dataPoints: rows.length,
      currentHour,
      note: '✅ Energy calculated from Power × Time',
      cached: false
    };
    
    // ⚡ Update cache
    dailyConsumptionCache = { data: responseData, timestamp: now };
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ Error in /api/energy/daily-consumption:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
*/


// Get statistics for a field
app.get('/api/data/statistics', async (req, res) => {
  try {
    const { field = 'power_active', range = '-24h', deviceId = 'AI205' } = req.query;
    
    const stats = await influxService.getStatistics({
      field,
      range,
      deviceId
    });
    
    res.json({
      success: true,
      field,
      range,
      deviceId,
      count: stats.length,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent data (last N points)
app.get('/api/data/recent', async (req, res) => {
  try {
    const { limit = 100, deviceId = 'AI205' } = req.query;
    
    // Query last 5 minutes and limit results
    const data = await influxService.queryData({
      bucket: 'raw',
      range: '-5m',
      deviceId
    });
    
    // Return only last N points
    const recentData = data.slice(-parseInt(limit));
    
    res.json({
      success: true,
      count: recentData.length,
      limit: parseInt(limit),
      data: recentData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Publish MQTT message (for testing)
app.post('/api/mqtt/publish', (req, res) => {
  const { topic, message } = req.body;
  
  if (!topic || !message) {
    return res.status(400).json({
      error: 'Topic and message are required'
    });
  }
  
  mqttClient.publish(topic, JSON.stringify(message), (err) => {
    if (err) {
      res.status(500).json({
        error: 'Failed to publish message',
        details: err.message
      });
    } else {
      res.json({
        success: true,
        topic,
        timestamp: new Date().toISOString(),
        timestampLocal: formatLocal(new Date(), TIMEZONE),
        timezone: TIMEZONE
      });
    }
  });
});

// ===================================
// Alerts API Endpoints
// ===================================

// GET /api/alerts - Get recent alerts (Merged RAM + InfluxDB)
app.get('/api/alerts', async (req, res) => {
  try {
    const { limit = 50, severity, read } = req.query;
    const limitInt = parseInt(limit) || 50;

    // 1. Get historical alerts from InfluxDB
    let historicalAlerts = [];
    if (influxService) {
      try {
        const result = await influxService.queryAlertHistory({
          limit: limitInt,
          severity: severity || null,
          startTime: '-24h' // Last 24 hours for "recent"
        });
        if (result.success) {
          historicalAlerts = result.alerts;
        }
      } catch (err) {
        console.warn('⚠️ Failed to fetch historical alerts for merge:', err.message);
      }
    }

    // 2. Merge with recentAlerts (RAM)
    // Map RAM alerts by ID for fast lookup
    const ramAlertsMap = new Map();
    recentAlerts.forEach(a => ramAlertsMap.set(a.id || a._id, a));

    // Combine - prioritization: RAM > Influx
    const mergedMap = new Map();
    
    // Add historical first
    historicalAlerts.forEach(a => {
      const id = a.id || a._id;
      mergedMap.set(id, { ...a, read: false }); // Default historical to unread
    });

    // Overwrite/Add with RAM alerts (which have the current 'read' state)
    recentAlerts.forEach(a => {
      const id = a.id || a._id;
      mergedMap.set(id, a);
    });

    let combined = Array.from(mergedMap.values());

    // 3. Filter and Sort
    if (severity) {
      combined = combined.filter(a => a.severity === severity);
    }

    if (read !== undefined) {
      const isRead = read === 'true';
      combined = combined.filter(a => !!a.read === isRead);
    }

    // Sort by timestamp desc
    combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      success: true,
      count: combined.length,
      total: combined.length,
      unreadCount: combined.filter(a => !a.read).length,
      alerts: combined.slice(0, limitInt),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in GET /api/alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/alerts/:id/read - Mark an alert as read
app.post('/api/alerts/:id/read', (req, res) => {
  const { id } = req.params;
  const alert = recentAlerts.find(a => a.id === id || a._id === id);
  if (alert) {
    alert.read = true;
    return res.json({ success: true, message: `Alert ${id} marked as read`, alert });
  }
  // Return success even if not found in RAM to prevent frontend 404 errors
  res.json({ success: true, message: `Alert ${id} acknowledged`, note: 'Alert not found in current session memory' });
});

// POST /api/alerts/:id/unread - Mark an alert as unread
app.post('/api/alerts/:id/unread', (req, res) => {
  const { id } = req.params;
  const alert = recentAlerts.find(a => a.id === id || a._id === id);
  if (alert) {
    alert.read = false;
    return res.json({ success: true, message: `Alert ${id} marked as unread`, alert });
  }
  res.json({ success: true, message: `Alert ${id} status updated`, note: 'Alert not found in current session memory' });
});

// POST /api/alerts/mark-all-read - Mark all alerts as read
app.post('/api/alerts/mark-all-read', (req, res) => {
  recentAlerts.forEach(a => { a.read = true; });
  res.json({ success: true, message: 'All alerts marked as read' });
});

// GET /api/alerts/thresholds - Get current alert thresholds
app.get('/api/alerts/thresholds', (req, res) => {
  res.json({
    success: true,
    thresholds: alertService.getThresholds(),
    activeAlertsCount: alertService.getActiveAlertsCount(),
    recentAlertsCount: recentAlerts.length,
    timestamp: new Date().toISOString()
  });
});

// POST /api/alerts/clear - Clear alert history (for testing)
app.post('/api/alerts/clear', (req, res) => {
  const clearedCount = recentAlerts.length;
  recentAlerts.length = 0;
  alertService.clearAlerts();
  
  res.json({
    success: true,
    message: `Cleared ${clearedCount} alerts`,
    timestamp: new Date().toISOString()
  });
});

// ===================================
// Data Export APIs (CSV)
// ===================================

// GET /api/data/export - Export data as CSV or JSON
// Query params:
//   - bucket: raw | hourly | daily | monthly | yearly (default: hourly)
//   - startDate: ISO date string or dd/mm/yyyy
//   - endDate: ISO date string or dd/mm/yyyy  
//   - fields: comma-separated fields (e.g., power_active_kw,energy_total)
//   - deviceId: device ID (default: AI205)
//   - format: csv | json (default: csv)
//   - measurement: energy_3phase | energy_per_phase (NEW)
//   - aggregation: none | 1h | 1d | 1mo (NEW)
//   - includeEnergy: true | false (NEW - calculates kWh)
//   - preview: true | false (NEW - returns only 10 rows)
app.get('/api/data/export', async (req, res) => {
  try {
    const { 
      bucket = 'hourly',
      startDate,
      endDate,
      fields,
      phase,
      deviceId = 'AI205',
      format = 'csv',
      measurement = 'energy_3phase',  // NEW
      aggregation = 'none',           // NEW: none, 1h, 1d, 1mo
      includeEnergy = 'false',        // NEW
      preview = 'false'               // NEW
    } = req.query;

    // Parse dates (support dd/mm/yyyy, ISO, and ISO with time)
    const parseDate = (dateStr) => {
      if (!dateStr) return null;
      const ddmmyyyy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (ddmmyyyy) {
        return new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}T00:00:00`);
      }
      const ddmmyyyyTime = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
      if (ddmmyyyyTime) {
        return new Date(`${ddmmyyyyTime[3]}-${ddmmyyyyTime[2]}-${ddmmyyyyTime[1]}T${ddmmyyyyTime[4]}:${ddmmyyyyTime[5]}:00`);
      }
      return new Date(dateStr);
    };

    const start = parseDate(startDate) || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = parseDate(endDate) || new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use dd/mm/yyyy, dd/mm/yyyy HH:mm, or ISO format.'
      });
    }

    // Map bucket name
    const bucketMap = {
      'raw': 'raw', 'hourly': 'hourly', '1h': 'hourly',
      'daily': 'daily', '1d': 'daily',
      'weekly': 'weekly', '1w': 'weekly',
      'monthly': 'monthly', '1m': 'monthly',
      'yearly': 'yearly', '1y': 'yearly'
    };
    const resolvedBucket = bucketMap[bucket.toLowerCase()] || 'hourly';
    const bucketName = influxService.buckets[resolvedBucket];

    // Build field filter
    const fieldArray = fields ? fields.split(',').map(f => f.trim()) : [];
    let fieldsFilter = '';
    if (fieldArray.length > 0) {
      const fieldFilters = fieldArray.map(f => `r._field == "${f}"`).join(' or ');
      fieldsFilter = `|> filter(fn: (r) => ${fieldFilters})`;
    }

    // Build measurement filter
    let measurementFilter = `|> filter(fn: (r) => r._measurement == "${measurement}")`;

    // Build phase filter (only for energy_per_phase)
    let phaseFilter = '';
    if (measurement === 'energy_per_phase' && phase && phase !== 'ALL') {
      phaseFilter = `|> filter(fn: (r) => r.phase == "${phase}")`;
    }

    // Build aggregation
    let aggregationQuery = '';
    let aggregationUnit = 1; // hours
    if (aggregation && aggregation !== 'none') {
      const aggMap = { '1h': '1h', '1d': '1d', '1mo': '1mo' };
      const aggUnit = aggMap[aggregation] || '1h';
      aggregationQuery = `|> aggregateWindow(every: ${aggUnit}, fn: mean, createEmpty: false)`;
      if (aggregation === '1d') aggregationUnit = 24;
      if (aggregation === '1mo') aggregationUnit = 24 * 30;
    }

    // Limit for preview
    const limitQuery = preview === 'true' ? '|> limit(n: 10)' : '';

    // Build Flux query
    const fluxQuery = `
      import "timezone"
      option location = timezone.location(name: "${TIMEZONE}")
      
      from(bucket: "${bucketName}")
        |> range(start: ${start.toISOString()}, stop: ${end.toISOString()})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        ${measurementFilter}
        ${phaseFilter}
        ${fieldsFilter}
        ${aggregationQuery}
        |> sort(columns: ["_time"], desc: false)
        ${limitQuery}
    `;

    console.log(`📊 Export query: bucket=${bucketName}, measurement=${measurement}, aggregation=${aggregation}, preview=${preview}`);

    const rows = await influxService.queryApi.collectRows(fluxQuery);

    // Pivot data
    const dataByTime = new Map();
    const allFields = new Set();
    
    rows.forEach(row => {
      const timeKey = row._time;
      if (!dataByTime.has(timeKey)) {
        dataByTime.set(timeKey, { time: timeKey, phase: row.phase || '' });
      }
      const record = dataByTime.get(timeKey);
      record[row._field] = row._value;
      allFields.add(row._field);
    });

    // Calculate energy if requested
    if (includeEnergy === 'true' && allFields.has('power_active_kw')) {
      allFields.add('energy_kwh');
      dataByTime.forEach(record => {
        const power = record['power_active_kw'] || 0;
        // Energy = Power × Time (in hours based on aggregation)
        record['energy_kwh'] = power * (aggregation === '1d' ? 24 : aggregation === '1mo' ? 720 : 1);
      });
    }

    const fieldList = Array.from(allFields).sort();
    const dataArray = Array.from(dataByTime.values());

    // JSON format (for preview or API use)
    if (format === 'json' || preview === 'true') {
      return res.json({
        success: true,
        bucket: bucketName,
        measurement,
        aggregation,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        deviceId,
        count: dataArray.length,
        totalCount: rows.length,
        fields: fieldList,
        preview: preview === 'true',
        data: dataArray
      });
    }

    // CSV format
    if (dataArray.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No data found for the specified criteria'
      });
    }

    const csvHeader = ['time', 'phase', ...fieldList].join(',');
    const csvRows = dataArray.map(record => {
      const values = [
        record.time,
        record.phase || '',
        ...fieldList.map(f => record[f] !== undefined ? record[f] : '')
      ];
      return values.join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');

    const filename = `energy_export_${resolvedBucket}_${measurement}_${start.toISOString().split('T')[0]}_to_${end.toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    console.error('❌ Error in /api/data/export:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/data/export/fields - Get available fields for a bucket
app.get('/api/data/export/fields', async (req, res) => {
  try {
    const { bucket = 'hourly', deviceId = 'AI205' } = req.query;
    
    const bucketMap = {
      'raw': 'raw', 'hourly': 'hourly', 'daily': 'daily',
      'weekly': 'weekly', 'monthly': 'monthly', 'yearly': 'yearly'
    };
    const resolvedBucket = bucketMap[bucket.toLowerCase()] || 'hourly';
    const bucketName = influxService.buckets[resolvedBucket];

    // Query to get unique fields
    const fluxQuery = `
      import "influxdata/influxdb/schema"
      schema.fieldKeys(bucket: "${bucketName}")
    `;

    const rows = await influxService.queryApi.collectRows(fluxQuery);
    const fields = rows.map(r => r._value).filter(Boolean);

    res.json({
      success: true,
      bucket: bucketName,
      fields,
      count: fields.length
    });
  } catch (error) {
    console.error('❌ Error getting fields:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      fields: []
    });
  }
});

// ===================================
// Energy Calculation APIs
// ===================================

// Get energy summary for a time range
app.get('/api/energy/summary', async (req, res) => {
  try {
    const VALID_TR = ['1d', '1w', '1M', 'MN'];
    const VALID_DEV = /^[a-zA-Z0-9_-]{1,64}$/;
    const timeRange = VALID_TR.includes(req.query.timeRange) ? req.query.timeRange : '1d';
    const deviceId  = VALID_DEV.test(String(req.query.deviceId || '')) ? req.query.deviceId : 'AI205';

    // energyCalc has no getEnergySummary — use influxService.queryEnergySummary instead
    const summary = await influxService.queryEnergySummary(timeRange, deviceId);

    res.json({
      success: true,
      ...summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get energy consumption per phase
app.get('/api/energy/per-phase', async (req, res) => {
  try {
    const { 
      phase = 'L1', 
      timeRange = '1H',
      deviceId = 'AI205'
    } = req.query;
    
    // Map time range to bucket and duration
    const config = {
      '1H': { bucket: 'AI205_1h', duration: '-1h' },
      '1D': { bucket: 'AI205_1d', duration: '-1d' },
      '1W': { bucket: 'AI205_1d', duration: '-7d' },
      '1M': { bucket: 'AI205_1m', duration: '-30d' },
      'MN': { bucket: 'AI205_MN', duration: '-365d' }
    };
    
    const { bucket, duration } = config[timeRange] || config['1H'];
    
    const energy = await energyCalc.calculateEnergyPerPhase(
      bucket, 
      phase, 
      duration, 
      deviceId
    );
    
    res.json({
      success: true,
      phase,
      timeRange,
      bucket,
      duration,
      energy: parseFloat(energy.toFixed(3)),
      unit: 'kWh',
      calculatedAt: new Date().toISOString(),
      calculatedAtLocal: formatLocal(new Date(), TIMEZONE),
      timezone: TIMEZONE
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get total energy from power integration
app.get('/api/energy/total', async (req, res) => {
  try {
    const { 
      timeRange = '1H',
      deviceId = 'AI205'
    } = req.query;
    
    const config = {
      '1H': { bucket: 'AI205_raw', duration: '-1h' },
      '1D': { bucket: 'AI205_raw', duration: '-1d' },
      '1W': { bucket: 'AI205_raw', duration: '-7d' },
      '1M': { bucket: 'AI205_raw', duration: '-30d' },
      'MN': { bucket: 'AI205_raw', duration: '-365d' }
    };
    
    const { bucket, duration } = config[timeRange] || config['1H'];
    
    const energy = await energyCalc.calculateTotalEnergy(
      bucket, 
      duration, 
      deviceId
    );
    
    res.json({
      success: true,
      timeRange,
      bucket,
      duration,
      energy: parseFloat(energy.toFixed(3)),
      unit: 'kWh',
      calculatedAt: new Date().toISOString(),
      calculatedAtLocal: formatLocal(new Date(), TIMEZONE),
      timezone: TIMEZONE
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get energy from meter reading
app.get('/api/energy/meter', async (req, res) => {
  try {
    const { 
      timeRange = '1H',
      deviceId = 'AI205'
    } = req.query;
    
    const config = {
      '1H': { bucket: 'AI205_1h', duration: '-1h' },
      '1D': { bucket: 'AI205_1d', duration: '-1d' },
      '1W': { bucket: 'AI205_1d', duration: '-7d' },
      '1M': { bucket: 'AI205_1m', duration: '-30d' },
      'MN': { bucket: 'AI205_MN', duration: '-365d' }
    };
    
    const { bucket, duration } = config[timeRange] || config['1H'];
    
    const energyData = await energyCalc.getEnergyFromMeter(
      bucket, 
      duration,
      'now()',
      deviceId
    );
    
    res.json({
      success: true,
      timeRange,
      bucket,
      duration,
      ...energyData,
      unit: 'kWh',
      calculatedAt: new Date().toISOString(),
      calculatedAtLocal: formatLocal(new Date(), TIMEZONE),
      timezone: TIMEZONE
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===================================
// Chart Data APIs (for Monthly/Yearly Charts)
// ===================================

// GET /api/energy/monthly-chart - Get daily breakdown for current month
/*
// [MIGRATED TO energyRoutes.js]
// GET /api/energy/monthly-chart - Get daily breakdown for current month
app.get('/api/energy/monthly-chart', async (req, res) => {
  // ... (migrated to energyRoutes.js)
  res.status(410).json({ error: 'Endpoint migrated to energyRoutes.js' });
});
*/

// GET /api/energy/yearly-chart - Get monthly breakdown for current year
/*
// [MIGRATED TO energyRoutes.js]
// GET /api/energy/yearly-chart - Get monthly breakdown for current year
app.get('/api/energy/yearly-chart', async (req, res) => {
  // ... (migrated to energyRoutes.js)
  res.status(410).json({ error: 'Endpoint migrated to energyRoutes.js' });
});
*/

// GET /api/energy/cost-history - Get historical energy and cost data for chart
// ใช้สำหรับแสดงกราฟแท่งคู่: ค่าไฟ (บาท) + พลังงาน (kWh)
/*
// [MIGRATED TO energyRoutes.js]
// GET /api/energy/cost-history - Get historical energy and cost data for chart
app.get('/api/energy/cost-history', async (req, res) => {
  // ... (migrated to energyRoutes.js)
  res.status(410).json({ error: 'Endpoint migrated to energyRoutes.js' });
});
*/

// Get demand data (On Peak, Partial Peak, Off Peak, Reactive Power)
app.get('/api/demand', async (req, res) => {
  try {
    const { 
      range = '-30d',
      deviceId = 'AI205'
    } = req.query;
    
    const demandData = await influxService.queryDemandData({
      range,
      deviceId
    });
    
    res.json({
      success: demandData.success,
      ...demandData,
      timestamp: new Date().toISOString(),
      timestampLocal: formatLocal(new Date(), TIMEZONE),
      timezone: TIMEZONE
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      demand: {
        onPeak: 0,
        partialPeak: 0,
        offPeak: 0,
        reactivePower: 0
      },
      error: error.message
    });
  }
});

// Get average power consumption
app.get('/api/energy/average-power', async (req, res) => {
  try {
    const { 
      timeRange = '1H',
      deviceId = 'AI205'
    } = req.query;
    
    const config = {
      '1H': { bucket: 'AI205_1h', duration: '-1h' },
      '1D': { bucket: 'AI205_1d', duration: '-1d' },
      '1W': { bucket: 'AI205_1d', duration: '-7d' },
      '1M': { bucket: 'AI205_1m', duration: '-30d' },
      'MN': { bucket: 'AI205_MN', duration: '-365d' }
    };
    
    const { bucket, duration } = config[timeRange] || config['1H'];
    
    const avgPower = await energyCalc.getAveragePower(
      bucket, 
      duration, 
      deviceId
    );
    
    res.json({
      success: true,
      timeRange,
      bucket,
      duration,
      averagePower: avgPower,
      unit: 'kW',
      calculatedAt: new Date().toISOString(),
      calculatedAtLocal: formatLocal(new Date(), TIMEZONE),
      timezone: TIMEZONE
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '127.0.0.1';

server.listen(PORT, HOST, async () => {
  console.log('');
  console.log('🚀 SMART Energy Backend Server Started');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 HTTP Server:    http://${HOST}:${PORT}`);
  console.log(`🔌 WebSocket:      ws://${HOST}:${PORT}`);
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
  
  // Start downsampling scheduler after server starts (optional module)
  console.log('⏰ Starting downsampling scheduler...');
  try {
    if (typeof downsampling !== 'undefined' && typeof downsampling.scheduleDownsampling === 'function') {
      await downsampling.scheduleDownsampling();
      console.log('✅ Downsampling scheduler started successfully');
    } else {
      console.log('ℹ️ Downsampling module not enabled');
    }
  } catch (error) {
    console.log(`⚠️  Downsampling scheduler failed: ${error.message}`);
    console.log('   Backend will continue in real-time mode (WebSocket only)');
  }
  console.log('');
});

// ===== Firmware Manager =====
let firmwareManager = null;

function initializeFirmwareManager() {
  try {
    firmwareManager = new FirmwareManager(mqttClient, {
      firmwareDir: path.join(__dirname, '../firmware'),
      maxFileSize: 4 * 1024 * 1024 // 4MB
    });
    console.log('✅ Firmware Manager initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Firmware Manager:', error.message);
  }
}

// ===== API Routes =====

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Serve firmware files as static files
app.use('/firmware', express.static(path.join(__dirname, '../firmware')));

/**
 * POST /api/firmware/upload
 * Upload and announce new firmware
 * Body:
 *   - firmware: .bin file
 *   - version: version string (e.g., "3.1.0")
 *   - notes: release notes (optional)
 */
app.post('/api/firmware/upload', (req, res) => {
  if (!firmwareManager) {
    return res.status(503).json({ error: 'Firmware manager not initialized' });
  }

  firmwareManager.getUploadMiddleware()(req, res, async (err) => {
    // Handle multer errors
    if (err) {
      console.error('❌ Upload error:', err.message);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    try {
      const { version, notes } = req.body;

      if (!version) {
        return res.status(400).json({ error: 'Version is required' });
      }

      // Validate uploaded file
      const validation = firmwareManager.validateFirmware(req.file.path);
      if (!validation.valid) {
        // Delete invalid file
        require('fs').unlinkSync(req.file.path);
        return res.status(400).json({ error: validation.error });
      }

      // Publish firmware info to MQTT
      const info = await firmwareManager.publishFirmwareInfo(
        req.file.filename,
        version,
        notes || ''
      );

      console.log('✅ Firmware uploaded and published:', info);
      res.json({
        ok: true,
        message: 'Firmware uploaded and published successfully',
        info: {
          ...info,
          originalName: req.file.originalname,
          uploadedPath: `/firmware/${encodeURIComponent(req.file.filename)}`
        }
      });
    } catch (error) {
      console.error('❌ Error processing firmware upload:', error.message);
      
      // Cleanup uploaded file on error
      if (req.file && require('fs').existsSync(req.file.path)) {
        require('fs').unlinkSync(req.file.path);
      }
      
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * GET /api/firmware/list
 * List all available firmware files
 */
app.get('/api/firmware/list', (req, res) => {
  if (!firmwareManager) {
    return res.status(503).json({ error: 'Firmware manager not initialized' });
  }

  try {
    const firmwares = firmwareManager.listFirmwareFiles();
    res.json({
      ok: true,
      count: firmwares.length,
      firmwares
    });
  } catch (error) {
    console.error('❌ Error listing firmware files:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/firmware/info/:filename
 * Get info about a specific firmware file
 */
app.get('/api/firmware/info/:filename', (req, res) => {
  if (!firmwareManager) {
    return res.status(503).json({ error: 'Firmware manager not initialized' });
  }

  try {
    const { filename } = req.params;
    const info = firmwareManager.getFirmwareInfo(filename);

    if (!info) {
      return res.status(404).json({ error: 'Firmware file not found' });
    }

    res.json({ ok: true, info });
  } catch (error) {
    console.error('❌ Error getting firmware info:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/firmware/announce/:filename
 * Announce existing firmware file to devices via MQTT
 * Body:
 *   - version: version string
 *   - notes: release notes (optional)
 */
app.post('/api/firmware/announce/:filename', async (req, res) => {
  if (!firmwareManager) {
    return res.status(503).json({ error: 'Firmware manager not initialized' });
  }

  try {
    const { filename } = req.params;
    const { version, notes } = req.body;

    if (!version) {
      return res.status(400).json({ error: 'Version is required' });
    }

    const info = await firmwareManager.publishFirmwareInfo(
      filename,
      version,
      notes || ''
    );

    res.json({
      ok: true,
      message: 'Firmware announcement published',
      info
    });
  } catch (error) {
    console.error('❌ Error announcing firmware:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/firmware/:filename
 * Delete a firmware file
 */
app.delete('/api/firmware/:filename', (req, res) => {
  if (!firmwareManager) {
    return res.status(503).json({ error: 'Firmware manager not initialized' });
  }

  try {
    const { filename } = req.params;
    firmwareManager.deleteFirmware(filename);

    res.json({
      ok: true,
      message: `Firmware ${filename} deleted successfully`
    });
  } catch (error) {
    console.error('❌ Error deleting firmware:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/firmware/upload-local
 * Simple local HTTP upload - stores firmware on backend server
 * Accessible via /firmware/<filename>
 */

// Setup multer for local uploads
const firmwareDir = path.join(__dirname, '../firmware');
if (!fs.existsSync(firmwareDir)) {
  fs.mkdirSync(firmwareDir, { recursive: true });
}

const localUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, firmwareDir);
    },
    filename: (req, file, cb) => {
      // Keep original filename
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, sanitized);
    }
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.bin', '.firmware'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .bin or .firmware files allowed'));
    }
  }
});

app.post('/api/firmware/upload-local', localUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const filename = req.file.filename;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;

    console.log(`\n📤 Local HTTP upload completed`);
    console.log(`   Filename: ${filename}`);
    console.log(`   Original: ${originalName}`);
    console.log(`   Size: ${(fileSize / 1024).toFixed(2)} KB`);
    console.log(`   Path: /firmware/${filename}`);

    // Return local HTTP URL where file can be downloaded
    const localUrl = `http://localhost:3001/firmware/${filename}`;

    res.json({
      success: true,
      filename: filename,
      originalName: originalName,
      size: fileSize,
      url: localUrl,
      timestamp: new Date().toISOString(),
      message: 'File uploaded successfully. Access via HTTP or download locally.'
    });

  } catch (error) {
    console.error(`❌ Upload error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
});

/**
 * POST /api/firmware/upload-to-ftp/:filename
 * Upload a local firmware file via local HTTP
 * File stored locally and served via HTTP /firmware route
 */
app.post('/api/firmware/upload-to-ftp/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const decodedFilename = decodeURIComponent(filename);

    console.log(`\n📤 Received local HTTP upload request for: ${decodedFilename}`);

    // Check if file exists
    const firmwareDir = path.join(__dirname, '../firmware');
    const filePath = path.join(firmwareDir, decodedFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        success: false, 
        error: `File not found: ${decodedFilename}` 
      });
    }

    const fileSize = fs.statSync(filePath).size;
    const localUrl = `http://localhost:3001/firmware/${decodedFilename}`;

    console.log(`✅ File ready for local HTTP access`);
    console.log(`   Filename: ${decodedFilename}`);
    console.log(`   Size: ${(fileSize / 1024).toFixed(2)} KB`);
    console.log(`   URL: ${localUrl}`);

    // Broadcast success to WebSocket clients
    const clients = wss.clients;
    if (clients) {
      const message = JSON.stringify({
        type: 'firmware-upload-success',
        filename: decodedFilename,
        url: localUrl,
        size: fileSize,
        timestamp: new Date().toISOString()
      });
      clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
          client.send(message);
        }
      });
    }

    // Respond with local HTTP URL
    res.json({
      ok: true,
      success: true,
      message: `File available at ${localUrl}`,
      filename: decodedFilename,
      url: localUrl,
      size: fileSize
    });

  } catch (error) {
    console.error('❌ Error with local HTTP upload:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/firmware/upload-sftp-v2
 * Upload firmware file to remote SFTP server (New Implementation)
 * Uses native SSH2 SFTP connection
 * Deletes old .bin files automatically from remote server
 * 
 * Body:
 *   - firmware: .bin file
 *   - version: version string (e.g., "3.1.0")
 *   - notes: release notes (optional)
 */
app.post('/api/firmware/upload-sftp-v2', (req, res) => {
  firmwareManager.getUploadMiddleware()(req, res, async (err) => {
    if (err) {
      console.error('❌ Upload error:', err.message);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    try {
      const { version, notes } = req.body;
      const Child = require('child_process');

      if (!version) {
        return res.status(400).json({ error: 'Version is required' });
      }

      // Validate uploaded file
      const validation = firmwareManager.validateFirmware(req.file.path);
      if (!validation.valid) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: validation.error });
      }

      console.log(`\n🚀 Starting SFTP firmware upload process (v2)`);
      console.log(`   Local file: ${req.file.filename}`);
      console.log(`   Version: ${version}`);
      console.log(`   Size: ${(validation.size / 1024).toFixed(2)} KB`);

      // Run SFTP upload script asynchronously
      const scriptPath = path.join(__dirname, '../../sftp-firmware-upload.js');
      const child = Child.spawn('node', [scriptPath], {
        detached: true,
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
        console.log(data.toString());
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(data.toString());
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log('✅ SFTP firmware uploaded successfully');
        } else {
          console.log('⚠️ SFTP upload completed with status:', code);
        }
      });

      // Don't wait for the upload to complete, just acknowledge the request
      res.json({
        ok: true,
        message: 'Firmware upload to SFTP initiated',
        file: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: validation.size,
          version: version,
          notes: notes || '',
          localPath: `/firmware/${encodeURIComponent(req.file.filename)}`,
          uploadStarted: new Date().toISOString()
        }
      });

      // Broadcast to WebSocket clients
      const clients = wss.clients;
      if (clients) {
        const wsMessage = JSON.stringify({
          type: 'firmware-sftp-upload-started',
          filename: req.file.filename,
          version: version,
          size: validation.size,
          timestamp: new Date().toISOString()
        });
        clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(wsMessage);
          }
        });
      }

    } catch (error) {
      console.error('❌ Error initiating SFTP firmware upload:', error.message);
      
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ error: error.message });
    }
  });
});

// Graceful shutdown

// ===================================
// ✅ NEW: Energy Realtime APIs (Power × Time)
// ===================================

// Get daily energy calculation (Real-time from database)
// ✅ ใช้ Cumulative Counter Difference (Last - First) จาก DB
app.get('/api/energy/daily-realtime', async (req, res) => {
  try {
    const { deviceId = 'AI205' } = req.query;
    
    console.log('📊 Request: Daily energy (Counter Difference) for device:', deviceId);
    
    // ✅ Use getRealtimeDailyUsage (Last - First of energy_total) from DB
    const dailyValue = await influxService.getRealtimeDailyUsage(deviceId);
    
    res.json({
      success: true,
      daily: dailyValue || 0,
      source: 'InfluxDB (hourly mean sum)',
      calculationMethod: 'aggregateWindow(1h, mean) + sum (same as chart)',
      calculatedAt: new Date().toISOString(),
      calculatedAtLocal: formatLocal(new Date(), TIMEZONE),
      timezone: TIMEZONE,
      deviceId
    });
    
  } catch (error) {
    console.error('❌ Error in /api/energy/daily-realtime:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      daily: 0
    });
  }
});

// Get monthly energy calculation (Real-time from database)
// ✅ ใช้ Power × Time (integral) จาก DB โดยตรง -> NO, Should probably be consistent if we changed the service function?
// Wait, I only changed getRealtimeDailyUsage in influxdb.js. 
// getRealtimeMonthlyUsage is still using integral in influxdb.js unless I change it too.
// I should check if I need to change monthly/yearly too. The user only complained about daily.
// But logically, monthly/yearly should also use counter difference for consistency if possible.
// However, integral is generally fine for longer periods unless gaps are huge.
// For now, I will ONLY update the daily endpoint strings.

app.get('/api/energy/monthly-realtime', async (req, res) => {
  try {
    const { deviceId = 'AI205' } = req.query;
    
    console.log('📊 Request: Monthly energy (Power×Time) for device:', deviceId);
    
    // ✅ Use getRealtimeMonthlyUsage (integral of power_active_kw) from DB
    const monthlyValue = await influxService.getRealtimeMonthlyUsage(deviceId);
    
    // Get month info
    const now = new Date();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    res.json({
      success: true,
      monthly: monthlyValue || 0,
      source: 'InfluxDB (Power×Time integral)',
      calculationMethod: 'integral(power_active_kw)',
      monthName: monthNames[now.getMonth()],
      monthNumber: now.getMonth() + 1,
      year: now.getFullYear(),
      calculatedAt: new Date().toISOString(),
      calculatedAtLocal: formatLocal(new Date(), TIMEZONE),
      timezone: TIMEZONE,
      deviceId
    });
    
  } catch (error) {
    console.error('❌ Error in /api/energy/monthly-realtime:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      monthly: 0
    });
  }
});

// Get yearly energy calculation (Real-time from database)
// ✅ ใช้ Power × Time (integral) จาก DB โดยตรง
app.get('/api/energy/yearly-realtime', async (req, res) => {
  try {
    const { deviceId = 'AI205' } = req.query;
    
    console.log('📊 Request: Yearly energy (Power×Time) for device:', deviceId);
    
    // ✅ Use getRealtimeYearlyUsage (integral of power_active_kw) from DB
    const yearlyValue = await influxService.getRealtimeYearlyUsage(deviceId);
    
    res.json({
      success: true,
      yearly: yearlyValue || 0,
      source: 'InfluxDB (Power×Time integral)',
      calculationMethod: 'integral(power_active_kw)',
      year: new Date().getFullYear(),
      calculatedAt: new Date().toISOString(),
      calculatedAtLocal: formatLocal(new Date(), TIMEZONE),
      timezone: TIMEZONE,
      deviceId
    });
    
  } catch (error) {
    console.error('❌ Error in /api/energy/yearly-realtime:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      yearly: 0
    });
  }
});

// ✅ NEW: Get meter total (Ep_total ÷ 10 = actual kWh from meter)
// ESP32 sends Ep_total as x10 of actual value, so we need to divide by 10
app.get('/api/energy/meter-total', async (req, res) => {
  try {
    const { deviceId = 'AI205' } = req.query;
    
    // Get from energyState (live from MQTT)
    const state = energyState.getState();
    
    res.json({
      success: true,
      meterTotal: state.meterTotal || 0,
      rawValue: state.rawEpTotal || 0,
      conversionNote: 'rawValue ÷ 10 = meterTotal (kWh)',
      source: 'MQTT (energyState)',
      calculatedAt: new Date().toISOString(),
      timezone: TIMEZONE,
      deviceId
    });
  } catch (error) {
    console.error('❌ Error in /api/energy/meter-total:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      meterTotal: 0
    });
  }
});

// Get current energy state (for initial frontend load)
// Returns realtime accumulated energy for daily/monthly/yearly
app.get('/api/energy/state', (req, res) => {
  try {
    const state = energyState.getState();
    
    res.json({
      success: true,
      ...state,
      calculatedAt: new Date().toISOString(),
      calculatedAtLocal: formatLocal(new Date(), TIMEZONE)
    });
  } catch (error) {
    console.error('❌ Error in /api/energy/state:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      daily: 0,
      monthly: 0,
      yearly: 0
    });
  }
});


// ================== ARDUINO COMPILE API ==================
// Configure multer for sketch file uploads
const sketchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.ino')) {
      cb(null, true);
    } else {
      cb(new Error('Only .ino files are allowed'));
    }
  }
});

// Initialize compile service
compileService.init().catch(err => console.error('CompileService init error:', err));

// Check compile service health
app.get('/api/firmware/compile/health', async (req, res) => {
  try {
    const health = await compileService.checkHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compile .ino to .bin
app.post('/api/firmware/compile', sketchUpload.single('sketch'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No sketch file uploaded' });
    }

    const sketchContent = req.file.buffer.toString('utf-8');
    const sketchName = req.file.originalname.replace('.ino', '');

    console.log(`📦 Compiling sketch: ${sketchName}`);

    const result = await compileService.compile(sketchContent, sketchName);

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        output: result.output
      });
    }

    // Send the binary file
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${sketchName}.bin"`);
    res.send(result.binContent);

  } catch (error) {
    console.error('Compile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Mount modular routes (for /api/summary/* endpoints)
routes.setup(app, { influxService, energyState, firmwareManager: null });

// ✅ Initialize MySQL Database for Auth
(async () => {
  try {
    await initDatabase();
    console.log('✅ MySQL Database initialized for authentication');
  } catch (error) {
    console.error('⚠️ MySQL Database initialization failed:', error.message);
    console.warn('⚠️ Authentication features may not work properly');
  }
})();

// ✅ Serve Frontend Static Files (Production Only - or when intended)
const frontendPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendPath)) {
  console.log(`📂 Serving frontend from: ${frontendPath}`);
  app.use(express.static(frontendPath));
  
  // Handle SPA routing - send index.html for unknown routes (excluding /api)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Endpoint not found' });
    }
  });
} else {
  console.warn(`⚠️ Frontend build not found at: ${frontendPath}`);
  console.warn('Run "cd frontend && npm run build" to generate static files.');
}

// Start Server -> REMOVED DUPLICATE LISTEN
// const PORT = process.env.PORT || 3001;
// server.listen(PORT, '0.0.0.0', () => { ... });

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Close InfluxDB connections
  await influxService.close();
  
  // Close WebSocket server
  wss.close(() => {
    console.log('✅ WebSocket server closed');
  });
  
  // Disconnect MQTT client
  mqttClient.end(() => {
    console.log('✅ MQTT client disconnected');
    process.exit(0);
  });
});
