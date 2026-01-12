/**
 * Energy Calculation Service
 * Provides utility functions for energy calculations
 */

const ELECTRICITY_RATE = parseFloat(process.env.ELECTRICITY_RATE) || 4.5; // THB per kWh

/**
 * Calculate energy cost from kWh
 * @param {number} kWh - Energy in kilowatt-hours
 * @param {number} rate - Rate per kWh (default: ELECTRICITY_RATE)
 * @returns {number} Cost in THB
 */
function calculateCost(kWh, rate = ELECTRICITY_RATE) {
  return kWh * rate;
}

/**
 * Calculate power from voltage and current
 * @param {number} voltage - Voltage in volts
 * @param {number} current - Current in amperes
 * @param {number} powerFactor - Power factor (0-1)
 * @returns {number} Power in watts
 */
function calculatePower(voltage, current, powerFactor = 1) {
  return voltage * current * powerFactor;
}

/**
 * Calculate total power from 3-phase readings
 * @param {object} data - Object containing kW1, kW2, kW3 (in kW)
 * @returns {number} Total power in kW
 */
function calculateTotalPower(data) {
  const kW1 = parseFloat(data.kW1) || 0;
  const kW2 = parseFloat(data.kW2) || 0;
  const kW3 = parseFloat(data.kW3) || 0;
  return kW1 + kW2 + kW3;
}

/**
 * Calculate energy consumption between two timestamps
 * @param {number} power - Power in kW
 * @param {number} hours - Duration in hours
 * @returns {number} Energy in kWh
 */
function calculateEnergyConsumption(power, hours) {
  return power * hours;
}

/**
 * Format energy value with appropriate unit
 * @param {number} value - Energy value in kWh
 * @returns {string} Formatted string with unit
 */
function formatEnergy(value) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} MWh`;
  }
  return `${value.toFixed(2)} kWh`;
}

/**
 * Format power value with appropriate unit
 * @param {number} value - Power value in watts
 * @returns {string} Formatted string with unit
 */
function formatPower(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)} MW`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} kW`;
  }
  return `${value.toFixed(2)} W`;
}

/**
 * Calculate average power factor from 3-phase readings
 * @param {object} data - Object containing pf1, pf2, pf3
 * @returns {number} Average power factor
 */
function calculateAveragePowerFactor(data) {
  const pf1 = parseFloat(data.pf1 || data.PF1) || 0;
  const pf2 = parseFloat(data.pf2 || data.PF2) || 0;
  const pf3 = parseFloat(data.pf3 || data.PF3) || 0;
  
  const count = (pf1 > 0 ? 1 : 0) + (pf2 > 0 ? 1 : 0) + (pf3 > 0 ? 1 : 0);
  if (count === 0) return 0;
  
  return (pf1 + pf2 + pf3) / count;
}

module.exports = {
  ELECTRICITY_RATE,
  calculateCost,
  calculatePower,
  calculateTotalPower,
  calculateEnergyConsumption,
  formatEnergy,
  formatPower,
  calculateAveragePowerFactor
};
