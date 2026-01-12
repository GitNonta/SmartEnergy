import React, { useState, useEffect, useRef } from 'react';
import { getApiBase } from '../config/api';
import { BarChart3, X, Brain } from 'lucide-react';
import { analyzeEnergy, isAIConfigured } from '../services/aiService';

// --- Constants & Config ---
const APEXCHARTS_CDN_URL = "https://cdn.jsdelivr.net/npm/apexcharts";

// Theme Colors (Cyan/Blue/Purple Gradient)
const COLORS = {
    daily: '#22d3ee',   // Cyan
    monthly: '#3b82f6', // Blue
    yearly: '#a855f7',  // Purple
    bg: '#1e293b',
    barBg: '#334155'
};

export type TimeViewMode = 'daily' | 'monthly' | 'yearly';

interface EnergyAccumulatedChartProps {
    initialViewMode?: TimeViewMode;
    onClose?: () => void;
    isPopup?: boolean;
}

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

// Removed duplicate fetchFromDailyConsumption - consolidated into fetchDailyData above

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
    }, [isScriptLoaded, viewMode, chartData]);

    const getThemeColor = (mode: TimeViewMode) => {
        if (mode === 'daily') return COLORS.daily;
        if (mode === 'monthly') return COLORS.monthly;
        return COLORS.yearly;
    };

    const getChartOptions = (mode: TimeViewMode, data: any[]) => ({
        chart: {
            type: 'bar',
            height: isPopup ? 400 : 350,
            background: 'transparent',
            toolbar: { show: false },
            animations: { enabled: true }
        },
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
            style: { fontSize: '10px', colors: ["#fff"] }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shade: 'dark',
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
                style: { colors: '#94a3b8', fontSize: '10px' },
                rotate: -45
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
            y: { formatter: (val: number) => val.toFixed(2) + " kWh" }
        }
    });

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

    if (!isScriptLoaded) return <div className="p-4 text-white">Loading Chart...</div>;

    return (
        <div className={`energy-chart-modern ${isPopup ? 'popup-mode' : ''}`}>
            {/* Header */}
            <div className="e-header">
                <div className="e-title-group">
                    <div className="e-icon"><BarChart3 size={24} /></div>
                    <div>
                        <h2 className="e-title">{getTitle()}</h2>
                        <span className="e-subtitle">Total: <span className="highlight">{getTotal()}</span> kWh</span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="e-tabs">
                        <button onClick={() => setViewMode('daily')} className={`e-tab t-daily ${viewMode === 'daily' ? 'active' : ''}`}>Daily</button>
                        <button onClick={() => setViewMode('monthly')} className={`e-tab t-monthly ${viewMode === 'monthly' ? 'active' : ''}`}>Monthly</button>
                        <button onClick={() => setViewMode('yearly')} className={`e-tab t-yearly ${viewMode === 'yearly' ? 'active' : ''}`}>Yearly</button>
                    </div>
                    {onClose && <button onClick={onClose} className="e-close-btn"><X size={20} /></button>}
                </div>
            </div>

            {/* Chart */}
            <div className="e-chart-container">
                <div ref={chartDivRef} />
            </div>

            {/* Footer / AI */}
            <div className="e-footer">
                <button
                    className={`e-ai-btn ${analyzing ? 'loading' : ''}`}
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
                <div className="e-ai-result">
                    <div className="ai-header">
                        <span>Audit for {aiResult.mode}</span>
                        <button onClick={() => setAiResult(null)}><X size={16} /></button>
                    </div>
                    <div className="ai-body">{aiResult.text}</div>
                </div>
            )}

            <style>{`
                .energy-chart-modern {
                    background: linear-gradient(145deg, #1e293b, #111827);
                    border-radius: 16px;
                    border: 1px solid rgba(255,255,255,0.05);
                    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                    padding: 1.5rem;
                    color: #fff;
                    font-family: 'Inter', sans-serif;
                    position: relative;
                }
                .energy-chart-modern.popup-mode { box-shadow: none; border: none; height: 100%; }
                
                .e-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
                .e-title-group { display: flex; align-items: center; gap: 10px; }
                .e-icon { width: 36px; height: 36px; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
                .e-title { font-size: 0.9rem; font-weight: 700; letter-spacing: 0.05em; margin: 0; color: #f8fafc; }
                .e-subtitle { font-size: 0.75rem; color: #94a3b8; }
                .e-subtitle .highlight { color: #22d3ee; font-family: 'Roboto Mono', monospace; font-weight: 700; }

                .e-tabs { display: flex; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 8px; gap: 4px; }
                .e-tab { border: none; background: transparent; color: #64748b; padding: 6px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
                .e-tab:hover { color: #cbd5e1; }
                .e-tab.active { background: #334155; color: #fff; }
                .e-tab.t-daily.active { background: ${COLORS.daily}; color: #000; }
                .e-tab.t-monthly.active { background: ${COLORS.monthly}; }
                .e-tab.t-yearly.active { background: ${COLORS.yearly}; }

                .e-close-btn { background: rgba(255,255,255,0.1); border: none; color: #fff; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
                .e-close-btn:hover { background: rgba(239, 68, 68, 0.8); }

                .e-chart-container { min-height: 350px; }

                .e-footer { margin-top: 1rem; display: flex; justify-content: flex-end; }
                .e-ai-btn { background: linear-gradient(90deg, #8b5cf6, #d946ef); border: none; padding: 8px 16px; border-radius: 6px; color: white; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: transform 0.2s; display: flex; align-items: center; gap: 8px; }
                .e-ai-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4); }
                .e-ai-btn.loading { opacity: 0.7; cursor: wait; }

                .e-ai-result { margin-top: 1rem; background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 8px; padding: 1rem; animation: slideDown 0.3s ease; }
                .ai-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; font-weight: 700; color: #c084fc; margin-bottom: 0.5rem; }
                .ai-header button { background: none; border: none; color: inherit; cursor: pointer; display: flex; align-items: center; padding: 0; }
                .ai-body { font-size: 0.85rem; color: #e9d5ff; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }

                @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                
                @media (max-width: 600px) {
                    .e-header { flex-direction: column; align-items: flex-start; }
                    .e-tabs { width: 100%; justify-content: space-between; }
                    .e-ai-btn { width: 100%; }
                }
            `}</style>
        </div>
    );
}