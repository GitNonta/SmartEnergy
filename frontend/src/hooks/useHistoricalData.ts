/**
 * Custom Hook for Fetching Historical Data from InfluxDB
 * ดึงข้อมูลย้อนหลังจาก database ตามช่วงเวลาที่กำหนด
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  fetchCombinedData, 
  fetchPerPhaseData,
  timeRangeToInfluxRange,
  type CombinedDataPoint,
  type PerPhaseDataPoint
} from '../services/influxService';

export type TimeRangeLabel = 'Real-time' | '1H' | '1D' | '1W' | '1M' | 'MN';

export type ChartDataPoint = {
  time: number;
  timestamp: string;
  [key: string]: any;
};

interface UseHistoricalDataOptions {
  timeRange: TimeRangeLabel;
  dataType: 'combined' | 'per_phase' | 'both';
  phase?: 'L1' | 'L2' | 'L3';
  fields?: string[]; // ฟิลด์ที่ต้องการ เช่น ['voltage', 'current']
  autoRefresh?: boolean; // Auto refresh ทุกๆ interval
  refreshInterval?: number; // milliseconds
  limit?: number; // จำกัดจำนวนข้อมูล
}

interface UseHistoricalDataResult {
  data: ChartDataPoint[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  lastUpdate: Date | null;
}

/**
 * Hook สำหรับดึงข้อมูลประวัติจาก InfluxDB
 */
export const useHistoricalData = (
  options: UseHistoricalDataOptions
): UseHistoricalDataResult => {
  const {
    timeRange,
    dataType,
    phase,
    fields = [],
    autoRefresh = false,
    refreshInterval = 5000,
    limit
  } = options;

  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  /**
   * แปลง CombinedDataPoint เป็น ChartDataPoint
   */
  const transformCombinedData = useCallback((rawData: CombinedDataPoint[]): ChartDataPoint[] => {
    return rawData.map(point => {
      const timestamp = new Date(point.timestamp).getTime();
      const transformed: ChartDataPoint = {
        time: timestamp,
        timestamp: point.timestamp,
      };

      // เพิ่มฟิลด์ที่ต้องการ
      if (fields.length === 0) {
        // ถ้าไม่ระบุ fields ให้เอาทั้งหมด
        Object.keys(point).forEach(key => {
          if (key !== 'timestamp') {
            transformed[key] = point[key as keyof CombinedDataPoint];
          }
        });
      } else {
        // เอาเฉพาะฟิลด์ที่ระบุ
        fields.forEach(field => {
          transformed[field] = point[field as keyof CombinedDataPoint];
        });
      }

      return transformed;
    });
  }, [fields]);

  /**
   * แปลง PerPhaseDataPoint เป็น ChartDataPoint
   */
  const transformPerPhaseData = useCallback((rawData: PerPhaseDataPoint[]): ChartDataPoint[] => {
    // Group by timestamp
    const grouped = new Map<string, ChartDataPoint>();

    rawData.forEach(point => {
      const timestamp = new Date(point.timestamp).getTime();
      const key = point.timestamp;

      if (!grouped.has(key)) {
        grouped.set(key, {
          time: timestamp,
          timestamp: point.timestamp,
        });
      }

      const transformed = grouped.get(key)!;
      const phasePrefix = point.phase.toLowerCase(); // l1, l2, l3

      // เพิ่มข้อมูลแต่ละ phase
      if (fields.length === 0) {
        Object.keys(point).forEach(field => {
          if (field !== 'timestamp' && field !== 'phase') {
            transformed[`${phasePrefix}_${field}`] = point[field as keyof PerPhaseDataPoint];
          }
        });
      } else {
        fields.forEach(field => {
          if (point[field as keyof PerPhaseDataPoint] !== undefined) {
            transformed[`${phasePrefix}_${field}`] = point[field as keyof PerPhaseDataPoint];
          }
        });
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.time - b.time);
  }, [fields]);

  /**
   * ดึงข้อมูลจาก InfluxDB
   */
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const influxRange = timeRangeToInfluxRange(timeRange);
      let chartData: ChartDataPoint[] = [];

      if (dataType === 'combined') {
        const rawData = await fetchCombinedData(influxRange, limit);
        chartData = transformCombinedData(rawData);
      } else if (dataType === 'per_phase') {
        const rawData = await fetchPerPhaseData(influxRange, phase, limit);
        chartData = transformPerPhaseData(rawData);
      } else if (dataType === 'both') {
        // ดึงทั้ง combined และ per_phase
        const [combinedRaw, perPhaseRaw] = await Promise.all([
          fetchCombinedData(influxRange, limit),
          fetchPerPhaseData(influxRange, undefined, limit)
        ]);

        const combined = transformCombinedData(combinedRaw);
        const perPhase = transformPerPhaseData(perPhaseRaw);

        // Merge data by timestamp
        const merged = new Map<number, ChartDataPoint>();

        combined.forEach(point => {
          merged.set(point.time, { ...point });
        });

        perPhase.forEach(point => {
          const existing = merged.get(point.time);
          if (existing) {
            merged.set(point.time, { ...existing, ...point });
          } else {
            merged.set(point.time, point);
          }
        });

        chartData = Array.from(merged.values()).sort((a, b) => a.time - b.time);
      }

      setData(chartData);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching historical data:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, dataType, phase, limit, transformCombinedData, transformPerPhaseData]);

  /**
   * Effect สำหรับดึงข้อมูลครั้งแรกและ auto-refresh
   */
  useEffect(() => {
    fetchData();

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh, refreshInterval]);

  return {
    data,
    isLoading,
    error,
    refresh: fetchData,
    lastUpdate
  };
};

/**
 * Hook แบบง่ายสำหรับดึงข้อมูล field เดียว
 */
export const useFieldHistory = (
  field: string,
  timeRange: TimeRangeLabel,
  options?: {
    autoRefresh?: boolean;
    refreshInterval?: number;
    limit?: number;
  }
): UseHistoricalDataResult => {
  return useHistoricalData({
    timeRange,
    dataType: 'combined',
    fields: [field],
    ...options
  });
};

/**
 * Hook สำหรับดึงข้อมูล phase ย้อนหลัง
 */
export const usePhaseHistory = (
  phase: 'L1' | 'L2' | 'L3',
  fields: string[],
  timeRange: TimeRangeLabel,
  options?: {
    autoRefresh?: boolean;
    refreshInterval?: number;
    limit?: number;
  }
): UseHistoricalDataResult => {
  return useHistoricalData({
    timeRange,
    dataType: 'per_phase',
    phase,
    fields,
    ...options
  });
};
