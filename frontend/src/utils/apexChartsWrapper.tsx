/**
 * ApexCharts Wrapper
 * 
 * A wrapper for ApexCharts that handles CDN loading and lifecycle management.
 * This solves the issue of loading ApexCharts via script injection in multiple components.
 * 
 * Features:
 * - Single CDN load for entire app
 * - React lifecycle management
 * - Loading state
 * - Error handling
 * 
 * Usage:
 *   import { ApexChartWrapper, useApexCharts } from '../utils/apexChartsWrapper';
 *   
 *   const MyChart = () => {
 *     const { isReady } = useApexCharts();
 *     if (!isReady) return <div>Loading...</div>;
 *     return <ApexChartWrapper options={...} series={...} type="bar" height={300} />;
 *   };
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';

const APEXCHARTS_CDN = 'https://cdn.jsdelivr.net/npm/apexcharts@3.49.0/dist/apexcharts.min.js';

// ====================================
// TYPE DEFINITIONS (for CDN usage)
// ====================================
export interface ChartOptions {
    chart?: {
        type?: string;
        height?: number | string;
        width?: number | string;
        toolbar?: { show?: boolean };
        background?: string;
        foreColor?: string;
        animations?: { enabled?: boolean };
        zoom?: { enabled?: boolean };
        [key: string]: unknown;
    };
    colors?: string[];
    dataLabels?: { enabled?: boolean;[key: string]: unknown };
    stroke?: { curve?: string; width?: number;[key: string]: unknown };
    fill?: { type?: string; opacity?: number;[key: string]: unknown };
    grid?: { show?: boolean; borderColor?: string;[key: string]: unknown };
    xaxis?: { categories?: string[]; labels?: object;[key: string]: unknown };
    yaxis?: { labels?: object;[key: string]: unknown } | object[];
    tooltip?: { enabled?: boolean; theme?: string;[key: string]: unknown };
    legend?: { show?: boolean; position?: string;[key: string]: unknown };
    plotOptions?: { bar?: object;[key: string]: unknown };
    theme?: { mode?: 'light' | 'dark' };
    title?: { text?: string;[key: string]: unknown };
    subtitle?: { text?: string;[key: string]: unknown };
    [key: string]: unknown;
}

export interface ChartSeries {
    name?: string;
    data: (number | { x: string | number; y: number; fillColor?: string })[];
    color?: string;
}

export type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'donut' | 'radialBar' | 'scatter' | 'bubble' | 'heatmap' | 'treemap' | 'boxPlot' | 'candlestick' | 'radar' | 'polarArea' | 'rangeBar';

// Global state for ApexCharts loading
let apexChartsLoadPromise: Promise<void> | null = null;
let isApexChartsLoaded = false;

/**
 * Load ApexCharts from CDN (singleton pattern)
 */
function loadApexCharts(): Promise<void> {
    if (isApexChartsLoaded && (window as WindowWithApex).ApexCharts) {
        return Promise.resolve();
    }

    if (apexChartsLoadPromise) {
        return apexChartsLoadPromise;
    }

    apexChartsLoadPromise = new Promise((resolve, reject) => {
        // Check if already loaded
        if ((window as WindowWithApex).ApexCharts) {
            isApexChartsLoaded = true;
            resolve();
            return;
        }

        // Check if script is already in DOM
        const existingScript = document.querySelector(`script[src="${APEXCHARTS_CDN}"]`);
        if (existingScript) {
            existingScript.addEventListener('load', () => {
                isApexChartsLoaded = true;
                resolve();
            });
            return;
        }

        // Create and load script
        const script = document.createElement('script');
        script.src = APEXCHARTS_CDN;
        script.async = true;

        script.onload = () => {
            isApexChartsLoaded = true;
            console.log('✅ ApexCharts loaded from CDN');
            resolve();
        };

        script.onerror = () => {
            reject(new Error('Failed to load ApexCharts from CDN'));
        };

        document.head.appendChild(script);
    });

    return apexChartsLoadPromise;
}

/**
 * Hook to get ApexCharts ready state
 */
export function useApexCharts() {
    const [isReady, setIsReady] = useState(isApexChartsLoaded);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isApexChartsLoaded) {
            setIsReady(true);
            return;
        }

        loadApexCharts()
            .then(() => setIsReady(true))
            .catch((err) => setError(err.message));
    }, []);

    return { isReady, error };
}

/**
 * ApexCharts Wrapper Component
 */
interface ApexChartWrapperProps {
    options: ChartOptions;
    series: ChartSeries[] | number[];
    type: ChartType;
    height?: number | string;
    width?: number | string;
    className?: string;
}

// Type for window with ApexCharts
interface WindowWithApex extends Window {
    ApexCharts: new (el: HTMLElement, options: object) => ApexChartsInstance;
}

interface ApexChartsInstance {
    render: () => void;
    destroy: () => void;
    updateOptions: (options: object, redraw?: boolean, animate?: boolean) => void;
    updateSeries: (series: unknown[], animate?: boolean) => void;
}

export const ApexChartWrapper: React.FC<ApexChartWrapperProps> = ({
    options,
    series,
    type,
    height = 350,
    width = '100%',
    className = ''
}) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<ApexChartsInstance | null>(null);
    const { isReady, error } = useApexCharts();

    const renderChart = useCallback(() => {
        if (!isReady || !chartRef.current) return;

        const ApexCharts = (window as WindowWithApex).ApexCharts;
        if (!ApexCharts) return;

        // Destroy existing chart
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        // Create new chart
        const chartOptions = {
            ...options,
            chart: {
                ...options.chart,
                type,
                height,
                width
            },
            series
        };

        chartInstance.current = new ApexCharts(chartRef.current, chartOptions);
        chartInstance.current.render();
    }, [isReady, options, series, type, height, width]);

    // Render on mount and when dependencies change
    useEffect(() => {
        renderChart();

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [renderChart]);

    // Update chart when series/options change
    useEffect(() => {
        if (chartInstance.current) {
            chartInstance.current.updateOptions(options, false, true);
            chartInstance.current.updateSeries(series as unknown[], true);
        }
    }, [options, series]);

    if (error) {
        return (
            <div className={`apex-chart-error ${className}`} style={{
                padding: '20px',
                textAlign: 'center',
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px'
            }}>
                ❌ Failed to load chart: {error}
            </div>
        );
    }

    if (!isReady) {
        return (
            <div className={`apex-chart-loading ${className}`} style={{
                height,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8'
            }}>
                Loading chart...
            </div>
        );
    }

    return <div ref={chartRef} className={`apex-chart ${className}`} />;
};

export default ApexChartWrapper;
