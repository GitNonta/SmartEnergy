import React from 'react';
import './PowerFactorBlock.css';
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';

const PowerFactorBlock: React.FC = () => {
  const { energyData, isConnected, lastUpdate } = useWebSocket();
  const { t } = useLanguage();

  const asNumber = (val: any, fallback = 0): number => {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const display = {
    pf1: asNumber(energyData?.powerFactor?.pf1, 0),
    pf2: asNumber(energyData?.powerFactor?.pf2, 0),
    pf3: asNumber(energyData?.powerFactor?.pf3, 0)
  };

  const dataAge = lastUpdate ? (Date.now() - lastUpdate.getTime()) / 1000 : 999;
  const isStale = dataAge > 15;

  // Helper to get color based on efficiency
  const getPfColor = (val: number) => {
    if (isStale) return '#64748b';
    if (val >= 0.9) return '#10b981'; // Green (Good)
    if (val >= 0.8) return '#f59e0b'; // Amber (Warning)
    return '#ef4444'; // Red (Bad)
  };

  return (
    <div className="power-factor-block-component modern-card">
      <div className="card-header-label">{t('energy.powerFactor').toUpperCase()}</div>

      <div className="pf-container">
        {/* PF 1 */}
        <div className="pf-dial-wrapper">
          <svg viewBox="0 0 36 36" className="circular-chart">
            <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            <path
              className="circle"
              strokeDasharray={`${Math.min(display.pf1 * 100, 100)}, 100`}
              stroke={getPfColor(display.pf1)}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="pf-content">
            <span className="pf-label">L1</span>
            <span className="pf-value" style={{ color: getPfColor(display.pf1) }}>
              {display.pf1.toFixed(2)}
            </span>
          </div>
        </div>

        {/* PF 2 */}
        <div className="pf-dial-wrapper">
          <svg viewBox="0 0 36 36" className="circular-chart">
            <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            <path
              className="circle"
              strokeDasharray={`${Math.min(display.pf2 * 100, 100)}, 100`}
              stroke={getPfColor(display.pf2)}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="pf-content">
            <span className="pf-label">L2</span>
            <span className="pf-value" style={{ color: getPfColor(display.pf2) }}>
              {display.pf2.toFixed(2)}
            </span>
          </div>
        </div>

        {/* PF 3 */}
        <div className="pf-dial-wrapper">
          <svg viewBox="0 0 36 36" className="circular-chart">
            <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            <path
              className="circle"
              strokeDasharray={`${Math.min(display.pf3 * 100, 100)}, 100`}
              stroke={getPfColor(display.pf3)}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="pf-content">
            <span className="pf-label">L3</span>
            <span className="pf-value" style={{ color: getPfColor(display.pf3) }}>
              {display.pf3.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PowerFactorBlock;