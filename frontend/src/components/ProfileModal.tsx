import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getMyProfile, updateMyProfile, changeMyPassword, User } from '../services/userService';
import {
    X, Save, User as UserIcon, Mail, Phone, Lock, Check,
    ChevronLeft, ChevronRight, Eye, EyeOff, LogOut,
    Users, Info, RefreshCw, BadgeCheck, ShieldAlert, Edit3, KeyRound
} from 'lucide-react';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const useIsMobile = () => {
    const [v, setV] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const h = (e: MediaQueryListEvent) => setV(e.matches);
        mq.addEventListener('change', h);
        return () => mq.removeEventListener('change', h);
    }, []);
    return v;
};

const avatarGradient = (name: string) => {
    const p = [
        'from-violet-500 to-purple-700', 'from-sky-500 to-blue-700',
        'from-emerald-500 to-teal-700',  'from-rose-500 to-pink-700',
        'from-amber-400 to-orange-600',  'from-cyan-400 to-sky-600',
    ];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % p.length;
    return p[h];
};

const getRoleStyle = (role: string) => {
    const r = role?.toLowerCase() || '';
    if (r.includes('super')) return { dot: '#f43f5e', text: 'text-rose-300',   bg: 'bg-rose-500/10',   border: 'border-rose-500/20' };
    if (r.includes('admin')) return { dot: '#8b5cf6', text: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-500/20' };
    return                          { dot: '#3b82f6', text: 'text-sky-300',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20' };
};

const passwordStrength = (pw: string) => {
    if (!pw) return { score: 0, label: '', color: '' };
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return { score: s, ...[
        { label: 'Too weak', color: '#ef4444' },
        { label: 'Weak',     color: '#f97316' },
        { label: 'Fair',     color: '#eab308' },
        { label: 'Good',     color: '#3b82f6' },
        { label: 'Strong',   color: '#10b981' },
    ][s] };
};

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Field: React.FC<{
    label: string; icon?: React.ReactNode; type?: string; value: string;
    onChange?: (v: string) => void; disabled?: boolean; placeholder?: string;
    rightSlot?: React.ReactNode;
}> = ({ label, icon, type = 'text', value, onChange, disabled, placeholder, rightSlot }) => (
    <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</label>
        <div className="relative group">
            {icon && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-400 transition-colors pointer-events-none">
                    {icon}
                </div>
            )}
            <input
                type={type} value={value}
                onChange={e => onChange?.(e.target.value)}
                disabled={disabled} placeholder={placeholder}
                className={`w-full border rounded-xl text-sm transition-all
                    py-3 ${icon ? 'pl-9' : 'pl-3.5'} ${rightSlot ? 'pr-10' : 'pr-3.5'}
                    ${disabled
                        ? 'bg-slate-800/30 border-white/5 text-slate-600 cursor-not-allowed'
                        : 'bg-slate-800/60 border-white/8 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/10'
                    }`}
            />
            {rightSlot && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>}
        </div>
    </div>
);

const Alert: React.FC<{ type: 'error' | 'success'; message: string }> = ({ type, message }) => (
    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium border ${
        type === 'error'
            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    }`}>
        {type === 'error' ? <ShieldAlert size={15} className="flex-shrink-0" /> : <Check size={15} className="flex-shrink-0" />}
        {message}
    </div>
);

const MenuRow: React.FC<{
    icon: React.ReactNode; label: string; sub?: string;
    onClick?: () => void; danger?: boolean; accent?: string;
}> = ({ icon, label, sub, onClick, danger, accent }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98]
            ${danger ? 'hover:bg-rose-500/8 group' : 'hover:bg-white/4 group'}`}
    >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors
            ${danger ? 'bg-rose-500/10 group-hover:bg-rose-500/20 text-rose-400'
                     : accent || 'bg-white/5 group-hover:bg-white/10 text-slate-400'}`}>
            {icon}
        </div>
        <div className="flex-1 text-left min-w-0">
            <p className={`text-sm font-semibold ${danger ? 'text-rose-400' : 'text-slate-200'}`}>{label}</p>
            {sub && <p className="text-[11px] text-slate-600 mt-0.5">{sub}</p>}
        </div>
        <ChevronRight size={15} className="text-slate-700 group-hover:text-slate-500 flex-shrink-0 transition-colors" />
    </button>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
    const { token, logout, user: authUser } = useAuth();
    const { t } = useLanguage();
    const location = useLocation();
    const isMobile = useIsMobile();

    const [profile, setProfile] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'main' | 'edit' | 'password'>('main');

    // Form fields
    const [displayName, setDisplayName] = useState('');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPw, setShowNewPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);

    // Close on route change
    useEffect(() => { if (isOpen) onClose(); }, [location.pathname]);

    // Load profile when opened
    useEffect(() => {
        if (isOpen && token) { loadProfile(); setViewMode('main'); }
    }, [isOpen, token]);

    // Escape key
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [isOpen, onClose]);

    // Lock scroll
    useEffect(() => {
        if (isOpen) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = '';
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const loadProfile = async () => {
        if (!token) return;
        setLoading(true); setError(null);
        const r = await getMyProfile(token);
        if (r.success && r.data) {
            setProfile(r.data);
            setDisplayName(r.data.display_name || '');
            setFullName(r.data.full_name || '');
            setEmail(r.data.email || '');
            setPhoneNumber(r.data.phone_number || '');
        } else {
            setError(r.error || 'Failed to load profile');
        }
        setLoading(false);
    };

    const handleSaveProfile = async () => {
        if (!token) return;
        setSaving(true); setError(null); setSuccess(null);
        const r = await updateMyProfile(token, {
            display_name: displayName, full_name: fullName,
            email: email || undefined, phone_number: phoneNumber || undefined,
        });
        if (r.success) {
            setSuccess('Profile updated successfully');
            setProfile(r.data || null);
            setTimeout(() => { setSuccess(null); setViewMode('main'); }, 1000);
        } else {
            setError(r.error || 'Failed to update profile');
        }
        setSaving(false);
    };

    const handleChangePassword = async () => {
        if (!token) return;
        if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
        if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
        setSaving(true); setError(null); setSuccess(null);
        const r = await changeMyPassword(token, newPassword);
        if (r.success) {
            setSuccess('Password changed successfully');
            setNewPassword(''); setConfirmPassword('');
            setTimeout(() => { setSuccess(null); setViewMode('main'); }, 1000);
        } else {
            setError(r.error || 'Failed to change password');
        }
        setSaving(false);
    };

    const goBack = useCallback(() => {
        setError(null); setSuccess(null);
        setViewMode('main');
    }, []);

    if (!isOpen) return null;

    const name = profile?.display_name || profile?.username || 'U';
    const initials = name.substring(0, 2).toUpperCase();
    const grad = avatarGradient(name);
    const role = profile?.role || authUser?.role || 'user';
    const roleStyle = getRoleStyle(role as string);
    const pwStrength = passwordStrength(newPassword);
    const isAdmin = authUser?.role && ['admin', 'Administrator', 'Superadmin', 'superadmin'].includes(authUser.role as string);

    // ── Shared header ─────────────────────────────────────────────────────────
    const Header = () => (
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/8 flex-shrink-0">
            {viewMode !== 'main' ? (
                <button
                    onClick={goBack}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0"
                >
                    <ChevronLeft size={17} />
                </button>
            ) : (
                <div className="w-8 flex-shrink-0" />
            )}
            <h2 className="flex-1 text-center text-sm font-bold text-white tracking-tight">
                {viewMode === 'main' ? t('auth.profile')
                    : viewMode === 'edit' ? 'Edit Profile'
                    : 'Change Password'}
            </h2>
            <button
                onClick={viewMode !== 'main' ? goBack : onClose}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0"
            >
                <X size={16} />
            </button>
        </div>
    );

    // ── Main view ─────────────────────────────────────────────────────────────
    const MainView = () => (
        <div className="flex flex-col flex-1 overflow-y-auto">
            {/* Avatar hero */}
            <div className="flex flex-col items-center pt-7 pb-6 px-5">
                <div className="relative mb-4">
                    <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${grad} flex items-center justify-center text-2xl font-black text-white shadow-2xl ring-4 ring-white/10`}>
                        {initials}
                    </div>
                    {profile?.is_verified && (
                        <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center ring-2 ring-slate-900">
                            <BadgeCheck size={13} className="text-white" />
                        </div>
                    )}
                </div>
                <h3 className="text-base font-black text-white">{name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{profile?.email || `@${profile?.username}`}</p>

                {/* Role badge */}
                <span className={`inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-xl border text-[11px] font-bold uppercase tracking-wider ${roleStyle.bg} ${roleStyle.border} ${roleStyle.text}`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: roleStyle.dot }} />
                    {role}
                </span>

                {/* Quick stats */}
                {profile && (
                    <div className="flex items-center gap-px mt-4 w-full bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
                        {[
                            { label: 'Status', value: profile.is_active ? 'Active' : 'Inactive', color: profile.is_active ? 'text-emerald-400' : 'text-slate-500' },
                            { label: 'Verified', value: profile.is_verified ? 'Yes' : 'No',     color: profile.is_verified ? 'text-blue-400' : 'text-slate-500' },
                            { label: 'Joined',   value: new Date(profile.created_at).toLocaleDateString('en', { month: 'short', year: '2-digit' }), color: 'text-slate-300' },
                        ].map((s, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center py-3 border-r border-white/8 last:border-r-0">
                                <p className={`text-xs font-bold ${s.color}`}>{s.value}</p>
                                <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-widest">{s.label}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Edit profile CTA */}
                <button
                    onClick={() => setViewMode('edit')}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl
                        bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                        text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
                >
                    <Edit3 size={14} /> Edit Profile
                </button>
            </div>

            {/* Menu */}
            <div className="px-3 pb-safe-bottom pb-4 space-y-1 border-t border-white/6 pt-3">
                <MenuRow
                    icon={<KeyRound size={16} />} label="Change Password"
                    sub="Update your account password"
                    onClick={() => setViewMode('password')}
                    accent="bg-amber-500/10 group-hover:bg-amber-500/20 text-amber-400"
                />
                {isAdmin && (
                    <MenuRow
                        icon={<Users size={16} />} label="User Management"
                        sub="Manage all user accounts"
                        onClick={() => { window.location.href = '/admin/users'; }}
                        accent="bg-violet-500/10 group-hover:bg-violet-500/20 text-violet-400"
                    />
                )}
                <MenuRow
                    icon={<Info size={16} />} label="Information"
                    sub="App info and support"
                    accent="bg-sky-500/10 group-hover:bg-sky-500/20 text-sky-400"
                />
                <div className="h-px bg-white/5 mx-2 my-1" />
                <MenuRow
                    icon={<LogOut size={16} />} label="Log Out"
                    onClick={logout} danger
                />
            </div>
        </div>
    );

    // ── Edit view ─────────────────────────────────────────────────────────────
    const EditView = () => (
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {/* Mini avatar */}
            <div className="flex items-center gap-4 p-4 bg-white/3 border border-white/8 rounded-2xl">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center text-sm font-black text-white flex-shrink-0`}>
                    {initials}
                </div>
                <div>
                    <p className="text-sm font-bold text-white">{profile?.username}</p>
                    <p className="text-[11px] text-slate-500">Username cannot be changed</p>
                </div>
            </div>

            <Field label="Display Name" icon={<UserIcon size={14} />}
                value={displayName} onChange={setDisplayName} placeholder="How you appear to others" />
            <Field label="Full Name" icon={<UserIcon size={14} />}
                value={fullName} onChange={setFullName} placeholder="Your full legal name" />
            <Field label="Email Address" icon={<Mail size={14} />} type="email"
                value={email} onChange={setEmail} placeholder="you@company.com" />
            <Field label="Phone Number" icon={<Phone size={14} />} type="tel"
                value={phoneNumber} onChange={setPhoneNumber} placeholder="+66 8x xxx xxxx" />
            <Field label="Username" icon={<UserIcon size={14} />}
                value={profile?.username || ''} disabled />

            <button
                onClick={handleSaveProfile} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl
                    bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                    text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all
                    disabled:opacity-60 active:scale-[0.98]"
            >
                {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? 'Saving…' : 'Save Changes'}
            </button>
        </div>
    );

    // ── Password view ─────────────────────────────────────────────────────────
    const PasswordView = () => (
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 bg-amber-500/8 border border-amber-500/15 rounded-2xl">
                <KeyRound size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-bold text-amber-300">Password Requirements</p>
                    <p className="text-[11px] text-amber-500/80 mt-0.5 leading-relaxed">At least 6 characters. Use uppercase, numbers & symbols for a stronger password.</p>
                </div>
            </div>

            <Field label="New Password" icon={<Lock size={14} />}
                type={showNewPw ? 'text' : 'password'}
                value={newPassword} onChange={v => { setNewPassword(v); setError(null); }}
                placeholder="Min. 8 characters recommended"
                rightSlot={
                    <button type="button" onClick={() => setShowNewPw(v => !v)}
                        className="text-slate-500 hover:text-slate-300 transition-colors p-1">
                        {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                } />

            {/* Strength meter */}
            {newPassword && (
                <div className="space-y-1.5 -mt-2">
                    <div className="flex gap-1.5">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                                style={{ background: i <= pwStrength.score ? pwStrength.color : 'rgba(255,255,255,0.08)' }} />
                        ))}
                    </div>
                    <p className="text-[11px] font-semibold" style={{ color: pwStrength.color }}>{pwStrength.label}</p>
                </div>
            )}

            <Field label="Confirm Password" icon={<Lock size={14} />}
                type={showConfirmPw ? 'text' : 'password'}
                value={confirmPassword} onChange={v => { setConfirmPassword(v); setError(null); }}
                placeholder="Re-enter your new password"
                rightSlot={
                    <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                        className="text-slate-500 hover:text-slate-300 transition-colors p-1">
                        {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                } />

            {/* Match indicator */}
            {confirmPassword && (
                newPassword === confirmPassword
                    ? <p className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5 -mt-2"><Check size={11} />Passwords match</p>
                    : <p className="text-[11px] font-semibold text-rose-400 flex items-center gap-1.5 -mt-2"><X size={11} />Passwords don't match</p>
            )}

            <button
                onClick={handleChangePassword}
                disabled={saving || !newPassword || !confirmPassword}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl
                    bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400
                    text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition-all
                    disabled:opacity-50 active:scale-[0.98]"
            >
                {saving ? <RefreshCw size={15} className="animate-spin" /> : <KeyRound size={15} />}
                {saving ? 'Updating…' : 'Update Password'}
            </button>
        </div>
    );

    // ── Shell ─────────────────────────────────────────────────────────────────
    const shellCls = isMobile
        ? // Mobile: full-width bottom sheet
          `w-full bg-slate-900 border border-white/10 border-b-0 rounded-t-3xl shadow-2xl
           flex flex-col max-h-[92dvh]
           animate-in fade-in slide-in-from-bottom-4 duration-300`
        : // Tablet+: centered dialog
          `w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl shadow-2xl
           flex flex-col max-h-[88vh]
           animate-in fade-in zoom-in-95 duration-250`;

    const content = ReactDOM.createPortal(
        <div
            className={`fixed inset-0 z-[200] flex ${isMobile ? 'items-end' : 'items-center'} justify-center`}
            style={{ background: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
            onClick={onClose}
        >
            <div className={shellCls} onClick={e => e.stopPropagation()}>
                {/* Mobile drag pill */}
                {isMobile && (
                    <div className="flex justify-center pt-3 pb-0.5 flex-shrink-0">
                        <div className="w-10 h-1 rounded-full bg-white/20" />
                    </div>
                )}

                <Header />

                {/* Body */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <RefreshCw size={26} className="animate-spin text-blue-500 opacity-50" />
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">Loading…</p>
                    </div>
                ) : (
                    <>
                        {/* Alerts */}
                        {(error || success) && (
                            <div className="px-5 pt-4 flex-shrink-0">
                                {error   && <Alert type="error"   message={error} />}
                                {success && <Alert type="success" message={success} />}
                            </div>
                        )}

                        {viewMode === 'main'     && <MainView />}
                        {viewMode === 'edit'     && <EditView />}
                        {viewMode === 'password' && <PasswordView />}
                    </>
                )}
            </div>
        </div>,
        document.body
    );

    return content;
};

export default ProfileModal;