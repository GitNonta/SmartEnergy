import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
    getAllUsers, createUser, updateUser, deleteUser, resetUserPassword, verifyUser,
    User, CreateUserData
} from '../../services/userService';
import {
    Users, Edit2, Trash2, Key, Check, X,
    Eye, EyeOff, ShieldAlert, Filter,
    RefreshCw, UserPlus, Calendar, Mail, Phone, Save,
    ChevronDown, Lock, AtSign, BadgeCheck, MoreVertical
} from 'lucide-react';

// ─── Role config ──────────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<string, { label: string; dot: string; text: string; bg: string; border: string }> = {
    superadmin:    { label: 'Superadmin',    dot: '#f43f5e', text: 'text-rose-300',   bg: 'bg-rose-500/10',   border: 'border-rose-500/20' },
    Superadmin:    { label: 'Superadmin',    dot: '#f43f5e', text: 'text-rose-300',   bg: 'bg-rose-500/10',   border: 'border-rose-500/20' },
    admin:         { label: 'Admin',         dot: '#8b5cf6', text: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
    Administrator: { label: 'Administrator', dot: '#f59e0b', text: 'text-amber-300',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
    user:          { label: 'User',          dot: '#3b82f6', text: 'text-sky-300',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20' },
    viewer:        { label: 'Viewer',        dot: '#94a3b8', text: 'text-slate-400',  bg: 'bg-slate-700/30',  border: 'border-slate-600/30' },
};
const getRoleConf = (role: string) =>
    ROLE_CONFIG[role] ?? { label: role, dot: '#94a3b8', text: 'text-slate-400', bg: 'bg-slate-700/30', border: 'border-slate-600/30' };

const AVATAR_PALETTES = [
    'from-violet-500 to-purple-700', 'from-sky-500 to-blue-700',
    'from-emerald-500 to-teal-700',  'from-rose-500 to-pink-700',
    'from-amber-400 to-orange-600',  'from-cyan-400 to-sky-600',
];
const avatarGradient = (name: string) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_PALETTES.length;
    return AVATAR_PALETTES[h];
};

// ─── Reusable atoms ───────────────────────────────────────────────────────────
const Avatar: React.FC<{ name: string; size?: 'xs' | 'sm' | 'md' | 'lg' }> = ({ name, size = 'md' }) => {
    const initials = name.substring(0, 2).toUpperCase();
    const grad = avatarGradient(name);
    const sz = { xs: 'w-8 h-8 text-xs rounded-xl', sm: 'w-9 h-9 text-sm rounded-xl', md: 'w-11 h-11 text-base rounded-2xl', lg: 'w-14 h-14 text-lg rounded-2xl' }[size];
    return (
        <div className={`${sz} bg-gradient-to-br ${grad} flex items-center justify-center font-bold text-white shadow-lg flex-shrink-0`}>
            {initials}
        </div>
    );
};

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
    const c = getRoleConf(role);
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${c.bg} border ${c.border} text-[10px] font-bold uppercase tracking-wider ${c.text} whitespace-nowrap`}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
            {c.label}
        </span>
    );
};

const StatusDot: React.FC<{ active: boolean }> = ({ active }) => (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
        active ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
               : 'bg-slate-700/40 border border-slate-600/30 text-slate-500'
    }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
        {active ? 'Active' : 'Inactive'}
    </span>
);

// ─── Form atoms ───────────────────────────────────────────────────────────────
const Field: React.FC<{
    label: string; icon?: React.ReactNode; type?: string; value: string;
    onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
    rightSlot?: React.ReactNode; className?: string; required?: boolean;
}> = ({ label, icon, type = 'text', value, onChange, placeholder, autoFocus, rightSlot, className = '', required }) => (
    <div className={`flex flex-col gap-1.5 ${className}`}>
        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
        </label>
        <div className="relative group">
            {icon && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors pointer-events-none">
                    {icon}
                </div>
            )}
            <input
                type={type} value={value} onChange={e => onChange(e.target.value)}
                placeholder={placeholder} autoFocus={autoFocus}
                className={`w-full bg-slate-800/60 border border-white/8 rounded-xl text-sm text-white placeholder-slate-600
                    focus:outline-none focus:border-blue-500/50 focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/10
                    transition-all py-3 sm:py-2.5 ${icon ? 'pl-9' : 'pl-3.5'} ${rightSlot ? 'pr-10' : 'pr-3.5'}`}
            />
            {rightSlot && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>}
        </div>
    </div>
);

const SelectField: React.FC<{
    label: string; value: string; onChange: (v: string) => void;
    options: { value: string; label: string }[]; className?: string;
}> = ({ label, value, onChange, options, className = '' }) => (
    <div className={`flex flex-col gap-1.5 ${className}`}>
        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</label>
        <div className="relative">
            <select value={value} onChange={e => onChange(e.target.value)}
                className="w-full appearance-none bg-slate-800/60 border border-white/8 rounded-xl text-sm text-white
                    focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10
                    transition-all py-3 sm:py-2.5 pl-3.5 pr-9 cursor-pointer">
                {options.map(o => <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>)}
            </select>
            <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
    </div>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; color?: string }> = ({
    label, checked, onChange, color = 'bg-blue-600'
}) => (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 group py-1">
        <div className={`w-10 h-5 rounded-full relative transition-all duration-200 flex-shrink-0 ${checked ? color : 'bg-slate-700'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${checked ? 'left-5' : 'left-0.5'}`} />
        </div>
        <span className="text-sm sm:text-xs font-semibold text-slate-400 group-hover:text-slate-200 transition-colors select-none text-left">{label}</span>
    </button>
);

const Alert: React.FC<{ type: 'error' | 'success'; message: string }> = ({ type, message }) => (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border mb-4 ${
        type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    }`}>
        {type === 'error' ? <ShieldAlert size={16} className="flex-shrink-0" /> : <Check size={16} className="flex-shrink-0" />}
        <span>{message}</span>
    </div>
);

