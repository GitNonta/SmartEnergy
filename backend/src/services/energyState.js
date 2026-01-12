/**
 * Energy State Service
 * Manages realtime energy state with Delta Energy approach
 * 
 * ⚠️ IMPORTANT: This is a CACHE for REALTIME only!
 * 
 * Architecture:
 * - RAM state for instant realtime updates (React cards)
 * - Delta calculation from Ep_total
 * - Cron-based reset (daily/monthly/yearly)
 * - Recovery from InfluxDB on startup
 * 
 * ✅ USE RAM FOR:
 *   - Realtime dashboard cards
 *   - Live energy delta display
 *   - WebSocket broadcast to frontend
 * 
 * ❌ DO NOT USE RAM FOR:
 *   - Historical reports (use Influx hourly/daily bucket)
 *   - Audit trails (use Influx)
 *   - Billing calculations (use Influx monthly bucket)
 *   - Anomaly detection (use Influx hourly + baseline)
 * 
 * 📌 RULE: Influx = Historical Truth, RAM = Realtime Cache
 * 
 * If backend restarts:
 *   - RAM resets = OK (will recover from Influx)
 *   - Influx data = Still intact = Truth
 */

const cron = require('node-cron');
const influxService = require('./influxdb');

const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';

// =========================================
// RAM State (Hot Path)
// =========================================
let energyState = {
  daily: 0,
  monthly: 0,
  yearly: 0,
  lastUpdate: null,
  lastDelta: 0
};

// Track last Ep_total for delta calculation
let lastEnergyTotal = null;

// =========================================
// DOUBLE-COUNT PROTECTION
// Ignore first delta after restart to prevent
// counting the same energy twice
// =========================================
let recoveryState = {
  recovering: true,           // Set true on startup
  ignoreFirstDelta: true,     // Skip first delta calculation
  recoveredAt: null
};

// Callback for broadcasting state changes
let broadcastCallback = null;

/**
 * Set the broadcast callback function
 * @param {Function} callback - Function to call when state changes
 */
function setBroadcastCallback(callback) {
  broadcastCallback = callback;
}

/**
 * Get current energy state
 * @returns {Object} Current energy state including meterTotal from MQTT
 */
function getState() {
  return {
    ...energyState,
    // ✅ NEW: Meter total from Ep_total ÷ 10 (live from MQTT)
    meterTotal: lastEnergyTotal !== null ? lastEnergyTotal / 10 : 0,
    rawEpTotal: lastEnergyTotal,
    timezone: TIMEZONE
  };
}

/**
 * Process new energy reading and calculate delta
 * Called when MQTT message arrives with Ep_total
 * @param {number} epTotal - Current Ep_total reading from meter
 * @returns {Object} Delta and updated state
 */
function processEnergyReading(epTotal) {
  // Validate input
  if (epTotal === null || epTotal === undefined || isNaN(epTotal)) {
    return { delta: 0, state: energyState };
  }

  const currentTotal = parseFloat(epTotal);

  // First reading - just store it
  if (lastEnergyTotal === null) {
    lastEnergyTotal = currentTotal;
    console.log(`⚡ Energy State: Initial reading = ${currentTotal.toFixed(3)} kWh`);
    return { delta: 0, state: energyState };
  }
  
  // =========================================
  // DOUBLE-COUNT PROTECTION
  // Skip first delta after recovery to prevent
  // counting the same energy twice
  // =========================================
  if (recoveryState.ignoreFirstDelta) {
    console.log(`⚠️ Energy State: Ignoring first delta after restart (double-count protection)`);
    lastEnergyTotal = currentTotal;
    recoveryState.ignoreFirstDelta = false;
    recoveryState.recovering = false;
    recoveryState.recoveredAt = new Date().toISOString();
    return { delta: 0, state: energyState };
  }

  // Calculate delta
  let delta = currentTotal - lastEnergyTotal;

  // Handle meter reset or negative values
  if (delta < 0) {
    console.warn(`⚠️ Energy State: Negative delta detected (${delta.toFixed(3)}), meter may have reset`);
    delta = 0;
  }

  // Skip if delta is unreasonably large (likely bad reading)
  const MAX_DELTA = 100; // 100 kWh max per reading (adjust as needed)
  if (delta > MAX_DELTA) {
    console.warn(`⚠️ Energy State: Unreasonably large delta (${delta.toFixed(3)} kWh), skipping`);
    lastEnergyTotal = currentTotal;
    return { delta: 0, state: energyState };
  }

  // Update last reading
  lastEnergyTotal = currentTotal;

  // Only update if there's actual consumption
  if (delta > 0) {
    // Update ALL cards simultaneously
    energyState.daily += delta;
    energyState.monthly += delta;
    energyState.yearly += delta;
    energyState.lastDelta = delta;
    energyState.lastUpdate = new Date().toISOString();

    console.log(`⚡ Energy Delta: +${delta.toFixed(4)} kWh → Daily: ${energyState.daily.toFixed(2)}, Monthly: ${energyState.monthly.toFixed(2)}, Yearly: ${energyState.yearly.toFixed(2)}`);

    // Broadcast to WebSocket clients
    if (broadcastCallback) {
      broadcastCallback({
        type: 'energy_state',
        ...getState()
      });
    }
  }

  return { delta, state: energyState };
}

/**
 * Reset daily energy (called at midnight)
 */
function resetDaily() {
  console.log('🔄 Energy State: Daily reset (00:00)');
  energyState.daily = 0;
  energyState.lastUpdate = new Date().toISOString();
  
  if (broadcastCallback) {
    broadcastCallback({
      type: 'energy_state',
      ...getState(),
      resetType: 'daily'
    });
  }
}

