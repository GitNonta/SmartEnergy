import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getMyProfile, updateMyProfile, changeMyPassword, User } from '../services/userService';
import { X, Save, User as UserIcon, Mail, Phone, Lock, Check } from 'lucide-react';
import './ProfileModal.css';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
    const { token } = useAuth();
    const { t } = useLanguage();
    const [profile, setProfile] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');

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
            setTimeout(() => setSuccess(null), 3000);
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
            setTimeout(() => setSuccess(null), 3000);
        } else {
            setError(result.error || 'Failed to change password');
        }
        setSaving(false);
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="profile-modal-overlay" onClick={onClose}>
            <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="profile-modal-header">
                    <h2>
                        <UserIcon className="icon" />
                        {t('auth.profile')}
                    </h2>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="profile-tabs">
                    <button
                        className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
                        onClick={() => setActiveTab('profile')}
                    >
                        <UserIcon size={16} />
                        Profile
                    </button>
                    <button
                        className={`tab ${activeTab === 'password' ? 'active' : ''}`}
                        onClick={() => setActiveTab('password')}
                    >
                        <Lock size={16} />
                        Password
                    </button>
                </div>

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

                            {activeTab === 'profile' && (
                                <div className="form-section">
                                    <div className="form-group">
                                        <label>Username</label>
                                        <input type="text" value={profile?.username || ''} disabled className="disabled" />
                                    </div>
                                    <div className="form-group">
                                        <label><UserIcon size={14} /> Display Name</label>
                                        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Enter display name" />
                                    </div>
                                    <div className="form-group">
                                        <label><UserIcon size={14} /> Full Name</label>
                                        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter full name" />
                                    </div>
                                    <div className="form-group">
                                        <label><Mail size={14} /> Email</label>
                                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email address" />
                                    </div>
                                    <div className="form-group">
                                        <label><Phone size={14} /> Phone Number</label>
                                        <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Enter phone number" />
                                    </div>
                                    <div className="info-group">
                                        <span className="label">Role:</span>
                                        <span className={`badge ${profile?.role}`}>{profile?.role}</span>
                                    </div>
                                    <div className="info-group">
                                        <span className="label">Verified:</span>
                                        <span className={`badge ${profile?.is_verified ? 'verified' : 'unverified'}`}>
                                            {profile?.is_verified ? 'Yes' : 'No'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'password' && (
                                <div className="form-section">
                                    <div className="form-group">
                                        <label><Lock size={14} /> New Password</label>
                                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
                                    </div>
                                    <div className="form-group">
                                        <label><Lock size={14} /> Confirm Password</label>
                                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                                    </div>
                                    <p className="hint">Password must be at least 6 characters</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="profile-modal-footer">
                    <button className="btn-cancel" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-save"
                        onClick={activeTab === 'profile' ? handleSaveProfile : handleChangePassword}
                        disabled={saving || loading}
                    >
                        {saving ? 'Saving...' : <><Save size={16} /> {activeTab === 'profile' ? 'Save Profile' : 'Change Password'}</>}
                    </button>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};

export default ProfileModal;
