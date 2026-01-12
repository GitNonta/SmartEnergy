import React, { useState, useEffect, useRef, useCallback } from 'react';
import './UsageSummaryBlock.css';
import { getApiBase } from '../config/api';
import { useLanguage } from '../context/LanguageContext';
import { TrendingUp, TrendingDown, Zap, DollarSign, BarChart3, RefreshCw, Calendar, Clock, Activity } from 'lucide-react';

interface SummaryData {
    energy: number;
    cost: number;
    unit: string;
    currency: string;
}

interface ComparisonData {
    current: number;
    previous: number;
    change: number;
    trend: 'up' | 'down';
}

interface PeakData {
    value: number;
    time: string | null;
    unit: string;
}

interface DashboardData {
    success: boolean;
    daily: SummaryData;
    weekly: SummaryData;
    monthly: SummaryData;
    yearly: SummaryData;
    costPerUnit: number;
    timestamp: string;
}

interface ComparisonResponse {
    success: boolean;
    daily: ComparisonData;
    weekly: ComparisonData;
    monthly: ComparisonData;
    timestamp: string;
}

interface PeakResponse {
    success: boolean;
    peak: PeakData;
    average: { value: number; unit: string };
    timestamp: string;
}

// CSS-based Mini Bar Chart (no external library needed)
const MiniBarChart: React.FC<{
    current: number;
    previous: number;
    color: string;
    currentLabel: string;
    previousLabel: string;
}> = ({ current, previous, color, currentLabel, previousLabel }) => {
    const maxVal = Math.max(current, previous) || 1;
    const currentPct = (current / maxVal) * 100;
    const previousPct = (previous / maxVal) * 100;

    return (
        <div className="mini-bar-chart">
            <div className="bar-row">
                <span className="bar-label">{previousLabel}</span>
                <div className="bar-track">
                    <div
                        className="bar-fill previous"
                        style={{ width: `${previousPct}%` }}
                    />
                </div>
                <span className="bar-value">{previous.toFixed(1)}</span>
            </div>
            <div className="bar-row">
                <span className="bar-label">{currentLabel}</span>
                <div className="bar-track">
                    <div
                        className="bar-fill current"
                        style={{ width: `${currentPct}%`, backgroundColor: color }}
                    />
                </div>
                <span className="bar-value">{current.toFixed(1)}</span>
            </div>
        </div>
    );
};

// CSS-based Sparkline visualization
const CssSparkline: React.FC<{ color: string }> = ({ color }) => {
    // Generate random-ish heights for visual effect
    const bars = Array.from({ length: 12 }, (_, i) => 20 + Math.random() * 60);

    return (
        <div className="css-sparkline">
            {bars.map((height, i) => (
                <div
                    key={i}
                    className="spark-bar"
                    style={{
                        height: `${height}%`,
                        backgroundColor: i === bars.length - 1 ? color : `${color}60`
                    }}
                />
            ))}
        </div>
    );
};

// Progress bar showing percentage  
const EnergyProgressBar: React.FC<{ current: number; max: number; color: string }> = ({ current, max, color }) => {
    const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;

    return (
        <div className="energy-progress-bar">
            <div
                className="energy-progress-fill"
                style={{
                    width: `${percentage}%`,
                    background: `linear-gradient(90deg, ${color}80, ${color})`
                }}
            />
        </div>
    );
};

