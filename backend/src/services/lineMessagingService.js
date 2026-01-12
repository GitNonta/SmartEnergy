/**
 * LINE Messaging API Service
 * ส่งแจ้งเตือน alerts ผ่าน LINE Messaging API (Push Message)
 * 
 * ต้องการ:
 * - LINE_CHANNEL_ACCESS_TOKEN: Channel Access Token จาก LINE Developers Console
 * - LINE_CHANNEL_SECRET: Channel Secret (optional, สำหรับ webhook verification)
 */

const { Client, messagingApi } = require('@line/bot-sdk');
require('dotenv').config();

// Configuration from environment
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
};

// Initialize LINE client
let lineClient = null;

// Alert cooldown tracking
const alertCooldowns = new Map();
const COOLDOWN_MS = parseInt(process.env.LINE_ALERT_COOLDOWN_MS) || 300000; // 5 minutes default

// Subscribers list (User IDs that will receive alerts)
let subscribers = [];

// Load subscribers from file or env
function loadSubscribers() {
  try {
    const envSubscribers = process.env.LINE_SUBSCRIBERS;
    if (envSubscribers) {
      subscribers = envSubscribers.split(',').map(s => s.trim()).filter(s => s);
      console.log(`📱 LINE: Loaded ${subscribers.length} subscribers from ENV`);
    }
  } catch (error) {
    console.error('❌ LINE: Error loading subscribers:', error);
  }
}

/**
 * Initialize LINE Messaging client
 */
function initialize() {
  if (!config.channelAccessToken) {
    console.warn('⚠️ LINE: No Channel Access Token configured');
    return false;
  }

  try {
    lineClient = new messagingApi.MessagingApiClient({
      channelAccessToken: config.channelAccessToken
    });
    loadSubscribers();
    console.log('✅ LINE Messaging API initialized');
    return true;
  } catch (error) {
    console.error('❌ LINE: Failed to initialize:', error);
    return false;
  }
}

/**
 * Update configuration dynamically
 */
function updateConfig(newConfig) {
  if (newConfig.channelAccessToken) {
    config.channelAccessToken = newConfig.channelAccessToken;
    
    // Reinitialize client
    lineClient = new messagingApi.MessagingApiClient({
      channelAccessToken: config.channelAccessToken
    });
    console.log('✅ LINE: Configuration updated');
  }
  
  if (newConfig.subscribers && Array.isArray(newConfig.subscribers)) {
    subscribers = newConfig.subscribers;
    console.log(`✅ LINE: Updated ${subscribers.length} subscribers`);
  }
}

/**
 * Get current configuration status
 */
function getStatus() {
  return {
    configured: !!config.channelAccessToken,
    subscriberCount: subscribers.length,
    cooldownMs: COOLDOWN_MS,
    hasToken: !!config.channelAccessToken
  };
}

/**
 * Get list of subscribers
 */
function getSubscribers() {
  return subscribers.map(id => ({
    userId: id,
    masked: `${id.substring(0, 8)}...${id.substring(id.length - 4)}`
  }));
}

/**
 * Add a subscriber
 */
function addSubscriber(userId) {
  if (!userId || !userId.startsWith('U')) {
    return { success: false, error: 'Invalid User ID format (must start with U)' };
  }
  
  if (subscribers.includes(userId)) {
    return { success: false, error: 'User already subscribed' };
  }
  
  subscribers.push(userId);
  console.log(`✅ LINE: Added subscriber ${userId.substring(0, 8)}...`);
  return { success: true, count: subscribers.length };
}

/**
 * Remove a subscriber
 */
function removeSubscriber(userId) {
  const index = subscribers.indexOf(userId);
  if (index === -1) {
    return { success: false, error: 'User not found' };
  }
  
  subscribers.splice(index, 1);
  console.log(`✅ LINE: Removed subscriber ${userId.substring(0, 8)}...`);
  return { success: true, count: subscribers.length };
}

// Message Queue to prevent Rate Limiting (429)
const messageQueue = [];
let isProcessingQueue = false;
const RATE_LIMIT_DELAY_MS = 500; // 500ms between messages

/**
 * Process the message queue
 */
