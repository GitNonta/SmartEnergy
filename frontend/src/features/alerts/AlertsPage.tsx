import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import { useLanguage } from '../../context/LanguageContext';
import { AlertTriangle, Zap, Wifi, Database, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { getApiBase } from '../../config/api';

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  source: 'power' | 'mqtt' | 'database' | 'system' | 'esp';
  deviceId?: string;
  value?: number;
}

// Map backend severity to frontend type
function mapSeverityToType(severity: string): 'warning' | 'error' | 'info' | 'success' {
  switch (severity) {
    case 'critical': return 'error';
    case 'warning': return 'warning';
    case 'info': return 'info';
    default: return 'warning';
  }
}

// Map alert type to source
function mapTypeToSource(alertType: string): Alert['source'] {
  if (alertType.includes('voltage') || alertType.includes('current') || alertType.includes('power') || alertType.includes('pf') || alertType.includes('load')) {
    return 'power';
  }
  if (alertType.includes('esp') || alertType.includes('phase')) {
    return 'esp';
  }
  if (alertType.includes('mqtt') || alertType.includes('connection')) {
    return 'mqtt';
  }
  return 'system';
}

export default function AlertsPage() {
  const { energyData, isConnected, alerts: wsAlerts } = useWebSocket();
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<'all' | 'warning' | 'error' | 'info'>('all');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch historical alerts from backend on mount
  const fetchAlerts = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${getApiBase()}/api/alerts?limit=50`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.alerts) {
          const backendAlerts: Alert[] = data.alerts.map((a: any) => ({
            id: a.id,
            type: mapSeverityToType(a.severity),
            title: a.type?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'System Alert',
            message: a.message,
            timestamp: new Date(a.timestamp),
            source: mapTypeToSource(a.type || ''),
            deviceId: a.deviceId,
            value: a.value
          }));
          setAlerts(backendAlerts);
        }
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Listen for real-time alerts from WebSocket
  useEffect(() => {
    if (wsAlerts && wsAlerts.length > 0) {
      const latestAlert = wsAlerts[0];
      if (latestAlert) {
        const newAlert: Alert = {
          id: latestAlert.id || `ws-${Date.now()}`,
          type: mapSeverityToType(latestAlert.severity || 'warning'),
          title: latestAlert.type?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Alert',
          message: latestAlert.message || 'System alert received',
          timestamp: new Date(latestAlert.timestamp || Date.now()),
          source: mapTypeToSource(latestAlert.type || ''),
          deviceId: latestAlert.deviceId,
          value: latestAlert.value
        };

        // Add to alerts if not already present
        setAlerts(prev => {
          if (prev.some(a => a.id === newAlert.id)) {
            return prev;
          }
          return [newAlert, ...prev].slice(0, 100);
        });
      }
    }
  }, [wsAlerts]);

  // Monitor connection status
  useEffect(() => {
    if (!isConnected) {
      const disconnectAlert: Alert = {
        id: `ws-disconnected-${Date.now()}`,
        type: 'error',
        title: 'Connection Lost',
        message: 'Real-time data connection lost. Attempting to reconnect...',
        timestamp: new Date(),
        source: 'mqtt'
      };
      setAlerts(prev => {
        // Don't add duplicate disconnect alerts
        if (prev.some(a => a.title === 'Connection Lost' && Date.now() - a.timestamp.getTime() < 30000)) {
          return prev;
        }
        return [disconnectAlert, ...prev].slice(0, 100);
      });
    }
  }, [isConnected]);

  const filteredAlerts = filter === 'all'
    ? alerts
    : alerts.filter(a => a.type === filter);

  const getAlertIcon = (source: Alert['source']) => {
    switch (source) {
      case 'power': return <Zap className="w-5 h-5" />;
      case 'mqtt': return <Wifi className="w-5 h-5" />;
      case 'database': return <Database className="w-5 h-5" />;
      case 'esp': return <AlertCircle className="w-5 h-5" />;
      default: return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getAlertColor = (type: Alert['type']) => {
    switch (type) {
      case 'error': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200';
      case 'warning': return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200';
      case 'info': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200';
      case 'success': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200';
    }
  };

  const getSeverityBadge = (type: Alert['type']) => {
    switch (type) {
      case 'error': return <span className="px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded">{t('alerts.criticalBadge')}</span>;
      case 'warning': return <span className="px-2 py-0.5 text-xs font-bold bg-yellow-500 text-white rounded">{t('alerts.warningBadge')}</span>;
      case 'info': return <span className="px-2 py-0.5 text-xs font-bold bg-blue-500 text-white rounded">{t('alerts.infoBadge')}</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('alerts.title')}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('alerts.total')}: {alerts.length}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button
            onClick={fetchAlerts}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('alerts.refresh')}
          </button>

          {/* Status Badge */}
          {isConnected ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full">
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-800 dark:text-green-200">{t('alerts.connected')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-full">
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-medium text-red-800 dark:text-red-200">{t('alerts.disconnected')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {(['all', 'error', 'warning', 'info'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${filter === f
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
          >
            {f === 'all' ? t('common.all') : f === 'error' ? t('alerts.critical') : f === 'warning' ? t('alerts.warning') : t('alerts.info')}
            {f !== 'all' && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${f === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                f === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                }`}>
                {alerts.filter(a => a.type === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              {t('alerts.noAlerts')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('alerts.allNormal')}
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-lg border ${getAlertColor(alert.type)}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getAlertIcon(alert.source)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {getSeverityBadge(alert.type)}
                    <h3 className="text-sm font-semibold">
                      {(() => {
                        // Dynamic translation for titles
                        const titleLower = alert.title.toLowerCase();
                        if (titleLower.includes('voltage low')) return t('alerts.messages.voltageLow');
                        if (titleLower.includes('phase missing')) return t('alerts.messages.phaseMissing');
                        if (titleLower.includes('undervoltage')) return t('alerts.messages.undervoltage');
                        if (titleLower.includes('power')) return t('alerts.messages.power');
                        return alert.title;
                      })()}
                    </h3>
                    <span className="px-2 py-0.5 text-xs font-medium bg-white/50 dark:bg-black/20 rounded">
                      {alert.source}
                    </span>
                    {alert.deviceId && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-white/50 dark:bg-black/20 rounded">
                        {alert.deviceId}
                      </span>
                    )}
                  </div>
                  <p className="text-sm opacity-90">
                    {(() => {
                      // naive translation replacement for message content
                      let msg = alert.message;
                      if (msg.includes('Phase2')) msg = msg.replace('Phase2', t('alerts.messages.phase2'));
                      if (msg.includes('Phase3')) msg = msg.replace('Phase3', t('alerts.messages.phase3'));
                      if (msg.toLowerCase().includes('undervoltage detected')) msg = t('alerts.messages.undervoltage');
                      // Add more replacements if needed for full sentences, but this handles the specific request keywords
                      return msg;
                    })()}
                  </p>
                  {alert.value !== undefined && alert.value !== null && (
                    <p className="text-xs mt-1 opacity-75">{t('alerts.value')}: {typeof alert.value === 'number' ? alert.value.toFixed(2) : alert.value}</p>
                  )}
                  <div className="flex items-center gap-1 mt-2 text-xs opacity-75">
                    <Clock className="w-3 h-3" />
                    <span>{alert.timestamp.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('alerts.total')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{alerts.length}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 dark:text-red-400">{t('alerts.critical')}</p>
              <p className="text-2xl font-bold text-red-800 dark:text-red-200">
                {alerts.filter(a => a.type === 'error').length}
              </p>
            </div>
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">{t('alerts.warning')}</p>
              <p className="text-2xl font-bold text-yellow-800 dark:text-yellow-200">
                {alerts.filter(a => a.type === 'warning').length}
              </p>
            </div>
            <AlertTriangle className="w-8 h-8 text-yellow-400" />
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 dark:text-blue-400">{t('alerts.info')}</p>
              <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">
                {alerts.filter(a => a.type === 'info').length}
              </p>
            </div>
            <Database className="w-8 h-8 text-blue-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
