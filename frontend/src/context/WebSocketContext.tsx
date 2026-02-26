import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import webSocketClient, { WebSocketMessage } from '../services/webSocketClient';
import { getWsUrl, detectBackendPort } from '../config/api';

export interface EnergyData {
  timestamp: string;
  voltage: {
    f1: number;
    f2: number;
    f3: number;
  };
  current: {
    i1: number;
    i2: number;
    i3: number;
  };
  powerFactor: {
    pf1: number;
    pf2: number;
    pf3: number;
  };
  energyAccumulated: {
    daily: number;
    monthly: number;
    yearly: number;
    meterTotal: number;  // ✅ NEW: Ep_total ÷ 10 from MQTT
  };
  power: {
    total: number;
    phase1: number;
    phase2: number;
    phase3: number;
  };
}

interface WebSocketContextType {
  isConnected: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  energyData: EnergyData | null;
  lastUpdate: Date | null;
  alerts: any[];
  history: Array<{
    ts: number;
    f1?: number; f2?: number; f3?: number;
    i1?: number; i2?: number; i3?: number;
    pf1?: number; pf2?: number; pf3?: number;
    daily?: number; monthly?: number; yearly?: number;
    total?: number; phase1?: number; phase2?: number; phase3?: number;
  }>;
  espStatus: {
    ssid?: string;
    ip?: string;
    mac?: string;
    fw_version?: string;
    fw_current_version?: string;
    heap_free_kb?: number;
    cpu_freq_mhz?: number;
    uptime_sec?: number;
    timestamp?: number | string;
    receivedAt?: Date;
  } | null;
  connect: () => void;
  disconnect: () => void;
  sendCommand: (topic: string, payload: any) => void;
  error: string | null;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
  autoConnect = true
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [energyData, setEnergyData] = useState<EnergyData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<WebSocketContextType['history']>([]);
  const lastSampleRef = useRef<number>(0);
  const [espStatus, setEspStatus] = useState<WebSocketContextType['espStatus']>(null);

  const retentionHours = parseInt(import.meta.env.VITE_HISTORY_RETENTION_HOURS || '24');

  // Define callback functions ก่อน useEffect
  const connect = useCallback((): void => {
    // ป้องกันการ connect ซ้ำซ้อนใน Strict Mode
    if (webSocketClient.isConnected()) {
      console.log('WebSocket: Already connected, skipping connect...');
      return;
    }

    setConnectionStatus('connecting');
    setError(null);

    webSocketClient.connect({
      url: getWsUrl(),
      autoReconnect: true,
      heartbeat: true,
      onOpen: () => {
        console.log('WebSocket connected');
      },
      onClose: () => {
        console.log('WebSocket disconnected');
      },
      onError: (err) => {
        console.error('WebSocket error:', err);
        setError('WebSocket connection error');
        setConnectionStatus('error');
      }
    });
  }, []);

  const disconnect = useCallback((): void => {
    webSocketClient.disconnect();
    setIsConnected(false);
    setConnectionStatus('disconnected');
    // Reset ทุกค่าเป็น 0 เมื่อ disconnect
    setEnergyData({
      timestamp: new Date().toISOString(),
      voltage: { f1: 0, f2: 0, f3: 0 },
      current: { i1: 0, i2: 0, i3: 0 },
      powerFactor: { pf1: 0, pf2: 0, pf3: 0 },
      energyAccumulated: { daily: 0, monthly: 0, yearly: 0, meterTotal: 0 },
      power: { total: 0, phase1: 0, phase2: 0, phase3: 0 }
    });
    setLastUpdate(null);
    setAlerts([]);
    setHistory([]);
  }, []);

  const sendCommand = useCallback((topic: string, payload: any): void => {
    webSocketClient.sendMqttCommand(topic, payload);
  }, []);