async function processQueue() {
  if (isProcessingQueue || messageQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (messageQueue.length > 0) {
    const task = messageQueue[0]; // Peek
    
    try {
      if (!lineClient) throw new Error('LINE client not initialized');
      
      await lineClient.pushMessage({
        to: task.userId,
        messages: task.messages
      });
      
      console.log(`✅ LINE: Sent message to ${task.userId.substring(0, 8)}...`);
      if (task.resolve) task.resolve({ success: true });
      
    } catch (error) {
      console.error(`❌ LINE: Failed to send to ${task.userId.substring(0, 8)}:`, error.message);
      
      // If 429 (Too Many Requests), wait longer before retrying (optional)
      if (error.statusCode === 429) {
          console.warn('⏳ LINE Rate Limit hit, pausing for 5 seconds...');
          await new Promise(r => setTimeout(r, 5000));
          // Don't shift, retry same message
           continue; 
      }
      
      if (task.resolve) task.resolve({ success: false, error: error.message });
    }
    
    // Remove processed task
    messageQueue.shift();
    
    // Wait before next message
    await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
  }
  
  isProcessingQueue = false;
}

/**
 * Push a text message to a specific user (Queued)
 */
/**
 * Internal: Push messages to queue
 */
function enqueueMessages(userId, messages) {
  if (!lineClient) return Promise.resolve({ success: false, error: 'LINE client not initialized' });
  
  return new Promise((resolve) => {
    messageQueue.push({ userId, messages, resolve });
    processQueue();
  });
}

/**
 * Push a text message to a specific user (Queued)
 */
async function pushMessage(userId, message) {
  return enqueueMessages(userId, [{ type: 'text', text: message }]);
}

/**
 * Push message to all subscribers
 */
async function pushToAllSubscribers(message) {
  if (!lineClient || subscribers.length === 0) {
    return { success: false, error: 'No subscribers or client not initialized' };
  }

  const results = [];
  for (const userId of subscribers) {
    const result = await pushMessage(userId, message);
    results.push({ userId: userId.substring(0, 8), ...result });
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`✅ LINE: Sent to ${successCount}/${subscribers.length} subscribers`);
  
  return { 
    success: successCount > 0, 
    sent: successCount, 
    total: subscribers.length,
    results 
  };
}

/**
 * Format and send an alert as Flex Message
 */
async function sendAlertMessage(alert) {
  if (!lineClient || subscribers.length === 0) {
    return { success: false, error: 'Not configured or no subscribers' };
  }

  // Check cooldown
  const alertKey = `${alert.type}_${alert.deviceId || 'default'}`;
  const lastSent = alertCooldowns.get(alertKey);
  const now = Date.now();
  
  if (lastSent && (now - lastSent) < COOLDOWN_MS) {
    const remainingMs = COOLDOWN_MS - (now - lastSent);
    console.log(`⏳ LINE: Alert ${alertKey} in cooldown (${Math.round(remainingMs/1000)}s remaining)`);
    return { success: false, error: 'Alert in cooldown', remainingMs };
  }

  // Create Flex Message for alert
  const severityColor = alert.severity === 'critical' ? '#FF0000' : 
                         alert.severity === 'warning' ? '#FFA500' : '#0000FF';
  const severityEmoji = alert.severity === 'critical' ? '🚨' : 
                         alert.severity === 'warning' ? '⚠️' : 'ℹ️';

  const flexMessage = {
    type: 'flex',
    altText: `${severityEmoji} ${alert.type}: ${alert.message}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${severityEmoji} SMART Energy Alert`,
            color: '#FFFFFF',
            size: 'sm',
            weight: 'bold'
          }
        ],
        backgroundColor: severityColor,
        paddingAll: '12px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: alert.type.replace(/_/g, ' ').toUpperCase(),
            weight: 'bold',
            size: 'md',
            wrap: true
          },
          {
            type: 'text',
            text: alert.message,
            size: 'sm',
            color: '#666666',
            margin: 'md',
            wrap: true
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: 'Device:',
                size: 'xs',
                color: '#AAAAAA',
                flex: 1
              },
              {
                type: 'text',
                text: alert.deviceId || 'AI205',
                size: 'xs',
                color: '#333333',
                flex: 2,
                align: 'end'
              }
            ],
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: 'Value:',
                size: 'xs',
                color: '#AAAAAA',
                flex: 1
              },
              {
                type: 'text',
                text: typeof alert.value === 'number' ? alert.value.toFixed(2) : String(alert.value || '-'),
                size: 'xs',
                color: '#333333',
                flex: 2,
                align: 'end'
              }
            ],
            margin: 'sm'
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: 'Time:',
                size: 'xs',
                color: '#AAAAAA',
                flex: 1
              },
              {
                type: 'text',
                text: new Date(alert.timestamp || Date.now()).toLocaleString('th-TH'),
                size: 'xs',
                color: '#333333',
                flex: 2,
                align: 'end'
              }
            ],
            margin: 'sm'
          }
        ],
        paddingAll: '16px'
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'SMART Energy Monitor',
            size: 'xxs',
            color: '#AAAAAA',
            align: 'center'
          }
        ],
        paddingAll: '8px'
      }
    }
  };

  // Send to all subscribers via Queue
  const results = [];
  for (const userId of subscribers) {
    const result = await enqueueMessages(userId, [flexMessage]);
    results.push({ userId: userId.substring(0, 8), ...result });
  }

  // Update cooldown
  alertCooldowns.set(alertKey, now);

  const successCount = results.filter(r => r.success).length;
  console.log(`📱 LINE Alert sent: ${alert.type} to ${successCount}/${subscribers.length} subscribers`);

  return {
    success: successCount > 0,
    sent: successCount,
    total: subscribers.length,
    results
  };
}

/**
 * Send a test message
 */
async function sendTestMessage(userId) {
  const testMessage = `🔔 SMART Energy Monitor - ทดสอบการแจ้งเตือน

✅ การเชื่อมต่อ LINE สำเร็จ!

เวลา: ${new Date().toLocaleString('th-TH')}
ระบบพร้อมส่งแจ้งเตือนเมื่อเกิด:
• ⚡ Overcurrent
• 🔌 Overvoltage/Undervoltage  
• ⚠️ Low Power Factor
• 📊 High Energy Consumption`;

  return await pushMessage(userId, testMessage);
}

// Initialize on load
initialize();

module.exports = {
  initialize,
  updateConfig,
  getStatus,
  getSubscribers,
  addSubscriber,
  removeSubscriber,
  pushMessage,
  pushToAllSubscribers,
  sendAlertMessage,
  sendTestMessage
};
