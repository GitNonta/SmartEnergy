/**
 * Chat Routes - AI Chat Agent API
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

module.exports = function(aiChatService) {

  /**
   * POST /api/chat/message
   * Send a message to AI and get response (stateless - no history)
   */
  router.post('/message', async (req, res) => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ 
          success: false, 
          error: 'Message is required' 
        });
      }

      console.log(`💬 Chat message received: ${message.substring(0, 50)}...`);

      // Process message with AI (no history - stateless)
      const result = await aiChatService.processMessage(message, []);

      res.json({
        success: result.success,
        message: result.message,
        error: result.error,
        toolsUsed: result.toolsUsed || []
      });

    } catch (error) {
      console.error('❌ Chat API error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  /**
   * GET /api/chat/csv/:filename
   * Download CSV file
   */
  router.get('/csv/:filename', (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(aiChatService.CSV_DIR, filename);

      // Security: prevent directory traversal
      if (!filename.match(/^[\w\-\.]+\.csv$/)) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.download(filePath, filename, (err) => {
        if (err) {
          console.error('Download error:', err);
        }
      });

    } catch (error) {
      console.error('CSV download error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/chat/quick-actions
   * Get list of quick action suggestions
   */
  router.get('/quick-actions', (req, res) => {
    res.json({
      success: true,
      actions: [
        { id: 'daily', text: 'วันนี้ใช้ไฟเท่าไหร่?', icon: '📊' },
        { id: 'compare', text: 'เปรียบเทียบกับเมื่อวาน', icon: '📈' },
        { id: 'peak', text: 'ช่วงไหนใช้ไฟมากสุด?', icon: '⚡' },
        { id: 'alerts', text: 'มี alerts อะไรบ้าง?', icon: '🔔' },
        { id: 'export', text: 'Export ข้อมูลเดือนนี้', icon: '📥' }
      ]
    });
  });

  return router;
};