  // Normalize incoming data
  const normalizeData = (data: any): any => {
    const out = { ...data };

    // Voltage
    out.f1 = out.f1 ?? out.F1 ?? out.V1 ?? out.voltage?.f1 ?? out.voltage?.F1 ?? out.voltage?.V1;
    out.f2 = out.f2 ?? out.F2 ?? out.V2 ?? out.voltage?.f2 ?? out.voltage?.F2 ?? out.voltage?.V2;
    out.f3 = out.f3 ?? out.F3 ?? out.V3 ?? out.voltage?.f3 ?? out.voltage?.F3 ?? out.voltage?.V3;

    // Current
    out.i1 = out.i1 ?? out.I1 ?? out.current?.i1 ?? out.current?.I1;
    out.i2 = out.i2 ?? out.I2 ?? out.current?.i2 ?? out.current?.I2;
    out.i3 = out.i3 ?? out.I3 ?? out.current?.i3 ?? out.current?.I3;

    // Power Factor
    out.pf1 = out.pf1 ?? out.PF1 ?? out.powerFactor?.pf1 ?? out.powerFactor?.PF1;
    out.pf2 = out.pf2 ?? out.PF2 ?? out.powerFactor?.pf2 ?? out.powerFactor?.PF2;
    out.pf3 = out.pf3 ?? out.PF3 ?? out.powerFactor?.pf3 ?? out.powerFactor?.PF3;

    // Power (convert kW to W)
    // Bug #5 fix: power.total/phase* from backend is in kW — must always multiply by 1000.
    // The old ?? fallback silently used kW as W when kWsum was absent (off-by-1000x).
    if (out.kWsum != null) {
      out.total  = out.kWsum  * 1000;
    } else if (out.power?.total != null) {
      out.total  = out.power.total  * 1000; // kW → W
    } else {
      out.total  = out.total ?? 0;
    }
    if (out.kW1 != null) {
      out.phase1 = out.kW1 * 1000;
    } else if (out.power?.phase1 != null) {
      out.phase1 = out.power.phase1 * 1000;
    } else {
      out.phase1 = out.phase1 ?? 0;
    }
    if (out.kW2 != null) {
      out.phase2 = out.kW2 * 1000;
    } else if (out.power?.phase2 != null) {
      out.phase2 = out.power.phase2 * 1000;
    } else {
      out.phase2 = out.phase2 ?? 0;
    }
    if (out.kW3 != null) {
      out.phase3 = out.kW3 * 1000;
    } else if (out.power?.phase3 != null) {
      out.phase3 = out.power.phase3 * 1000;
    } else {
      out.phase3 = out.phase3 ?? 0;
    }

    // Energy
    if (out.energyAccumulated == null) {
      out.energyAccumulated = {
        daily: out.daily ?? 0,
        monthly: out.monthly ?? 0,
        yearly: out.yearly ?? 0,
        // ✅ NEW: Meter total from Ep_total ÷ 10 (real-time from MQTT)
        meterTotal: out.Ep_total != null ? out.Ep_total / 10 : 0
      };
    }

    // ✅ Also set meterTotal at top level for easy access
    out.meterTotal = out.Ep_total != null ? out.Ep_total / 10 : out.meterTotal ?? 0;

    return out;
  };

  // Detect if payload looks like energy data (for real-time updates even without explicit messageType)
  const isEnergyPayload = (data: any): boolean => {
    if (!data || typeof data !== 'object') return false;
    const keys = ['kWsum', 'kW1', 'kW2', 'kW3', 'V1', 'F1', 'f1', 'current', 'voltage', 'power', 'powerFactor', 'Ep_total', 'daily'];
    return keys.some(k => k in data);
  };

