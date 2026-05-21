import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, Lock, ArrowLeft, RefreshCw, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { getApiBase } from '../../config/api';

const ResetPasswordPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    
    const [step, setStep] = useState<'password' | 'otp' | 'success'>('password');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [otp, setOtp] = useState('');
    
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    // Password strength calculation
    const getStrength = (pw: string) => {
        if (!pw) return { score: 0, label: '', color: '' };
        let score = 0;
        if (pw.length >= 8) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        const map: Record<number, { label: string; color: string }> = {
            0: { label: 'Insecure', color: '#ef4444' },
            1: { label: 'Weak', color: '#f97316' },
            2: { label: 'Moderate', color: '#eab308' },
            3: { label: 'Reliable', color: '#3b82f6' },
            4: { label: 'Secure', color: '#10b981' },
        };
        return { score, ...map[score] };
    };
    
    const strength = getStrength(newPassword);
    const isMatch = newPassword && confirmPassword && newPassword === confirmPassword;
    const mismatch = confirmPassword && newPassword !== confirmPassword;

    useEffect(() => {
        if (!token) {
            setError('Invalid or missing reset token.');
        }
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!token) return;
        if (step === 'password') {
            if (newPassword.length < 8) {
                setError('Password must be at least 8 characters long.');
                return;
            }
            if (newPassword !== confirmPassword) {
                setError('Passwords do not match.');
                return;
            }
        } else if (step === 'otp') {
            if (otp.length !== 6) {
                setError('Please enter a valid 6-digit verification code.');
                return;
            }
        }

        setLoading(true);
        setError(null);

        try {
            const bodyData: any = { token, newPassword };
            if (step === 'otp') {
                bodyData.otp = otp;
            }

            const response = await fetch(`${getApiBase()}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                if (data.requireOtp) {
                    setStep('otp');
                } else {
                    setStep('success');
                    setTimeout(() => navigate('/login'), 3000);
                }
            } else {
                setError(data.error || 'Failed to process request.');
            }
        } catch (err) {
            console.error('Request failed:', err);
            setError('Connection error. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 font-['Inter',system-ui,sans-serif]">
            <div className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-lg p-8 shadow-xl relative z-10">
                <div className="text-center mb-8 mt-2">
                    <div className="w-16 h-16 bg-[#0f172a] rounded-lg border border-[#334155] flex items-center justify-center mx-auto mb-6">
                        {step === 'otp' ? <KeyRound className="w-8 h-8 text-[#3b82f6]" /> : <ShieldCheck className="w-8 h-8 text-[#3b82f6]" />}
                    </div>
                    <h2 className="text-xl font-bold text-[#f8fafc] uppercase tracking-wide">
                        {step === 'otp' ? 'Verify Identity' : step === 'success' ? 'Reset Successful' : 'Create Password'}
                    </h2>
                    <p className="text-[#94a3b8] text-sm mt-2">
                        {step === 'otp' 
                            ? 'Enter the 6-digit code sent to your email.' 
                            : step === 'success' 
                                ? 'Redirecting to login...' 
                                : 'Please enter your new security credentials.'}
                    </p>
                </div>

                {!token ? (
                    <div className="text-center">
                        <div className="p-3 bg-[#450a0a] border border-[#7f1d1d] rounded-md mb-6">
                            <p className="text-xs font-semibold text-[#fca5a5] uppercase tracking-wide">Invalid or missing reset token. Please request a new link.</p>
                        </div>
                        <Link 
                            to="/forgot-password"
                            className="inline-flex justify-center items-center w-full py-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-md font-semibold uppercase tracking-wide text-sm transition-colors"
                        >
                            Request New Link
                        </Link>
                    </div>
                ) : step === 'success' ? (
                    <div className="animate-in fade-in duration-300 text-center">
                        <div className="bg-[#064e3b] border border-[#065f46] rounded-md p-6 mb-6">
                            <CheckCircle2 className="w-10 h-10 text-[#34d399] mx-auto mb-4" />
                            <h3 className="text-base font-bold text-[#f8fafc] mb-2">Password Reset Successful</h3>
                            <p className="text-[#94a3b8] text-sm leading-relaxed">
                                Your password has been successfully updated.
                            </p>
                        </div>
                        <Link 
                            to="/login"
                            className="inline-flex justify-center items-center w-full py-3 bg-[#0f172a] hover:bg-[#334155] border border-[#334155] rounded-md text-[#cbd5e1] hover:text-[#f8fafc] font-semibold transition-colors text-sm uppercase tracking-wide"
                        >
                            Go to Login Now
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-300">
                        {error && (
                            <div className="p-3 bg-[#450a0a] border border-[#7f1d1d] rounded-md">
                                <p className="text-xs font-semibold text-[#fca5a5] uppercase tracking-wide text-center">{error}</p>
                            </div>
                        )}

                        {step === 'password' && (
                            <>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide block">New Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] w-5 h-5" />
                                        <input
                                            type={showNew ? 'text' : 'password'}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="Min. 8 characters"
                                            className="w-full bg-[#0f172a] border border-[#334155] rounded-md py-3 pl-10 pr-10 text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#3b82f6] transition-colors font-medium text-sm font-mono tracking-wider"
                                            required
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => setShowNew(!showNew)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#f8fafc] transition-colors"
                                        >
                                            {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                    {/* Strength indicator */}
                                    {newPassword && (
                                        <div className="flex items-center gap-3 mt-2 px-1">
                                            <div className="flex-1 flex gap-1 h-1">
                                                {[1, 2, 3, 4].map(i => (
                                                    <div 
                                                        key={i} 
                                                        className="flex-1 rounded-sm transition-colors duration-300"
                                                        style={{ background: i <= strength.score ? strength.color : '#334155' }} 
                                                    />
                                                ))}
                                            </div>
                                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: strength.color }}>
                                                {strength.label}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide block">Confirm Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] w-5 h-5" />
                                        <input
                                            type={showConfirm ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Re-enter new password"
                                            className={`w-full bg-[#0f172a] border ${mismatch ? 'border-[#dc2626] focus:border-[#ef4444]' : isMatch ? 'border-[#059669] focus:border-[#10b981]' : 'border-[#334155] focus:border-[#3b82f6]'} rounded-md py-3 pl-10 pr-10 text-[#f8fafc] placeholder-[#64748b] focus:outline-none transition-colors font-medium text-sm font-mono tracking-wider`}
                                            required
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => setShowConfirm(!showConfirm)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#f8fafc] transition-colors"
                                        >
                                            {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                    {mismatch && <p className="text-[10px] font-semibold text-[#f87171] mt-1 uppercase tracking-wide">Passwords do not match</p>}
                                </div>
                            </>
                        )}

                        {step === 'otp' && (
                            <div className="space-y-4">
                                <div className="text-center">
                                    <input
                                        type="text"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                        placeholder="000000"
                                        className="w-full max-w-[200px] mx-auto bg-[#0f172a] border border-[#334155] rounded-md py-3 text-center text-2xl text-[#f8fafc] placeholder-[#475569] focus:outline-none focus:border-[#3b82f6] transition-colors font-bold font-mono tracking-[0.3em]"
                                        autoFocus
                                        required
                                    />
                                </div>
                                <p className="text-xs text-center text-[#64748b]">
                                    Didn't receive the code? Check your spam folder.
                                </p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || (step === 'password' && (!isMatch || newPassword.length < 8)) || (step === 'otp' && otp.length !== 6)}
                            className="w-full py-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-md font-semibold uppercase tracking-wide text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
                        >
                            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : step === 'password' ? 'Continue' : 'Verify & Reset'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ResetPasswordPage;
