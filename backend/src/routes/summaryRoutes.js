/**
 * Summary Routes
 * API endpoints for Usage Summary Dashboard
 */

const express = require('express');
const router = express.Router();

module.exports = function(influxService) {
  
  /**
   * GET /api/summary/dashboard
   * Returns: daily, weekly, monthly, yearly totals with cost calculation
   */
  router.get('/dashboard', async (req, res) => {
    try {
      const { deviceId = 'AI205', costPerUnit = 4.00 } = req.query;
      
      console.log(`📊 Fetching usage summary dashboard for ${deviceId}...`);
      
      const result = await influxService.getUsageSummaryDashboard(
        deviceId, 
        parseFloat(costPerUnit)
      );
      
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }
      
      res.json(result);
    } catch (error) {
      console.error('❌ Error in /summary/dashboard:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/summary/comparison
   * Returns: comparison with previous periods (yesterday, last week, last month)
   */
  router.get('/comparison', async (req, res) => {
    try {
      const { deviceId = 'AI205' } = req.query;
      
      console.log(`📊 Fetching usage comparison for ${deviceId}...`);
      
      const result = await influxService.getUsageComparison(deviceId);
      
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }
      
      res.json(result);
    } catch (error) {
      console.error('❌ Error in /summary/comparison:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/summary/peak
   * Returns: peak demand times and values
   */
  router.get('/peak', async (req, res) => {
    try {
      const { deviceId = 'AI205' } = req.query;
      
      console.log(`📊 Fetching peak demand for ${deviceId}...`);
      
      const result = await influxService.getPeakDemand(deviceId);
      
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }
      
      res.json(result);
    } catch (error) {
      console.error('❌ Error in /summary/peak:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/summary/all
   * Returns: combined dashboard, comparison, and peak data in one call
   */
  router.get('/all', async (req, res) => {
    try {
      const { deviceId = 'AI205', costPerUnit = 4.00 } = req.query;
      
      console.log(`📊 Fetching complete usage summary for ${deviceId}...`);
      
      // Fetch all data in parallel
      const [dashboard, comparison, peak] = await Promise.all([
        influxService.getUsageSummaryDashboard(deviceId, parseFloat(costPerUnit)),
        influxService.getUsageComparison(deviceId),
        influxService.getPeakDemand(deviceId)
      ]);

      res.json({
        success: true,
        dashboard: dashboard.success ? dashboard : null,
        comparison: comparison.success ? comparison : null,
        peak: peak.success ? peak : null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error in /summary/all:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/summary/statistics
   * Returns: Aggregated statistics (avg/max/min) for Power, Voltage, Current, PF
   * Used by: Dashboard StatisticsBlock, AI Chat analysis
   */
  router.get('/statistics', async (req, res) => {
    try {
      const { deviceId = 'AI205', timeRange = 'today' } = req.query;
      
      console.log(`📊 Fetching AI data summary for ${deviceId} (${timeRange})...`);
      
      const result = await influxService.getDataSummaryForAI(timeRange, deviceId);
      
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }
      
      res.json(result);
    } catch (error) {
      console.error('❌ Error in /summary/statistics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
