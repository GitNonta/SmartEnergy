import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LogOut, User as UserIcon, Users, Settings } from 'lucide-react';
import ProfileModal from './ProfileModal';

interface UserMenuDropdownProps {
    className?: string;
    onNavigate?: (path: string) => void;
    dropUp?: boolean;
    onProfileOpenChange?: (isOpen: boolean) => void;
    isActive?: boolean;
}

const UserMenuDropdown: React.FC<UserMenuDropdownProps> = ({ className = '', onNavigate, dropUp = false, onProfileOpenChange, isActive = false }) => {
    const { user, logout, isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Notify parent about modal state changes
    useEffect(() => {
        if (onProfileOpenChange) {
            onProfileOpenChange(showProfileModal);
        }
    }, [showProfileModal, onProfileOpenChange]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!isAuthenticated || !user) {
        return null;
    }

    const initials = user.displayName
        ? user.displayName.substring(0, 2).toUpperCase()
        : user.username.substring(0, 2).toUpperCase();

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
        if (onNavigate) {
            onNavigate('/admin/users');
        } else {
            // Fallback: use window.location
            window.location.href = '/admin/users';
        }
    };

    return (
        <>
            <div
                className={`relative ${className} ${dropUp ? `mobile-nav-item ${showProfileModal || isActive ? 'active' : ''}` : ''}`}
                ref={dropdownRef}
            >
                {/* Avatar Button */}
                <button
                    onClick={() => dropUp ? setShowProfileModal(true) : setIsOpen(!isOpen)}
                    className={dropUp
                        ? "flex items-center justify-center gap-2 w-full h-full bg-transparent border-none p-0 cursor-pointer text-inherit"
                        : "ml-1 w-8 h-8 rounded-full bg-white/20 border border-white/40 flex items-center justify-center text-xs font-bold shadow-sm text-white hover:bg-white/30 transition-colors"
                    }
                >
                    {dropUp ? (
                        <>
                            <UserIcon className="nav-icon" />
                            {showProfileModal && <span className="nav-label">{t('auth.profile')}</span>}
                        </>
                    ) : (
                        initials
                    )}
                </button>

                {/* Dropdown Menu */}
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Menu */}
                        <div className={`absolute right-0 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl ring-1 ring-black/5 z-50 overflow-hidden ${dropUp ? 'bottom-full mb-2' : 'mt-2'}`}>
                            {/* User Info */}
                            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold">
                                        {initials}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                                            {user.displayName || user.username}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {user.role === 'admin' ? t('auth.admin') : t('auth.user')}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Menu Items */}
                            <div className="py-1">
                                <button
                                    onClick={handleProfileClick}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <UserIcon className="w-4 h-4" />
                                    {t('auth.profile')}
                                </button>


                                {/* Admin Only: Manage Users */}
                                {user.role === 'admin' && (
                                    <button
                                        onClick={handleManageUsersClick}
                                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <Users className="w-4 h-4" />
                                        Manage Users
                                    </button>
                                )}

                                {/* Superadmin/Administrator: Grafana Access */}
                                {((user.role as any) === 'superadmin' || (user.role as any) === 'Administrator' || (user.role as any) === 'Superadmin') && (
                                    <a
                                        href="http://localhost:3002/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
                                    >
                                        <Settings className="w-4 h-4" />
                                        Advanced Dashboard
                                    </a>
                                )}

                                <hr className="my-1 border-gray-100 dark:border-gray-700" />

                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    {t('auth.logout')}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Profile Modal */}
            <ProfileModal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
            />
        </>
    );
};

export default UserMenuDropdown;
