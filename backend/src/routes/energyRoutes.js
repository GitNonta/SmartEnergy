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

  // Get daily consumption from hourly bucket + real-time current hour (HYBRID)
  // STEP 4 FIX: Combines historical data with realtime for current hour
  router.get('/daily-consumption', async (req, res) => {
    try {
      const { deviceId = 'AI205' } = req.query;
      
      console.log(`📊 Fetching daily consumption (HYBRID) for ${deviceId}...`);
      
      // PART A: ดึงข้อมูลประวัติ (Historical) จาก Hourly Bucket
      const hourlyResult = await influxService.queryFromBucket('hourly', '-24h', deviceId, ['energy_total']);
      let hourlyData = hourlyResult.data || [];
      
      console.log(`✅ Got ${hourlyData.length} hourly data points from AI205_hourly`);

      // Initialize all 24 hours with base data
      const hourlyMap = new Map();
      for (let i = 0; i < 24; i++) {
        hourlyMap.set(i, { energy_total: 0, quality: 'no_data', count: 0 });
      }

      // Process historical hourly data
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

      // PART B: ดึงข้อมูลชั่วโมงปัจจุบัน (Real-time) จาก Raw Bucket
      const now = new Date();
      const currentHour = now.getHours();
      const startOfHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentHour, 0, 0);
      
      try {
        // Query Raw Data for current hour only
        const currentRawData = await influxService.queryData({
          bucket: 'raw',
          range: startOfHour.toISOString(),
          deviceId
        });

        // Calculate energy for current hour
        if (currentRawData && currentRawData.length > 0) {
          const powers = currentRawData
            .filter(d => d._field === 'power_active_kw')
            .map(d => parseFloat(d._value) || 0)
            .filter(v => v > 0);
          
          if (powers.length > 0) {
            // Calculate average power and estimate energy
            const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;
            const minutesElapsed = (now.getTime() - startOfHour.getTime()) / 60000;
            const hoursElapsed = minutesElapsed / 60;
            
            // Energy (kWh) = Power (kW) × Time (hours)
            const currentEnergy = avgPower * hoursElapsed;
            
            // Update current hour with realtime data
            const slot = hourlyMap.get(currentHour);
            slot.energy_total = currentEnergy;
            slot.quality = 'realtime_hybrid';
            slot.avgPower = avgPower;
            slot.minutesElapsed = Math.round(minutesElapsed);
            
            console.log(`⚡ Current hour ${currentHour}:00 - Avg Power: ${avgPower.toFixed(3)} kW, Energy: ${currentEnergy.toFixed(4)} kWh (${Math.round(minutesElapsed)} min)`);
          }
        }
      } catch (rawError) {
        console.warn(`⚠️ Could not fetch current hour raw data:`, rawError.message);
        // Continue with hourly data only
      }

      // PART C: Convert to array format
      const result = [];
      let totalEnergy = 0;
      
      hourlyMap.forEach((values, hour) => {
        const hourLabel = String(hour).padStart(2, '0') + ':00';
        const energy = hour <= currentHour ? values.energy_total : 0;
        
        result.push({
          hour: hourLabel,
          energy_total: Number(energy.toFixed(3)),
          quality: hour <= currentHour ? values.quality : 'future'
        });
        
        if (hour <= currentHour) {
          totalEnergy += energy;
        }
      });

      result.sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

      res.json({
        success: true,
        source: 'AI205_hourly + realtime',
        calculationMethod: 'hybrid',
        deviceId,
        hourlyData: result,
        totalEnergy: Number(totalEnergy.toFixed(3)),
        dataPoints: hourlyData.length,
        currentHour,
        note: '✅ Hybrid: Historical + Realtime for current hour'
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
      
      console.log(`📊 Fetching hourly chart data (Integral) for ${deviceId} over ${range}...`);
      
      // ✅ Use queryDailyConsumption (Realtime Raw Integral) for accuracy
      // This matches the Summary Block's logic exactly
      const result = await influxService.queryDailyConsumption(deviceId, range);
      
      res.json({
        success: true,
        source: 'AI205_raw (Integral)',
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