  // Handle WebSocket messages
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    // Handle connection status messages
    const unsubStatus = webSocketClient.on('mqtt_status', (message: WebSocketMessage) => {
      if (message.status === 'connected') {
        setConnectionStatus('connected');
        setIsConnected(true);
        setError(null);
      } else if (message.status === 'offline' || message.status === 'disconnected') {
        setConnectionStatus('disconnected');
        setIsConnected(false);
        // Reset ค่าเป็น 0 เมื่อ offline
        setEnergyData({
          timestamp: new Date().toISOString(),
          voltage: { f1: 0, f2: 0, f3: 0 },
          current: { i1: 0, i2: 0, i3: 0 },
          powerFactor: { pf1: 0, pf2: 0, pf3: 0 },
          energyAccumulated: { daily: 0, monthly: 0, yearly: 0, meterTotal: 0 },
          power: { total: 0, phase1: 0, phase2: 0, phase3: 0 }
        });
      } else if (message.status === 'reconnecting') {
        setConnectionStatus('connecting');
        setIsConnected(false);
      } else if (message.status === 'error') {
        setConnectionStatus('error');
        setIsConnected(false);
        setError(message.error || 'Unknown error');
      }
    });
    unsubscribers.push(unsubStatus);

    // Handle energy data messages
    const unsubData = webSocketClient.on('mqtt_message', (message: WebSocketMessage) => {
      if (message.data && (message.messageType === 'energy_data' || isEnergyPayload(message.data))) {
        const normalized = normalizeData(message.data);

        setEnergyData(prev => ({
          timestamp: normalized.timestamp || new Date().toISOString(),
          voltage: {
            f1: normalized.f1 ?? prev?.voltage?.f1 ?? 0,
            f2: normalized.f2 ?? prev?.voltage?.f2 ?? 0,
            f3: normalized.f3 ?? prev?.voltage?.f3 ?? 0
          },
          current: {
            i1: normalized.i1 ?? prev?.current?.i1 ?? 0,
            i2: normalized.i2 ?? prev?.current?.i2 ?? 0,
            i3: normalized.i3 ?? prev?.current?.i3 ?? 0
          },
          powerFactor: {
            pf1: normalized.pf1 ?? prev?.powerFactor?.pf1 ?? 0,
            pf2: normalized.pf2 ?? prev?.powerFactor?.pf2 ?? 0,
            pf3: normalized.pf3 ?? prev?.powerFactor?.pf3 ?? 0
          },
          energyAccumulated: {
            daily: normalized.daily ?? normalized.energyAccumulated?.daily ?? prev?.energyAccumulated?.daily ?? 0,
            monthly: normalized.monthly ?? normalized.energyAccumulated?.monthly ?? prev?.energyAccumulated?.monthly ?? 0,
            yearly: normalized.yearly ?? normalized.energyAccumulated?.yearly ?? prev?.energyAccumulated?.yearly ?? 0,
            meterTotal: normalized.meterTotal ?? normalized.energyAccumulated?.meterTotal ?? prev?.energyAccumulated?.meterTotal ?? 0
          },
          // Map power from MQTT: kW -> W (handled in normalizeData)
          power: {
            total: normalized.total ?? prev?.power?.total ?? 0,
            phase1: normalized.phase1 ?? prev?.power?.phase1 ?? 0,
            phase2: normalized.phase2 ?? prev?.power?.phase2 ?? 0,
            phase3: normalized.phase3 ?? prev?.power?.phase3 ?? 0
          }
        }));

        setLastUpdate(new Date());
      } else if (message.messageType === 'alert' && message.data) {
        setAlerts(prev => {
          const newAlert = {
            id: Date.now().toString(),
            ...message.data,
            timestamp: message.data.timestamp || new Date().toISOString()
          };
          return [newAlert, ...prev].slice(0, 10);
        });
      } else if (
        (message.messageType === 'esp_status' && message.data) ||
        (message.messageType === 'status' && message.data && typeof message.data === 'object' && ('ssid' in message.data || 'heap_free_kb' in message.data)) ||
        (message.data && typeof message.data === 'object' && ('ssid' in message.data || 'heap_free_kb' in message.data))
      ) {
        try {
          const data = message.data as any;
          setEspStatus({
            ssid: data.ssid,
            ip: data.ip,
            mac: data.mac,
            fw_version: data.fw_version || data.fw_current_version,
            heap_free_kb: typeof data.heap_free_kb === 'number' ? data.heap_free_kb : Number(data.heap_free_kb),
            cpu_freq_mhz: data.cpu_freq_mhz,
            uptime_sec: data.uptime_sec,
            timestamp: data.timestamp,
            receivedAt: new Date()
          });
        } catch (e) {
          console.warn('Failed to parse ESP status message', e);
        }
      }

      // Handle energy_state messages from backend (realtime delta energy)
      if (message.energyState) {
        const state = message.energyState;
        setEnergyData(prev => ({
          ...prev!,
          timestamp: state.lastUpdate || new Date().toISOString(),
          energyAccumulated: {
            daily: state.daily ?? prev?.energyAccumulated?.daily ?? 0,
            monthly: state.monthly ?? prev?.energyAccumulated?.monthly ?? 0,
            yearly: state.yearly ?? prev?.energyAccumulated?.yearly ?? 0,
            meterTotal: state.meterTotal ?? prev?.energyAccumulated?.meterTotal ?? 0  // ✅ NEW
          }
        }));
        console.log(`⚡ Energy State Update: Daily=${state.daily?.toFixed(2)}, Monthly=${state.monthly?.toFixed(2)}, Meter=${state.meterTotal?.toFixed(2)} kWh`);
      }
    });
    unsubscribers.push(unsubData);

