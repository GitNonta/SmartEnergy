import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getApiBase } from '../config/api';
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';
import EnergyAccumulatedChart, { TimeViewMode } from './EnergyAccumulatedChart';
import { Download, X, Calendar, Database, FileSpreadsheet, TrendingUp, TrendingDown, Zap } from 'lucide-react';

interface EnergyAccumulatedBlockProps {
  daily?: number;
  monthly?: number;
  yearly?: number;
}

// CSV Export Modal Component
const CsvExportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useLanguage();
  const [bucket, setBucket] = useState('raw');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState('00:00');
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endTime, setEndTime] = useState('23:59');
  const [phase, setPhase] = useState('ALL');
  const [fields, setFields] = useState<string[]>([]);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NEW: Additional options
  const [measurement, setMeasurement] = useState('energy_3phase');
  const [aggregation, setAggregation] = useState('none');
  const [includeEnergy, setIncludeEnergy] = useState(true);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFields, setPreviewFields] = useState<string[]>([]);

  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return `${hour}:00`;
  });
  timeOptions.push('23:59');

  useEffect(() => {
    const fetchFields = async () => {
      setLoadingFields(true);
      try {
        const res = await fetch(`${getApiBase()}/api/data/export/fields?bucket=${bucket}`);
        if (res.ok) {
          const data = await res.json();
          setAvailableFields(data.fields || []);
          const commonFields = ['power_active_kw', 'energy_total', 'voltage', 'current', 'power_factor'];
          setFields(data.fields?.filter((f: string) => commonFields.includes(f)) || []);
        }
      } catch (err) {
        console.error('Error fetching fields:', err);
      } finally {
        setLoadingFields(false);
      }
    };
    fetchFields();
  }, [bucket]);

  // Build URL params
  const buildParams = (isPreview = false) => {
    const startDateTime = `${startDate}T${startTime}:00`;
    const endDateTime = `${endDate}T${endTime}:00`;

    const params = new URLSearchParams({
      bucket,
      startDate: startDateTime,
      endDate: endDateTime,
      measurement,
      aggregation,
      includeEnergy: includeEnergy.toString(),
      format: isPreview ? 'json' : 'csv',
      preview: isPreview.toString()
    });

    if (fields.length > 0) {
      params.append('fields', fields.join(','));
    }

    if (measurement === 'energy_per_phase' && phase !== 'ALL') {
      params.append('phase', phase);
    }

    return params;
  };

  // Preview handler
  const handlePreview = async () => {
    setPreviewLoading(true);
    setError(null);
    setPreviewData(null);

    try {
      const params = buildParams(true);
      const res = await fetch(`${getApiBase()}/api/data/export?${params}`);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || t('common.error'));
      }

      const data = await res.json();
      setPreviewData(data.data || []);
      setPreviewFields(data.fields || []);
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = buildParams(false);
      const response = await fetch(`${getApiBase()}/api/data/export?${params}`);

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || t('common.error'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const phaseLabel = measurement === 'energy_per_phase' && phase !== 'ALL' ? `_${phase}` : '';
      a.download = `energy_export_${bucket}_${measurement}${phaseLabel}_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      onClose();
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (field: string) => {
    setFields(prev =>
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  return (
    <div className="csv-export-modal no-scrollbar">
      <div className="csv-export-header">
        <FileSpreadsheet className="w-5 h-5" />
        <h3>{t('export.title')}</h3>
        <button onClick={onClose} className="close-btn">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="csv-export-body">
        {/* Row 1: Data Type + Aggregation */}
        <div className="form-row">
          <div className="form-group flex-1">
            <label><Database className="w-4 h-4" /> {t('export.dataType') || 'Data Type'}</label>
            <div className="custom-select-wrapper">
              <select value={measurement} onChange={e => setMeasurement(e.target.value)}>
                <option value="energy_3phase">3-Phase Total ({t('common.all')})</option>
                <option value="energy_per_phase">Per Phase (L1/L2/L3)</option>
              </select>
              <div className="custom-select-arrow">▼</div>
            </div>
          </div>

          <div className="form-group flex-1">
            <label>{t('export.aggregation') || 'Aggregation'}</label>
            <div className="custom-select-wrapper">
              <select value={aggregation} onChange={e => setAggregation(e.target.value)}>
                <option value="none">Raw Data</option>
                <option value="1h">Hourly Avg</option>
                <option value="1d">Daily Avg</option>
                <option value="1mo">Monthly Avg</option>
              </select>
              <div className="custom-select-arrow">▼</div>
            </div>
          </div>
        </div>

        {/* Row 2: Bucket + Phase (only if per-phase selected) */}
        <div className="form-row">
          <div className="form-group flex-1">
            <label><Database className="w-4 h-4" /> {t('export.dataSource')}</label>
            <div className="custom-select-wrapper">
              <select value={bucket} onChange={e => setBucket(e.target.value)}>
                <option value="raw">{t('export.buckets.raw')}</option>
                <option value="hourly">{t('export.buckets.hourly')}</option>
                <option value="daily">{t('export.buckets.daily')}</option>
              </select>
              <div className="custom-select-arrow">▼</div>
            </div>
          </div>

          {measurement === 'energy_per_phase' && (
            <div className="form-group flex-1">
              <label>{t('export.phase')}</label>
              <div className="custom-select-wrapper">
                <select value={phase} onChange={e => setPhase(e.target.value)}>
                  <option value="ALL">ALL ({t('common.all')})</option>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                </select>
                <div className="custom-select-arrow">▼</div>
              </div>
            </div>
          )}
        </div>

        {/* Include Energy Checkbox */}
        <div className="form-group" style={{ marginTop: '0.5rem' }}>
          <label className="field-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeEnergy}
              onChange={e => setIncludeEnergy(e.target.checked)}
            />
            <span>📊 {t('export.includeEnergy') || 'Include Energy (kWh) calculation'}</span>
          </label>
        </div>

        {/* Date-Time Range: Start */}
        <div className="form-group date-range">
          <label><Calendar className="w-4 h-4" /> {t('export.startDate')}</label>
          <div className="datetime-inputs">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <div className="time-select-wrapper">
              <select value={startTime} onChange={e => setStartTime(e.target.value)}>
                {timeOptions.map(tOption => (
                  <option key={`start-${tOption}`} value={tOption}>{tOption}</option>
                ))}
              </select>
              <div className="custom-select-arrow small">▼</div>
            </div>
          </div>
        </div>

        {/* Date-Time Range: End */}
        <div className="form-group date-range">
          <label><Calendar className="w-4 h-4" /> {t('export.endDate')}</label>
          <div className="datetime-inputs">
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            <div className="time-select-wrapper">
              <select value={endTime} onChange={e => setEndTime(e.target.value)}>
                {timeOptions.map(tOption => (
                  <option key={`end-${tOption}`} value={tOption}>{tOption}</option>
                ))}
              </select>
              <div className="custom-select-arrow small">▼</div>
            </div>
          </div>
        </div>

        {/* Field Selection */}
        <div className="form-group fields-group">
          <label>{t('export.selectFields')} {loadingFields && <span className="loading-text">({t('common.loading')})</span>}</label>
          <div className="fields-grid custom-scrollbar">
            {availableFields.length > 0 ? (
              availableFields.map(field => (
                <label key={field} className="field-checkbox">
                  <input
                    type="checkbox"
                    checked={fields.includes(field)}
                    onChange={() => toggleField(field)}
                  />
                  <span>{field}</span>
                </label>
              ))
            ) : (
              <p className="no-fields">{t('chart.noData')}</p>
            )}
          </div>
          <div className="fields-actions">
            <button type="button" onClick={() => setFields(availableFields)}>{t('export.selectAll')}</button>
            <button type="button" onClick={() => setFields([])}>{t('export.deselectAll')}</button>
          </div>
        </div>

        {/* Preview Table */}
        {previewData && previewData.length > 0 && (
          <div className="preview-table-container" style={{ marginTop: '1rem', maxHeight: '200px', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Time</th>
                  {previewFields.slice(0, 5).map(f => (
                    <th key={f} style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.4rem', fontSize: '0.7rem' }}>{new Date(row.time).toLocaleString()}</td>
                    {previewFields.slice(0, 5).map(f => (
                      <td key={f} style={{ padding: '0.4rem', textAlign: 'right' }}>
                        {typeof row[f] === 'number' ? row[f].toFixed(4) : row[f] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              👆 Showing 10 preview rows
            </div>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
      </div>

      <div className="csv-export-footer">
        <button onClick={onClose} className="btn-cancel">{t('common.cancel')}</button>
        <button
          onClick={handlePreview}
          disabled={previewLoading}
          className="btn-preview"
          style={{ background: 'var(--accent-secondary)', marginRight: '0.5rem' }}
        >
          {previewLoading ? '...' : '👁️ Preview'}
        </button>
        <button
          onClick={handleExport}
          disabled={loading}
          className="btn-export"
        >
          {loading ? t('export.downloading') : (
            <>
              <Download className="w-4 h-4" />
              {t('export.csv')}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const EnergyAccumulatedBlock: React.FC<EnergyAccumulatedBlockProps> = ({
  daily = 0,
  monthly = 0,
  yearly = 0
}) => {
  // Use WebSocket context for realtime updates
  const { energyData, isConnected } = useWebSocket();
  const { t } = useLanguage();

  // Fallback state for initial load from API
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [fallbackState, setFallbackState] = useState({
    daily: 0,
    monthly: 0,
    yearly: 0,
    meterTotal: 0
  });
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  // ✅ NEW: Comparison data state
  const [comparison, setComparison] = useState<{
    daily: { change: number; trend: 'up' | 'down' };
    weekly: { current: number; change: number; trend: 'up' | 'down' };
    monthly: { change: number; trend: 'up' | 'down' };
  } | null>(null);

  // ✅ NEW: Peak demand state
  const [peakDemand, setPeakDemand] = useState<{
    peak: number;
    time: string | null;
    average: number;
  } | null>(null);

  // Modal State
  const [selectedView, setSelectedView] = useState<TimeViewMode | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Fetch realtime data from raw bucket (polling every 30 seconds)
  useEffect(() => {
    const fetchRealtimeData = async () => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      if (!initialLoaded) setLoading(true);

      try {
        // Fetch all data including meter total, comparison, and peak
        const [dailyRes, monthlyRes, yearlyRes, meterRes, comparisonRes, peakRes] = await Promise.all([
          fetch(`${getApiBase()}/api/energy/daily-realtime`, { cache: 'no-store' }),
          fetch(`${getApiBase()}/api/energy/monthly-realtime`, { cache: 'no-store' }),
          fetch(`${getApiBase()}/api/energy/yearly-realtime`, { cache: 'no-store' }),
          fetch(`${getApiBase()}/api/energy/meter-total`, { cache: 'no-store' }),
          fetch(`${getApiBase()}/api/summary/comparison`, { cache: 'no-store' }),
          fetch(`${getApiBase()}/api/summary/peak`, { cache: 'no-store' })
        ]);

        let newState = { ...fallbackState };

        // Process Daily
        if (dailyRes.ok) {
          const dailyData = await dailyRes.json();
          if (dailyData.success) {
            newState.daily = dailyData.daily || 0;
          }
        }

        // Process Monthly
        if (monthlyRes.ok) {
          const monthlyData = await monthlyRes.json();
          if (monthlyData.success) {
            newState.monthly = monthlyData.monthly || 0;
          }
        }

        // Process Yearly
        if (yearlyRes.ok) {
          const yearlyData = await yearlyRes.json();
          if (yearlyData.success) {
            newState.yearly = yearlyData.yearly || 0;
          }
        }

        // Process Meter Total
        if (meterRes.ok) {
          const meterData = await meterRes.json();
          if (meterData.success) {
            newState.meterTotal = meterData.meterTotal || 0;
          }
        }

        // ✅ NEW: Process Comparison data
        if (comparisonRes.ok) {
          const compData = await comparisonRes.json();
          if (compData.success) {
            setComparison({
              daily: { change: compData.daily?.change || 0, trend: compData.daily?.trend || 'down' },
              weekly: {
                current: compData.weekly?.current || 0,
                change: compData.weekly?.change || 0,
                trend: compData.weekly?.trend || 'down'
              },
              monthly: { change: compData.monthly?.change || 0, trend: compData.monthly?.trend || 'down' }
            });
          }
        }

        // ✅ NEW: Process Peak demand data
        if (peakRes.ok) {
          const peakData = await peakRes.json();
          if (peakData.success) {
            setPeakDemand({
              peak: peakData.peak?.value || 0,
              time: peakData.peak?.time || null,
              average: peakData.average?.value || 0
            });
          }
        }

        setFallbackState(newState);
        console.log(`📊 Realtime energy: Daily=${newState.daily?.toFixed(3)}, Monthly=${newState.monthly?.toFixed(3)}, Yearly=${newState.yearly?.toFixed(3)}, Meter=${newState.meterTotal?.toFixed(2)} kWh`);
      } catch (error) {
        console.error('❌ Error fetching realtime energy:', error);
      } finally {
        setLoading(false);
        setInitialLoaded(true);
        fetchingRef.current = false;
      }
    };

    // Initial fetch
    fetchRealtimeData();

    // Poll every 30 seconds for realtime updates
    const interval = setInterval(fetchRealtimeData, 30000);

    return () => clearInterval(interval);
  }, []); // Empty dependency array is correct for mount-only effect

  // ✅ FIXED: ใช้ค่าจาก API (fallbackState) สำหรับ daily/monthly/yearly
  // WebSocket energyState ยังใช้ delta ของ Ep_total ซึ่งไม่ใช่ Power × Time
  // ดังนั้นต้องใช้ API ที่คำนวณจาก InfluxDB โดยตรง
  const display = {
    // ✅ ใช้ API (Power × Time) - ไม่ใช้ WebSocket เพราะยังคำนวณผิด
    daily: fallbackState.daily ?? daily,
    monthly: fallbackState.monthly ?? monthly,
    yearly: fallbackState.yearly ?? yearly,
    // ✅ Meter total: ใช้ WebSocket (MQTT โดยตรง) ก่อน, fallback เป็น API
    meterTotal: energyData?.energyAccumulated?.meterTotal ?? fallbackState.meterTotal ?? 0,
  };

  return (
    <>
      <div className="energy-accumulated-block-component modern-card">
        <div className="card-header-label">
          {t('energy.energyAccumulated').toUpperCase()}
          <button
            className="export-csv-btn"
            onClick={() => setShowExportModal(true)}
            title="Export data to CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
        <div className="energy-accumulated-container-component">

          {/* Daily Block (Clickable) */}
          <div
            className="energy-accumulated-item-component accent-cyan clickable"
            onClick={() => setSelectedView('daily')}
            title="Click to see Daily 24H Profile"
          >
            <div className="data-row">
              <span className="label">{t('energy.daily')}</span>
              {comparison?.daily && (
                <span className={`trend-badge ${comparison.daily.trend}`}>
                  {comparison.daily.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(comparison.daily.change).toFixed(1)}%
                </span>
              )}
              <span className="unit">kWh</span>
            </div>
            <div className="value-row">
              {loading && !initialLoaded ? <span className="loading-dots">...</span> : display.daily.toFixed(2)}
            </div>
            <div className="progress-bg"><div className="progress-bar" style={{ width: '45%' }}></div></div>
          </div>

          {/* Monthly Block (Clickable) */}
          <div
            className="energy-accumulated-item-component accent-blue clickable"
            onClick={() => setSelectedView('monthly')}
            title="Click to see Monthly 30D Profile"
          >
            <div className="data-row">
              <span className="label">{t('energy.monthly')}</span>
              {comparison?.monthly && (
                <span className={`trend-badge ${comparison.monthly.trend}`}>
                  {comparison.monthly.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(comparison.monthly.change).toFixed(1)}%
                </span>
              )}
              <span className="unit">kWh</span>
            </div>
            <div className="value-row">
              {loading && !initialLoaded ? <span className="loading-dots">...</span> : display.monthly.toFixed(2)}
            </div>
            <div className="progress-bg"><div className="progress-bar" style={{ width: '70%' }}></div></div>
          </div>

          {/* Yearly Block (Clickable) */}
          <div
            className="energy-accumulated-item-component accent-purple clickable"
            onClick={() => setSelectedView('yearly')}
            title="Click to see Yearly 12M Profile"
          >
            <div className="data-row">
              <span className="label">{t('energy.yearly')}</span>
              <span className="unit">kWh</span>
            </div>
            <div className="value-row">
              {loading && !initialLoaded ? <span className="loading-dots">...</span> : display.yearly.toFixed(2)}
            </div>
            <div className="progress-bg"><div className="progress-bar" style={{ width: '20%' }}></div></div>
          </div>

          {/* ✅ NEW: Meter Total Block (Ep_total ÷ 10) */}
          <div
            className="energy-accumulated-item-component accent-orange"
            title="Total energy from meter (Ep_total ÷ 10)"
          >
            <div className="data-row">
              <span className="label">Meter Total</span>
              <span className="unit">kWh</span>
            </div>
            <div className="value-row">
              {loading && !initialLoaded ? <span className="loading-dots">...</span> : display.meterTotal.toFixed(2)}
            </div>
            <div className="progress-bg"><div className="progress-bar accent-orange-bar" style={{ width: '100%' }}></div></div>
          </div>

        </div>

        {/* Peak Demand Footer */}
        {peakDemand && (
          <div className="peak-footer">
            <div className="peak-item">
              <Zap className="w-4 h-4 peak-icon" />
              <span className="peak-label">Peak:</span>
              <span className="peak-value">{peakDemand.peak.toFixed(1)} kW</span>
              {peakDemand.time && (
                <span className="peak-time">@ {new Date(peakDemand.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
            <span className="peak-divider">|</span>
            <div className="peak-item">
              <span className="peak-label">Avg:</span>
              <span className="peak-value">{peakDemand.average.toFixed(2)} kW</span>
            </div>
          </div>
        )}

        <div className="hint-text-bottom">(Click cards for graphs)</div>
      </div>

      {/* Chart Modal Popup */}
      {/* Chart Modal Popup */}
      {selectedView && createPortal(
        <div className="history-chart-overlay fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-200" onClick={() => setSelectedView(null)}>
          <div className="history-chart-popup w-full max-w-[900px] max-h-[90vh] bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-cyan-500/20 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
            <EnergyAccumulatedChart
              initialViewMode={selectedView}
              onClose={() => setSelectedView(null)}
              isPopup={true}
            />
          </div>
        </div>,
        document.body
      )}

      {/* CSV Export Modal */}
      {showExportModal && createPortal(
        <div className="history-chart-overlay fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-200" onClick={() => setShowExportModal(false)}>
          <div className="history-chart-popup w-full max-w-[600px] bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-cyan-500/20 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
            <CsvExportModal onClose={() => setShowExportModal(false)} />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default EnergyAccumulatedBlock;
