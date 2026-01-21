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

        const options = {
            chart: {
                type: chartType,
                height: '100%',  // Use parent container height
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

        return () => {
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
        <div className="energy-chart-quality" style={{ minHeight: '400px' }}>
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
            <div className="chart-container" style={{ position: 'relative', width: '100%', height: '280px' }}>
                {loading && chartData.length === 0 ? (
                    <div className="loading">{t('history.loading')}</div>
                ) : (
                    <div ref={chartDivRef} style={{ minHeight: '280px', width: '100%' }} />
                )}
            </div>

            {/* Footer */}
            {/* Footer */}
            <div className="chart-footer">
                <span className="source-badge">📊 {t('history.source')}: AI205_{viewMode}</span>
            </div>
        </div>
    );
}
