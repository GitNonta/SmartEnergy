/**
 * useApi Hook
 * A lightweight data fetching hook with auto-refresh capability
 * 
 * Features:
 * - Auto-refresh at configurable interval
 * - Loading and error states
 * - Manual refresh function
 * - Aborts pending requests on unmount
 * 
 * Usage:
 *   const { data, loading, error, refresh } = useApi<MyType>('/api/data', { refreshInterval: 5000 });
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiBase } from '../config/api';

interface UseApiOptions {
    /** Auto-refresh interval in milliseconds (0 = disabled) */
    refreshInterval?: number;
    /** Initial data value */
    initialData?: unknown;
    /** Whether to fetch immediately on mount */
    immediate?: boolean;
    /** Custom fetch options */
    fetchOptions?: RequestInit;
}

interface UseApiResult<T> {
    /** API response data */
    data: T | null;
    /** Loading state */
    loading: boolean;
    /** Error message if any */
    error: string | null;
    /** Manual refresh function */
    refresh: () => Promise<void>;
    /** Last successful fetch timestamp */
    lastUpdated: Date | null;
}

export function useApi<T>(
    endpoint: string,
    options: UseApiOptions = {}
): UseApiResult<T> {
    const {
        refreshInterval = 0,
        initialData = null,
        immediate = true,
        fetchOptions = {}
    } = options;

    const [data, setData] = useState<T | null>(initialData as T | null);
    const [loading, setLoading] = useState(immediate);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);

    const fetchData = useCallback(async () => {
        // Abort previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();

        try {
            setLoading(true);
            setError(null);

            const url = endpoint.startsWith('http')
                ? endpoint
                : `${getApiBase()}${endpoint}`;

            const response = await fetch(url, {
                ...fetchOptions,
                signal: abortControllerRef.current.signal,
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (mountedRef.current) {
                setData(result);
                setLastUpdated(new Date());
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                // Request was aborted, ignore
                return;
            }

            if (mountedRef.current) {
                setError(err instanceof Error ? err.message : 'Unknown error');
                console.error(`❌ useApi error (${endpoint}):`, err);
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [endpoint, fetchOptions]);

    // Initial fetch
    useEffect(() => {
        mountedRef.current = true;

        if (immediate) {
            fetchData();
        }

        return () => {
            mountedRef.current = false;
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [fetchData, immediate]);

    // Auto-refresh
    useEffect(() => {
        if (refreshInterval <= 0) return;

        const intervalId = setInterval(fetchData, refreshInterval);
        return () => clearInterval(intervalId);
    }, [fetchData, refreshInterval]);

    return {
        data,
        loading,
        error,
        refresh: fetchData,
        lastUpdated
    };
}

/**
 * useApiMutation Hook
 * For POST/PUT/DELETE requests
 */
interface UseMutationResult<T, TData> {
    mutate: (data: TData) => Promise<T | null>;
    loading: boolean;
    error: string | null;
    data: T | null;
}

export function useApiMutation<T, TData = Record<string, unknown>>(
    endpoint: string,
    method: 'POST' | 'PUT' | 'DELETE' = 'POST'
): UseMutationResult<T, TData> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const mutate = useCallback(async (payload: TData): Promise<T | null> => {
        setLoading(true);
        setError(null);

        try {
            const url = endpoint.startsWith('http')
                ? endpoint
                : `${getApiBase()}${endpoint}`;

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            setData(result);
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setError(message);
            console.error(`❌ useApiMutation error (${method} ${endpoint}):`, err);
            return null;
        } finally {
            setLoading(false);
        }
    }, [endpoint, method]);

    return { mutate, loading, error, data };
}

export default useApi;
