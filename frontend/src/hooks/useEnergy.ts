import { useState, useEffect } from 'react';
import { EnergyData, MeterSettings } from '../types/energy';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export const useLiveData = (meters: string[], interval: number = 5000) => {
  const [data, setData] = useState<EnergyData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const responses = await Promise.all(
          meters.map(meter =>
            fetch(`${API_BASE}/api/meters/${meter}/live`)
              .then(res => res.json())
              .then(data => ({
                ...data,
                totalPower: data.Psum_W ? data.Psum_W / 1000 : undefined, // Convert W to kW
                powerFactor: data.PF,
                avgVoltage: data.V1_V && data.V2_V && data.V3_V 
                  ? (data.V1_V + data.V2_V + data.V3_V) / 3 
                  : undefined,
                avgCurrent: data.I1_A && data.I2_A && data.I3_A 
                  ? (data.I1_A + data.I2_A + data.I3_A) / 3 
                  : undefined
              }))
          )
        );
        setData(responses);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setIsLoading(false);
      }
    };

    const startPolling = () => {
      fetchData();
      timeoutId = setTimeout(startPolling, interval);
    };

    if (meters.length > 0) {
      startPolling();
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [meters, interval]);

  return { data, error, isLoading };
};

export const useHistoricalData = (
  meters: string[],
  startTime: string,
  endTime: string,
  aggregation: string
) => {
  const [data, setData] = useState<EnergyData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (meters.length === 0) return;

      try {
        setIsLoading(true);
        const response = await fetch(
          `${API_BASE}/api/meters/historical?` +
          new URLSearchParams({
            meters: meters.join(','),
            start: startTime,
            end: endTime,
            aggregation
          })
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch historical data');
        }

        const rawData = await response.json();
        const processedData = rawData.map((item: EnergyData) => ({
          ...item,
          totalPower: item.Psum_W ? item.Psum_W / 1000 : undefined, // Convert W to kW
          powerFactor: item.PF,
          avgVoltage: item.V1_V && item.V2_V && item.V3_V 
            ? (item.V1_V + item.V2_V + item.V3_V) / 3 
            : undefined,
          avgCurrent: item.I1_A && item.I2_A && item.I3_A 
            ? (item.I1_A + item.I2_A + item.I3_A) / 3 
            : undefined
        }));
        setData(processedData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [meters, startTime, endTime, aggregation]);

  return { data, error, isLoading };
};

export const useMeterSettings = () => {
  const [settings, setSettings] = useState<MeterSettings[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/api/meters/settings`);
      if (!response.ok) {
        throw new Error('Failed to fetch meter settings');
      }
      const data = await response.json();
      setSettings(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (meterId: string, updates: Partial<MeterSettings>) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/api/meters/${meterId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update settings');
      }

      await fetchSettings(); // Refresh settings
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return { settings, error, isLoading, updateSettings };
};