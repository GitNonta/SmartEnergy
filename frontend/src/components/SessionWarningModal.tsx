import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Clock, RefreshCw } from 'lucide-react';

/**
 * Session Warning Modal
 * Shows warning before auto-logout due to inactivity
 */
const SessionWarningModal: React.FC = () => {
    const { sessionWarning, remainingTime, extendSession, logout } = useAuth();
    const { t } = useLanguage();

    if (!sessionWarning) return null;

    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-in fade-in duration-300">
                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                    </div>
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">
                    {t('auth.sessionExpiring')}
                </h2>

                {/* Message */}
                <p className="text-center text-gray-600 dark:text-gray-400 mb-4">
                    {t('auth.sessionExpiringMessage')}
                </p>

                {/* Countdown */}
                <div className="text-center mb-6">
                    <span className="text-4xl font-mono font-bold text-amber-600 dark:text-amber-400">
                        {timeDisplay}
                    </span>
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={logout}
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        {t('auth.logout')}
                    </button>
                    <button
                        onClick={extendSession}
                        className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        {t('auth.stayLoggedIn')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SessionWarningModal;
