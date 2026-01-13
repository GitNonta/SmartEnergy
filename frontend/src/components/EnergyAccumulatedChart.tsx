import React, { useState, useEffect, useRef } from 'react';
import { getApiBase } from '../config/api';
import { BarChart3, X, Brain } from 'lucide-react';
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

// ... (Keep existing fetch functions: fetchRealData, fetchDailyData, fetchMonthlyData, fetchYearlyData, generateFallbackData) ...
// Since I cannot use "Keep existing..." in replace_file_content, I must include them.
// However, the tool allows me to replace the WHOLE file content if I start from line 1.
// But wait, the previous tool call viewed the whole file.
// I will just replace the Component part and imports, and keep the fetch functions if I can strictly target lines.
// BUT, the fetch functions are outside the component.
// I will keep the fetch functions as they are, but I need to replace the imports and the component definition.
// Actually, I'll rewrite the whole file to be safe and clean, reusing the logic.

// --- Real Data Fetchers from InfluxDB (Historical Data) ---
const fetchRealData = async (mode: TimeViewMode) => {
    try {
        console.log(`📊 Fetching ${mode} energy data from InfluxDB...`);

        if (mode === 'daily') {
            return await fetchDailyData();
        } else if (mode === 'monthly') {
            return await fetchMonthlyData();
        } else {
            return await fetchYearlyData();
        }
    } catch (error) {
        console.error('❌ Error fetching energy data:', error);
        return generateFallbackData(mode);
    }
};

// Fetch Daily data: Today's hourly energy breakdown (00:00 - current hour)
const fetchDailyData = async () => {
    try {
        // Use daily-consumption endpoint which gives real hourly breakdown for today
        const response = await fetch(
            `${getApiBase()}/api/energy/daily-consumption?deviceId=AI205`,
            { cache: 'no-store' }
        );

        if (!response.ok) {
            console.warn(`⚠️ Daily consumption API returned ${response.status}`);
            return generateFallbackData('daily');
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.hourlyData)) {
            console.warn('⚠️ Invalid daily consumption data');
            return generateFallbackData('daily');
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

        const totalEnergy = chartData.reduce((sum, d) => sum + d.y, 0);
        console.log(`✅ Daily chart: ${chartData.length} hours, total ${totalEnergy.toFixed(4)} kWh (up to hour ${currentHour})`);

        return chartData.length > 0 ? chartData : generateFallbackData('daily');
    } catch (error) {
        console.error('❌ Error fetching daily data:', error);
        return generateFallbackData('daily');
    }
};

// Fetch Monthly data: Current month's daily energy breakdown
const fetchMonthlyData = async () => {
    try {
        const response = await fetch(
            `${getApiBase()}/api/energy/monthly-chart?deviceId=AI205`,
            { cache: 'no-store' }
        );

        if (!response.ok) {
            console.warn(`⚠️ Monthly chart API returned ${response.status}`);
            return generateFallbackData('monthly');
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.chartData)) {
            console.warn('⚠️ Invalid monthly chart data');
            return generateFallbackData('monthly');
        }

        console.log(`✅ Monthly chart: ${data.chartData.length} days, total ${data.total} kWh`);
        return data.chartData;
    } catch (error) {
        console.error('❌ Error fetching monthly data:', error);
        return generateFallbackData('monthly');
    }
};

// Fetch Yearly data: Current year's monthly energy breakdown
const fetchYearlyData = async () => {
    try {
        const response = await fetch(
            `${getApiBase()}/api/energy/yearly-chart?deviceId=AI205`,
            { cache: 'no-store' }
        );

        if (!response.ok) {
            console.warn(`⚠️ Yearly chart API returned ${response.status}`);
            return generateFallbackData('yearly');
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.chartData)) {
            console.warn('⚠️ Invalid yearly chart data');
            return generateFallbackData('yearly');
        }

        console.log(`✅ Yearly chart: ${data.chartData.length} months, total ${data.total} kWh`);
        return data.chartData;
    } catch (error) {
        console.error('❌ Error fetching yearly data:', error);
        return generateFallbackData('yearly');
    }
};

// --- Fallback Empty Data (when no data available) ---
// Returns zeros instead of fake data to clearly show periods with no real data
const generateFallbackData = (mode: TimeViewMode) => {
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
            data.push({ x: `Day ${i}`, y: 0 });
        }
    } else if (mode === 'yearly') {
        // 12 Months with zeros
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        for (let i = 0; i < 12; i++) {
            data.push({ x: months[i], y: 0 });
        }
    }
    return data;
};

