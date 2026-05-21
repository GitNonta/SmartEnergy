import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getApiBase } from '../config/api';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from './AppShell';
import { 
    Activity, Zap, Gauge, TrendingUp, AlertTriangle, RefreshCw, BarChart2, 
    Database, Info, ArrowUpRight, ArrowDownRight, Clock, Lightbulb, 
    CheckCircle, XCircle, TrendingDown, Coins, HelpCircle
} from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart, ReferenceLine } from 'recharts';

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
    <div className="stat-card group">
        <div className="stat-card-header">
            <div className="p-1.5 rounded-lg bg-slate-500/10 group-hover:bg-slate-500/20 transition-colors">
                {icon}
            </div>
            <span className="stat-card-title">{title}</span>
        </div>
        <div className="stat-card-values">
            <div className="stat-row stat-avg">
                <span className="stat-label">{t('statistics.avg')}</span>
                <span className="stat-value">
                    {avg?.toFixed(2) || '0.00'} 
                    <span className="stat-unit">{unit}</span>
                </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-white/5">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                        <ArrowUpRight size={10} className="text-red-400" /> {t('statistics.max')}
                    </span>
                    <span className="text-xs font-black text-red-400/90 tabular-nums">
                        {max?.toFixed(1) || '0.0'} <span className="text-[9px] font-bold opacity-60">{unit}</span>
                    </span>
                </div>
                <div className="flex flex-col border-l border-white/5 pl-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                        <ArrowDownRight size={10} className="text-emerald-400" /> {t('statistics.min')}
                    </span>
                    <span className="text-xs font-black text-emerald-400/90 tabular-nums">
                        {min?.toFixed(1) || '0.0'} <span className="text-[9px] font-bold opacity-60">{unit}</span>
                    </span>
                </div>
            </div>
            {showStddev && stddev !== undefined && (
                <div className="mt-2 text-[9px] text-slate-500 font-bold uppercase tracking-wider flex justify-between items-center bg-white/5 px-2 py-1 rounded-md">
                    <span>Variance</span>
                    <span className="text-indigo-300">{stddev?.toFixed(3) || '0.000'}</span>
                </div>
            )}
        </div>
    </div>
);

