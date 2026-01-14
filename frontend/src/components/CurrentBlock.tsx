import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';
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

  // Configuration: Rated Current (พิกัดกระแสสูงสุดของ Breaker)
  const ratedCurrent = 100; // Ampere

  const renderPhaseRow = (phase: string, value: number, colorTheme: 'red' | 'yellow' | 'blue', mode: CurrentViewMode) => {
    // Calculate percentage for bar width (capped at 100%)
    const percentage = Math.min((value / ratedCurrent) * 100, 100);

    return (
      <div
        className="current-row-modern clickable"
        onClick={() => setSelectedPhase(mode)}
        title={`Click to analyze ${phase} Current`}
      >
        {/* Phase Label Badge */}
        <div className={`phase-indicator indicator-${colorTheme}`}>
          {phase}
        </div>

        {/* Main Data Area */}
        <div className="data-area">
          <div className="data-header">
            <span className={`value-display ${isStale ? 'stale' : ''}`}>
              {value.toFixed(2)}
            </span>
            <span className="unit-display">A</span>
          </div>

          {/* Progress Bar Container */}
          <div className="bar-track">
            <div
              className={`bar-fill fill-${colorTheme}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

  const totalCurrent = displayData.i1 + displayData.i2 + displayData.i3;

  return (
    <>
      <div className="current-block-modern">
        {/* Card Header */}
        <div className="modern-header">
          <div className="title-group">
            <div className="icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="title-label">{t('power.current').toUpperCase()}</span>
          </div>

          {/* Status Badge */}
          <div className={`status-badge ${isConnected && !isStale ? 'status-ok' : 'status-err'}`}>
            <span className="status-dot" />
            {isConnected ? (isStale ? 'WAITING' : 'LIVE') : 'OFFLINE'}
          </div>
        </div>

        {/* Main Content */}
        <div className="modern-content">
          {renderPhaseRow('L1', displayData.i1, 'red', 'phase1')}
          {renderPhaseRow('L2', displayData.i2, 'yellow', 'phase2')}
          {renderPhaseRow('L3', displayData.i3, 'blue', 'phase3')}
        </div>

        {/* Footer Info */}
        <div className="modern-footer">
          <div className="footer-item">
            <span className="footer-label">Total Load</span>
            <span className="footer-value">{totalCurrent.toFixed(1)} A</span>
          </div>
          <div className="footer-item">
            <span className="footer-label">Rated</span>
            <span className="footer-value">{ratedCurrent} A</span>
          </div>
        </div>


      </div>

      {/* Modal Popup for Chart */}
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