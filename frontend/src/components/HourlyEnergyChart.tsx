import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getApiBase } from '../config/api';
import { BarChart3, TrendingUp, RefreshCw, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from './AppShell';

// CDN URL for ApexCharts
const APEXCHARTS_CDN_URL = "https://cdn.jsdelivr.net/npm/apexcharts";

// Theme Colors
const THEME_COLORS = {
    dark: {
        measured: '#22d3ee',     // Cyan-400
        estimated: '#94a3b8',    // Slate-400
        invalid: '#ef4444',      // Red-500
        noData: '#334155',       // Slate-700
    },
    light: {
        measured: '#0891b2',     // Cyan-600 (darker for white bg)
        estimated: '#64748b',    // Slate-500
        invalid: '#dc2626',      // Red-600
        noData: '#cbd5e1',       // Slate-300
    }
};

export type ChartViewMode = 'hourly' | 'daily' | 'monthly';

interface HourlyEnergyChartProps {
    initialViewMode?: ChartViewMode;
    deviceId?: string;
}

interface DataPoint {
    x: string;
    y: number;
    quality?: 'measured' | 'estimated' | 'invalid' | 'no_data';
    fillColor?: string;
}

// Helper to get color based on mode
function getColorByQuality(quality: string, isDark: boolean): string {
    const palette = isDark ? THEME_COLORS.dark : THEME_COLORS.light;
    switch (quality) {
        case 'measured': return palette.measured;
        case 'estimated': return palette.estimated;
        case 'invalid': return palette.invalid;
        default: return palette.noData;
    }
}

// Fetch data from backend APIs
async function fetchChartData(mode: ChartViewMode, deviceId: string, isDark: boolean, locale: string): Promise<DataPoint[]> {
    try {
        let endpoint = '';
        let range = '';

        switch (mode) {
            case 'hourly':
                endpoint = '/api/chart/hourly';
                range = '-24h';
                break;
            case 'daily':
                endpoint = '/api/report/daily';
                range = '-30d';
                break;
            case 'monthly':
                endpoint = '/api/billing/monthly';
                range = '-365d';
                break;
        }

        const response = await fetch(
            `${getApiBase()}${endpoint}?range=${range}&deviceId=${deviceId}`,
            { cache: 'no-store' }
        );

        if (!response.ok) {
            console.warn(`⚠️ API returned ${response.status}`);
            return [];
        }

        const result = await response.json();

        if (!result.success || !Array.isArray(result.data)) {
            console.warn('⚠️ Invalid data format');
            return [];
        }

        // Transform data with quality-based colors
        return result.data.map((point: any) => {
            const quality = point.quality?.is_valid === false ? 'invalid'
                : point.quality?.estimated ? 'estimated'
                    : point.quality?.time_skewed ? 'estimated'
                        : 'measured';

            return {
                x: formatLabel(point._time, mode, locale),
                y: Number(point._value || 0).toFixed(2),
                quality,
                fillColor: getColorByQuality(quality, isDark)
            };
        });

    } catch (error) {
        console.error('❌ Error fetching chart data:', error);
        return [];
    }
}

function formatLabel(time: string, mode: ChartViewMode, locale: string): string {
    const date = new Date(time);

    switch (mode) {
        case 'hourly':
            return `${date.getHours().toString().padStart(2, '0')}:00`;
        case 'daily':
            return date.toLocaleDateString(locale, { day: 'numeric', month: 'numeric' });
        case 'monthly':
            return date.toLocaleDateString(locale, { month: 'short' });
    }
}

export default function HourlyEnergyChart({
    initialViewMode = 'hourly',
    deviceId = 'AI205'
}: HourlyEnergyChartProps) {
    const { t, language } = useLanguage();
    const { darkMode } = useTheme();
    const [viewMode, setViewMode] = useState<ChartViewMode>(initialViewMode);
    const [chartData, setChartData] = useState<DataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const chartInstance = useRef<any>(null);
    const chartDivRef = useRef<HTMLDivElement>(null);

    const locale = language === 'th' ? 'th-TH' : language === 'zh' ? 'zh-CN' : 'en-US';

    // Load ApexCharts
    useEffect(() => {
        if ((window as any).ApexCharts) {
            setIsScriptLoaded(true);
        } else {
            const script = document.createElement('script');
            script.src = APEXCHARTS_CDN_URL;
            script.crossOrigin = 'anonymous';
            script.onload = () => setIsScriptLoaded(true);
            document.head.appendChild(script);
        }
    }, []);

    // Fetch data
    const loadData = useCallback(async () => {
        setLoading(true);
        const data = await fetchChartData(viewMode, deviceId, darkMode, locale);
        setChartData(data);
        setLastUpdate(new Date().toLocaleTimeString(locale));
        setLoading(false);
    }, [viewMode, deviceId, darkMode, locale]);

    useEffect(() => {
        loadData();

        // Auto-refresh: hourly every 30s, daily every 5min, monthly every 30min
        const intervals = { hourly: 30000, daily: 300000, monthly: 1800000 };
        const interval = setInterval(loadData, intervals[viewMode]);

        return () => clearInterval(interval);
    }, [loadData, viewMode]);

    // Render chart
    useEffect(() => {
        if (!isScriptLoaded || !chartDivRef.current || chartData.length === 0) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
            chartInstance.current = null;
        }

        const ApexCharts = (window as any).ApexCharts;
        const palette = darkMode ? THEME_COLORS.dark : THEME_COLORS.light;

        // Determine chart type based on mode
        const chartType = viewMode === 'hourly' ? 'bar' : 'area';

        const options = {
            chart: {
                type: chartType,
                height: 350,
                background: 'transparent',
                toolbar: { show: false },
                animations: { enabled: true, easing: 'easeinout', speed: 300 }
            },
            theme: { mode: darkMode ? 'dark' : 'light' },
            series: [{
                name: `${t('history.energy')} (kWh)`,
                data: chartData.map(d => ({ x: d.x, y: d.y, fillColor: d.fillColor }))
            }],
            plotOptions: {
                bar: {
                    borderRadius: 4,
                    columnWidth: '60%',
                    distributed: true, // Enable individual bar colors
                }
            },
            colors: chartData.map(d => d.fillColor),
            stroke: chartType === 'area' ? {
                curve: 'smooth',
                width: 2,
                dashArray: chartData.map(d => d.quality === 'estimated' ? 5 : 0) // Dashed for estimated
            } : undefined,
            fill: chartType === 'area' ? {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.6,
                    opacityTo: 0.1,
                    stops: [0, 90, 100]
                }
            } : {
                type: 'gradient',
                gradient: {
                    type: 'vertical',
                    opacityFrom: 1,
                    opacityTo: 0.6,
                }
            },
            dataLabels: { enabled: false },
            xaxis: {
                categories: chartData.map(d => d.x),
                labels: {
                    style: { colors: darkMode ? '#94a3b8' : '#64748b', fontSize: '10px' },
                    rotate: viewMode === 'hourly' ? -45 : 0
                },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                labels: { style: { colors: darkMode ? '#94a3b8' : '#64748b' } },
                title: { text: 'kWh', style: { color: darkMode ? '#94a3b8' : '#64748b' } }
            },
            grid: {
                borderColor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                strokeDashArray: 3,
            },
            tooltip: {
                theme: darkMode ? 'dark' : 'light',
                custom: ({ dataPointIndex }: any) => {
                    const point = chartData[dataPointIndex];
                    const qualityLabel = point.quality === 'estimated' ? `⚠️ ${t('history.estimated')}`
                        : point.quality === 'invalid' ? `❌ ${t('history.invalid')}`
                            : `✅ ${t('history.measured')}`;
                    const bg = darkMode ? '#1e293b' : '#ffffff';
                    const text = darkMode ? '#ffffff' : '#0f172a';
                    const border = darkMode ? 'rgba(255,255,255,0.1)' : '#e2e8f0';
                    return `
            <div style="padding: 8px 12px; background: ${bg}; border-radius: 4px; color: ${text}; border: 1px solid ${border}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <div style="font-weight: 600;">${point.x}</div>
              <div style="color: ${point.fillColor}; font-size: 1.2em;">${point.y} kWh</div>
              <div style="font-size: 0.8em; opacity: 0.8;">${qualityLabel}</div>
            </div>
          `;
                }
            },
            legend: { show: false }
        };

        const chart = new ApexCharts(chartDivRef.current, options);
        chart.render();
        chartInstance.current = chart;

        if (chartInstance.current) chartInstance.current.destroy();
    };
}, [isScriptLoaded, chartData, viewMode, darkMode]);