export default function EnergyAccumulatedChart({ initialViewMode = 'daily', onClose, isPopup = false }: EnergyAccumulatedChartProps) {
    const { darkMode } = useTheme();
    const [viewMode, setViewMode] = useState<TimeViewMode>(initialViewMode);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const chartInstance = useRef<any>(null);
    const chartDivRef = useRef<HTMLDivElement>(null);

    // AI State
    const [analyzing, setAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState<{ mode: string, text: string, isLocal?: boolean } | null>(null);

    // Load Data
    const [chartData, setChartData] = useState<{ x: string, y: number }[]>([]);

    useEffect(() => {
        setViewMode(initialViewMode);
    }, [initialViewMode]);

    useEffect(() => {
        const loadData = async () => {
            console.log(`📊 Loading ${viewMode} chart data...`);
            const data = await fetchRealData(viewMode);
            setChartData(data);
        };

        // Initial load
        loadData();

        // Auto-refresh for real-time updates
        // Daily: every 30 seconds, Monthly/Yearly: every 5 minutes
        const refreshInterval = viewMode === 'daily' ? 30000 : 300000;
        const interval = setInterval(() => {
            console.log(`🔄 Auto-refreshing ${viewMode} chart...`);
            loadData();
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [viewMode]);

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
            series: [{ name: 'Consumption', data: chartData }]
        });

        chart.render();
        chartInstance.current = chart;

        return () => {
            if (chartInstance.current) chartInstance.current.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isScriptLoaded, viewMode, chartData, darkMode]);

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
                title: { text: 'kWh', style: { color: theme.subtext } }
            },
            grid: {
                borderColor: theme.grid,
                strokeDashArray: 3,
            },
            tooltip: {
                theme: darkMode ? 'dark' : 'light',
                y: { formatter: (val: number) => val.toFixed(2) + " kWh" }
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

    const getTotal = () => chartData.reduce((acc, cur) => acc + cur.y, 0).toFixed(2);

    const getTitle = () => {
        if (viewMode === 'daily') return 'DAILY CONSUMPTION (24H)';
        if (viewMode === 'monthly') return 'MONTHLY CONSUMPTION';
        return 'YEARLY CONSUMPTION';
    };

    if (!isScriptLoaded) return <div className="p-4 text-slate-500 dark:text-slate-400">Loading Chart...</div>;

    return (
        <div className={`energy-chart-modern ${isPopup ? 'popup-mode shadow-none border-none h-full' : 'rounded-2xl shadow-lg border border-slate-200 dark:border-white/5'} p-6 transition-colors duration-200 bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 text-slate-800 dark:text-white`}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-cyan-100 text-cyan-600 dark:bg-white/5 dark:text-white text-lg">
                        <BarChart3 size={20} />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold tracking-wide uppercase text-slate-800 dark:text-slate-100 m-0">{getTitle()}</h2>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Total: <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">{getTotal()}</span> kWh
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
                    <div className="flex bg-slate-100 dark:bg-black/20 p-1 rounded-lg gap-1">
                        <button
                            onClick={() => setViewMode('daily')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${viewMode === 'daily' ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-black' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >Daily</button>
                        <button
                            onClick={() => setViewMode('monthly')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${viewMode === 'monthly' ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >Monthly</button>
                        <button
                            onClick={() => setViewMode('yearly')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${viewMode === 'yearly' ? 'bg-purple-600 text-white dark:bg-purple-500 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >Yearly</button>
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

            {/* Footer / AI */}
            <div className="mt-4 flex justify-end">
                <button
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all transform hover:-translate-y-px hover:shadow-lg ${analyzing ? 'opacity-70 cursor-wait bg-slate-400' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:shadow-violet-500/40'}`}
                    onClick={handleAnalyze}
                    disabled={analyzing}
                >
                    {analyzing ? (
                        <span>ANALYZING...</span>
                    ) : (
                        <>
                            <Brain size={16} />
                            <span>AI ENERGY AUDIT</span>
                        </>
                    )}
                </button>
            </div>

            {/* AI Result */}
            {aiResult && (
                <div className="mt-4 bg-violet-50 border border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/20 rounded-lg p-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-violet-600 dark:text-violet-300">Audit for {aiResult.mode}</span>
                        <button onClick={() => setAiResult(null)} className="text-violet-400 hover:text-violet-600 dark:hover:text-violet-200"><X size={16} /></button>
                    </div>
                    <div className="text-sm text-violet-900 dark:text-violet-100 leading-relaxed whitespace-pre-wrap">
                        {aiResult.text}
                    </div>
                </div>
            )}
        </div>
    );
}