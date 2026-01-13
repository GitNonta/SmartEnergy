import React, { useState, useEffect } from 'react';
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { TrendingUp, X, Zap, DollarSign } from 'lucide-react';
import { getApiBase } from '../config/api';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from './AppShell';
import './EnergyCostHistoryChart.css';

export type ViewMode = 'daily' | 'monthly' | 'yearly';

interface ChartDataPoint {
    x: string;
    energy: number;
    cost: number;
}

interface EnergyCostHistoryChartProps {
    initialMode?: ViewMode;
    onClose?: () => void;
    isPopup?: boolean;
    ftRate?: number;
}

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
    const { t } = useLanguage();
    if (active && payload && payload.length) {
        return (
            <div className="cost-chart-tooltip">
                <p className="tooltip-label">{label}</p>
                <div className="tooltip-items">
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="tooltip-item" style={{ color: entry.color }}>
                            <span className="tooltip-dot" style={{ background: entry.color }}></span>
                            <span>{entry.name}: </span>
                            <span className="tooltip-value">
                                {entry.dataKey === 'cost'
                                    ? `฿${entry.value.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
                                    : `${entry.value.toFixed(2)} ${t('energy.unit')}`
                                }
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

export default function EnergyCostHistoryChart({
    initialMode = 'monthly',
    onClose,
    isPopup = false,
    ftRate = 0.1572
}: EnergyCostHistoryChartProps) {
    const [viewMode, setViewMode] = useState<ViewMode>(initialMode);
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [totalEnergy, setTotalEnergy] = useState<number>(0);
    const [totalCost, setTotalCost] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const { t } = useLanguage();
    const { darkMode } = useTheme();

    useEffect(() => {
        setViewMode(initialMode);
    }, [initialMode]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await fetch(
                    `${getApiBase()}/api/energy/cost-history?mode=${viewMode}&deviceId=AI205&ftRate=${ftRate}`,
                    { cache: 'no-store' }
                );

                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        setChartData(data.chartData || []);
                        setTotalEnergy(data.totalEnergy || 0);
                        setTotalCost(data.totalCost || 0);
                    }
                }
            } catch (error) {
                console.error('❌ Error fetching cost history:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // Auto-refresh
        const interval = setInterval(fetchData, viewMode === 'daily' ? 60000 : 300000);
        return () => clearInterval(interval);
    }, [viewMode, ftRate]);

    const getTitle = () => {
        switch (viewMode) {
            case 'daily': return t('history.hourlyCost');
            case 'monthly': return t('history.dailyCost');
            case 'yearly': return t('history.monthlyCost');
        }
    };

    return (
        <div className={`cost-history-chart ${isPopup ? 'popup-mode' : ''} bg-white dark:bg-transparent text-slate-900 dark:text-slate-100 w-full h-full flex flex-col p-6`}>
            {/* Header */}
            <div className="chart-header flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                <div className="header-left flex items-center">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mr-4 bg-amber-100 text-amber-500 dark:bg-amber-500/10 dark:text-amber-500 transition-colors">
                        <TrendingUp size={24} />
                    </div>
                    <div className="header-text flex flex-col">
                        <h3 className="chart-title text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
                            {getTitle()}
                        </h3>
                        <div className="chart-summary flex items-center mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                            <span className="summary-item flex items-center gap-1.5 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded text-xs">
                                <Zap size={12} className="text-cyan-500" />
                                <span>{totalEnergy.toLocaleString('th-TH', { minimumFractionDigits: 2 })} {t('energy.unit')}</span>
                            </span>
                            <span className="mx-2 text-slate-300 dark:text-slate-600">•</span>
                            <span className="summary-item cost flex items-center gap-1.5 bg-amber-100/50 dark:bg-amber-500/10 px-2 py-0.5 rounded text-xs text-amber-600 dark:text-amber-400">
                                <DollarSign size={12} />
                                <span>฿{totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                            </span>
                        </div>
                    </div>
                </div>

                <div className="header-right flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="bg-slate-100 dark:bg-black/20 p-1 rounded-lg flex space-x-1">
                        <button
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'daily' ? 'bg-amber-500 text-white shadow-md scale-105' : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/5'}`}
                            onClick={() => setViewMode('daily')}
                        >
                            {t('export.buckets.hourly')}
                        </button>
                        <button
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'monthly' ? 'bg-amber-500 text-white shadow-md scale-105' : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/5'}`}
                            onClick={() => setViewMode('monthly')}
                        >
                            {t('export.buckets.daily')}
                        </button>
                        <button
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'yearly' ? 'bg-amber-500 text-white shadow-md scale-105' : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/5'}`}
                            onClick={() => setViewMode('yearly')}
                        >
                            {t('export.buckets.yearly')}
                        </button>
                    </div>
                    {onClose && (
                        <button
                            className="close-btn p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            onClick={onClose}
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            {/* Chart */}
            <div className="chart-container">
                {loading ? (
                    <div className="chart-loading">
                        <div className="loading-spinner"></div>
                        <span>{t('history.loading')}</span>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={isPopup ? 380 : 320}>
                        <ComposedChart
                            data={chartData}
                            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                        >
                            <defs>
                                {/* Gradient for Cost bars */}
                                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={darkMode ? "#f59e0b" : "#d97706"} stopOpacity={0.9} />
                                    <stop offset="95%" stopColor={darkMode ? "#d97706" : "#b45309"} stopOpacity={0.7} />
                                </linearGradient>
                                {/* Gradient for Energy bars */}
                                <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={darkMode ? "#22d3ee" : "#0891b2"} stopOpacity={0.9} />
                                    <stop offset="95%" stopColor={darkMode ? "#0891b2" : "#0e7490"} stopOpacity={0.7} />
                                </linearGradient>
                            </defs>

                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke={darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}
                                vertical={false}
                            />

                            <XAxis
                                dataKey="x"
                                tick={{ fill: darkMode ? '#94a3b8' : '#64748b', fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                                interval={viewMode === 'daily' ? 2 : viewMode === 'monthly' ? 4 : 0}
                            />

                            {/* Left Y-axis for Cost (THB) */}
                            <YAxis
                                yAxisId="left"
                                tick={{ fill: darkMode ? '#fbbf24' : '#d97706', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                label={{
                                    value: t('cost.baht'),
                                    angle: -90,
                                    position: 'insideLeft',
                                    fill: darkMode ? '#fbbf24' : '#d97706',
                                    fontSize: 12
                                }}
                                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                            />

                            {/* Right Y-axis for Energy (kWh) */}
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                tick={{ fill: darkMode ? '#22d3ee' : '#0891b2', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                label={{
                                    value: t('energy.unit'),
                                    angle: 90,
                                    position: 'insideRight',
                                    fill: darkMode ? '#22d3ee' : '#0891b2',
                                    fontSize: 12
                                }}
                            />

                            <Tooltip content={<CustomTooltip />} />

                            <Legend
                                wrapperStyle={{ paddingTop: '10px' }}
                                formatter={(value) => {
                                    const isCost = value.includes(t('history.cost'));
                                    const color = isCost
                                        ? (darkMode ? '#fbbf24' : '#d97706')
                                        : (darkMode ? '#22d3ee' : '#0891b2');
                                    return <span style={{ color }}>{value}</span>;
                                }}
                            />

                            {/* Cost bars */}
                            <Bar
                                yAxisId="left"
                                dataKey="cost"
                                name={t('history.cost')}
                                fill="url(#costGradient)"
                                radius={[4, 4, 0, 0]}
                                barSize={viewMode === 'yearly' ? 24 : viewMode === 'monthly' ? 12 : 14}
                            />

                            {/* Energy line */}
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="energy"
                                name={`${t('history.energy')} (${t('energy.unit')})`}
                                stroke={darkMode ? "#22d3ee" : "#0891b2"}
                                strokeWidth={2}
                                dot={{ fill: darkMode ? '#22d3ee' : '#0891b2', strokeWidth: 0, r: 3 }}
                                activeDot={{ r: 5, fill: darkMode ? '#22d3ee' : '#0891b2' }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Footer Legend */}
            <div className="chart-footer">
                <div className="legend-item">
                    <span className="legend-bar cost"></span>
                    <span>{t('history.cost')} ({t('cost.baht')})</span>
                </div>
                <div className="legend-item">
                    <span className="legend-line energy"></span>
                    <span>{t('history.energy')} ({t('energy.unit')})</span>
                </div>
            </div>

            {/* CSS styles that couldn't be replaced with utilities easily */}
            <style>{`
                .chart-loading {
                     display: flex;
                     flex-direction: column;
                     align-items: center;
                     justify-content: center;
                     height: 100%;
                     color: #64748b;
                     font-size: 0.8rem;
                }
                .loading-spinner {
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #f59e0b;
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    animation: spin 1s linear infinite;
                    margin-bottom: 10px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .chart-footer {
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    margin-top: 10px;
                    font-size: 0.75rem;
                    color: #64748b;
                }
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .legend-bar {
                    width: 12px;
                    height: 12px;
                    border-radius: 2px;
                }
                .legend-bar.cost {
                    background: linear-gradient(to bottom, #f59e0b, #d97706);
                }
                .legend-line {
                    width: 12px;
                    height: 3px;
                    border-radius: 1px;
                }
                .legend-line.energy {
                    background: #0891b2;
                }
                html.dark .legend-line.energy {
                    background: #22d3ee;
                }
            `}</style>
        </div>
    );
}
