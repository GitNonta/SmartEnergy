import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
    LogOut, User as UserIcon, Users, ChevronRight,
    Activity, ShieldCheck, X, ExternalLink
} from 'lucide-react';
import ProfileModal from './ProfileModal';

interface UserMenuDropdownProps {
    className?: string;
    onNavigate?: (path: string) => void;
    dropUp?: boolean;
    onProfileOpenChange?: (isOpen: boolean) => void;
    isActive?: boolean;
}

// ─── Hook: detect mobile (< 768px) ───────────────────────────────────────────
const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < 768 : false
    );
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    return isMobile;
};

// ─── Role helpers ─────────────────────────────────────────────────────────────
const getRoleGradient = (role: string) => {
    const r = role?.toLowerCase() || '';
    if (r.includes('super')) return 'from-rose-500 to-pink-600';
    if (r.includes('admin')) return 'from-violet-500 to-indigo-600';
    return 'from-sky-500 to-blue-600';
};

const getRoleGlow = (role: string) => {
    const r = role?.toLowerCase() || '';
    if (r.includes('super')) return 'shadow-rose-500/30';
    if (r.includes('admin')) return 'shadow-violet-500/30';
    return 'shadow-blue-500/30';
};

const getRoleAccent = (role: string) => {
    const r = role?.toLowerCase() || '';
    if (r.includes('super')) return 'bg-rose-500/15 border-rose-500/25 text-rose-300';
    if (r.includes('admin')) return 'bg-violet-500/15 border-violet-500/25 text-violet-300';
    return 'bg-sky-500/15 border-sky-500/25 text-sky-300';
};

// ─── Menu item atoms ──────────────────────────────────────────────────────────
interface MenuItemProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    href?: string;
    iconBg?: string;
    textColor?: string;
    hoverBg?: string;
    rightIcon?: React.ReactNode;
    isMobile?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({
    icon, label, onClick, href,
    iconBg = 'bg-white/5 group-hover:bg-white/10',
    textColor = 'text-slate-300 hover:text-white',
    hoverBg = 'hover:bg-white/5',
    rightIcon,
    isMobile = false,
}) => {
    const cls = `group w-full flex items-center gap-3.5 px-4 ${isMobile ? 'py-4' : 'py-3'} 
        rounded-2xl text-xs font-bold ${textColor} ${hoverBg}
        transition-all duration-200 active:scale-[0.98]`;

    const inner = (
        <>
            <div className={`p-2 rounded-xl ${iconBg} transition-colors flex-shrink-0`}>
                {icon}
            </div>
            <span className="flex-1 text-left">{label}</span>
            {rightIcon && (
                <span className="opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all flex-shrink-0">
                    {rightIcon}
                </span>
            )}
        </>
    );

    if (href) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                {inner}
            </a>
        );
    }
    return <button onClick={onClick} className={cls}>{inner}</button>;
};

// ─── Shared menu content ──────────────────────────────────────────────────────
interface MenuContentProps {
    user: any;
    t: (key: string) => string;
    isMobile: boolean;
    onProfile: () => void;
    onManageUsers: () => void;
    onLogout: () => void;
    onClose?: () => void;
}