const getTotal = () => chartData.reduce((sum, d) => sum + Number(d.y), 0).toFixed(2);

const getEstimatedCount = () => chartData.filter(d => d.quality === 'estimated').length;

const getTitle = () => {
    switch (viewMode) {
        case 'hourly': return t('history.hourlyConsumption');
        case 'daily': return t('history.dailyConsumption');
        case 'monthly': return t('history.monthlyConsumption');
    }
};

return (
    <div className="energy-chart-quality">
        {/* Header */}
        <div className="chart-header">
            <div className="title-section">
                <div className="icon-box">
                    {viewMode === 'hourly' ? <BarChart3 size={20} /> : <TrendingUp size={20} />}
                </div>
                <div>
                    <h2 className="chart-title">{getTitle()}</h2>
                    <span className="chart-subtitle">
                        {t('history.total')}: <span className="highlight">{getTotal()}</span> kWh
                        {getEstimatedCount() > 0 && (
                            <span className="estimated-warning">
                                <AlertTriangle size={12} /> {getEstimatedCount()} {t('history.estimated')}
                            </span>
                        )}
                    </span>
                </div>
            </div>

            <div className="controls">
                <div className="tabs">
                    <button
                        onClick={() => setViewMode('hourly')}
                        className={`tab ${viewMode === 'hourly' ? 'active hourly' : ''}`}
                    >
                        {t('export.buckets.hourly')}
                    </button>
                    <button
                        onClick={() => setViewMode('daily')}
                        className={`tab ${viewMode === 'daily' ? 'active daily' : ''}`}
                    >
                        {t('export.buckets.daily')}
                    </button>
                    <button
                        onClick={() => setViewMode('monthly')}
                        className={`tab ${viewMode === 'monthly' ? 'active monthly' : ''}`}
                    >
                        {t('export.buckets.monthly')}
                    </button>
                </div>
                <button onClick={loadData} className="refresh-btn" disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                </button>
            </div>
        </div>

        {/* Legend */}
        <div className="quality-legend">
            <span className="legend-item"><span className="dot measured"></span> {t('history.measured')}</span>
            <span className="legend-item"><span className="dot estimated"></span> {t('history.estimated')}</span>
            <span className="legend-item"><span className="dot invalid"></span> {t('history.invalid')}</span>
        </div>

        {/* Chart */}
        <div className="chart-container">
            {loading && chartData.length === 0 ? (
                <div className="loading">{t('history.loading')}</div>
            ) : (
                <div ref={chartDivRef} />
            )}
        </div>

        {/* Footer */}
        {/* Footer */}
        <div className="chart-footer">
            <span className="source-badge">📊 {t('history.source')}: AI205_{viewMode}</span>
        </div>

        <style>{`
        .energy-chart-quality {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          padding: 1.5rem;
          color: #1e293b;
          font-family: 'Inter', sans-serif;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        
        html.dark .energy-chart-quality {
          background: linear-gradient(145deg, #1e293b, #111827);
          border: 1px solid rgba(255,255,255,0.05);
          color: #fff;
          box-shadow: none;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .title-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .icon-box {
          width: 40px;
          height: 40px;
          background: #cffafe;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #06b6d4;
        }
        
        html.dark .icon-box {
            background: rgba(34, 211, 238, 0.1);
            color: #22d3ee;
        }

        .chart-title {
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin: 0;
          color: #0f172a;
        }
        
        html.dark .chart-title {
            color: #f8fafc;
        }

        .chart-subtitle {
          font-size: 0.75rem;
          color: #64748b;
        }
        
        html.dark .chart-subtitle {
            color: #94a3b8;
        }

        .chart-subtitle .highlight {
          color: #0891b2;
          font-family: 'Roboto Mono', monospace;
          font-weight: 700;
        }
        
        html.dark .chart-subtitle .highlight {
            color: #22d3ee;
        }

        .estimated-warning {
          margin-left: 8px;
          color: #d97706;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        
        html.dark .estimated-warning {
            color: #f59e0b;
        }

        .controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tabs {
          display: flex;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 8px;
          gap: 4px;
        }
        
        html.dark .tabs {
            background: rgba(0,0,0,0.2);
        }

        .tab {
          border: none;
          background: transparent;
          color: #64748b;
          padding: 6px 12px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .tab:hover { color: #334155; }
        html.dark .tab:hover { color: #cbd5e1; }
        
        .tab.active { background: #ffffff; color: #0f172a; shadow: 0 1px 2px rgba(0,0,0,0.05); }
        html.dark .tab.active { background: #334155; color: #fff; }
        
        .tab.active.hourly { color: #0891b2; } 
        html.dark .tab.active.hourly { background: #22d3ee; color: #000; }
        
        .tab.active.daily { color: #2563eb; }
        html.dark .tab.active.daily { background: #3b82f6; color: #fff; }
        
        .tab.active.monthly { color: #9333ea; }
        html.dark .tab.active.monthly { background: #a855f7; color: #fff; }

        .refresh-btn {
          background: #f1f5f9;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        
        html.dark .refresh-btn {
            background: rgba(255,255,255,0.1);
            color: #94a3b8;
        }

        .refresh-btn:hover { background: #e2e8f0; color: #0f172a; }
        html.dark .refresh-btn:hover { background: rgba(255,255,255,0.2); color: #fff; }
        
        .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .refresh-btn .spin { animation: spin 1s linear infinite; }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .quality-legend {
          display: flex;
          gap: 16px;
          margin-bottom: 1rem;
          padding: 8px 12px;
          background: #f8fafc;
          border-radius: 8px;
          font-size: 0.7rem;
        }
        
        html.dark .quality-legend {
            background: rgba(0,0,0,0.2);
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #64748b;
        }
        
        html.dark .legend-item {
            color: #94a3b8;
        }

        .legend-item .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .dot.measured { background: ${THEME_COLORS.light.measured}; }
        html.dark .dot.measured { background: ${THEME_COLORS.dark.measured}; }

        .dot.estimated { 
          background: ${THEME_COLORS.light.estimated}; 
          border: 2px dashed #64748b;
        }
        html.dark .dot.estimated { 
            background: ${THEME_COLORS.dark.estimated}; 
        }

        .dot.invalid { background: ${THEME_COLORS.light.invalid}; }
        html.dark .dot.invalid { background: ${THEME_COLORS.dark.invalid}; }

        .chart-container {
          min-height: 350px;
          position: relative;
        }

        .loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #64748b;
        }

        .chart-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
          font-size: 0.7rem;
          color: #64748b;
        }
        
        html.dark .chart-footer {
            border-top: 1px solid rgba(255,255,255,0.05);
        }

        .source-badge {
          background: #cffafe;
          color: #0891b2;
          padding: 4px 8px;
          border-radius: 4px;
        }
        
        html.dark .source-badge {
            background: rgba(34, 211, 238, 0.1);
            color: #22d3ee;
        }

        @media (max-width: 600px) {
          .chart-header { flex-direction: column; }
          .controls { width: 100%; justify-content: space-between; }
          .quality-legend { flex-wrap: wrap; }
        }
      `}</style>
    </div>
);

