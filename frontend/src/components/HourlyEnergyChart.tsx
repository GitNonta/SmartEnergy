import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getApiBase } from '../config/api';
import { BarChart3, TrendingUp, RefreshCw, AlertTriangle } from 'lucide-react';

// CDN URL for ApexCharts
const APEXCHARTS_CDN_URL = "https://cdn.jsdelivr.net/npm/apexcharts";

// Theme Colors
const COLORS = {
    measured: '#22d3ee',     // Cyan - good data
    estimated: '#94a3b8',    // Grey - estimated
    invalid: '#ef4444',      // Red - invalid
    noData: '#334155',       // Dark - no data
    background: '#1e293b',
    border: 'rgba(255,255,255,0.05)'
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

// Fetch data from backend APIs
async function fetchChartData(mode: ChartViewMode, deviceId: string): Promise<DataPoint[]> {
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
                x: formatLabel(point._time, mode),
                y: Number(point._value || 0).toFixed(2),
                quality,
                fillColor: getColorByQuality(quality)
            };
        });

    } catch (error) {
        console.error('❌ Error fetching chart data:', error);
        return [];
    }
}

function formatLabel(time: string, mode: ChartViewMode): string {
    const date = new Date(time);

    switch (mode) {
        case 'hourly':
            return `${date.getHours().toString().padStart(2, '0')}:00`;
        case 'daily':
            return `${date.getDate()}/${date.getMonth() + 1}`;
        case 'monthly':
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return months[date.getMonth()];
    }
}

function getColorByQuality(quality: string): string {
    switch (quality) {
        case 'measured': return COLORS.measured;
        case 'estimated': return COLORS.estimated;
        case 'invalid': return COLORS.invalid;
        default: return COLORS.noData;
    }
}

