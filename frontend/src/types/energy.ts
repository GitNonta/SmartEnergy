/**
 * Energy TypeScript Types
 * Type definitions for energy-related data structures
 */

// ====================================
// RAW DATA FROM DEVICE/MQTT
// ====================================
export interface EnergyData {
  ts: string;
  meter: string;
  F_Hz?: number;
  V1_V?: number;
  V2_V?: number;
  V3_V?: number;
  I1_A?: number;
  I2_A?: number;
  I3_A?: number;
  Psum_W?: number;
  PF?: number;
  kWh_imp?: number;
  pt_ratio?: number;
  ct_ratio?: number;
  totalPower?: number;
  powerFactor?: number;
  avgVoltage?: number;
  avgCurrent?: number;
}

// ====================================
// METER SETTINGS
// ====================================
export interface MeterSettings {
  id: string;
  name: string;
  ptRatio: number;
  ctRatio: number;
  enabled: boolean;
  alarmThresholds: {
    voltage: { high: number; low: number };
    current: { high: number };
    power: { high: number };
  };
}

// ====================================
// DASHBOARD STATE
// ====================================
export interface DashboardState {
  selectedMeters: string[];
  isLiveUpdate: boolean;
  updateInterval: number;
}

// ====================================
// API RESPONSES - Energy
// ====================================
export type DataQuality = 'measured' | 'estimated' | 'invalid' | 'no_data';

export interface HourlyDataPoint {
  _time: string;
  _value: number;
  _field: string;
  quality?: DataQuality;
  device_id?: string;
}

export interface DailyDataPoint {
  _time: string;
  _value: number;
  _field: string;
  quality?: DataQuality;
}

export interface MonthlyDataPoint {
  _time: string;
  _value: number;
  _field: string;
  quality?: DataQuality;
}

export interface HourlyApiResponse {
  success: boolean;
  source: string;
  range: string;
  deviceId: string;
  data: HourlyDataPoint[];
  count: number;
}

export interface DailyConsumptionResponse {
  success: boolean;
  source: string;
  deviceId: string;
  hourlyData: Array<{
    hour: string;
    energy_total: number;
    quality: DataQuality;
  }>;
  totalEnergy: number;
  dataPoints: number;
  note?: string;
}

export interface DailyReportResponse {
  success: boolean;
  source: string;
  range: string;
  deviceId: string;
  data: DailyDataPoint[];
  count: number;
}

export interface MonthlyBillingResponse {
  success: boolean;
  source: string;
  range: string;
  deviceId: string;
  data: MonthlyDataPoint[];
  count: number;
}

// ====================================
// CHART DATA STRUCTURES
// ====================================
export interface ChartDataPoint {
  x: string;
  y: number;
  quality?: DataQuality;
  fillColor?: string;
}

export interface EnergyChartData {
  hourly: ChartDataPoint[];
  daily: ChartDataPoint[];
  monthly: ChartDataPoint[];
}

// ====================================
// ENERGY STATE (from energyState.js)
// ====================================
export interface EnergyState {
  daily: number;
  monthly: number;
  yearly: number;
  lastUpdate: string | null;
  lastDelta: number;
  timezone: string;
}

export interface EnergyStateResponse {
  success: boolean;
  source: string;
  daily: number;
  monthly: number;
  yearly: number;
  lastUpdate: string | null;
  lastDelta: number;
  timezone: string;
}

// ====================================
// DATA INTEGRITY
// ====================================
export interface IntegrityCheckResult {
  success: boolean;
  checks: {
    duplicates?: { found: boolean; count: number };
    negatives?: { found: boolean; count: number };
    hourlyDailySum?: { match: boolean; difference: number };
  };
  timestamp: string;
}

// ====================================
// ALERT TYPES
// ====================================
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType =
  | 'overcurrent'
  | 'overvoltage'
  | 'undervoltage'
  | 'low_power_factor'
  | 'high_consumption_anomaly';

export interface Alert {
  id: string;
  deviceId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  value: number;
  threshold?: number;
  timestamp: string;
  acknowledged?: boolean;
}