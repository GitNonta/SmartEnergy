import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';
import { Zap, Activity } from 'lucide-react';
import CurrentRealtimeChart, { CurrentViewMode } from './CurrentRealtimeChart';

const CurrentBlock: React.FC = () => {
  const { energyData, isConnected, lastUpdate } = useWebSocket();
  const { t } = useLanguage();
  const [selectedPhase, setSelectedPhase] = useState<CurrentViewMode | null>(null);

  const asNumber = (val: any, fallback = 0): number => {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const displayData = {
    i1: asNumber(energyData?.current?.i1, 0),
    i2: asNumber(energyData?.current?.i2, 0),
    i3: asNumber(energyData?.current?.i3, 0)
  };

  const dataAge = lastUpdate ? (Date.now() - lastUpdate.getTime()) / 1000 : 999;
  const isStale = dataAge > 15;

  // Configuration: Rated Current
  const ratedCurrent = 100;
  const totalCurrent = displayData.i1 + displayData.i2 + displayData.i3;

  return (
    <>
      <div className="current-block-compact">
        {/* Header */}
        <div className="cb-header">
          <div className="cb-title-group">
            <div className="cb-icon">
              <Zap size={18} />
            </div>
            <div className="cb-title-text">
              <h3 className="cb-title">{t('power.current').toUpperCase()}</h3>
              <span className="cb-subtitle">3-Phase Monitor</span>
            </div>
          </div>
          <div className={`cb-status ${isConnected && !isStale ? 'online' : 'offline'}`}>
            <span className="cb-status-dot" />
            {isConnected ? (isStale ? 'WAIT' : 'LIVE') : 'OFF'}
          </div>
        </div>

        {/* Phase Values Grid */}
        <div className="cb-phases">
          <div
            className="cb-phase phase-l1"
            onClick={() => setSelectedPhase('phase1')}
            title="Click to analyze L1"
          >
            <span className="cb-phase-label">L1</span>
            <span className={`cb-phase-value ${isStale ? 'stale' : ''}`}>
              {displayData.i1.toFixed(2)}
            </span>
            <span className="cb-phase-unit">A</span>
            <div className="cb-phase-bar">
              <div
                className="cb-phase-fill fill-l1"
                style={{ width: `${Math.min((displayData.i1 / ratedCurrent) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div
            className="cb-phase phase-l2"
            onClick={() => setSelectedPhase('phase2')}
            title="Click to analyze L2"
          >
            <span className="cb-phase-label">L2</span>
            <span className={`cb-phase-value ${isStale ? 'stale' : ''}`}>
              {displayData.i2.toFixed(2)}
            </span>
            <span className="cb-phase-unit">A</span>
            <div className="cb-phase-bar">
              <div
                className="cb-phase-fill fill-l2"
                style={{ width: `${Math.min((displayData.i2 / ratedCurrent) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div
            className="cb-phase phase-l3"
            onClick={() => setSelectedPhase('phase3')}
            title="Click to analyze L3"
          >
            <span className="cb-phase-label">L3</span>
            <span className={`cb-phase-value ${isStale ? 'stale' : ''}`}>
              {displayData.i3.toFixed(2)}
            </span>
            <span className="cb-phase-unit">A</span>
            <div className="cb-phase-bar">
              <div
                className="cb-phase-fill fill-l3"
                style={{ width: `${Math.min((displayData.i3 / ratedCurrent) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="cb-footer">
          <div className="cb-stat">
            <Activity size={12} className="cb-stat-icon" />
            <span className="cb-stat-label">Total</span>
            <span className="cb-stat-value">{totalCurrent.toFixed(1)} A</span>
          </div>
          <div className="cb-stat">
            <span className="cb-stat-label">Rated</span>
            <span className="cb-stat-value">{ratedCurrent} A</span>
          </div>
        </div>

        <style>{`
          .current-block-compact {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            /* justify-content: space-between; <-- Removed */
            background: #ffffff;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            padding: 0.75rem;
            font-family: 'Inter', sans-serif;
            transition: all 0.3s ease;
          }
          /* ... dark, hover ... */
          html.dark .current-block-compact {
            background: linear-gradient(145deg, #1e293b, #0f172a);
            border: 1px solid rgba(255,255,255,0.05);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          }
          .current-block-compact:hover {
            box-shadow: 0 8px 20px rgba(0,0,0,0.1);
          }
          html.dark .current-block-compact:hover {
            box-shadow: 0 8px 20px rgba(0,0,0,0.4);
            border-color: rgba(255,255,255,0.1);
          }

          /* ... header ... */
          .cb-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
          }
          /* ... */

          /* Phases Grid */
          .cb-phases {
            display: flex;
            flex-direction: column;
            flex: 1; /* Grow locally */
            justify-content: space-evenly; /* Spread out */
            gap: 0.25rem;
            margin: 0.5rem 0;
          }
          .cb-phase {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem; /* Larger padding */
            border-radius: 8px;
            background: #f8fafc;
            cursor: pointer;
            transition: all 0.2s;
            min-height: 48px;
          }
          html.dark .cb-phase {
            background: rgba(255,255,255,0.03);
          }
          .cb-phase:hover {
            background: #f1f5f9;
            transform: translateX(2px);
          }
          html.dark .cb-phase:hover {
            background: rgba(255,255,255,0.06);
          }
          .cb-phase:active {
            transform: scale(0.98);
          }

          .cb-phase-label {
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
          .phase-l1 .cb-phase-label {
            background: linear-gradient(135deg, #f87171, #ef4444);
            color: #fff;
          }
          .phase-l2 .cb-phase-label {
            background: linear-gradient(135deg, #facc15, #eab308);
            color: #1e293b;
          }
          .phase-l3 .cb-phase-label {
            background: linear-gradient(135deg, #60a5fa, #3b82f6);
            color: #fff;
          }

          .cb-phase-value {
            font-size: 1rem;
            font-weight: 700;
            font-family: 'Roboto Mono', monospace;
            color: #0f172a;
            min-width: 50px;
          }
          html.dark .cb-phase-value {
            color: #f8fafc;
          }
          .cb-phase-value.stale {
            color: #94a3b8;
          }

          .cb-phase-unit {
            font-size: 0.6rem;
            color: #64748b;
            font-weight: 600;
          }

          .cb-phase-bar {
            flex: 1;
            height: 4px;
            background: rgba(0,0,0,0.05);
            border-radius: 2px;
            overflow: hidden;
            margin-left: auto;
          }
          html.dark .cb-phase-bar {
            background: rgba(255,255,255,0.05);
          }
          .cb-phase-fill {
            height: 100%;
            border-radius: 2px;
            transition: width 0.4s ease;
          }
          .fill-l1 { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,0.5); }
          .fill-l2 { background: #eab308; box-shadow: 0 0 6px rgba(234,179,8,0.5); }
          .fill-l3 { background: #3b82f6; box-shadow: 0 0 6px rgba(59,130,246,0.5); }

          /* Footer */
          .cb-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 0.5rem;
            padding-top: 0.375rem;
            border-top: 1px solid #e2e8f0;
          }
          html.dark .cb-footer {
            border-top-color: rgba(255,255,255,0.05);
          }
          .cb-stat {
            display: flex;
            align-items: center;
            gap: 0.25rem;
          }
          .cb-stat-icon {
            color: #64748b;
          }
          html.dark .cb-stat-icon {
            color: #94a3b8;
          }
          .cb-stat-label {
            font-size: 0.55rem;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
          }
          html.dark .cb-stat-label {
            color: #94a3b8;
          }
          .cb-stat-value {
            font-size: 0.65rem;
            color: #0f172a;
            font-weight: 700;
            font-family: 'Roboto Mono', monospace;
            background: #f1f5f9;
            padding: 1px 4px;
            border-radius: 3px;
          }
          html.dark .cb-stat-value {
            color: #f8fafc;
            background: rgba(255,255,255,0.05);
          }

          /* Mobile Responsive */
          @media (max-width: 480px) {
            .current-block-compact {
              padding: 0.625rem;
            }
            .cb-icon {
              width: 24px;
              height: 24px;
            }
            .cb-icon svg {
              width: 14px;
              height: 14px;
            }
            .cb-title {
              font-size: 0.6rem;
            }
            .cb-phase {
              padding: 0.375rem;
              gap: 0.375rem;
            }
            .cb-phase-label {
              width: 20px;
              height: 20px;
              font-size: 0.6rem;
            }
            .cb-phase-value {
              font-size: 0.875rem;
              min-width: 40px;
            }
          }

          @media (max-width: 360px) {
            .current-block-compact {
              padding: 0.625rem;
            }
            .cb-phases {
              gap: 0.375rem;
            }
            .cb-phase-value {
              font-size: 0.8rem;
            }
            .cb-footer {
              flex-direction: column;
              align-items: flex-start;
              gap: 0.25rem;
            }
            .cb-stat {
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
            <CurrentRealtimeChart
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

export default CurrentBlock;