// ─── Modal Shell (slide-up on mobile, centered on tablet+) ────────────────────
const ModalShell: React.FC<{ onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ onClose, children, wide }) =>
    ReactDOM.createPortal(
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            style={{ background: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
            onClick={onClose}
        >
            {/* Drag handle hint for mobile */}
            <div
                className={`
                    w-full ${wide ? 'sm:max-w-xl' : 'sm:max-w-lg'}
                    bg-slate-900 border border-white/10
                    rounded-t-3xl sm:rounded-2xl
                    shadow-2xl flex flex-col overflow-hidden
                    max-h-[92dvh] sm:max-h-[88vh]
                    animate-in fade-in slide-in-from-bottom-6 duration-300
                `}
                onClick={e => e.stopPropagation()}
            >
                {/* Mobile drag pill */}
                <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>
                {children}
            </div>
        </div>,
        document.body
    );

const ROLE_OPTIONS = [
    { value: 'user',          label: 'User — Standard Access' },
    { value: 'viewer',        label: 'Viewer — Read Only' },
    { value: 'admin',         label: 'Admin — Full Control' },
    { value: 'Administrator', label: 'Administrator — Legacy' },
    { value: 'Superadmin',    label: 'Superadmin — Critical' },
];

// ─── Add User Modal ───────────────────────────────────────────────────────────
const AddUserModal: React.FC<{ token: string; onClose: () => void; onSuccess: () => void }> = ({ token, onClose, onSuccess }) => {
    const [form, setForm] = useState<CreateUserData>({
        username: '', password: '', email: '', display_name: '', full_name: '', phone_number: '', role: 'user'
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPw, setShowPw] = useState(false);

    const set = (k: keyof CreateUserData) => (v: string) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async () => {
        if (!form.username || !form.password) { setError('Username and password are required'); return; }
        setSaving(true); setError(null);
        const result = await createUser(token, form);
        if (result.success) { onSuccess(); }
        else { setError(result.error || 'Failed to create user'); setSaving(false); }
    };

    return (
        <ModalShell onClose={onClose}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-white/8 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-500/15 rounded-xl flex items-center justify-center border border-blue-500/20">
                        <UserPlus size={17} className="text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">New User</h3>
                        <p className="text-[11px] text-slate-500 hidden sm:block">Create a new account</p>
                    </div>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all">
                    <X size={16} />
                </button>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
                {error && <Alert type="error" message={error} />}
                {/* 1-col on mobile, 2-col on sm+ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Username" icon={<AtSign size={14} />} value={form.username} onChange={set('username')}
                        placeholder="john_doe" autoFocus required />
                    <Field label="Password" icon={<Lock size={14} />} type={showPw ? 'text' : 'password'}
                        value={form.password} onChange={set('password')} placeholder="••••••••" required
                        rightSlot={
                            <button type="button" onClick={() => setShowPw(v => !v)} className="text-slate-500 hover:text-slate-300 transition-colors p-1 -mr-1">
                                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        } />
                    <Field label="Email" icon={<Mail size={14} />} type="email" value={form.email || ''}
                        onChange={set('email')} placeholder="john@company.com" />
                    <Field label="Phone" icon={<Phone size={14} />} type="tel" value={form.phone_number || ''}
                        onChange={set('phone_number')} placeholder="+66 8x xxx xxxx" />
                    <Field label="Display Name" value={form.display_name || ''} onChange={set('display_name')} placeholder="John D." />
                    <Field label="Full Name" value={form.full_name || ''} onChange={set('full_name')} placeholder="Johnathan Doe" />
                    <SelectField label="Role" value={form.role} onChange={set('role')} options={ROLE_OPTIONS} className="col-span-1 sm:col-span-2" />
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-5 sm:px-6 py-4 border-t border-white/8 flex-shrink-0">
                <button onClick={onClose}
                    className="flex-1 py-3 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/8 border border-white/8 text-sm font-semibold text-slate-400 hover:text-white transition-all">
                    Cancel
                </button>
                <button onClick={handleSubmit} disabled={saving}
                    className="flex-1 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                        text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98]">
                    {saving ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
                    {saving ? 'Creating…' : 'Create User'}
                </button>
            </div>
        </ModalShell>
    );
};

// ─── Edit User Modal ──────────────────────────────────────────────────────────
const EditUserModal: React.FC<{ token: string; user: User; onClose: () => void; onSuccess: () => void }> = ({
    token, user: editUser, onClose, onSuccess
}) => {
    const [form, setForm] = useState({
        email: editUser.email || '', display_name: editUser.display_name || '',
        full_name: editUser.full_name || '', phone_number: editUser.phone_number || '',
        role: editUser.role, is_active: editUser.is_active, is_verified: editUser.is_verified
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async () => {
        setSaving(true); setError(null);
        const result = await updateUser(token, editUser.id, form);
        if (result.success) { setSuccess(true); setTimeout(() => onSuccess(), 800); }
        else { setError(result.error || 'Update failed'); setSaving(false); }
    };

    const name = editUser.display_name || editUser.username;

    return (
        <ModalShell onClose={onClose} wide>
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-white/8 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={name} size="md" />
                    <div className="min-w-0">
                        <h3 className="text-base font-bold text-white truncate">{editUser.username}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <RoleBadge role={editUser.role} />
                            <span className="text-[10px] text-slate-600 font-mono">#{String(editUser.id).slice(0, 8)}</span>
                        </div>
                    </div>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all flex-shrink-0 ml-2">
                    <X size={16} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
                {error && <Alert type="error" message={error} />}
                {success && <Alert type="success" message="Changes saved successfully!" />}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Display Name" value={form.display_name}
                        onChange={v => setForm(f => ({ ...f, display_name: v }))} />
                    <Field label="Full Name" value={form.full_name}
                        onChange={v => setForm(f => ({ ...f, full_name: v }))} />
                    <Field label="Email" icon={<Mail size={14} />} type="email" value={form.email}
                        onChange={v => setForm(f => ({ ...f, email: v }))} />
                    <Field label="Phone" icon={<Phone size={14} />} value={form.phone_number}
                        onChange={v => setForm(f => ({ ...f, phone_number: v }))} />
                    <SelectField label="Role" value={form.role}
                        onChange={v => setForm(f => ({ ...f, role: v as any }))}
                        options={ROLE_OPTIONS} className="col-span-1 sm:col-span-2" />
                </div>
                {/* Toggles — stack vertically on mobile */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 pt-4 border-t border-white/6">
                    <Toggle label="Account Active" checked={form.is_active}
                        onChange={v => setForm(f => ({ ...f, is_active: v }))} color="bg-emerald-600" />
                    <Toggle label="Verified Identity" checked={form.is_verified}
                        onChange={v => setForm(f => ({ ...f, is_verified: v }))} color="bg-blue-600" />
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-5 sm:px-6 py-4 border-t border-white/8 flex-shrink-0">
                <button onClick={onClose}
                    className="flex-1 py-3 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/8 border border-white/8 text-sm font-semibold text-slate-400 hover:text-white transition-all">
                    Cancel
                </button>
                <button onClick={handleSubmit} disabled={saving || success}
                    className="flex-1 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                        text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98]">
                    {saving ? <RefreshCw size={15} className="animate-spin" /> : success ? <Check size={15} /> : <Save size={15} />}
                    {saving ? 'Saving…' : success ? 'Saved!' : 'Save Changes'}
                </button>
            </div>
        </ModalShell>
    );
};

// ─── Reset Password Modal ─────────────────────────────────────────────────────
const ResetPasswordModal: React.FC<{ token: string; user: User; onClose: () => void; onSuccess: () => void }> = ({
    token, user, onClose, onSuccess
}) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const getStrength = (pw: string) => {
        if (!pw) return { score: 0, label: '', color: '' };
        let score = 0;
        if (pw.length >= 8) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        return { score, ...[{ label: 'Too weak', color: '#ef4444' }, { label: 'Weak', color: '#f97316' }, { label: 'Fair', color: '#eab308' }, { label: 'Good', color: '#3b82f6' }, { label: 'Strong', color: '#10b981' }][score] };
    };
    const strength = getStrength(newPassword);
    const isMatch = newPassword && confirmPassword && newPassword === confirmPassword;
    const mismatch = confirmPassword && newPassword !== confirmPassword;

    const handleSubmit = async () => {
        if (newPassword.length < 6) { setError('Minimum 6 characters required'); return; }
        if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
        setSaving(true); setError(null);
        const result = await resetUserPassword(token, user.id, newPassword);
        if (result.success) { setSuccess(true); setTimeout(() => onSuccess(), 1200); }
        else { setError(result.error || 'Reset failed'); setSaving(false); }
    };

    const name = user.display_name || user.username;

    return (
        <ModalShell onClose={onClose}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-white/8 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <Avatar name={name} size="sm" />
                    <div>
                        <h3 className="text-base font-bold text-white">Reset Password</h3>
                        <p className="text-[11px] text-amber-500 font-semibold">@{user.username}</p>
                    </div>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all">
                    <X size={16} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
                {error && <Alert type="error" message={error} />}
                {success && <Alert type="success" message="Password reset successfully!" />}

                <Field label="New Password" icon={<Lock size={14} />} type={showNew ? 'text' : 'password'}
                    value={newPassword} onChange={setNewPassword} placeholder="Min. 8 characters" autoFocus
                    rightSlot={
                        <button type="button" onClick={() => setShowNew(v => !v)} className="text-slate-500 hover:text-slate-300 transition-colors p-1 -mr-1">
                            {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    } />

                {newPassword && (
                    <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-1.5 flex-1 rounded-full transition-all duration-300"
                                    style={{ background: i <= strength.score ? strength.color : 'rgba(255,255,255,0.08)' }} />
                            ))}
                        </div>
                        <p className="text-[11px] font-semibold" style={{ color: strength.color }}>{strength.label}</p>
                    </div>
                )}

                <Field label="Confirm Password" icon={<Lock size={14} />} type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter password"
                    rightSlot={
                        <button type="button" onClick={() => setShowConfirm(v => !v)} className="text-slate-500 hover:text-slate-300 transition-colors p-1 -mr-1">
                            {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    } />
                {mismatch && <p className="text-[11px] font-semibold text-rose-400 flex items-center gap-1.5"><X size={11} />Passwords don't match</p>}
                {isMatch  && <p className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5"><Check size={11} />Passwords match</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-5 sm:px-6 py-4 border-t border-white/8 flex-shrink-0">
                <button onClick={onClose}
                    className="flex-1 py-3 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/8 border border-white/8 text-sm font-semibold text-slate-400 hover:text-white transition-all">
                    Cancel
                </button>
                <button onClick={handleSubmit} disabled={saving || success || !newPassword || !confirmPassword}
                    className="flex-1 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400
                        text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
                    {saving ? <RefreshCw size={15} className="animate-spin" /> : success ? <Check size={15} /> : <Key size={15} />}
                    {saving ? 'Resetting…' : success ? 'Done!' : 'Reset Password'}
                </button>
            </div>
        </ModalShell>
    );
};

// ─── User Card (mobile) ───────────────────────────────────────────────────────
const UserCard: React.FC<{
    user: User;
    currentUserId: any;
    onEdit: () => void;
    onResetPw: () => void;
    onVerify: () => void;
    onDelete: () => void;
}> = ({ user, currentUserId, onEdit, onResetPw, onVerify, onDelete }) => {
    const [open, setOpen] = useState(false);
    const name = user.display_name || user.username;

    return (
        <div className={`relative bg-slate-800/50 border border-white/8 rounded-2xl p-4 transition-all ${!user.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-3">
                <Avatar name={name} size="md" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{user.username}</p>
                            {(user.display_name || user.full_name) && (
                                <p className="text-[11px] text-slate-500 truncate">{user.display_name || user.full_name}</p>
                            )}
                        </div>
                        {/* ⋮ Menu trigger */}
                        <button
                            onClick={() => setOpen(v => !v)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/8 text-slate-500 hover:text-white transition-all flex-shrink-0"
                        >
                            <MoreVertical size={15} />
                        </button>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        <RoleBadge role={user.role} />
                        <StatusDot active={user.is_active} />
                        {user.is_verified && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400">
                                <BadgeCheck size={10} /> Verified
                            </span>
                        )}
                    </div>

                    {/* Contact */}
                    {(user.email || user.phone_number) && (
                        <div className="mt-2 space-y-0.5">
                            {user.email && (
                                <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                    <Mail size={10} className="text-slate-600 flex-shrink-0" />{user.email}
                                </p>
                            )}
                            {user.phone_number && (
                                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                    <Phone size={10} className="flex-shrink-0" />{user.phone_number}
                                </p>
                            )}
                        </div>
                    )}

                    <p className="text-[10px] text-slate-600 flex items-center gap-1 mt-2">
                        <Calendar size={9} /> {new Date(user.created_at).toLocaleDateString()}
                    </p>
                </div>
            </div>

            {/* Inline action strip — always visible on mobile */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/6">
                <button onClick={onEdit}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] font-bold text-blue-400 active:opacity-70 transition-all">
                    <Edit2 size={12} /> Edit
                </button>
                <button onClick={onResetPw}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] font-bold text-amber-400 active:opacity-70 transition-all">
                    <Key size={12} /> Password
                </button>
                {!user.is_verified && (
                    <button onClick={onVerify}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-bold text-emerald-400 active:opacity-70 transition-all">
                        <Check size={12} /> Verify
                    </button>
                )}
                {user.id !== currentUserId && (
                    <button onClick={onDelete}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 active:opacity-70 transition-all">
                        <Trash2 size={13} />
                    </button>
                )}
            </div>
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const UserManagementPage: React.FC = () => {
    const { user: currentUser, token } = useAuth();
    const { t } = useLanguage();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
    const [includeInactive, setIncludeInactive] = useState(false);

    const loadUsers = useCallback(async () => {
        if (!token) return;
        setLoading(true); setError(null);
        const result = await getAllUsers(token, { includeInactive });
        if (result.success && result.data) setUsers(result.data);
        else setError(result.error || 'Failed to load users');
        setLoading(false);
    }, [token, includeInactive]);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const handleDelete = async (user: User) => {
        if (!token) return;
        if (!window.confirm(`Delete "${user.username}"?`)) return;
        const result = await deleteUser(token, user.id);
        if (result.success) loadUsers();
        else alert(result.error || 'Failed to delete user');
    };

    const handleVerify = async (user: User) => {
        if (!token) return;
        const result = await verifyUser(token, user.id);
        if (result.success) loadUsers();
        else alert(result.error || 'Failed to verify user');
    };

    const hasAdminAccess = currentUser && ['admin', 'Administrator', 'Superadmin', 'superadmin'].includes(currentUser.role as string);

    if (!hasAdminAccess || !currentUser) {
        return (
            <div className="min-h-screen flex items-center justify-center p-5">
                <div className="max-w-sm w-full bg-slate-900 border border-white/10 rounded-2xl p-8 sm:p-10 text-center">
                    <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
                        <ShieldAlert size={26} className="text-rose-500" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
                    <p className="text-slate-400 text-sm mb-6">You need administrator privileges to manage users.</p>
                    <button onClick={() => window.location.href = '/'}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-sm font-bold text-white active:scale-[0.98] transition-all">
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const sharedActionProps = (user: User) => ({
        onEdit:    () => setEditingUser(user),
        onResetPw: () => setResetPasswordUser(user),
        onVerify:  () => handleVerify(user),
        onDelete:  () => handleDelete(user),
    });

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8 space-y-5">

            {/* ── Header ── */}
            <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2.5 mb-0.5">
                        <div className="w-8 h-8 bg-blue-500/15 border border-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Users size={15} className="text-blue-400" />
                        </div>
                        <h1 className="text-lg sm:text-xl font-bold text-white">User Management</h1>
                    </div>
                    <p className="text-xs text-slate-500 ml-10">Configure roles, status, and credentials.</p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Inactive toggle */}
                    <button onClick={() => setIncludeInactive(v => !v)}
                        className={`flex items-center gap-2 h-9 px-3 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap ${
                            includeInactive ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-white/5 border-white/8 text-slate-400 hover:text-white'
                        }`}>
                        <Filter size={13} />
                        <span className="hidden sm:inline">Show Inactive</span>
                        <div className={`w-7 h-3.5 rounded-full relative transition-colors ${includeInactive ? 'bg-blue-600' : 'bg-slate-700'}`}>
                            <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${includeInactive ? 'left-3.5' : 'left-0.5'}`} />
                        </div>
                    </button>

                    {/* Refresh */}
                    <button onClick={loadUsers}
                        className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/8 text-slate-400 hover:text-white transition-all active:scale-95">
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>

                    {/* Add User */}
                    <button onClick={() => setShowAddModal(true)}
                        className="h-9 px-4 flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                            text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all active:scale-[0.97] whitespace-nowrap">
                        <UserPlus size={15} />
                        <span>Add User</span>
                    </button>
                </div>
            </div>

            {/* ── Error ── */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-400">
                    <ShieldAlert size={16} className="flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* ── Loading / Empty ── */}
            {loading && users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <RefreshCw size={28} className="animate-spin text-blue-500 opacity-40" />
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">Loading users…</p>
                </div>
            ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 bg-slate-900/60 border border-white/8 rounded-2xl">
                    <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center">
                        <Users size={22} className="text-slate-600" />
                    </div>
                    <p className="text-sm font-semibold text-slate-400">No users found</p>
                    <p className="text-xs text-slate-600 text-center px-4">Try enabling "Show Inactive" to see all accounts.</p>
                </div>
            ) : (
                <>
                    {/* ── Mobile / Tablet Card List (< md) ── */}
                    <div className="md:hidden space-y-3">
                        {users.map(user => (
                            <UserCard
                                key={user.id}
                                user={user}
                                currentUserId={currentUser.id}
                                {...sharedActionProps(user)}
                            />
                        ))}
                        <p className="text-center text-[11px] text-slate-600 pt-1">{users.length} user{users.length !== 1 ? 's' : ''} total</p>
                    </div>

                    {/* ── Desktop Table (md+) ── */}
                    <div className="hidden md:block bg-slate-900/60 border border-white/8 rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-white/6">
                                        {['User', 'Contact', 'Role', 'Status', 'Joined', ''].map((h, i) => (
                                            <th key={i} className={`px-5 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500 whitespace-nowrap ${i === 5 ? 'text-right' : 'text-left'}`}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/4">
                                    {users.map(user => (
                                        <tr key={user.id}
                                            className={`group transition-colors hover:bg-white/[0.025] ${!user.is_active ? 'opacity-50' : ''}`}>

                                            {/* User */}
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={user.display_name || user.username} size="sm" />
                                                    <div>
                                                        <p className="text-sm font-semibold text-white leading-tight">{user.username}</p>
                                                        <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{user.display_name || user.full_name || '—'}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Contact */}
                                            <td className="px-5 py-3.5 max-w-[200px]">
                                                <div className="space-y-0.5">
                                                    {user.email && (
                                                        <p className="text-xs text-slate-300 flex items-center gap-1.5 truncate">
                                                            <Mail size={11} className="text-slate-600 flex-shrink-0" />{user.email}
                                                        </p>
                                                    )}
                                                    {user.phone_number && (
                                                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                                            <Phone size={10} className="flex-shrink-0" />{user.phone_number}
                                                        </p>
                                                    )}
                                                    {!user.email && !user.phone_number && <span className="text-slate-700 text-xs">—</span>}
                                                </div>
                                            </td>

                                            {/* Role */}
                                            <td className="px-5 py-3.5"><RoleBadge role={user.role} /></td>

                                            {/* Status */}
                                            <td className="px-5 py-3.5">
                                                <div className="flex flex-wrap gap-1.5">
                                                    <StatusDot active={user.is_active} />
                                                    {user.is_verified && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400">
                                                            <BadgeCheck size={10} />Verified
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Date */}
                                            <td className="px-5 py-3.5">
                                                <span className="text-xs text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
                                                    <Calendar size={11} className="text-slate-700" />
                                                    {new Date(user.created_at).toLocaleDateString()}
                                                </span>
                                            </td>

                                            {/* Actions — visible on hover (desktop has hover) */}
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <DeskActionBtn icon={<Edit2 size={13} />} label="Edit" onClick={() => setEditingUser(user)}
                                                        cls="hover:bg-blue-500/15 hover:text-blue-400 hover:border-blue-500/20" />
                                                    <DeskActionBtn icon={<Key size={13} />} label="Reset Password" onClick={() => setResetPasswordUser(user)}
                                                        cls="hover:bg-amber-500/15 hover:text-amber-400 hover:border-amber-500/20" />
                                                    {!user.is_verified && (
                                                        <DeskActionBtn icon={<Check size={13} />} label="Verify" onClick={() => handleVerify(user)}
                                                            cls="hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-500/20" />
                                                    )}
                                                    {user.id !== currentUser.id && (
                                                        <DeskActionBtn icon={<Trash2 size={13} />} label="Delete" onClick={() => handleDelete(user)}
                                                            cls="hover:bg-rose-500/15 hover:text-rose-400 hover:border-rose-500/20" />
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="px-5 py-3 border-t border-white/6 flex items-center justify-between">
                                <p className="text-[11px] text-slate-600">{users.length} user{users.length !== 1 ? 's' : ''} total</p>
                                {loading && <RefreshCw size={12} className="animate-spin text-slate-600" />}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ── Modals ── */}
            {showAddModal && (
                <AddUserModal token={token!} onClose={() => setShowAddModal(false)}
                    onSuccess={() => { setShowAddModal(false); loadUsers(); }} />
            )}
            {editingUser && (
                <EditUserModal token={token!} user={editingUser} onClose={() => setEditingUser(null)}
                    onSuccess={() => { setEditingUser(null); loadUsers(); }} />
            )}
            {resetPasswordUser && (
                <ResetPasswordModal token={token!} user={resetPasswordUser} onClose={() => setResetPasswordUser(null)}
                    onSuccess={() => setResetPasswordUser(null)} />
            )}
        </div>
    );
};

// Desktop-only action button (hover reveal)
const DeskActionBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; cls?: string }> = ({ icon, label, onClick, cls = '' }) => (
    <button onClick={onClick} title={label}
        className={`w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/8 text-slate-500 transition-all ${cls}`}>
        {icon}
    </button>
    
);

export default UserManagementPage;