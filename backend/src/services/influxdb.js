const { InfluxDB, Point } = require('@influxdata/influxdb-client');
require('dotenv').config();

// InfluxDB Configuration
const url = process.env.INFLUXDB_URL || 'http://localhost:8086';
const token = process.env.INFLUXDB_TOKEN;
const org = process.env.INFLUXDB_ORG;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';

// Bucket Configuration (all aggregates come from raw directly)
// AI205_raw ─┬─> AI205_hourly  (Hourly)
//            ├─> AI205_daily   (Daily)
//            ├─> AI205_weekly  (Weekly)
//            ├─> AI205_monthly (Monthly)
//            └─> AI205_yearly  (Yearly/Billing)
const buckets = {
  raw: process.env.INFLUXDB_BUCKET_RAW || 'AI205_raw',
  hourly: process.env.INFLUXDB_BUCKET_HOURLY || 'AI205_hourly',
  daily: process.env.INFLUXDB_BUCKET_DAILY || 'AI205_daily',
  weekly: process.env.INFLUXDB_BUCKET_WEEKLY || 'AI205_weekly',
  monthly: process.env.INFLUXDB_BUCKET_MONTHLY || 'AI205_monthly',
  yearly: process.env.INFLUXDB_BUCKET_YEARLY || 'AI205_yearly'
};

// Initialize InfluxDB client
const influxDB = new InfluxDB({ url, token });

// Track closed state to prevent writes after shutdown
let isClosed = false;

// ========================================
// CONNECTION STATE CACHING
// ⚠️ CRITICAL: Don't check connection on every write!
// Cache connection state and check periodically
// ========================================
let connectionState = {
  isConnected: true,         // Assume connected initially
  lastCheck: Date.now(),
  checkInterval: 30000,      // Check every 30 seconds
  consecutiveFailures: 0
};

// ========================================
// P2-3: OBSERVABILITY METRICS
// ========================================
let metrics = {
  writeFailCount: 0,
  droppedPointsCount: 0,
  lastWriteFailTime: null,
  lastWriteFailError: null
};

// ========================================
// REBOOT DETECTION STATE
// Track last Ep_total to detect device reboot/reset
// ========================================
let rebootState = {
  lastEpTotal: null,
  lastEpTotalTime: null,
  rebootDetected: false,
  rebootDetectedTime: null,
  pointsAfterReboot: 0
};

// Write options - Failure Policy (P2-1):
// - writeRetryAttempts: 0 → Write fail = drop immediately (no retry loop)
// - maxBufferLines: 5000 → Buffer overflow = drop old (prevent memory bloat)
// - flushInterval: 1000 → Flush every 1 second
const writeOptions = {
  batchSize: 500,
  flushInterval: 1000,
  // ✅ Retry 3 times before dropping - important for energy data
  writeRetryAttempts: 3,
  writeRetryInterval: 2000,   // 2 seconds between retries
  writeRetryJitter: 500,      // Random jitter to prevent thundering herd
  maxBufferLines: 10000,      // Increased buffer for retry period
  gzipThreshold: 1024,
  // Handler for write failures - log and track metrics (don't crash)
  writeFailed: (error, lines, attempts) => {
    metrics.writeFailCount++;
    metrics.droppedPointsCount += lines.length;
    metrics.lastWriteFailTime = new Date().toISOString();
    metrics.lastWriteFailError = error.message;
    console.error(`❌ InfluxDB write failed #${metrics.writeFailCount} (dropped ${lines.length} points, total: ${metrics.droppedPointsCount}):`, error.message);
    // Return false = don't retry, just drop
    return false;
  }
};

// Write API for raw bucket only (aggregates done by InfluxDB Tasks)
const writeApi = influxDB.getWriteApi(org, buckets.raw, 'ns', writeOptions);
writeApi.useDefaultTags({ source: 'mqtt_backend' });

// Query API for reading from any bucket
const queryApi = influxDB.getQueryApi(org);

/**
 * Get observability metrics (P2-3)
 */
function getMetrics() {
  return {
    ...metrics,
    bufferConfig: {
      maxBufferLines: writeOptions.maxBufferLines,
      batchSize: writeOptions.batchSize,
      flushInterval: writeOptions.flushInterval
    }
  };
}