    // Handle connection/disconnection
    const unsubConnected = webSocketClient.on('connected', () => {
      setConnectionStatus('connected');
      setIsConnected(true);
      setError(null);
    });
    unsubscribers.push(unsubConnected);

    // Cleanup
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  // Update history when energyData changes
  useEffect(() => {
    if (!energyData) return;

    const now = Date.now();
    // เพิ่มเป็น 1000ms (1 วินาที) เพื่อความนิ่ง
    if (now - lastSampleRef.current < 1000) return;
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
        total: energyData.power?.total ?? last?.total ?? 0,
        phase1: energyData.power?.phase1 ?? last?.phase1 ?? 0,
        phase2: energyData.power?.phase2 ?? last?.phase2 ?? 0,
        phase3: energyData.power?.phase3 ?? last?.phase3 ?? 0
      };

      const cutoff = now - retentionHours * 60 * 60 * 1000;
      const trimmed = prev.filter(s => s.ts >= cutoff);

      // จำกัดจำนวนจุดสูงสุดที่ 300 จุด เพื่อความเร็ว
      if (trimmed.length >= 300) {
        trimmed.shift(); // ลบจุดเก่าสุดออก
      }

      trimmed.push(sample);
      return trimmed;
    });
  }, [energyData, retentionHours]);

  // Handle page visibility changes (mobile fix)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('Page hidden - keeping WebSocket alive');
        // Don't disconnect, just log
      } else {
        console.log('Page visible - checking connection');
        // Check actual connection state, not React state (may be stale)
        const wsState = webSocketClient.getReadyState();
        if (wsState !== WebSocket.OPEN && wsState !== WebSocket.CONNECTING && autoConnect) {
          connect();
        }
      }
    };

    // Handle focus/blur events for mobile
    const handleFocus = () => {
      console.log('Window focused - checking connection');
      // Check actual connection state
      const wsState = webSocketClient.getReadyState();
      if (wsState !== WebSocket.OPEN && wsState !== WebSocket.CONNECTING && autoConnect) {
        connect();
      }
    };

    const handleBlur = () => {
      console.log('Window blurred - keeping connection alive');
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]); // Remove connect to prevent infinite loop

  // Auto-connect on mount (only once)
  useEffect(() => {
    let mounted = true;
    if (autoConnect) {
      // Attempt backend port detection first to avoid wrong port HTML responses
      detectBackendPort().finally(() => {
        if (mounted) connect();
      });
    }
    return () => {
      mounted = false;
      webSocketClient.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contextValue: WebSocketContextType = {
    isConnected,
    connectionStatus,
    energyData,
    lastUpdate,
    alerts,
    history,
    espStatus,
    connect,
    disconnect,
    sendCommand,
    error
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export default WebSocketProvider;