const UsageSummaryBlock: React.FC = () => {
    const { t } = useLanguage();
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [comparisonData, setComparisonData] = useState<ComparisonResponse | null>(null);
    const [peakData, setPeakData] = useState<PeakResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const fetchingRef = useRef(false);

    const fetchData = useCallback(async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        try {
            const [dashboardRes, comparisonRes, peakRes] = await Promise.all([
                fetch(`${getApiBase()}/api/summary/dashboard`, { cache: 'no-store' }),
                fetch(`${getApiBase()}/api/summary/comparison`, { cache: 'no-store' }),
                fetch(`${getApiBase()}/api/summary/peak`, { cache: 'no-store' })
            ]);

            if (dashboardRes.ok) {
                const data = await dashboardRes.json();
                if (data.success) setDashboardData(data);
            }

            if (comparisonRes.ok) {
                const data = await comparisonRes.json();
                if (data.success) setComparisonData(data);
            }

            if (peakRes.ok) {
                const data = await peakRes.json();
                if (data.success) setPeakData(data);
            }

            setLastUpdate(new Date());
            setError(null);
        } catch (err: any) {
            console.error('❌ Error fetching usage summary:', err);
            setError(err.message || 'Failed to fetch data');
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const formatNumber = (num: number, decimals: number = 2): string => {
        if (num >= 1000) {
            return num.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }
        return num.toFixed(decimals);
    };

    const formatCurrency = (num: number): string => {
        return `฿${formatNumber(num, 2)}`;
    };

    const formatPeakTime = (timeStr: string | null): string => {
        if (!timeStr) return '--:--';
        try {
            const date = new Date(timeStr);
            return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '--:--';
        }
    };

    const renderTrend = (comparison: ComparisonData | undefined) => {
        if (!comparison) return null;

        const isUp = comparison.trend === 'up';
        const color = isUp ? 'trend-up' : 'trend-down';
        const Icon = isUp ? TrendingUp : TrendingDown;

        return (
            <div className={`trend-indicator ${color}`}>
                <Icon className="w-3 h-3" />
                <span>{Math.abs(comparison.change).toFixed(1)}%</span>
            </div>
        );
    };

    // Color mappings
    const colors = {
        daily: '#06b6d4',
        weekly: '#22c55e',
        monthly: '#3b82f6',
        yearly: '#a855f7'
    };

    if (loading && !dashboardData) {
        return (
            <div className="usage-summary-block modern-card">
                <div className="card-header-label">
                    <BarChart3 className="w-5 h-5" />
                    {t('summary.title')}
                </div>
                <div className="loading-state">
                    <RefreshCw className="w-6 h-6 spinning" />
                    <span>{t('common.loading')}</span>
                </div>
            </div>
        );
    }

    if (error && !dashboardData) {
        return (
            <div className="usage-summary-block modern-card">
                <div className="card-header-label">
                    <BarChart3 className="w-5 h-5" />
                    {t('summary.title')}
                </div>
                <div className="error-state">
                    <span>⚠️ {error}</span>
                    <button onClick={fetchData}>{t('summary.retry')}</button>
                </div>
            </div>
        );
    }

    const monthlyTarget = 500;
    const yearlyTarget = 6000;

    return (
        <div className="usage-summary-block modern-card">
            <div className="card-header-label">
                <BarChart3 className="w-5 h-5" />
                {t('summary.title')}
                <div className="header-actions">
                    <span className="cost-rate">฿{dashboardData?.costPerUnit || 4.00}/kWh</span>
                    <button
                        className="refresh-btn"
                        onClick={fetchData}
                        title={t('summary.refreshData')}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'spinning' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Main Summary Grid */}
            <div className="summary-grid">
                {/* Daily Card */}
                <div className="summary-card accent-cyan">
                    <div className="summary-header">
                        <div className="label-with-icon">
                            <Clock className="w-3 h-3" />
                            <span className="label">{t('summary.today')}</span>
                        </div>
                        {renderTrend(comparisonData?.daily)}
                    </div>
                    <div className="summary-value">
                        <span className="energy">{formatNumber(dashboardData?.daily?.energy || 0)}</span>
                        <span className="unit">kWh</span>
                    </div>
                    <CssSparkline color={colors.daily} />
                    <div className="summary-cost">
                        <DollarSign className="w-3 h-3" />
                        {formatCurrency(dashboardData?.daily?.cost || 0)}
                    </div>
                    {comparisonData?.daily && (
                        <MiniBarChart
                            current={comparisonData.daily.current}
                            previous={comparisonData.daily.previous}
                            currentLabel={t('summary.today')}
                            previousLabel={t('summary.yesterday')}
                            color={colors.daily}
                        />
                    )}
                </div>

                {/* Weekly Card */}
                <div className="summary-card accent-green">
                    <div className="summary-header">
                        <div className="label-with-icon">
                            <Calendar className="w-3 h-3" />
                            <span className="label">{t('summary.thisWeek')}</span>
                        </div>
                        {renderTrend(comparisonData?.weekly)}
                    </div>
                    <div className="summary-value">
                        <span className="energy">{formatNumber(dashboardData?.weekly?.energy || 0)}</span>
                        <span className="unit">kWh</span>
                    </div>
                    <EnergyProgressBar
                        current={dashboardData?.weekly?.energy || 0}
                        max={(dashboardData?.daily?.energy || 1) * 7}
                        color={colors.weekly}
                    />
                    <div className="summary-cost">
                        <DollarSign className="w-3 h-3" />
                        {formatCurrency(dashboardData?.weekly?.cost || 0)}
                    </div>
                    {comparisonData?.weekly && (
                        <MiniBarChart
                            current={comparisonData.weekly.current}
                            previous={comparisonData.weekly.previous}
                            currentLabel={t('summary.thisWeek')}
                            previousLabel={t('summary.lastWeek')}
                            color={colors.weekly}
                        />
                    )}
                </div>

                {/* Monthly Card */}
                <div className="summary-card accent-blue">
                    <div className="summary-header">
                        <div className="label-with-icon">
                            <Calendar className="w-3 h-3" />
                            <span className="label">{t('summary.thisMonth')}</span>
                        </div>
                        {renderTrend(comparisonData?.monthly)}
                    </div>
                    <div className="summary-value">
                        <span className="energy">{formatNumber(dashboardData?.monthly?.energy || 0)}</span>
                        <span className="unit">kWh</span>
                    </div>
                    <div className="target-progress">
                        <EnergyProgressBar
                            current={dashboardData?.monthly?.energy || 0}
                            max={monthlyTarget}
                            color={colors.monthly}
                        />
                        <span className="target-label">{((dashboardData?.monthly?.energy || 0) / monthlyTarget * 100).toFixed(0)}% of {monthlyTarget} kWh</span>
                    </div>
                    <div className="summary-cost">
                        <DollarSign className="w-3 h-3" />
                        {formatCurrency(dashboardData?.monthly?.cost || 0)}
                    </div>
                    {comparisonData?.monthly && (
                        <MiniBarChart
                            current={comparisonData.monthly.current}
                            previous={comparisonData.monthly.previous}
                            currentLabel={t('summary.thisMonth')}
                            previousLabel={t('summary.lastMonth')}
                            color={colors.monthly}
                        />
                    )}
                </div>

                {/* Yearly Card */}
                <div className="summary-card accent-purple">
                    <div className="summary-header">
                        <div className="label-with-icon">
                            <Activity className="w-3 h-3" />
                            <span className="label">{t('summary.thisYear')}</span>
                        </div>
                    </div>
                    <div className="summary-value">
                        <span className="energy">{formatNumber(dashboardData?.yearly?.energy || 0)}</span>
                        <span className="unit">kWh</span>
                    </div>
                    <div className="target-progress">
                        <EnergyProgressBar
                            current={dashboardData?.yearly?.energy || 0}
                            max={yearlyTarget}
                            color={colors.yearly}
                        />
                        <span className="target-label">{((dashboardData?.yearly?.energy || 0) / yearlyTarget * 100).toFixed(0)}% of {yearlyTarget} kWh</span>
                    </div>
                    <div className="summary-cost large">
                        <DollarSign className="w-4 h-4" />
                        {formatCurrency(dashboardData?.yearly?.cost || 0)}
                    </div>
                </div>
            </div>

            {/* Peak Demand Section */}
            {peakData && (
                <div className="peak-demand-section">
                    <div className="peak-gauge">
                        <div className="gauge-header">
                            <Zap className="w-4 h-4" />
                            <span>{t('summary.peakDemand')}</span>
                        </div>
                        <div className="gauge-value">
                            <span className="value">{formatNumber(peakData.peak?.value || 0, 1)}</span>
                            <span className="unit">kW</span>
                        </div>
                        <div className="gauge-bar">
                            <div
                                className="gauge-fill"
                                style={{
                                    width: `${Math.min((peakData.peak?.value || 0) / 10 * 100, 100)}%`
                                }}
                            />
                        </div>
                        <div className="gauge-time">@ {formatPeakTime(peakData.peak?.time)}</div>
                    </div>

                    <div className="avg-power">
                        <div className="avg-header">{t('summary.averagePower')}</div>
                        <div className="avg-value">
                            <span className="value">{formatNumber(peakData.average?.value || 0, 2)}</span>
                            <span className="unit">kW</span>
                        </div>
                        <div className="avg-comparison">
                            {peakData.peak?.value && peakData.average?.value && (
                                <span>Peak is {((peakData.peak.value / peakData.average.value - 1) * 100).toFixed(0)}% above average</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {lastUpdate && (
                <div className="last-update">
                    <RefreshCw className="w-3 h-3" />
                    {t('summary.updated')}: {lastUpdate.toLocaleTimeString()}
                </div>
            )}
        </div>
    );
};

export default UsageSummaryBlock;
