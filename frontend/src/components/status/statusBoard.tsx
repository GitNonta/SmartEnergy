import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Wifi,
  CloudLightning,
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Bot,
  X,
  Search,
  Server,
  Cpu,
  Clock,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { useWebSocket } from '../../context/WebSocketContext';
import { getApiBase } from '../../config/api';
import { useTheme } from '../AppShell';
import { useLanguage } from '../../context/LanguageContext';

/**
 * --- GEMINI API CONFIGURATION ---
 */
const apiKey = ""; // API Key will be injected by the environment

// --- TYPES ---
type StatusType = 'online' | 'reconnecting' | 'offline';

interface EspTelemetry {
  ssid: string;
  ip: string;
  heap_free_kb: number;
  cpu_freq_mhz: number;
  uptime_sec: number;
  timestamp: number | string;
}

interface SystemStatus {
  esp: StatusType;
  mqtt: StatusType;
  database: StatusType;
  lastChecked: Date;
  espTelemetry?: EspTelemetry;
}

// --- HELPER: FORMAT UPTIME ---
const formatUptime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
};

// --- REAL-TIME DATA HOOK ---
const useSystemHealth = () => {
  const {
    isConnected,
    connectionStatus,
    espStatus
  } = useWebSocket();

  const [status, setStatus] = useState<SystemStatus>({
    esp: 'offline',
    mqtt: 'offline',
    database: 'offline',
    lastChecked: new Date(),
    espTelemetry: undefined
  });

  const [backendStatus, setBackendStatus] = useState<{
    mqtt?: { connected: boolean };
    influxdb?: { connected: boolean; buckets?: any };
  }>({});

  // Fetch backend health status every 5 seconds (includes real InfluxDB connection check)
  useEffect(() => {
    const fetchBackendStatus = async () => {
      try {
        // Use /health endpoint which actually tests InfluxDB connection
        const response = await fetch(`${getApiBase()}/health`);
        if (response.ok) {
          const data = await response.json();
          setBackendStatus(data);
        } else {
          // Backend not responding - set all as disconnected
          setBackendStatus({});
        }
      } catch (err) {
        console.error('Failed to fetch backend health:', err);
        // On error, clear status to show offline
        setBackendStatus({});
      }
    };

    fetchBackendStatus();
    const interval = setInterval(fetchBackendStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update status based on real-time data
  useEffect(() => {
    const now = new Date();

    // ESP32 Status
    let espStatusType: StatusType = 'offline';
    if (espStatus && espStatus.receivedAt) {
      const timeDiff = now.getTime() - new Date(espStatus.receivedAt).getTime();
      if (timeDiff < 10000) { // Less than 10 seconds ago
        espStatusType = 'online';
      } else if (timeDiff < 30000) { // Less than 30 seconds ago
        espStatusType = 'reconnecting';
      }
    }

    // MQTT Status
    let mqttStatusType: StatusType = 'offline';
    if (connectionStatus === 'connected' && isConnected) {
      mqttStatusType = 'online';
    } else if (connectionStatus === 'connecting') {
      mqttStatusType = 'reconnecting';
    }

    // Database Status - check actual InfluxDB connection from /health endpoint
    let dbStatusType: StatusType = 'offline';
    if (backendStatus.influxdb?.connected === true) {
      dbStatusType = 'online';
    } else if (backendStatus.mqtt?.connected && backendStatus.influxdb?.connected === false) {
      // MQTT works but InfluxDB doesn't - show as reconnecting/warning
      dbStatusType = 'reconnecting';
    }

    // Convert ESP telemetry
    let telemetry: EspTelemetry | undefined;
    if (espStatus && espStatusType !== 'offline') {
      telemetry = {
        ssid: espStatus.ssid || 'Unknown',
        ip: espStatus.ip || '0.0.0.0',
        heap_free_kb: espStatus.heap_free_kb || 0,
        cpu_freq_mhz: espStatus.cpu_freq_mhz || 0,
        uptime_sec: espStatus.uptime_sec || 0,
        timestamp: espStatus.timestamp || Date.now()
      };
    }

    setStatus({
      esp: espStatusType,
      mqtt: mqttStatusType,
      database: dbStatusType,
      lastChecked: now,
      espTelemetry: telemetry
    });
  }, [espStatus, connectionStatus, isConnected, backendStatus]);

  return status;
};

// --- GEMINI API HOOK (Enhanced with real system data) ---
const useGeminiDiagnosis = () => {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetTitle, setTargetTitle] = useState<string | null>(null);

  const generateReport = async (status: SystemStatus, specificComponent?: { title: string, status: StatusType }) => {
    setLoading(true);
    setError(null);
    setReport(null);
    setTargetTitle(specificComponent ? specificComponent.title : "System Overview");

    try {
      // Simulate API Call delay for demo purposes if no Key
      if (!apiKey) {
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Generate smart mock report based on actual status
        let mockReport = '<div class="space-y-2">';

        if (specificComponent) {
          const { title, status: compStatus } = specificComponent;

          if (compStatus === 'online') {
            mockReport += `<p><strong>✅ ${title} Status:</strong> Operating normally</p>`;
            mockReport += `<p>All systems operational. No issues detected.</p>`;

            if (title === 'ESP32 Device' && status.espTelemetry) {
              mockReport += `<ul class="list-disc ml-4 mt-2 text-sm">`;
              mockReport += `<li>Network: ${status.espTelemetry.ssid} (${status.espTelemetry.ip})</li>`;
              mockReport += `<li>Memory: ${status.espTelemetry.heap_free_kb.toFixed(1)} KB free</li>`;
              mockReport += `<li>CPU: ${status.espTelemetry.cpu_freq_mhz} MHz</li>`;
              mockReport += `<li>Uptime: ${formatUptime(status.espTelemetry.uptime_sec)}</li>`;
              mockReport += `</ul>`;
            }
          } else if (compStatus === 'reconnecting') {
            mockReport += `<p><strong>⚠️ ${title} Status:</strong> Reconnecting</p>`;
            mockReport += `<p>Attempting to restore connection. This may take a few moments.</p>`;
          } else {
            mockReport += `<p><strong>❌ ${title} Status:</strong> Offline</p>`;
            mockReport += `<p>Connection lost. Please check:</p>`;
            mockReport += `<ul class="list-disc ml-4 mt-2 text-sm">`;
            mockReport += `<li>Network connectivity</li>`;
            mockReport += `<li>Device power supply</li>`;
            mockReport += `<li>Service availability</li>`;
            mockReport += `</ul>`;
          }
        } else {
          // System overview
          const onlineCount = [status.esp, status.mqtt, status.database].filter(s => s === 'online').length;
          mockReport += `<p><strong>System Health:</strong> ${onlineCount}/3 services online</p>`;
          mockReport += `<ul class="list-disc ml-4 mt-2">`;
          mockReport += `<li>ESP32: ${status.esp === 'online' ? '✅ Online' : status.esp === 'reconnecting' ? '⚠️ Reconnecting' : '❌ Offline'}</li>`;
          mockReport += `<li>MQTT: ${status.mqtt === 'online' ? '✅ Online' : status.mqtt === 'reconnecting' ? '⚠️ Reconnecting' : '❌ Offline'}</li>`;
          mockReport += `<li>Database: ${status.database === 'online' ? '✅ Online' : status.database === 'reconnecting' ? '⚠️ Reconnecting' : '❌ Offline'}</li>`;
          mockReport += `</ul>`;
        }

        mockReport += '</div>';
        setReport(mockReport);
        setLoading(false);
        return;
      }

      // Real API Call would go here...
      // const response = await fetch('...', { headers: { Authorization: apiKey } });

    } catch (err) {
      setError("AI Service Unavailable");
      setLoading(false);
    }
  };

  const clearReport = () => { setReport(null); setTargetTitle(null); };
  return { report, loading, error, generateReport, clearReport, targetTitle };
};

// --- NEW COMPONENT: INFO CAROUSEL (POP SLIDES) ---
const InfoCarousel = ({ data, t }: { data: EspTelemetry; t: (key: string) => string }) => {
  const [index, setIndex] = useState(0);

  // Define the slides
  const slides = [
    { id: 'ssid', icon: Wifi, labelKey: 'status.ssid', value: data.ssid, color: "text-sky-500" },
    { id: 'ip', icon: Server, labelKey: 'status.ipAddress', value: data.ip, color: "text-indigo-500" },
    { id: 'heap', icon: Database, labelKey: 'status.heapFree', value: `${data.heap_free_kb} KB`, color: "text-amber-500" },
    { id: 'cpu', icon: Cpu, labelKey: 'status.cpuFreq', value: `${data.cpu_freq_mhz} MHz`, color: "text-rose-500" },
    { id: 'uptime', icon: Clock, labelKey: 'status.uptime', value: formatUptime(data.uptime_sec), color: "text-emerald-500" },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const CurrentIcon = slides[index].icon;
  const currentSlide = slides[index];

  return (
    <div className="h-12 w-full flex items-center justify-center mt-4 relative overflow-hidden">
      <motion.div
        key={currentSlide.id}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3 bg-slate-100 dark:bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-inner min-w-[180px] justify-center absolute"
      >
        <CurrentIcon size={16} className={currentSlide.color} />
        <div className="flex flex-col items-start leading-none">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {t(currentSlide.labelKey)}
          </span>
          <span className="text-sm font-mono font-semibold text-slate-700 dark:text-slate-200">
            {currentSlide.value}
          </span>
        </div>
      </motion.div>
    </div>
  );
};

// --- SUB-COMPONENT: STATUS CARD ---
const StatusCard = ({
  title,
  status,
  icon: Icon,
  onClick,
  telemetry,
  showRestart,
  t
}: {
  title: string,
  status: StatusType,
  icon: React.ElementType,
  onClick: () => void,
  telemetry?: EspTelemetry,
  showRestart?: boolean,
  t: (key: string) => string
}) => {
  const [restarting, setRestarting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [restartMessage, setRestartMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleRestart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(false);
    setRestarting(true);
    setRestartMessage(null);

    try {
      const response = await fetch(`${getApiBase()}/api/device/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.success) {
        setRestartMessage({ type: 'success', text: '✓ Restart sent!' });
        setTimeout(() => setRestartMessage(null), 4000);
      } else {
        setRestartMessage({ type: 'error', text: data.error || 'Failed' });
      }
    } catch {
      setRestartMessage({ type: 'error', text: 'Connection error' });
    } finally {
      setRestarting(false);
    }
  };

  const config = {
    online: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/10',
      border: 'border-emerald-200 dark:border-emerald-500/20',
      text: 'text-emerald-700 dark:text-emerald-400',
      labelKey: 'status.operational',
      StatusIcon: CheckCircle2
    },
    reconnecting: {
      bg: 'bg-amber-50 dark:bg-amber-900/10',
      border: 'border-amber-200 dark:border-amber-500/20',
      text: 'text-amber-700 dark:text-amber-400',
      labelKey: 'status.reconnecting',
      StatusIcon: AlertTriangle
    },
    offline: {
      bg: 'bg-rose-50 dark:bg-rose-900/10',
      border: 'border-rose-200 dark:border-rose-500/20',
      text: 'text-rose-700 dark:text-rose-400',
      labelKey: 'status.systemError',
      StatusIcon: XCircle
    }
  };

  const currentStyle = config[status];
  const StatusIcon = currentStyle.StatusIcon;

  return (
    <motion.div
      layout
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`relative overflow-hidden rounded-3xl border-2 ${currentStyle.border} ${currentStyle.bg} p-6 cursor-pointer group flex flex-col items-center justify-between min-h-[220px]`}
    >
      <div className={`absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-10 blur-3xl ${status === 'online' ? 'bg-emerald-500' : status === 'offline' ? 'bg-rose-500' : 'bg-amber-500'}`} />

      {/* Search Hint */}
      <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
        <Search size={12} /> {t('status.inspect')}
      </div>

      {/* Restart Button - Only for ESP */}
      {showRestart && status === 'online' && (
        <div className="absolute top-4 right-12 z-20" onClick={(e) => e.stopPropagation()}>
          {showConfirm ? (
            <div className="flex items-center gap-1 bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded-lg border border-orange-200 dark:border-orange-700">
              <span className="text-[10px] text-orange-700 dark:text-orange-300">{t('status.restartConfirm')}</span>
              <button onClick={handleRestart} className="px-1.5 py-0.5 text-[10px] bg-orange-500 text-white rounded hover:bg-orange-600">{t('status.yes')}</button>
              <button onClick={(e) => { e.stopPropagation(); setShowConfirm(false); }} className="px-1.5 py-0.5 text-[10px] bg-slate-200 dark:bg-slate-600 rounded">{t('status.no')}</button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
              disabled={restarting}
              className="p-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all disabled:opacity-50 shadow-sm"
              title={t('status.restartEsp')}
            >
              {restarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      )}

      {/* Restart Message */}
      {restartMessage && (
        <div className={`absolute top-14 right-4 z-20 text-[10px] px-2 py-1 rounded-lg font-medium ${restartMessage.type === 'success'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          }`}>
          {restartMessage.text}
        </div>
      )}

      {/* Main Status Content */}
      <div className="z-10 flex flex-col items-center justify-center gap-2 text-center w-full mt-4">
        <div className={`p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm ${currentStyle.text} group-hover:scale-110 transition-transform duration-300`}>
          <Icon size={36} strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300 tracking-wide">
            {title}
          </h3>
          <div className={`flex items-center justify-center gap-2 text-lg font-bold ${currentStyle.text}`}>
            <StatusIcon size={18} />
            <span>{t(currentStyle.labelKey)}</span>
          </div>
        </div>
      </div>

      {/* NEW: INFO CAROUSEL SLIDES */}
      <div className="w-full z-10">
        {telemetry && status === 'online' ? (
          <InfoCarousel data={telemetry} t={t} />
        ) : (
          <div className="h-12 mt-4" /> // Spacer to keep card size consistent
        )}
      </div>

      <div className="absolute top-4 right-4">
        <div className={`relative flex h-3 w-3`}>
          {status === 'online' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
        </div>
      </div>
    </motion.div>
  );
};

// --- AI MODAL (Same as before) ---
const AIDiagnosisModal = ({ isOpen, onClose, loading, report, error, title }: any) => {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 50, opacity: 0 }}
      className="fixed bottom-6 right-6 z-50 w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-indigo-200 dark:border-indigo-500/30 overflow-hidden"
    >
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-4 flex justify-between items-center text-white">
        <div className="flex items-center gap-2 font-bold"><Bot size={18} /> AI Diagnosis: {title}</div>
        <button onClick={onClose}><X size={18} /></button>
      </div>
      <div className="p-6 max-h-[60vh] overflow-y-auto text-sm text-slate-600 dark:text-slate-300">
        {loading ? <div className="text-center animate-pulse">Analyzing...</div> :
          error ? <div className="text-rose-500">{error}</div> :
            <div dangerouslySetInnerHTML={{ __html: report || '' }} className="prose prose-sm dark:prose-invert" />}
      </div>
    </motion.div>
  );
};

// --- MAIN PAGE ---
export default function StatusDashboard() {
  const { darkMode, currentTheme } = useTheme();
  const { t } = useLanguage();
  const status = useSystemHealth();
  const { report, loading, error, generateReport, targetTitle } = useGeminiDiagnosis();
  const [showAI, setShowAI] = useState(false);
  const { connectionStatus } = useWebSocket();

  const handleCardClick = (title: string, componentStatus: StatusType) => {
    setShowAI(true);
    generateReport(status, { title, status: componentStatus });
  };

  // Calculate overall health
  const onlineServices = [status.esp, status.mqtt, status.database].filter(s => s === 'online').length;
  const healthPercentage = Math.round((onlineServices / 3) * 100);

  return (
    <div className={`${darkMode ? 'dark' : ''} transition-colors duration-500`}>
      <div className="flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-5xl space-y-8">

          {/* Header */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className={`${currentTheme.accent} text-white p-3 rounded-xl`}>
                <Activity />
              </div>
              <div>
                <h1 className="text-2xl font-bold dark:text-white">{t('status.title')}</h1>
                <p className="text-slate-500 flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${connectionStatus === 'connected' ? `${currentTheme.accent} animate-pulse` :
                    connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' :
                      'bg-rose-500'
                    }`} />
                  {connectionStatus === 'connected' ? t('status.realtimeMonitoring') :
                    connectionStatus === 'connecting' ? t('status.connecting') :
                      t('status.disconnected')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Health Badge */}
              <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${healthPercentage === 100 ? `${currentTheme.accentLight} ${currentTheme.text}` :
                healthPercentage >= 66 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                  'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                }`}>
                {healthPercentage}% {t('status.healthy')}
              </div>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatusCard
              title={t('status.espDevice')}
              status={status.esp}
              icon={Wifi}
              onClick={() => handleCardClick(t('status.espDevice'), status.esp)}
              telemetry={status.espTelemetry}
              showRestart={true}
              t={t}
            />
            <StatusCard
              title={t('status.mqttBroker')}
              status={status.mqtt}
              icon={CloudLightning}
              onClick={() => handleCardClick(t('status.mqttBroker'), status.mqtt)}
              t={t}
            />
            <StatusCard
              title={t('status.database')}
              status={status.database}
              icon={Database}
              onClick={() => handleCardClick(t('status.database'), status.database)}
              t={t}
            />
          </div>

          {/* Footer */}
          <div className="text-center mt-8 text-xs text-slate-400">
            {t('status.lastAutoChecked')}: {status.lastChecked.toLocaleTimeString()}
          </div>
        </div>

        <AIDiagnosisModal isOpen={showAI} onClose={() => setShowAI(false)} loading={loading} report={report} error={error} title={targetTitle} />
      </div>
    </div>
  );
}
