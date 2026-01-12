/**
 * Energy Routes
 * API endpoints for energy data queries
 */

const express = require('express');
const router = express.Router();

module.exports = function(influxService, energyState) {
  
  // Get current energy state (RAM - realtime)
  router.get('/state', (req, res) => {
    try {
      const state = energyState.getState();
      res.json({
        success: true,
        source: 'RAM (realtime)',
        ...state
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get daily consumption from hourly bucket
  router.get('/daily-consumption', async (req, res) => {
    try {
      const { deviceId = 'AI205' } = req.query;
      
      console.log(`📊 Fetching daily consumption from HOURLY bucket for ${deviceId}...`);
      
      // ✅ Use hourly bucket (not raw!)
      const hourlyResult = await influxService.queryFromBucket('hourly', '-24h', deviceId, ['energy_total']);
      const hourlyData = hourlyResult.data || [];
      
      console.log(`✅ Got ${hourlyData.length} hourly data points from AI205_hourly`);

      if (!Array.isArray(hourlyData) || hourlyData.length === 0) {
        const emptyHours = [];
        for (let i = 0; i < 24; i++) {
          emptyHours.push({
            hour: String(i).padStart(2, '0') + ':00',
            energy_total: 0,
            quality: 'no_data'
          });
        }
        return res.json({
          success: true,
          source: 'AI205_hourly',
          deviceId,
          hourlyData: emptyHours,
          totalEnergy: 0,
          dataPoints: 0,
          note: '⚠️ No data in hourly bucket'
        });
      }

      // Group by hour of day
      const hourlyMap = new Map();
      for (let i = 0; i < 24; i++) {
        hourlyMap.set(i, { energy_total: 0, quality: 'no_data', count: 0 });
      }

      for (const point of hourlyData) {
        try {
          if (!point._time) continue;
          const timestamp = new Date(point._time);
          if (isNaN(timestamp.getTime())) continue;
          
          const hour = timestamp.getHours();
          
          if (hourlyMap.has(hour)) {
            const slot = hourlyMap.get(hour);
            slot.energy_total += Number(point._value) || 0;
            slot.quality = point.quality || 'measured';
            slot.count++;
          }
        } catch (e) {
          console.warn(`⚠️ Skipping bad hourly point:`, e.message);
        }
      }

      const result = [];
      let totalEnergy = 0;
      
      hourlyMap.forEach((values, hour) => {
        const hourLabel = String(hour).padStart(2, '0') + ':00';
        const energy = values.energy_total || 0;
        
        result.push({
          hour: hourLabel,
          energy_total: Number(energy.toFixed(3)),
          quality: values.quality
        });
        
        totalEnergy += energy;
      });

      result.sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

      res.json({
        success: true,
        source: 'AI205_hourly',
        deviceId,
        hourlyData: result,
        totalEnergy: Number(totalEnergy.toFixed(3)),
        dataPoints: hourlyData.length,
        note: '✅ Data from hourly bucket (Flux is single source of truth)'
      });
    } catch (error) {
      console.error('❌ Error in /daily-consumption:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get hourly chart data
  router.get('/chart/hourly', async (req, res) => {
    try {
      const { range = '-24h', deviceId = 'AI205' } = req.query;
      
      const result = await influxService.queryFromBucket('hourly', range, deviceId, ['energy_total']);
      
      res.json({
        success: true,
        source: 'AI205_hourly',
        range,
        deviceId,
        data: result.data || [],
        count: result.data?.length || 0
      });
    } catch (error) {
      console.error('❌ Error in /chart/hourly:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get daily report data
  router.get('/report/daily', async (req, res) => {
    try {
      const { range = '-30d', deviceId = 'AI205' } = req.query;
      
      const result = await influxService.queryFromBucket('daily', range, deviceId, ['energy_total']);
      
      res.json({
        success: true,
        source: 'AI205_daily',
        range,
        deviceId,
        data: result.data || [],
        count: result.data?.length || 0
      });
    } catch (error) {
      console.error('❌ Error in /report/daily:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get monthly billing data
  router.get('/billing/monthly', async (req, res) => {
    try {
      const { range = '-365d', deviceId = 'AI205' } = req.query;
      
      const result = await influxService.queryFromBucket('monthly', range, deviceId, ['energy_total']);
      
      res.json({
        success: true,
        source: 'AI205_monthly',
        range,
        deviceId,
        data: result.data || [],
        count: result.data?.length || 0
      });
    } catch (error) {
      console.error('❌ Error in /billing/monthly:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get range summary with chart data
  router.get('/range-summary', async (req, res) => {
    try {
      const { 
        startDate = '-7d', 
        endDate = 'now()', 
        granularity = 'day',
        deviceId = 'AI205',
        costPerUnit = '4.0'
      } = req.query;
      
      console.log(`📊 Fetching range summary: ${startDate} to ${endDate}, granularity=${granularity}`);
      
      const result = await influxService.getRangeSummary(
        deviceId, 
        startDate, 
        endDate, 
        granularity, 
        parseFloat(costPerUnit)
      );
      
      res.json(result);
    } catch (error) {
      console.error('❌ Error in /range-summary:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get historical chart data for custom date range
  router.get('/historical-chart', async (req, res) => {
    try {
      const { 
        range = '-7d',
        granularity = 'day',
        deviceId = 'AI205'
      } = req.query;
      
      console.log(`📊 Fetching historical chart: range=${range}, granularity=${granularity}`);
      
      const result = await influxService.queryCustomDateRange(
        deviceId,
        range,
        'now()',
        granularity
      );
      
      res.json({
        success: true,
        source: 'AI205_raw',
        range,
        granularity,
        deviceId,
        data: result.data || [],
        count: result.count || 0
      });
    } catch (error) {
      console.error('❌ Error in /historical-chart:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
