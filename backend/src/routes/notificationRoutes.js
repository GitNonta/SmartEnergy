/**
 * Notification Routes
 * API endpoints for LINE Messaging notifications
 */

const express = require('express');
const router = express.Router();

module.exports = function(lineMessagingService) {
  
  // Get LINE notification status
  router.get('/line/status', (req, res) => {
    try {
      const status = lineMessagingService.getStatus();
      res.json({
        success: true,
        ...status
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get list of subscribers
  router.get('/line/subscribers', (req, res) => {
    try {
      const subscribers = lineMessagingService.getSubscribers();
      res.json({
        success: true,
        subscribers,
        count: subscribers.length
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Add a subscriber
  router.post('/line/subscribers', (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, error: 'userId is required' });
      }

      const result = lineMessagingService.addSubscriber(userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Remove a subscriber
  router.delete('/line/subscribers/:userId', (req, res) => {
    try {
      const { userId } = req.params;
      const result = lineMessagingService.removeSubscriber(userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update configuration
  router.post('/line/config', (req, res) => {
    try {
      const { channelAccessToken, subscribers } = req.body;
      
      lineMessagingService.updateConfig({
        channelAccessToken,
        subscribers
      });

      res.json({
        success: true,
        message: 'Configuration updated'
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Send test message
  router.post('/line/test', async (req, res) => {
    try {
      const { userId, message } = req.body;
      
      if (!userId) {
        return res.status(400).json({ success: false, error: 'userId is required' });
      }

      let result;
      if (message) {
        result = await lineMessagingService.pushMessage(userId, message);
      } else {
        result = await lineMessagingService.sendTestMessage(userId);
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Send test alert (for debugging)
  router.post('/line/test-alert', async (req, res) => {
    try {
      const testAlert = {
        id: `test_${Date.now()}`,
        deviceId: 'AI205',
        type: 'test_alert',
        severity: req.body.severity || 'warning',
        message: req.body.message || 'This is a test alert from SMART Energy Monitor',
        value: req.body.value || 123.45,
        timestamp: new Date().toISOString()
      };

      const result = await lineMessagingService.sendAlertMessage(testAlert);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Broadcast to all subscribers
  router.post('/line/broadcast', async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ success: false, error: 'message is required' });
      }

      const result = await lineMessagingService.pushToAllSubscribers(message);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // Alias Routes for Frontend/Test Compatibility
  // ============================================
  
  // GET /api/notifications/settings - Alias for /line/status
  router.get('/settings', (req, res) => {
    try {
      const status = lineMessagingService.getStatus();
      res.json({ success: true, ...status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // POST /api/notifications/settings - Alias for /line/config
  router.post('/settings', (req, res) => {
    try {
      const { channelAccessToken, subscribers } = req.body;
      lineMessagingService.updateConfig({ channelAccessToken, subscribers });
      res.json({ success: true, message: 'Configuration updated (via alias)' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
