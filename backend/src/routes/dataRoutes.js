/**
 * Data Integrity Routes
 * API endpoints for data validation and health checks
 */

const express = require('express');
const router = express.Router();

module.exports = function(influxService) {
  
  // Run all data integrity checks
  router.get('/integrity-check', async (req, res) => {
    try {
      const { range = '-24h', deviceId = 'AI205' } = req.query;
      
      const results = await influxService.runDataIntegrityChecks(range, deviceId);
      
      res.json({
        success: true,
        ...results
      });
    } catch (error) {
      console.error('❌ Error in /integrity-check:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Check for duplicate data points
  router.get('/check-duplicates', async (req, res) => {
    try {
      const { range = '-24h', deviceId = 'AI205' } = req.query;
      
      const result = await influxService.checkDuplicates(range, deviceId);
      
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('❌ Error in /check-duplicates:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Check for negative energy values
  router.get('/check-negatives', async (req, res) => {
    try {
      const { range = '-24h', deviceId = 'AI205' } = req.query;
      
      const result = await influxService.checkNegativeEnergy(range, deviceId);
      
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('❌ Error in /check-negatives:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Check hourly vs daily sum consistency
  router.get('/check-hourly-daily', async (req, res) => {
    try {
      const { deviceId = 'AI205' } = req.query;
      
      const result = await influxService.checkHourlyDailySum(deviceId);
      
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('❌ Error in /check-hourly-daily:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
