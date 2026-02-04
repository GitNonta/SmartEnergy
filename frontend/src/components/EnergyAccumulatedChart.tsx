import React, { useState, useEffect, useRef } from 'react';
import { getApiBase } from '../config/api';
import { BarChart3, X, Brain, CheckCircle2, AlertTriangle, AlertOctagon, XCircle, TrendingUp, Info, Cpu } from 'lucide-react';
import { analyzeEnergy } from '../services/aiService';
import { useTheme } from './AppShell';

// --- Constants & Config ---
const APEXCHARTS_CDN_URL = "https://cdn.jsdelivr.net/npm/apexcharts";

// Theme Colors
const THEME_COLORS = {
    dark: {
        daily: '#22d3ee',   // Cyan
        monthly: '#3b82f6', // Blue
        yearly: '#a855f7',  // Purple
        text: '#f8fafc',
        subtext: '#94a3b8',
        grid: 'rgba(255,255,255,0.05)',
        bg: '#1e293b'
    },
    light: {
        daily: '#0891b2',   // Cyan-600
        monthly: '#2563eb', // Blue-600
        yearly: '#9333ea',  // Purple-600
        text: '#0f172a',    // Slate-900
        subtext: '#64748b', // Slate-500
        grid: 'rgba(0,0,0,0.05)',
        bg: '#ffffff'
    }
};

export type TimeViewMode = 'daily' | 'monthly' | 'yearly';

interface EnergyAccumulatedChartProps {
    initialViewMode?: TimeViewMode;
    onClose?: () => void;
    isPopup?: boolean;
}

// --- Fallback Empty Data (when no data available) ---
// Returns zeros instead of fake data to clearly show periods with no real data
const generateFallbackData = (mode: TimeViewMode, locale: string) => {
    let data: { x: string, y: number }[] = [];
    const now = new Date();

    console.warn(`⚠️ No real data available for ${mode} - showing zeros`);

    if (mode === 'daily') {
        // 24 Hours with zeros
        for (let i = 0; i < 24; i++) {
            data.push({ x: `${i.toString().padStart(2, '0')}:00`, y: 0 });
        }
    } else if (mode === 'monthly') {
        // Days in month with zeros
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            data.push({ x: i.toString(), y: 0 });
        }
    } else if (mode === 'yearly') {
        // 12 Months with zeros
        for (let i = 0; i < 12; i++) {
            const date = new Date(now.getFullYear(), i, 1);
            data.push({ x: date.toLocaleDateString(locale, { month: 'short' }), y: 0 });
        }
    }
    return data;
};

// --- Real Data Fetchers from InfluxDB (Historical Data) ---
// Returns { chartData: array, totalEnergy: number }
const fetchRealData = async (mode: TimeViewMode, locale: string): Promise<{ chartData: { x: string, y: number }[], totalEnergy: number }> => {
    try {
        console.log(`📊 Fetching ${mode} energy data from InfluxDB...`);

        if (mode === 'daily') {
            return await fetchDailyData(locale);
        } else if (mode === 'monthly') {
            return await fetchMonthlyData(locale);
        } else {
            return await fetchYearlyData(locale);
        }
    } catch (error) {
        console.error('❌ Error fetching energy data:', error);
        return { chartData: generateFallbackData(mode, locale), totalEnergy: 0 };
    }
};

// Fetch Daily data: Today's hourly energy breakdown (00:00 - current hour)
const fetchDailyData = async (locale: string) => {
    try {
        // Use daily-consumption endpoint which gives real hourly breakdown for today
        const response = await fetch(
            `${getApiBase()}/api/energy/daily-consumption?deviceId=AI205`,
            { cache: 'no-store' }
        );

        if (!response.ok) {
            console.warn(`⚠️ Daily consumption API returned ${response.status}`);
            return { chartData: generateFallbackData('daily', locale), totalEnergy: 0 };
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.hourlyData)) {
            console.warn('⚠️ Invalid daily consumption data');
            return { chartData: generateFallbackData('daily', locale), totalEnergy: 0 };
        }

        const currentHour = new Date().getHours();

        // ✅ UPDATED: Use energy_total field from Power×Time calculation
        const chartData: { x: string; y: number }[] = data.hourlyData.map((item: any) => {
            const hour = parseInt(item.hour);
            const energy = item.energy_total || 0; // ✅ Use energy_total (Power×Time)

            return {
                x: item.hour,
                y: hour <= currentHour ? Number(energy.toFixed(4)) : 0
            };
        });

        // Sort by hour
        chartData.sort((a, b) => parseInt(a.x) - parseInt(b.x));

        // ✅ Use API's totalEnergy (from integral) for accurate total
        const totalEnergy = data.totalEnergy || chartData.reduce((sum, d) => sum + d.y, 0);
        console.log(`✅ Daily chart: ${chartData.length} hours, total ${totalEnergy.toFixed(4)} kWh (from integral)`);

        return { chartData, totalEnergy };
    } catch (error) {
        console.error('❌ Error fetching daily data:', error);
        return { chartData: generateFallbackData('daily', locale), totalEnergy: 0 };
    }
};

