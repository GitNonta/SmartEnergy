/**
 * Alert Service - P4-1
 * Monitors energy data and generates alerts when thresholds are exceeded
 * 
 * ⚠️ ALERT ARCHITECTURE:
 * 
 * ✅ REALTIME ALERTS (use MQTT/raw data):
 *   - Overcurrent → immediate danger, need instant detection
 *   - Overvoltage/Undervoltage → equipment protection
 *   - Critical Power Factor → urgent action needed
 *   - These use RAW data because speed matters
 * 
 * ✅ ANOMALY DETECTION (use HOURLY bucket + baseline):
 *   - High energy consumption pattern
 *   - Unusual usage hours
 *   - Deviation from baseline
 *   - These should query from hourly bucket with quality flags
 *   - False positive ลดลงมากเพราะใช้ aggregated data
 * 
 * 📌 RULE: 
 *   - Realtime safety alerts → raw/MQTT (this service)
 *   - Pattern/anomaly alerts → hourly bucket (separate service)
 */

// Alert Thresholds (configurable via ENV)
const thresholds = {
  // Power Factor alerts
  pf: {
    low: parseFloat(process.env.ALERT_PF_LOW) || 0.85,      // Below 0.85 = alert
    critical: parseFloat(process.env.ALERT_PF_CRITICAL) || 0.70  // Below 0.70 = critical
  },
  // Power (kW) alerts
  power: {
    high: parseFloat(process.env.ALERT_POWER_HIGH) || 50,       // Above 50kW = alert
    critical: parseFloat(process.env.ALERT_POWER_CRITICAL) || 80  // Above 80kW = critical
  },
  // Voltage alerts
  voltage: {
    low: parseFloat(process.env.ALERT_VOLTAGE_LOW) || 200,      // Below 200V
    high: parseFloat(process.env.ALERT_VOLTAGE_HIGH) || 250     // Above 250V
  },
  // Current alerts
  current: {
    high: parseFloat(process.env.ALERT_CURRENT_HIGH) || 100,    // Above 100A
    loadCapacity: parseFloat(process.env.ALERT_LOAD_CAPACITY) || 100,  // Total load capacity (Amps)
    loadWarningPercent: parseFloat(process.env.ALERT_LOAD_WARNING_PERCENT) || 80  // Alert at 80% load
  }
};

// Store active alerts
const activeAlerts = new Map();

// Alert cooldown (don't spam same alert)
const ALERT_COOLDOWN_MS = 60000; // 1 minute

/**
 * Check data against thresholds and return alerts
 * @param {Object} data - Energy data from MQTT
 * @param {string} deviceId - Device identifier
 * @returns {Array} Array of alert objects
 */
function checkAlerts(data, deviceId) {
  const alerts = [];
  const now = Date.now();

  // Check Power Factor
  const pf = data.PF || data.power_factor || data.PFsum;
  if (pf !== undefined && pf !== null) {
    if (pf < thresholds.pf.critical) {
      addAlert(alerts, deviceId, 'pf_critical', 'critical', 
        `Power Factor CRITICAL: ${pf.toFixed(2)} (< ${thresholds.pf.critical})`, pf, now);
    } else if (pf < thresholds.pf.low) {
      addAlert(alerts, deviceId, 'pf_low', 'warning',
        `Power Factor LOW: ${pf.toFixed(2)} (< ${thresholds.pf.low})`, pf, now);
    }
  }

  // Check Power (kW)
  const powerKW = data.kWsum || data.power_active_kw || (data.Wsum ? data.Wsum / 1000 : null);
  if (powerKW !== undefined && powerKW !== null) {
    if (powerKW > thresholds.power.critical) {
      addAlert(alerts, deviceId, 'power_critical', 'critical',
        `Power CRITICAL: ${powerKW.toFixed(2)} kW (> ${thresholds.power.critical} kW)`, powerKW, now);
    } else if (powerKW > thresholds.power.high) {
      addAlert(alerts, deviceId, 'power_high', 'warning',
        `Power HIGH: ${powerKW.toFixed(2)} kW (> ${thresholds.power.high} kW)`, powerKW, now);
    }
  }

  // Check Voltage (all phases)
  ['V1', 'V2', 'V3'].forEach((phase, idx) => {
    const voltage = data[phase] || data[`voltage_l${idx + 1}`];
    if (voltage !== undefined && voltage !== null) {
      if (voltage < thresholds.voltage.low) {
        addAlert(alerts, deviceId, `voltage_low_${phase}`, 'warning',
          `Voltage LOW ${phase}: ${voltage.toFixed(1)}V (< ${thresholds.voltage.low}V)`, voltage, now);
      } else if (voltage > thresholds.voltage.high) {
        addAlert(alerts, deviceId, `voltage_high_${phase}`, 'warning',
          `Voltage HIGH ${phase}: ${voltage.toFixed(1)}V (> ${thresholds.voltage.high}V)`, voltage, now);
      }
    }
  });

  // Check Current (all phases) - Use I1/I2/I3 as per ESP data format
  const currentFields = ['I1', 'I2', 'I3'];
  const currents = [];
  currentFields.forEach((field, idx) => {
    const current = data[field] || data[`A${idx + 1}`] || data[`current_l${idx + 1}`];
    if (current !== undefined && current !== null && current > 0) {
      currents.push(current);
      if (current > thresholds.current.high) {
        addAlert(alerts, deviceId, `current_high_${field}`, 'critical',
          `⚡ Current CRITICAL ${field}: ${current.toFixed(2)}A (> ${thresholds.current.high}A)`, current, now);
      }
    }
  });

  // Check Load Percentage (80% of 100A capacity)
  if (currents.length > 0) {
    const maxCurrent = Math.max(...currents);
    const loadPercent = (maxCurrent / thresholds.current.loadCapacity) * 100;
    
    if (loadPercent >= thresholds.current.loadWarningPercent) {
      const severity = loadPercent >= 90 ? 'critical' : 'warning';
      addAlert(alerts, deviceId, 'load_high', severity,
        `⚡ Load at ${loadPercent.toFixed(1)}% capacity (Max: ${maxCurrent.toFixed(2)}A / ${thresholds.current.loadCapacity}A)`,
        loadPercent, now);
    }
  }

  return alerts;
}

