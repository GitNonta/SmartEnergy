import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { useTheme } from './AppShell';
import { Zap, BarChart3, Brain, X, Cpu, TrendingUp, CheckCircle2, AlertTriangle, AlertOctagon, XCircle, Info } from 'lucide-react';
import { analyzePower, isAIConfigured } from '../services/aiService';

// --- Constants & Config ---
const MAX_DATA_POINTS = 60; // 1 Minute History
const APEXCHARTS_CDN_URL = "https://cdn.jsdelivr.net/npm/apexcharts";

// Theme Colors (Modern Industrial)
const COLORS = {
    total: '#10b981', // Emerald Green for Total
    p1: '#ef4444',    // Red (L1)
    p2: '#eab308',    // Yellow (L2)
    p3: '#3b82f6',    // Blue (L3)
    bg: '#1e293b',
    grid: '#334155'
};

// --- Interfaces ---
interface PowerStats {
    min: string; max: string; avg: string; current: string;
}

interface ChartDataPoint {
    x: number;
    y: number;
}

export type PowerViewMode = 'total' | 'phase1' | 'phase2' | 'phase3';

interface ActivePowerRealtimeChartProps {
    initialViewMode?: PowerViewMode;
    onClose?: () => void;
    isPopup?: boolean;
}

// --- Helpers ---
const calculateStats = (data: ChartDataPoint[]): PowerStats => {
    if (!data || data.length === 0) return { min: '-', max: '-', avg: '-', current: '-' };
    const values = data.map(d => d.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const current = values[values.length - 1];
    return {
        min: min.toFixed(0),
        max: max.toFixed(0),
        avg: avg.toFixed(0),
        current: current.toFixed(0)
    };
};

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
    .liquid-glass-scroll::-webkit-scrollbar { width: 4px; }
    .liquid-glass-scroll::-webkit-scrollbar-track { background: transparent; }
    .liquid-glass-scroll::-webkit-scrollbar-thumb {
        background: rgba(139, 92, 246, 0.2);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .liquid-glass-scroll::-webkit-scrollbar-thumb:hover { background: rgba(139, 92, 246, 0.4); }
    .dark .liquid-glass-scroll::-webkit-scrollbar-thumb { background: rgba(167, 139, 250, 0.2); }
    .dark .liquid-glass-scroll::-webkit-scrollbar-thumb:hover { background: rgba(167, 139, 250, 0.4); }
`;

export default function ActivePowerRealtimeChart({ initialViewMode = 'total', onClose, isPopup = false }: ActivePowerRealtimeChartProps) {
    // --- State ---
    const { energyData, isConnected } = useWebSocket();
    const { darkMode } = useTheme();
    const [viewMode, setViewMode] = useState<PowerViewMode>(initialViewMode);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);

    // Data Refs
    const historyTotal = useRef<ChartDataPoint[]>([]);
    const historyP1 = useRef<ChartDataPoint[]>([]);
    const historyP2 = useRef<ChartDataPoint[]>([]);
    const historyP3 = useRef<ChartDataPoint[]>([]);
    const chartInstance = useRef<any>(null);
    const chartDivRef = useRef<HTMLDivElement>(null);

    // AI State
    const [analyzing, setAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState<{ mode: string, text: string, isLocal?: boolean } | null>(null);

    // Dynamic Y-Axis State
    const [yAxisMin, setYAxisMin] = useState(0);
    const [yAxisMax, setYAxisMax] = useState(100);

    useEffect(() => {
        setViewMode(initialViewMode);
    }, [initialViewMode]);

    // Load ApexCharts
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

    // Data Loop
    useEffect(() => {
        if (!energyData?.power) return;

        try {
            const now = new Date().getTime();
            const pt = Number(energyData.power.total) || 0;
            const p1 = Number(energyData.power.phase1) || 0;
            const p2 = Number(energyData.power.phase2) || 0;
            const p3 = Number(energyData.power.phase3) || 0;

            const updateHistory = (ref: React.MutableRefObject<ChartDataPoint[]>, val: number) => {
                if (!ref.current) ref.current = [];
                ref.current.push({ x: now, y: val });
                if (ref.current.length > MAX_DATA_POINTS) ref.current.shift();
            };

            updateHistory(historyTotal, pt);
            updateHistory(historyP1, p1);
            updateHistory(historyP2, p2);
            updateHistory(historyP3, p3);

            // Calculate dynamic Y-axis based on current view mode data
            let allValues: number[] = [];
            if (viewMode === 'total') {
                allValues = historyTotal.current.map(d => d.y).filter(v => v > 0);
            } else if (viewMode === 'phase1') {
                allValues = historyP1.current.map(d => d.y).filter(v => v > 0);
            } else if (viewMode === 'phase2') {
                allValues = historyP2.current.map(d => d.y).filter(v => v > 0);
            } else {
                allValues = historyP3.current.map(d => d.y).filter(v => v > 0);
            }

            if (allValues.length > 0) {
                const dataMin = Math.min(...allValues);
                const dataMax = Math.max(...allValues);
                // Add small padding (10W) and round to unit level
                const newMin = Math.floor(dataMin - 10);
                const newMax = Math.ceil(dataMax + 10);
                setYAxisMin(Math.max(0, newMin));
                setYAxisMax(Math.max(newMax, 10)); // At least 10W max
            }

            if (chartInstance.current && chartInstance.current.updateSeries) {
                chartInstance.current.updateSeries(getSeriesForMode(viewMode));
            }
        } catch (error) {
            console.error('Data update error', error);
        }
    }, [energyData, viewMode]);

    // Chart Init
    useEffect(() => {
        if (!isScriptLoaded || !chartDivRef.current) return;

        try {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }

            const ApexCharts = (window as any).ApexCharts;
            if (!ApexCharts) return;

            const options = getChartOptions(viewMode);
            const series = getSeriesForMode(viewMode);

            const chart = new ApexCharts(chartDivRef.current, {
                ...options,
                series: series
            });

            chart.render();
            chartInstance.current = chart;
        } catch (error) {
            console.error('Init error', error);
        }

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [isScriptLoaded, viewMode]);

    // Update Y-axis when min/max changes
    useEffect(() => {
        if (chartInstance.current && chartInstance.current.updateOptions) {
            chartInstance.current.updateOptions({
                yaxis: {
                    min: yAxisMin,
                    max: yAxisMax,
                    labels: { formatter: (val: number) => val.toFixed(0) },
                    tickAmount: 5,
                    title: {
                        text: `Power (W) [${yAxisMin}-${yAxisMax}]`,
                        style: { color: '#94a3b8', fontSize: '11px' }
                    }
                }
            }, false, false);
        }
    }, [yAxisMin, yAxisMax]);

    // Helpers
    const getSeriesForMode = (mode: PowerViewMode) => {
        const dt = [...(historyTotal.current || [])];
        const d1 = [...(historyP1.current || [])];
        const d2 = [...(historyP2.current || [])];
        const d3 = [...(historyP3.current || [])];

        switch (mode) {
            case 'total':
                return [{ name: 'Total Power', data: dt, color: COLORS.total }];
            case 'phase1':
                return [{ name: 'Phase 1 Power', data: d1, color: COLORS.p1 }];
            case 'phase2':
                return [{ name: 'Phase 2 Power', data: d2, color: COLORS.p2 }];
            case 'phase3':
                return [{ name: 'Phase 3 Power', data: d3, color: COLORS.p3 }];
            default: return [];
        }
    };

    const getChartOptions = (mode: PowerViewMode) => ({
        chart: {
            type: mode === 'total' ? 'area' : 'line', // Total uses Area chart for impact
            height: isPopup ? 400 : 350,
            background: 'transparent',
            animations: { enabled: true, easing: 'linear', dynamicAnimation: { speed: 1000 } },
            toolbar: {
                show: true,
                tools: { download: false, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true },
                autoSelected: 'zoom'
            },
            zoom: { enabled: true }
        },
        stroke: {
            curve: 'smooth',
            width: mode === 'total' ? 2 : 3
        },
        fill: {
            type: mode === 'total' ? 'gradient' : 'solid',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.7,
                opacityTo: 0.1,
                stops: [0, 90, 100]
            }
        },
        markers: {
            size: 3,
            strokeWidth: 0,
            hover: { size: 5 }
        },
        theme: { mode: darkMode ? 'dark' : 'light' },
        xaxis: {
            type: 'datetime',
            labels: {
                datetimeFormatter: { year: 'yyyy', month: 'MMM', day: 'dd', hour: 'HH:mm:ss' },
                // Format timestamps in Bangkok time (UTC+7)
                formatter: (val: string | number) => {
                    const timestamp = typeof val === 'string' ? parseInt(val) : val;
                    const date = new Date(timestamp);
                    // Add 7 hours for Bangkok timezone
                    const bangkokTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);

                    const hours = String(bangkokTime.getUTCHours()).padStart(2, '0');
                    const minutes = String(bangkokTime.getUTCMinutes()).padStart(2, '0');
                    const seconds = String(bangkokTime.getUTCSeconds()).padStart(2, '0');

                    return `${hours}:${minutes}:${seconds}`;
                }
            },
            tooltip: { enabled: false },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: { formatter: (val: number) => val.toFixed(0) },
            tickAmount: 5,
            min: yAxisMin,
            max: yAxisMax,
            title: {
                text: `Power (W) [${yAxisMin}-${yAxisMax}]`,
                style: { color: darkMode ? '#94a3b8' : '#64748b', fontSize: '11px' }
            }
        },
        grid: {
            borderColor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            strokeDashArray: 3,
        },
        legend: { show: true, position: 'top' },
        tooltip: {
            enabled: true,
            theme: darkMode ? 'dark' : 'light',
            x: {
                formatter: (val: number) => {
                    // Convert UTC timestamp to Bangkok time
                    const date = new Date(val);
                    const bangkokTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);

                    const year = bangkokTime.getUTCFullYear();
                    const month = String(bangkokTime.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(bangkokTime.getUTCDate()).padStart(2, '0');
                    const hours = String(bangkokTime.getUTCHours()).padStart(2, '0');
                    const minutes = String(bangkokTime.getUTCMinutes()).padStart(2, '0');
                    const seconds = String(bangkokTime.getUTCSeconds()).padStart(2, '0');

                    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                }
            },
            y: { formatter: (val: number) => val.toFixed(0) + " W" }
        }
    });

    const handleAnalyze = async () => {
        try {
            setAnalyzing(true);
            let targetMode = "Total System";
            let targetVal = historyTotal.current[historyTotal.current.length - 1]?.y || 0;

            if (viewMode === 'phase1') { targetMode = "Phase 1"; targetVal = historyP1.current[historyP1.current.length - 1]?.y || 0; }
            if (viewMode === 'phase2') { targetMode = "Phase 2"; targetVal = historyP2.current[historyP2.current.length - 1]?.y || 0; }
            if (viewMode === 'phase3') { targetMode = "Phase 3"; targetVal = historyP3.current[historyP3.current.length - 1]?.y || 0; }

            const result = await analyzePower(targetMode, targetVal);
            setAiResult({ mode: targetMode, text: result.text, isLocal: result.isLocal });
        } catch (error) {
            setAiResult({ mode: 'Error', text: 'Analysis failed.' });
        } finally {
            setAnalyzing(false);
        }
    };

    if (!isScriptLoaded) return <div className="p-4 text-white">Loading Visualization...</div>;

    const stats = calculateStats(
        viewMode === 'total' ? (historyTotal.current || []) :
            viewMode === 'phase1' ? (historyP1.current || []) :
                viewMode === 'phase2' ? (historyP2.current || []) :
                    (historyP3.current || [])
    );

    const getTitle = () => {
        if (viewMode === 'total') return 'TOTAL ACTIVE POWER';
        return `PHASE ${viewMode.replace('phase', '')} POWER`;
    };

    return (
        <div className={`power-chart-modern ${isPopup ? 'popup-mode' : ''}`}>
            {/* Header */}
            <div className="p-header">
                <div className="p-title-group">
                    <div className="p-icon">⚡</div>
                    <div>
                        <h2 className="p-title">{getTitle()}</h2>
                        <span className="p-subtitle">Real-time Consumption Visualizer</span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="p-tabs">
                        <button onClick={() => setViewMode('total')} className={`p-tab t-total ${viewMode === 'total' ? 'active' : ''}`}>TOTAL</button>
                        <button onClick={() => setViewMode('phase1')} className={`p-tab t-p1 ${viewMode === 'phase1' ? 'active' : ''}`}>P1</button>
                        <button onClick={() => setViewMode('phase2')} className={`p-tab t-p2 ${viewMode === 'phase2' ? 'active' : ''}`}>P2</button>
                        <button onClick={() => setViewMode('phase3')} className={`p-tab t-p3 ${viewMode === 'phase3' ? 'active' : ''}`}>P3</button>
                    </div>
                    {onClose && <button onClick={onClose} className="p-close-btn">✕</button>}
                </div>
            </div>

            {/* Chart */}
            <style>{scrollbarStyles}</style>
            <div className="p-chart-container relative group">
                <div ref={chartDivRef} id="power-chart" />
                {!isConnected && <div className="p-overlay">OFFLINE</div>}

                {/* AI Activator Icon */}
                <div className="absolute bottom-4 right-4 z-20">
                    <button
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className={`
                            group/btn relative p-3 rounded-2xl transition-all duration-500
                            bg-white/10 dark:bg-white/5 backdrop-blur-xl
                            border border-white/20 dark:border-white/10
                            hover:border-violet-500/50 hover:bg-violet-500/10
                            shadow-[0_8px_32px_0_rgba(31,38,135,0.1)]
                            active:scale-90 disabled:opacity-50
                        `}
                        title="AI Insight"
                    >
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-violet-500/0 to-violet-500/0 group-hover/btn:from-violet-500/10 group-hover/btn:to-transparent transition-all duration-500" />
                        <Brain
                            size={24}
                            className={`
                                relative z-10 transition-all duration-500
                                ${analyzing ? 'text-violet-500 animate-pulse' : 'text-slate-400 group-hover/btn:text-violet-500'}
                            `}
                        />
                        {!aiResult && !analyzing && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-violet-500 rounded-full border-2 border-white dark:border-slate-900 animate-bounce" />
                        )}
                    </button>
                </div>
            </div>

            {/* AI Result Popup - Liquid Glass */}
            {aiResult && (
                <div className="absolute bottom-22 right-4 left-4 sm:left-auto sm:w-[280px] z-50 animate-in zoom-in-95 slide-in-from-bottom-6 duration-500">
                    <div className="relative overflow-hidden rounded-2xl liquid-glass-container p-3.5 backdrop-blur-2xl border border-white/30 dark:border-white/10 shadow-2xl">
                        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />

                        <div className="relative z-10">
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-violet-500/20 text-violet-500">
                                        {aiResult.isLocal ? <BarChart3 size={14} /> : <Brain size={14} />}
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-violet-500 uppercase tracking-widest leading-none block mb-0.5">
                                            {aiResult.isLocal ? 'Local Insight' : 'AI Intelligence'}
                                        </span>
                                        <h3 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase">
                                            {aiResult.mode}
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setAiResult(null)}
                                    className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="relative max-h-[160px] overflow-y-auto pr-2 liquid-glass-scroll
                                text-[11px] text-slate-800 dark:text-slate-100 leading-relaxed font-bold 
                                bg-white/10 dark:bg-black/10 rounded-xl p-3 border border-white/10
                                transition-all duration-300">
                                <TextWithIcons text={aiResult.text} />

                                {aiResult.isLocal && (
                                    <div className="mt-2 pt-2 border-t border-white/5 text-[9px] text-center text-slate-500 dark:text-slate-400 italic">
                                        💡 Local Analysis Fallback
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Footer */}
            <div className="p-footer">
                <div className="p-stats-panel">
                    <div className="p-stat-row">
                        <div className="stat-box">
                            <span className="s-label">MIN</span>
                            <span className="s-val">{Number(stats.min).toLocaleString()} <span className="u">W</span></span>
                        </div>
                        <div className="stat-box">
                            <span className="s-label">MAX</span>
                            <span className="s-val">{Number(stats.max).toLocaleString()} <span className="u">W</span></span>
                        </div>
                        <div className="stat-box">
                            <span className="s-label">AVG</span>
                            <span className="s-val">{Number(stats.avg).toLocaleString()} <span className="u">W</span></span>
                        </div>
                        <div className="stat-box highlight">
                            <span className="s-label">NOW</span>
                            <span className="s-val">{Number(stats.current).toLocaleString()} <span className="u">W</span></span>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .power-chart-modern {
                    background: #ffffff;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                    padding: 1.5rem;
                    color: #1e293b;
                    font-family: 'Inter', sans-serif;
                    position: relative;
                }
                html.dark .power-chart-modern {
                    background: linear-gradient(145deg, #1e293b, #064e3b);
                    border: 1px solid rgba(16, 185, 129, 0.2);
                    color: #fff;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                }
                .power-chart-modern.popup-mode {
                    box-shadow: none; border: none; height: 100%;
                }
                .p-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
                .p-title-group { display: flex; align-items: center; gap: 10px; }
                
                .p-icon { width: 36px; height: 36px; background: #d1fae5; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: #059669; }
                html.dark .p-icon { background: rgba(16, 185, 129, 0.1); color: #10b981; }

                .p-title { font-size: 0.9rem; font-weight: 700; letter-spacing: 0.05em; margin: 0; color: #065f46; }
                html.dark .p-title { color: #d1fae5; }
                
                .p-subtitle { font-size: 0.7rem; color: #64748b; }
                html.dark .p-subtitle { color: #6ee7b7; }
                
                .p-tabs { display: flex; background: #f1f5f9; padding: 4px; border-radius: 8px; gap: 4px; }
                html.dark .p-tabs { background: rgba(0,0,0,0.2); }

                .p-tab { border: none; background: transparent; color: #64748b; padding: 6px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
                .p-tab:hover { color: #334155; }
                html.dark .p-tab { color: #94a3b8; }
                html.dark .p-tab:hover { color: #fff; }

                .p-tab.active { background: #ffffff; color: #0f172a; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                html.dark .p-tab.active { background: #334155; color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }

                .p-tab.t-total.active { background: ${COLORS.total}; color: #fff; }
                .p-tab.t-p1.active { background: ${COLORS.p1}; color: #fff; }
                .p-tab.t-p2.active { background: ${COLORS.p2}; color: #000; }
                .p-tab.t-p3.active { background: ${COLORS.p3}; color: #fff; }

                .p-close-btn { background: #f1f5f9; border: none; color: #64748b; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                html.dark .p-close-btn { background: rgba(255,255,255,0.1); color: #fff; }
                .p-close-btn:hover { background: #ef4444; color: white; }
                html.dark .p-close-btn:hover { background: rgba(239, 68, 68, 0.8); }

                .p-chart-container { min-height: 300px; position: relative; }
                .p-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); font-weight: bold; letter-spacing: 0.1em; color: #ef4444; }
                html.dark .p-overlay { background: rgba(0,0,0,0.5); }

                .p-footer { margin-top: 1rem; border-top: 1px solid #e2e8f0; padding-top: 1rem; }
                html.dark .p-footer { border-top: 1px solid rgba(255,255,255,0.05); }
                
                .p-stats-panel { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
                .p-stat-row { display: flex; gap: 1rem; }
                .stat-box { display: flex; flex-direction: column; }
                
                .s-label { font-size: 0.65rem; color: #64748b; font-weight: 700; }
                html.dark .s-label { color: #94a3b8; }

                .s-val { font-family: 'Roboto Mono', monospace; font-size: 1rem; font-weight: 600; color: #0f172a; }
                html.dark .s-val { color: #e2e8f0; }

                .s-val .u { font-size: 0.7rem; color: #64748b; }
                html.dark .s-val .u { color: #64748b; }

                .stat-box.highlight .s-val { color: #10b981; }
                html.dark .stat-box.highlight .s-val { color: #fff; text-shadow: 0 0 10px rgba(16, 185, 129, 0.3); }

                .p-ai-btn { background: linear-gradient(90deg, #10b981, #059669); border: none; padding: 8px 16px; border-radius: 6px; color: white; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: transform 0.2s; }
                .p-ai-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4); }
                .p-ai-btn.loading { opacity: 0.7; cursor: wait; }

                .p-ai-result { margin-top: 1rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 1rem; animation: slideDown 0.3s ease; }
                html.dark .p-ai-result { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); }

                .ai-header { display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 700; color: #10b981; margin-bottom: 0.5rem; }
                html.dark .ai-header { color: #6ee7b7; }

                .ai-body { font-size: 0.85rem; color: #065f46; line-height: 1.5; }
                html.dark .ai-body { color: #d1fae5; }
                
                @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                
                @media (max-width: 600px) {
                    .p-stats-panel { flex-direction: column; align-items: flex-start; }
                    .p-stat-row { width: 100%; justify-content: space-between; }
                    .p-ai-btn { width: 100%; }
                }
            `}</style>
        </div>
    );
}