// Fetch Monthly data: Current month's daily energy breakdown
const fetchMonthlyData = async (locale: string) => {
    try {
        const response = await fetch(
            `${getApiBase()}/api/energy/monthly-chart?deviceId=AI205`,
            { cache: 'no-store' }
        );

        if (!response.ok) {
            console.warn(`⚠️ Monthly chart API returned ${response.status}`);
            return { chartData: generateFallbackData('monthly', locale), totalEnergy: 0 };
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.chartData)) {
            console.warn('⚠️ Invalid monthly chart data');
            return { chartData: generateFallbackData('monthly', locale), totalEnergy: 0 };
        }

        console.log(`✅ Monthly chart: ${data.chartData.length} days, total ${data.total} kWh`);
        return { chartData: data.chartData, totalEnergy: data.total || 0 };
    } catch (error) {
        console.error('❌ Error fetching monthly data:', error);
        return { chartData: generateFallbackData('monthly', locale), totalEnergy: 0 };
    }
};

// Fetch Yearly data: Current year's monthly energy breakdown
const fetchYearlyData = async (locale: string) => {
    try {
        const response = await fetch(
            `${getApiBase()}/api/energy/yearly-chart?deviceId=AI205`,
            { cache: 'no-store' }
        );

        if (!response.ok) {
            console.warn(`⚠️ Yearly chart API returned ${response.status}`);
            return { chartData: generateFallbackData('yearly', locale), totalEnergy: 0 };
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.chartData)) {
            console.warn('⚠️ Invalid yearly chart data');
            return { chartData: generateFallbackData('yearly', locale), totalEnergy: 0 };
        }

        console.log(`✅ Yearly chart: ${data.chartData.length} months, total ${data.total} kWh`);
        return { chartData: data.chartData, totalEnergy: data.total || 0 };
    } catch (error) {
        console.error('❌ Error fetching yearly data:', error);
        return { chartData: generateFallbackData('yearly', locale), totalEnergy: 0 };
    }
};

import { useLanguage } from '../context/LanguageContext';

// --- Emoji to Icon Mapping ---
const emojiMap: Record<string, React.ReactNode> = {
    '🤖': <Cpu size={16} className="text-violet-500 inline-block mr-1.5 mb-0.5" />,
    '📊': <TrendingUp size={16} className="text-blue-500 inline-block mr-1.5 mb-0.5" />,
    '✅': <CheckCircle2 size={16} className="text-emerald-500 inline-block mr-1.5 mb-0.5" />,
    '⚠️': <AlertTriangle size={16} className="text-amber-500 inline-block mr-1.5 mb-0.5" />,
    '🚨': <AlertOctagon size={16} className="text-red-500 inline-block mr-1.5 mb-0.5" />,
    '❌': <XCircle size={16} className="text-red-600 inline-block mr-1.5 mb-0.5" />,
    'ℹ️': <Info size={16} className="text-blue-400 inline-block mr-1.5 mb-0.5" />,
};

const TextWithIcons = ({ text }: { text: string }) => {
    if (!text) return null;

    // Split text into parts, preserving emojis as separate tokens
    // This regex matches any of the emojis in our map
    const emojiRegex = new RegExp(`(${Object.keys(emojiMap).join('|')})`, 'gu');
    const parts = text.split(emojiRegex);

    return (
        <div className="whitespace-pre-wrap text-center">
            {parts.map((part, index) => {
                if (emojiMap[part]) {
                    return <React.Fragment key={index}>{emojiMap[part]}</React.Fragment>;
                }
                return <span key={index}>{part}</span>;
            })}
        </div>
    );
};

// --- Custom Styles for Liquid Glass Scrollbar ---
const scrollbarStyles = `
    .liquid-glass-scroll::-webkit-scrollbar {
        width: 4px;
    }
    .liquid-glass-scroll::-webkit-scrollbar-track {
        background: transparent;
    }
    .liquid-glass-scroll::-webkit-scrollbar-thumb {
        background: rgba(139, 92, 246, 0.2);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .liquid-glass-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(139, 92, 246, 0.4);
    }
    .dark .liquid-glass-scroll::-webkit-scrollbar-thumb {
        background: rgba(167, 139, 250, 0.2);
    }
    .dark .liquid-glass-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(167, 139, 250, 0.4);
    }
`;