const CustomTooltip = ({ active, payload, label, t }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="chart-tooltip ring-1 ring-white/10 backdrop-blur-xl bg-slate-900/80 p-3 rounded-2xl shadow-2xl">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                    <Clock size={12} className="text-slate-400" />
                    <p className="text-xs font-black text-white uppercase tracking-tighter">{label}</p>
                </div>
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{t ? t('statistics.power') : 'Power'}</span>
                        </div>
                        <span className="text-xs font-black text-blue-400 tabular-nums">{payload[0]?.value?.toFixed(1)} W</span>
                    </div>
                    {payload[1] && (
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase">{t ? t('statistics.avg') : 'Avg'}</span>
                            </div>
                            <span className="text-xs font-black text-amber-400 tabular-nums">{payload[1]?.value?.toFixed(1)} W</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    return null;
};

// Helper to render insight text with icons instead of emojis
const InsightText: React.FC<{ text: string }> = ({ text }) => {
    // Map of emojis to icons
    const emojiMap: Record<string, React.ReactNode> = {
        '⚡': <Zap size={14} className="text-yellow-400 inline-block mr-1 -mt-0.5" />,
        '⚠️': <AlertTriangle size={14} className="text-amber-500 inline-block mr-1 -mt-0.5" />,
        '📈': <TrendingUp size={14} className="text-emerald-500 inline-block mr-1 -mt-0.5" />,
        '📉': <TrendingDown size={14} className="text-red-500 inline-block mr-1 -mt-0.5" />,
        '💡': <Lightbulb size={14} className="text-blue-400 inline-block mr-1 -mt-0.5" />,
        '✅': <CheckCircle size={14} className="text-emerald-400 inline-block mr-1 -mt-0.5" />,
        '❌': <XCircle size={14} className="text-red-400 inline-block mr-1 -mt-0.5" />,
        '💰': <Coins size={14} className="text-yellow-500 inline-block mr-1 -mt-0.5" />,
        'ℹ️': <Info size={14} className="text-blue-500 inline-block mr-1 -mt-0.5" />,
        '❓': <HelpCircle size={14} className="text-slate-400 inline-block mr-1 -mt-0.5" />,
    };

    // Regex to find emojis in the text
    const emojiRegex = /([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/gu;
    
    const parts = text.split(emojiRegex);
    
    return (
        <span className="leading-relaxed">
            {parts.map((part, i) => {
                if (emojiMap[part]) {
                    return <React.Fragment key={i}>{emojiMap[part]}</React.Fragment>;
                }
                return part;
            })}
        </span>
    );
};

const StatisticsBlock: React.FC = () => {
    const [stats, setStats] = useState<StatisticsData | null>(null);
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [timeRange, setTimeRange] = useState('today');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showChart, setShowChart] = useState(true);

    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });

    const chartId = React.useMemo(() => Math.random().toString(36).slice(2), []);
    const { t, language } = useLanguage();
    const { darkMode } = useTheme();

    // Use ResizeObserver to explicitly calculate size to avoid Recharts dimension errors
    useEffect(() => {
        const container = chartContainerRef.current;
        if (!container || !showChart) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                // Only update if dimensions are valid and changed
                if (width > 0 && height > 0) {
                    setChartDimensions({ width, height });
                }
            }
        });

        // Delay observing slightly to ensure DOM is settled
        const timerId = setTimeout(() => {
             if (chartContainerRef.current) {
                 resizeObserver.observe(chartContainerRef.current);
             }
        }, 100);

        return () => {
            clearTimeout(timerId);
            resizeObserver.disconnect();
        };
    }, [showChart, stats]);

    const getLocale = (lang: string) => {
        switch (lang) {
            case 'th': return 'th-TH';
            default: return 'en-US';
        }
    };
    const locale = getLocale(language);

    const chartColors = {
        stroke: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        text: darkMode ? '#64748b' : '#64748b',
        grid: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        area: '#3b82f6'
    };

    const fetchStatistics = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${getApiBase()}/api/summary/statistics?timeRange=${timeRange}`);
            const data = await response.json();

            if (data.success) {
                setStats(data);
            } else {
                setError(data.error || 'Failed to fetch statistics');
            }

            const granularity = timeRange === 'today' || timeRange === 'yesterday' ? 'hour' : 'day';
            const now = new Date();
            const todayStart = new Date(now);
            todayStart.setHours(0, 0, 0, 0);
            const yesterdayStart = new Date(todayStart);
            yesterdayStart.setDate(yesterdayStart.getDate() - 1);

            const rangeMap: Record<string, { startDate: string; endDate: string }> = {
                today: { startDate: todayStart.toISOString(), endDate: 'now()' },
                yesterday: { startDate: yesterdayStart.toISOString(), endDate: todayStart.toISOString() },
                week: { startDate: '-7d', endDate: 'now()' },
                month: { startDate: '-30d', endDate: 'now()' }
            };
            const range = rangeMap[timeRange] || rangeMap.today;

            const chartResponse = await fetch(
                `${getApiBase()}/api/energy/range-summary?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}&granularity=${granularity}&deviceId=AI205`
            );
            const chartResult = await chartResponse.json();

            if (chartResult.success && chartResult.chartData) {
                const formattedData = chartResult.chartData.map((point: any) => {
                    const date = new Date(point.time);
                    return {
                        time: point.time,
                        hour: granularity === 'hour'
                            ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
                            : date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
                        power: (point.power || 0) * 1000,
                        powerAvg: data.success ? data.power.avg : 0
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
    }, [timeRange, locale]);

    useEffect(() => {
        fetchStatistics();
        const interval = setInterval(fetchStatistics, 60000);
        return () => clearInterval(interval);
    }, [fetchStatistics]);

    const timeRangeOptions = [
        { value: 'today', labelKey: 'statistics.today' },
        { value: 'yesterday', labelKey: 'statistics.yesterday' },
        { value: 'week', labelKey: 'statistics.last7Days' },
        { value: 'month', labelKey: 'statistics.last30Days' }
    ];

    return (
        <div className="statistics-block animate-in fade-in duration-700">
            <header className="statistics-header">
                <div className="statistics-title">
                    <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                        <BarChart2 size={20} className="text-blue-500" />
                    </div>
                    <h3>{t('statistics.title')}</h3>
                </div>
                <div className="statistics-controls">
                    <button
                        className={`chart-toggle-btn ${showChart ? 'active' : ''}`}
                        onClick={() => setShowChart(!showChart)}
                    >
                        <Zap size={14} className={showChart ? 'text-yellow-400' : ''} />
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
                        <RefreshCw className={loading ? 'spinning' : ''} size={14} />
                    </button>
                </div>
            </header>

            {error && (
                <div className="statistics-error flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">
                    <AlertTriangle size={14} />
                    <span>{error}</span>
                </div>
            )}

            {loading && !stats && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500 opacity-50" />
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t('statistics.loading')}</p>
                </div>
            )}

            {stats && (
                <>
                    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-1 -mr-1 custom-scrollbar space-y-4 pb-2">
                        {/* Power Trend Chart */}
                        {showChart && chartData.length > 0 && (
                            <div className="statistics-chart-container group shrink-0" style={{ height: '220px', minHeight: '200px' }}>
                                <div className="chart-header">
                                    <div className="chart-title-group">
                                        <div className="w-1.5 h-3 bg-yellow-400 rounded-full animate-pulse" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('statistics.powerTrend')}</span>
                                    </div>
                                    <span className="chart-meta uppercase">{chartData.length} pts</span>
                                </div>
                                <div
                                    ref={chartContainerRef}
                                    className="chart-wrapper relative flex-1 min-h-0"
                                >
                                    {chartDimensions.width > 0 && chartDimensions.height > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id={`powerGradient-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="4 4" stroke={chartColors.grid} vertical={false} />
                                                <XAxis
                                                    dataKey="hour"
                                                    tick={{ fill: chartColors.text, fontSize: 9, fontWeight: 700 }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    interval="preserveStartEnd"
                                                    dy={10}
                                                />
                                                <YAxis
                                                    tick={{ fill: chartColors.text, fontSize: 9, fontWeight: 700 }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    dx={-5}
                                                />
                                                <Tooltip
                                                    content={<CustomTooltip t={t} />}
                                                    cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="power"
                                                    stroke={chartColors.area}
                                                    strokeWidth={3}
                                                    fill={`url(#powerGradient-${chartId})`}
                                                    animationDuration={1500}
                                                    activeDot={{ r: 6, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }}
                                                />
                                                <ReferenceLine
                                                    y={stats.power.avg}
                                                    stroke="#fbbf24"
                                                    strokeDasharray="6 4"
                                                    strokeWidth={2}
                                                    label={{
                                                        value: `${stats.power.avg.toFixed(0)}W`,
                                                        fill: '#fbbf24',
                                                        fontSize: 9,
                                                        fontWeight: 900,
                                                        position: 'right',
                                                        className: 'uppercase tracking-tighter'
                                                    }}
                                                />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <RefreshCw className="w-6 h-6 animate-spin text-blue-500/30" />
                                        </div>
                                    )}
                                </div>
                                <div className="chart-legend">
                                    <div className="legend-item">
                                        <div className="legend-line avg h-1 w-4" />
                                        <span>{t('statistics.average')}</span>
                                    </div>
                                    <div className="legend-item">
                                        <ArrowUpRight size={10} className="text-red-400" />
                                        <span>PEAK</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="stats-grid shrink-0">
                            <StatCard
                                title={t('statistics.power')}
                                icon={<Zap size={16} className="power-icon" />}
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
                                icon={<Gauge size={16} className="voltage-icon" />}
                                avg={stats.voltage.avg}
                                max={stats.voltage.max}
                                min={stats.voltage.min}
                                unit={stats.voltage.unit}
                                t={t}
                            />
                            <StatCard
                                title={t('statistics.current')}
                                icon={<Activity size={16} className="current-icon" />}
                                avg={stats.current.avg}
                                max={stats.current.max}
                                min={stats.current.min}
                                unit={stats.current.unit}
                                t={t}
                            />
                        </div>

                        <div className="stats-summary-row shrink-0">
                            <div className="pf-card metric-compact-card group">
                                <div className="pf-header">
                                    <TrendingUp size={14} className="text-emerald-400" />
                                    <span>{t('statistics.powerFactor')}</span>
                                </div>
                                <div className="pf-values">
                                    <div className="pf-item">
                                        <span className="pf-label">{t('statistics.avg')}</span>
                                        <span className={`pf-value ${stats.powerFactor.avg < 0.85 ? 'pf-low' : ''}`}>
                                            {stats.powerFactor.avg?.toFixed(3) || '0.000'}
                                        </span>
                                    </div>
                                    <div className="pf-item border-l border-white/5 pl-6">
                                        <span className="pf-label">{t('statistics.min')}</span>
                                        <span className={`text-sm font-black transition-colors ${stats.powerFactor.min < 0.85 ? 'text-amber-500' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                            {stats.powerFactor.min?.toFixed(3) || '0.000'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="energy-total-card metric-compact-card group">
                                <div className="energy-header">
                                    <Database size={14} className="text-yellow-400" />
                                    <span>{t('statistics.totalEnergy')}</span>
                                </div>
                                <div className="energy-value group-hover:scale-105 transition-transform origin-left">
                                    {stats.energy.total?.toFixed(2) || '0.00'}
                                    <span className="energy-unit uppercase">{stats.energy.unit}</span>
                                </div>
                            </div>
                        </div>

                        {stats.insights && stats.insights.length > 0 && (
                            <div className="insights-section shrink-0">
                                <h4>
                                    <Info size={14} />
                                    {t('statistics.insights')}
                                </h4>
                                <ul className="insights-list">
                                    {stats.insights.map((insight, idx) => (
                                        <li key={idx} className="insight-item group/item flex items-start gap-2">
                                            <div className="w-1 h-1 rounded-full bg-blue-400 mt-2.5 shrink-0 group-hover/item:scale-150 transition-transform" />
                                            <InsightText text={insight} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className="stats-footer border-t border-white/5 pt-3 shrink-0">
                        <span className="data-source">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {stats.dataSource}
                        </span>
                        <span className="last-updated uppercase tracking-widest opacity-40">
                            {new Date(stats.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                </>
            )}
        </div>
    );
};

export default StatisticsBlock;
