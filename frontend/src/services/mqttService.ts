import mqttConnection, { ConnectionStatus } from './mqttConnection';
import mqttConfig from '../config/mqttConfig';

const DEBUG_LOGS = false;

export interface EnergyData {
  timestamp: string;
  voltage: { f1: number; f2: number; f3: number; };
  current: { i1: number; i2: number; i3: number; };
  powerFactor: { pf1: number; pf2: number; pf3: number; };
  energyAccumulated: { daily: number; monthly: number; yearly: number; };
  power: { total: number; phase1: number; phase2: number; phase3: number; };
}

class MqttService {
  private listeners: Map<string, Array<(data: any) => void>> = new Map();
  private unsubscribers: Array<() => void> = [];

  private normalizeData(data: any): any {
    const out = { ...data };
    out.f1 = out.f1 ?? out.F1 ?? out.V1 ?? out.voltage?.f1 ?? out.voltage?.F1 ?? out.voltage?.V1;
    out.f2 = out.f2 ?? out.F2 ?? out.V2 ?? out.voltage?.f2 ?? out.voltage?.F2 ?? out.voltage?.V2;
    out.f3 = out.f3 ?? out.F3 ?? out.V3 ?? out.voltage?.f3 ?? out.voltage?.F3 ?? out.voltage?.V3;
    out.i1 = out.i1 ?? out.I1 ?? out.current?.i1 ?? out.current?.I1;
    out.i2 = out.i2 ?? out.I2 ?? out.current?.i2 ?? out.current?.I2;
    out.i3 = out.i3 ?? out.I3 ?? out.current?.i3 ?? out.current?.I3;
    out.pf1 = out.pf1 ?? out.PF1 ?? out.powerFactor?.pf1 ?? out.powerFactor?.PF1;
    out.pf2 = out.pf2 ?? out.PF2 ?? out.powerFactor?.pf2 ?? out.powerFactor?.PF2;
    out.pf3 = out.pf3 ?? out.PF3 ?? out.powerFactor?.pf3 ?? out.powerFactor?.PF3;
    if (out.Hz && !out.frequency) out.frequency = out.Hz;
    if (out.energyAccumulated == null) {
      out.energyAccumulated = { daily: out.daily ?? out.Ep_total ?? 0, monthly: out.monthly ?? 0, yearly: out.yearly ?? 0 };
    }
    return out;
  }

  async connect(): Promise<void> {
    if (DEBUG_LOGS) console.log('MQTT Service connecting');
    await mqttConnection.connect();
    this.setupMessageHandlers();
  }

  private setupMessageHandlers(): void {
    const topics = mqttConfig.topics;
    this.unsubscribers.push(mqttConnection.onMessage(topics.data, (t, m) => this.handleDataMessage(t, m)));
    this.unsubscribers.push(mqttConnection.onMessage(topics.alerts, (t, m) => this.handleAlertMessage(t, m)));
    this.unsubscribers.push(mqttConnection.onMessage(topics.status, (t, m) => this.handleStatusMessage(t, m)));
  }

  private handleDataMessage(topic: string, message: any): void {
    try {
      const data = this.normalizeData(message);
      if (!data.timestamp) data.timestamp = new Date().toISOString();
      if (data.voltage || data.f1 !== undefined) this.emit('voltage', data);
      if (data.current || data.i1 !== undefined) this.emit('current', data);
      if (data.powerFactor || data.pf1 !== undefined) this.emit('powerFactor', data);
      if (data.energy || data.daily !== undefined) this.emit('energy', data);
      this.emit('data', data);
    } catch (error) {
      console.error('Failed to handle MQTT message:', error);
    }
  }

  private handleAlertMessage(topic: string, message: any): void {
    this.emit('alerts', message);
  }

  private handleStatusMessage(topic: string, message: any): void {
    this.emit('status', message);
  }

  private emit(eventType: string, data: any): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) callbacks.forEach((callback) => callback(data));
  }

  subscribe(eventType: string, callback: (data: any) => void): void {
    if (!this.listeners.has(eventType)) this.listeners.set(eventType, []);
    this.listeners.get(eventType)!.push(callback);
  }

  unsubscribe(eventType: string, callback?: (data: any) => void): void {
    if (callback) {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
      }
    } else {
      this.listeners.delete(eventType);
    }
  }

  publish(topic: string, message: any): void {
    mqttConnection.publish(topic, message);
  }

  isClientConnected(): boolean {
    return mqttConnection.getStatus().isConnected;
  }

  getConnectionStatus(): boolean {
    return mqttConnection.getStatus().isConnected;
  }

  getConnectionInfo(): any {
    const status = mqttConnection.getStatus();
    return {
      ...status,
      config: mqttConfig.getDebugInfo(),
      activeListeners: Array.from(this.listeners.keys()).map((eventType) => ({
        eventType,
        listenerCount: this.listeners.get(eventType)?.length || 0,
      })),
    };
  }

  onConnectionChange(callback: (status: ConnectionStatus) => void): () => void {
    return mqttConnection.onConnectionChange(callback);
  }

  disconnect(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.listeners.clear();
    mqttConnection.disconnect();
  }

  sendCommand(device: string, command: string, value?: any): void {
    const commandTopic = mqttConfig.topics.commands 
      ? `${mqttConfig.topics.commands}/${device}` 
      : `energy/control/${device}`;
    const payload = { command, value, timestamp: new Date().toISOString() };
    this.publish(commandTopic, payload);
  }

  onVoltageData(callback: (data: any) => void): void { this.subscribe('voltage', callback); }
  onCurrentData(callback: (data: any) => void): void { this.subscribe('current', callback); }
  onPowerFactorData(callback: (data: any) => void): void { this.subscribe('powerFactor', callback); }
  onEnergyData(callback: (data: any) => void): void { this.subscribe('energy', callback); }
  onAlerts(callback: (data: any) => void): void { this.subscribe('alerts', callback); }
  onStatusData(callback: (data: any) => void): void { this.subscribe('status', callback); }
  onDataUpdate(callback: (data: any) => void): void { this.subscribe('data', callback); }
}

export const mqttService = new MqttService();
export default MqttService;
