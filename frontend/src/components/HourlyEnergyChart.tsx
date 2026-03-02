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
                // ✅ FIX: Use 'today()' to match Daily Accumulated Block (Since Midnight)
                // Instead of '-24h' (Rolling), which causes discrepancies
                range = 'today()';
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

    const locale = language === 'th' ? 'th-TH' : 'en-US';

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

        const axisColor  = darkMode ? '#475569' : '#cbd5e1';
        const labelColor = darkMode ? '#94a3b8' : '#64748b';
        const gridColor  = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

        // Peak value for annotation line
        const maxVal = chartData.reduce((m, d) => Math.max(m, Number(d.y)), 0);

        const options = {
            chart: {
                type: chartType,
                height: '100%',
                background: 'transparent',
                toolbar: { show: false },
                zoom: { enabled: false },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 500,
                    animateGradually: { enabled: true, delay: 80 },
                    dynamicAnimation: { enabled: true, speed: 300 }
                },
                dropShadow: chartType === 'bar' ? {
                    enabled: true,
                    top: 4,
                    left: 0,
                    blur: 6,
                    color: palette.measured,
                    opacity: darkMode ? 0.15 : 0.08
                } : { enabled: false }
            },
            theme: { mode: darkMode ? 'dark' : 'light' },
            series: [{
                name: `${t('history.energy')} (kWh)`,
                data: chartData.map(d => ({ x: d.x, y: d.y, fillColor: d.fillColor }))
            }],
            plotOptions: {
                bar: {
                    borderRadius: viewMode === 'hourly' ? 6 : 5,
                    borderRadiusApplication: 'end' as const,
                    columnWidth: viewMode === 'hourly' ? '55%' : '50%',
                    distributed: true,
                },
                area: {
                    fillTo: 'origin' as const,
                }
            },
            colors: chartData.map(d => d.fillColor),
            stroke: chartType === 'area' ? {
                curve: 'smooth' as const,
                width: 2.5,
                dashArray: chartData.map(d => d.quality === 'estimated' ? 6 : 0)
            } : { show: false },
            fill: chartType === 'area' ? {
                type: 'gradient',
                gradient: {
                    type: 'vertical',
                    shadeIntensity: 0.5,
                    gradientToColors: [palette.measured + '00'],
                    opacityFrom: 0.5,
                    opacityTo: 0.02,
                    stops: [0, 85, 100]
                }
            } : {
                type: 'gradient',
                gradient: {
                    type: 'vertical',
                    gradientToColors: chartData.map(d =>
                        d.fillColor + (darkMode ? '88' : 'aa')
                    ),
                    opacityFrom: 1,
                    opacityTo: 0.75,
                    stops: [0, 100]
                }
            },
            dataLabels: { enabled: false },
            xaxis: {
                categories: chartData.map(d => d.x),
                labels: {
                    style: {
                        colors: Array(chartData.length).fill(labelColor),
                        fontSize: '10px',
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 500,
                    },
                    rotate: viewMode === 'hourly' ? -45 : 0,
                    rotateAlways: viewMode === 'hourly',
                    hideOverlappingLabels: true,
                    trim: false,
                },
                axisBorder: { show: false },
                axisTicks: { show: false },
                crosshairs: {
                    show: true,
                    stroke: { color: palette.measured, width: 1, dashArray: 4 }
                }
            },
            yaxis: {
                labels: {
                    style: { colors: [labelColor], fontSize: '10px', fontFamily: 'Inter, sans-serif' },
                    formatter: (v: number) => v >= 1 ? v.toFixed(2) : v.toFixed(3)
                },
                title: {
                    text: 'kWh',
                    style: { color: labelColor, fontSize: '10px', fontWeight: 600 }
                },
                min: 0,
            },
            grid: {
                borderColor: gridColor,
                strokeDashArray: 4,
                xaxis: { lines: { show: false } },
                yaxis: { lines: { show: true } },
                padding: { top: 8, right: 8, bottom: 0, left: 0 }
            },
            annotations: maxVal > 0 ? {
                yaxis: [{
                    y: maxVal,
                    borderColor: palette.measured,
                    borderWidth: 1,
                    strokeDashArray: 4,
                    label: {
                        text: `Peak: ${maxVal.toFixed(3)} kWh`,
                        position: 'right',
                        offsetX: -8,
                        style: {
                            background: darkMode ? 'rgba(30,41,59,0.9)' : 'rgba(255,255,255,0.9)',
                            color: palette.measured,
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: { top: 2, bottom: 2, left: 6, right: 6 },
                            borderRadius: 4,
                        }
                    }
                }]
            } : {},
            tooltip: {
                theme: darkMode ? 'dark' : 'light',
                custom: ({ dataPointIndex }: any) => {
                    const point = chartData[dataPointIndex];
                    if (!point) return '';
                    const qualityIcon  = point.quality === 'estimated' ? '⚠️'
                        : point.quality === 'invalid' ? '❌' : '✅';
                    const qualityText  = point.quality === 'estimated' ? t('history.estimated')
                        : point.quality === 'invalid'  ? t('history.invalid') : t('history.measured');
                    const bg     = darkMode ? '#0f172a' : '#ffffff';
                    const text   = darkMode ? '#f1f5f9' : '#0f172a';
                    const sub    = darkMode ? '#94a3b8'  : '#64748b';
                    const border = darkMode ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
                    const pct    = maxVal > 0 ? ((Number(point.y) / maxVal) * 100).toFixed(0) : '0';
                    return `
<div style="
  padding:10px 14px;
  background:${bg};
  border-radius:10px;
  color:${text};
  border:1px solid ${border};
  box-shadow:0 8px 24px rgba(0,0,0,${darkMode ? '0.4' : '0.12'});
  min-width:140px;
  font-family:Inter,sans-serif;
">
  <div style="font-size:0.7rem;color:${sub};margin-bottom:4px;font-weight:500;">${point.x}</div>
  <div style="font-size:1.3rem;font-weight:800;color:${point.fillColor};line-height:1.2;">${point.y}
    <span style="font-size:0.7rem;font-weight:500;color:${sub};">kWh</span>
  </div>
  <div style="
    display:flex;justify-content:space-between;align-items:center;
    margin-top:6px;padding-top:6px;
    border-top:1px solid ${border};
    font-size:0.67rem;
  ">
    <span style="color:${sub};">${qualityIcon} ${qualityText}</span>
    <span style="
      background:${point.fillColor}22;color:${point.fillColor};
      padding:1px 6px;border-radius:10px;font-weight:700;
    ">${pct}%</span>
  </div>
</div>`;
                }
            },
            states: {
                hover: { filter: { type: 'lighten', value: 0.08 } },
                active: { filter: { type: 'darken', value: 0.15 } }
            },
            legend: { show: false }
        };

        const chart = new ApexCharts(chartDivRef.current, options);
        chart.render();
        chartInstance.current = chart;

        return () => {
            if (chartInstance.current) chartInstance.current.destroy();
        };
    }, [isScriptLoaded, chartData, viewMode, darkMode]);

    const getTotal   = () => chartData.reduce((sum, d) => sum + Number(d.y), 0).toFixed(3);
    const getPeak    = () => chartData.reduce((m, d) => Math.max(m, Number(d.y)), 0).toFixed(3);
    const getAvg     = () => chartData.length > 0
        ? (chartData.reduce((s, d) => s + Number(d.y), 0) / chartData.length).toFixed(3)
        : '0.000';
    const getEstimatedCount = () => chartData.filter(d => d.quality === 'estimated').length;

    const getTitle = () => {
        switch (viewMode) {
            case 'hourly':  return t('history.hourlyConsumption');
            case 'daily':   return t('history.dailyConsumption');
            case 'monthly': return t('history.monthlyConsumption');
        }
    };

    const accentColor = darkMode ? '#22d3ee' : '#0891b2';

    return (
        <div className="energy-chart-quality" style={{ minHeight: '400px' }}>
            {/* ── Header ── */}
            <div className="chart-header">
                <div className="title-section">
                    <div className="icon-box">
                        {viewMode === 'hourly' ? <BarChart3 size={20} /> : <TrendingUp size={20} />}
                    </div>
                    <div>
                        <h2 className="chart-title">{getTitle()}</h2>
                        <span className="chart-subtitle">
                            {t('history.total')}: <span className="highlight">{getTotal()} kWh</span>
                            {getEstimatedCount() > 0 && (
                                <span className="estimated-warning">
                                    <AlertTriangle size={11} /> {getEstimatedCount()} {t('history.estimated')}
                                </span>
                            )}
                        </span>
                    </div>
                </div>

                <div className="controls">
                    <div className="tabs">
                        <button onClick={() => setViewMode('hourly')}  className={`tab ${viewMode === 'hourly'  ? 'active hourly'  : ''}`}>{t('export.buckets.hourly')}</button>
                        <button onClick={() => setViewMode('daily')}   className={`tab ${viewMode === 'daily'   ? 'active daily'   : ''}`}>{t('export.buckets.daily')}</button>
                        <button onClick={() => setViewMode('monthly')} className={`tab ${viewMode === 'monthly' ? 'active monthly' : ''}`}>{t('export.buckets.monthly')}</button>
                    </div>
                    <button onClick={loadData} className="refresh-btn" disabled={loading} title="Refresh">
                        <RefreshCw size={15} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* ── Mini stat cards ── */}
            {chartData.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    marginBottom: '12px',
                }}>
                    {[
                        { label: t('history.total'), value: getTotal(), unit: 'kWh', color: accentColor },
                        { label: 'Peak', value: getPeak(),  unit: 'kWh', color: darkMode ? '#f59e0b' : '#d97706' },
                        { label: 'Avg',  value: getAvg(),   unit: 'kWh', color: darkMode ? '#a78bfa' : '#7c3aed' },
                    ].map(s => (
                        <div key={s.label} style={{
                            background: darkMode ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.07)' : '#e2e8f0'}`,
                            borderRadius: '10px',
                            padding: '8px 10px',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '0.62rem', color: darkMode ? '#64748b' : '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                                {s.label}
                            </div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: s.color, lineHeight: 1.2 }}>
                                {s.value}
                                <span style={{ fontSize: '0.6rem', fontWeight: 500, color: darkMode ? '#475569' : '#94a3b8', marginLeft: '3px' }}>{s.unit}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Quality Legend ── */}
            <div className="quality-legend">
                <span className="legend-item"><span className="dot measured"></span>{t('history.measured')}</span>
                <span className="legend-item"><span className="dot estimated"></span>{t('history.estimated')}</span>
                <span className="legend-item"><span className="dot invalid"></span>{t('history.invalid')}</span>
            </div>

            {/* ── Chart ── */}
            <div className="chart-container" style={{ width: '100%', height: '260px' }}>
                {loading && chartData.length === 0 ? (
                    <div className="loading" data-text={t('history.loading')} />
                ) : (
                    <div ref={chartDivRef} style={{ width: '100%', height: '100%' }} />
                )}
            </div>

            {/* ── Footer ── */}
            <div className="chart-footer">
                <span className="source-badge">
                    📊 {t('history.source')}: AI205_{viewMode}
                    {lastUpdate && (
                        <span style={{ marginLeft: 6, opacity: 0.7 }}>· {lastUpdate}</span>
                    )}
                </span>
            </div>
        </div>
    );
}
