import React, { useState } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';
import {
  Wifi,
  WifiOff,
  Settings as SettingsIcon,
  Play,
  Square,
  AlertCircle,
  CheckCircle,
  Loader
} from 'lucide-react';

interface MqttConnectionPanelProps {
  className?: string;
}

const MqttConnectionPanel: React.FC<MqttConnectionPanelProps> = ({ className = '' }) => {
  const { isConnected, connectionStatus, connect, disconnect, error, lastUpdate } = useWebSocket();
  const { t } = useLanguage();
  const [showConfig, setShowConfig] = useState(false);

  const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:3001';

  const handleConnect = async () => {
    try {
      await connect();
    } catch (err) {
      console.error('Connection failed:', err);
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'connecting':
        return <Loader className="w-5 h-5 text-yellow-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <WifiOff className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return t('connection.connected');
      case 'connecting':
        return t('connection.connecting');
      case 'error':
        return t('connection.connectionError');
      default:
        return t('connection.disconnected');
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-lg border p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isConnected ? (
            <Wifi className="w-6 h-6 text-green-500" />
          ) : (
            <WifiOff className="w-6 h-6 text-gray-500" />
          )}
          <div>
            <h3 className="font-semibold text-gray-900">{t('connection.title')}</h3>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className="text-sm text-gray-600">{getStatusText()}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowConfig(!showConfig)}
          className="p-2 hover:bg-gray-100 rounded-lg"
          title={t('connection.settings')}
        >
          <SettingsIcon className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        </div>
      )}

      {lastUpdate && isConnected && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-sm text-green-700">
            {t('connection.lastUpdate')}: {lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      )}

      {showConfig && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <h4 className="font-medium text-gray-900">{t('connection.settings')}</h4>

          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">{t('connection.wsUrl')}:</span>
              <span className="font-mono">{wsUrl}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('connection.backendStatus')}:</span>
              <span className="font-mono">{connectionStatus}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              💡 {t('connection.settingsInfo')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              🔌 {t('connection.bridgeInfo')}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {!isConnected ? (
          <button
            onClick={handleConnect}
            disabled={connectionStatus === 'connecting'}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            {connectionStatus === 'connecting' ? t('connection.connecting') : t('connection.connect')}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <Square className="w-4 h-4" />
            {t('connection.disconnect')}
          </button>
        )}
      </div>

      {isConnected && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">{t('connection.topics')}:</h4>
          <div className="text-sm text-blue-700 space-y-1">
            <div>• <code>AI205/data</code> - {t('connection.mainData')}</div>
            <div>• <code>AI205/alerts</code> - {t('connection.alertsTopic')}</div>
            <div>• <code>AI205/status</code> - {t('connection.statusTopic')}</div>
          </div>
          <div className="mt-3 pt-2 border-t border-blue-200">
            <h5 className="font-medium text-blue-900 mb-1">{t('connection.expectedFormat')}:</h5>
            <div className="text-xs text-blue-600 font-mono bg-blue-100 p-2 rounded">
              {`{
  "f1": 230.5, "f2": 229.8, "f3": 231.2,
  "i1": 15.2, "i2": 14.8, "i3": 15.6,
  "pf1": 0.92, "pf2": 0.89, "pf3": 0.94,
  "timestamp": "2025-10-01T10:30:00Z"
}`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MqttConnectionPanel;