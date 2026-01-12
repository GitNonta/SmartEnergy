/**
 * InfluxDB Service
 * Service สำหรับดึงข้อมูลจาก InfluxDB API
 */

import api from '../config/axios';

export interface InfluxDataPoint {
  _time: string;
  _value: number;
  _field: string;
  _measurement: string;
  phase?: string;
}

export interface CombinedDataPoint {
  timestamp: string;
  // Power (kW and W)
  power_active?: number;
  power_active_watts?: number;
  power_reactive?: number;
  power_reactive_var?: number;
  power_apparent?: number;
  power_apparent_va?: number;
  // System
  power_factor?: number;
  frequency?: number;
  // Energy
  energy_import?: number;
  energy_export?: number;
  energy_total?: number;
  energy_net?: number;
  // Quality
  thd_voltage?: number;
  thd_current?: number;
  voltage_unbalance?: number;
  temperature?: number;
}

export interface PerPhaseDataPoint {
  timestamp: string;
  phase: string;
  voltage?: number;
  current?: number;
  power_active?: number;
  power_active_watts?: number;
  power_apparent?: number;
  power_apparent_va?: number;
  power_factor?: number;
}

export interface EnergySummary {
  timeRange: string;
  bucket: string;
  duration: string;
  perPhase: {
    L1: number;
    L2: number;
    L3: number;
    total: number;
  };
  combined: {
    fromPower: number;
    fromMeter: number;
    import: number;
    export: number;
  };
  unit: string;
  calculatedAt: string;
}

/**
 * Calculate real-time daily energy accumulation from database
 * คำนวณพลังงานสะสมรายวันแบบเรียลไทม์จากฐานข้อมูล (00:00 - ปัจจุบัน)
 */
export const calculateDailyEnergyRealtime = async (): Promise<number> => {
  try {
    // Get current time and start of day (00:00)
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Calculate hours from start of day to now
    const hoursFromStart = (now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);

    console.log('⚡ Calculating daily energy realtime...');
    console.log('📅 Start of day:', startOfDay.toLocaleString('th-TH'));
    console.log('🕐 Hours from start:', hoursFromStart.toFixed(2), 'hours');

    // Fetch raw power data from start of day to now
    const response: any = await api.get(`/api/data/history?range=-${Math.ceil(hoursFromStart)}h`);

    // response IS the data body with axios interceptor logic (response.data)
    const data = response;

    console.log('📊 Raw data count:', data.count || 0);

    if (!data.success || !data.data || data.data.length === 0) {
      console.warn('No power data available for daily calculation');
      return 0;
    }

    // Calculate energy accumulation using trapezoidal rule
    let totalEnergy = 0; // kWh
    const powerData = data.data.filter((point: any) => {
      const pointTime = new Date(point.timestamp);
      return pointTime >= startOfDay && pointTime <= now;
    });

    console.log('📈 Filtered data points:', powerData.length);

    if (powerData.length < 2) {
      console.warn('⚠️ Insufficient data points for calculation');
      return 0;
    }

    // Sort by time
    powerData.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Calculate energy using trapezoidal integration
    for (let i = 1; i < powerData.length; i++) {
      const prev = powerData[i - 1];
      const curr = powerData[i];

      const prevTime = new Date(prev.timestamp).getTime();
      const currTime = new Date(curr.timestamp).getTime();
      const deltaTime = (currTime - prevTime) / (1000 * 60 * 60); // hours

      // Get power values (use power_active_kw directly, or convert W to kW)
      const prevPower = prev.power_active_kw || (prev.power_active || 0) / 1000; // kW
      const currPower = curr.power_active_kw || (curr.power_active || 0) / 1000; // kW

      // Trapezoidal rule: Energy = (P1 + P2) / 2 * ΔT
      const avgPower = (prevPower + currPower) / 2;
      const deltaEnergy = avgPower * deltaTime; // kWh

      totalEnergy += deltaEnergy;
    }

    console.log('✅ Daily energy calculated:', totalEnergy.toFixed(3), 'kWh');

    return Math.max(0, totalEnergy); // Ensure non-negative
  } catch (error) {
    console.error('Error calculating daily energy realtime:', error);
    return 0;
  }
};

/**
 * Fetch daily energy summary from database
 * ดึงข้อมูลสรุปพลังงานรายวันจากฐานข้อมูล (00:00 - 23:59)
 */
export const fetchDailyEnergySummary = async (): Promise<number> => {
  try {
    const data: any = await api.get('/api/energy/summary?timeRange=1D');

    if (!data.success) {
      throw new Error(data.error || 'Failed to get energy summary');
    }

    // Return total energy consumption for the day
    return data.combined?.fromMeter || data.perPhase?.total || 0;
  } catch (error) {
    console.error('Error fetching daily energy summary:', error);
    return 0;
  }
};

/**
 * Fetch weekly energy summary from database (7 days)
 * ดึงข้อมูลสรุปพลังงานรายสัปดาห์จากฐานข้อมูล (7 วัน)
 */
export const fetchWeeklyEnergySummary = async (): Promise<number> => {
  try {
    const data: any = await api.get('/api/energy/summary?timeRange=7D');

    if (!data.success) {
      throw new Error(data.error || 'Failed to get weekly energy summary');
    }

    // Return total energy consumption for the week
    return data.combined?.fromMeter || data.perPhase?.total || 0;
  } catch (error) {
    console.error('Error fetching weekly energy summary:', error);
    return 0;
  }
};

/**
 * Fetch energy summary for any time range
 * ดึงข้อมูลสรุปพลังงานสำหรับช่วงเวลาที่กำหนด
 */
