/**
 * Layout Service
 * 
 * API client for dashboard layout management.
 */

import { Layouts } from '../config/defaultDashboardLayout';

import api from '../config/axios';

export interface LayoutResponse {
    success: boolean;
    data?: {
        layoutKey: string;
        layouts: Layouts;
        updatedAt: string | null;
        updatedBy: { id: number; displayName: string } | null;
        isDefault: boolean;
    };
    error?: string;
}

export interface SaveLayoutResponse {
    success: boolean;
    data?: {
        layoutKey: string;
        layouts: Layouts;
        updatedAt: string;
        updatedBy: { id: number; displayName: string } | null;
    };
    message?: string;
    error?: string;
}

/**
 * Get layout from backend
 */
export async function getLayout(layoutKey: string = 'default'): Promise<LayoutResponse> {
    try {
        const response = await api.get<LayoutResponse>(`/api/layout/${layoutKey}`);
        return response as any;
    } catch (error: any) {
        console.error('Failed to fetch layout:', error);
        return {
            success: false,
            error: error.error || error.message || 'Failed to fetch layout'
        };
    }
}

/**
 * Save layout to backend (admin only)
 * Note: Auth header is handled by axios interceptor using latest token from localStorage
 */
export async function saveLayout(
    layoutKey: string,
    layouts: Layouts
): Promise<SaveLayoutResponse> {
    try {
        const response = await api.put<SaveLayoutResponse>(`/api/layout/${layoutKey}`, { layouts });
        return response as any;
    } catch (error: any) {
        console.error('Failed to save layout:', error);
        return {
            success: false,
            error: error.error || error.message || 'Failed to save layout'
        };
    }
}

/**
 * Reset layout to default (admin only)
 * Note: Auth header is handled by axios interceptor using latest token from localStorage
 */
export async function resetLayout(
    layoutKey: string
): Promise<SaveLayoutResponse> {
    try {
        const response = await api.post<SaveLayoutResponse>(`/api/layout/${layoutKey}/reset`, {});
        return response as any;
    } catch (error: any) {
        console.error('Failed to reset layout:', error);
        return {
            success: false,
            error: error.error || error.message || 'Failed to reset layout'
        };
    }
}
