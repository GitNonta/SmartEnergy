import mqtt, { MqttClient } from 'mqtt';
import mqttConfig, { MqttBrokerConfig } from '../config/mqttConfig';

export interface ConnectionStatus {
  isConnected: boolean;
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  error?: string;
  lastConnected?: Date;
  reconnectAttempts: number;
}

export type ConnectionCallback = (status: ConnectionStatus) => void;
export type MessageCallback = (topic: string, message: any) => void;

class MqttConnection {
  private static instance: MqttConnection;
  private client: MqttClient | null = null;
  private connectionStatus: ConnectionStatus = {
    isConnected: false,
    status: 'disconnected',
    reconnectAttempts: 0,
  };
  
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private messageCallbacks: Map<string, Set<MessageCallback>> = new Map();

  private constructor() {}

  public static getInstance(): MqttConnection {
    if (!MqttConnection.instance) {
      MqttConnection.instance = new MqttConnection();
    }
    return MqttConnection.instance;
  }

  // Connect to MQTT broker
  public async connect(config?: MqttBrokerConfig): Promise<void> {
    if (this.client?.connected) {
      console.warn('MQTT: Already connected');
      return;
    }

    const brokerConfig = config || mqttConfig.getMqttConfig();
    
    // Validate configuration
    const validation = mqttConfig.validate();
    if (!validation.isValid) {
      const error = `MQTT Config Error: ${validation.errors.join(', ')}`;
      this.updateStatus({ status: 'error', error, isConnected: false });
      throw new Error(error);
    }

    return new Promise((resolve, reject) => {
      try {
        this.updateStatus({ status: 'connecting', isConnected: false });

        // Build WebSocket URL
        const { protocol, host, port, wsPath } = brokerConfig;
        let brokerUrl = `${protocol}://${host}:${port}`;
        if (wsPath) {
          brokerUrl += wsPath.startsWith('/') ? wsPath : `/${wsPath}`;
        }

        console.log(`MQTT: Connecting to ${brokerUrl}`);

        // Connection options
        const options: mqtt.IClientOptions = {
          clientId: brokerConfig.clientId,
          clean: true,
          reconnectPeriod: brokerConfig.reconnectPeriod || 5000,
          connectTimeout: brokerConfig.connectTimeout || 30000,
        };

        if (brokerConfig.username && brokerConfig.password) {
          options.username = brokerConfig.username;
          options.password = brokerConfig.password;
        }

        // Create MQTT client
        this.client = mqtt.connect(brokerUrl, options);

        // Event: Connected
        this.client.on('connect', () => {
          console.log('MQTT: Connected successfully');
          this.updateStatus({
            status: 'connected',
            isConnected: true,
            lastConnected: new Date(),
            reconnectAttempts: 0,
          });
          
          // Auto-subscribe to configured topics
          this.autoSubscribeTopics();
          
          resolve();
        });

        // Event: Error
        this.client.on('error', (error) => {
          console.error('MQTT: Connection error', error);
          this.updateStatus({
            status: 'error',
            error: error.message,
            isConnected: false,
          });
          reject(error);
        });

        // Event: Offline
        this.client.on('offline', () => {
          console.warn('MQTT: Offline');
          this.updateStatus({
            status: 'disconnected',
            isConnected: false,
          });
        });

        // Event: Reconnect
        this.client.on('reconnect', () => {
          console.log('MQTT: Reconnecting...');
          this.updateStatus((prev) => ({
            status: 'reconnecting',
            isConnected: false,
            reconnectAttempts: prev.reconnectAttempts + 1,
          }));
        });

        // Event: Message
        this.client.on('message', (topic, payload) => {
          this.handleMessage(topic, payload);
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.updateStatus({ status: 'error', error: errorMsg, isConnected: false });
        reject(error);
      }
    });
  }

  // Disconnect from broker
  public disconnect(): void {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.updateStatus({
        status: 'disconnected',
        isConnected: false,
        reconnectAttempts: 0,
      });
      console.log('MQTT: Disconnected');
    }
  }

  // Subscribe to topic
  public subscribe(topic: string, callback?: MessageCallback): void {
    if (!this.client?.connected) {
      console.warn(`MQTT: Cannot subscribe to ${topic} - not connected`);
      return;
    }

    this.client.subscribe(topic, (err) => {
      if (err) {
        console.error(`MQTT: Subscribe error for ${topic}:`, err);
      } else {
        console.log(`MQTT: Subscribed to ${topic}`);
        
        if (callback) {
          if (!this.messageCallbacks.has(topic)) {
            this.messageCallbacks.set(topic, new Set());
          }
          this.messageCallbacks.get(topic)!.add(callback);
        }
      }
    });
  }

  // Unsubscribe from topic
  public unsubscribe(topic: string): void {
    if (this.client?.connected) {
      this.client.unsubscribe(topic);
      this.messageCallbacks.delete(topic);
      console.log(`MQTT: Unsubscribed from ${topic}`);
    }
  }

  // Publish message
  public publish(topic: string, message: any): void {
    if (!this.client?.connected) {
      console.warn(`MQTT: Cannot publish to ${topic} - not connected`);
      return;
    }

    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    this.client.publish(topic, payload, (err) => {
      if (err) {
        console.error(`MQTT: Publish error for ${topic}:`, err);
      }
    });
  }

  // Register connection status listener
  public onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    // Return unsubscribe function
    return () => {
      this.connectionCallbacks.delete(callback);
    };
  }

