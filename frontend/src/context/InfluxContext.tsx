/**
 * InfluxDB Context
 * Context สำหรับจัดการข้อมูล historical data จาก InfluxDB
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import influxService, {
  CombinedDataPoint,
  PerPhaseDataPoint,
  timeRangeToInfluxRange
} from '../services/influxService';

interface InfluxContextType {
  // Data
  combinedData: CombinedDataPoint[];
  perPhaseData: PerPhaseDataPoint[];
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Time range
  currentRange: string;
  
  // Actions
  fetchData: (timeRangeLabel: string) => Promise<void>;
  refreshData: () => Promise<void>;
  clearError: () => void;
  
  // Connection status
  isConnected: boolean;
  lastUpdated: Date | null;
}

const InfluxContext = createContext<InfluxContextType | undefined>(undefined);

export const useInfluxData = () => {
  const context = useContext(InfluxContext);
  if (!context) {
    throw new Error('useInfluxData must be used within InfluxProvider');
  }
  return context;
};

interface InfluxProviderProps {
  children: React.ReactNode;
  autoFetch?: boolean;
  defaultRange?: string;
}

export const InfluxProvider: React.FC<InfluxProviderProps> = ({ 
  children,
  autoFetch = true,
  defaultRange = 'Real-time'
}) => {
  const [combinedData, setCombinedData] = useState<CombinedDataPoint[]>([]);
  const [perPhaseData, setPerPhaseData] = useState<PerPhaseDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRange, setCurrentRange] = useState<string>(defaultRange);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /**
   * ตรวจสอบการเชื่อมต่อกับ Backend
   */
  const checkConnection = useCallback(async () => {
    try {
      const health = await influxService.checkHealth();
      setIsConnected(health.status === 'ok');
      return true;
    } catch (err) {
      setIsConnected(false);
      return false;
    }
  }, []);

  /**
   * ดึงข้อมูลจาก InfluxDB
   */
  const fetchData = useCallback(async (timeRangeLabel: string) => {
    setIsLoading(true);
    setError(null);
    setCurrentRange(timeRangeLabel);

    try {
      // แปลง time range label เป็น InfluxDB range
      const range = timeRangeToInfluxRange(timeRangeLabel);
      
      console.log(`📊 Fetching InfluxDB data for range: ${timeRangeLabel} (${range})`);

      // ดึงข้อมูลทั้งหมด (combined + phases)
      const data = await influxService.fetchCombinedWithPhases(range, 500);
      
      setCombinedData(data.combined || []);
      setPerPhaseData(data.phases || []);
      setLastUpdated(new Date());
      setIsConnected(true);
      
      console.log(`✅ Fetched ${data.combined?.length || 0} combined points, ${data.phases?.length || 0} phase points`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setIsConnected(false);
      // Reset เป็นข้อมูลว่างเมื่อเกิด error
      setCombinedData([]);
      setPerPhaseData([]);
      console.error('❌ Error fetching InfluxDB data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Refresh ข้อมูลด้วย range เดิม
   */
  const refreshData = useCallback(async () => {
    await fetchData(currentRange);
  }, [currentRange, fetchData]);

  /**
   * ล้าง error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Auto-fetch ข้อมูลตอนเริ่มต้น
   */
  useEffect(() => {
    if (autoFetch) {
      // ตรวจสอบการเชื่อมต่อก่อน
      checkConnection().then(connected => {
        if (connected) {
          fetchData(defaultRange);
        }
      });
    }
  }, [autoFetch, defaultRange, checkConnection, fetchData]);

  /**
   * Auto-refresh ทุก 30 วินาที (สำหรับ Real-time mode)
   */
  useEffect(() => {
    if (currentRange === 'Real-time' && isConnected) {
      const interval = setInterval(() => {
        refreshData();
      }, 30000); // 30 seconds

      return () => clearInterval(interval);
    }
  }, [currentRange, isConnected, refreshData]);

  const value: InfluxContextType = {
    combinedData,
    perPhaseData,
    isLoading,
    error,
    currentRange,
    fetchData,
    refreshData,
    clearError,
    isConnected,
    lastUpdated
  };

  return (
    <InfluxContext.Provider value={value}>
      {children}
    </InfluxContext.Provider>
  );
};

export default InfluxContext;
