import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import { useLanguage } from '../../context/LanguageContext';
import { 
  AlertTriangle, Zap, Wifi, Database, CheckCircle, XCircle, Clock, 
  AlertCircle, RefreshCw, ChevronDown, ChevronUp, Check, Lightbulb, BookOpen 
} from 'lucide-react';
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
  read: boolean;
}

interface TroubleshootingInfo {
  cause: string;
  solution: string;
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

function getTroubleshooting(alert: Alert, lang: 'en' | 'th'): TroubleshootingInfo {
  const titleLower = (alert.title || '').toLowerCase();
  const msgLower = (alert.message || '').toLowerCase();
  const isTh = lang === 'th';

  if (titleLower.includes('voltage low') || titleLower.includes('undervoltage') || msgLower.includes('undervoltage') || msgLower.includes('voltage low')) {
    return {
      cause: isTh 
        ? 'แรงดันไฟฟ้าในระบบหลักตกลงต่ำกว่าเกณฑ์ความปลอดภัยมาตรฐาน (มักเกิดจากการใช้งานมอเตอร์ขนาดใหญ่หรือการใช้กระแสไฟฟ้าสูงเกินไปในบริเวณใกล้เคียง)' 
        : 'Line voltage dropped below safety limits (often caused by large motor start-ups or high localized demand).',
      solution: isTh
        ? '1. ตรวจสอบว่าระบบ Capacitor Bank ทำงานทำงานปกติหรือไม่\n2. เลื่อนเวลาใช้งานอุปกรณ์ขนาดใหญ่สลับกันเพื่อเลี่ยงการใช้พลังงานพีค\n3. แจ้งเจ้าหน้าที่การไฟฟ้าหากแรงดันจากภายนอกต่ำต่อเนื่อง'
        : '1. Check if the Capacitor Bank is working properly.\n2. Schedule high-power machinery to run sequentially rather than simultaneously.\n3. Contact the utility provider if input voltage remains low.'
    };
  }

  if (titleLower.includes('voltage high') || titleLower.includes('overvoltage') || msgLower.includes('overvoltage') || msgLower.includes('voltage high')) {
    return {
      cause: isTh
        ? 'แรงดันไฟฟ้าในระบบสูงเกินกว่าพิกัดที่กำหนด (อาจเกิดจากหม้อแปลงปรับตั้ง Tap สูงเกินไป หรือการถอนโหลดขนาดใหญ่ออกจากระบบอย่างรวดเร็ว)'
        : 'Line voltage exceeded upper safety limits (often caused by incorrect transformer tap settings or sudden reduction of large loads).',
      solution: isTh
        ? '1. ตรวจสอบการปรับตั้ง Tap ของหม้อแปลงไฟฟ้าหลัก\n2. ตรวจเช็คการทำงานของระบบ Capacitor Bank ว่าทำงานเกินขนาด (Over-correction) หรือไม่\n3. ติดตั้งอุปกรณ์ป้องกันไฟเกิน (Surge Protection Device) เพิ่มเติมเพื่อความปลอดภัย'
        : '1. Check the transformer tap settings.\n2. Verify that Capacitor Banks are not over-compensating.\n3. Install Surge Protection Devices (SPD) to protect sensitive equipment.'
    };
  }

  if (titleLower.includes('phase missing') || msgLower.includes('phase missing') || msgLower.includes('phase lost')) {
    return {
      cause: isTh
        ? 'เกิดเหตุการณ์แรงดันสูญหายในเฟสใดเฟสหนึ่งอย่างสมบูรณ์ (อาจเกิดจากฟิวส์หลักขาด สายส่งเสียหาย หรือแรงดันตกขั้นรุนแรง)'
        : 'Complete voltage loss on one or more phases (caused by blown fuses, supply line damage, or severe phase fault).',
      solution: isTh
        ? '1. ปิดเครื่องจักรอุปกรณ์ที่ใช้ไฟ 3 เฟส (เช่น ปั๊มน้ำ, ลิฟต์, มอเตอร์หลัก) ทันทีเพื่อป้องกันมอเตอร์ไหม้เนื่องจากกระแสข้ามเฟส\n2. ตรวจสอบฟิวส์แรงสูง (High Voltage Fuse) และเบรกเกอร์หลัก\n3. ติดต่อการไฟฟ้าด่วนที่สุดเพื่อตรวจสอบสายส่งนอกอาคาร'
        : '1. Immediately shut down all 3-phase machinery (pumps, elevators, main motors) to prevent motor burnout from phase imbalance.\n2. Check main high-voltage fuses and circuit breakers.\n3. Contact the utility provider immediately to inspect the service drop lines.'
    };
  }

  if (titleLower.includes('current high') || titleLower.includes('overcurrent') || msgLower.includes('overcurrent') || msgLower.includes('current high')) {
    return {
      cause: isTh
        ? 'กระแสไฟฟ้าในเฟสเกินพิกัดการใช้งานปกติของระบบ (เกิดจากการพ่วงโหลดใช้งานมากเกินไป หรือเกิดการลัดวงจรแบบบางส่วน)'
        : 'Current drawn exceeded safe circuit limits (caused by overloaded circuits or partial short-circuit faults).',
      solution: isTh
        ? '1. แยกแยะและปิดอุปกรณ์เครื่องใช้ไฟฟ้าที่เกินพิกัดใช้งาน\n2. จัดสรรการจ่ายโหลด (Load Balance) ไปยังเฟสอื่นๆ ที่มีกระแสเหลือน้อยกว่า\n3. ตรวจสอบความร้อนของสายไฟและหน้าสัมผัสของเบรกเกอร์'
        : '1. Identify and shut down non-essential high-current appliances.\n2. Redistribute single-phase loads evenly across under-loaded phases.\n3. Inspect wiring temperature and breaker contact points.'
    };
  }

  if (titleLower.includes('pf low') || titleLower.includes('power factor') || msgLower.includes('power factor') || msgLower.includes('pf low')) {
    return {
      cause: isTh
        ? 'ตัวประกอบกำลังไฟฟ้าต่ำกว่า 0.85 (มักเกิดจากการใช้งานอุปกรณ์ที่เป็นขดลวด เช่น มอเตอร์ขนาดใหญ่ หรือบัลลาสต์แกนเหล็กเป็นจำนวนมาก)'
        : 'Power factor dropped below the 0.85 threshold (usually due to highly inductive loads like large motors, transformers, or magnetic ballasts).',
      solution: isTh
        ? '1. ตรวจสอบความพร้อมใช้งานของระบบ Capacitor Bank และขั้นตอนการ Step Cap\n2. ติดตั้ง Capacitor เพิ่มเติมที่ตัวมอเตอร์ขนาดใหญ่โดยตรง\n3. เฝ้าระวังค่าปรับเพาเวอร์แฟกเตอร์ (kVAr) ในบิลค่าไฟรายเดือน'
        : '1. Check Capacitor Bank step controller operations.\n2. Install localized capacitors directly on larger inductive motors.\n3. Monitor monthly utility bills to prevent reactive power (kVAr) penalties.'
    };
  }

  return {
    cause: isTh
      ? 'ตรวจพบพารามิเตอร์การใช้งานหรืออุปกรณ์ทำงานผิดปกติ นอกเหนือจากย่านการทำงานที่แนะนำโดยวิศวกรระบบไฟฟ้า'
      : 'System detected electrical metrics or status values outside the safe recommended operation limits.',
    solution: isTh
      ? '1. ตรวจสอบค่าพารามิเตอร์ไฟฟ้าแบบเรียลไทม์บนหน้าแดชบอร์ดหลัก\n2. บันทึกวันและเวลาที่เกิดเหตุการณ์เพื่อวิเคราะห์ความเสียหายในระบบ\n3. หากมีข้อสงสัย ให้ปรึกษาวิศวกรไฟฟ้าผู้เชี่ยวชาญเพื่อตรวจสอบหน้างานจริง'
      : '1. Review current real-time electrical parameters on the main dashboard.\n2. Log the exact timestamp and context to identify patterns.\n3. Consult a qualified electrical engineer to inspect physical switchboards.'
  };
}

export default function AlertsPage() {
  const { 
    isConnected, 
    alerts, 
    fetchAlerts, 
    markAlertAsRead, 
    markAllAlertsAsRead 
  } = useWebSocket();
  const { t, language } = useLanguage();
  
  // Filters
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  
  const [isLoading, setIsLoading] = useState(false);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  // Refresh handler
  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchAlerts();
    setIsLoading(false);
  };