  // Register message listener
  public onMessage(topic: string, callback: MessageCallback): () => void {
    if (!this.messageCallbacks.has(topic)) {
      this.messageCallbacks.set(topic, new Set());
    }
    this.messageCallbacks.get(topic)!.add(callback);
    
    // Auto-subscribe if connected
    if (this.client?.connected) {
      this.subscribe(topic);
    }
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.messageCallbacks.get(topic);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.unsubscribe(topic);
          this.messageCallbacks.delete(topic);
        }
      }
    };
  }

  // Get current status
  public getStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  // Private: Update connection status
  private updateStatus(
    update: Partial<ConnectionStatus> | ((prev: ConnectionStatus) => Partial<ConnectionStatus>)
  ): void {
    const changes = typeof update === 'function' ? update(this.connectionStatus) : update;
    this.connectionStatus = { ...this.connectionStatus, ...changes };
    
    // Notify listeners
    this.connectionCallbacks.forEach((callback) => {
      callback(this.connectionStatus);
    });
  }

  // Private: Handle incoming messages
  private handleMessage(topic: string, payload: Buffer): void {
    try {
      const message = JSON.parse(payload.toString());
      
      // Call topic-specific callbacks
      const callbacks = this.messageCallbacks.get(topic);
      if (callbacks) {
        callbacks.forEach((callback) => callback(topic, message));
      }
      
      // Call wildcard callbacks (if any)
      this.messageCallbacks.forEach((callbacks, registeredTopic) => {
        if (registeredTopic.includes('+') || registeredTopic.includes('#')) {
          if (this.topicMatches(topic, registeredTopic)) {
            callbacks.forEach((callback) => callback(topic, message));
          }
        }
      });
      
    } catch (error) {
      console.error('MQTT: Error parsing message:', error);
    }
  }

  // Private: Auto-subscribe to configured topics
  private autoSubscribeTopics(): void {
    const { topics } = mqttConfig;
    
    if (topics.data) this.subscribe(topics.data);
    if (topics.alerts) this.subscribe(topics.alerts);
    if (topics.status) this.subscribe(topics.status);
  }

  // Private: Check if topic matches pattern (basic implementation)
  private topicMatches(topic: string, pattern: string): boolean {
    const topicParts = topic.split('/');
    const patternParts = pattern.split('/');
    
    if (patternParts[patternParts.length - 1] === '#') {
      return topic.startsWith(pattern.slice(0, -2));
    }
    
    if (topicParts.length !== patternParts.length) {
      return false;
    }
    
    return patternParts.every((part, i) => 
      part === '+' || part === topicParts[i]
    );
  }
}

export default MqttConnection.getInstance();