// LINE Messaging integration (lazy load to avoid circular dependency)
let lineMessagingService = null;
function getLineMessagingService() {
  if (!lineMessagingService) {
    try {
      lineMessagingService = require('./lineMessagingService');
    } catch (error) {
      console.warn('⚠️ LINE Messaging Service not available:', error.message);
    }
  }
  return lineMessagingService;
}

/**
 * Add alert if not in cooldown
 * Also sends LINE notification for critical alerts
 */
function addAlert(alerts, deviceId, alertType, severity, message, value, now) {
  const alertKey = `${deviceId}_${alertType}`;
  const lastAlert = activeAlerts.get(alertKey);

  // Check cooldown
  if (lastAlert && (now - lastAlert.timestamp) < ALERT_COOLDOWN_MS) {
    return; // Skip, still in cooldown
  }

  const alert = {
    id: `${alertKey}_${now}`,
    deviceId,
    type: alertType,
    severity,
    message,
    value,
    timestamp: new Date().toISOString()
  };

  alerts.push(alert);
  activeAlerts.set(alertKey, { timestamp: now });
  
  // ✅ Log alert to InfluxDB for history
  try {
    const influxService = require('./influxdb');
    influxService.writeAlert(alert).catch(err => {
      console.error('❌ Failed to write alert to InfluxDB:', err.message);
    });
  } catch (err) {
    console.warn('⚠️ InfluxDB service not available for alert logging');
  }
  
  // Send LINE notification for critical AND warning alerts
  if (severity === 'critical' || severity === 'warning') {
    const lineService = getLineMessagingService();
    if (lineService) {
      console.log(`📱 Sending LINE alert: ${alertType} (${severity})`);
      lineService.sendAlertMessage(alert).catch(err => {
        console.error('❌ Failed to send LINE alert:', err.message);
      });
    }
  }
}

/**
 * Get current thresholds
 */
function getThresholds() {
  return thresholds;
}

/**
 * Get active alerts count
 */
function getActiveAlertsCount() {
  return activeAlerts.size;
}

/**
 * Clear all active alerts (for testing)
 */
function clearAlerts() {
  activeAlerts.clear();
}

/**
 * =========================================
 * SMART ALERT: Historical Baseline Comparison
 * =========================================
 * Use hourly bucket to detect anomalies
 * - Compare current hour vs 7-day average
 * - Compare PF vs historical normal
 */

/**
 * Check hourly energy against historical baseline
 * @param {Object} influxService - InfluxDB service for querying
 * @param {string} deviceId - Device ID
 * @param {number} currentHourlyEnergy - Current hour's energy (kWh)
 * @returns {Array} Array of anomaly alerts
 */
async function checkHistoricalAnomaly(influxService, deviceId, currentHourlyEnergy) {
  const alerts = [];
  
  try {
    // Query last 7 days of hourly data for same hour
    const now = new Date();
    const currentHour = now.getHours();
    
    // Get hourly data from last 7 days
    const result = await influxService.queryFromBucket('hourly', '-7d', deviceId, ['energy_total']);
    
    if (!result.success || !result.data || result.data.length === 0) {
      return alerts;
    }
    
    // Filter to same hour of day and calculate average
    const sameHourData = result.data.filter(point => {
      const pointHour = new Date(point._time).getHours();
      return pointHour === currentHour && point._value > 0;
    });
    
    if (sameHourData.length < 3) {
      // Not enough historical data
      return alerts;
    }
    
    const baseline = sameHourData.reduce((sum, p) => sum + p._value, 0) / sameHourData.length;
    const threshold = baseline * 1.5; // 150% of baseline
    
    if (currentHourlyEnergy > threshold && currentHourlyEnergy > 1) {
      alerts.push({
        id: `${deviceId}_high_consumption_${Date.now()}`,
        deviceId,
        type: 'high_consumption_anomaly',
        severity: 'warning',
        message: `⚠️ High consumption: ${currentHourlyEnergy.toFixed(2)} kWh (baseline: ${baseline.toFixed(2)} kWh, +${((currentHourlyEnergy/baseline - 1) * 100).toFixed(0)}%)`,
        value: currentHourlyEnergy,
        baseline: baseline,
        hour: currentHour,
        timestamp: new Date().toISOString()
      });
      
      console.warn(`⚠️ Smart Alert: High consumption detected at ${currentHour}:00 - ${currentHourlyEnergy.toFixed(2)} kWh vs baseline ${baseline.toFixed(2)} kWh`);
    }
  } catch (error) {
    console.error('❌ Error in checkHistoricalAnomaly:', error);
  }
  
  return alerts;
}

/**
 * Get anomaly detection status
 */
function getAnomalyDetectionInfo() {
  return {
    enabled: true,
    method: 'hourly_baseline_comparison',
    lookback: '7 days',
    threshold: '150% of baseline',
    source: 'AI205_hourly bucket'
  };
}

module.exports = {
  checkAlerts,
  getThresholds,
  getActiveAlertsCount,
  clearAlerts,
  // Smart Alert (Historical)
  checkHistoricalAnomaly,
  getAnomalyDetectionInfo
};