// Helper: normalize number, return null if invalid
function toNumber(value) {
  if (value === undefined || value === null) return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Test InfluxDB connection
 */
async function testConnection() {
  try {
    // Simple health check by trying to get org
    const orgsAPI = new (require('@influxdata/influxdb-client-apis').OrgsAPI)(influxDB);
    await orgsAPI.getOrgs({ org });
    console.log('✅ InfluxDB connection successful');
    return { success: true, message: 'Connected to InfluxDB' };
  } catch (error) {
    console.error('❌ InfluxDB connection failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Write raw energy data to InfluxDB
 * Saves both 3-phase combined and per-phase data
 * @param {Object} data - MQTT message data
 * @param {string} deviceId - Device identifier
 */
async function writeRawData(data, deviceId = 'AI205') {
  try {
    if (isClosed) {
      return { success: false, error: 'influx write disabled: service closed' };
    }
    
    // ========================================
    // CONNECTION CHECK WITH CACHING
    // ⚠️ Don't check on every write! Use cached state
    // Only re-check if interval elapsed or previous failure
    // ========================================
    const now = Date.now();
    const shouldCheck = (now - connectionState.lastCheck) > connectionState.checkInterval 
                       || connectionState.consecutiveFailures > 0;
    
    if (shouldCheck) {
      const health = await testConnection();
      connectionState.isConnected = health.success;
      connectionState.lastCheck = now;
      
      if (!health.success) {
        connectionState.consecutiveFailures++;
        console.warn(`⚠️ InfluxDB unavailable (fail #${connectionState.consecutiveFailures})`);
        return { success: false, error: 'influxdb_unavailable', silent: true };
      } else {
        connectionState.consecutiveFailures = 0;
      }
    }
    
    // Skip write if known disconnected
    if (!connectionState.isConnected) {
      return { success: false, error: 'influxdb_unavailable', silent: true };
    }
    
    // ========================================
    // P2-2: TIME SKEW PROTECTION
    // ========================================
    const serverTime = new Date();
    let timestamp = serverTime;
    let deviceTimestamp = null;
    let timeSkewed = false;
    
    // Check if device sent a timestamp
    if (data.timestamp || data.ts || data.time) {
      const deviceTs = new Date(data.timestamp || data.ts || data.time);
      
      if (!isNaN(deviceTs.getTime())) {
        deviceTimestamp = deviceTs;
        
        // Calculate time difference in seconds
        const skewSeconds = Math.abs(serverTime.getTime() - deviceTs.getTime()) / 1000;
        
        // If skew > 60 seconds, override with server time
        const MAX_SKEW_SECONDS = 60;
        if (skewSeconds > MAX_SKEW_SECONDS) {
          console.warn(`⚠️ Time skew detected: ${skewSeconds.toFixed(1)}s - using server time`);
          timestamp = serverTime;
          timeSkewed = true;
        } else {
          // Device time is acceptable, use it
          timestamp = deviceTs;
        }
      }
    }

    // ========================================
    // 1. COMBINED 3-PHASE DATA (Total/System)
    // ========================================
    const combinedPoint = new Point('energy_3phase')
      .tag('device_id', deviceId)
      .tag('location', data.location || 'unknown')
      .timestamp(timestamp);
    
    // Store device timestamp as field for debugging (P2-2)
    if (deviceTimestamp) {
      combinedPoint.stringField('device_ts', deviceTimestamp.toISOString());
    }
    if (timeSkewed) {
      combinedPoint.booleanField('time_skewed', true);
    }

    // Total Power (System) - เก็บเป็น W (วัตต์)
    const kWsum = toNumber(data.kWsum) ?? toNumber(data.power_active);
    const powerWatts = toNumber(data.Wsum) ?? (kWsum != null ? kWsum * 1000 : null);
    
    if (powerWatts !== null) {
      combinedPoint.floatField('power_active', powerWatts);
      combinedPoint.floatField('power_active_kw', powerWatts / 1000);
    }
    
    // System Power Factor
    const pfSys = toNumber(data.PFsys) ?? toNumber(data.power_factor);
    if (pfSys != null) combinedPoint.floatField('power_factor', pfSys);
    
    // Frequency (System-wide)
    const freq = toNumber(data.Hz) ?? toNumber(data.frequency);
    if (freq != null) combinedPoint.floatField('frequency', freq);

    // Energy Totals
    const eImp = toNumber(data.Ep_imp) ?? toNumber(data.energy_import);
    const eExp = toNumber(data.Ep_exp) ?? toNumber(data.energy_export);
    const eTot = toNumber(data.Ep_total);
    const eNet = toNumber(data.Ep_net);
    
    // ========================================
    // REBOOT DETECTION LOGIC
    // If Ep_total drops significantly, device likely rebooted
    // ========================================
    let recoveredAfterReboot = false;
    if (eTot !== null) {
      if (rebootState.lastEpTotal !== null) {
        // Check if Ep_total decreased (indicates meter reset/reboot)
        const decrease = rebootState.lastEpTotal - eTot;
        // If decreased by more than 1 kWh, consider it a reboot
        if (decrease > 1) {
          rebootState.rebootDetected = true;
          rebootState.rebootDetectedTime = new Date().toISOString();
          rebootState.pointsAfterReboot = 0;
          console.warn(`⚠️ REBOOT DETECTED: Ep_total dropped from ${rebootState.lastEpTotal} to ${eTot} (Δ${decrease.toFixed(2)} kWh)`);
        }
      }
      
      // Mark first 5 points after reboot for data quality tracking
      if (rebootState.rebootDetected) {
        rebootState.pointsAfterReboot++;
        if (rebootState.pointsAfterReboot <= 5) {
          recoveredAfterReboot = true;
          console.log(`📊 Post-reboot point #${rebootState.pointsAfterReboot}: Ep_total=${eTot}`);
        } else {
          // After 5 points, consider reboot handled
          rebootState.rebootDetected = false;
          console.log('✅ Reboot recovery complete - resuming normal operation');
        }
      }
      
      // Update last known Ep_total
      rebootState.lastEpTotal = eTot;
      rebootState.lastEpTotalTime = timestamp.toISOString();
    }
    
    // Mark data quality flag for recovered after reboot
    if (recoveredAfterReboot) {
      combinedPoint.booleanField('recovered_after_reboot', true);
    }
    
    if (eImp != null) combinedPoint.floatField('energy_import', eImp);
    if (eExp != null) combinedPoint.floatField('energy_export', eExp);
    if (eTot != null) {
      combinedPoint.floatField('energy_total', eTot);
      // ✅ Clear field name for debugging and easy querying
      combinedPoint.floatField('energy_total_kwh', eTot);
    }
    if (eNet != null) combinedPoint.floatField('energy_net', eNet);


    // System-level Power Quality
    const thdv = toNumber(data.thd_voltage);
    const thdi = toNumber(data.thd_current);
    const vUnb = toNumber(data.voltage_unbalance);
    if (thdv != null) combinedPoint.floatField('thd_voltage', thdv);
    if (thdi != null) combinedPoint.floatField('thd_current', thdi);
    if (vUnb != null) combinedPoint.floatField('voltage_unbalance', vUnb);

    // Additional system data
    const reactive = toNumber(data.power_reactive);
    if (reactive != null) {
      combinedPoint.floatField('power_reactive', reactive);
      combinedPoint.floatField('power_reactive_var', reactive * 1000);
    }
    const apparent = toNumber(data.power_apparent);
    if (apparent != null) {
      combinedPoint.floatField('power_apparent', apparent);
      combinedPoint.floatField('power_apparent_va', apparent * 1000);
    }
    const temp = toNumber(data.temperature);
    if (temp != null) combinedPoint.floatField('temperature', temp);
    // Note: status is stored as field to prevent high cardinality
    if (data.status) combinedPoint.stringField('status', data.status);
    const cq = toNumber(data.connection_quality);
    if (cq != null) combinedPoint.floatField('connection_quality', cq);

    writeApi.writePoint(combinedPoint);

    // ========================================
    // 2. PER-PHASE DATA (L1, L2, L3)
    // ========================================
    const phases = [
      { name: 'L1', voltage: toNumber(data.V1) ?? toNumber(data.voltage_L1), current: toNumber(data.I1) ?? toNumber(data.current_L1), 
        power: toNumber(data.kW1) ?? toNumber(data.power_active_L1), pf: toNumber(data.PF1) ?? toNumber(data.power_factor_L1) },
      { name: 'L2', voltage: toNumber(data.V2) ?? toNumber(data.voltage_L2), current: toNumber(data.I2) ?? toNumber(data.current_L2), 
        power: toNumber(data.kW2) ?? toNumber(data.power_active_L2), pf: toNumber(data.PF2) ?? toNumber(data.power_factor_L2) },
      { name: 'L3', voltage: toNumber(data.V3) ?? toNumber(data.voltage_L3), current: toNumber(data.I3) ?? toNumber(data.current_L3), 
        power: toNumber(data.kW3) ?? toNumber(data.power_active_L3), pf: toNumber(data.PF3) ?? toNumber(data.power_factor_L3) }
    ];

    phases.forEach(phase => {
      const phasePoint = new Point('energy_per_phase')
        .tag('device_id', deviceId)
        .tag('phase', phase.name)
        .tag('location', data.location || 'unknown')
        .timestamp(timestamp);

      if (phase.voltage !== undefined && phase.voltage !== null) {
        phasePoint.floatField('voltage', phase.voltage);
      }

      if (phase.current !== undefined && phase.current !== null) {
        phasePoint.floatField('current', phase.current);
      }

      if (phase.power !== undefined && phase.power !== null) {
        const powerKW = phase.power;
        const powerWatts = powerKW * 1000;
        phasePoint.floatField('power_active', powerWatts);
        phasePoint.floatField('power_active_kw', powerKW);
      }

      if (phase.pf !== undefined && phase.pf !== null) {
        phasePoint.floatField('power_factor', phase.pf);
      }

      if (phase.voltage !== undefined && phase.voltage !== null && phase.current !== undefined && phase.current !== null) {
        const apparentPowerKVA = phase.voltage * phase.current / 1000;
        const apparentPowerVA = phase.voltage * phase.current;
        phasePoint.floatField('power_apparent', apparentPowerKVA);
        phasePoint.floatField('power_apparent_va', apparentPowerVA);
      }

      if (phase.voltage !== undefined || phase.current !== undefined || 
          phase.power !== undefined || phase.pf !== undefined) {
        writeApi.writePoint(phasePoint);
      }
    });

    // Opportunistic flush (2% chance)
    if (Math.random() < 0.02) await writeApi.flush();

    return { success: true };
  } catch (error) {
    console.error('❌ Error writing to InfluxDB:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Flush write API and close connection
 */
async function close() {
  try {
    isClosed = true;
    await writeApi.close();
    console.log('✅ InfluxDB connection closed');
  } catch (error) {
    console.error('❌ Error closing InfluxDB connection:', error);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await close();
  process.exit(0);
});

/**
 * Query data from a specific bucket
 * @param {string} bucketKey - Key from buckets config (raw, hourly, daily, weekly, monthly, yearly)
 * @param {string} range - Time range (e.g., '-1d', '-7d', '-30d', '-365d')
 * @param {string} deviceId - Device ID filter
 * @param {string[]} fields - Optional fields to filter
 */
async function queryFromBucket(bucketKey, range = '-1d', deviceId = 'AI205', fields = []) {
  try {
    const bucketName = buckets[bucketKey] || bucketKey;
    
    let fieldsFilter = '';
    if (fields && fields.length > 0) {
      const fieldFilters = fields.map(f => `r._field == "${f}"`).join(' or ');
      fieldsFilter = `|> filter(fn: (r) => ${fieldFilters})`;
    }
    
    const query = `
      from(bucket: "${bucketName}")
        |> range(start: ${range})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        ${fieldsFilter}
        |> sort(columns: ["_time"], desc: false)
    `;
    
    const results = [];
    const rows = queryApi.iterateRows(query);
    
    for await (const { values, tableMeta } of rows) {
      const row = tableMeta.toObject(values);
      results.push({
        _time: row._time,
        _field: row._field,
        _value: row._value,
        device_id: row.device_id,
        phase: row.phase,
        _measurement: row._measurement
      });
    }
    
    return { success: true, data: results, bucket: bucketName, count: results.length };
  } catch (error) {
    console.error('❌ Error querying bucket:', error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Query data wrapper - accepts object parameters for compatibility
 * @param {Object} options - Query options
 * @param {string} options.bucket - Bucket key (raw, hourly, daily, etc.)
 * @param {string} options.range - Time range
 * @param {string} options.deviceId - Device ID
 * @param {string[]} options.fields - Fields to filter
 */
async function queryData(options = {}) {
  const {
    bucket = 'raw',
    range = '-1d',
    deviceId = 'AI205',
    fields = [],
    measurementType,
    phase
  } = options;
  
  try {
    const result = await queryFromBucket(bucket, range, deviceId, fields);
    // Return just the data array for backward compatibility
    return result.data || [];
  } catch (error) {
    console.error('❌ Error in queryData:', error);
    return [];
  }
}

/**
 * Query daily consumption (hourly breakdown for today)
 * @param {string} deviceId - Device ID
 */
async function queryDailyConsumption(deviceId = 'AI205', timeRange = 'today()') {
  try {
    // ✅ FIX: Riemann Sum Integration (Digital Integration)
    // 1. Resample to 1 minute resolution (fill gaps)
    // 2. Convert Power(kW) -> Energy(kWh) per minute
    // 3. Sum minutes into hours
    // This is the most robust method for bar charts to ensure Sum(Bars) == Total Area
    
    let rangeLogic = '';
    
    if (timeRange === 'today()') {
      rangeLogic = `
        targetStart = date.truncate(t: now(), unit: 1d)
        queryStart = date.sub(from: targetStart, d: 2h) // Buffer
        
        from(bucket: "${buckets.raw}")
          |> range(start: queryStart)
          |> filter(fn: (r) => r.device_id == "${deviceId}")
          |> filter(fn: (r) => r._measurement == "energy_3phase")
          |> filter(fn: (r) => r._field == "power_active_kw")
          |> aggregateWindow(every: 1m, fn: mean, createEmpty: true)
          |> fill(usePrevious: true)
          |> map(fn: (r) => ({ r with _value: r._value / 60.0 })) // kW -> kWh/min
          |> filter(fn: (r) => r._time >= targetStart) // Crop
      `;
    } else {
      const startRange = timeRange.startsWith('-') ? timeRange : `time(v: "${timeRange}")`;
      rangeLogic = `
        from(bucket: "${buckets.raw}")
          |> range(start: ${startRange})
          |> filter(fn: (r) => r.device_id == "${deviceId}")
          |> filter(fn: (r) => r._measurement == "energy_3phase")
          |> filter(fn: (r) => r._field == "power_active_kw")
          |> aggregateWindow(every: 1m, fn: mean, createEmpty: true)
          |> fill(usePrevious: true)
          |> map(fn: (r) => ({ r with _value: r._value / 60.0 })) // kW -> kWh/min
      `;
    }

    const query = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      ${rangeLogic}
      // Sum the 1-minute energy packets into hourly buckets
      |> aggregateWindow(every: 1h, fn: sum, createEmpty: false)
    `;
    
    const rows = await queryApi.collectRows(query);

    const hourlyData = rows.map(row => {
      const date = new Date(row._time);
      return {
        _time: row._time,
        _value: row._value,
        hour: date.getHours().toString().padStart(2, '0') + ':00'
      };
    });
    
    return { success: true, data: hourlyData, hourlyData: hourlyData };
  } catch (error) {
    console.error('❌ Error querying daily consumption:', error);
    return { success: false, error: error.message, data: [], hourlyData: [] };
  }
}

/**
 * Query daily realtime energy (today's total from raw bucket)
 * ✅ FIXED: ใช้ Flux timezone + date.truncate แทน today() เพื่อบังคับ Asia/Bangkok
 * @param {string} deviceId - Device ID
 */
async function queryDailyRealtime(deviceId = 'AI205') {
  try {
    // ใช้ Flux timezone + date.truncate เพื่อบังคับ timezone ให้ถูกต้อง
    const query = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      todayStart = date.truncate(t: now(), unit: 1d)
      
      from(bucket: "${buckets.raw}")
        |> range(start: todayStart)
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "energy_total")
        |> first()
    `;
    
    const queryLast = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      todayStart = date.truncate(t: now(), unit: 1d)
      
      from(bucket: "${buckets.raw}")
        |> range(start: todayStart)
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "energy_total")
        |> last()
    `;
    
    let firstValue = 0;
    let lastValue = 0;
    let firstTime = null;
    let lastTime = null;
    
    // Get first value of today
    for await (const { values, tableMeta } of queryApi.iterateRows(query)) {
      const row = tableMeta.toObject(values);
      firstValue = row._value || 0;
      firstTime = row._time;
      break;
    }
    
    // Get last (current) value
    for await (const { values, tableMeta } of queryApi.iterateRows(queryLast)) {
      const row = tableMeta.toObject(values);
      lastValue = row._value || 0;
      lastTime = row._time;
      break;
    }
    
    const daily = Math.max(0, lastValue - firstValue);
    
    console.log(`📊 Daily Realtime: ${daily.toFixed(3)} kWh (${firstValue} → ${lastValue})`);
    
    return { success: true, daily, firstValue, lastValue, firstTime, lastTime, timezone: TIMEZONE };
  } catch (error) {
    console.error('❌ Error querying daily realtime:', error);
    return { success: false, error: error.message, daily: 0 };
  }
}

/**
 * Query monthly realtime energy (from 1st of current month to now)
 * Resets automatically each month based on actual calendar month
 * @param {string} deviceId - Device ID
 */
async function queryMonthlyRealtime(deviceId = 'AI205') {
  try {
    // Calculate start of current month in local timezone
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    
    // Create date for 1st of current month at 00:00:00 local time
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    const monthStartISO = monthStart.toISOString();
    
    // Query first value of the month - prioritize energy_total
    // ESP32 sends energy_total with actual values
    const queryFirst = `
      from(bucket: "${buckets.raw}")
        |> range(start: ${monthStartISO})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "energy_total")
        |> first()
    `;
    
    // Query last (most recent) value
    const queryLast = `
      from(bucket: "${buckets.raw}")
        |> range(start: ${monthStartISO})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "energy_total")
        |> last()
    `;
    
    let firstValue = 0;
    let lastValue = 0;
    let firstTime = null;
    let lastTime = null;
    let fieldUsed = 'energy_total';
    
    // Get first value of the month
    for await (const { values, tableMeta } of queryApi.iterateRows(queryFirst)) {
      const row = tableMeta.toObject(values);
      firstValue = row._value || 0;
      firstTime = row._time;
      fieldUsed = row._field;
      break;
    }
    
    // Get last (current) value
    for await (const { values, tableMeta } of queryApi.iterateRows(queryLast)) {
      const row = tableMeta.toObject(values);
      lastValue = row._value || 0;
      lastTime = row._time;
      break;
    }
    
    // Calculate monthly consumption (difference between last and first reading)
    const monthly = Math.max(0, lastValue - firstValue);
    
    // Get month info for display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    console.log(`📊 Monthly energy: ${monthly.toFixed(2)} kWh (${fieldUsed}: ${firstValue} → ${lastValue})`);
    
    return { 
      success: true, 
      monthly, 
      firstValue, 
      lastValue,
      firstTime,
      lastTime,
      monthStart: monthStartISO,
      monthName: monthNames[month],
      monthNumber: month + 1,
      year,
      fieldUsed
    };
  } catch (error) {
    console.error('❌ Error querying monthly realtime:', error);
    return { success: false, error: error.message, monthly: 0 };
  }
}

/**
 * Query energy summary for a time range
 * @param {string} timeRange - Time range key (1d, 1w, 1M, MN for yearly)
 * @param {string} deviceId - Device ID
 */
async function queryEnergySummary(timeRange = '1d', deviceId = 'AI205') {
  try {
    const rangeMap = {
      '1d': '-1d',
      '1w': '-7d',
      '1M': '-30d',
      'MN': '-365d'
    };
    
    const bucketMap = {
      '1d': 'daily',
      '1w': 'weekly',
      '1M': 'monthly',
      'MN': 'yearly'
    };
    
    const range = rangeMap[timeRange] || '-1d';
    const bucketKey = bucketMap[timeRange] || 'daily';
    const bucketName = buckets[bucketKey] || buckets.raw;
    
    const query = `
      from(bucket: "${bucketName}")
        |> range(start: ${range})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "energy_import" or r._field == "energy_total" or r._field == "power_active")
        |> sum()
    `;
    
    let total = 0;
    let fromPower = 0;
    
    for await (const { values, tableMeta } of queryApi.iterateRows(query)) {
      const row = tableMeta.toObject(values);
      if (row._field === 'energy_import' || row._field === 'energy_total') {
        total += row._value || 0;
      }
      if (row._field === 'power_active') {
        // Convert Wh to kWh (assuming hourly samples)
        fromPower += (row._value || 0) / 1000;
      }
    }
    
    return { 
      success: true, 
      perPhase: { total },
      combined: { fromPower },
      timeRange,
      bucket: bucketName
    };
  } catch (error) {
    console.error('❌ Error querying energy summary:', error);
    return { success: false, error: error.message, perPhase: { total: 0 } };
  }
}

/**
 * Query combined 3-phase data with per-phase breakdown
 * @param {Object} options - Query options
 * @param {string} options.range - Time range
 * @param {string} options.deviceId - Device ID
 */
async function queryCombinedWithPhases(options = {}) {
  const { range = '-1h', deviceId = 'AI205' } = options;
  
  try {
    const combined = [];
    const phases = { L1: [], L2: [], L3: [] };
    
    // Query combined 3-phase data
    const combinedQuery = `
      from(bucket: "${buckets.raw}")
        |> range(start: ${range})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> sort(columns: ["_time"], desc: false)
    `;
    
    for await (const { values, tableMeta } of queryApi.iterateRows(combinedQuery)) {
      const row = tableMeta.toObject(values);
      combined.push({
        _time: row._time,
        _field: row._field,
        _value: row._value,
        device_id: row.device_id
      });
    }
    
    // Query per-phase data
    const phaseQuery = `
      from(bucket: "${buckets.raw}")
        |> range(start: ${range})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_per_phase")
        |> sort(columns: ["_time"], desc: false)
    `;
    
    for await (const { values, tableMeta } of queryApi.iterateRows(phaseQuery)) {
      const row = tableMeta.toObject(values);
      const phase = row.phase || 'L1';
      if (phases[phase]) {
        phases[phase].push({
          _time: row._time,
          _field: row._field,
          _value: row._value,
          phase: phase
        });
      }
    }
    
    console.log(`✅ Fetched ${combined.length} combined points, ${phases.L1.length + phases.L2.length + phases.L3.length} phase points`);
    
    return { combined, phases };
  } catch (error) {
    console.error('❌ Error in queryCombinedWithPhases:', error);
    return { combined: [], phases: { L1: [], L2: [], L3: [] } };
  }
}

/**
 * ===================================
 * DATA INTEGRITY CHECKS
 * ตรวจสอบข้อมูลซ้ำ / หาย / เพี้ยน
 * ===================================
 */

/**
 * Test 1: Check for duplicate data in same hour
 * ถ้า > 1 = duplicate (ต้องเหลือแค่ 1)
 * @param {string} range - Time range (e.g., '-24h')
 * @param {string} deviceId - Device ID
 */
async function checkDuplicates(range = '-24h', deviceId = 'AI205') {
  try {
    const query = `
      from(bucket: "${buckets.hourly}")
        |> range(start: ${range})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "energy_import" or r._field == "energy_total")
        |> group(columns: ["_time", "_field"])
        |> count()
        |> filter(fn: (r) => r._value > 1)
    `;
    
    const duplicates = [];
    for await (const { values, tableMeta } of queryApi.iterateRows(query)) {
      const row = tableMeta.toObject(values);
      duplicates.push({
        time: row._time,
        field: row._field,
        count: row._value,
        issue: '❌ DUPLICATE: same hour has multiple values'
      });
    }
    
    return {
      test: 'duplicate_check',
      passed: duplicates.length === 0,
      duplicates,
      message: duplicates.length === 0 
        ? '✅ No duplicates found' 
        : `❌ Found ${duplicates.length} duplicate entries`
    };
  } catch (error) {
    console.error('❌ Error in checkDuplicates:', error);
    return { test: 'duplicate_check', passed: false, error: error.message };
  }
}

/**
 * Test 2: Check for negative energy values
 * ต้องไม่มีเลย - ถ้ามี = reboot / Ep reset หลุด
 * @param {string} range - Time range
 * @param {string} deviceId - Device ID
 */
async function checkNegativeEnergy(range = '-24h', deviceId = 'AI205') {
  try {
    const query = `
      from(bucket: "${buckets.hourly}")
        |> range(start: ${range})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "energy_import" or r._field == "energy_total")
        |> filter(fn: (r) => r._value < 0)
    `;
    
    const negatives = [];
    for await (const { values, tableMeta } of queryApi.iterateRows(query)) {
      const row = tableMeta.toObject(values);
      negatives.push({
        time: row._time,
        field: row._field,
        value: row._value,
        issue: '❌ NEGATIVE: possible reboot or Ep reset'
      });
    }
    
    return {
      test: 'negative_energy_check',
      passed: negatives.length === 0,
      negatives,
      message: negatives.length === 0 
        ? '✅ No negative energy values found' 
        : `❌ Found ${negatives.length} negative energy values (possible reboot/reset)`
    };
  } catch (error) {
    console.error('❌ Error in checkNegativeEnergy:', error);
    return { test: 'negative_energy_check', passed: false, error: error.message };
  }
}

/**
 * Test 3: Verify sum(hourly) == daily
 * ถ้าไม่เท่ากัน = timezone/missing hour/task delay
 * @param {string} deviceId - Device ID
 */
async function checkHourlyDailySum(deviceId = 'AI205') {
  try {
    // Sum of hourly values for yesterday
    const hourlyQuery = `
      from(bucket: "${buckets.hourly}")
        |> range(start: -1d, stop: now())
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "energy_import" or r._field == "energy_total")
        |> sum()
    `;
    
    // Daily value for yesterday
    const dailyQuery = `
      from(bucket: "${buckets.daily}")
        |> range(start: -2d, stop: now())
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "energy_import" or r._field == "energy_total")
        |> last()
    `;
    
    let hourlySum = 0;
    let dailyValue = 0;
    let hourlyField = '';
    let dailyField = '';
    
    for await (const { values, tableMeta } of queryApi.iterateRows(hourlyQuery)) {
      const row = tableMeta.toObject(values);
      hourlySum = row._value || 0;
      hourlyField = row._field;
    }
    
    for await (const { values, tableMeta } of queryApi.iterateRows(dailyQuery)) {
      const row = tableMeta.toObject(values);
      dailyValue = row._value || 0;
      dailyField = row._field;
    }
    
    // Allow 1% tolerance for rounding errors
    const tolerance = Math.max(hourlySum, dailyValue) * 0.01;
    const difference = Math.abs(hourlySum - dailyValue);
    const passed = difference <= tolerance;
    
    let issue = null;
    if (!passed) {
      if (hourlySum === 0) {
        issue = 'MISSING_HOURLY: No hourly data found';
      } else if (dailyValue === 0) {
        issue = 'MISSING_DAILY: Daily task may not have run yet';
      } else if (hourlySum > dailyValue) {
        issue = 'TIMEZONE_ISSUE: Hourly sum > Daily (check timezone offset)';
      } else {
        issue = 'TASK_DELAY: Daily task may have run before all hourly data was available';
      }
    }
    
    return {
      test: 'hourly_daily_sum_check',
      passed,
      hourlySum: Number(hourlySum.toFixed(3)),
      dailyValue: Number(dailyValue.toFixed(3)),
      difference: Number(difference.toFixed(3)),
      tolerance: Number(tolerance.toFixed(3)),
      hourlyField,
      dailyField,
      issue,
      message: passed 
        ? `✅ Hourly sum (${hourlySum.toFixed(2)}) matches daily (${dailyValue.toFixed(2)})` 
        : `❌ Mismatch: hourly=${hourlySum.toFixed(2)}, daily=${dailyValue.toFixed(2)}, diff=${difference.toFixed(2)}`
    };
  } catch (error) {
    console.error('❌ Error in checkHourlyDailySum:', error);
    return { test: 'hourly_daily_sum_check', passed: false, error: error.message };
  }
}

/**
 * Run all data integrity checks
 * @param {string} range - Time range
 * @param {string} deviceId - Device ID
 */
async function runDataIntegrityChecks(range = '-24h', deviceId = 'AI205') {
  console.log(`🔍 Running data integrity checks for ${deviceId}...`);
  
  const results = {
    timestamp: new Date().toISOString(),
    deviceId,
    range,
    tests: []
  };
  
  // Test 1: Duplicates
  const duplicateResult = await checkDuplicates(range, deviceId);
  results.tests.push(duplicateResult);
  
  // Test 2: Negative Energy
  const negativeResult = await checkNegativeEnergy(range, deviceId);
  results.tests.push(negativeResult);
  
  // Test 3: Hourly vs Daily Sum
  const sumResult = await checkHourlyDailySum(deviceId);
  results.tests.push(sumResult);
  
  // Overall status
  results.allPassed = results.tests.every(t => t.passed);
  results.summary = results.allPassed 
    ? '✅ All data integrity checks passed' 
    : `⚠️ ${results.tests.filter(t => !t.passed).length} check(s) failed`;
  
  console.log(results.summary);
  
  return results;
}

// ========================================
// ✅ REAL-TIME ENERGY QUERIES (สำคัญมาก!)
// ใช้สำหรับ EnergyAccumulatedBlock.tsx
// ========================================

/**
 * Get Real-time Daily Usage (00:00 - Now)
 * ✅ NEW: คำนวณจาก Power × Time (integral of power_active_kw)
 * สูตร: Energy (kWh) = ∫ Power(kW) dt
 * @param {string} deviceId - Device ID
 * @returns {Promise<number>} Daily energy usage in kWh
 */
/**
 * Get Real-time Daily Usage (00:00 - Now)
 * ✅ FIX: Uses Hybrid Approach (Hourly Bucket + Raw Current Hour)
 * This ensures consistency with the Daily Consumption Chart.
 * @param {string} deviceId - Device ID
 * @returns {Promise<number>} Daily energy usage in kWh
 */
async function getRealtimeDailyUsage(deviceId = 'AI205') {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    
    // 1. Get sum of past hours for today from Hourly Bucket
    const historyQuery = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      todayStart = date.truncate(t: now(), unit: 1d)
      todayHourStart = date.truncate(t: now(), unit: 1h) // Start of current hour
      
      from(bucket: "${buckets.hourly}")
        |> range(start: todayStart, stop: todayHourStart) // Stop before current hour
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase" or r._measurement == "energy_hourly")
        |> filter(fn: (r) => r._field == "energy_total")
        |> sum()
    `;

    // 2. Calculate current hour energy from Raw Bucket
    // Matches logic in energyRoutes.js /daily-consumption logic
    const startOfHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentHour, 0, 0);
    const currentHourQuery = `
      import "timezone"
      option location = timezone.location(name: "${TIMEZONE}")
      
      from(bucket: "${buckets.raw}")
        |> range(start: ${startOfHour.toISOString()})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "power_active_kw")
        |> mean()
    `;

    const [historyRows, currentRows] = await Promise.all([
      queryApi.collectRows(historyQuery),
      queryApi.collectRows(currentHourQuery)
    ]);

    // Sum history
    const historyTotal = historyRows.length > 0 ? (historyRows[0]._value || 0) : 0;
    
    // Calculate current hour
    let currentTotal = 0;
    if (currentRows.length > 0) {
      const avgPower = currentRows[0]._value || 0;
      if (avgPower > 0) {
        const minutesElapsed = (now.getTime() - startOfHour.getTime()) / 60000;
        const hoursElapsed = minutesElapsed / 60;
        currentTotal = avgPower * hoursElapsed;
      }
    }

    const totalDaily = historyTotal + currentTotal;
    
    console.log(`📊 Realtime Daily (Hybrid): ${totalDaily.toFixed(3)} kWh (Hist: ${historyTotal.toFixed(3)} + Curr: ${currentTotal.toFixed(3)})`);
    return totalDaily;

  } catch (error) {
    console.error('❌ Error fetching realtime daily:', error.message);
    return 0;
  }
}

/**
 * Get Real-time Monthly Usage (1st of Month - Now)
 * ✅ FIX: Used aggregateWindow(1h, mean) |> sum() to match Monthly Chart
 * Matches /api/energy/monthly-chart logic
 * @param {string} deviceId - Device ID
 * @returns {Promise<number>} Monthly energy usage in kWh
 */
async function getRealtimeMonthlyUsage(deviceId = 'AI205') {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthStart = new Date(currentYear, currentMonth, 1, 0, 0, 0).toISOString();
  
  try {
    // OLD: integral(unit: 1h)
    // NEW: aggregateWindow(every: 1h, fn: mean) |> sum()
    // This matches the chart's "Sum of Hourly Bars" logic
    const fluxQuery = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      from(bucket: "${buckets.raw}")
        |> range(start: ${monthStart})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "power_active_kw")
        |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
        |> sum()
    `;
    
    const rows = await queryApi.collectRows(fluxQuery);
    const totalEnergy = rows.length > 0 ? (rows[0]._value || 0) : 0;
    
    console.log(`📊 Realtime Monthly Usage (SumMean): ${totalEnergy.toFixed(3)} kWh`);
    return totalEnergy;
  } catch (error) {
    console.error('❌ Error fetching realtime monthly:', error.message);
    return 0;
  }
}

/**
 * Get Real-time Yearly Usage (Jan 1st - Now)
 * ✅ FIX: Used aggregateWindow(1h, mean) |> sum() to match Yearly Chart
 * Matches /api/energy/yearly-chart logic
 * @param {string} deviceId - Device ID
 * @returns {Promise<number>} Yearly energy usage in kWh
 */
async function getRealtimeYearlyUsage(deviceId = 'AI205') {
  const now = new Date();
  const currentYear = now.getFullYear();
  const yearStart = new Date(currentYear, 0, 1, 0, 0, 0).toISOString();
  
  try {
    const fluxQuery = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      from(bucket: "${buckets.raw}")
        |> range(start: ${yearStart})
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "power_active_kw")
        |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
        |> sum()
    `;
    
    const rows = await queryApi.collectRows(fluxQuery);
    const totalEnergy = rows.length > 0 ? (rows[0]._value || 0) : 0;
    
    console.log(`📊 Realtime Yearly Usage (SumMean): ${totalEnergy.toFixed(3)} kWh`);
    return totalEnergy;
  } catch (error) {
    console.error('❌ Error fetching realtime yearly:', error.message);
    return 0;
  }
}

