import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import './ActivePowerBlock.css';
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';
import ActivePowerRealtimeChart, { PowerViewMode } from './ActivePowerRealtimeChart';

interface ActivePowerBlockProps {
  total?: number;
  phase1?: number;
  phase2?: number;
  phase3?: number;
}

const ActivePowerBlock: React.FC<ActivePowerBlockProps> = ({
  total = 0,
  phase1 = 0,
  phase2 = 0,
  phase3 = 0
}) => {
  const { energyData, isConnected, lastUpdate } = useWebSocket();
  const { t } = useLanguage();
  const [selectedView, setSelectedView] = useState<PowerViewMode | null>(null);

  const asNumber = (val: any, fallback = 0): number => {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const displayData = energyData ? {
    total: asNumber(energyData.power?.total, total),
    phase1: asNumber(energyData.power?.phase1, phase1),
    phase2: asNumber(energyData.power?.phase2, phase2),
    phase3: asNumber(energyData.power?.phase3, phase3)
  } : { total, phase1, phase2, phase3 };

  const dataAge = lastUpdate ? (Date.now() - lastUpdate.getTime()) / 1000 : 999;
  const isStale = dataAge > 15; // Increased tolerance for network latency
  const maxPhasePower = 100; // Configurable scale for visual bars

  const renderPhaseBar = (label: string, value: number, mode: PowerViewMode) => {
    const percentage = Math.min((value / maxPhasePower) * 100, 100);

    return (
      <div
        className="flex flex-col gap-1.5 p-1.5 rounded-lg cursor-pointer transition-colors duration-200 hover:bg-emerald-50 dark:hover:bg-white/5 active:bg-emerald-100 dark:active:bg-white/10 active:scale-[0.99]"
        onClick={() => setSelectedView(mode)}
        title={`Click to analyze ${label} Power Graph`}
      >
        <div className="flex justify-between items-center text-[0.8rem]">
          <span className="bg-emerald-100 dark:bg-white/5 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400 font-semibold font-sans">{label}</span>
          <span className="text-slate-900 dark:text-slate-200 font-mono font-semibold">{value.toFixed(1)} <span className="text-[0.7em] text-slate-500">W</span></span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
          <div
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="active-power-modern w-full min-h-[200px] rounded-xl border border-slate-200 dark:border-emerald-500/20 bg-white dark:bg-gradient-to-b dark:from-slate-800 dark:to-emerald-950 p-5 transition-all duration-200 hover:border-emerald-500/30 relative overflow-hidden flex flex-col font-sans shadow-sm dark:shadow-none">
        {/* Decorative Top Line */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 z-10" />

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-[0.85rem] font-bold text-emerald-800 dark:text-emerald-200 tracking-wider font-sans">{t('power.title').toUpperCase()}</span>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-[0.65rem] font-bold flex items-center gap-1.5 backdrop-blur-sm border ${isConnected && !isStale ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-red-500/15 text-red-400 border-red-500/20'}`}>
            <span className={`w-1.5 h-1.5 rounded-full bg-current`}></span>
            {isConnected ? (isStale ? 'WAITING' : 'ONLINE') : 'OFFLINE'}
          </div>
        </div>

        {/* Total Power Section (Clickable) */}
        <div
          className="text-center mb-8 relative p-2.5 cursor-pointer rounded-lg transition-colors hover:bg-emerald-50 dark:hover:bg-white/5 active:bg-emerald-100 dark:active:bg-white/10 active:scale-[0.99]"
          onClick={() => setSelectedView('total')}
          title="Click to analyze Total Power Graph"
        >
          <div className="text-[0.7rem] text-emerald-600 dark:text-emerald-300 tracking-[0.1em] mb-2 opacity-80 uppercase font-sans">TOTAL CONSUMPTION</div>
          <div className="flex justify-center items-baseline gap-1.5">
            <span className={`total-value text-5xl font-extrabold font-mono leading-none ${isStale ? 'text-slate-500' : 'text-slate-900 dark:text-white'}`}>
              {displayData.total.toFixed(1)}
            </span>
            <span className="text-base font-semibold text-emerald-600 dark:text-emerald-400">W</span>
          </div>
        </div>

        {/* Phase Breakdown */}
        <div className="flex flex-col gap-4">
          {renderPhaseBar('P1', displayData.phase1, 'phase1')}
          {renderPhaseBar('P2', displayData.phase2, 'phase2')}
          {renderPhaseBar('P3', displayData.phase3, 'phase3')}
        </div>

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent_70%)] pointer-events-none"></div>

        <div className="text-[0.65rem] text-slate-500 text-center mt-auto pt-4 italic font-sans">(Click rows for graph)</div>
      </div>

      {/* Modal Popup */}
      {/* Modal Popup */}
      {selectedView && createPortal(
        <div className="history-chart-overlay fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-200" onClick={() => setSelectedView(null)}>
          <div className="history-chart-popup w-full max-w-[900px] max-h-[90vh] bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-emerald-500/20 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
            <ActivePowerRealtimeChart
              initialViewMode={selectedView}
              onClose={() => setSelectedView(null)}
              isPopup={true}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default ActivePowerBlock;