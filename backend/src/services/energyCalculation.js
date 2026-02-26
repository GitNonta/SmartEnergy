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
 * Calculate system power factor from 3-phase readings
 * IEC 61000 standard: PF_sys = ΣP / ΣS = ΣP / Σ(V×I)
 * Uses apparent power (V×I) as weight — arithmetic mean is incorrect.
 * Falls back to kW-weighted average when V/I not available.
 * @param {object} data - Object containing pf1/pf2/pf3 and optionally kW1/kW2/kW3, V1-V3, I1-I3
 * @returns {number} System power factor (0–1)
 */
function calculateAveragePowerFactor(data) {
  const pf1 = parseFloat(data.pf1 || data.PF1) || 0;
  const pf2 = parseFloat(data.pf2 || data.PF2) || 0;
  const pf3 = parseFloat(data.pf3 || data.PF3) || 0;

  // Preferred: weight by apparent power S = V × I (IEC 61000)
  const v1 = parseFloat(data.V1 || data.voltage_L1) || 0;
  const v2 = parseFloat(data.V2 || data.voltage_L2) || 0;
  const v3 = parseFloat(data.V3 || data.voltage_L3) || 0;
  const i1 = parseFloat(data.I1 || data.current_L1) || 0;
  const i2 = parseFloat(data.I2 || data.current_L2) || 0;
  const i3 = parseFloat(data.I3 || data.current_L3) || 0;

  const s1 = v1 * i1;
  const s2 = v2 * i2;
  const s3 = v3 * i3;
  const totalS = s1 + s2 + s3;

  if (totalS > 0) {
    // PF_sys = ΣP / ΣS  where P = PF × S
    const totalP = pf1 * s1 + pf2 * s2 + pf3 * s3;
    return totalP / totalS;
  }

  // Fallback: weight by active power kW when V/I not available
  const kw1 = parseFloat(data.kW1) || 0;
  const kw2 = parseFloat(data.kW2) || 0;
  const kw3 = parseFloat(data.kW3) || 0;
  const totalKw = kw1 + kw2 + kw3;

  if (totalKw > 0) {
    return (pf1 * kw1 + pf2 * kw2 + pf3 * kw3) / totalKw;
  }

  // Last resort: simple average of available phases
  const count = (pf1 > 0 ? 1 : 0) + (pf2 > 0 ? 1 : 0) + (pf3 > 0 ? 1 : 0);
  if (count === 0) return 0;
  return (pf1 + pf2 + pf3) / count;
}

/**
 * คำนวณค่าไฟตามอัตราก้าวหน้า (PEA Type 1.1.2)
 * Progressive Rate Tariff - Same structure as server.js TARIFF_TIERS
 * 
 * @param {number} units - จำนวนหน่วยไฟฟ้า (kWh)
 * @param {number} ft - ค่า Ft (บาท/หน่วย, default 0.3972)
 * @returns {object} รายละเอียดค่าไฟ
 */
function calculateProgressiveCost(units, ft = 0.1572) {
  if (units <= 0) return { 
    energyCharge: 0, 
    ftCharge: 0, 
    serviceCharge: 0, 
    subtotal: 0, 
    vat: 0, 
    total: 0,
    units: 0 
  };
  
  // โครงสร้างอัตราค่าไฟฟ้า PEA Type 1.1.2 (บาท/หน่วย)
  const TARIFF_TIERS = [
    { from: 0, to: 15, rate: 2.3488 },
    { from: 15, to: 25, rate: 2.9882 },
    { from: 25, to: 35, rate: 3.2405 },
    { from: 35, to: 100, rate: 3.6237 },
    { from: 100, to: 150, rate: 3.7171 },
    { from: 150, to: 400, rate: 4.2218 },
    { from: 400, to: Infinity, rate: 4.4217 }
  ];
  
  const SERVICE_CHARGE = 8.19; // ค่าบริการรายเดือน (บาท)
  const VAT_RATE = 0.07;       // ภาษีมูลค่าเพิ่ม 7%
  
  let remaining = units;
  let energyCharge = 0;
  
  // คำนวณค่าพลังงานไฟฟ้าตามขั้นบันได
  for (const tier of TARIFF_TIERS) {
    if (remaining <= 0) break;
    
    const tierUnits = Math.min(remaining, tier.to - tier.from);
    if (tierUnits > 0) {
      energyCharge += tierUnits * tier.rate;
      remaining -= tierUnits;
    }
  }
  
  // คำนวณค่า Ft (Fuel Adjustment)
  const ftCharge = units * ft;

  // ✅ PEA standard: VAT คำนวณจาก (ค่าพลังงาน + ค่าบริการ) เท่านั้น
  // Ft เป็นรายการแยกต่างหากที่ไม่รวมในฐาน VAT
  // Ref: ใบแจ้งหนี้ กฟภ. — VAT = (energyCharge + serviceCharge) × 7%
  const vatBase = energyCharge + SERVICE_CHARGE;
  const vat = vatBase * VAT_RATE;

  // รวมยอดก่อน VAT (สำหรับ display)
  const subtotal = vatBase + ftCharge;

  // รวมยอดสุทธิ
  const total = subtotal + vat;
  
  return {
    units: parseFloat(units.toFixed(2)),
    energyCharge: parseFloat(energyCharge.toFixed(2)),
    ftCharge: parseFloat(ftCharge.toFixed(2)),
    serviceCharge: SERVICE_CHARGE,
    subtotal: parseFloat(subtotal.toFixed(2)),
    vat: parseFloat(vat.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  };
}

/**
 * คำนวณค่าไฟอย่างง่าย (ได้เฉพาะ total)
 * @param {number} units - จำนวนหน่วยไฟฟ้า (kWh)
 * @param {number} ft - ค่า Ft (บาท/หน่วย)
 * @returns {number} ค่าไฟรวม VAT (บาท)
 */
function getProgressiveCostTotal(units, ft = 0.1572) {
  return calculateProgressiveCost(units, ft).total;
}

module.exports = {
  ELECTRICITY_RATE,
  calculateCost,
  calculatePower,
  calculateTotalPower,
  calculateEnergyConsumption,
  formatEnergy,
  formatPower,
  calculateAveragePowerFactor,
  calculateProgressiveCost,
  getProgressiveCostTotal
};

