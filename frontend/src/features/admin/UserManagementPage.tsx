import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
    getAllUsers, createUser, updateUser, deleteUser, resetUserPassword, verifyUser,
    User, CreateUserData
} from '../../services/userService';
import { Users, Plus, Edit2, Trash2, Key, Check, X, Shield, User as UserIcon, Mail, Phone } from 'lucide-react';

const UserManagementPage: React.FC = () => {
    const { user: currentUser, token } = useAuth();
    const { t } = useLanguage();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [includeInactive, setIncludeInactive] = useState(false);

    // Load users
    const loadUsers = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);

        const result = await getAllUsers(token, { includeInactive });
        if (result.success && result.data) {
            setUsers(result.data);
        } else {
            setError(result.error || 'Failed to load users');
        }
        setLoading(false);
    }, [token, includeInactive]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    // Handle delete
    const handleDelete = async (user: User) => {
        if (!token) return;
        if (!window.confirm(`Are you sure you want to delete "${user.username}"?`)) return;

        const result = await deleteUser(token, user.id);
        if (result.success) {
            loadUsers();
        } else {
            alert(result.error || 'Failed to delete user');
        }
    };

    // Handle verify
    const handleVerify = async (user: User) => {
        if (!token) return;
        const result = await verifyUser(token, user.id);
        if (result.success) {
            loadUsers();
        } else {
            alert(result.error || 'Failed to verify user');
        }
    };

    // Handle reset password
    const handleResetPassword = async (user: User) => {
        if (!token) return;
        const newPassword = window.prompt(`Enter new password for "${user.username}":`);
        if (!newPassword) return;

        const result = await resetUserPassword(token, user.id, newPassword);
        if (result.success) {
            alert('Password reset successfully');
        } else {
            alert(result.error || 'Failed to reset password');
        }
    };

    // Check admin access
    if (currentUser?.role !== 'admin') {
        return (
            <div className="access-denied">
                <Shield size={48} />
                <h2>Access Denied</h2>
                <p>You need administrator privileges to access this page.</p>
            </div>
        );
    }

    return (
        <div className="user-management-page">
            {/* Header */}
            <header className="page-header">
                <div className="header-left">
                    <h1><Users size={28} /> User Management</h1>
                    <p>Manage users and their permissions</p>
                </div>
                <div className="header-actions">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={includeInactive}
                            onChange={(e) => setIncludeInactive(e.target.checked)}
                        />
                        Show inactive
                    </label>
                    <button className="btn-add" onClick={() => setShowAddModal(true)}>
                        <Plus size={18} />
                        Add User
                    </button>
                </div>
            </header>

            {/* Error */}
            {error && <div className="error-message">{error}</div>}

            {/* Users Table */}
            <div className="users-table-container">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading users...</p>
                    </div>
                ) : (
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} className={!user.is_active ? 'inactive' : ''}>
                                    <td>
                                        <div className="user-cell">
                                            <div className="avatar">
                                                {(user.display_name || user.username).substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="user-info">
                                                <span className="username">{user.username}</span>
                                                <span className="display-name">{user.display_name || user.full_name || '-'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        {user.email || <span className="empty">-</span>}
                                    </td>
                                    <td>
                                        {user.phone_number || <span className="empty">-</span>}
                                    </td>
                                    <td>
                                        <span className={`badge role-${user.role}`}>{user.role}</span>
                                    </td>
                                    <td>
                                        <div className="status-badges">
                                            <span className={`badge ${user.is_active ? 'active' : 'inactive'}`}>
                                                {user.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                            {user.is_verified && (
                                                <span className="badge verified">
                                                    <Check size={12} /> Verified
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                            <button
                                                className="action-btn edit"
                                                onClick={() => setEditingUser(user)}
                                                title="Edit"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                className="action-btn key"
                                                onClick={() => handleResetPassword(user)}
                                                title="Reset Password"
                                            >
                                                <Key size={14} />
                                            </button>
                                            {!user.is_verified && (
                                                <button
                                                    className="action-btn verify"
                                                    onClick={() => handleVerify(user)}
                                                    title="Verify"
                                                >
                                                    <Check size={14} />
                                                </button>
                                            )}
                                            {user.id !== currentUser.id && (
                                                <button
                                                    className="action-btn delete"
                                                    onClick={() => handleDelete(user)}
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {!loading && users.length === 0 && (
                    <div className="empty-state">
                        <Users size={48} />
                        <p>No users found</p>
                    </div>
                )}
            </div>

            {/* Add User Modal */}
            {showAddModal && (
                <AddUserModal
                    token={token!}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => {
                        setShowAddModal(false);
                        loadUsers();
                    }}
                />
            )}

            {/* Edit User Modal */}
            {editingUser && (
                <EditUserModal
                    token={token!}
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                    onSuccess={() => {
                        setEditingUser(null);
                        loadUsers();
                    }}
                />
            )}
        </div>
    );
};

// Add User Modal
const AddUserModal: React.FC<{
    token: string;
    onClose: () => void;
    onSuccess: () => void;
}> = ({ token, onClose, onSuccess }) => {
    const [form, setForm] = useState<CreateUserData>({
        username: '',
        password: '',
        email: '',
        display_name: '',
        full_name: '',
        phone_number: '',
        role: 'user'
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!form.username || !form.password) {
            setError('Username and password are required');
            return;
        }

        setSaving(true);
        setError(null);

        const result = await createUser(token, form);
        if (result.success) {
            onSuccess();
        } else {
            setError(result.error || 'Failed to create user');
            setSaving(false);
        }
    };

    return ReactDOM.createPortal(
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><Plus size={20} /> Add New User</h3>
                    <button className="close-btn" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-content">
                    {error && <div className="error">{error}</div>}
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Username *</label>
                            <input
                                type="text"
                                value={form.username}
                                onChange={(e) => setForm({ ...form, username: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Password *</label>
                            <input
                                type="password"
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Display Name</label>
                            <input
                                type="text"
                                value={form.display_name}
                                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                type="text"
                                value={form.full_name}
                                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <input
                                type="tel"
                                value={form.phone_number}
                                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Role</label>
                            <select
                                value={form.role}
                                onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                            >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                                <option value="viewer">Viewer</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn-cancel" onClick={onClose}>Cancel</button>
                    <button className="btn-save" onClick={handleSubmit} disabled={saving}>
                        {saving ? 'Creating...' : 'Create User'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// Edit User Modal
const EditUserModal: React.FC<{
    token: string;
    user: User;
    onClose: () => void;
    onSuccess: () => void;
}> = ({ token, user: editUser, onClose, onSuccess }) => {
    const [form, setForm] = useState({
        email: editUser.email || '',
        display_name: editUser.display_name || '',
        full_name: editUser.full_name || '',
        phone_number: editUser.phone_number || '',
        role: editUser.role,
        is_active: editUser.is_active,
        is_verified: editUser.is_verified
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        setSaving(true);
        setError(null);

        const result = await updateUser(token, editUser.id, form);
        if (result.success) {
            onSuccess();
        } else {
            setError(result.error || 'Failed to update user');
            setSaving(false);
        }
    };

    return ReactDOM.createPortal(
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><Edit2 size={20} /> Edit User: {editUser.username}</h3>
                    <button className="close-btn" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-content">
                    {error && <div className="error">{error}</div>}
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Email</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Display Name</label>
                            <input
                                type="text"
                                value={form.display_name}
                                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                type="text"
                                value={form.full_name}
                                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <input
                                type="tel"
                                value={form.phone_number}
                                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Role</label>
                            <select
                                value={form.role}
                                onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                            >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                                <option value="viewer">Viewer</option>
                            </select>
                        </div>
                        <div className="form-group checkbox-group">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={form.is_active}
                                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                                />
                                Active
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={form.is_verified}
                                    onChange={(e) => setForm({ ...form, is_verified: e.target.checked })}
                                />
                                Verified
                            </label>
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn-cancel" onClick={onClose}>Cancel</button>
                    <button className="btn-save" onClick={handleSubmit} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default UserManagementPage;