  // Toggle read status (mark read / unread)
  const toggleReadStatus = async (e: React.MouseEvent, alert: Alert) => {
    e.stopPropagation(); // prevent card expansion toggle
    if (!alert.read) {
      markAlertAsRead(alert.id);
    } else {
      try {
        await fetch(`${getApiBase()}/api/alerts/${alert.id}/unread`, { method: 'POST' });
        fetchAlerts(); 
      } catch (error) {
        console.error('Failed to mark as unread:', error);
      }
    }
  };

  // Handle card click (expands detail + marks read if unread)
  const handleAlertClick = (alert: Alert) => {
    if (expandedAlertId === alert.id) {
      setExpandedAlertId(null);
    } else {
      setExpandedAlertId(alert.id);
      if (!alert.read) {
        markAlertAsRead(alert.id);
      }
    }
  };

  // Process and Filter alerts
  const processedAlerts: Alert[] = (alerts || []).map((a: any) => ({
    id: a.id || a._id,
    type: mapSeverityToType(a.severity),
    title: a.type?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'System Alert',
    message: a.message,
    timestamp: new Date(a.timestamp),
    source: mapTypeToSource(a.type || ''),
    deviceId: a.deviceId || a.device_id,
    value: a.value,
    read: a.read || false
  }));

  const filteredAlerts = processedAlerts.filter(a => {
    // Severity Filter
    if (severityFilter !== 'all' && a.type !== severityFilter) return false;
    
    // Read status Filter
    if (readFilter === 'unread' && a.read) return false;
    if (readFilter === 'read' && !a.read) return false;
    
    return true;
  });