const MenuContent: React.FC<MenuContentProps> = ({
    user, t, isMobile, onProfile, onManageUsers, onLogout, onClose
}) => {
    const initials = (user.displayName || user.username).substring(0, 2).toUpperCase();
    const displayName = user.displayName || user.username;
    const isAdmin = ['admin', 'Administrator', 'Superadmin', 'superadmin'].includes(user.role);
    const isSuperAdmin = ['superadmin', 'Administrator', 'Superadmin'].includes(user.role);

    return (
        <>
            {/* ── Header / User Info ── */}
            <div className="relative px-5 pt-5 pb-4 overflow-hidden">
                {/* Top shimmer line */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

                {isMobile && onClose && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                    >
                        <X size={15} />
                    </button>
                )}

                <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className={`
                        ${isMobile ? 'w-14 h-14 text-base' : 'w-12 h-12 text-sm'}
                        rounded-2xl bg-gradient-to-br ${getRoleGradient(user.role)}
                        flex items-center justify-center text-white font-black
                        shadow-xl ${getRoleGlow(user.role)} ring-2 ring-white/10 flex-shrink-0
                    `}>
                        {initials}
                    </div>

                    <div className="min-w-0 flex-1 pr-8">
                        <p className="font-black text-white text-sm tracking-tight truncate">
                            {displayName}
                        </p>
                        {user.email && (
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{user.email}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${getRoleAccent(user.role)}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                                {user.role}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Online
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Divider ── */}
            <div className="h-px bg-white/6 mx-4 mb-1" />

            {/* ── Menu Items ── */}
            <div className={`px-3 ${isMobile ? 'pb-6 space-y-1' : 'pb-3 space-y-0.5'}`}>
                <MenuItem
                    icon={<UserIcon size={14} />}
                    label={t('auth.profile')}
                    onClick={onProfile}
                    iconBg="bg-white/5 group-hover:bg-blue-500/20 group-hover:text-blue-400"
                    textColor="text-slate-300 hover:text-white"
                    rightIcon={<ChevronRight size={13} />}
                    isMobile={isMobile}
                />

                {isAdmin && (
                    <MenuItem
                        icon={<Users size={14} />}
                        label="Manage Users"
                        onClick={onManageUsers}
                        iconBg="bg-white/5 group-hover:bg-violet-500/20 group-hover:text-violet-400"
                        textColor="text-slate-300 hover:text-white"
                        rightIcon={<ChevronRight size={13} />}
                        isMobile={isMobile}
                    />
                )}

                {isSuperAdmin && (
                    <MenuItem
                        icon={<Activity size={14} />}
                        label="Advanced Panel"
                        href="http://localhost:3002/"
                        iconBg="bg-amber-400/10 group-hover:bg-amber-400/20 text-amber-400"
                        textColor="text-amber-400 hover:text-amber-300"
                        hoverBg="hover:bg-amber-400/5"
                        rightIcon={<ExternalLink size={12} />}
                        isMobile={isMobile}
                    />
                )}

                <div className="h-px bg-white/5 mx-3 my-2" />

                <MenuItem
                    icon={<LogOut size={14} />}
                    label={t('auth.logout')}
                    onClick={onLogout}
                    iconBg="bg-rose-400/10 group-hover:bg-rose-400/20 text-rose-400"
                    textColor="text-rose-400 hover:text-rose-300"
                    hoverBg="hover:bg-rose-400/5"
                    isMobile={isMobile}
                />
            </div>
        </>
    );
};

// ─── Bottom Sheet (mobile portal) ────────────────────────────────────────────
const BottomSheet: React.FC<{
    onClose: () => void;
    children: React.ReactNode;
}> = ({ onClose, children }) =>
    ReactDOM.createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-end justify-center"
            style={{
                background: 'rgba(2,6,23,0.82)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
            }}
            onClick={onClose}
        >
            <div
                className="w-full max-w-lg bg-slate-900 border border-white/10 border-b-0
                    rounded-t-3xl shadow-2xl overflow-hidden
                    animate-in fade-in slide-in-from-bottom-4 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Drag pill */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>
                {children}
                {/* Safe area spacer for iOS */}
                <div className="h-safe-area-inset-bottom pb-2" />
            </div>
        </div>,
        document.body
    );

