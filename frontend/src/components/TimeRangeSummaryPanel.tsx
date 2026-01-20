import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Legend
} from 'recharts';
import {
    TrendingUp, TrendingDown, Zap, Clock, DollarSign, Activity,
    Calendar, RefreshCw, AlertCircle
} from 'lucide-react';
import { useTimeRange } from '../context/TimeRangeContext';
import { useTheme, THEME } from './AppShell';
import { useLanguage } from '../context/LanguageContext';

interface SummaryData {
    totalEnergy: number;
    totalCost: number;
    peakPower: number;
    peakTime: string | null;
    avgPower: number;
    currency: string;
    unit: string;
}

interface ChartDataPoint {
    time: string;
    power: number;
    energy: number;
}

interface RangeSummaryResponse {
    success: boolean;
    summary: SummaryData;
    chartData: ChartDataPoint[];
    chartDataCount: number;
    granularity: string;
    timestamp: string;
    error?: string;
}

import { getApiBase } from '../config/api';

const API_BASE = getApiBase();

const TimeRangeSummaryPanel: React.FC = () => {
    const { mode, getQueryRange, getDisplayLabel, openCalendar } = useTimeRange();
    const { darkMode } = useTheme();
    const currentTheme = THEME;
    const { t } = useLanguage();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<RangeSummaryResponse | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    // สำหรับแก้ปัญหา wrapper 0x0 บนมือถือ
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [chartReady, setChartReady] = useState(false);
    const [containerWidth, setContainerWidth] = useState(0);

    // Determine granularity based on mode
    const getGranularity = useCallback(() => {
        switch (mode) {
            case 'hour': return 'hour';
            case 'day': return 'hour';
            case 'week': return 'day';
            case 'month': return 'day';
            case 'custom': return 'day';
            default: return 'day';
        }
    }, [mode]);

    // Fetch summary data
    const fetchData = useCallback(async () => {
        if (mode === 'realtime') return;

        setLoading(true);
        setError(null);

        try {
            const { start, end, range } = getQueryRange();
            const granularity = getGranularity();

            const params = new URLSearchParams({
                startDate: range !== 'custom' ? range : start,
                endDate: range !== 'custom' ? 'now()' : end,
                granularity,
                deviceId: 'AI205',
                costPerUnit: '4.0'
            });

            const response = await fetch(`${API_BASE}/api/energy/range-summary?${params}`);
            const result: RangeSummaryResponse = await response.json();

            if (result.success) {
                setData(result);
                setLastUpdate(new Date());
            } else {
                setError(result.error || 'Failed to fetch data');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setLoading(false);
        }
    }, [mode, getQueryRange, getGranularity]);

    // Fetch on mode change
    useEffect(() => {
        if (mode !== 'realtime') {
            fetchData();
        }
    }, [mode, fetchData]);

    // ResizeObserver เพื่อตรวจจับขนาด container จริง
    useEffect(() => {
        const container = chartContainerRef.current;
        if (!container) return;

        const checkDimensions = () => {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setContainerWidth(rect.width);
                setChartReady(true);
                return true;
            }
            return false;
        };

        // เช็คทันที
        if (checkDimensions()) return;

        // ถ้ายังไม่พร้อม ใช้ ResizeObserver
        const timer = setTimeout(() => {
            if (!checkDimensions()) {
                const observer = new ResizeObserver((entries) => {
                    for (const entry of entries) {
                        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                            setContainerWidth(entry.contentRect.width);
                            setChartReady(true);
                            observer.disconnect();
                        }
                    }
                });
                observer.observe(container);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [data]);

    // Don't show panel for realtime mode
    if (mode === 'realtime') {
        return null;
    }

    // Format chart data labels
    const formatXAxis = (time: string) => {
        const date = new Date(time);
        const granularity = getGranularity();

        if (granularity === 'hour') {
            return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    };

    const formatTooltipTime = (time: string) => {
        const date = new Date(time);
        return date.toLocaleString('th-TH', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Summary cards component
    const SummaryCard: React.FC<{
        icon: React.ElementType;
        label: string;
        value: string;
        subValue?: string;
        trend?: 'up' | 'down' | null;
        color?: string;
    }> = ({ icon: Icon, label, value, subValue, trend, color }) => (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-2">
                <Icon className="w-4 h-4" />
                {label}
            </div>
            <div className={`text-2xl font-bold ${color || 'text-gray-900 dark:text-white'}`}>
                {value}
            </div>
            {subValue && (
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                    {trend === 'up' && <TrendingUp className="w-3 h-3 text-green-500" />}
                    {trend === 'down' && <TrendingDown className="w-3 h-3 text-red-500" />}
                    {subValue}
                </div>
            )}
        </div>
    );

    // Custom tooltip component
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length > 0) {
            return (
                <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                        {formatTooltipTime(label)}
                    </p>
                    {payload.map((entry: any, index: number) => (
                        <p key={index} className="text-sm" style={{ color: entry.color }}>
                            {entry.name}: {entry.value.toFixed(2)} {entry.name === 'energy' ? 'kWh' : 'kW'}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
            {/* Header */}
            <div className={`px-6 py-4 bg-gradient-to-r ${currentTheme.primary} text-white`}>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Activity className="w-5 h-5" />
                            {t('summary.energySummary')}
                        </h2>
                        <p className="text-sm text-white/80 mt-0.5">
                            {getDisplayLabel()}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={openCalendar}
                            className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                            title="Change date range"
                        >
                            <Calendar className="w-4 h-4" />
                        </button>
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-6">
                {/* Loading State */}
                {loading && !data && (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="flex items-center justify-center py-8 text-red-500">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Data Display */}
                {data && (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <SummaryCard
                                icon={Zap}
                                label={t('energy.totalEnergy')}
                                value={`${data.summary.totalEnergy.toLocaleString('th-TH', { maximumFractionDigits: 2 })} kWh`}
                                color={currentTheme.text}
                            />
                            <SummaryCard
                                icon={DollarSign}
                                label={t('energy.estimatedCost')}
                                value={`฿${data.summary.totalCost.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`}
                                color="text-emerald-600 dark:text-emerald-400"
                            />
                            <SummaryCard
                                icon={TrendingUp}
                                label={t('energy.peakPower')}
                                value={`${data.summary.peakPower.toFixed(2)} kW`}
                                subValue={data.summary.peakTime
                                    ? `@ ${new Date(data.summary.peakTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`
                                    : undefined
                                }
                                color="text-orange-600 dark:text-orange-400"
                            />
                            <SummaryCard
                                icon={Activity}
                                label={t('energy.avgPower')}
                                value={`${data.summary.avgPower.toFixed(2)} kW`}
                                color="text-blue-600 dark:text-blue-400"
                            />
                        </div>

                        {/* Chart */}
                        {data.chartData && data.chartData.length > 0 && (
                            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
                                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                                    {t('summary.energyConsumption')} ({getGranularity() === 'hour' ? t('chart.hourly') : t('chart.daily')})
                                </h3>
                                <div
                                    ref={chartContainerRef}
                                    className="h-64"
                                    style={{ minHeight: '250px', minWidth: '200px' }}
                                >
                                    {chartReady ? (
                                        <ResponsiveContainer
                                            key={`chart-${containerWidth}`}
                                            width={containerWidth > 0 ? containerWidth : "100%"}
                                            height={250}
                                        >
                                            <BarChart data={data.chartData}>
                                                <CartesianGrid
                                                    strokeDasharray="3 3"
                                                    stroke={darkMode ? '#374151' : '#e5e7eb'}
                                                    vertical={false}
                                                />
                                                <XAxis
                                                    dataKey="time"
                                                    tickFormatter={formatXAxis}
                                                    tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 11 }}
                                                    axisLine={{ stroke: darkMode ? '#374151' : '#e5e7eb' }}
                                                    tickLine={false}
                                                />
                                                <YAxis
                                                    tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 11 }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    width={50}
                                                    tickFormatter={(value) => `${value}`}
                                                />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Legend
                                                    wrapperStyle={{ paddingTop: '10px' }}
                                                    formatter={(value) => (
                                                        <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                                                            {value} ({value === 'energy' ? 'kWh' : 'kW'})
                                                        </span>
                                                    )}
                                                />
                                                <Bar
                                                    dataKey="energy"
                                                    name="energy"
                                                    fill={darkMode ? '#10b981' : '#059669'}
                                                    radius={[4, 4, 0, 0]}
                                                    maxBarSize={40}
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex items-center justify-center h-full">
                                            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Last Update */}
                        {lastUpdate && (
                            <div className="mt-4 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last updated: {lastUpdate.toLocaleTimeString('th-TH')}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default TimeRangeSummaryPanel;
