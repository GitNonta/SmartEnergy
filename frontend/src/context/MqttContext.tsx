import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { mqttService, EnergyData } from '../services/mqttService';
import mqttConfig from '../config/mqttConfig';

interface MqttContextType {
  isConnected: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  energyData: EnergyData | null;
  lastUpdate: Date | null;
  alerts: any[];
  // Live samples buffer for charts
  history: Array<{
    ts: number;
    f1?: number; f2?: number; f3?: number;
    i1?: number; i2?: number; i3?: number;
    pf1?: number; pf2?: number; pf3?: number;
    daily?: number; monthly?: number; yearly?: number;
  }>;
  connect: () => Promise<void>;
  disconnect: () => void;
  publishCommand: (device: string, command: string, value?: any) => void;
  error: string | null;
}

const MqttContext = createContext<MqttContextType | undefined>(undefined);

interface MqttProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
}

export const MqttProvider: React.FC<MqttProviderProps> = ({ 
  children, 
  autoConnect = false
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [energyData, setEnergyData] = useState<EnergyData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MqttContextType['history']>([]);
  const lastSampleRef = useRef<number>(0);
  // Read retention hours from config (memoized to avoid recreating on every render)
  const retentionHours = mqttConfig.app.historyRetentionHours;

  // Auto-connect on mount if enabled
  useEffect(() => {
    const connectToMqtt = async () => {
      if (autoConnect) {
        try {
          setConnectionStatus('connecting');
          setError(null);

          await mqttService.connect();

          // Set up data listeners
          setupDataListeners();

          setIsConnected(true);
          setConnectionStatus('connected');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to connect to MQTT broker');
          setConnectionStatus('error');
          setIsConnected(false);
        }
      }
    };

    connectToMqtt();

    // Cleanup on unmount
    return () => {
      mqttService.disconnect();
    };
  }, [autoConnect]);

  // Whenever energyData updates, append a consolidated sample into history for charts
  useEffect(() => {
    if (!energyData) return;

    const now = Date.now();
    // Basic throttle to avoid over-sampling if many messages arrive rapidly
    if (now - lastSampleRef.current < 800) {
      return;
    }
    lastSampleRef.current = now;

    setHistory(prev => {
      const last = prev[prev.length - 1];
      const sample = {
        ts: now,
        f1: energyData.voltage?.f1 ?? last?.f1 ?? 0,
        f2: energyData.voltage?.f2 ?? last?.f2 ?? 0,
        f3: energyData.voltage?.f3 ?? last?.f3 ?? 0,
        i1: energyData.current?.i1 ?? last?.i1 ?? 0,
        i2: energyData.current?.i2 ?? last?.i2 ?? 0,
        i3: energyData.current?.i3 ?? last?.i3 ?? 0,
        pf1: energyData.powerFactor?.pf1 ?? last?.pf1 ?? 0,
        pf2: energyData.powerFactor?.pf2 ?? last?.pf2 ?? 0,
        pf3: energyData.powerFactor?.pf3 ?? last?.pf3 ?? 0,
        daily: energyData.energyAccumulated?.daily ?? last?.daily ?? 0,
        monthly: energyData.energyAccumulated?.monthly ?? last?.monthly ?? 0,
        yearly: energyData.energyAccumulated?.yearly ?? last?.yearly ?? 0,
      };

      const cutoff = now - retentionHours * 60 * 60 * 1000;
      const trimmed = prev.filter(s => s.ts >= cutoff);
      trimmed.push(sample);
      return trimmed;
    });
  }, [energyData, retentionHours]);

  // Connect to MQTT broker
  const connect = async (): Promise<void> => {
    try {
      setConnectionStatus('connecting');
      setError(null);

      await mqttService.connect();

      // Set up data listeners
      setupDataListeners();

      setIsConnected(true);
      setConnectionStatus('connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to MQTT broker');
      setConnectionStatus('error');
      setIsConnected(false);
    }
  };

  // Disconnect from MQTT broker
  const disconnect = (): void => {
    mqttService.disconnect();
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setEnergyData(null);
    setLastUpdate(null);
    setAlerts([]);
  };

  // Set up data listeners for all energy monitoring topics
  const setupDataListeners = (): void => {
    // Voltage data listener
    mqttService.onVoltageData((data) => {
      setEnergyData(prev => ({
        ...prev,
        timestamp: data.timestamp || new Date().toISOString(),
        voltage: {
          f1: data.f1 ?? data.F1 ?? data.V1 ?? data.voltage?.f1 ?? data.voltage?.F1 ?? data.voltage?.V1 ?? prev?.voltage?.f1 ?? 0,
          f2: data.f2 ?? data.F2 ?? data.V2 ?? data.voltage?.f2 ?? data.voltage?.F2 ?? data.voltage?.V2 ?? prev?.voltage?.f2 ?? 0,
          f3: data.f3 ?? data.F3 ?? data.V3 ?? data.voltage?.f3 ?? data.voltage?.F3 ?? data.voltage?.V3 ?? prev?.voltage?.f3 ?? 0,
        },
        current: prev?.current || { i1: 0, i2: 0, i3: 0 },
        powerFactor: prev?.powerFactor || { pf1: 0, pf2: 0, pf3: 0 },
        energyAccumulated: prev?.energyAccumulated || { daily: 0, monthly: 0, yearly: 0 },
        power: prev?.power || { total: 0, phase1: 0, phase2: 0, phase3: 0 }
      }));
      setLastUpdate(new Date());
    });

    // Current data listener
    mqttService.onCurrentData((data) => {
      setEnergyData(prev => ({
        ...prev,
        timestamp: data.timestamp || new Date().toISOString(),
        voltage: prev?.voltage || { f1: 0, f2: 0, f3: 0 },
        current: {
          i1: data.i1 ?? data.I1 ?? data.current?.i1 ?? data.current?.I1 ?? prev?.current?.i1 ?? 0,
          i2: data.i2 ?? data.I2 ?? data.current?.i2 ?? data.current?.I2 ?? prev?.current?.i2 ?? 0,
          i3: data.i3 ?? data.I3 ?? data.current?.i3 ?? data.current?.I3 ?? prev?.current?.i3 ?? 0,
        },
        powerFactor: prev?.powerFactor || { pf1: 0, pf2: 0, pf3: 0 },
        energyAccumulated: prev?.energyAccumulated || { daily: 0, monthly: 0, yearly: 0 },
        power: prev?.power || { total: 0, phase1: 0, phase2: 0, phase3: 0 }
      }));
      setLastUpdate(new Date());
    });

    // Power Factor data listener
    mqttService.onPowerFactorData((data) => {
      setEnergyData(prev => ({
        ...prev,
        timestamp: data.timestamp || new Date().toISOString(),
        voltage: prev?.voltage || { f1: 0, f2: 0, f3: 0 },
        current: prev?.current || { i1: 0, i2: 0, i3: 0 },
        powerFactor: {
          pf1: data.pf1 ?? data.PF1 ?? data.powerFactor?.pf1 ?? data.powerFactor?.PF1 ?? 0,
          pf2: data.pf2 ?? data.PF2 ?? data.powerFactor?.pf2 ?? data.powerFactor?.PF2 ?? 0,
          pf3: data.pf3 ?? data.PF3 ?? data.powerFactor?.pf3 ?? data.powerFactor?.PF3 ?? 0,
        },
        energyAccumulated: prev?.energyAccumulated || { daily: 0, monthly: 0, yearly: 0 },
        power: prev?.power || { total: 0, phase1: 0, phase2: 0, phase3: 0 }
      }));
      setLastUpdate(new Date());
    });

    // Energy Accumulated data listener
    mqttService.onEnergyData((data) => {
      setEnergyData(prev => ({
        ...prev,
        timestamp: data.timestamp || new Date().toISOString(),
        voltage: prev?.voltage || { f1: 0, f2: 0, f3: 0 },
        current: prev?.current || { i1: 0, i2: 0, i3: 0 },
        powerFactor: prev?.powerFactor || { pf1: 0, pf2: 0, pf3: 0 },
        energyAccumulated: {
          daily: data.daily || data.energyAccumulated?.daily || 0,
          monthly: data.monthly || data.energyAccumulated?.monthly || 0,
          yearly: data.yearly || data.energyAccumulated?.yearly || 0,
        },
        power: prev?.power || { total: 0, phase1: 0, phase2: 0, phase3: 0 }
      }));
      setLastUpdate(new Date());
    });

    // Alerts listener
    mqttService.onAlerts((data) => {
      setAlerts(prev => {
        const newAlert = {
          id: Date.now().toString(),
          ...data,
          timestamp: data.timestamp || new Date().toISOString()
        };
        return [newAlert, ...prev].slice(0, 10); // Keep only last 10 alerts
      });
    });
  };

  // Publish command to device
  const publishCommand = (device: string, command: string, value?: any): void => {
    mqttService.sendCommand(device, command, value);
  };

  const contextValue: MqttContextType = {
    isConnected,
    connectionStatus,
    energyData,
    lastUpdate,
    alerts,
    history,
    connect,
    disconnect,
    publishCommand,
    error
  };

  return (
    <MqttContext.Provider value={contextValue}>
      {children}
    </MqttContext.Provider>
  );
};

// Custom hook to use MQTT context
export const useMqtt = (): MqttContextType => {
  const context = useContext(MqttContext);
  if (context === undefined) {
    throw new Error('useMqtt must be used within a MqttProvider');
  }
  return context;
};

export default MqttProvider;