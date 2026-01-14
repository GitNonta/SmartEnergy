import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';
import VoltageRealtimeChart, { ViewMode } from './VoltageRealtimeChart'; // Import Chart Component
import { Zap, Wifi, WifiOff } from 'lucide-react';

const FrequencyBlock: React.FC = () => {
  const { energyData, isConnected, lastUpdate } = useWebSocket();
  const { t } = useLanguage();
  const [selectedPhase, setSelectedPhase] = useState<ViewMode | null>(null); // State สำหรับ Modal

  const asNumber = (val: any, fallback = 0): number => {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const displayData = {
    f1: asNumber(energyData?.voltage?.f1, 0),
    f2: asNumber(energyData?.voltage?.f2, 0),
    f3: asNumber(energyData?.voltage?.f3, 0)
  };

  const dataAge = lastUpdate ? (Date.now() - lastUpdate.getTime()) / 1000 : 999;
  const isStale = dataAge > 15;

  const nominalVoltage = 230;
  const maxScale = 300;

  // ฟังก์ชันจัดการคลิกเลือกเฟส
  const handlePhaseClick = (phase: ViewMode) => {
    setSelectedPhase(phase);
  };

  const renderPhaseRow = (phaseName: string, value: number, colorClass: string, labelClass: string, viewMode: ViewMode) => {
    const percentage = Math.min((value / maxScale) * 100, 100);
    const nominalPercent = (nominalVoltage / maxScale) * 100;

    return (
      <div
        className="voltage-phase-row group flex flex-col gap-1.5 p-2 rounded-lg cursor-pointer transition-colors duration-200 hover:bg-blue-50 dark:hover:bg-white/5 active:bg-blue-100 dark:active:bg-white/10"
        onClick={() => handlePhaseClick(viewMode)} // เพิ่ม Click Event
        title={`Click to analyze ${phaseName} waveform`}
      >
        <div className="flex justify-between items-center text-[0.8rem]">
          <div className={`px-1.5 py-0.5 rounded text-[0.7rem] font-semibold tracking-wide border ${labelClass}`}>
            {phaseName}
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-lg font-bold font-mono leading-none ${isStale ? 'text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
              {value.toFixed(1)}
            </span>
            <span className="text-[0.7rem] text-slate-500 font-medium">V</span>
          </div>
        </div>

        <div className="relative h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-visible w-full mt-0.5">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out ${colorClass}`}
            style={{ width: `${percentage}%` }}
          ></div>
          <div
            className="absolute top-[-2px] w-0.5 h-2.5 bg-slate-400 dark:bg-white/30 rounded-[1px] transform -translate-x-1/2 z-10"
            style={{ left: `${nominalPercent}%` }}
            title="Nominal 230V"
          ></div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="frequency-block-component modern-voltage-card w-full min-h-[220px] rounded-xl border border-slate-200 dark:border-blue-500/20 bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-blue-950 p-5 transition-all duration-200 hover:border-blue-500/30 relative overflow-hidden flex flex-col font-sans shadow-sm dark:shadow-none">
        {/* Decorative Top Line */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 z-10" />

        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500"><Zap size={20} /></div>
            <span className="text-[0.85rem] font-bold text-slate-700 dark:text-blue-200 tracking-wider font-sans">{t('power.voltage').toUpperCase()}</span>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-[0.65rem] font-bold flex items-center gap-1.5 backdrop-blur-sm border transition-colors duration-300 ${isConnected && !isStale ? 'bg-blue-500/15 text-blue-400 border-blue-500/20' : 'bg-red-500/15 text-red-400 border-red-500/20'}`}>
            <div className={`w-1.5 h-1.5 rounded-full bg-current ${isConnected && !isStale ? 'animate-[pulse_2s_infinite]' : ''}`}></div>
            {isConnected ? (
              <>
                {isStale ? <WifiOff size={14} /> : <Wifi size={14} />}
                <span>{isStale ? 'Waiting' : 'Real-time'}</span>
              </>
            ) : (
              <>
                <WifiOff size={14} />
                <span>Offline</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 flex-1">
          {renderPhaseRow('L1', displayData.f1, 'bg-gradient-to-r from-red-500 to-red-400', 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20', 'phase1')}
          {renderPhaseRow('L2', displayData.f2, 'bg-gradient-to-r from-yellow-500 to-yellow-400', 'bg-yellow-50 text-yellow-600 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20', 'phase2')}
          {renderPhaseRow('L3', displayData.f3, 'bg-gradient-to-r from-blue-500 to-blue-400', 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20', 'phase3')}
        </div>

        <div className="flex justify-between items-center text-[0.65rem] text-slate-500 border-t border-slate-200 dark:border-white/5 pt-3 mt-4 font-sans">
          <span>Nominal: {nominalVoltage}V</span>

          <span>Max: {maxScale}V</span>
        </div>
      </div>

      {/* Modal Popup for Chart */}
      {/* Modal Popup for Chart */}
      {selectedPhase && createPortal(
        <div className="history-chart-overlay fixed inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-200" onClick={() => setSelectedPhase(null)}>
          <div className="history-chart-popup w-full max-w-[900px] max-h-[90vh] bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-slate-200 dark:border-blue-500/20 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
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

export default FrequencyBlock;