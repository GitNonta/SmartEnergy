import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';
import { Gauge, Activity } from 'lucide-react';
import VoltageRealtimeChart, { ViewMode } from './VoltageRealtimeChart';

const VoltageBlock: React.FC = () => {
    const { energyData, isConnected, lastUpdate } = useWebSocket();
    const { t } = useLanguage();
    const [selectedPhase, setSelectedPhase] = useState<ViewMode | null>(null);

    const asNumber = (val: any, fallback = 0): number => {
        if (typeof val === 'number' && Number.isFinite(val)) return val;
        const n = Number(val);
        return Number.isFinite(n) ? n : fallback;
    };

    const displayData = {
        v1: asNumber(energyData?.voltage?.f1, 0),
        v2: asNumber(energyData?.voltage?.f2, 0),
        v3: asNumber(energyData?.voltage?.f3, 0)
    };

    const dataAge = lastUpdate ? (Date.now() - lastUpdate.getTime()) / 1000 : 999;
    const isStale = dataAge > 15;

    // Reference Voltage — MEA/PEA single-phase nominal = 220V, tolerance ±10% = 198–242V
    const nominalVoltage = 220;
    const V_LOW  = nominalVoltage * 0.90;  // 198 V
    const V_HIGH = nominalVoltage * 1.10;  // 242 V
    const avgVoltage = (displayData.v1 + displayData.v2 + displayData.v3) / 3;

    const getVoltageStatus = (v: number): 'normal' | 'warning' | 'critical' => {
        if (v <= 0) return 'normal';          // not connected / no data
        if (v < V_LOW * 0.95 || v > V_HIGH * 1.05) return 'critical'; // >±15%
        if (v < V_LOW || v > V_HIGH) return 'warning';                 // ±10–15%
        return 'normal';
    };

    const anyAbnormal = [displayData.v1, displayData.v2, displayData.v3]
        .some(v => v > 0 && getVoltageStatus(v) !== 'normal');

    // Calculate percentage deviation from nominal (for bar display)
    const getBarWidth = (voltage: number) => {
        return Math.min((voltage / 250) * 100, 100);
    };

    const statusColor = (v: number) => {
        const s = getVoltageStatus(v);
        if (s === 'critical') return '#ef4444';
        if (s === 'warning')  return '#f59e0b';
        return undefined; // use default phase color
    };

    return (
        <>
            <div className="voltage-block-compact">
                {/* Header */}
                <div className="vb-header">
                    <div className="vb-title-group">
                        <div className="vb-icon">
                            <Gauge size={18} />
                        </div>
                        <div className="vb-title-text">
                            <h3 className="vb-title">{t('power.voltage').toUpperCase()}</h3>
                            <span className="vb-subtitle">3-Phase Monitor</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {anyAbnormal && (
                            <span style={{
                                fontSize: '0.5rem', padding: '2px 5px', borderRadius: '8px',
                                fontWeight: 700, background: 'rgba(245,158,11,0.15)',
                                color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)'
                            }}>⚠ VOLT</span>
                        )}
                        <div className={`vb-status ${isConnected && !isStale ? 'online' : 'offline'}`}>
                            <span className="vb-status-dot" />
                            {isConnected ? (isStale ? 'WAIT' : 'LIVE') : 'OFF'}
                        </div>
                    </div>
                </div>

                {/* Phase Values Grid */}
                <div className="vb-phases">
                    <div
                        className="vb-phase phase-l1"
                        onClick={() => setSelectedPhase('phase1')}
                        title="Click to analyze L1"
                    >
                        <span className="vb-phase-label">L1</span>
                        <span className={`vb-phase-value ${isStale ? 'stale' : ''}`}
                            style={statusColor(displayData.v1) ? { color: statusColor(displayData.v1) } : undefined}>
                            {displayData.v1.toFixed(1)}
                        </span>
                        <span className="vb-phase-unit">V</span>
                        <div className="vb-phase-bar">
                            <div
                                className="vb-phase-fill fill-l1"
                                style={{ width: `${getBarWidth(displayData.v1)}%`, ...(statusColor(displayData.v1) ? { background: statusColor(displayData.v1), boxShadow: `0 0 6px ${statusColor(displayData.v1)}` } : {}) }}
                            />
                        </div>
                    </div>

                    <div
                        className="vb-phase phase-l2"
                        onClick={() => setSelectedPhase('phase2')}
                        title="Click to analyze L2"
                    >
                        <span className="vb-phase-label">L2</span>
                        <span className={`vb-phase-value ${isStale ? 'stale' : ''}`}
                            style={statusColor(displayData.v2) ? { color: statusColor(displayData.v2) } : undefined}>
                            {displayData.v2.toFixed(1)}
                        </span>
                        <span className="vb-phase-unit">V</span>
                        <div className="vb-phase-bar">
                            <div
                                className="vb-phase-fill fill-l2"
                                style={{ width: `${getBarWidth(displayData.v2)}%`, ...(statusColor(displayData.v2) ? { background: statusColor(displayData.v2), boxShadow: `0 0 6px ${statusColor(displayData.v2)}` } : {}) }}
                            />
                        </div>
                    </div>

                    <div
                        className="vb-phase phase-l3"
                        onClick={() => setSelectedPhase('phase3')}
                        title="Click to analyze L3"
                    >
                        <span className="vb-phase-label">L3</span>
                        <span className={`vb-phase-value ${isStale ? 'stale' : ''}`}
                            style={statusColor(displayData.v3) ? { color: statusColor(displayData.v3) } : undefined}>
                            {displayData.v3.toFixed(1)}
                        </span>
                        <span className="vb-phase-unit">V</span>
                        <div className="vb-phase-bar">
                            <div
                                className="vb-phase-fill fill-l3"
                                style={{ width: `${getBarWidth(displayData.v3)}%`, ...(statusColor(displayData.v3) ? { background: statusColor(displayData.v3), boxShadow: `0 0 6px ${statusColor(displayData.v3)}` } : {}) }}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer Stats */}
                <div className="vb-footer">
                    <div className="vb-stat">
                        <Activity size={12} className="vb-stat-icon" />
                        <span className="vb-stat-label">Avg</span>
                        <span className="vb-stat-value">{avgVoltage.toFixed(1)} V</span>
                    </div>
                    <div className="vb-stat">
                        <span className="vb-stat-label">Ref</span>
                        <span className="vb-stat-value">{nominalVoltage} V</span>
                    </div>
                </div>

                <style>{`
          .voltage-block-compact {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            background: #ffffff;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            padding: 0.75rem;
            font-family: 'Inter', sans-serif;
            transition: all 0.3s ease;
          }
          html.dark .voltage-block-compact {
            background: linear-gradient(145deg, #1e293b, #0f172a);
            border: 1px solid rgba(255,255,255,0.05);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          }
          .voltage-block-compact:hover {
            box-shadow: 0 8px 20px rgba(0,0,0,0.1);
          }
          html.dark .voltage-block-compact:hover {
            box-shadow: 0 8px 20px rgba(0,0,0,0.4);
            border-color: rgba(255,255,255,0.1);
          }

          /* Header */
          .vb-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
          }
          .vb-title-group {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .vb-icon {
            width: 28px;
            height: 28px;
            background: #fef3c7;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #d97706;
          }
          html.dark .vb-icon {
            background: rgba(217, 119, 6, 0.1);
            color: #fbbf24;
          }
          .vb-title-text {
            display: flex;
            flex-direction: column;
          }
          .vb-title {
            font-size: 0.7rem;
            font-weight: 700;
            color: #0f172a;
            letter-spacing: 0.05em;
            margin: 0;
            line-height: 1.2;
          }
          html.dark .vb-title {
            color: #f8fafc;
          }
          .vb-subtitle {
            font-size: 0.55rem;
            color: #64748b;
          }
          html.dark .vb-subtitle {
            color: #94a3b8;
          }

          /* Status Badge */
          .vb-status {
            font-size: 0.5rem;
            padding: 2px 6px;
            border-radius: 10px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .vb-status.online {
            background: rgba(16, 185, 129, 0.1);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.2);
          }
          .vb-status.offline {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.2);
          }
          .vb-status-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: currentColor;
            box-shadow: 0 0 6px currentColor;
          }

          /* Phases Grid */
          .vb-phases {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          .vb-phase {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem;
            border-radius: 8px;
            background: #f8fafc;
            cursor: pointer;
            transition: all 0.2s;
          }
          html.dark .vb-phase {
            background: rgba(255,255,255,0.03);
          }
          .vb-phase:hover {
            background: #f1f5f9;
            transform: translateX(2px);
          }
          html.dark .vb-phase:hover {
            background: rgba(255,255,255,0.06);
          }
          .vb-phase:active {
            transform: scale(0.98);
          }

          .vb-phase-label {
            font-size: 0.65rem;
            font-weight: 800;
            width: 22px;
            height: 22px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .phase-l1 .vb-phase-label {
            background: linear-gradient(135deg, #f87171, #ef4444);
            color: #fff;
          }
          .phase-l2 .vb-phase-label {
            background: linear-gradient(135deg, #facc15, #eab308);
            color: #1e293b;
          }
          .phase-l3 .vb-phase-label {
            background: linear-gradient(135deg, #60a5fa, #3b82f6);
            color: #fff;
          }

          .vb-phase-value {
            font-size: 1rem;
            font-weight: 700;
            font-family: 'Roboto Mono', monospace;
            color: #0f172a;
            min-width: 50px;
          }
          html.dark .vb-phase-value {
            color: #f8fafc;
          }
          .vb-phase-value.stale {
            color: #94a3b8;
          }

          .vb-phase-unit {
            font-size: 0.6rem;
            color: #64748b;
            font-weight: 600;
          }

          .vb-phase-bar {
            flex: 1;
            height: 4px;
            background: rgba(0,0,0,0.05);
            border-radius: 2px;
            overflow: hidden;
            margin-left: auto;
          }
          html.dark .vb-phase-bar {
            background: rgba(255,255,255,0.05);
          }
          .vb-phase-fill {
            height: 100%;
            border-radius: 2px;
            transition: width 0.4s ease;
          }
          .fill-l1 { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,0.5); }
          .fill-l2 { background: #eab308; box-shadow: 0 0 6px rgba(234,179,8,0.5); }
          .fill-l3 { background: #3b82f6; box-shadow: 0 0 6px rgba(59,130,246,0.5); }

          /* Footer */
          .vb-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 0.5rem;
            padding-top: 0.375rem;
            border-top: 1px solid #e2e8f0;
          }
          html.dark .vb-footer {
            border-top-color: rgba(255,255,255,0.05);
          }
          .vb-stat {
            display: flex;
            align-items: center;
            gap: 0.25rem;
          }
          .vb-stat-icon {
            color: #64748b;
          }
          html.dark .vb-stat-icon {
            color: #94a3b8;
          }
          .vb-stat-label {
            font-size: 0.55rem;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
          }
          html.dark .vb-stat-label {
            color: #94a3b8;
          }
          .vb-stat-value {
            font-size: 0.65rem;
            color: #0f172a;
            font-weight: 700;
            font-family: 'Roboto Mono', monospace;
            background: #f1f5f9;
            padding: 1px 4px;
            border-radius: 3px;
          }
          html.dark .vb-stat-value {
            color: #f8fafc;
            background: rgba(255,255,255,0.05);
          }

          /* Mobile Responsive */
          @media (max-width: 480px) {
            .voltage-block-compact {
              padding: 0.625rem;
            }
            .vb-icon {
              width: 24px;
              height: 24px;
            }
            .vb-icon svg {
              width: 14px;
              height: 14px;
            }
            .vb-title {
              font-size: 0.6rem;
            }
            .vb-phase {
              padding: 0.375rem;
              gap: 0.375rem;
            }
            .vb-phase-label {
              width: 20px;
              height: 20px;
              font-size: 0.6rem;
            }
            .vb-phase-value {
              font-size: 0.875rem;
              min-width: 40px;
            }
          }

          @media (max-width: 360px) {
            .voltage-block-compact {
              padding: 0.625rem;
            }
            .vb-phases {
              gap: 0.375rem;
            }
            .vb-phase-value {
              font-size: 0.8rem;
            }
            .vb-footer {
              flex-direction: column;
              align-items: flex-start;
              gap: 0.25rem;
            }
            .vb-stat {
              width: 100%;
              justify-content: space-between;
            }
          }
        `}</style>
            </div>

            {/* Modal Popup for Chart */}
            {selectedPhase && createPortal(
                <div className="history-chart-overlay fixed inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-200" onClick={() => setSelectedPhase(null)}>
                    <div className="history-chart-popup w-full max-w-[900px] max-h-[90vh] bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-slate-200 dark:border-indigo-500/20 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
                        <VoltageRealtimeChart
                            initialViewMode={selectedPhase}
                            onClose={() => setSelectedPhase(null)}
                            isPopup={true}
                        />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default VoltageBlock;
