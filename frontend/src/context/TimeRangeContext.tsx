import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Types
export type TimeRangeMode = 'realtime' | 'hour' | 'day' | 'week' | 'month' | 'custom';

export interface DateRange {
    start: Date;
    end: Date;
}

export interface TimeRangeContextType {
    // Current mode
    mode: TimeRangeMode;
    setMode: (mode: TimeRangeMode) => void;

    // Custom date range (when mode === 'custom')
    customRange: DateRange | null;
    setCustomRange: (range: DateRange | null) => void;

    // Computed values
    getQueryRange: () => { start: string; end: string; range: string };
    getDisplayLabel: () => string;

    // Calendar modal state
    isCalendarOpen: boolean;
    openCalendar: () => void;
    closeCalendar: () => void;
}

const TimeRangeContext = createContext<TimeRangeContextType | undefined>(undefined);

// Helper function to format date for API
const formatDateForApi = (date: Date): string => {
    return date.toISOString();
};

// Helper to get relative range string
const getModeRangeString = (mode: TimeRangeMode): string => {
    switch (mode) {
        case 'hour': return '-1h';
        case 'day': return '-24h';
        case 'week': return '-7d';
        case 'month': return '-30d';
        default: return '-1h';
    }
};

interface TimeRangeProviderProps {
    children: ReactNode;
    defaultMode?: TimeRangeMode;
}

export const TimeRangeProvider: React.FC<TimeRangeProviderProps> = ({
    children,
    defaultMode = 'realtime'
}) => {
    const [mode, setModeState] = useState<TimeRangeMode>(defaultMode);
    const [customRange, setCustomRange] = useState<DateRange | null>(null);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    const setMode = useCallback((newMode: TimeRangeMode) => {
        setModeState(newMode);
        if (newMode !== 'custom') {
            setCustomRange(null);
        }
    }, []);

    const openCalendar = useCallback(() => setIsCalendarOpen(true), []);
    const closeCalendar = useCallback(() => setIsCalendarOpen(false), []);

    const getQueryRange = useCallback(() => {
        if (mode === 'custom' && customRange) {
            return {
                start: formatDateForApi(customRange.start),
                end: formatDateForApi(customRange.end),
                range: 'custom'
            };
        }

        const now = new Date();
        let start: Date;

        switch (mode) {
            case 'hour':
                start = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case 'day':
                start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case 'week':
                start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                start = now;
        }

        return {
            start: formatDateForApi(start),
            end: formatDateForApi(now),
            range: getModeRangeString(mode)
        };
    }, [mode, customRange]);

    const getDisplayLabel = useCallback(() => {
        if (mode === 'custom' && customRange) {
            const startStr = customRange.start.toLocaleDateString('th-TH', {
                day: 'numeric', month: 'short'
            });
            const endStr = customRange.end.toLocaleDateString('th-TH', {
                day: 'numeric', month: 'short', year: '2-digit'
            });
            return `${startStr} - ${endStr}`;
        }

        switch (mode) {
            case 'realtime': return 'Real-time';
            case 'hour': return 'Last 1 Hour';
            case 'day': return 'Last 24 Hours';
            case 'week': return 'Last 7 Days';
            case 'month': return 'Last 30 Days';
            default: return '';
        }
    }, [mode, customRange]);

    const value: TimeRangeContextType = {
        mode,
        setMode,
        customRange,
        setCustomRange,
        getQueryRange,
        getDisplayLabel,
        isCalendarOpen,
        openCalendar,
        closeCalendar
    };

    return (
        <TimeRangeContext.Provider value={value}>
            {children}
        </TimeRangeContext.Provider>
    );
};

export const useTimeRange = (): TimeRangeContextType => {
    const context = useContext(TimeRangeContext);
    if (!context) {
        throw new Error('useTimeRange must be used within a TimeRangeProvider');
    }
    return context;
};

export default TimeRangeContext;