/**
 * Reset monthly energy (called on 1st of month)
 */
function resetMonthly() {
  console.log('🔄 Energy State: Monthly reset (1st of month)');
  energyState.monthly = 0;
  energyState.lastUpdate = new Date().toISOString();
  
  if (broadcastCallback) {
    broadcastCallback({
      type: 'energy_state',
      ...getState(),
      resetType: 'monthly'
    });
  }
}

/**
 * Reset yearly energy (called on Jan 1)
 */
function resetYearly() {
  console.log('🔄 Energy State: Yearly reset (January 1st)');
  energyState.yearly = 0;
  energyState.lastUpdate = new Date().toISOString();
  
  if (broadcastCallback) {
    broadcastCallback({
      type: 'energy_state',
      ...getState(),
      resetType: 'yearly'
    });
  }
}

/**
 * Initialize cron jobs for scheduled resets
 */
function initCronJobs() {
  // Daily reset at 00:00
  cron.schedule('0 0 * * *', () => {
    resetDaily();
  }, {
    timezone: TIMEZONE
  });

  // Monthly reset at 00:00 on 1st of month
  cron.schedule('0 0 1 * *', () => {
    resetMonthly();
  }, {
    timezone: TIMEZONE
  });

  // Yearly reset at 00:00 on January 1st
  cron.schedule('0 0 1 1 *', () => {
    resetYearly();
  }, {
    timezone: TIMEZONE
  });

  console.log('⏰ Energy State: Cron jobs initialized (daily/monthly/yearly reset)');
}

/**
 * Recover state from InfluxDB after restart
 * ✅ NEW: Uses Power×Time (integral) functions for accurate calculation
 */
async function recoverState() {
  console.log('🔄 Energy State: Recovering state from InfluxDB (Power×Time)...');

  try {
    // ✅ Use new Power×Time functions instead of energy_total
    // These functions use integral(power_active_kw) for accurate calculation
    
    // Recover daily energy
    const dailyValue = await influxService.getRealtimeDailyUsage('AI205');
    if (dailyValue > 0) {
      energyState.daily = dailyValue;
      console.log(`  ✅ Daily recovered (Power×Time): ${energyState.daily.toFixed(2)} kWh`);
    }

    // Recover monthly energy
    const monthlyValue = await influxService.getRealtimeMonthlyUsage('AI205');
    if (monthlyValue > 0) {
      energyState.monthly = monthlyValue;
      console.log(`  ✅ Monthly recovered (Power×Time): ${energyState.monthly.toFixed(2)} kWh`);
    }

    // Recover yearly energy
    const yearlyValue = await influxService.getRealtimeYearlyUsage('AI205');
    if (yearlyValue > 0) {
      energyState.yearly = yearlyValue;
      console.log(`  ✅ Yearly recovered (Power×Time): ${energyState.yearly.toFixed(2)} kWh`);
    }

    energyState.lastUpdate = new Date().toISOString();
    console.log('✅ Energy State: Recovery complete');

    return { success: true, state: energyState };
  } catch (error) {
    console.error('❌ Energy State: Recovery failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Query yearly energy from start of year
 * @param {string} deviceId - Device ID
 * @param {Date} yearStart - Start of year date
 */
async function queryYearlyEnergy(deviceId, yearStart) {
  try {
    // Use queryFromBucket to get data from start of year
    const result = await influxService.queryFromBucket(
      'raw',
      yearStart.toISOString(),
      deviceId,
      ['energy_total', 'energy_import']
    );

    if (result.success && result.data && result.data.length > 0) {
      // Get first and last energy readings
      const energyData = result.data.filter(d => 
        d._field === 'energy_total' || d._field === 'energy_import'
      );

      if (energyData.length >= 2) {
        const firstReading = energyData[0]._value || 0;
        const lastReading = energyData[energyData.length - 1]._value || 0;
        const yearly = Math.max(0, lastReading - firstReading);
        return { success: true, yearly };
      }
    }

    return { success: true, yearly: 0 };
  } catch (error) {
    console.error('❌ Error querying yearly energy:', error);
    return { success: false, yearly: 0, error: error.message };
  }
}

/**
 * Initialize the energy state service
 * Should be called when backend starts
 */
async function initialize() {
  console.log('⚡ Initializing Energy State Service...');
  
  // Initialize cron jobs for scheduled resets
  initCronJobs();
  
  // Recover state from database
  await recoverState();
  
  console.log('✅ Energy State Service initialized');
  return getState();
}

/**
 * Manually set state (for testing or admin purposes)
 * @param {Object} newState - New state values
 */
function setState(newState) {
  if (newState.daily !== undefined) energyState.daily = newState.daily;
  if (newState.monthly !== undefined) energyState.monthly = newState.monthly;
  if (newState.yearly !== undefined) energyState.yearly = newState.yearly;
  energyState.lastUpdate = new Date().toISOString();
  
  if (broadcastCallback) {
    broadcastCallback({
      type: 'energy_state',
      ...getState()
    });
  }
}

/**
 * Get last known Ep_total value
 * @returns {number|null} Last Ep_total reading
 */
function getLastEnergyTotal() {
  return lastEnergyTotal;
}

module.exports = {
  initialize,
  getState,
  processEnergyReading,
  setBroadcastCallback,
  resetDaily,
  resetMonthly,
  resetYearly,
  recoverState,
  setState,
  getLastEnergyTotal
};
