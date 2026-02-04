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

  // Get daily consumption using spread function on energy_total
  // METHOD: Spread = Max - Min of cumulative energy_total for each hour

  router.get('/daily-consumption', async (req, res) => {
    try {
      const { deviceId = 'AI205' } = req.query;
      const bucket = influxService.buckets.raw;
      
      console.log(`📊 Fetching daily consumption (Integral Method) for ${deviceId}...`);

      // Query 1: Mean Power per Hour (for Bar Chart visualization)
      const hourlyQuery = `
        import "timezone"
        option location = timezone.location(name: "${TIMEZONE}")

        from(bucket: "${bucket}")
          |> range(start: today())
          |> filter(fn: (r) => r["_measurement"] == "energy_3phase")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> filter(fn: (r) => r["_field"] == "power_active_kw")
          |> aggregateWindow(every: 1h, fn: mean, createEmpty: true)
      `;

      // Query 2: Integral for Total Energy (Σ Power × Δt)
      // This is the mathematically accurate formula: ∫P(t)dt
      const integralQuery = `
        import "timezone"
        option location = timezone.location(name: "${TIMEZONE}")

        from(bucket: "${bucket}")
          |> range(start: today())
          |> filter(fn: (r) => r["_measurement"] == "energy_3phase")
          |> filter(fn: (r) => r["device_id"] == "${deviceId}")
          |> filter(fn: (r) => r["_field"] == "power_active_kw")
          |> integral(unit: 1h)
      `;

      // Execute both queries in parallel
      const [hourlyRows, integralRows] = await Promise.all([
        influxService.queryApi.collectRows(hourlyQuery),
        influxService.queryApi.collectRows(integralQuery)
      ]);
      
      console.log(`✅ Got ${hourlyRows.length} hourly rows, integral query returned ${integralRows.length} rows`);

      // Initialize 24-hour array (00:00 - 23:00)
      const hourlyData = [];
      const now = new Date();
      const currentHour = now.getHours();

      for (let i = 0; i < 24; i++) {
        hourlyData.push({
          hour: String(i).padStart(2, '0') + ':00',
          energy_total: 0,
          quality: i > currentHour ? 'future' : 'no_data'
        });
      }

      // Map Flux results to hourly slots
      let sumOfBars = 0;
      
      hourlyRows.forEach(row => {
        if (!row._time) return;
        const timestamp = new Date(row._time);
        let hour = timestamp.getHours();
        
        // aggregateWindow(1h) returns timestamp at END of window
        // 00:00-01:00 -> 01:00. Map to index 0.
        let index = hour - 1; 
        if (hour === 0) index = 23;

        if (index >= 0 && index < 24) {
             const val = row._value || 0;
             hourlyData[index].energy_total = Number(val.toFixed(3));
             hourlyData[index].quality = 'measured';
             sumOfBars += val;
        }
      });

      // Get Total Energy from Integral (more accurate: Σ Power × Δt)
      const integralTotal = integralRows.length > 0 ? (integralRows[0]._value || 0) : 0;
      // Use integral as primary, fallback to sumOfBars if integral returns 0 (e.g., no data yet)
      const totalEnergy = integralTotal > 0 ? integralTotal : sumOfBars;

      res.json({
        success: true,
        source: 'AI205_raw (Integral)',
        calculationMethod: 'integral(power × dt)',
        formula: 'Energy = Σ(Power × Δt) = ∫P(t)dt',
        deviceId,
        hourlyData,
        totalEnergy: Number(totalEnergy.toFixed(3)),
        currentHour,
        debug: {
            sumOfBars: Number(sumOfBars.toFixed(3)),
            integralTotal: Number(integralTotal.toFixed(3))
        }
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
  // ✅ Uses window(1d) + integral for accurate daily energy
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
      
      console.log(`📊 Fetching monthly chart for ${deviceId}, month ${currentMonth + 1}/${currentYear}...`);
      
      // Query: Daily Integral using window() + integral()
      // This correctly calculates integral within each day window
      const dailyIntegralQuery = `
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        
        from(bucket: "${influxService.buckets.raw}")
          |> range(start: ${monthStart.toISOString()})
          |> filter(fn: (r) => r.device_id == "${deviceId}")
          |> filter(fn: (r) => r._measurement == "energy_3phase")
          |> filter(fn: (r) => r._field == "power_active_kw")
          |> window(every: 1d)
          |> integral(unit: 1h)
          |> duplicate(column: "_stop", as: "_time")
          |> window(every: inf)
      `;
      
      const rows = await influxService.queryApi.collectRows(dailyIntegralQuery);
      
      console.log(`✅ Got ${rows.length} daily integral values`);
      
      // Initialize daily map
      const dailyMap = new Map();
      for (let i = 1; i <= daysInMonth; i++) {
        dailyMap.set(i, 0);
      }
      
      // Map results to daily slots
      rows.forEach(row => {
        if (!row._time) return;
        const timestamp = new Date(row._time);
        if (timestamp.getMonth() === currentMonth && timestamp.getFullYear() === currentYear) {
          const day = timestamp.getDate();
          const energyKwh = row._value || 0;
          dailyMap.set(day, energyKwh);
        }
      });
      
      // Convert to chart format
      const chartData = [];
      for (let i = 1; i <= daysInMonth; i++) {
        const value = i <= currentDay ? (dailyMap.get(i) || 0) : 0;
        chartData.push({ x: `Day ${i}`, y: Number(value.toFixed(3)) });
      }
      
      // Sum of bars = Total
      const totalEnergy = chartData.reduce((sum, d) => sum + d.y, 0);
      
      console.log(`📊 Monthly chart: Total ${totalEnergy.toFixed(3)} kWh (sum of ${rows.length} daily integrals)`);
      
      res.json({
        success: true,
        source: 'AI205_raw (Daily Integral)',
        calculationMethod: 'window(1d) + integral(unit: 1h)',
        formula: 'Bar = ∫P(t)dt per day, Total = Σ Bars',
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
  // ✅ Uses window(1mo) + integral for accurate monthly energy
  router.get('/yearly-chart', async (req, res) => {
    try {
      const { deviceId = 'AI205' } = req.query;
      
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      // Start of year
      const yearStart = new Date(currentYear, 0, 1, 0, 0, 0);
      
      console.log(`📊 Fetching yearly chart for ${deviceId}, year ${currentYear}...`);
      
      // Query: Monthly Integral using window() + integral()
      const monthlyIntegralQuery = `
        import "timezone"
        option location = timezone.location(name: "${TIMEZONE}")
        
        from(bucket: "${influxService.buckets.raw}")
          |> range(start: ${yearStart.toISOString()})
          |> filter(fn: (r) => r.device_id == "${deviceId}")
          |> filter(fn: (r) => r._measurement == "energy_3phase")
          |> filter(fn: (r) => r._field == "power_active_kw")
          |> window(every: 1mo)
          |> integral(unit: 1h)
          |> duplicate(column: "_stop", as: "_time")
          |> window(every: inf)
      `;
      
      const rows = await influxService.queryApi.collectRows(monthlyIntegralQuery);
      
      console.log(`✅ Got ${rows.length} monthly integral values`);
      
      const monthlyMap = new Map();
      
      // Initialize all months
      for (let i = 0; i < 12; i++) {
        monthlyMap.set(i, 0);
      }
      
      // Map results to monthly slots
      rows.forEach(row => {
        if (!row._time) return;
        const timestamp = new Date(row._time);
        if (timestamp.getFullYear() === currentYear) {
          const month = timestamp.getMonth();
          const energyKwh = row._value || 0;
          monthlyMap.set(month, energyKwh);
        }
      });
      
      // Convert to chart format
      const chartData = [];
      for (let i = 0; i < 12; i++) {
        const value = i <= currentMonth ? (monthlyMap.get(i) || 0) : 0;
        chartData.push({ x: months[i], y: Number(value.toFixed(2)) });
      }
      
      // Sum of bars = Total
      const totalEnergy = chartData.reduce((sum, d) => sum + d.y, 0);
      
      console.log(`📊 Yearly chart: Total ${totalEnergy.toFixed(2)} kWh (sum of ${rows.length} monthly integrals)`);
      
      res.json({
        success: true,
        source: 'AI205_raw (Monthly Integral)',
        calculationMethod: 'window(1mo) + integral(unit: 1h)',
        formula: 'Bar = ∫P(t)dt per month, Total = Σ Bars',
        chartData,
        total: Number(totalEnergy.toFixed(2)),
        currentMonth: currentMonth + 1,
        year: currentYear,
        unit: 'kWh',
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