export default function EnergyAccumulatedChart({ initialViewMode = 'daily', onClose, isPopup = false }: EnergyAccumulatedChartProps) {
    const { darkMode } = useTheme();
    const { t, language } = useLanguage();
    const [viewMode, setViewMode] = useState<TimeViewMode>(initialViewMode);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const chartInstance = useRef<any>(null);
    const chartDivRef = useRef<HTMLDivElement>(null);

    const locale = language === 'th' ? 'th-TH' : 'en-US';

    // AI State
    const [analyzing, setAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState<{ mode: string, text: string, isLocal?: boolean } | null>(null);

    // Load Data
    const [chartData, setChartData] = useState<{ x: string, y: number }[]>([]);
    const [apiTotalEnergy, setApiTotalEnergy] = useState<number | null>(null);

    useEffect(() => {
        setViewMode(initialViewMode);
    }, [initialViewMode]);

    useEffect(() => {
        const loadData = async () => {
            console.log(`📊 Loading ${viewMode} chart data...`);
            const result = await fetchRealData(viewMode, locale);
            setChartData(result.chartData);
            setApiTotalEnergy(result.totalEnergy);
        };

        // Initial load
        loadData();

        // Auto-refresh for real-time updates
        const refreshInterval = viewMode === 'daily' ? 30000 : 300000;
        const interval = setInterval(() => {
            console.log(`🔄 Auto-refreshing ${viewMode} chart...`);
            loadData();
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [viewMode, locale]);

    useEffect(() => {
        if ((window as any).ApexCharts) {
            setIsScriptLoaded(true);
        } else {
            const script = document.createElement('script');
            script.src = APEXCHARTS_CDN_URL;
            script.crossOrigin = 'anonymous';
            script.onload = () => setIsScriptLoaded(true);
            script.onerror = (err) => {
                console.error('❌ Failed to load ApexCharts from CDN:', err);
            };
            document.head.appendChild(script);
        }
    }, []);

    // Update Chart
    useEffect(() => {
        if (!isScriptLoaded || !chartDivRef.current) return;

        // Destroy old
        if (chartInstance.current) {
            chartInstance.current.destroy();
            chartInstance.current = null;
        }

        const ApexCharts = (window as any).ApexCharts;
        const options = getChartOptions(viewMode, chartData);

        const chart = new ApexCharts(chartDivRef.current, {
            ...options,
            series: [{ name: t('energy.consumption'), data: chartData }]
        });

        chart.render();
        chartInstance.current = chart;

        return () => {
            if (chartInstance.current) chartInstance.current.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isScriptLoaded, viewMode, chartData, darkMode, t]);

    const getThemeColor = (mode: TimeViewMode) => {
        const palette = darkMode ? THEME_COLORS.dark : THEME_COLORS.light;
        if (mode === 'daily') return palette.daily;
        if (mode === 'monthly') return palette.monthly;
        return palette.yearly;
    };

    const getChartOptions = (mode: TimeViewMode, data: any[]) => {
        const theme = darkMode ? THEME_COLORS.dark : THEME_COLORS.light;
        return {
            chart: {
                type: 'bar',
                height: isPopup ? 400 : 350,
                background: 'transparent',
                toolbar: { show: false },
                animations: { enabled: true }
            },
            theme: { mode: darkMode ? 'dark' : 'light' },
            plotOptions: {
                bar: {
                    borderRadius: 4,
                    columnWidth: '60%',
                    distributed: false, // Use single color for series
                    dataLabels: { position: 'top' }
                }
            },
            dataLabels: {
                enabled: false,
                formatter: (val: number) => val.toFixed(0),
                offsetY: -20,
                style: { fontSize: '10px', colors: [theme.text] }
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shade: darkMode ? 'dark' : 'light',
                    type: 'vertical',
                    shadeIntensity: 0.5,
                    gradientToColors: [getThemeColor(mode)], // End color
                    inverseColors: true,
                    opacityFrom: 1,
                    opacityTo: 0.6,
                    stops: [0, 100]
                }
            },
            colors: [getThemeColor(mode)], // Base color
            xaxis: {
                categories: data.map(d => d.x),
                labels: {
                    style: { colors: theme.subtext, fontSize: '10px' },
                    rotate: -45
                },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                labels: { style: { colors: theme.subtext } },
                title: { text: t('energy.unit'), style: { color: theme.subtext } }
            },
            grid: {
                borderColor: theme.grid,
                strokeDashArray: 3,
            },
            tooltip: {
                theme: darkMode ? 'dark' : 'light',
                y: { formatter: (val: number) => val.toFixed(2) + " " + t('energy.unit') }
            }
        };
    };

    const handleAnalyze = async () => {
        setAnalyzing(true);
        const total = chartData.reduce((acc, cur) => acc + cur.y, 0);
        // Use simplified analysis for energy chart
        const result = await analyzeEnergy(total, total * 30, total * 365);
        setAiResult({ mode: viewMode, text: result.text, isLocal: result.isLocal });
        setAnalyzing(false);
    };

    // Use API's totalEnergy (accurate integral) if available, otherwise sum from bars
    const getTotal = () => {
        if (apiTotalEnergy !== null && apiTotalEnergy > 0) {
            return apiTotalEnergy.toFixed(2);
        }
        return chartData.reduce((acc, cur) => acc + cur.y, 0).toFixed(2);
    };

    const getTitle = () => {
        if (viewMode === 'daily') return t('history.dailyConsumption');
        if (viewMode === 'monthly') return t('history.monthlyConsumption');
        // Add a yearly key or fallback
        return t('energy.title') + ' (' + t('export.buckets.yearly') + ')';
    };

    if (!isScriptLoaded) return <div className="p-4 text-slate-500 dark:text-slate-400">{t('common.loading')}</div>;

    return (
        <div className={`energy-chart-modern relative ${isPopup ? 'popup-mode shadow-none border-none h-full' : 'rounded-2xl shadow-lg border border-slate-200 dark:border-white/5'} p-6 transition-colors duration-200 bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 text-slate-800 dark:text-white`}>
            {/* Header */}
            <style>{scrollbarStyles}</style>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-cyan-100 text-cyan-600 dark:bg-white/5 dark:text-white text-lg">
                        <BarChart3 size={20} />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold tracking-wide uppercase text-slate-800 dark:text-slate-100 m-0">{getTitle()}</h2>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {t('energy.totalEnergy')}: <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">{getTotal()}</span> {t('energy.unit')}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
                    <div className="flex bg-slate-100 dark:bg-black/20 p-1 rounded-lg gap-1">
                        <button
                            onClick={() => setViewMode('daily')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${viewMode === 'daily' ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-black' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >
                            {t('export.buckets.daily')}
                        </button>
                        <button
                            onClick={() => setViewMode('monthly')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${viewMode === 'monthly' ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >
                            {t('export.buckets.monthly')}
                        </button>
                        <button
                            onClick={() => setViewMode('yearly')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${viewMode === 'yearly' ? 'bg-purple-600 text-white dark:bg-purple-500 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >
                            {t('export.buckets.yearly')}
                        </button>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-500 dark:bg-white/10 dark:text-white dark:hover:bg-red-500/80 transition-colors">
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Chart */}
            <div className="min-h-[350px]">
                <div ref={chartDivRef} />
            </div>

            {/* AI Activator - Floating Icon */}
            <div className="absolute bottom-6 right-6">
                <button
                    className={`group relative flex items-center justify-center w-12 h-12 rounded-full transition-all duration-500 overflow-hidden ${analyzing
                        ? 'bg-slate-400 cursor-wait'
                        : 'bg-white/10 hover:bg-violet-500/20 backdrop-blur-xl border border-white/20 hover:border-violet-500/50 shadow-lg hover:shadow-violet-500/40'
                        }`}
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    title={t('status.aiDiagnosis')}
                >
                    {/* Liquid Background Effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/20 to-fuchsia-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    {analyzing ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <div className="relative transform group-hover:scale-110 transition-transform duration-500">
                            <Brain size={24} className="text-violet-600 dark:text-violet-400 group-hover:text-violet-500" />
                        </div>
                    )}

                    {/* Notification Dot if result is hidden */}
                    {!aiResult && !analyzing && (
                        <div className="absolute top-2 right-2 w-2 h-2 bg-fuchsia-500 rounded-full animate-pulse shadow-sm" />
                    )}
                </button>
            </div>

            {/* AI Result - Liquid Glass Popup */}
            {aiResult && (
                <div className="absolute bottom-[76px] right-6 left-6 sm:left-auto sm:w-[280px] 
                    bg-gradient-to-br from-white/40 to-white/10 dark:from-slate-800/40 dark:to-slate-900/10 
                    backdrop-blur-2xl border border-white/30 dark:border-white/10 
                    rounded-2xl p-3.5 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] 
                    animate-in zoom-in-95 slide-in-from-bottom-8 duration-500 z-50
                    before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-violet-500/5 before:to-transparent before:pointer-events-none"
                >
                    {/* Glossy Reflection Effect */}
                    <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-2xl pointer-events-none" />

                    <div className="relative flex justify-between items-center mb-3">
                        <span className="text-xs font-extrabold tracking-widest uppercase text-violet-700 dark:text-violet-300 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                            {t('reports.title')}
                        </span>
                        <button
                            onClick={() => setAiResult(null)}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-all duration-300 border border-white/20"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className="relative max-h-[220px] overflow-y-auto pr-2 liquid-glass-scroll
                        text-[11px] text-slate-800 dark:text-slate-100 leading-relaxed font-bold 
                        bg-white/10 dark:bg-black/10 rounded-xl p-3 border border-white/10
                        transition-all duration-300">
                        <TextWithIcons text={aiResult.text} />
                    </div>
                </div>
            )}
        </div>
    );
}