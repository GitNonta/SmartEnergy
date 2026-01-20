/**
 * Dashboard Layout Context
 * 
 * Manages dashboard widget layout state including:
 * - Loading/saving layouts from backend API
 * - Edit mode toggle (admin only)
 * - Layout change handlers
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { Layouts, defaultLayouts } from '../config/defaultDashboardLayout';
import { getLayout, saveLayout as apiSaveLayout, resetLayout as apiResetLayout } from '../services/layoutService';

interface DashboardLayoutContextType {
    layouts: Layouts;
    isEditMode: boolean;
    isLoading: boolean;
    isSaving: boolean;
    isAdmin: boolean;
    error: string | null;
    toggleEditMode: () => void;
    updateLayouts: (newLayouts: Layouts) => void;
    saveLayoutToServer: () => Promise<boolean>;
    resetLayoutToDefault: () => Promise<boolean>;
}

const DashboardLayoutContext = createContext<DashboardLayoutContextType | undefined>(undefined);

export const useDashboardLayout = () => {
    const context = useContext(DashboardLayoutContext);
    if (!context) {
        throw new Error('useDashboardLayout must be used within a DashboardLayoutProvider');
    }
    return context;
};

interface DashboardLayoutProviderProps {
    children: ReactNode;
}

export const DashboardLayoutProvider: React.FC<DashboardLayoutProviderProps> = ({ children }) => {
    const { user, token } = useAuth();
    const isAdmin = user?.role === 'admin';

    const [layouts, setLayouts] = useState<Layouts>(defaultLayouts);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load layout from backend on mount
    useEffect(() => {
        const loadLayout = async () => {
            try {
                setIsLoading(true);
                const response = await getLayout('default');

                if (response.success && response.data) {
                    // Migrate old 'frequency' key to 'voltage'
                    const migratedLayouts = migrateLayouts(response.data.layouts);
                    setLayouts(migratedLayouts);
                } else {
                    // Use default layout if fetch fails
                    setLayouts(defaultLayouts);
                }
            } catch (err) {
                console.error('Failed to load layout:', err);
                setLayouts(defaultLayouts);
            } finally {
                setIsLoading(false);
            }
        };

        loadLayout();
    }, []);

    // Migrate old widget IDs to new ones and validate layout compatibility
    const migrateLayouts = (layouts: Layouts): Layouts => {
        // New column counts for validation
        const NEW_COLS = { xxl: 12, xl: 10, lg: 8, md: 6, sm: 4, xs: 2 };

        const migrateItems = (items: typeof layouts.lg, cols: number, defaultItems: typeof layouts.lg) => {
            if (!items || items.length === 0) {
                return defaultItems;
            }

            // Check if any widget exceeds new column count - if so, use default
            const hasIncompatible = items.some(item => item.x + item.w > cols);
            if (hasIncompatible) {
                console.log(`Layout incompatible with ${cols} columns, using default`);
                return defaultItems;
            }

            return items.map(item => ({
                ...item,
                // Convert 'frequency' to 'voltage'
                i: item.i === 'frequency' ? 'voltage' : item.i
            }));
        };

        return {
            xxl: migrateItems(layouts.xxl, NEW_COLS.xxl, defaultLayouts.xxl),
            xl: migrateItems(layouts.xl, NEW_COLS.xl, defaultLayouts.xl),
            lg: migrateItems(layouts.lg, NEW_COLS.lg, defaultLayouts.lg),
            md: migrateItems(layouts.md, NEW_COLS.md, defaultLayouts.md),
            sm: migrateItems(layouts.sm, NEW_COLS.sm, defaultLayouts.sm),
            xs: migrateItems(layouts.xs, NEW_COLS.xs, defaultLayouts.xs),
        };
    };

    // Toggle edit mode (admin only)
    const toggleEditMode = useCallback(() => {
        if (!isAdmin) return;
        setIsEditMode(prev => !prev);
    }, [isAdmin]);

    // Update layouts locally (during drag/resize)
    const updateLayouts = useCallback((newLayouts: Layouts) => {
        setLayouts(newLayouts);
    }, []);

    // Save layout to server
    const saveLayoutToServer = useCallback(async (): Promise<boolean> => {
        if (!token) return false;

        try {
            setIsSaving(true);
            setError(null);

            const response = await apiSaveLayout('default', layouts);

            if (response.success) {
                setIsEditMode(false);
                return true;
            } else {
                setError(response.error || 'Failed to save layout');
                return false;
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to save layout';
            setError(errorMessage);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [token, layouts]);

    // Reset layout to default
    const resetLayoutToDefault = useCallback(async (): Promise<boolean> => {
        if (!token) return false;

        try {
            setIsSaving(true);
            setError(null);

            const response = await apiResetLayout('default');

            if (response.success && response.data) {
                setLayouts(response.data.layouts);
                setIsEditMode(false);
                return true;
            } else {
                setError(response.error || 'Failed to reset layout');
                return false;
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to reset layout';
            setError(errorMessage);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [token]);

    const value: DashboardLayoutContextType = {
        layouts,
        isEditMode,
        isLoading,
        isSaving,
        isAdmin,
        error,
        toggleEditMode,
        updateLayouts,
        saveLayoutToServer,
        resetLayoutToDefault,
    };

    return (
        <DashboardLayoutContext.Provider value={value}>
            {children}
        </DashboardLayoutContext.Provider>
    );
};

export default DashboardLayoutContext;
