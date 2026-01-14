import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getMyProfile, updateMyProfile, changeMyPassword, User } from '../services/userService';
import { X, Save, User as UserIcon, Mail, Phone, Lock, Check } from 'lucide-react';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
    const { token, logout, user } = useAuth(); // Added logout/user
    const { t } = useLanguage();
    const location = useLocation(); // Track route changes

    const [profile, setProfile] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Close modal when location changes
    useEffect(() => {
        if (isOpen) {
            onClose();
        }
    }, [location.pathname]);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // View Mode: 'main', 'edit', 'password'
    const [viewMode, setViewMode] = useState<'main' | 'edit' | 'password'>('main');

    // Form states
    const [displayName, setDisplayName] = useState('');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Load profile data
    useEffect(() => {
        if (isOpen && token) {
            loadProfile();
            setViewMode('main'); // Reset to main view on open
        }
    }, [isOpen, token]);

    // Handle Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const loadProfile = async () => {
        if (!token) return;
        setLoading(true);
        setError(null);

        const result = await getMyProfile(token);
        if (result.success && result.data) {
            setProfile(result.data);
            setDisplayName(result.data.display_name || '');
            setFullName(result.data.full_name || '');
            setEmail(result.data.email || '');
            setPhoneNumber(result.data.phone_number || '');
        } else {
            setError(result.error || 'Failed to load profile');
        }
        setLoading(false);
    };

    const handleSaveProfile = async () => {
        if (!token) return;
        setSaving(true);
        setError(null);
        setSuccess(null);

        const result = await updateMyProfile(token, {
            display_name: displayName,
            full_name: fullName,
            email: email || undefined,
            phone_number: phoneNumber || undefined,
        });

        if (result.success) {
            setSuccess('Profile updated successfully');
            setProfile(result.data || null);
            setTimeout(() => {
                setSuccess(null);
                setViewMode('main'); // Go back to main after save
            }, 1000);
        } else {
            setError(result.error || 'Failed to update profile');
        }
        setSaving(false);
    };

    const handleChangePassword = async () => {
        if (!token) return;
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        const result = await changeMyPassword(token, newPassword);
        if (result.success) {
            setSuccess('Password changed successfully');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => {
                setSuccess(null);
                setViewMode('main');
            }, 1000);
        } else {
            setError(result.error || 'Failed to change password');
        }
        setSaving(false);
    };

    if (!isOpen) return null;

    const initials = profile?.display_name
        ? profile.display_name.substring(0, 2).toUpperCase()
        : profile?.username?.substring(0, 2).toUpperCase() || 'U';

    const renderHeader = () => (
        <div className="profile-modal-header">
            {viewMode === 'main' ? (
                <>
                    <button className="close-btn invisible"><X size={20} /></button>
                    <h2>{t('auth.profile')}</h2>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </>
            ) : (
                <>
                    <button className="back-btn" onClick={() => setViewMode('main')}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <h2>{viewMode === 'edit' ? 'Edit Profile' : 'Change Password'}</h2>
                    <div style={{ width: 24 }}></div> {/* Spacer */}
                </>
            )}
        </div>
    );

    const renderMainView = () => (
        <div className="profile-main-view">
            <div className="profile-avatar-section">
                <div className="profile-avatar-large">
                    {initials}
                    <button className="edit-avatar-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    </button>
                </div>
                <h3>{profile?.display_name || profile?.username}</h3>
                <p className="profile-email">{profile?.email || `@${profile?.username}`}</p>

                <button className="btn-edit-profile-main" onClick={() => setViewMode('edit')}>
                    Edit Profile
                </button>
            </div>

            <div className="profile-menu-list">
                <div className="menu-item" onClick={() => setViewMode('password')}>
                    <div className="menu-icon"><Lock size={20} /></div>
                    <span>Change Password</span>
                    <div className="menu-chevron"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></div>
                </div>

                {/* Admin Only: Manage Users - Placeholder or Route */}
                {user?.role === 'admin' && (
                    <div className="menu-item" onClick={() => window.location.href = '/admin/users'}>
                        <div className="menu-icon"><UserIcon size={20} /></div>
                        <span>User Management</span>
                        <div className="menu-chevron"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></div>
                    </div>
                )}

                <div className="menu-item">
                    <div className="menu-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg></div>
                    <span>Information</span>
                    <div className="menu-chevron"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></div>
                </div>

                <div className="menu-item logout" onClick={logout}>
                    <div className="menu-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg></div>
                    <span>Log out</span>
                    <div className="menu-chevron"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></div>
                </div>
            </div>
        </div>
    );

    const renderEditView = () => (
        <div className="profile-edit-view form-section">
            <div className="profile-avatar-section small">
                <div className="profile-avatar-large small">
                    {initials}
                    <button className="edit-avatar-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    </button>
                </div>
            </div>

            <div className="form-group">
                <label>Name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Shamim Hossain" />
            </div>
            <div className="form-group">
                <label>Email Address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="yourmail@gmail.com" />
            </div>
            <div className="form-group">
                <label>Username</label>
                <input type="text" value={profile?.username || ''} disabled className="disabled" />
            </div>
            <div className="form-group">
                <label>Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>

            <button className="btn-save mt-4" onClick={handleSaveProfile} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
    );

    const renderPasswordView = () => (
        <div className="profile-edit-view form-section">
            <div className="form-group">
                <label>New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="********" />
            </div>
            <div className="form-group">
                <label>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="********" />
            </div>
            <p className="hint">Password must be at least 6 characters</p>

            <button className="btn-save mt-4" onClick={handleChangePassword} disabled={saving}>
                {saving ? 'Saving...' : 'Change Password'}
            </button>
        </div>
    );

    const modalContent = (
        <div className="profile-modal-overlay" onClick={onClose}>
            <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
                {renderHeader()}

                {/* Content */}
                <div className="profile-modal-content">
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>Loading profile...</p>
                        </div>
                    ) : (
                        <>
                            {error && <div className="message error">{error}</div>}
                            {success && <div className="message success"><Check size={16} /> {success}</div>}

                            {viewMode === 'main' && renderMainView()}
                            {viewMode === 'edit' && renderEditView()}
                            {viewMode === 'password' && renderPasswordView()}
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};

export default ProfileModal;
