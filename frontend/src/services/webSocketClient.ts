// WebSocket configuration
import { getWsUrl } from '../config/api';
let WS_URL = getWsUrl();
const INITIAL_RECONNECT_INTERVAL = 3000; // 3 seconds
const MAX_RECONNECT_INTERVAL = 60000; // 60 seconds max (exponential backoff)
const RECONNECT_BACKOFF_MULTIPLIER = 2; // Double each attempt
const HEARTBEAT_INTERVAL = 20000; // 20 seconds
const HEARTBEAT_TIMEOUT_MULTIPLIER = 5; // 100 seconds before considering dead

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface WebSocketConfig {
  url?: string;
  autoReconnect?: boolean;
  heartbeat?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
}

class WebSocketClient {
  private static instance: WebSocketClient;
  private ws: WebSocket | null = null;
  private config: WebSocketConfig = {};
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private isIntentionalClose = false;
  private reconnectAttempts = 0;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private lastPongTime = Date.now();
  private isConnecting = false; // Connection lock to prevent race conditions

  private constructor() {
    // Monitor page visibility for mobile
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.ws?.readyState !== WebSocket.OPEN) {
          console.log('Page visible - checking connection...');
          // ป้องกันการ reconnect ซ้ำซ้อนเมื่อมี reconnectTimeout รออยู่แล้ว
          if (!this.isIntentionalClose && this.config.autoReconnect && !this.reconnectTimeout) {
            this.reconnect();
          }
        }
      });
    }
  }

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  // Connect to WebSocket server
  public connect(config: WebSocketConfig = {}): void {
    // Connection lock - prevent race conditions
    if (this.isConnecting) {
      console.warn('WebSocket: Connection already in progress (locked)');
      return;
    }

    this.config = {
      url: WS_URL,
      autoReconnect: true,
      heartbeat: true,
      ...config
    };

    this.isIntentionalClose = false;

    // ป้องกันการเชื่อมต่อซ้ำซ้อน
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.warn('WebSocket: Already connected');
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      console.warn('WebSocket: Connection already in progress');
      return;
    }

    // ยกเลิก reconnect timeout ที่รออยู่
    this.clearReconnectTimeout();
    this.isConnecting = true;

    try {
      console.log(`WebSocket: Connecting to ${this.config.url}...`);
      this.ws = new WebSocket(this.config.url!);

      this.ws.onopen = () => {
        console.log('✅ WebSocket: Connected');
        this.clearReconnectTimeout();
        // If backend port was detected late, refresh base URL for future reconnects
        WS_URL = getWsUrl();
        this.clearConnectionTimeout();
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();
        this.isConnecting = false; // Release connection lock
        this.config.onOpen?.();
        
        if (this.config.heartbeat) {
          this.startHeartbeat();
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket: Disconnected', event.code, event.reason);
        this.stopHeartbeat();
        this.clearConnectionTimeout();
        this.isConnecting = false; // Release connection lock
        this.config.onClose?.();
        
        // Auto-reconnect if not intentional close
        if (!this.isIntentionalClose && this.config.autoReconnect) {
          this.reconnectAttempts++;
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket: Error', error);
        this.clearConnectionTimeout();
        this.isConnecting = false; // Release connection lock
        this.config.onError?.(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Update last pong time if heartbeat response
          if (message.type === 'pong') {
            this.lastPongTime = Date.now();
          }
          
          // Call global message handler
          this.config.onMessage?.(message);
          
          // Call type-specific handlers
          const handlers = this.messageHandlers.get(message.type);
          if (handlers) {
            handlers.forEach(handler => handler(message));
          }
          
          // Call wildcard handlers
          const wildcardHandlers = this.messageHandlers.get('*');
          if (wildcardHandlers) {
            wildcardHandlers.forEach(handler => handler(message));
          }
        } catch (error) {
          console.error('WebSocket: Failed to parse message', error);
        }
      };
    } catch (error) {
      console.error('WebSocket: Connection failed', error);
      this.isConnecting = false; // Release connection lock
      if (this.config.autoReconnect) {
        this.reconnectAttempts++;
        this.scheduleReconnect();
      }
    }
  }

  // Disconnect from WebSocket server
  public disconnect(): void {
    this.isIntentionalClose = true;
    this.clearReconnectTimeout();
    this.stopHeartbeat();
    this.isConnecting = false; // Release connection lock
    this.reconnectAttempts = 0; // Reset attempts
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    console.log('WebSocket: Disconnected intentionally');
  }

  // Send message
  public send(message: WebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket: Cannot send message - not connected');
    }
  }

  // Register message handler for specific message type
  public on(messageType: string, handler: (data: any) => void): () => void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, new Set());
    }
    
    this.messageHandlers.get(messageType)!.add(handler);
    
    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(messageType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(messageType);
        }
      }
    };
  }

  // Remove message handler
  public off(messageType: string, handler?: (data: any) => void): void {
    if (handler) {
      const handlers = this.messageHandlers.get(messageType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(messageType);
        }
      }
    } else {
      this.messageHandlers.delete(messageType);
    }
  }

  // Get connection status
  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Get ready state
  public getReadyState(): number | null {
    return this.ws?.readyState ?? null;
  }

  // Private: Schedule reconnect with exponential backoff
  private scheduleReconnect(): void {
    this.clearReconnectTimeout();
    
    // Exponential backoff: 3s, 6s, 12s, 24s, 48s, 60s (max)
    const delay = Math.min(
      INITIAL_RECONNECT_INTERVAL * Math.pow(RECONNECT_BACKOFF_MULTIPLIER, this.reconnectAttempts),
      MAX_RECONNECT_INTERVAL
    );
    
    console.log(`WebSocket: Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts + 1})...`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.config);
    }, delay);
  }

  // Private: Clear reconnect timeout
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // Private: Clear connection timeout
  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  // Private: Start heartbeat with health check
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        // Check if last pong was too long ago (5x interval = 100 seconds)
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > HEARTBEAT_INTERVAL * HEARTBEAT_TIMEOUT_MULTIPLIER) {
          console.warn(`WebSocket: No pong received for ${timeSinceLastPong / 1000}s, reconnecting...`);
          // ใช้ scheduleReconnect แทน reconnect เพื่อป้องกันซ้ำซ้อน
          if (!this.reconnectTimeout && !this.isIntentionalClose && this.config.autoReconnect && !this.isConnecting) {
            this.ws?.close(); // ปิดการเชื่อมต่อเดิม
          }
          return;
        }
        
        this.send({ type: 'ping' });
      } else if (!this.isIntentionalClose && this.config.autoReconnect && !this.reconnectTimeout && !this.isConnecting) {
        // เพิ่มการตรวจสอบ reconnectTimeout และ isConnecting เพื่อป้องกัน reconnect ซ้ำซ้อน
        console.log('WebSocket: Not connected during heartbeat, will auto-reconnect...');
      }
    }, HEARTBEAT_INTERVAL);
  }

  // Private: Stop heartbeat
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Public: Force reconnect
  public reconnect(): void {
    // ป้องกันการ reconnect ซ้ำซ้อน
    if (this.reconnectTimeout || this.isConnecting) {
      console.log('WebSocket: Reconnect already in progress, skipping...');
      return;
    }
    
    console.log('WebSocket: Force reconnect...');
    this.isIntentionalClose = true; // ป้องกัน auto-reconnect ในระหว่าง disconnect
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.stopHeartbeat();
    this.clearReconnectTimeout();
    this.clearConnectionTimeout();
    this.isConnecting = false;
    this.reconnectAttempts = 0; // Reset attempts on manual reconnect
    
    // Reconnect หลังจาก 1 วินาที
    this.reconnectTimeout = setTimeout(() => {
      this.isIntentionalClose = false;
      this.connect(this.config);
    }, 1000);
  }

  // Request server status
  public requestStatus(): void {
    this.send({ type: 'get_status' });
  }

  // Send MQTT command through WebSocket
  public sendMqttCommand(topic: string, payload: any): void {
    this.send({
      type: 'mqtt_command',
      topic,
      payload
    });
  }
}

export default WebSocketClient.getInstance();
