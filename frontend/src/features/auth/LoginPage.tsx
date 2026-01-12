import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Plug, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import './LoginPage.css';

const LoginPage: React.FC = () => {
    const { isAuthenticated, isLoading, login } = useAuth();
    const { t } = useLanguage();
    const location = useLocation();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Redirect to original destination or dashboard if already authenticated
    const from = (location.state as any)?.from?.pathname || '/dashboard';

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
        }

        setIsSubmitting(false);
    };

    return (
        <div className="login-container">
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
                {error && (
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
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="login-button"
                        disabled={isSubmitting || !username || !password}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>{t('common.loading')}</span>
                            </>
                        ) : (
                            <span>{t('auth.loginButton')}</span>
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
