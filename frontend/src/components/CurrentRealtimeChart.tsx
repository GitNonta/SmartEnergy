import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { useTheme } from './AppShell';
import { analyzeCurrent, isAIConfigured } from '../services/aiService';

// --- Constants & Config ---
const MAX_DATA_POINTS = 60; // 1 Minute History
const Y_AXIS_MIN = 0;

const APEXCHARTS_CDN_URL = "https://cdn.jsdelivr.net/npm/apexcharts";

// Theme Colors (Phase Standard)
const COLORS = {
    p1: '#ef4444', // Red (L1)
    p2: '#eab308', // Yellow (L2)
    p3: '#3b82f6', // Blue (L3)
    bg: '#1e293b',
    grid: '#334155'
};

// --- Interfaces ---
interface CurrentStats {
    min: string; max: string; avg: string; current: string;
}

interface ChartDataPoint {
    x: number;
    y: number;
}

export type CurrentViewMode = 'all' | 'phase1' | 'phase2' | 'phase3';

interface CurrentRealtimeChartProps {
    initialViewMode?: CurrentViewMode;
    onClose?: () => void;
    isPopup?: boolean;
}

// --- Helpers ---
const calculateStats = (data: ChartDataPoint[]): CurrentStats => {
    if (!data || data.length === 0) return { min: '-', max: '-', avg: '-', current: '-' };
    const values = data.map(d => d.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const current = values[values.length - 1];
    return {
        min: min.toFixed(2),
        max: max.toFixed(2),
        avg: avg.toFixed(2),
        current: current.toFixed(2)
    };
};

export default function CurrentRealtimeChart({ initialViewMode = 'all', onClose, isPopup = false }: CurrentRealtimeChartProps) {
    // --- State ---
    const { energyData, isConnected } = useWebSocket();
    const { darkMode } = useTheme();
    const [viewMode, setViewMode] = useState<CurrentViewMode>(initialViewMode);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);

    // Data Refs
    const historyP1 = useRef<ChartDataPoint[]>([]);
    const historyP2 = useRef<ChartDataPoint[]>([]);
    const historyP3 = useRef<ChartDataPoint[]>([]);
    const chartInstance = useRef<any>(null);
    const chartDivRef = useRef<HTMLDivElement>(null);

    // AI State
    const [analyzing, setAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState<{ phase: string, text: string, isLocal?: boolean } | null>(null);

    // Dynamic Y-Axis State
    const [yAxisMin, setYAxisMin] = useState(0);
    const [yAxisMax, setYAxisMax] = useState(10);

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
        if (!energyData?.current) return;

        try {
            const now = new Date().getTime();
            const i1 = Number(energyData.current.i1) || 0;
            const i2 = Number(energyData.current.i2) || 0;
            const i3 = Number(energyData.current.i3) || 0;

            const updateHistory = (ref: React.MutableRefObject<ChartDataPoint[]>, val: number) => {
                if (!ref.current) ref.current = [];
                ref.current.push({ x: now, y: val });
                if (ref.current.length > MAX_DATA_POINTS) ref.current.shift();
            };

            updateHistory(historyP1, i1);
            updateHistory(historyP2, i2);
            updateHistory(historyP3, i3);

            // Calculate dynamic Y-axis based on all phase data
            const allValues = [
                ...historyP1.current.map(d => d.y),
                ...historyP2.current.map(d => d.y),
                ...historyP3.current.map(d => d.y)
            ].filter(v => v > 0);

            if (allValues.length > 0) {
                const dataMin = Math.min(...allValues);
                const dataMax = Math.max(...allValues);
                // Add small padding (0.5A) and round to unit level
                const newMin = Math.floor(dataMin - 0.5);
                const newMax = Math.ceil(dataMax + 0.5);
                setYAxisMin(Math.max(0, newMin));
                setYAxisMax(Math.max(newMax, 1)); // At least 1A max
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
                    labels: { formatter: (val: number) => val.toFixed(1) },
                    tickAmount: 5,
                    title: {
                        text: `Current (A) [${yAxisMin.toFixed(1)}-${yAxisMax.toFixed(1)}]`,
                        style: { color: '#94a3b8', fontSize: '11px' }
                    }
                }
            }, false, false);
        }
    }, [yAxisMin, yAxisMax]);

    // Helpers
    const getSeriesForMode = (mode: CurrentViewMode) => {
        const d1 = [...(historyP1.current || [])];
        const d2 = [...(historyP2.current || [])];
        const d3 = [...(historyP3.current || [])];

        switch (mode) {
            case 'phase1': return [{ name: 'L1 Current', data: d1, color: COLORS.p1 }];
            case 'phase2': return [{ name: 'L2 Current', data: d2, color: COLORS.p2 }];
            case 'phase3': return [{ name: 'L3 Current', data: d3, color: COLORS.p3 }];
            default: return [
                { name: 'L1', data: d1, color: COLORS.p1 },
                { name: 'L2', data: d2, color: COLORS.p2 },
                { name: 'L3', data: d3, color: COLORS.p3 }
            ];
        }
    };

    const getChartOptions = (mode: CurrentViewMode) => ({
        chart: {
            type: 'line',
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
        stroke: { curve: 'smooth', width: 3 },
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
            labels: { formatter: (val: number) => val.toFixed(1) },
            tickAmount: 5,
            min: yAxisMin,
            max: yAxisMax,
            title: {
                text: `Current (A) [${yAxisMin.toFixed(1)}-${yAxisMax.toFixed(1)}]`,
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
            y: { formatter: (val: number) => val.toFixed(2) + " A" }
        }
    });

    const handleAnalyze = async () => {
        try {
            setAnalyzing(true);
            let targetPhase = "Phase L1";
            let targetVal = historyP1.current[historyP1.current.length - 1]?.y || 0;

            if (viewMode === 'phase1') { targetPhase = "Phase L1"; targetVal = historyP1.current[historyP1.current.length - 1]?.y || 0; }
            if (viewMode === 'phase2') { targetPhase = "Phase L2"; targetVal = historyP2.current[historyP2.current.length - 1]?.y || 0; }
            if (viewMode === 'phase3') { targetPhase = "Phase L3"; targetVal = historyP3.current[historyP3.current.length - 1]?.y || 0; }

            const result = await analyzeCurrent(targetPhase, targetVal);
            setAiResult({ phase: targetPhase, text: result.text, isLocal: result.isLocal });
        } catch (error) {
            setAiResult({ phase: 'Error', text: 'Analysis failed.' });
        } finally {
            setAnalyzing(false);
        }
    };

    if (!isScriptLoaded) return <div className="p-4 text-white">Loading Current Chart...</div>;

    const stats = calculateStats(
        viewMode === 'phase2' ? (historyP2.current || []) :
            viewMode === 'phase3' ? (historyP3.current || []) :
                (historyP1.current || [])
    );

    const getTitle = () => {
        if (viewMode === 'all') return 'PHASE CURRENT (ALL)';
        if (viewMode === 'phase1') return 'CURRENT: PHASE L1';
        if (viewMode === 'phase2') return 'CURRENT: PHASE L2';
        if (viewMode === 'phase3') return 'CURRENT: PHASE L3';
        return 'CURRENT MONITOR';
    };

    return (
        <div className={`current-chart-modern ${isPopup ? 'popup-mode' : ''}`}>
            {/* Header */}
            <div className="c-header">
                <div className="c-title-group">
                    <div className="c-icon">⚡</div>
                    <div>
                        <h2 className="c-title">{getTitle()}</h2>
                        <span className="c-subtitle">Real-time Load Monitor</span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="c-tabs">
                        <button onClick={() => setViewMode('all')} className={`c-tab ${viewMode === 'all' ? 'active' : ''}`}>ALL</button>
                        <button onClick={() => setViewMode('phase1')} className={`c-tab t-p1 ${viewMode === 'phase1' ? 'active' : ''}`}>L1</button>
                        <button onClick={() => setViewMode('phase2')} className={`c-tab t-p2 ${viewMode === 'phase2' ? 'active' : ''}`}>L2</button>
                        <button onClick={() => setViewMode('phase3')} className={`c-tab t-p3 ${viewMode === 'phase3' ? 'active' : ''}`}>L3</button>
                    </div>
                    {onClose && <button onClick={onClose} className="c-close-btn">✕</button>}
                </div>
            </div>

            {/* Chart */}
            <div className="c-chart-container">
                <div ref={chartDivRef} id="current-chart" />
                {!isConnected && <div className="c-overlay">OFFLINE</div>}
            </div>

            {/* Stats Footer */}
            <div className="c-footer">
                <div className="c-stats-panel">
                    <div className="c-stat-row">
                        <div className="stat-box">
                            <span className="s-label">MIN</span>
                            <span className="s-val">{Number(stats.min).toLocaleString()} <span className="u">A</span></span>
                        </div>
                        <div className="stat-box">
                            <span className="s-label">MAX</span>
                            <span className="s-val">{Number(stats.max).toLocaleString()} <span className="u">A</span></span>
                        </div>
                        <div className="stat-box">
                            <span className="s-label">AVG</span>
                            <span className="s-val">{Number(stats.avg).toLocaleString()} <span className="u">A</span></span>
                        </div>
                        <div className="stat-box highlight">
                            <span className="s-label">NOW</span>
                            <span className="s-val">{Number(stats.current).toLocaleString()} <span className="u">A</span></span>
                        </div>
                    </div>

                    <button
                        className={`c-ai-btn ${analyzing ? 'loading' : ''}`}
                        onClick={handleAnalyze}
                        disabled={analyzing}
                    >
                        {analyzing ? 'ANALYZING...' : '✨ AI CHECK'}
                    </button>
                </div>
            </div>

            {/* AI Result */}
            {aiResult && (
                <div className="c-ai-result">
                    <div className="ai-header">
                        <span>Analysis for {aiResult.phase}</span>
                        <button onClick={() => setAiResult(null)}>✕</button>
                    </div>
                    <div className="ai-body">{aiResult.text}</div>
                </div>
            )}

            <style>{`
                .current-chart-modern {
                    background: #ffffff;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                    padding: 1.5rem;
                    color: #1e293b;
                    font-family: 'Inter', sans-serif;
                    position: relative;
                }
                html.dark .current-chart-modern {
                    background: linear-gradient(145deg, #1e293b, #0f172a);
                    border: 1px solid rgba(148, 163, 184, 0.1);
                    color: #fff;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                }
                .current-chart-modern.popup-mode {
                    box-shadow: none; border: none; height: 100%;
                }
                .c-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
                .c-title-group { display: flex; align-items: center; gap: 10px; }
                
                .c-icon { width: 36px; height: 36px; background: #e0f2fe; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: #0284c7; }
                html.dark .c-icon { background: rgba(255,255,255,0.05); color: #38bdf8; }

                .c-title { font-size: 0.9rem; font-weight: 700; letter-spacing: 0.05em; margin: 0; color: #0f172a; }
                html.dark .c-title { color: #f8fafc; }

                .c-subtitle { font-size: 0.7rem; color: #64748b; }
                html.dark .c-subtitle { color: #94a3b8; }
                
                .c-tabs { display: flex; background: #f1f5f9; padding: 4px; border-radius: 8px; gap: 4px; }
                html.dark .c-tabs { background: rgba(0,0,0,0.2); }

                .c-tab { border: none; background: transparent; color: #64748b; padding: 6px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
                .c-tab:hover { color: #1e293b; }
                html.dark .c-tab { color: #94a3b8; }
                html.dark .c-tab:hover { color: #fff; }

                .c-tab.active { background: #ffffff; color: #0f172a; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                html.dark .c-tab.active { background: #334155; color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }

                .c-tab.t-p1.active { background: ${COLORS.p1}; color: #fff; }
                .c-tab.t-p2.active { background: ${COLORS.p2}; color: #000; }
                .c-tab.t-p3.active { background: ${COLORS.p3}; color: #fff; }

                .c-close-btn { background: #f1f5f9; border: none; color: #64748b; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                html.dark .c-close-btn { background: rgba(255,255,255,0.1); color: #fff; }
                .c-close-btn:hover { background: #ef4444; color: white; }
                html.dark .c-close-btn:hover { background: rgba(239, 68, 68, 0.8); }

                .c-chart-container { min-height: 300px; position: relative; }
                .c-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); font-weight: bold; letter-spacing: 0.1em; color: #ef4444; }
                html.dark .c-overlay { background: rgba(0,0,0,0.5); }

                .c-footer { margin-top: 1rem; border-top: 1px solid #e2e8f0; padding-top: 1rem; }
                html.dark .c-footer { border-top: 1px solid rgba(255,255,255,0.05); }
                
                .c-stats-panel { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
                .c-stat-row { display: flex; gap: 1rem; }
                .stat-box { display: flex; flex-direction: column; }
                
                .s-label { font-size: 0.65rem; color: #64748b; font-weight: 700; }
                html.dark .s-label { color: #94a3b8; }

                .s-val { font-family: 'Roboto Mono', monospace; font-size: 1rem; font-weight: 600; color: #0f172a; }
                html.dark .s-val { color: #e2e8f0; }

                .s-val .u { font-size: 0.7rem; color: #64748b; }
                html.dark .s-val .u { color: #64748b; }

                .stat-box.highlight .s-val { color: #0ea5e9; }
                html.dark .stat-box.highlight .s-val { color: #fff; text-shadow: 0 0 10px rgba(56, 189, 248, 0.3); }

                .c-ai-btn { background: linear-gradient(90deg, #0ea5e9, #3b82f6); border: none; padding: 8px 16px; border-radius: 6px; color: white; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: transform 0.2s; }
                .c-ai-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); }
                .c-ai-btn.loading { opacity: 0.7; cursor: wait; }

                .c-ai-result { margin-top: 1rem; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 8px; padding: 1rem; animation: slideDown 0.3s ease; }
                html.dark .c-ai-result { background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.2); }

                .ai-header { display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 700; color: #0369a1; margin-bottom: 0.5rem; }
                html.dark .ai-header { color: #7dd3fc; }

                .ai-body { font-size: 0.85rem; color: #0c4a6e; line-height: 1.5; }
                html.dark .ai-body { color: #e0f2fe; }

                @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                
                @media (max-width: 600px) {
                    .c-stats-panel { flex-direction: column; align-items: flex-start; }
                    .c-stat-row { width: 100%; justify-content: space-between; }
                    .c-ai-btn { width: 100%; }
                }
            `}</style>
        </div>
    );
}