import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, Mail, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getApiBase } from '../../config/api';

const ForgotPasswordPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${getApiBase()}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setSuccess(true);
            } else {
                setError(data.error || 'Failed to request password reset.');
            }
        } catch (err) {
            console.error('Forgot password request failed:', err);
            setError('Connection error. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 font-['Inter',system-ui,sans-serif]">
            <div className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-lg p-8 shadow-xl relative z-10">
                <button 
                    onClick={() => navigate('/login')}
                    className="absolute top-6 left-6 text-[#94a3b8] hover:text-[#f8fafc] transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>

                <div className="text-center mb-8 mt-4">
                    <div className="w-16 h-16 bg-[#0f172a] rounded-lg border border-[#334155] flex items-center justify-center mx-auto mb-6">
                        <ShieldCheck className="w-8 h-8 text-[#3b82f6]" />
                    </div>
                    <h2 className="text-xl font-bold text-[#f8fafc] uppercase tracking-wide">Recover Access</h2>
                    <p className="text-[#94a3b8] text-sm mt-2">Enter your email address to receive reset instructions.</p>
                </div>

                {success ? (
                    <div className="animate-in fade-in duration-300 text-center">
                        <div className="bg-[#064e3b] border border-[#065f46] rounded-md p-6 mb-6">
                            <CheckCircle2 className="w-10 h-10 text-[#34d399] mx-auto mb-4" />
                            <h3 className="text-base font-bold text-[#f8fafc] mb-2">Check Your Email</h3>
                            <p className="text-[#94a3b8] text-sm leading-relaxed">
                                If the email <span className="font-semibold text-[#f8fafc]">{email}</span> exists in our system, you will receive a password reset link shortly.
                            </p>
                        </div>
                        <Link 
                            to="/login"
                            className="inline-flex justify-center items-center w-full py-3 bg-[#0f172a] hover:bg-[#334155] border border-[#334155] rounded-md text-[#cbd5e1] hover:text-[#f8fafc] font-semibold transition-colors text-sm uppercase tracking-wide"
                        >
                            Return to Login
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="p-3 bg-[#450a0a] border border-[#7f1d1d] rounded-md">
                                <p className="text-xs font-semibold text-[#fca5a5] uppercase tracking-wide text-center">{error}</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide block">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] w-5 h-5" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your registered email"
                                    className="w-full bg-[#0f172a] border border-[#334155] rounded-md py-3 pl-10 pr-4 text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#3b82f6] transition-colors font-medium text-sm"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !email}
                            className="w-full py-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-md font-semibold uppercase tracking-wide text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
