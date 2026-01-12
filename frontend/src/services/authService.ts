/**
 * Authentication Service
 * 
 * Handles API calls for login, logout, and user management.
 */

import api from '../config/axios';

export interface User {
    id: number;
    username: string;
    displayName: string;
    role: 'admin' | 'user' | 'viewer';
}

export interface LoginResponse {
    success: boolean;
    data?: {
        token: string;
        expiresAt: string;
        user: User;
    };
    error?: string;
}

export interface AuthSession {
    id: number;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
    expiresAt: string;
    current: boolean;
}

/**
 * Login with username and password
 */
export async function login(username: string, password: string): Promise<LoginResponse> {
    try {
        const response = await api.post<LoginResponse>('/api/auth/login', { username, password });
        return response as any; // Interceptor returns data
    } catch (error: any) {
        return { success: false, error: error.error || 'Login failed' };
    }
}

/**
 * Logout current session
 */
export async function logout(token: string): Promise<{ success: boolean }> {
    try {
        const response = await api.post<{ success: boolean }>('/api/auth/logout');
        return response as any;
    } catch (error) {
        return { success: false };
    }
}

/**
 * Get current user info
 */
export async function getCurrentUser(token: string): Promise<{ success: boolean; data?: User }> {
    try {
        const response = await api.get<{ success: boolean; data?: User }>('/api/auth/me');
        return response as any;
    } catch (error) {
        return { success: false };
    }
}

/**
 * Get active sessions
 */
export async function getSessions(token: string): Promise<{ success: boolean; data?: AuthSession[] }> {
    try {
        const response = await api.get<{ success: boolean; data?: AuthSession[] }>('/api/auth/sessions');
        return response as any;
    } catch (error) {
        return { success: false };
    }
}

/**
 * Token storage helpers
 */
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export function saveAuthData(token: string, user: User): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
    const userStr = localStorage.getItem(USER_KEY);
    if (userStr) {
        try {
            return JSON.parse(userStr);
        } catch {
            return null;
        }
    }
    return null;
}

export function clearAuthData(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}
