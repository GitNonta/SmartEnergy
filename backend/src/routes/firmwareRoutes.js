/**
 * Firmware Routes
 * API endpoints for firmware management (OTA updates)
 * 
 * ✅ SECURED: Upload, Delete, Announce require API Key authentication
 */

const express = require('express');
const router = express.Router();
const { checkAdminAuth, logAdminAction } = require('../middleware/auth');

module.exports = function(firmwareManager) {
  
  // List all firmware files (public - ESP needs this)
  router.get('/list', (req, res) => {
    try {
      const files = firmwareManager.listFirmwareFiles();
      res.json({
        success: true,
        files,
        count: files.length
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get specific firmware info (public - ESP needs this)
  router.get('/info/:filename', (req, res) => {
    try {
      const { filename } = req.params;
      const info = firmwareManager.getFirmwareInfo(filename);
      
      if (!info) {
        return res.status(404).json({ success: false, error: 'Firmware not found' });
      }
      
      res.json({ success: true, ...info });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // 🔐 PROTECTED ROUTES - Require API Key
  // ============================================

  // Upload new firmware
  router.post('/upload', 
    checkAdminAuth, 
    logAdminAction('FIRMWARE_UPLOAD'),
    firmwareManager.getUploadMiddleware(), 
    (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const info = firmwareManager.getFirmwareInfo(req.file.filename);
        
        console.log(`✅ Firmware uploaded: ${req.file.filename}`);
        
        res.json({
          success: true,
          message: 'Firmware uploaded successfully',
          filename: req.file.filename,
          ...info
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // Delete firmware file
  router.delete('/delete/:filename', 
    checkAdminAuth,
    logAdminAction('FIRMWARE_DELETE'),
    (req, res) => {
      try {
        const { filename } = req.params;
        firmwareManager.deleteFirmware(filename);
        
        console.log(`🗑️ Firmware deleted: ${filename}`);
        
        res.json({
          success: true,
          message: `Firmware ${filename} deleted successfully`
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // Announce firmware via MQTT
  router.post('/announce', 
    checkAdminAuth,
    logAdminAction('FIRMWARE_ANNOUNCE'),
    async (req, res) => {
      try {
        const { filename, version, notes } = req.body;
        
        if (!filename || !version) {
          return res.status(400).json({
            success: false,
            error: 'filename and version are required'
          });
        }

        const info = await firmwareManager.publishFirmwareInfo(filename, version, notes);
        
        console.log(`📢 Firmware announced: ${filename} v${version}`);
        
        res.json({
          success: true,
          message: 'Firmware announced via MQTT',
          ...info
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  return router;
};
