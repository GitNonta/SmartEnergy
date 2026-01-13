import React, { useState, useEffect, useCallback } from 'react';
import './StatisticsBlock.css';
import { getApiBase } from '../config/api';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from './AppShell';
import { Activity, Zap, Gauge, TrendingUp, AlertTriangle, RefreshCw, BarChart2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart, ReferenceLine } from 'recharts';

interface StatisticsData {
    success: boolean;
    timeRange: string;
    dataSource: string;
    aggregationMethod: string;
    power: { avg: number; max: number; min: number; stddev: number; unit: string };
    voltage: { avg: number; max: number; min: number; unit: string };
    current: { avg: number; max: number; min: number; unit: string };
    powerFactor: { avg: number; min: number };
    energy: { total: number; unit: string };
    peakTime: string | null;
    insights: string[];
    timestamp: string;
}

interface ChartDataPoint {
    time: string;
    hour: string;
    power: number;
    powerAvg: number;
}

interface StatCardProps {
    title: string;
    icon: React.ReactNode;
    avg: number;
    max: number;
    min: number;
    unit: string;
    showStddev?: boolean;
    stddev?: number;
    t: (key: string) => string;
}

const StatCard: React.FC<StatCardProps> = ({ title, icon, avg, max, min, unit, showStddev, stddev, t }) => (
    <div className="stat-card">
        <div className="stat-card-header">
            {icon}
            <span className="stat-card-title">{title}</span>
        </div>
        <div className="stat-card-values">
            <div className="stat-row stat-avg">
                <span className="stat-label">{t('statistics.avg')}</span>
                <span className="stat-value">{avg?.toFixed(2) || '0.00'} <span className="stat-unit">{unit}</span></span>
            </div>
            <div className="stat-row stat-max">
                <span className="stat-label">{t('statistics.max')}</span>
                <span className="stat-value">{max?.toFixed(2) || '0.00'} <span className="stat-unit">{unit}</span></span>
            </div>
            <div className="stat-row stat-min">
                <span className="stat-label">{t('statistics.min')}</span>
                <span className="stat-value">{min?.toFixed(2) || '0.00'} <span className="stat-unit">{unit}</span></span>
            </div>
            {showStddev && stddev !== undefined && (
                <div className="stat-row stat-stddev">
                    <span className="stat-label">σ</span>
                    <span className="stat-value">{stddev?.toFixed(3) || '0.000'}</span>
                </div>
            )}
        </div>
    </div>
);

// Custom tooltip for the chart
const CustomTooltip = ({ active, payload, label, t }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="chart-tooltip">
                <p className="tooltip-time">{label}</p>
                <p className="tooltip-value">
                    {t ? t('statistics.power') : 'Power'}: <strong>{payload[0]?.value?.toFixed(1)} W</strong>
                </p>
                {payload[1] && (
                    <p className="tooltip-avg">
                        {t ? t('statistics.avg') : 'Avg'}: {payload[1]?.value?.toFixed(1)} W
                    </p>
                )}
            </div>
        );
    }
    return null;
};

