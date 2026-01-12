import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { Zap, BarChart3, Brain, X } from 'lucide-react';
import { analyzeVoltage, isAIConfigured } from '../services/aiService';

// --- Constants & Config ---
const MAX_DATA_POINTS = 60;
// Y-axis will be calculated dynamically based on real-time data
const Y_AXIS_PADDING = 10; // Padding above max and below min
const Y_AXIS_DEFAULT_MIN = 200;
const Y_AXIS_DEFAULT_MAX = 250;

const APEXCHARTS_CDN_URL = "https://cdn.jsdelivr.net/npm/apexcharts";

// Theme Colors
const COLORS = {
    p1: '#ef4444',
    p2: '#eab308',
    p3: '#3b82f6',
    bg: '#1e293b',
    grid: '#334155'
};

// --- Interfaces ---
interface PhaseStats {
    min: string; max: string; avg: string; current: string;
}

interface ChartDataPoint {
    x: number;
    y: number;
}

// Export Type
export type ViewMode = 'all' | 'phase1' | 'phase2' | 'phase3';

// Props
interface VoltageRealtimeChartProps {
    initialViewMode?: ViewMode;
    onClose?: () => void;
    isPopup?: boolean;
}

// --- Helpers ---
const calculateStats = (data: ChartDataPoint[]): PhaseStats => {
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

export default function VoltageRealtimeChart({ initialViewMode = 'all', onClose, isPopup = false }: VoltageRealtimeChartProps) {
    // --- State ---
    const { energyData, isConnected } = useWebSocket();
    const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);

    // Data Refs
    const historyP1 = useRef<ChartDataPoint[]>([]);
    const historyP2 = useRef<ChartDataPoint[]>([]);
    const historyP3 = useRef<ChartDataPoint[]>([]);
    const chartInstance = useRef<any>(null);
    const chartDivRef = useRef<HTMLDivElement>(null);

    // AI Analysis State
    const [analyzing, setAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState<{ phase: string, text: string, isLocal?: boolean } | null>(null);

    // Dynamic Y-Axis State
    const [yAxisMin, setYAxisMin] = useState(Y_AXIS_DEFAULT_MIN);
    const [yAxisMax, setYAxisMax] = useState(Y_AXIS_DEFAULT_MAX);

    // Update viewMode if prop changes
    useEffect(() => {
        setViewMode(initialViewMode);
    }, [initialViewMode]);

    // --- Load ApexCharts ---
    useEffect(() => {
        if ((window as any).ApexCharts) {
            setIsScriptLoaded(true);
        } else {
            const script = document.createElement('script');
            script.src = APEXCHARTS_CDN_URL;
            script.crossOrigin = 'anonymous'; // Enable CORS for better error reporting
            script.onload = () => setIsScriptLoaded(true);
            script.onerror = (err) => {
                console.error('❌ Failed to load ApexCharts from CDN:', err);
            };
            document.head.appendChild(script);
        }
    }, []);

    // --- Data Update Loop ---
    useEffect(() => {
        if (!energyData?.voltage) return;

        try {
            const now = new Date().getTime();
            const v1 = Number(energyData.voltage.f1) || 0;
            const v2 = Number(energyData.voltage.f2) || 0;
            const v3 = Number(energyData.voltage.f3) || 0;

            const updateHistory = (ref: React.MutableRefObject<ChartDataPoint[]>, val: number) => {
                if (!ref.current) ref.current = [];
                ref.current.push({ x: now, y: val });
                if (ref.current.length > MAX_DATA_POINTS) ref.current.shift();
            };

            updateHistory(historyP1, v1);
            updateHistory(historyP2, v2);
            updateHistory(historyP3, v3);

            // Calculate dynamic Y-axis based on all phase data
            const allValues = [
                ...historyP1.current.map(d => d.y),
                ...historyP2.current.map(d => d.y),
                ...historyP3.current.map(d => d.y)
            ].filter(v => v > 0);

            if (allValues.length > 0) {
                const dataMin = Math.min(...allValues);
                const dataMax = Math.max(...allValues);
                // Add small padding (2V) and round to unit level
                const newMin = Math.floor(dataMin - 2);
                const newMax = Math.ceil(dataMax + 2);
                setYAxisMin(Math.max(0, newMin)); // Never go below 0
                setYAxisMax(newMax);
            }

            if (chartInstance.current && chartInstance.current.updateSeries) {
                try {
                    const series = getSeriesForMode(viewMode);
                    chartInstance.current.updateSeries(series);
                } catch (error) {
                    // console.warn('Chart update error:', error);
                }
            }
        } catch (error) {
            console.error('❌ Error in data update loop:', error);
        }
    }, [energyData, viewMode]);

    // --- Chart Initialization ---
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

            if (!series) return;

            const chart = new ApexCharts(chartDivRef.current, {
                ...options,
                series: series
            });

            chart.render();
            chartInstance.current = chart;
        } catch (error) {
            console.error('❌ Error initializing chart:', error);
        }

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isScriptLoaded, viewMode]);

    // --- Update Y-axis when min/max changes ---
    useEffect(() => {
        if (chartInstance.current && chartInstance.current.updateOptions) {
            chartInstance.current.updateOptions({
                yaxis: {
                    min: yAxisMin,
                    max: yAxisMax,
                    labels: {
                        formatter: (val: number) => val.toFixed(1)
                    },
                    tickAmount: 5,
                    title: {
                        text: `Voltage (V) [${yAxisMin}-${yAxisMax}]`,
                        style: { color: '#94a3b8', fontSize: '11px' }
                    }
                }
            }, false, false); // Don't redraw animations
        }
    }, [yAxisMin, yAxisMax]);

    // --- Helpers ---
    const getSeriesForMode = (mode: ViewMode) => {
        const d1 = [...(historyP1.current || [])];
        const d2 = [...(historyP2.current || [])];
        const d3 = [...(historyP3.current || [])];

        switch (mode) {
            case 'phase1':
                return [{ name: 'L1 Voltage', data: d1, color: COLORS.p1 }];
            case 'phase2':
                return [{ name: 'L2 Voltage', data: d2, color: COLORS.p2 }];
            case 'phase3':
                return [{ name: 'L3 Voltage', data: d3, color: COLORS.p3 }];
            default:
                return [
                    { name: 'L1', data: d1, color: COLORS.p1 },
                    { name: 'L2', data: d2, color: COLORS.p2 },
                    { name: 'L3', data: d3, color: COLORS.p3 }
                ];
        }
    };

    const getChartOptions = (mode: ViewMode) => {
        return {
            chart: {
                type: 'line',
                height: isPopup ? 400 : 350,
                background: 'transparent',
                animations: {
                    enabled: true,
                    easing: 'linear',
                    dynamicAnimation: { speed: 1000 }
                },
                toolbar: {
                    show: true, // เปิดใช้งาน Toolbar สำหรับ Zoom/Pan
                    tools: {
                        download: false, // ซ่อนปุ่มดาวน์โหลดภาพ (ถ้าไม่จำเป็น)
                        selection: true,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true
                    },
                    autoSelected: 'zoom'
                },
                zoom: {
                    enabled: true,
                    type: 'x',
                    autoScaleYaxis: true
                }
            },
            stroke: {
                curve: 'smooth',
                width: 2 // ลดความหนาเส้นลงเล็กน้อยเพื่อให้เห็นจุด Marker ชัดขึ้น
            },
            // เพิ่มจุด Marker (Points)
            markers: {
                size: 3, // ขนาดจุด
                colors: undefined, // ใช้สีเดียวกับเส้นกราฟ
                strokeColors: '#fff',
                strokeWidth: 1,
                hover: {
                    size: 5 // ขยายขนาดเมื่อเอาเมาส์ชี้
                }
            },
            theme: { mode: 'dark' },
            xaxis: {
                type: 'datetime',
                labels: {
                    formatter: (val: string | number) => {
                        const timestamp = typeof val === 'string' ? parseInt(val) : val;
                        const date = new Date(timestamp);
                        // Add 7 hours for Bangkok timezone (UTC+7)
                        const bangkokTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);

                        const hours = String(bangkokTime.getUTCHours()).padStart(2, '0');
                        const minutes = String(bangkokTime.getUTCMinutes()).padStart(2, '0');
                        const seconds = String(bangkokTime.getUTCSeconds()).padStart(2, '0');

                        return `${hours}:${minutes}:${seconds}`;
                    }
                },
                axisBorder: { show: false },
                axisTicks: { show: false },
                tooltip: { enabled: false }
            },
            yaxis: {
                min: yAxisMin,
                max: yAxisMax,
                labels: {
                    formatter: (val: number) => val.toFixed(1) // แสดงทศนิยม 1 ตำแหน่งที่แกน Y
                },
                tickAmount: 5,
                title: {
                    text: `Voltage (V) [${yAxisMin}-${yAxisMax}]`,
                    style: { color: '#94a3b8', fontSize: '11px' }
                }
            },
            grid: {
                borderColor: 'rgba(255,255,255,0.05)',
                strokeDashArray: 3,
            },
            legend: { show: true, position: 'top' },
            // เพิ่ม Tooltip เพื่อดูค่าละเอียด
            tooltip: {
                enabled: true,
                theme: 'dark',
                x: {
                    formatter: (val: number) => {
                        const date = new Date(val);
                        // Add 7 hours for Bangkok timezone (UTC+7)
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
                y: {
                    formatter: (val: number) => val.toFixed(2) + " V" // แสดงทศนิยม 2 ตำแหน่งใน Tooltip
                }
            },
            annotations: {
                yaxis: [{
                    y: 220,
                    borderColor: '#10b981',
                    label: { text: '220V Ref', style: { color: '#fff', background: '#10b981' } }
                }]
            }
        };
    };

    const handleAnalyze = async () => {
        try {
            setAnalyzing(true);
            setAiResult(null);

            let targetPhase = "Phase L1";
            let targetVal = 0;

            // Get target phase data
            if (viewMode === 'phase1') {
                targetPhase = "Phase L1";
                targetVal = historyP1.current[historyP1.current.length - 1]?.y || 0;
            } else if (viewMode === 'phase2') {
                targetPhase = "Phase L2";
                targetVal = historyP2.current[historyP2.current.length - 1]?.y || 0;
            } else if (viewMode === 'phase3') {
                targetPhase = "Phase L3";
                targetVal = historyP3.current[historyP3.current.length - 1]?.y || 0;
            } else {
                setAiResult({ phase: 'Info', text: 'Select a specific phase (L1, L2, or L3) to analyze.' });
                return;
            }

            if (!targetVal || targetVal === 0) {
                setAiResult({ phase: 'Info', text: 'Waiting for voltage data. Please wait a moment and try again.' });
                return;
            }

            console.log(`🔍 Analyzing ${targetPhase}: ${targetVal.toFixed(2)}V`);

            const result = await analyzeVoltage(targetPhase, targetVal);
            setAiResult({ phase: targetPhase, text: result.text, isLocal: result.isLocal });
        } catch (error) {
            console.error('❌ Analysis error:', error);
            setAiResult({ phase: 'Error', text: String(error) || 'Analysis failed. Please try again.' });
        } finally {
            setAnalyzing(false);
        }
    };

    if (!isScriptLoaded) return <div className="p-4 text-white">Loading Chart...</div>;

    const stats = calculateStats(
        viewMode === 'phase2' ? (historyP2.current || []) :
            viewMode === 'phase3' ? (historyP3.current || []) :
                (historyP1.current || [])
    );

    const getPhaseTitle = () => {
        if (viewMode === 'phase1') return 'PHASE L1 ANALYSIS';
        if (viewMode === 'phase2') return 'PHASE L2 ANALYSIS';
        if (viewMode === 'phase3') return 'PHASE L3 ANALYSIS';
        return 'SYSTEM VOLTAGE (ALL PHASES)';
    };

    return (
        <div className={`voltage-chart-modern ${isPopup ? 'popup-mode' : ''}`}>
            {/* Header */}
            <div className="v-header">
                <div className="v-title-group">
                    <div className="v-icon"><Zap size={24} /></div>
                    <div>
                        <h2 className="v-title">{getPhaseTitle()}</h2>
                        <span className="v-subtitle">Real-time Waveform Monitor</span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* View Tabs */}
                    <div className="v-tabs">
                        <button onClick={() => setViewMode('all')} className={`v-tab ${viewMode === 'all' ? 'active' : ''}`}>ALL</button>
                        <button onClick={() => setViewMode('phase1')} className={`v-tab t-p1 ${viewMode === 'phase1' ? 'active' : ''}`}>L1</button>
                        <button onClick={() => setViewMode('phase2')} className={`v-tab t-p2 ${viewMode === 'phase2' ? 'active' : ''}`}>L2</button>
                        <button onClick={() => setViewMode('phase3')} className={`v-tab t-p3 ${viewMode === 'phase3' ? 'active' : ''}`}>L3</button>
                    </div>

                    {onClose && (
                        <button onClick={onClose} className="v-close-btn" aria-label="Close">
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            {/* Main Chart Area */}
            <div className="v-chart-container">
                <div ref={chartDivRef} id="voltage-chart" />
                {!isConnected && <div className="v-overlay">OFFLINE</div>}
            </div>

            {/* Footer Stats / AI Panel */}
            <div className="v-footer">
                {viewMode === 'all' ? (
                    <div className="v-legend-hint">
                        Current View: All Phases. Select L1, L2, or L3 tab above for detailed AI analysis.
                    </div>
                ) : (
                    <div className="v-stats-panel">
                        <div className="v-stat-row">
                            <div className="stat-box">
                                <span className="s-label">MIN</span>
                                <span className="s-val">{stats?.min}V</span>
                            </div>
                            <div className="stat-box">
                                <span className="s-label">MAX</span>
                                <span className="s-val">{stats?.max}V</span>
                            </div>
                            <div className="stat-box">
                                <span className="s-label">AVG</span>
                                <span className="s-val">{stats?.avg}V</span>
                            </div>
                            <div className="stat-box highlight">
                                <span className="s-label">NOW</span>
                                <span className="s-val">{stats?.current}V</span>
                            </div>
                        </div>

                        <button
                            className={`v-ai-btn ${analyzing ? 'loading' : ''}`}
                            onClick={handleAnalyze}
                            disabled={analyzing}
                        >
                            {analyzing ? (
                                <>
                                    <span>ANALYZING...</span>
                                </>
                            ) : (
                                <>
                                    <Brain size={16} />
                                    <span>AI DIAGNOSIS</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {aiResult && (
                <div className={`v-ai-result ${aiResult.isLocal ? 'local-mode' : 'ai-mode'}`}>
                    <div className="ai-header">
                        <span>
                            {aiResult.isLocal ? (
                                <BarChart3 size={16} style={{ display: 'inline', marginRight: '6px' }} />
                            ) : (
                                <Brain size={16} style={{ display: 'inline', marginRight: '6px' }} />
                            )}
                            {aiResult.phase}
                        </span>
                        <button onClick={() => setAiResult(null)}><X size={16} /></button>
                    </div>
                    <div className="ai-body">{aiResult.text}</div>
                    {aiResult.isLocal && <div className="ai-footer">💡 Local Analysis (Configure OpenAI API key for AI analysis)</div>}
                </div>
            )}

            <style>{`
                .voltage-chart-modern {
                    background: linear-gradient(145deg, #1e293b, #0f172a);
                    border-radius: 16px;
                    border: 1px solid rgba(255,255,255,0.05);
                    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                    padding: 1.5rem;
                    color: #fff;
                    font-family: 'Inter', sans-serif;
                    position: relative;
                }
                .voltage-chart-modern.popup-mode {
                    box-shadow: none;
                    border: none;
                    height: 100%;
                }
                .v-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
                .v-title-group { display: flex; align-items: center; gap: 10px; }
                .v-icon { width: 36px; height: 36px; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
                .v-title { font-size: 0.9rem; font-weight: 700; letter-spacing: 0.05em; margin: 0; color: #f8fafc; }
                .v-subtitle { font-size: 0.7rem; color: #94a3b8; }
                
                .v-tabs { display: flex; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 8px; gap: 4px; }
                .v-tab { border: none; background: transparent; color: #64748b; padding: 6px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
                .v-tab:hover { color: #cbd5e1; }
                .v-tab.active { background: #334155; color: #fff; shadow: 0 2px 4px rgba(0,0,0,0.2); }
                .v-tab.t-p1.active { background: ${COLORS.p1}; }
                .v-tab.t-p2.active { background: ${COLORS.p2}; color: #000; }
                .v-tab.t-p3.active { background: ${COLORS.p3}; }

                .v-close-btn {
                    background: rgba(255,255,255,0.1); border: none; color: #fff; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;
                }
                .v-close-btn:hover { background: rgba(239, 68, 68, 0.8); }

                .v-chart-container { min-height: 300px; position: relative; }
                .v-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); font-weight: bold; letter-spacing: 0.1em; color: #ef4444; }

                .v-footer { margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1rem; }
                .v-legend-hint { text-align: center; color: #64748b; font-size: 0.8rem; font-style: italic; }
                
                .v-stats-panel { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
                .v-stat-row { display: flex; gap: 1rem; }
                .stat-box { display: flex; flex-direction: column; }
                .s-label { font-size: 0.65rem; color: #94a3b8; font-weight: 700; }
                .s-val { font-family: 'Roboto Mono', monospace; font-size: 1rem; font-weight: 600; }
                .stat-box.highlight .s-val { color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.3); }

                .v-ai-btn { background: linear-gradient(90deg, #6366f1, #8b5cf6); border: none; padding: 8px 16px; border-radius: 6px; color: white; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: transform 0.2s; display: flex; align-items: center; gap: 8px; }
                .v-ai-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4); }
                .v-ai-btn.loading { opacity: 0.7; cursor: wait; }

                .v-ai-result { margin-top: 1rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 8px; padding: 1rem; animation: slideDown 0.3s ease; }
                .v-ai-result.local-mode { background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.2); }
                .ai-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; font-weight: 700; color: #a5b4fc; margin-bottom: 0.5rem; }
                .ai-header span { display: flex; align-items: center; gap: 6px; }
                .ai-header button { background: none; border: none; color: inherit; cursor: pointer; display: flex; align-items: center; padding: 0; }
                .v-ai-result.local-mode .ai-header { color: #93c5fd; }
                .ai-body { font-size: 0.85rem; color: #e0e7ff; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; }
                .v-ai-result.local-mode .ai-body { color: #dbeafe; }
                .ai-footer { font-size: 0.75rem; color: #a5b4fc; margin-top: 0.5rem; font-style: italic; border-top: 1px solid rgba(99, 102, 241, 0.2); padding-top: 0.5rem; }
                .v-ai-result.local-mode .ai-footer { color: #93c5fd; border-top-color: rgba(59, 130, 246, 0.2); }
                
                @media (max-width: 600px) {
                    .v-stats-panel { flex-direction: column; align-items: flex-start; }
                    .v-stat-row { width: 100%; justify-content: space-between; }
                    .v-ai-btn { width: 100%; }
                }
            `}</style>
        </div>
    );
}