  const getAlertIcon = (source: Alert['source']) => {
    switch (source) {
      case 'power': return <Zap className="w-5 h-5" />;
      case 'mqtt': return <Wifi className="w-5 h-5" />;
      case 'database': return <Database className="w-5 h-5" />;
      case 'esp': return <AlertCircle className="w-5 h-5" />;
      default: return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getAlertColor = (type: Alert['type'], isRead: boolean) => {
    const opacityClass = isRead ? 'opacity-85' : 'opacity-100';
    const borderGlow = isRead ? '' : 'shadow-[0_0_15px_rgba(239,68,68,0.03)]';
    
    switch (type) {
      case 'error': 
        return `bg-red-50/90 dark:bg-red-950/20 border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200 ${opacityClass} ${borderGlow}`;
      case 'warning': 
        return `bg-yellow-50/90 dark:bg-yellow-950/10 border-yellow-200 dark:border-yellow-900/40 text-yellow-900 dark:text-yellow-200 ${opacityClass} ${borderGlow}`;
      case 'info': 
        return `bg-blue-50/90 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 ${opacityClass} ${borderGlow}`;
      case 'success': 
        return `bg-green-50/90 dark:bg-green-950/20 border-green-200 dark:border-green-900/60 text-green-900 dark:text-green-200 ${opacityClass} ${borderGlow}`;
    }
  };

  const getSeverityBadge = (type: Alert['type']) => {
    switch (type) {
      case 'error': return <span className="px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded-md">{t('alerts.criticalBadge')}</span>;
      case 'warning': return <span className="px-2 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-md">{t('alerts.warningBadge')}</span>;
      case 'info': return <span className="px-2 py-0.5 text-xs font-bold bg-blue-500 text-white rounded-md">{t('alerts.infoBadge')}</span>;
      default: return null;
    }
  };

  const unreadCount = processedAlerts.filter(a => !a.read).length;

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/40 dark:bg-gray-800/40 backdrop-blur-md p-6 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">{t('alerts.title')}</h1>
            {unreadCount > 0 && (
              <span className="animate-pulse bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {unreadCount} {t('alerts.unreadBadge')}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
            {t('alerts.total')}: <span className="font-semibold text-gray-700 dark:text-gray-200">{processedAlerts.length}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Mark All As Read */}
          {unreadCount > 0 && (
            <button
              onClick={markAllAlertsAsRead}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95"
            >
              <Check className="w-4 h-4" />
              {t('alerts.markAllRead')}
            </button>
          )}

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-all active:scale-95 text-gray-700 dark:text-gray-200 border border-gray-250/20"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('alerts.refresh')}
          </button>

          {/* Status Badge */}
          {isConnected ? (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-full">
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">{t('alerts.connected')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 rounded-full">
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-xs font-semibold text-red-800 dark:text-red-400">{t('alerts.disconnected')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters Control Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/20 dark:bg-gray-800/10 backdrop-blur-sm p-4 rounded-xl border border-gray-200/40 dark:border-gray-800/40">
        
        {/* Read / Unread Filter */}
        <div className="flex gap-1.5 bg-gray-200/50 dark:bg-gray-800/60 p-1 rounded-xl">
          {(['all', 'unread', 'read'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setReadFilter(r)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${readFilter === r
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
            >
              {r === 'all' ? t('common.all') : r === 'unread' ? `${t('alerts.unread')} (${unreadCount})` : t('alerts.read')}
            </button>
          ))}
        </div>

        {/* Severity filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'error', 'warning', 'info'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition-all ${severityFilter === s
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent shadow-md'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-350 border-gray-200 dark:border-gray-750 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              {s === 'all' ? t('common.all') : s === 'error' ? t('alerts.critical') : s === 'warning' ? t('alerts.warning') : t('alerts.info')}
              {s !== 'all' && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${s === 'error' ? 'bg-red-500/20 text-red-500' :
                  s === 'warning' ? 'bg-amber-500/20 text-amber-550 dark:text-amber-400' :
                    'bg-blue-500/20 text-blue-550 dark:text-blue-400'
                  }`}>
                  {processedAlerts.filter(a => a.type === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-16 bg-white/40 dark:bg-gray-800/20 backdrop-blur-md rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
            <CheckCircle className="w-14 h-14 mx-auto text-emerald-500 mb-4 animate-bounce" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {t('alerts.noAlerts')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('alerts.allNormal')}
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isExpanded = expandedAlertId === alert.id;
            const troubleshooting = getTroubleshooting(alert, language as 'th' | 'en');
            
            return (
              <div
                key={alert.id}
                onClick={() => handleAlertClick(alert)}
                className={`group relative rounded-2xl border p-5 cursor-pointer transition-all duration-300 ${getAlertColor(alert.type, alert.read)} ${isExpanded ? 'ring-2 ring-blue-500/30 dark:ring-blue-400/20 shadow-md' : 'hover:scale-[1.005] hover:shadow-md'}`}
              >
                {/* Unread indicator dot */}
                {!alert.read && (
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-450 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                )}

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1 p-2 rounded-xl bg-white/70 dark:bg-black/20 text-gray-700 dark:text-gray-300">
                    {getAlertIcon(alert.source)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {getSeverityBadge(alert.type)}
                      <h3 className={`text-base font-bold tracking-tight ${alert.read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                        {(() => {
                          const titleLower = alert.title.toLowerCase();
                          if (titleLower.includes('voltage low')) return t('alerts.messages.voltageLow');
                          if (titleLower.includes('phase missing')) return t('alerts.messages.phaseMissing');
                          if (titleLower.includes('undervoltage')) return t('alerts.messages.undervoltage');
                          if (titleLower.includes('power')) return t('alerts.messages.power');
                          return alert.title;
                        })()}
                      </h3>
                      
                      <span className="px-2 py-0.5 text-xs font-semibold bg-white/40 dark:bg-black/10 text-gray-600 dark:text-gray-400 rounded-md">
                        {alert.source.toUpperCase()}
                      </span>
                      {alert.deviceId && (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-white/40 dark:bg-black/10 text-gray-600 dark:text-gray-400 rounded-md">
                          {alert.deviceId}
                        </span>
                      )}
                    </div>
                    
                    <p className={`text-sm leading-relaxed ${alert.read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-800 dark:text-gray-200 font-medium'}`}>
                      {(() => {
                        let msg = alert.message;
                        if (msg.includes('Phase2')) msg = msg.replace('Phase2', t('alerts.messages.phase2'));
                        if (msg.includes('Phase3')) msg = msg.replace('Phase3', t('alerts.messages.phase3'));
                        if (msg.toLowerCase().includes('undervoltage detected')) msg = t('alerts.messages.undervoltage');
                        return msg;
                      })()}
                    </p>
                    
                    {alert.value !== undefined && alert.value !== null && (
                      <p className="text-xs mt-1.5 font-semibold opacity-75">
                        {t('alerts.value')}: <span className="font-mono bg-white/40 dark:bg-black/20 px-1.5 py-0.5 rounded text-gray-800 dark:text-gray-100">{typeof alert.value === 'number' ? alert.value.toFixed(2) : alert.value}</span>
                      </p>
                    )}
                    
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{alert.timestamp.toLocaleString()}</span>
                      </div>
                      
                      {/* Mark Read/Unread Toggle Button */}
                      <button
                        onClick={(e) => toggleReadStatus(e, alert)}
                        className="flex items-center gap-1 text-xs hover:text-blue-500 dark:hover:text-blue-400 transition-colors py-0.5 px-2 bg-white/30 dark:bg-black/10 hover:bg-white/60 dark:hover:bg-black/20 rounded-md"
                      >
                        <BookOpen className="w-3 h-3" />
                        <span>{alert.read ? t('alerts.unreadBadge') : t('alerts.readBadge')}</span>
                      </button>
                    </div>

                    {/* Expandable Troubleshooting Details */}
                    {isExpanded && (
                      <div 
                        className="mt-4 pt-4 border-t border-gray-250/20 dark:border-gray-700/30 space-y-3.5 text-sm"
                        onClick={(e) => e.stopPropagation()} // prevent double-toggling
                      >
                        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold">
                          <Lightbulb className="w-4 h-4" />
                          <span>{t('alerts.troubleshooting')}</span>
                        </div>

                        {/* Cause */}
                        <div className="space-y-1 bg-white/40 dark:bg-black/10 p-3 rounded-xl border border-gray-200/20 dark:border-gray-800/20">
                          <p className="font-bold text-gray-700 dark:text-gray-300 text-xs">{t('alerts.cause')}</p>
                          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{troubleshooting.cause}</p>
                        </div>

                        {/* Action Steps */}
                        <div className="space-y-1 bg-white/40 dark:bg-black/10 p-3 rounded-xl border border-gray-200/20 dark:border-gray-800/20">
                          <p className="font-bold text-gray-700 dark:text-gray-300 text-xs">{t('alerts.solution')}</p>
                          <div className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed whitespace-pre-line">
                            {troubleshooting.solution}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expand Chevron */}
                  <div className="flex-shrink-0 self-center text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