export default function HourlyEnergyChart({
    initialViewMode = 'hourly',
    deviceId = 'AI205'
}: HourlyEnergyChartProps) {
    const [viewMode, setViewMode] = useState<ChartViewMode>(initialViewMode);
    const [chartData, setChartData] = useState<DataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const chartInstance = useRef<any>(null);
    const chartDivRef = useRef<HTMLDivElement>(null);

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
        const data = await fetchChartData(viewMode, deviceId);
        setChartData(data);
        setLastUpdate(new Date().toLocaleTimeString('th-TH'));
        setLoading(false);
    }, [viewMode, deviceId]);

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
            series: [{
                name: 'Energy (kWh)',
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
                    shade: 'dark',
                    type: 'vertical',
                    opacityFrom: 1,
                    opacityTo: 0.6,
                }
            },
            dataLabels: { enabled: false },
            xaxis: {
                categories: chartData.map(d => d.x),
                labels: {
                    style: { colors: '#94a3b8', fontSize: '10px' },
                    rotate: viewMode === 'hourly' ? -45 : 0
                },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                labels: { style: { colors: '#94a3b8' } },
                title: { text: 'kWh', style: { color: '#94a3b8' } }
            },
            grid: {
                borderColor: 'rgba(255,255,255,0.05)',
                strokeDashArray: 3,
            },
            tooltip: {
                theme: 'dark',
                custom: ({ dataPointIndex }: any) => {
                    const point = chartData[dataPointIndex];
                    const qualityLabel = point.quality === 'estimated' ? '⚠️ Estimated'
                        : point.quality === 'invalid' ? '❌ Invalid'
                            : '✅ Measured';
                    return `
            <div style="padding: 8px 12px; background: #1e293b; border-radius: 4px;">
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
    }, [isScriptLoaded, chartData, viewMode]);

    const getTotal = () => chartData.reduce((sum, d) => sum + Number(d.y), 0).toFixed(2);

    const getEstimatedCount = () => chartData.filter(d => d.quality === 'estimated').length;

    const getTitle = () => {
        switch (viewMode) {
            case 'hourly': return 'HOURLY CONSUMPTION';
            case 'daily': return 'DAILY CONSUMPTION';
            case 'monthly': return 'MONTHLY CONSUMPTION';
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
                            Total: <span className="highlight">{getTotal()}</span> kWh
                            {getEstimatedCount() > 0 && (
                                <span className="estimated-warning">
                                    <AlertTriangle size={12} /> {getEstimatedCount()} estimated
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
                            Hourly
                        </button>
                        <button
                            onClick={() => setViewMode('daily')}
                            className={`tab ${viewMode === 'daily' ? 'active daily' : ''}`}
                        >
                            Daily
                        </button>
                        <button
                            onClick={() => setViewMode('monthly')}
                            className={`tab ${viewMode === 'monthly' ? 'active monthly' : ''}`}
                        >
                            Monthly
                        </button>
                    </div>
                    <button onClick={loadData} className="refresh-btn" disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="quality-legend">
                <span className="legend-item"><span className="dot measured"></span> Measured</span>
                <span className="legend-item"><span className="dot estimated"></span> Estimated</span>
                <span className="legend-item"><span className="dot invalid"></span> Invalid</span>
            </div>

            {/* Chart */}
            <div className="chart-container">
                {loading && chartData.length === 0 ? (
                    <div className="loading">Loading...</div>
                ) : (
                    <div ref={chartDivRef} />
                )}
            </div>

            {/* Footer */}
            <div className="chart-footer">
                <span className="update-time">Last update: {lastUpdate}</span>
                <span className="source-badge">📊 Source: AI205_{viewMode}</span>
            </div>

            <style>{`
        .energy-chart-quality {
          background: linear-gradient(145deg, #1e293b, #111827);
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.05);
          padding: 1.5rem;
          color: #fff;
          font-family: 'Inter', sans-serif;
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
          background: rgba(34, 211, 238, 0.1);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #22d3ee;
        }

        .chart-title {
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin: 0;
          color: #f8fafc;
        }

        .chart-subtitle {
          font-size: 0.75rem;
          color: #94a3b8;
        }

        .chart-subtitle .highlight {
          color: #22d3ee;
          font-family: 'Roboto Mono', monospace;
          font-weight: 700;
        }

        .estimated-warning {
          margin-left: 8px;
          color: #f59e0b;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tabs {
          display: flex;
          background: rgba(0,0,0,0.2);
          padding: 4px;
          border-radius: 8px;
          gap: 4px;
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

        .tab:hover { color: #cbd5e1; }
        .tab.active { background: #334155; color: #fff; }
        .tab.active.hourly { background: #22d3ee; color: #000; }
        .tab.active.daily { background: #3b82f6; }
        .tab.active.monthly { background: #a855f7; }

        .refresh-btn {
          background: rgba(255,255,255,0.1);
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .refresh-btn:hover { background: rgba(255,255,255,0.2); color: #fff; }
        .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .refresh-btn .spin { animation: spin 1s linear infinite; }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .quality-legend {
          display: flex;
          gap: 16px;
          margin-bottom: 1rem;
          padding: 8px 12px;
          background: rgba(0,0,0,0.2);
          border-radius: 8px;
          font-size: 0.7rem;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
        }

        .legend-item .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .dot.measured { background: ${COLORS.measured}; }
        .dot.estimated { 
          background: ${COLORS.estimated}; 
          border: 2px dashed #64748b;
        }
        .dot.invalid { background: ${COLORS.invalid}; }

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
          border-top: 1px solid rgba(255,255,255,0.05);
          font-size: 0.7rem;
          color: #64748b;
        }

        .source-badge {
          background: rgba(34, 211, 238, 0.1);
          color: #22d3ee;
          padding: 4px 8px;
          border-radius: 4px;
        }

        @media (max-width: 600px) {
          .chart-header { flex-direction: column; }
          .controls { width: 100%; justify-content: space-between; }
          .quality-legend { flex-wrap: wrap; }
        }
      `}</style>
        </div>
    );
}