// ─── Main Component ───────────────────────────────────────────────────────────
const UserMenuDropdown: React.FC<UserMenuDropdownProps> = ({
    className = '',
    onNavigate,
    dropUp = false,
    onProfileOpenChange,
    isActive = false,
}) => {
    const { user, logout, isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const isMobile = useIsMobile();

    // Lock body scroll when bottom sheet open on mobile
    useEffect(() => {
        if (isMobile && isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isMobile, isOpen]);

    // Notify parent about profile modal state
    useEffect(() => {
        onProfileOpenChange?.(showProfileModal);
    }, [showProfileModal, onProfileOpenChange]);

    // Close dropdown on outside click (desktop only)
    useEffect(() => {
        if (isMobile) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isMobile]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    if (!isAuthenticated || !user) return null;

    const initials = (user.displayName || user.username).substring(0, 2).toUpperCase();

    const handleClose = useCallback(() => setIsOpen(false), []);

    const handleLogout = async () => {
        setIsOpen(false);
        await logout();
    };

    const handleProfileClick = () => {
        setIsOpen(false);
        setShowProfileModal(true);
    };

    const handleManageUsersClick = () => {
        setIsOpen(false);
        if (onNavigate) onNavigate('/admin/users');
        else window.location.href = '/admin/users';
    };

    const menuContentProps: Omit<MenuContentProps, 'isMobile'> = {
        user,
        t,
        onProfile: handleProfileClick,
        onManageUsers: handleManageUsersClick,
        onLogout: handleLogout,
    };

    // ── dropUp mode = mobile bottom nav: tap opens profile directly ───────────
    if (dropUp) {
        return (
            <>
                <div
                    className={`relative ${className} mobile-nav-item ${showProfileModal || isActive ? 'active' : ''}`}
                    ref={dropdownRef}
                >
                    <button
                        onClick={() => setIsOpen(true)}
                        className="flex flex-col items-center justify-center gap-1 w-full h-full bg-transparent border-none p-0 cursor-pointer text-inherit"
                        aria-label="User menu"
                    >
                        {/* Small avatar in nav bar */}
                        <div className={`
                            w-7 h-7 rounded-xl bg-gradient-to-br ${getRoleGradient(user.role)}
                            flex items-center justify-center text-[10px] font-black text-white
                            ring-2 ${isOpen || isActive ? 'ring-white/30' : 'ring-white/10'} transition-all
                        `}>
                            {initials}
                        </div>
                        <span className="nav-label text-[10px]">{t('auth.profile')}</span>
                    </button>

                    {/* Mobile: bottom sheet */}
                    {isOpen && isMobile && (
                        <BottomSheet onClose={handleClose}>
                            <MenuContent {...menuContentProps} isMobile={true} onClose={handleClose} />
                        </BottomSheet>
                    )}

                    {/* Tablet dropUp: floating panel above */}
                    {isOpen && !isMobile && (
                        <div className="absolute bottom-full right-0 mb-3 w-72
                            bg-slate-900/60 backdrop-blur-3xl border border-white/10
                            rounded-3xl shadow-[0_-10px_50px_rgba(0,0,0,0.6)] z-50 overflow-hidden
                            animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-250">
                            <MenuContent {...menuContentProps} isMobile={false} onClose={handleClose} />
                        </div>
                    )}
                </div>

                <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
            </>
        );
    }

    // ── Default mode = top navbar avatar button ───────────────────────────────
    return (
        <>
            <div className={`relative ${className}`} ref={dropdownRef}>

                {/* Avatar trigger button */}
                <button
                    onClick={() => setIsOpen(v => !v)}
                    aria-label="Open user menu"
                    aria-expanded={isOpen}
                    className={`
                        group ml-1 p-1 rounded-2xl border transition-all duration-200
                        ${isOpen
                            ? 'bg-white/10 border-white/20'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                        }
                    `}
                >
                    <div className={`
                        w-8 h-8 rounded-[0.7rem]
                        bg-gradient-to-br ${getRoleGradient(user.role)}
                        flex items-center justify-center
                        text-[10px] font-black tracking-tighter text-white
                        shadow-lg ${getRoleGlow(user.role)}
                        group-hover:scale-105 ${isOpen ? 'scale-105' : ''}
                        transition-transform duration-200
                    `}>
                        {initials}
                    </div>
                </button>

                {/* ── Desktop dropdown (md+) ── */}
                {isOpen && !isMobile && (
                    <div className={`
                        absolute right-0 w-72
                        bg-slate-900/50 backdrop-blur-3xl border border-white/10
                        rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6)]
                        z-50 overflow-hidden
                        animate-in fade-in zoom-in-95 duration-200
                        ${dropUp ? 'bottom-full mb-3' : 'top-full mt-3'}
                    `}
                        /* Keep right-0 but clamp to viewport */
                        style={{ maxWidth: 'calc(100vw - 1rem)' }}
                    >
                        <MenuContent {...menuContentProps} isMobile={false} onClose={handleClose} />
                    </div>
                )}

                {/* ── Mobile bottom sheet ── */}
                {isOpen && isMobile && (
                    <BottomSheet onClose={handleClose}>
                        <MenuContent {...menuContentProps} isMobile={true} onClose={handleClose} />
                    </BottomSheet>
                )}
            </div>

            <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
        </>
    );
};

export default UserMenuDropdown;