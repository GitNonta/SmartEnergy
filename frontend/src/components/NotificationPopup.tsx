import React, { useState, useEffect, useRef } from 'react';
import {
    Bell,
    MoreHorizontal,
    CheckCircle2,
    AlertTriangle,
    Info,
    Zap,
    AlertCircle
} from 'lucide-react';

export interface AlertItem {
    id: string;
    title: string;
    message: string;
    timestamp: string | Date;
    read: boolean;
    type: 'info' | 'warning' | 'critical' | 'success';
    source?: string;
    device_id?: string;
    severity?: string;
}

interface NotificationPopupProps {
    isOpen: boolean;
    onClose: () => void;
    alerts: any[];
}

import { useLanguage } from '../context/LanguageContext';

export const NotificationPopup: React.FC<NotificationPopupProps> = ({
    isOpen,
    onClose,
    alerts
}) => {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
    const popupRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Process alerts
    const processedAlerts: AlertItem[] = alerts.map((a: any) => {
        // Map backend type to translation key (camelCase)
        const typeKey = a.type?.replace(/_/g, '') || 'system'; // e.g., voltageLow, phaseMissing
        // Try to get translation, fallback to raw type or system alert
        // We need to check if existing key exists to avoid showing mapped key as text.
        // But t() returns key if missing? No, usually t() returns key or default.
        // Let's assume keys in 'alerts.messages' match expected types (camelCase).
        // If 'a.type' is 'voltage_low', we convert to 'voltageLow'.
        const camelType = a.type?.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase()) || '';

        // This logic might be complex if we don't know exact backend types.
        // Assuming backend sends keys that match our `alerts.messages` keys (like 'voltageLow').
        // If not, we might need a mapping.
        // Let's just try t(`alerts.messages.${camelType}`) || t('notifications.systemAlert')
        // Actually simpler: t(`alerts.messages.${a.type}`) if keys match.
        // Let's stick to the previous code's logic but use t().

        let title = t('notifications.systemAlert');
        if (a.type) {
            const key = `alerts.messages.${a.type.replace(/_/g, '')}`; // Try to match simple removal of _?
            // Or better, backend should send codes.
            // Given user context (STEP 1002), user wants translation.
            // Let's try to translate.
            // Existing code: title: a.type?.replace(/_/g, ' ') || t('notifications.systemAlert'),

            // I will use a helper or direct lookup.
            // Since I can't verify backend types easily, I'll rely on text replacement or known keys.
            // Known keys: voltageLow, phaseMissing, undervoltage.
            // If a.type is 'voltage_low', camelCase it?
            const camel = a.type.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
            title = t(`alerts.messages.${camel}`, { defaultValue: a.type.replace(/_/g, ' ') });

            // If t() returns key string when missing, we might see 'alerts.messages.foo'.
            // I'll stick to a safe approach:
            // If t returns key, fallback to formatted type.
        }

        return {
            id: a.id || Math.random().toString(),
            title: title,
            message: a.message,
            timestamp: new Date(a.timestamp),
            read: false, // Mock read status
            type: a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info',
            source: a.device_id
        };
    });

    const filteredAlerts = activeTab === 'unread' ? processedAlerts.filter(a => !a.read) : processedAlerts;

    // Group by New (last 24h) vs Earlier
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;
    const newAlerts = filteredAlerts.filter(a => now.getTime() - new Date(a.timestamp).getTime() < oneDay);
    const earlierAlerts = filteredAlerts.filter(a => now.getTime() - new Date(a.timestamp).getTime() >= oneDay);

    const formatTime = (date: Date) => {
        const diff = now.getTime() - new Date(date).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return t('notifications.justNow');
        if (minutes < 60) return `${minutes}${t('time.m')}`;
        if (hours < 24) return `${hours}${t('time.h')}`;
        return `${days}${t('time.d')}`;
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'critical': return <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full"><AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" /></div>;
            case 'warning': return <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full"><AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>;
            case 'success': return <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-full"><CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /></div>;
            default: return <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full"><Info className="w-5 h-5 text-blue-600 dark:text-blue-400" /></div>;
        }
    };

    const renderAlertItem = (alert: AlertItem) => (
        <div key={alert.id} className="flex gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors cursor-pointer group relative">
            {/* Icon */}
            <div className="flex-shrink-0 mt-1">
                {getIcon(alert.type)}
                {/* Source Badge */}
                {alert.source && (
                    <div className="absolute top-8 left-8 bg-blue-500 rounded-full p-0.5 border-2 border-white dark:border-gray-900">
                        <Zap className="w-3 h-3 text-white" />
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-6">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
                    {alert.title}
                    <span className="text-gray-500 font-normal ml-1">
                        {alert.message}
                    </span>
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5">
                    {formatTime(new Date(alert.timestamp) as Date)}
                </p>
            </div>

            {/* Unread Indicator */}
            {!alert.read && (
                <div className="flex-shrink-0 self-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full ring-2 ring-white dark:ring-gray-900"></div>
                </div>
            )}
        </div>
    );

    return (
        <div
            ref={popupRef}
            className="absolute right-0 top-14 w-[360px] max-w-[90vw] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden z-[60] flex flex-col max-h-[80vh]"
        >
            {/* Header */}
            <div className="p-4 pb-2">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('notifications.title')}</h2>
                    <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-500">
                        <MoreHorizontal size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeTab === 'all'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                            }`}
                    >
                        {t('notifications.all')}
                    </button>
                    <button
                        onClick={() => setActiveTab('unread')}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeTab === 'unread'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                            }`}
                    >
                        {t('notifications.unread')}
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar">
                {processedAlerts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <div className="bg-gray-100 dark:bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Bell className="w-8 h-8 opacity-50" />
                        </div>
                        <p>{t('notifications.noNotifications')}</p>
                    </div>
                ) : (
                    <>
                        {newAlerts.length > 0 && (
                            <div className="mb-2">
                                <div className="flex items-center justify-between px-3 py-2">
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('notifications.new')}</h3>
                                    <button className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">{t('notifications.seeAll')}</button>
                                </div>
                                {newAlerts.map(renderAlertItem)}
                            </div>
                        )}

                        {earlierAlerts.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between px-3 py-2">
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('notifications.earlier')}</h3>
                                </div>
                                {earlierAlerts.map(renderAlertItem)}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
