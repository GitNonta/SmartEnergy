import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import {
  Activity,
  Database,
  MessageSquare,
  Zap,
  AlertTriangle,
  Clock,
  Server,
  Wifi,
  Copy,
  Trash2
} from 'lucide-react';

interface RawMessage {
  id: string;
  topic: string;
  timestamp: Date;
  payload: any;
  parsed: boolean;
}

const MqttDebugPanel: React.FC = () => {
  const { isConnected, connectionStatus, energyData, lastUpdate, error } = useWebSocket();
  const [rawMessages, setRawMessages] = useState<RawMessage[]>([]);
  const [showRawData, setShowRawData] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Mock MQTT message listener for debugging
  useEffect(() => {
    if (isConnected) {
      // This would be replaced with actual MQTT message listener
      const interval = setInterval(() => {
        // Simulate receiving a message from AI205/data
        const mockMessage: RawMessage = {
          id: Date.now().toString(),
          topic: 'AI205/data',
          timestamp: new Date(),
          payload: {
            timestamp: new Date().toISOString(),
            device_id: 'AI205',
            f1: 230 + Math.random() * 4 - 2,
            f2: 230 + Math.random() * 4 - 2,
            f3: 230 + Math.random() * 4 - 2,
            i1: 15 + Math.random() * 2 - 1,
            i2: 15 + Math.random() * 2 - 1,
            i3: 15 + Math.random() * 2 - 1,
            pf1: 0.95 + Math.random() * 0.1 - 0.05,
            pf2: 0.95 + Math.random() * 0.1 - 0.05,
            pf3: 0.95 + Math.random() * 0.1 - 0.05,
            daily: 125.6,
            monthly: 3768.4,
            yearly: 45220.8
          },
          parsed: true
        };

        setRawMessages(prev => {
          const newMessages = [mockMessage, ...prev].slice(0, 50); // Keep last 50 messages
          return newMessages;
        });
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [isConnected]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const clearMessages = () => {
    setRawMessages([]);
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'text-green-600';
      case 'connecting':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Activity className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">MQTT Debug Panel</h2>
        </div>
        <div className="flex items-center space-x-2">
          <Wifi className={`w-5 h-5 ${getStatusColor()}`} />
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {connectionStatus.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Connection Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <Server className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-600">Connection</span>
          </div>
          <div className="text-lg font-semibold">
            {isConnected ? '✅ Connected' : '❌ Disconnected'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Broker: 202.29.50.41:1883
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <MessageSquare className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-600">Messages</span>
          </div>
          <div className="text-lg font-semibold">
            {rawMessages.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Topic: AI205/data
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <Clock className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-600">Last Update</span>
          </div>
          <div className="text-lg font-semibold">
            {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {lastUpdate ? `${Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s ago` : 'No data'}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-red-800 font-medium">Connection Error</span>
          </div>
          <div className="text-red-700 text-sm mt-1">{error}</div>
        </div>
      )}

      {/* Current Energy Data */}
      {energyData && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Current Energy Data</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-600">Voltage</span>
              </div>
              <div className="space-y-1">
                <div className="text-sm">F1: {energyData.voltage.f1.toFixed(1)}V</div>
                <div className="text-sm">F2: {energyData.voltage.f2.toFixed(1)}V</div>
                <div className="text-sm">F3: {energyData.voltage.f3.toFixed(1)}V</div>
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Activity className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-600">Current</span>
              </div>
              <div className="space-y-1">
                <div className="text-sm">I1: {energyData.current.i1.toFixed(2)}A</div>
                <div className="text-sm">I2: {energyData.current.i2.toFixed(2)}A</div>
                <div className="text-sm">I3: {energyData.current.i3.toFixed(2)}A</div>
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Database className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-600">Power Factor</span>
              </div>
              <div className="space-y-1">
                <div className="text-sm">PF1: {energyData.powerFactor.pf1.toFixed(3)}</div>
                <div className="text-sm">PF2: {energyData.powerFactor.pf2.toFixed(3)}</div>
                <div className="text-sm">PF3: {energyData.powerFactor.pf3.toFixed(3)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Raw Messages */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-gray-900">Raw MQTT Messages</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowRawData(!showRawData)}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
            >
              {showRawData ? 'Hide' : 'Show'} Raw Data
            </button>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-3 py-1 text-sm rounded-md ${autoScroll
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Auto Scroll: {autoScroll ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={clearMessages}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 flex items-center space-x-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto bg-gray-50 rounded-lg p-4">
          {rawMessages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <div>No MQTT messages received yet</div>
              <div className="text-sm mt-1">Connect to MQTT broker to see live data</div>
            </div>
          ) : (
            <div className="space-y-3">
              {rawMessages.map((message) => (
                <div key={message.id} className="bg-white p-3 rounded border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                        {message.topic}
                      </span>
                      <span className="text-xs text-gray-500">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                      {message.parsed && (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                          ✓ Parsed
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(message.payload, null, 2))}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  {showRawData && (
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(message.payload, null, 2)}
                    </pre>
                  )}

                  {!showRawData && (
                    <div className="text-sm text-gray-700">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <span className="font-medium">Voltage:</span>
                          {message.payload.f1 && ` ${message.payload.f1.toFixed(1)}V`}
                        </div>
                        <div>
                          <span className="font-medium">Current:</span>
                          {message.payload.i1 && ` ${message.payload.i1.toFixed(2)}A`}
                        </div>
                        <div>
                          <span className="font-medium">PF:</span>
                          {message.payload.pf1 && ` ${message.payload.pf1.toFixed(3)}`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Test Button */}
      <div className="mt-4">
        <button
          onClick={() => {
            if (isConnected) {
              console.log('Testing AI205/data topic subscription...');
              // This would trigger a test message in a real implementation
            }
          }}
          disabled={!isConnected}
          className={`px-4 py-2 rounded-md font-medium ${isConnected
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
        >
          🧪 Test AI205/data Topic
        </button>
        <span className="ml-3 text-sm text-gray-500">
          {isConnected ? 'Ready to test MQTT data reception' : 'Connect to MQTT first'}
        </span>
      </div>
    </div>
  );
};

export default MqttDebugPanel;