export const fetchEnergySummary = async (timeRange: string = '1D'): Promise<EnergySummary | null> => {
  try {
    const data: any = await api.get(`/api/energy/summary?timeRange=${timeRange}`);

    if (!data.success) {
      throw new Error(data.error || 'Failed to get energy summary');
    }

    return data;
  } catch (error) {
    console.error('Error fetching energy summary:', error);
    return null;
  }
};

export interface StatisticsData {
  field: string;
  min: number;
  max: number;
  mean: number;
  count: number;
}

/**
 * แปลง time range label เป็น InfluxDB range string
 */
export const timeRangeToInfluxRange = (label: string): string => {
  const rangeMap: Record<string, string> = {
    'Real-time': '-5m',    // Real-time = last 5 minutes
    '1H': '-1h',           // 1 hour
    '1D': '-24h',          // 1 day (24 hours)
    '1W': '-7d',           // 1 week (7 days)
    '1M': '-30d',          // 1 month (30 days)
    'MN': '-365d'          // Monthly/Yearly (365 days)
  };
  return rangeMap[label] || '-1h';
};

/**
 * Convert UTC timestamp to Bangkok time (UTC+7)
 */
export const convertUTCToBangkok = (utcTimestamp: string): string => {
  try {
    const date = new Date(utcTimestamp);
    // Convert to Bangkok time (UTC+7)
    const bangkokTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);

    // Format as HH:mm:ss
    const hours = String(bangkokTime.getUTCHours()).padStart(2, '0');
    const minutes = String(bangkokTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(bangkokTime.getUTCSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
  } catch (error) {
    console.error('❌ Error converting timestamp:', error);
    return utcTimestamp;
  }
};

/**
 * Convert UTC timestamp to Bangkok datetime
 */
export const convertUTCToBangkokFull = (utcTimestamp: string): string => {
  try {
    const date = new Date(utcTimestamp);
    // Convert to Bangkok time (UTC+7)
    const bangkokTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);

    // Format as YYYY-MM-DD HH:mm:ss
    const year = bangkokTime.getUTCFullYear();
    const month = String(bangkokTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(bangkokTime.getUTCDate()).padStart(2, '0');
    const hours = String(bangkokTime.getUTCHours()).padStart(2, '0');
    const minutes = String(bangkokTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(bangkokTime.getUTCSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    console.error('❌ Error converting timestamp:', error);
    return utcTimestamp;
  }
};

/**
 * ดึงข้อมูลรวม 3-phase จาก InfluxDB
 */
export const fetchCombinedData = async (
  range: string,
  limit?: number
): Promise<CombinedDataPoint[]> => {
  try {
    const params = new URLSearchParams({
      type: 'combined',
      range: range
    });

    if (limit) {
      params.append('limit', limit.toString());
    }

    const data: any = await api.get(`/api/data/history?${params}`);
    return data;
  } catch (error) {
    console.error('Error fetching combined data:', error);
    throw error;
  }
};

/**
 * ดึงข้อมูลแยกตาม phase (L1, L2, L3)
 */
export const fetchPerPhaseData = async (
  range: string,
  phase?: 'L1' | 'L2' | 'L3',
  limit?: number
): Promise<PerPhaseDataPoint[]> => {
  try {
    const params = new URLSearchParams({
      type: 'per_phase',
      range: range
    });

    if (phase) {
      params.append('phase', phase);
    }

    if (limit) {
      params.append('limit', limit.toString());
    }

    const data: any = await api.get(`/api/data/history?${params}`);
    return data;
  } catch (error) {
    console.error('Error fetching per-phase data:', error);
    throw error;
  }
};

/**
 * ดึงข้อมูลทั้งหมด (combined + per-phase)
 */
export const fetchCombinedWithPhases = async (
  range: string,
  limit?: number
): Promise<{
  combined: CombinedDataPoint[];
  phases: PerPhaseDataPoint[];
}> => {
  try {
    const params = new URLSearchParams({
      range: range
    });

    if (limit) {
      params.append('limit', limit.toString());
    }

    const data: any = await api.get(`/api/data/combined-with-phases?${params}`);
    return data;
  } catch (error) {
    console.error('Error fetching combined with phases data:', error);
    throw error;
  }
};

/**
 * ดึงข้อมูลสถิติ
 */
export const fetchStatistics = async (
  field: string,
  range: string
): Promise<StatisticsData> => {
  try {
    const params = new URLSearchParams({
      field: field,
      range: range
    });

    const data: any = await api.get(`/api/data/statistics?${params}`);
    return data;
  } catch (error) {
    console.error('Error fetching statistics:', error);
    throw error;
  }
};

/**
 * ดึงข้อมูลล่าสุด (Recent data)
 */
export const fetchRecentData = async (
  limit: number = 100
): Promise<CombinedDataPoint[]> => {
  try {
    const params = new URLSearchParams({
      limit: limit.toString()
    });

    const data: any = await api.get(`/api/data/recent?${params}`);
    return data;
  } catch (error) {
    console.error('Error fetching recent data:', error);
    throw error;
  }
};

/**
 * ตรวจสอบสถานะ Backend API
 */
export const checkHealth = async (): Promise<{
  status: string;
  timestamp: string;
  influxdb?: string;
}> => {
  try {
    const data: any = await api.get('/health');
    return data;
  } catch (error: any) {
    // Only log if not a connection error (reduces console spam)
    if (!error.message?.includes('Network Error')) {
      console.warn('Health check failed:', error.message);
    }
    throw error;
  }
};

const influxService = {
  fetchCombinedData,
  fetchPerPhaseData,
  fetchCombinedWithPhases,
  fetchStatistics,
  fetchRecentData,
  checkHealth,
  timeRangeToInfluxRange,
  fetchDailyEnergySummary,
  fetchEnergySummary,
  calculateDailyEnergyRealtime
};

export default influxService;