/**
 * Get Real-time Weekly Usage (Start of Week - Now)
 * @param {string} deviceId - Device ID
 * @returns {Promise<number>} Weekly energy usage in kWh
 */
async function getRealtimeWeeklyUsage(deviceId = 'AI205') {
  const fluxQuery = `
    import "timezone"
    import "date"
    option location = timezone.location(name: "${TIMEZONE}")
    
    weekStart = date.truncate(t: now(), unit: 1w)
    
    from(bucket: "${buckets.raw}")
      |> range(start: weekStart)
      |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
      |> integral(unit: 1h)
  `;

  try {
    const rows = await queryApi.collectRows(fluxQuery);
    const value = rows.length > 0 ? rows[0]._value : 0;
    console.log(`📊 Realtime Weekly Usage (Power×Time): ${value?.toFixed(3) || 0} kWh`);
    return value || 0;
  } catch (error) {
    console.error('❌ Error fetching realtime weekly:', error.message);
    return 0;
  }
}

/**
 * Get Complete Usage Summary Dashboard Data
 * Returns: daily, weekly, monthly, yearly totals in one call
 * @param {string} deviceId - Device ID
 * @param {number} costPerUnit - Cost per kWh in THB (default: 4.00)
 */
async function getUsageSummaryDashboard(deviceId = 'AI205', costPerUnit = 4.00) {
  try {
    // Fetch all periods in parallel
    const [daily, weekly, monthly, yearly] = await Promise.all([
      getRealtimeDailyUsage(deviceId),
      getRealtimeWeeklyUsage(deviceId),
      getRealtimeMonthlyUsage(deviceId),
      getRealtimeYearlyUsage(deviceId)
    ]);

    // Calculate costs
    const result = {
      daily: {
        energy: Number(daily.toFixed(3)),
        cost: Number((daily * costPerUnit).toFixed(2)),
        unit: 'kWh',
        currency: 'THB'
      },
      weekly: {
        energy: Number(weekly.toFixed(3)),
        cost: Number((weekly * costPerUnit).toFixed(2)),
        unit: 'kWh',
        currency: 'THB'
      },
      monthly: {
        energy: Number(monthly.toFixed(3)),
        cost: Number((monthly * costPerUnit).toFixed(2)),
        unit: 'kWh',
        currency: 'THB'
      },
      yearly: {
        energy: Number(yearly.toFixed(3)),
        cost: Number((yearly * costPerUnit).toFixed(2)),
        unit: 'kWh',
        currency: 'THB'
      },
      costPerUnit,
      timestamp: new Date().toISOString()
    };

    console.log(`📊 Usage Summary Dashboard: Daily=${result.daily.energy}kWh, Weekly=${result.weekly.energy}kWh, Monthly=${result.monthly.energy}kWh, Yearly=${result.yearly.energy}kWh`);
    
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Error fetching usage summary dashboard:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get Usage Comparison with Previous Period
 * Compares current period with previous (yesterday, last week, last month)
 * @param {string} deviceId - Device ID
 */
async function getUsageComparison(deviceId = 'AI205') {
  try {
    // Query for yesterday's usage (Full 24h)
    const yesterdayQuery = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      todayStart = date.truncate(t: now(), unit: 1d)
      yesterdayStart = date.sub(from: todayStart, d: 1d)
      
      from(bucket: "${buckets.raw}")
        |> range(start: yesterdayStart, stop: todayStart)
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "power_active_kw")
        |> integral(unit: 1h)
    `;

    // Query for last week's usage (Full 7 days)
    const lastWeekQuery = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      weekStart = date.truncate(t: now(), unit: 1w)
      lastWeekStart = date.sub(from: weekStart, d: 7d)
      
      from(bucket: "${buckets.raw}")
        |> range(start: lastWeekStart, stop: weekStart)
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "power_active_kw")
        |> integral(unit: 1h)
    `;

    // Query for last month's usage (Full 30 days)
    const lastMonthQuery = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      monthStart = date.truncate(t: now(), unit: 1mo)
      lastMonthStart = date.sub(from: monthStart, d: 1mo)
      
      from(bucket: "${buckets.raw}")
        |> range(start: lastMonthStart, stop: monthStart)
        |> filter(fn: (r) => r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._measurement == "energy_3phase")
        |> filter(fn: (r) => r._field == "power_active_kw")
        |> integral(unit: 1h)
    `;

    // Execute all queries in parallel
    const [yesterdayRows, lastWeekRows, lastMonthRows, currentDaily, currentWeekly, currentMonthly] = await Promise.all([
      queryApi.collectRows(yesterdayQuery),
      queryApi.collectRows(lastWeekQuery),
      queryApi.collectRows(lastMonthQuery),
      getRealtimeDailyUsage(deviceId),
      getRealtimeWeeklyUsage(deviceId),
      getRealtimeMonthlyUsage(deviceId)
    ]);

    const yesterday = yesterdayRows.length > 0 ? yesterdayRows[0]._value : 0;
    const lastWeek = lastWeekRows.length > 0 ? lastWeekRows[0]._value : 0;
    const lastMonth = lastMonthRows.length > 0 ? lastMonthRows[0]._value : 0;

    // Calculate percentage changes
    const calcChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Number((((current - previous) / previous) * 100).toFixed(1));
    };

    const result = {
      daily: {
        current: Number(currentDaily.toFixed(3)),
        previous: Number(yesterday.toFixed(3)),
        change: calcChange(currentDaily, yesterday),
        trend: currentDaily >= yesterday ? 'up' : 'down'
      },
      weekly: {
        current: Number(currentWeekly.toFixed(3)),
        previous: Number(lastWeek.toFixed(3)),
        change: calcChange(currentWeekly, lastWeek),
        trend: currentWeekly >= lastWeek ? 'up' : 'down'
      },
      monthly: {
        current: Number(currentMonthly.toFixed(3)),
        previous: Number(lastMonth.toFixed(3)),
        change: calcChange(currentMonthly, lastMonth),
        trend: currentMonthly >= lastMonth ? 'up' : 'down'
      },
      timestamp: new Date().toISOString()
    };

    console.log(`📊 Usage Comparison: Daily ${result.daily.change}%, Weekly ${result.weekly.change}%, Monthly ${result.monthly.change}%`);
    
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Error fetching usage comparison:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get Peak Demand Information
 * Returns peak power value and time for today
 * @param {string} deviceId - Device ID
 */
async function getPeakDemand(deviceId = 'AI205') {
  try {
    // Query for today's peak power
    const peakQuery = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      todayStart = date.truncate(t: now(), unit: 1d)
      
      from(bucket: "${buckets.raw}")
        |> range(start: todayStart)
        |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
        |> max()
    `;

    // Query for today's average power
    const avgQuery = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      todayStart = date.truncate(t: now(), unit: 1d)
      
      from(bucket: "${buckets.raw}")
        |> range(start: todayStart)
        |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
        |> mean()
    `;

    const [peakRows, avgRows] = await Promise.all([
      queryApi.collectRows(peakQuery),
      queryApi.collectRows(avgQuery)
    ]);

    const peakValue = peakRows.length > 0 ? peakRows[0]._value : 0;
    const peakTime = peakRows.length > 0 ? peakRows[0]._time : null;
    const avgValue = avgRows.length > 0 ? avgRows[0]._value : 0;

    const result = {
      peak: {
        value: Number(peakValue.toFixed(3)),
        time: peakTime,
        unit: 'kW'
      },
      average: {
        value: Number(avgValue.toFixed(3)),
        unit: 'kW'
      },
      timestamp: new Date().toISOString()
    };

    console.log(`📊 Peak Demand: ${result.peak.value}kW @ ${result.peak.time}, Avg: ${result.average.value}kW`);
    
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Error fetching peak demand:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Query energy data for a custom date range with specified granularity
 * @param {string} deviceId - Device ID
 * @param {string} startDate - ISO start date
 * @param {string} endDate - ISO end date  
 * @param {string} granularity - 'hour' | 'day' | 'week' | 'month'
 */
async function queryCustomDateRange(deviceId = 'AI205', startDate, endDate, granularity = 'hour') {
  try {
    // Determine which bucket to use based on granularity
    let bucketName, aggregateWindow;
    switch (granularity) {
      case 'hour':
        bucketName = buckets.raw;
        aggregateWindow = '1h';
        break;
      case 'day':
        bucketName = buckets.hourly;
        aggregateWindow = '1d';
        break;
      case 'week':
        bucketName = buckets.daily;
        aggregateWindow = '1w';
        break;
      case 'month':
        bucketName = buckets.daily;
        aggregateWindow = '1mo';
        break;
      default:
        bucketName = buckets.raw;
        aggregateWindow = '1h';
    }

    const query = `
      import "timezone"
      option location = timezone.location(name: "${TIMEZONE}")
      
      from(bucket: "${bucketName}")
        |> range(start: ${startDate}, stop: ${endDate})
        |> filter(fn: (r) => r._measurement == "energy_3phase" and r.device_id == "${deviceId}")
        |> filter(fn: (r) => r._field == "power_active_kw" or r._field == "energy_total")
        |> aggregateWindow(every: ${aggregateWindow}, fn: mean, createEmpty: false)
        |> yield(name: "data")
    `;

    const rows = await queryApi.collectRows(query);
    
    // Group by time
    const dataMap = new Map();
    for (const row of rows) {
      const time = row._time;
      if (!dataMap.has(time)) {
        dataMap.set(time, { time, power_active_kw: 0, energy_total: 0 });
      }
      const entry = dataMap.get(time);
      if (row._field === 'power_active_kw') {
        entry.power_active_kw = row._value || 0;
      } else if (row._field === 'energy_total') {
        entry.energy_total = row._value || 0;
      }
    }

    const data = Array.from(dataMap.values()).sort((a, b) => 
      new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    console.log(`📊 Custom Range Query: ${data.length} points from ${startDate} to ${endDate}`);
    return { success: true, data, count: data.length };
  } catch (error) {
    console.error('❌ Error in queryCustomDateRange:', error.message);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Get comprehensive summary for a time range
 * Returns: total energy, peak power, avg power, cost, and chart data
 * @param {string} deviceId - Device ID
 * @param {string} startDate - ISO start date (or relative like '-7d')
 * @param {string} endDate - ISO end date (or 'now()')
 * @param {string} granularity - 'hour' | 'day'
 * @param {number} costPerUnit - Cost per kWh
 */
async function getRangeSummary(deviceId = 'AI205', startDate, endDate, granularity = 'day', costPerUnit = 4.0) {
  try {
    // Determine range format
    const isRelative = startDate.startsWith('-');
    const rangeStart = isRelative ? startDate : `time(v: "${startDate}")`;
    const rangeEnd = isRelative || endDate === 'now()' ? 'now()' : `time(v: "${endDate}")`;

    // Query 1: Total energy using integral
    const totalQuery = `
      import "timezone"
      option location = timezone.location(name: "${TIMEZONE}")
      
      from(bucket: "${buckets.raw}")
        |> range(start: ${rangeStart}, stop: ${rangeEnd})
        |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
        |> integral(unit: 1h)
    `;

    // Query 2: Peak power
    const peakQuery = `
      import "timezone"
      option location = timezone.location(name: "${TIMEZONE}")
      
      from(bucket: "${buckets.raw}")
        |> range(start: ${rangeStart}, stop: ${rangeEnd})
        |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
        |> max()
    `;

    // Query 3: Average power
    const avgQuery = `
      import "timezone"
      option location = timezone.location(name: "${TIMEZONE}")
      
      from(bucket: "${buckets.raw}")
        |> range(start: ${rangeStart}, stop: ${rangeEnd})
        |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
        |> mean()
    `;

    // Query 4: Chart data with aggregation
    const aggregateWindow = granularity === 'hour' ? '1h' : '1d';
    const chartQuery = `
      import "timezone"
      option location = timezone.location(name: "${TIMEZONE}")
      
      from(bucket: "${buckets.raw}")
        |> range(start: ${rangeStart}, stop: ${rangeEnd})
        |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
        |> aggregateWindow(every: ${aggregateWindow}, fn: (tables=<-, column) => tables |> integral(unit: 1h), createEmpty: false)
    `;

    // Execute all queries in parallel
    const [totalRows, peakRows, avgRows, chartRows] = await Promise.all([
      queryApi.collectRows(totalQuery),
      queryApi.collectRows(peakQuery),
      queryApi.collectRows(avgQuery),
      queryApi.collectRows(chartQuery)
    ]);

    const totalEnergy = totalRows.length > 0 ? totalRows[0]._value : 0;
    const peakPower = peakRows.length > 0 ? peakRows[0]._value : 0;
    const peakTime = peakRows.length > 0 ? peakRows[0]._time : null;
    const avgPower = avgRows.length > 0 ? avgRows[0]._value : 0;

    // Process chart data - calculate energy per period
    const chartData = chartRows.map((row, index, arr) => {
      // Energy is directly calculated by integral (kWh)
      const energy = row._value || 0;
      
      // Back-calculate average power (strictly for display purposes)
      // Note: This spreads the energy over the full window (1h or 24h), 
      // which aligns with the chart bar width.
      const periodHours = granularity === 'hour' ? 1 : 24;
      const calculatedAvgPower = energy / periodHours;
      
      return {
        time: row._time,
        power: Number(calculatedAvgPower.toFixed(3)),
        energy: Number(energy.toFixed(3))
      };
    });

    const result = {
      success: true,
      summary: {
        totalEnergy: Number(totalEnergy.toFixed(3)),
        totalCost: Number((totalEnergy * costPerUnit).toFixed(2)),
        peakPower: Number(peakPower.toFixed(3)),
        peakTime,
        avgPower: Number(avgPower.toFixed(3)),
        currency: 'THB',
        unit: 'kWh'
      },
      chartData,
      chartDataCount: chartData.length,
      granularity,
      costPerUnit,
      timestamp: new Date().toISOString()
    };

    console.log(`📊 Range Summary: ${result.summary.totalEnergy}kWh, Peak=${result.summary.peakPower}kW, Avg=${result.summary.avgPower}kW`);
    
    return result;
  } catch (error) {
    console.error('❌ Error in getRangeSummary:', error.message);
    return { success: false, error: error.message };
  }
}

// ========================================
// ALERT LOGGING FUNCTIONS
// Store and query alerts in InfluxDB
// ========================================

const ALERTS_BUCKET = process.env.INFLUXDB_BUCKET_ALERTS || 'AI205_alerts';

/**
 * Write an alert to InfluxDB
 * @param {Object} alert - Alert object with type, severity, message, value, deviceId
 */
async function writeAlert(alert) {
  try {
    if (isClosed) {
      console.warn('⚠️ InfluxDB client closed, cannot write alert');
      return false;
    }

    const alertWriteApi = influxDB.getWriteApi(org, ALERTS_BUCKET, 'ns', {
      batchSize: 1,
      flushInterval: 0  // Write immediately
    });

    const point = new Point('alert')
      .tag('device_id', alert.deviceId || 'AI205')
      .tag('type', alert.type || 'unknown')
      .tag('severity', alert.severity || 'info')
      .stringField('message', alert.message || '')
      .floatField('value', alert.value || 0)
      .stringField('alert_id', alert.id || `alert_${Date.now()}`);

    alertWriteApi.writePoint(point);
    await alertWriteApi.close();

    console.log(`📝 Alert logged to InfluxDB: [${alert.severity}] ${alert.type} - ${alert.message}`);
    return true;
  } catch (error) {
    console.error('❌ Error writing alert to InfluxDB:', error.message);
    return false;
  }
}

/**
 * Query alert history from InfluxDB
 * @param {Object} options - Query options
 * @param {string} options.deviceId - Device ID filter
 * @param {string} options.severity - Severity filter (warning, critical)
 * @param {string} options.startTime - Start time (e.g., '-24h', '-7d')
 * @param {number} options.limit - Maximum results
 */
async function queryAlertHistory(options = {}) {
  try {
    const {
      deviceId = 'AI205',
      severity = null,
      startTime = '-7d',
      limit = 100
    } = options;

    let filterClause = `r._measurement == "alert" and r.device_id == "${deviceId}"`;
    if (severity) {
      filterClause += ` and r.severity == "${severity}"`;
    }

    const query = `
      from(bucket: "${ALERTS_BUCKET}")
        |> range(start: ${startTime})
        |> filter(fn: (r) => ${filterClause})
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: ${limit})
    `;

    const results = [];
    const rows = await queryApi.collectRows(query);

    for (const row of rows) {
      results.push({
        id: row.alert_id || null,
        timestamp: row._time,
        deviceId: row.device_id,
        type: row.type,
        severity: row.severity,
        message: row.message || '',
        value: row.value || 0
      });
    }

    console.log(`📊 Retrieved ${results.length} alerts from InfluxDB`);
    return { success: true, alerts: results, count: results.length };
  } catch (error) {
    console.error('❌ Error querying alert history:', error.message);
    return { success: false, error: error.message, alerts: [] };
  }
}

// ========================================
// ✅ AI DATA AGGREGATION FUNCTIONS
// Aggregate data for AI analysis & Dashboard
// ========================================

/**
 * Get Aggregated Summary from RAW bucket for AI Analysis
 * Uses Flux aggregation functions on AI205_raw bucket
 * @param {string} timeRange - 'today' | 'yesterday' | 'week' | 'month'
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} Aggregated statistics
 */
async function getDataSummaryForAI(timeRange = 'today', deviceId = 'AI205') {
  try {
    // Determine time range
    let startTimeExpr;
    switch (timeRange) {
      case 'today':
        startTimeExpr = 'date.truncate(t: now(), unit: 1d)';
        break;
      case 'yesterday':
        startTimeExpr = 'date.sub(from: date.truncate(t: now(), unit: 1d), d: 1d)';
        break;
      case 'week':
        startTimeExpr = '-7d';
        break;
      case 'month':
        startTimeExpr = '-30d';
        break;
      default:
        startTimeExpr = 'date.truncate(t: now(), unit: 1d)';
    }

    const stopExpr = timeRange === 'yesterday' ? 'date.truncate(t: now(), unit: 1d)' : 'now()';

    // Power statistics query (mean, max, min, stddev)
    const powerQuery = `
      import "timezone"
      import "date"
      option location = timezone.location(name: "${TIMEZONE}")
      
      startTime = ${startTimeExpr}
      stopTime = ${stopExpr}
      
      data = from(bucket: "${buckets.raw}")
        |> range(start: startTime, stop: stopTime)
        |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
      
      meanVal = data |> mean() |> findRecord(fn: (key) => true, idx: 0)
      maxVal = data |> max() |> findRecord(fn: (key) => true, idx: 0)
      minVal = data |> min() |> findRecord(fn: (key) => true, idx: 0)
      
      data |> mean()
    `;

    // Execute separate queries for each statistic
    const [powerMeanRows, powerMaxRows, powerMinRows, powerStddevRows, energyRows,
           voltageMeanRows, voltageMaxRows, voltageMinRows,
           currentMeanRows, currentMaxRows, currentMinRows,
           pfMeanRows, pfMinRows] = await Promise.all([
      // Power
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
          |> mean()
      `),
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
          |> max()
      `),
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
          |> min()
      `),
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
          |> stddev()
      `),
      // Energy (integral)
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw" and r.device_id == "${deviceId}")
          |> integral(unit: 1h)
      `),
      // Voltage (from energy_per_phase - average of all phases)
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_per_phase" and r._field == "voltage" and r.device_id == "${deviceId}")
          |> mean()
      `),
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_per_phase" and r._field == "voltage" and r.device_id == "${deviceId}")
          |> max()
      `),
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_per_phase" and r._field == "voltage" and r.device_id == "${deviceId}")
          |> min()
      `),
      // Current (from energy_per_phase - simple mean/max/min across all phases)
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_per_phase" and r._field == "current" and r.device_id == "${deviceId}")
          |> mean()
      `),
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_per_phase" and r._field == "current" and r.device_id == "${deviceId}")
          |> max()
      `),
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_per_phase" and r._field == "current" and r.device_id == "${deviceId}")
          |> min()
      `),
      // Power Factor (from energy_3phase - field is 'power_factor' not 'power_factor_avg')
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_factor" and r.device_id == "${deviceId}")
          |> mean()
      `),
      queryApi.collectRows(`
        import "timezone"
        import "date"
        option location = timezone.location(name: "${TIMEZONE}")
        startTime = ${startTimeExpr}
        stopTime = ${stopExpr}
        from(bucket: "${buckets.raw}")
          |> range(start: startTime, stop: stopTime)
          |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_factor" and r.device_id == "${deviceId}")
          |> min()
      `)
    ]);

    // Extract values
    const powerAvg = powerMeanRows.length > 0 ? powerMeanRows[0]._value : 0;
    const powerMax = powerMaxRows.length > 0 ? powerMaxRows[0]._value : 0;
    const powerMin = powerMinRows.length > 0 ? powerMinRows[0]._value : 0;
    const powerStddev = powerStddevRows.length > 0 ? powerStddevRows[0]._value : 0;
    const peakTime = powerMaxRows.length > 0 ? powerMaxRows[0]._time : null;
    
    const energyTotal = energyRows.length > 0 ? energyRows[0]._value : 0;
    
    const voltageAvg = voltageMeanRows.length > 0 ? voltageMeanRows[0]._value : 0;
    const voltageMax = voltageMaxRows.length > 0 ? voltageMaxRows[0]._value : 0;
    const voltageMin = voltageMinRows.length > 0 ? voltageMinRows[0]._value : 0;
    
    const currentAvg = currentMeanRows.length > 0 ? currentMeanRows[0]._value : 0;
    const currentMax = currentMaxRows.length > 0 ? currentMaxRows[0]._value : 0;
    const currentMin = currentMinRows.length > 0 ? currentMinRows[0]._value : 0;
    
    const pfAvg = pfMeanRows.length > 0 ? pfMeanRows[0]._value : 0;
    const pfMin = pfMinRows.length > 0 ? pfMinRows[0]._value : 0;

    // Build AI insights
    const insights = [];
    if (powerStddev > powerAvg * 0.3 && powerAvg > 0) {
      insights.push(`⚠️ High power variance (stddev=${powerStddev.toFixed(2)} kW)`);
    }
    if (pfAvg > 0 && pfAvg < 0.85) {
      insights.push(`⚠️ Low Power Factor (avg=${pfAvg.toFixed(2)})`);
    }
    if (powerMax > powerAvg * 2 && powerAvg > 0) {
      insights.push(`📈 Peak ${((powerMax/powerAvg-1)*100).toFixed(0)}% above average`);
    }
    if (voltageMin < 200 && voltageMin > 0) {
      insights.push(`⚠️ Low voltage detected (min=${voltageMin.toFixed(1)}V)`);
    }

    const result = {
      success: true,
      timeRange,
      dataSource: 'AI205_raw',
      aggregationMethod: 'InfluxDB Flux (mean, max, min, stddev, integral)',
      power: {
        avg: Number(((powerAvg || 0) * 1000).toFixed(1)),
        max: Number(((powerMax || 0) * 1000).toFixed(1)),
        min: Number(((powerMin || 0) * 1000).toFixed(1)),
        stddev: Number(((powerStddev || 0) * 1000).toFixed(1)),
        unit: 'W'
      },
      voltage: {
        avg: Number((voltageAvg || 0).toFixed(1)),
        max: Number((voltageMax || 0).toFixed(1)),
        min: Number((voltageMin || 0).toFixed(1)),
        unit: 'V'
      },
      current: {
        avg: Number((currentAvg || 0).toFixed(2)),
        max: Number((currentMax || 0).toFixed(2)),
        min: Number((currentMin || 0).toFixed(2)),
        unit: 'A'
      },
      powerFactor: {
        avg: Number((pfAvg || 0).toFixed(3)),
        min: Number((pfMin || 0).toFixed(3))
      },
      energy: {
        total: Number((energyTotal || 0).toFixed(3)),
        unit: 'kWh'
      },
      peakTime,
      insights,
      timestamp: new Date().toISOString()
    };

    console.log(`📊 AI Data Summary [${timeRange}]: Power avg=${result.power.avg}kW, Energy=${result.energy.total}kWh, PF=${result.powerFactor.avg}`);
    
    return result;
  } catch (error) {
    console.error('❌ Error in getDataSummaryForAI:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  influxDB,
  writeApi,
  queryApi,
  buckets,
  writeRawData,
  testConnection,
  queryFromBucket,
  queryData,
  queryCombinedWithPhases,
  queryDailyConsumption,
  queryDailyRealtime,
  queryMonthlyRealtime,
  queryEnergySummary,
  getMetrics,
  close,
  // Data Integrity Checks
  checkDuplicates,
  checkNegativeEnergy,
  checkHourlyDailySum,
  runDataIntegrityChecks,
  // ✅ Real-time Energy Functions (for EnergyAccumulatedBlock.tsx)
  getRealtimeDailyUsage,
  getRealtimeMonthlyUsage,
  getRealtimeYearlyUsage,
  // ✅ Usage Summary Functions (for UsageSummaryBlock.tsx)
  getRealtimeWeeklyUsage,
  getUsageSummaryDashboard,
  getUsageComparison,
  getPeakDemand,
  // ✅ Time Range Summary Functions (for TimeRangeSummaryPanel.tsx)
  queryCustomDateRange,
  getRangeSummary,
  // ✅ Alert Logging Functions
  writeAlert,
  queryAlertHistory,
  ALERTS_BUCKET,
  // ✅ AI Data Aggregation Functions (for AI Chat & Dashboard)
  getDataSummaryForAI,
};
