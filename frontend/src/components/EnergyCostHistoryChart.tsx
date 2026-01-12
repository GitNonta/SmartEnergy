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
                                    : `${entry.value.toFixed(2)} kWh`
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
            case 'daily': return 'ค่าไฟฟ้ารายชั่วโมง (วันนี้)';
            case 'monthly': return 'ค่าไฟฟ้ารายวัน (เดือนนี้)';
            case 'yearly': return 'ค่าไฟฟ้ารายเดือน (ปีนี้)';
        }
    };

    return (
        <div className={`cost-history-chart ${isPopup ? 'popup-mode' : ''}`}>
            {/* Header */}
            <div className="chart-header">
                <div className="header-left">
                    <div className="header-icon">
                        <TrendingUp size={20} />
                    </div>
                    <div className="header-text">
                        <h3 className="chart-title">{getTitle()}</h3>
                        <div className="chart-summary">
                            <span className="summary-item">
                                <Zap size={14} />
                                <span>{totalEnergy.toLocaleString('th-TH', { minimumFractionDigits: 2 })} kWh</span>
                            </span>
                            <span className="summary-divider">•</span>
                            <span className="summary-item cost">
                                <DollarSign size={14} />
                                <span>฿{totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                            </span>
                        </div>
                    </div>
                </div>

                <div className="header-right">
                    <div className="mode-tabs">
                        <button
                            className={`tab ${viewMode === 'daily' ? 'active' : ''}`}
                            onClick={() => setViewMode('daily')}
                        >
                            รายชม.
                        </button>
                        <button
                            className={`tab ${viewMode === 'monthly' ? 'active' : ''}`}
                            onClick={() => setViewMode('monthly')}
                        >
                            รายวัน
                        </button>
                        <button
                            className={`tab ${viewMode === 'yearly' ? 'active' : ''}`}
                            onClick={() => setViewMode('yearly')}
                        >
                            รายเดือน
                        </button>
                    </div>
                    {onClose && (
                        <button className="close-btn" onClick={onClose}>
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Chart */}
            <div className="chart-container">
                {loading ? (
                    <div className="chart-loading">
                        <div className="loading-spinner"></div>
                        <span>กำลังโหลดข้อมูล...</span>
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
                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.9} />
                                    <stop offset="95%" stopColor="#d97706" stopOpacity={0.7} />
                                </linearGradient>
                                {/* Gradient for Energy bars */}
                                <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.9} />
                                    <stop offset="95%" stopColor="#0891b2" stopOpacity={0.7} />
                                </linearGradient>
                            </defs>

                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="rgba(255,255,255,0.1)"
                                vertical={false}
                            />

                            <XAxis
                                dataKey="x"
                                tick={{ fill: '#94a3b8', fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                interval={viewMode === 'daily' ? 2 : viewMode === 'monthly' ? 4 : 0}
                            />

                            {/* Left Y-axis for Cost (THB) */}
                            <YAxis
                                yAxisId="left"
                                tick={{ fill: '#fbbf24', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                label={{
                                    value: 'บาท',
                                    angle: -90,
                                    position: 'insideLeft',
                                    fill: '#fbbf24',
                                    fontSize: 12
                                }}
                                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                            />

                            {/* Right Y-axis for Energy (kWh) */}
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                tick={{ fill: '#22d3ee', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                label={{
                                    value: 'kWh',
                                    angle: 90,
                                    position: 'insideRight',
                                    fill: '#22d3ee',
                                    fontSize: 12
                                }}
                            />

                            <Tooltip content={<CustomTooltip />} />

                            <Legend
                                wrapperStyle={{ paddingTop: '10px' }}
                                formatter={(value) => (
                                    <span style={{ color: value === 'ค่าไฟฟ้า (บาท)' ? '#fbbf24' : '#22d3ee' }}>
                                        {value}
                                    </span>
                                )}
                            />

                            {/* Cost bars */}
                            <Bar
                                yAxisId="left"
                                dataKey="cost"
                                name="ค่าไฟฟ้า (บาท)"
                                fill="url(#costGradient)"
                                radius={[4, 4, 0, 0]}
                                barSize={viewMode === 'yearly' ? 24 : viewMode === 'monthly' ? 12 : 14}
                            />

                            {/* Energy line */}
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="energy"
                                name="พลังงาน (kWh)"
                                stroke="#22d3ee"
                                strokeWidth={2}
                                dot={{ fill: '#22d3ee', strokeWidth: 0, r: 3 }}
                                activeDot={{ r: 5, fill: '#22d3ee' }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Footer Legend */}
            <div className="chart-footer">
                <div className="legend-item">
                    <span className="legend-bar cost"></span>
                    <span>ค่าไฟฟ้า (บาท)</span>
                </div>
                <div className="legend-item">
                    <span className="legend-line energy"></span>
                    <span>พลังงาน (kWh)</span>
                </div>
            </div>
        </div>
    );
}
