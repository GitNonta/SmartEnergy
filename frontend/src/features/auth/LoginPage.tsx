import React, { useState } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
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
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 font-['Inter',system-ui,sans-serif]">
            {/* Lockout Popup Overlay */}
            {error && error.includes('contact administrator') && (
                <div className="fixed inset-0 bg-[#0f172a]/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#1e293b] border border-[#7f1d1d] rounded-lg p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="w-12 h-12 bg-[#450a0a] rounded-full flex items-center justify-center border border-[#7f1d1d]">
                                <AlertCircle className="w-6 h-6 text-[#ef4444]" />
                            </div>
                            <h3 className="text-xl font-bold text-[#f8fafc] uppercase tracking-wide">{t('auth.lockedTitle') || 'Access Temporarily Locked'}</h3>
                            <p className="text-[#94a3b8] text-sm">
                                {t('auth.lockedMessage') || 'Too many failed attempts. Please contact administrator.'}
                            </p>

                            {/* Cooldown Timer */}
                            <div className="text-2xl font-mono font-bold text-[#eab308] my-2">
                                {String(Math.floor(cooldown / 60)).padStart(2, '0')}:{String(cooldown % 60).padStart(2, '0')}
                            </div>

                            <p className="text-xs text-[#64748b] uppercase tracking-wide">
                                {t('auth.waitMessage') || 'Please wait before trying again'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-lg p-8 shadow-xl relative z-10">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-[#0f172a] rounded-lg border border-[#334155] flex items-center justify-center mx-auto mb-4">
                        <Plug className="w-8 h-8 text-[#3b82f6]" />
                    </div>
                    <h1 className="text-2xl font-black text-[#f8fafc] uppercase tracking-widest">
                        ENERGY<span className="text-[#94a3b8] font-normal">SYSTEM</span>
                    </h1>
                    <p className="text-[#94a3b8] text-sm mt-2">{t('auth.loginSubtitle')}</p>
                </div>

                {/* Error Message */}
                {error && !error.includes('contact administrator') && (
                    <div className="mb-6 p-3 bg-[#450a0a] border border-[#7f1d1d] rounded-md flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-[#fca5a5]" />
                        <span className="text-xs font-semibold text-[#fca5a5] uppercase tracking-wide">{error}</span>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="username" className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide block">{t('auth.username')}</label>
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
                            className={`w-full bg-[#0f172a] border border-[#334155] rounded-md py-3 px-4 text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#3b82f6] transition-colors font-medium text-sm ${cooldown > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="password" className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide block">{t('auth.password')}</label>
                        <div className="relative">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t('auth.passwordPlaceholder')}
                                autoComplete="current-password"
                                required
                                disabled={cooldown > 0}
                                className={`w-full bg-[#0f172a] border border-[#334155] rounded-md py-3 pl-4 pr-10 text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#3b82f6] transition-colors font-medium text-sm font-mono tracking-wider ${cooldown > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                disabled={cooldown > 0}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#f8fafc] transition-colors disabled:opacity-50"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex justify-end mb-2 mt-1">
                        <Link 
                            to="/forgot-password" 
                            className="text-[11px] font-bold text-[#3b82f6] hover:text-[#60a5fa] transition-colors uppercase tracking-widest"
                        >
                            Forgot Password?
                        </Link>
                    </div>

                    <button
                        type="submit"
                        className={`w-full py-3 ${cooldown > 0 ? 'bg-[#334155] text-[#94a3b8] cursor-not-allowed' : 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white'} rounded-md font-semibold uppercase tracking-wide text-sm transition-colors flex items-center justify-center gap-2`}
                        disabled={isSubmitting || !username || !password || cooldown > 0}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>{t('common.loading')}</span>
                            </>
                        ) : (
                            <span>{cooldown > 0 ? `Wait ${cooldown}s` : t('auth.loginButton')}</span>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div className="mt-8 text-center border-t border-[#334155] pt-6">
                    <p className="text-[10px] text-[#64748b] uppercase tracking-widest font-semibold">SMART Energy Monitoring System</p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