const StatisticsBlock: React.FC = () => {
    const [stats, setStats] = useState<StatisticsData | null>(null);
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [timeRange, setTimeRange] = useState('today');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showChart, setShowChart] = useState(true);

    const { t } = useLanguage();
    const { darkMode } = useTheme();

    const chartColors = {
        stroke: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        text: darkMode ? '#94a3b8' : '#64748b',
        grid: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
        area: darkMode ? '#3b82f6' : '#2563eb'
    };

    const fetchStatistics = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch aggregated statistics
            const response = await fetch(`${getApiBase()}/api/summary/statistics?timeRange=${timeRange}`);
            const data = await response.json();

            if (data.success) {
                setStats(data);
            } else {
                setError(data.error || 'Failed to fetch statistics');
            }

            // Fetch chart data (hourly power)
            const granularity = timeRange === 'today' || timeRange === 'yesterday' ? 'hour' : 'day';
            const rangeMap: Record<string, string> = {
                'today': '-1d',
                'yesterday': '-2d',
                'week': '-7d',
                'month': '-30d'
            };

            const chartResponse = await fetch(
                `${getApiBase()}/api/energy/range-summary?startDate=${rangeMap[timeRange]}&endDate=now()&granularity=${granularity}`
            );
            const chartResult = await chartResponse.json();

            if (chartResult.success && chartResult.chartData) {
                const formattedData = chartResult.chartData.map((point: any) => {
                    const date = new Date(point.time);
                    return {
                        time: point.time,
                        hour: granularity === 'hour'
                            ? date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                            : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
                        power: (point.power || 0) * 1000,  // Convert kW to W
                        powerAvg: data.success ? data.power.avg : 0  // Already in W from API
                    };
                });
                setChartData(formattedData);
            }
        } catch (err) {
            setError('Connection error');
            console.error('Error fetching statistics:', err);
        } finally {
            setLoading(false);
        }
    }, [timeRange]);

    useEffect(() => {
        fetchStatistics();
        const interval = setInterval(fetchStatistics, 30000);
        return () => clearInterval(interval);
    }, [fetchStatistics]);

    const timeRangeOptions = [
        { value: 'today', labelKey: 'statistics.today' },
        { value: 'yesterday', labelKey: 'statistics.yesterday' },
        { value: 'week', labelKey: 'statistics.last7Days' },
        { value: 'month', labelKey: 'statistics.last30Days' }
    ];

    return (
        <div className="statistics-block">
            <header className="statistics-header">
                <div className="statistics-title">
                    <Activity className="header-icon" />
                    <h3>{t('statistics.title')}</h3>
                </div>
                <div className="statistics-controls">
                    <button
                        className={`chart-toggle-btn ${showChart ? 'active' : ''}`}
                        onClick={() => setShowChart(!showChart)}
                        title={showChart ? t('statistics.hideChart') : t('statistics.showChart')}
                    >
                        <BarChart2 size={16} />
                    </button>
                    <select
                        className="time-range-select"
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                    >
                        {timeRangeOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                        ))}
                    </select>
                    <button
                        className="refresh-btn"
                        onClick={fetchStatistics}
                        disabled={loading}
                    >
                        <RefreshCw className={loading ? 'spinning' : ''} size={16} />
                    </button>
                </div>
            </header>

            {error && (
                <div className="statistics-error">
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {loading && !stats && (
                <div className="statistics-loading">{t('statistics.loading')}</div>
            )}

            {stats && (
                <>
                    {/* Power Trend Chart */}
                    {showChart && chartData.length > 0 && (
                        <div className="statistics-chart-container">
                            <div className="chart-header">
                                <Zap size={14} />
                                <span>{t('statistics.powerTrend')}</span>
                            </div>
                            <ResponsiveContainer width="100%" height={180}>
                                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                                    <XAxis
                                        dataKey="hour"
                                        tick={{ fill: chartColors.text, fontSize: 10 }}
                                        axisLine={{ stroke: chartColors.stroke }}
                                        tickLine={false}
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis
                                        tick={{ fill: chartColors.text, fontSize: 10 }}
                                        axisLine={{ stroke: chartColors.stroke }}
                                        tickLine={false}
                                        tickFormatter={(v) => `${v}`}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="power"
                                        stroke={chartColors.area}
                                        fill="url(#powerGradient)"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                    {/* Average Reference Line */}
                                    <ReferenceLine
                                        y={stats.power.avg}
                                        stroke="#facc15"
                                        strokeDasharray="5 5"
                                        strokeWidth={2}
                                        label={{
                                            value: `${t('statistics.avg')}: ${stats.power.avg.toFixed(0)} W`,
                                            fill: '#facc15',
                                            fontSize: 11,
                                            position: 'right'
                                        }}
                                    />
                                    {/* Max Reference Line */}
                                    <ReferenceLine
                                        y={stats.power.max}
                                        stroke="#ef4444"
                                        strokeDasharray="3 3"
                                        strokeWidth={1}
                                        opacity={0.6}
                                    />
                                    {/* Min Reference Line */}
                                    <ReferenceLine
                                        y={stats.power.min}
                                        stroke="#22c55e"
                                        strokeDasharray="3 3"
                                        strokeWidth={1}
                                        opacity={0.6}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                            <div className="chart-legend">
                                <span className="legend-item"><span className="legend-line avg"></span>{t('statistics.average')}</span>
                                <span className="legend-item"><span className="legend-line max"></span>{t('statistics.max')}</span>
                                <span className="legend-item"><span className="legend-line min"></span>{t('statistics.min')}</span>
                            </div>
                        </div>
                    )}

                    <div className="stats-grid">
                        <StatCard
                            title={t('statistics.power')}
                            icon={<Zap size={18} className="power-icon" />}
                            avg={stats.power.avg}
                            max={stats.power.max}
                            min={stats.power.min}
                            unit={stats.power.unit}
                            showStddev
                            stddev={stats.power.stddev}
                            t={t}
                        />
                        <StatCard
                            title={t('statistics.voltage')}
                            icon={<Gauge size={18} className="voltage-icon" />}
                            avg={stats.voltage.avg}
                            max={stats.voltage.max}
                            min={stats.voltage.min}
                            unit={stats.voltage.unit}
                            t={t}
                        />
                        <StatCard
                            title={t('statistics.current')}
                            icon={<Activity size={18} className="current-icon" />}
                            avg={stats.current.avg}
                            max={stats.current.max}
                            min={stats.current.min}
                            unit={stats.current.unit}
                            t={t}
                        />
                    </div>

                    <div className="stats-summary-row">
                        <div className="pf-card">
                            <div className="pf-header">
                                <TrendingUp size={16} />
                                <span>{t('statistics.powerFactor')}</span>
                            </div>
                            <div className="pf-values">
                                <div className="pf-item">
                                    <span className="pf-label">{t('statistics.avg')}</span>
                                    <span className={`pf-value ${stats.powerFactor.avg < 0.85 ? 'pf-low' : ''}`}>
                                        {stats.powerFactor.avg?.toFixed(3) || '0.000'}
                                    </span>
                                </div>
                                <div className="pf-item">
                                    <span className="pf-label">{t('statistics.min')}</span>
                                    <span className={`pf-value ${stats.powerFactor.min < 0.85 ? 'pf-low' : ''}`}>
                                        {stats.powerFactor.min?.toFixed(3) || '0.000'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="energy-total-card">
                            <div className="energy-header">
                                <Zap size={16} />
                                <span>{t('statistics.totalEnergy')}</span>
                            </div>
                            <div className="energy-value">
                                {stats.energy.total?.toFixed(2) || '0.00'}
                                <span className="energy-unit">{stats.energy.unit}</span>
                            </div>
                        </div>
                    </div>

                    {stats.insights && stats.insights.length > 0 && (
                        <div className="insights-section">
                            <h4>{t('statistics.insights')}</h4>
                            <ul className="insights-list">
                                {stats.insights.map((insight, idx) => (
                                    <li key={idx} className="insight-item">{insight}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="stats-footer">
                        <span className="data-source">{t('statistics.source')}: {stats.dataSource}</span>
                    </div>
                </>
            )}
        </div>
    );
};

export default StatisticsBlock;

