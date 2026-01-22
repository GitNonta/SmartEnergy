/**
 * Energy Routes
 * API endpoints for energy data queries
 */

const express = require('express');
const router = express.Router();
const energyCalc = require('../services/energyCalculation');
const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';

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
        // OPTIMIZED: Calculate mean power directly in InfluxDB to avoid fetching all raw rows
        const currentHourQuery = `
          import "timezone"
          option location = timezone.location(name: "${TIMEZONE}")
          
          from(bucket: "${influxService.buckets.raw}")
            |> range(start: ${startOfHour.toISOString()})
            |> filter(fn: (r) => r.device_id == "${deviceId}")
            |> filter(fn: (r) => r._measurement == "energy_3phase")
            |> filter(fn: (r) => r._field == "power_active_kw")
            |> mean()
        `;

        const rawRows = await influxService.queryApi.collectRows(currentHourQuery);
        
        if (rawRows.length > 0) {
           const avgPower = rawRows[0]._value || 0;
           
           if (avgPower > 0) {
             const minutesElapsed = (now.getTime() - startOfHour.getTime()) / 60000;
             const hoursElapsed = minutesElapsed / 60;
             
             // Energy (kWh) = Power (kW) × Time (hours)
             const currentEnergy = avgPower * hoursElapsed;
             
             // Update current hour with realtime data
             const slot = hourlyMap.get(currentHour);
             slot.energy_total = currentEnergy;
             slot.quality = 'realtime_hybrid_optimized'; 
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

  // ==========================================
  // MIGRATED ROUTES FROM SERVER.JS
  // ==========================================

  // GET /api/energy/monthly-chart - Get daily breakdown for current month
  router.get('/monthly-chart', async (req, res) => {
    try {
      const { deviceId = 'AI205' } = req.query;
      
      const now = new Date();
      const currentDay = now.getDate();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      
      // Start of month in local timezone
      const monthStart = new Date(currentYear, currentMonth, 1, 0, 0, 0);
      
      // Query raw bucket for this month to calculate daily energy
      const fluxQuery = `
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        
        from(bucket: "${influxService.buckets.raw}")
          |> range(start: ${monthStart.toISOString()})
          |> filter(fn: (r) => r.device_id == "${deviceId}")
          |> filter(fn: (r) => r._measurement == "energy_3phase")
          |> filter(fn: (r) => r._field == "power_active_kw")
          |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
          |> map(fn: (r) => ({r with energy_kwh: r._value / 1.0}))
      `;
      
      const rows = await influxService.queryApi.collectRows(fluxQuery);
      
      // Initialize daily map
      const dailyMap = new Map();
      for (let i = 1; i <= daysInMonth; i++) {
        dailyMap.set(i, 0);
      }
      
      // Aggregate hourly data into daily
      rows.forEach(row => {
        const timestamp = new Date(row._time);
        if (timestamp.getMonth() === currentMonth && timestamp.getFullYear() === currentYear) {
          const day = timestamp.getDate();
          const energyKwh = (row._value || 0);
          const existing = dailyMap.get(day) || 0;
          dailyMap.set(day, existing + energyKwh);
        }
      });
      
      // Convert to chart format
      const chartData = [];
      for (let i = 1; i <= daysInMonth; i++) {
        const value = i <= currentDay ? (dailyMap.get(i) || 0) : 0;
        chartData.push({ x: `Day ${i}`, y: Number(value.toFixed(3)) });
      }
      
      const totalEnergy = chartData.reduce((sum, d) => sum + d.y, 0);
      
      res.json({
        success: true,
        chartData,
        total: Number(totalEnergy.toFixed(3)),
        currentDay,
        daysInMonth,
        month: currentMonth + 1,
        year: currentYear,
        unit: 'kWh',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error in /energy/monthly-chart:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        chartData: []
      });
    }
  });

  // GET /api/energy/yearly-chart - Get monthly breakdown for current year
  router.get('/yearly-chart', async (req, res) => {
    try {
      const { deviceId = 'AI205' } = req.query;
      
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      // Start of year
      const yearStart = new Date(currentYear, 0, 1, 0, 0, 0);
      
      const fluxQuery = `
        import "timezone"
        option location = timezone.location(name: "${TIMEZONE}")
        
        from(bucket: "${influxService.buckets.raw}")
          |> range(start: ${yearStart.toISOString()})
          |> filter(fn: (r) => r.device_id == "${deviceId}")
          |> filter(fn: (r) => r._measurement == "energy_3phase")
          |> filter(fn: (r) => r._field == "power_active_kw")
          |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
      `;
      
      const monthlyMap = new Map();
      
      // Initialize all months
      for (let i = 0; i < 12; i++) {
        monthlyMap.set(i, 0);
      }
      
      const rows = await influxService.queryApi.collectRows(fluxQuery);
      
      // Aggregate hourly data into monthly
      rows.forEach(row => {
        const timestamp = new Date(row._time);
        if (timestamp.getFullYear() === currentYear) {
          const month = timestamp.getMonth();
          const energyKwh = row._value || 0; // power_avg × 1h = kWh
          const existing = monthlyMap.get(month) || 0;
          monthlyMap.set(month, existing + energyKwh);
        }
      });
      
      // Convert to chart format
      const chartData = [];
      for (let i = 0; i < 12; i++) {
        const value = i <= currentMonth ? (monthlyMap.get(i) || 0) : 0;
        chartData.push({ x: months[i], y: Number(value.toFixed(2)) });
      }
      
      const totalEnergy = chartData.reduce((sum, d) => sum + d.y, 0);
      
      console.log(`📊 Yearly chart: ${rows.length} hourly points, total ${totalEnergy.toFixed(2)} kWh`);
      
      res.json({
        success: true,
        chartData,
        total: Number(totalEnergy.toFixed(2)),
        currentMonth: currentMonth + 1,
        year: currentYear,
        unit: 'kWh',
        calculationMethod: 'aggregateWindow(1h, mean) + sum (same as monthly)',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error in /energy/yearly-chart:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        chartData: []
      });
    }
  });

  // GET /api/energy/cost-history - Get historical energy and cost data for chart
  router.get('/cost-history', async (req, res) => {
    try {
      const { 
        mode = 'monthly', // daily, monthly, yearly
        deviceId = 'AI205',
        ftRate = 0.1572 
      } = req.query;
      
      const ft = parseFloat(ftRate);
      const now = new Date();
      
      // Determine range and granularity
      let range, granularity;
      const chartData = [];
      let totalEnergy = 0;
      let totalCost = 0;
      
      if (mode === 'daily') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        
        // Use daily-consumption logic (hourly breakdown)
        const fluxQuery = `
          import "timezone"
          import "date"
          option location = timezone.location(name: "${TIMEZONE}")
          
          todayStart = date.truncate(t: now(), unit: 1d)
          
          from(bucket: "${influxService.buckets.raw}")
            |> range(start: todayStart)
            |> filter(fn: (r) => r.device_id == "${deviceId}")
            |> filter(fn: (r) => r._measurement == "energy_3phase")
            |> filter(fn: (r) => r._field == "power_active_kw")
            |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
        `;
        
        const rows = await influxService.queryApi.collectRows(fluxQuery);
        
        // Process hourly data
        rows.forEach(row => {
            const timestamp = new Date(row._time);
            const hour = timestamp.getHours();
            const hourLabel = String(hour).padStart(2, '0') + ':00';
            const energy = (row._value || 0) * 1.0; // kW * 1h = kWh
            
            // Calculate cost using progressive rate
            const costData = energyCalc.calculateProgressiveCost(energy, ft);
            
            chartData.push({
                x: hourLabel,
                energy: Number(energy.toFixed(3)),
                cost: Number(costData.total.toFixed(2))
            });
            
            totalEnergy += energy;
            totalCost += costData.total;
        });
        
        // Ensure all hours up to current are present (simplified for now)
      } else if (mode === 'monthly') {
        // Daily breakdown for current month
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const monthStart = new Date(currentYear, currentMonth, 1, 0, 0, 0);
        
        const fluxQuery = `
          import "timezone"
          option location = timezone.location(name: "${TIMEZONE}")
          
          from(bucket: "${influxService.buckets.raw}")
            |> range(start: ${monthStart.toISOString()})
            |> filter(fn: (r) => r.device_id == "${deviceId}")
            |> filter(fn: (r) => r._measurement == "energy_3phase")
            |> filter(fn: (r) => r._field == "power_active_kw")
            |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
        `;
        
        const rows = await influxService.queryApi.collectRows(fluxQuery);
        const dailyMap = new Map();
        
        rows.forEach(row => {
            const timestamp = new Date(row._time);
            if (timestamp.getMonth() === currentMonth) {
                const day = timestamp.getDate();
                const energy = row._value || 0;
                const existing = dailyMap.get(day) || 0;
                dailyMap.set(day, existing + energy);
            }
        });
        
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const currentDay = now.getDate();
        
        for (let i = 1; i <= daysInMonth; i++) {
            if (i > currentDay) break;
            const energy = dailyMap.get(i) || 0;
            const costData = energyCalc.calculateProgressiveCost(energy, ft);
            chartData.push({
                x: i.toString(),
                energy: Number(energy.toFixed(3)),
                cost: Number(costData.total.toFixed(2))
            });
            totalEnergy += energy;
            totalCost += costData.total;
        }
      } else if (mode === 'yearly') {
        // Monthly breakdown for current year
        const currentYear = now.getFullYear();
        const yearStart = new Date(currentYear, 0, 1, 0, 0, 0);
        
        const fluxQuery = `
          import "timezone"
          option location = timezone.location(name: "${TIMEZONE}")
          
          from(bucket: "${influxService.buckets.raw}")
            |> range(start: ${yearStart.toISOString()})
            |> filter(fn: (r) => r.device_id == "${deviceId}")
            |> filter(fn: (r) => r._measurement == "energy_3phase")
            |> filter(fn: (r) => r._field == "power_active_kw")
            |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
        `;
        
        const rows = await influxService.queryApi.collectRows(fluxQuery);
        const monthlyMap = new Map();
        
        rows.forEach(row => {
            const timestamp = new Date(row._time);
            if (timestamp.getFullYear() === currentYear) {
                const month = timestamp.getMonth();
                const energy = row._value || 0;
                const existing = monthlyMap.get(month) || 0;
                monthlyMap.set(month, existing + energy);
            }
        });
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonth = now.getMonth();
        
        for (let i = 0; i <= currentMonth; i++) {
            const energy = monthlyMap.get(i) || 0;
            const costData = energyCalc.calculateProgressiveCost(energy, ft);
            chartData.push({
                x: months[i],
                energy: Number(energy.toFixed(3)),
                cost: Number(costData.total.toFixed(2))
            });
            totalEnergy += energy;
            totalCost += costData.total;
        }
      }
      
      res.json({
        success: true,
        mode,
        chartData,
        totalEnergy: Number(totalEnergy.toFixed(3)),
        totalCost: Number(totalCost.toFixed(2))
      });
    } catch (error) {
      console.error('❌ Error in /energy/cost-history:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
