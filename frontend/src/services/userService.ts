/**
 * User Service
 * 
 * API client for user management.
 */

import api from '../config/axios';

export interface User {
    id: number;
    username: string;
    email: string | null;
    display_name: string | null;
    full_name: string | null;
    phone_number: string | null;
    role: 'admin' | 'user' | 'viewer';
    is_active: boolean;
    is_verified: boolean;
    created_at: string;
    updated_at: string;
}

export interface UserListResponse {
    success: boolean;
    data?: User[];
    meta?: {
        total: number;
        limit: number;
        offset: number;
    };
    error?: string;
}

export interface UserResponse {
    success: boolean;
    data?: User;
    message?: string;
    error?: string;
}

export interface CreateUserData {
    username: string;
    email?: string;
    password: string;
    display_name?: string;
    full_name?: string;
    phone_number?: string;
    role?: 'admin' | 'user' | 'viewer';
}

export interface UpdateUserData {
    email?: string;
    display_name?: string;
    full_name?: string;
    phone_number?: string;
    role?: 'admin' | 'user' | 'viewer';
    is_active?: boolean;
    is_verified?: boolean;
}

// Helper to pass token
const headers = (token: string) => ({
    headers: { Authorization: `Bearer ${token}` }
});

/**
 * Get all users (admin only)
 */
export async function getAllUsers(token: string, options: {
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
} = {}): Promise<UserListResponse> {
    try {
        const params = new URLSearchParams();
        if (options.includeInactive) params.set('includeInactive', 'true');
        if (options.limit) params.set('limit', String(options.limit));
        if (options.offset) params.set('offset', String(options.offset));

        const response = await api.get<UserListResponse>(`/api/users?${params}`, headers(token));
        return response as any;
    } catch (error: any) {
        console.error('Failed to fetch users:', error);
        return { success: false, error: 'Failed to fetch users' };
    }
}

/**
 * Get current user profile
 */
export async function getMyProfile(token: string): Promise<UserResponse> {
    try {
        const response = await api.get<UserResponse>('/api/users/me', headers(token));
        return response as any;
    } catch (error) {
        console.error('Failed to fetch profile:', error);
        return { success: false, error: 'Failed to fetch profile' };
    }
}

/**
 * Update current user profile
 */
export async function updateMyProfile(token: string, data: UpdateUserData): Promise<UserResponse> {
    try {
        const response = await api.put<UserResponse>('/api/users/me', data, headers(token));
        return response as any;
    } catch (error) {
        console.error('Failed to update profile:', error);
        return { success: false, error: 'Failed to update profile' };
    }
}

/**
 * Change own password
 */
export async function changeMyPassword(token: string, newPassword: string): Promise<UserResponse> {
    try {
        const response = await api.put<UserResponse>('/api/users/me/password', { newPassword }, headers(token));
        return response as any;
    } catch (error) {
        console.error('Failed to change password:', error);
        return { success: false, error: 'Failed to change password' };
    }
}

/**
 * Get user by ID (admin only)
 */
export async function getUserById(token: string, id: number): Promise<UserResponse> {
    try {
        const response = await api.get<UserResponse>(`/api/users/${id}`, headers(token));
        return response as any;
    } catch (error) {
        console.error('Failed to fetch user:', error);
        return { success: false, error: 'Failed to fetch user' };
    }
}

/**
 * Create new user (admin only)
 */
export async function createUser(token: string, data: CreateUserData): Promise<UserResponse> {
    try {
        const response = await api.post<UserResponse>('/api/users', data, headers(token));
        return response as any;
    } catch (error) {
        console.error('Failed to create user:', error);
        return { success: false, error: 'Failed to create user' };
    }
}

/**
 * Update user (admin only)
 */
export async function updateUser(token: string, id: number, data: UpdateUserData): Promise<UserResponse> {
    try {
        const response = await api.put<UserResponse>(`/api/users/${id}`, data, headers(token));
        return response as any;
    } catch (error) {
        console.error('Failed to update user:', error);
        return { success: false, error: 'Failed to update user' };
    }
}

/**
 * Reset user password (admin only)
 */
export async function resetUserPassword(token: string, id: number, newPassword: string): Promise<UserResponse> {
    try {
        const response = await api.put<UserResponse>(`/api/users/${id}/password`, { newPassword }, headers(token));
        return response as any;
    } catch (error) {
        console.error('Failed to reset password:', error);
        return { success: false, error: 'Failed to reset password' };
    }
}

/**
 * Delete user (admin only)
 */
export async function deleteUser(token: string, id: number): Promise<UserResponse> {
    try {
        const response = await api.delete<UserResponse>(`/api/users/${id}`, headers(token));
        return response as any;
    } catch (error) {
        console.error('Failed to delete user:', error);
        return { success: false, error: 'Failed to delete user' };
    }
}

/**
 * Verify user email (admin only)
 */
export async function verifyUser(token: string, id: number): Promise<UserResponse> {
    try {
        const response = await api.post<UserResponse>(`/api/users/${id}/verify`, {}, headers(token));
        return response as any;
    } catch (error) {
        console.error('Failed to verify user:', error);
        return { success: false, error: 'Failed to verify user' };
    }
}
