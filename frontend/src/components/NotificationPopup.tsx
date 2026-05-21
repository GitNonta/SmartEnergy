import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Bell,
    MoreHorizontal,
    CheckCircle2,
    AlertTriangle,
    Info,
    Zap,
    AlertCircle,
    X
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useWebSocket } from '../context/WebSocketContext';

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

export const NotificationPopup: React.FC<NotificationPopupProps> = ({
    isOpen,
    onClose,
    alerts
}) => {
    const { t } = useLanguage();
    const { markAlertAsRead } = useWebSocket();
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
        let title = t('notifications.systemAlert');
        if (a.type) {
            const camel = a.type.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
            title = t(`alerts.messages.${camel}`);
            if (title === `alerts.messages.${camel}`) {
                title = a.type.replace(/_/g, ' ');
            }
        }

        return {
            id: a.id || a._id || Math.random().toString(),
            title: title,
            message: a.message,
            timestamp: new Date(a.timestamp),
            read: a.read || false,
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
            case 'critical': return (
                <div className="p-2.5 bg-red-500/10 dark:bg-red-500/20 rounded-2xl border border-red-500/20 shadow-lg shadow-red-500/5">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
            );
            case 'warning': return (
                <div className="p-2.5 bg-amber-500/10 dark:bg-amber-500/20 rounded-2xl border border-amber-500/20 shadow-lg shadow-amber-500/5">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
            );
            case 'success': return (
                <div className="p-2.5 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
            );
            default: return (
                <div className="p-2.5 bg-blue-500/10 dark:bg-blue-500/20 rounded-2xl border border-blue-500/20 shadow-lg shadow-blue-500/5">
                    <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
            );
        }
    };

    const renderAlertItem = (alert: AlertItem) => (
        <Link 
            key={alert.id} 
            to="/alerts" 
            onClick={() => {
                if (!alert.read) markAlertAsRead(alert.id);
                onClose();
            }}
            className="block relative group overflow-hidden rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        >
            <div className={`flex gap-4 p-4 ${alert.read ? 'bg-white/5 dark:bg-white/5' : 'bg-white/20 dark:bg-white/10'} backdrop-blur-md border border-white/10 group-hover:border-white/30 transition-all`}>
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5 relative">
                    {getIcon(alert.type)}
                    {/* Source Badge */}
                    {alert.source && (
                        <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-lg p-1 border-2 border-white dark:border-slate-800 shadow-sm">
                            <Zap className="w-2.5 h-2.5 text-white" />
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider truncate">
                            {alert.title}
                        </h4>
                        <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap ml-2 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded-md uppercase">
                            {formatTime(new Date(alert.timestamp) as Date)}
                        </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug font-medium line-clamp-2">
                        {alert.message}
                    </p>
                </div>

                {/* Unread Indicator */}
                {!alert.read && (
                    <div className="flex-shrink-0 self-center">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    </div>
                )}
            </div>
        </Link>
    );

    return (
        <div
            ref={popupRef}
            className="notification-popup-container absolute right-0 top-14 w-[380px] max-w-[95vw] overflow-hidden z-[60] flex flex-col max-h-[85vh]
                bg-white/40 dark:bg-slate-900/40 backdrop-blur-3xl 
                border border-white/30 dark:border-white/10 rounded-[2rem] 
                shadow-[0_20px_50px_rgba(0,0,0,0.3)] 
                animate-in slide-in-from-top-4 fade-in duration-500"
        >
            {/* Glossy Reflection Effect */}
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none z-20" />
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 p-6 pb-2">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-2xl bg-blue-500 gold-glow shadow-lg shadow-blue-500/20">
                            <Bell size={20} className="text-white" />
                        </div>
                        <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase">
                            {t('notifications.title')}
                        </h2>
                    </div>
                    <div className="flex items-center gap-1">
                        <button className="p-2 hover:bg-white/20 dark:hover:bg-black/20 rounded-full text-slate-500 dark:text-slate-400 transition-all active:scale-90 hidden sm:block">
                            <MoreHorizontal size={20} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/20 dark:hover:bg-black/20 rounded-full text-slate-500 dark:text-slate-400 transition-all active:scale-90"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 bg-white/10 dark:bg-black/20 p-1 rounded-2xl border border-white/10">
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`flex-1 px-4 py-2 rounded-xl text-xs font-black transition-all duration-300 tracking-widest uppercase ${activeTab === 'all'
                            ? 'bg-white/40 dark:bg-white/10 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                            }`}
                    >
                        {t('notifications.all')}
                    </button>
                    <button
                        onClick={() => setActiveTab('unread')}
                        className={`flex-1 px-4 py-2 rounded-xl text-xs font-black transition-all duration-300 tracking-widest uppercase ${activeTab === 'unread'
                            ? 'bg-white/40 dark:bg-white/10 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                            }`}
                    >
                        {t('notifications.unread')}
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="relative z-10 overflow-y-auto flex-1 p-4 space-y-3 custom-scrollbar liquid-glass-scroll">
                {processedAlerts.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="bg-white/10 dark:bg-white/5 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-4 border border-white/10 shadow-inner">
                            <Bell className="w-10 h-10 text-slate-400/50" />
                        </div>
                        <p className="text-sm font-bold text-slate-500/80 uppercase tracking-widest">{t('notifications.noNotifications')}</p>
                    </div>
                ) : (
                    <>
                        {newAlerts.length > 0 && (
                            <div className="mb-4">
                                <div className="flex items-center justify-between px-3 py-2 mb-2">
                                    <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">{t('notifications.new')}</h3>
                                    <Link 
                                        to="/alerts" 
                                        onClick={onClose}
                                        className="text-[10px] font-black text-slate-400 hover:text-blue-500 uppercase transition-colors"
                                    >
                                        {t('notifications.seeAll')}
                                    </Link>
                                </div>
                                <div className="space-y-2">
                                    {newAlerts.map(renderAlertItem)}
                                </div>
                            </div>
                        )}

                        {earlierAlerts.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between px-3 py-2 mb-2">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('notifications.earlier')}</h3>
                                </div>
                                <div className="space-y-2">
                                    {earlierAlerts.map(renderAlertItem)}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <style>{`
                .liquid-glass-scroll::-webkit-scrollbar { width: 4px; }
                .liquid-glass-scroll::-webkit-scrollbar-track { background: transparent; }
                .liquid-glass-scroll::-webkit-scrollbar-thumb {
                    background: rgba(59, 130, 246, 0.2);
                    border-radius: 20px;
                }
                .liquid-glass-scroll::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.4); }
            `}</style>
        </div>
    );
};
