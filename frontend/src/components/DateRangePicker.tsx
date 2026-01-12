import React, { useState, useEffect, useRef } from 'react';
import { useTimeRange } from '../context/TimeRangeContext';
import { useTheme } from './AppShell';
import { useLanguage } from '../context/LanguageContext';
import './DateRangePicker.css';

const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

interface DateRangePickerProps {
    className?: string;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({ className = '' }) => {
    const { isCalendarOpen, closeCalendar, setCustomRange, setMode } = useTimeRange();
    const { currentTheme } = useTheme();
    const { language, t } = useLanguage();
    const containerRef = useRef<HTMLDivElement>(null);

    // Calendar state
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [selecting, setSelecting] = useState<'start' | 'end'>('start');

    // Constants based on language
    const months = language === 'th' ? THAI_MONTHS : [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const daysWeek = language === 'th' ? THAI_DAYS : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    useEffect(() => {
        if (isCalendarOpen) {
            setStartDate(null);
            setEndDate(null);
            setSelecting('start');
            setCurrentMonth(new Date());
        }
    }, [isCalendarOpen]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                closeCalendar();
            }
        };

        if (isCalendarOpen) {
            const timer = setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
            }, 100);
            return () => {
                clearTimeout(timer);
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [isCalendarOpen, closeCalendar]);

    const changeMonth = (delta: number) => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1));
    };

    const handleDateClick = (date: Date) => {
        if (selecting === 'start') {
            setStartDate(date);
            setEndDate(null);
            setSelecting('end');
        } else {
            if (startDate && date < startDate) {
                setStartDate(date);
                setEndDate(startDate);
            } else {
                setEndDate(date);
            }
            setSelecting('start');
        }
    };

    const handleApply = () => {
        if (startDate && endDate) {
            setCustomRange({ start: startDate, end: endDate });
            setMode('custom');
            closeCalendar();
        }
    };

    const getDaysInMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    };

    const isInRange = (date: Date) => {
        if (!startDate || !endDate) return false;
        return date >= startDate && date <= endDate;
    };

    const isStartDate = (date: Date) => {
        return startDate && date.toDateString() === startDate.toDateString();
    };

    const isEndDate = (date: Date) => {
        return endDate && date.toDateString() === endDate.toDateString();
    };

    const renderMonth = (monthDate: Date, index: number) => {
        const daysInMonth = getDaysInMonth(monthDate);
        const firstDay = getFirstDayOfMonth(monthDate);
        const days = [];

        // Empty cells for days before first day
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${index}-${i}`} className="flex justify-center items-center w-[40px] h-[40px]" />);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
            const isStart = isStartDate(date);
            const isEnd = isEndDate(date);
            const inRange = isInRange(date);

            // Logic for styling
            let buttonClass = "flex justify-center items-center w-[40px] h-[40px] cursor-pointer rounded-full hover:border-2 hover:border-blue-500 border-transparent border-2 transition-all duration-200";
            let textClass = "";
            let containerClass = "flex flex-col justify-center items-center relative";

            if (isStart || isEnd) {
                // Selected start or end
                buttonClass = "flex justify-center items-center w-[40px] h-[40px] cursor-pointer bg-blue-600 text-white font-bold rounded-full shadow-md transform scale-105";
            } else if (inRange) {
                // In range
                buttonClass = `flex justify-center items-center w-[40px] h-[40px] cursor-pointer rounded-full ${currentTheme.accentLight} bg-opacity-20`;
            } else {
                // Normal day
                textClass = "text-gray-700 dark:text-gray-300";
            }

            days.push(
                <div key={`day-${index}-${day}`} className="flex justify-center">
                    <button
                        type="button"
                        onClick={() => handleDateClick(date)}
                        className={buttonClass}
                    >
                        <div className={containerClass}>
                            <div className={textClass}>{day}</div>
                        </div>
                    </button>
                </div>
            );
        }

        const yearDisplay = language === 'th' ? monthDate.getFullYear() + 543 : monthDate.getFullYear();

        return (
            <div id={`calendar_${index}`} className="flex-1 w-full min-w-[300px] md:min-w-[400px]">
                <div className="font-bold text-center py-4 text-lg text-gray-900 dark:text-gray-100">
                    {months[monthDate.getMonth()]} {yearDisplay}
                </div>
                <div className="grid grid-cols-[repeat(7,30px)] justify-center mb-2 gap-1 border-b border-gray-100 dark:border-gray-700 pb-2 custom-calendar-grid">
                    {daysWeek.map((day, i) => (
                        <div key={i} className={`text-center text-sm font-medium ${i === 0 ? 'text-red-500' : 'text-gray-500 dark:text-gray-500'}`}>
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-[repeat(7,40px)] justify-center gap-y-2 gap-x-1 custom-calendar-grid">
                    {days}
                </div>
            </div>
        );
    };

    if (!isCalendarOpen) return null;

    const nextMonthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

    // Inline Calendar (appears below the time selector)
    return (
        <div
            ref={containerRef}
            className={`absolute right 0 z-[100] min-w-[320px] md:min-w-[650px] bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${className}`}
            style={{ top: '100%', marginTop: '0.5rem' }}
        >
            <div className="relative p-6">
                {/* Two Month View - Responsive Stack */}
                <div className="relative flex flex-col md:flex-row gap-8">
                    {renderMonth(currentMonth, 0)}
                    {/* Divider for mobile only */}
                    <div className="md:hidden w-full h-px bg-gray-200 dark:bg-gray-700 my-2"></div>
                    {renderMonth(nextMonthDate, 1)}
                </div>

                {/* Navigation Buttons (Absolute) */}
                <div className="absolute top-6 left-0 right-0 px-6 flex justify-between pointer-events-none">
                    <button
                        type="button"
                        onClick={() => changeMonth(-1)}
                        className="pointer-events-auto h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => changeMonth(1)}
                        className="pointer-events-auto h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end pt-6 mt-2 border-t border-gray-100 dark:border-gray-700">
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={!startDate || !endDate}
                        className={`
                            px-8 py-2.5 rounded-xl font-bold text-white transition-all transform hover:-translate-y-0.5
                            ${startDate && endDate
                                ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-500/30 hover:shadow-red-500/40'
                                : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'}
                        `}
                    >
                        {t('common.confirm') || 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DateRangePicker;
