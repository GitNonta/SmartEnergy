// MQTT Configuration from environment variables

export interface MqttBrokerConfig {
  host: string;
  port: number;
  protocol: 'ws' | 'wss';
  wsPath?: string;
  wsUrl?: string;
  username?: string;
  password?: string;
  clientId?: string;
  reconnectPeriod?: number;
  connectTimeout?: number;
}

export interface MqttTopicsConfig {
  data: string;
  alerts: string;
  status: string;
  commands: string;
}

export interface AppConfig {
  autoConnect: boolean;
  historyRetentionHours: number;
}

class Config {
  private static instance: Config;

  // MQTT Broker Settings
  public readonly broker: MqttBrokerConfig = {
    host: import.meta.env.VITE_MQTT_BROKER_HOST || '202.29.50.41',
    port: parseInt(import.meta.env.VITE_MQTT_BROKER_PORT || '9001', 10),
    protocol: (import.meta.env.VITE_MQTT_PROTOCOL || 'ws') as 'ws' | 'wss',
    wsPath: import.meta.env.VITE_MQTT_WS_PATH || '/mqtt',
    username: import.meta.env.VITE_MQTT_USERNAME,
    password: import.meta.env.VITE_MQTT_PASSWORD,
    reconnectPeriod: parseInt(import.meta.env.VITE_RECONNECT_PERIOD || '5000', 10),
    connectTimeout: parseInt(import.meta.env.VITE_CONNECT_TIMEOUT || '30000', 10),
  };

  // MQTT Topics
  public readonly topics: MqttTopicsConfig = {
    data: import.meta.env.VITE_MQTT_TOPIC_DATA || 'AI205/data',
    alerts: import.meta.env.VITE_MQTT_TOPIC_ALERTS || 'AI205/alerts',
    status: import.meta.env.VITE_MQTT_TOPIC_STATUS || 'AI205/status',
    commands: import.meta.env.VITE_MQTT_TOPIC_COMMANDS || 'AI205/commands',
  };

  // Application Settings
  public readonly app: AppConfig = {
    autoConnect: import.meta.env.VITE_AUTO_CONNECT === 'true',
    historyRetentionHours: parseInt(import.meta.env.VITE_HISTORY_RETENTION_HOURS || '24', 10),
  };

  private constructor() {
    // Singleton pattern
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  // Helper method to get full MQTT broker config
  public getMqttConfig(clientId?: string): MqttBrokerConfig {
    return {
      ...this.broker,
      clientId: clientId || `smart-dashboard-${Math.random().toString(16).substring(2, 10)}`,
    };
  }

  // Validation
  public validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.broker.host) {
      errors.push('MQTT broker host is required');
    }

    if (this.broker.port <= 0 || this.broker.port > 65535) {
      errors.push('MQTT broker port must be between 1 and 65535');
    }

    if (!['ws', 'wss'].includes(this.broker.protocol)) {
      errors.push('MQTT protocol must be "ws" or "wss"');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Debug info (sanitized)
  public getDebugInfo(): object {
    return {
      broker: {
        host: this.broker.host,
        port: this.broker.port,
        protocol: this.broker.protocol,
        wsPath: this.broker.wsPath,
        hasUsername: !!this.broker.username,
        hasPassword: !!this.broker.password,
      },
      topics: this.topics,
      app: this.app,
    };
  }
}

export default Config.getInstance();
