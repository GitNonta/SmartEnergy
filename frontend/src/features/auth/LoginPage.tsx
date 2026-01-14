import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Plug, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

const LoginPage: React.FC = () => {
    const { isAuthenticated, isLoading, login } = useAuth();
    const { t } = useLanguage();
    const location = useLocation();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    // Redirect to original destination or dashboard if already authenticated
    const from = (location.state as any)?.from?.pathname || '/dashboard';

    // Check for existing lockout on mount
    React.useEffect(() => {
        const storedLockout = localStorage.getItem('lockoutUntil');
        if (storedLockout) {
            const lockoutTime = parseInt(storedLockout, 10);
            const now = Date.now();
            if (lockoutTime > now) {
                const remaining = Math.ceil((lockoutTime - now) / 1000);
                setCooldown(remaining);
                // Ensure error message is shown to trigger popup
                setError(t('auth.lockedMessage') || 'Too many failed attempts. Please contact administrator.');
            } else {
                localStorage.removeItem('lockoutUntil');
            }
        }
    }, [t]);

    // Timer effect for cooldown
    React.useEffect(() => {
        if (cooldown > 0) {
            const timer = setInterval(() => {
                setCooldown((prev) => {
                    const newValue = prev - 1;
                    if (newValue <= 0) {
                        // Auto-close: Clear error and storage when time validates
                        setError('');
                        localStorage.removeItem('lockoutUntil');
                        return 0;
                    }
                    return newValue;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [cooldown]);

    if (isLoading) {
        return (
            <div className="login-loading">
                <Loader2 className="animate-spin" size={32} />
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to={from} replace />;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        const result = await login(username, password);

        if (!result.success) {
            setError(result.error || t('auth.loginError'));

            // Check for lockout response
            // Type cast to any because LoginResult interface might not have remainingSeconds yet
            const loginRes = result as any;

            if (loginRes.remainingSeconds || (result.error && result.error.includes('administrator'))) {
                // Use remainingSeconds from backend if available, otherwise default to 120s
                const remaining = typeof loginRes.remainingSeconds === 'number' ? loginRes.remainingSeconds : 120;
                setCooldown(remaining);

                // Persist lockout time
                const lockoutUntil = Date.now() + (remaining * 1000);
                localStorage.setItem('lockoutUntil', lockoutUntil.toString());
            }
        }

        setIsSubmitting(false);
    };

    return (
        <div className="login-container">
            {/* Lockout Popup Overlay */}
            {error && error.includes('contact administrator') && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-red-500/30 rounded-lg p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-300">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center">
                                <AlertCircle className="w-8 h-8 text-red-500" />
                            </div>
                            <h3 className="text-xl font-bold text-white">{t('auth.lockedTitle') || 'Access Temporarily Locked'}</h3>
                            <p className="text-slate-300 text-sm">
                                {t('auth.lockedMessage') || 'Too many failed attempts. Please contact administrator.'}
                            </p>

                            {/* Cooldown Timer */}
                            <div className="text-2xl font-mono font-bold text-yellow-400 my-2">
                                {String(Math.floor(cooldown / 60)).padStart(2, '0')}:{String(cooldown % 60).padStart(2, '0')}
                            </div>

                            <p className="text-xs text-slate-500">
                                {t('auth.waitMessage') || 'Please wait before trying again'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="login-card">
                {/* Logo */}
                <div className="login-logo">
                    <div className="logo-icon">
                        <Plug className="w-8 h-8 text-yellow-300" />
                    </div>
                    <h1 className="logo-text">
                        ENERGY<span className="logo-text-light">SYSTEM</span>
                    </h1>
                </div>

                {/* Title */}
                <h2 className="login-title">{t('auth.welcome')}</h2>
                <p className="login-subtitle">{t('auth.loginSubtitle')}</p>

                {/* Error Message */}
                {error && !error.includes('contact administrator') && (
                    <div className="login-error">
                        <AlertCircle className="w-4 h-4" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="username">{t('auth.username')}</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder={t('auth.usernamePlaceholder')}
                            autoComplete="username"
                            autoFocus
                            required
                            disabled={cooldown > 0}
                            className={cooldown > 0 ? 'opacity-50 cursor-not-allowed' : ''}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">{t('auth.password')}</label>
                        <div className="password-input">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t('auth.passwordPlaceholder')}
                                autoComplete="current-password"
                                required
                                disabled={cooldown > 0}
                                className={cooldown > 0 ? 'opacity-50 cursor-not-allowed' : ''}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                                disabled={cooldown > 0}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className={`login-button ${cooldown > 0 ? 'bg-slate-700 cursor-not-allowed hover:bg-slate-700' : ''}`}
                        disabled={isSubmitting || !username || !password || cooldown > 0}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>{t('common.loading')}</span>
                            </>
                        ) : (
                            <span>{cooldown > 0 ? `Try again in ${cooldown}s` : t('auth.loginButton')}</span>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div className="login-footer">
                    <p>SMART Energy Monitoring System</p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
