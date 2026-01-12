import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import {
    User,
    login as apiLogin,
    logout as apiLogout,
    getCurrentUser,
    saveAuthData,
    getStoredToken,
    getStoredUser,
    clearAuthData
} from '../services/authService';

// ============ AUTO LOGOUT CONFIGURATION ============
// Standard security timeouts (in milliseconds)
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;       // 30 minutes - auto logout on inactivity (matches backend)
const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000;      // 5 minutes - check token validity (reduced to avoid false positives)
const WARNING_BEFORE_LOGOUT = 2 * 60 * 1000;     // 2 minutes - show warning before logout
const SESSION_EXTEND_THRESHOLD = 5 * 60 * 1000;  // 5 minutes - extend session if active
const TOKEN_REFRESH_INTERVAL = 10 * 60 * 1000;   // 10 minutes - proactively refresh token

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    sessionWarning: boolean;          // Show warning before auto logout
    remainingTime: number;            // Seconds until logout
    login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    extendSession: () => void;        // Manually extend session
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sessionWarning, setSessionWarning] = useState(false);
    const [remainingTime, setRemainingTime] = useState(0);

    // Refs for timeout management
    const lastActivityTime = useRef<number>(Date.now());
    const inactivityTimer = useRef<NodeJS.Timeout | null>(null);
    const warningTimer = useRef<NodeJS.Timeout | null>(null);
    const tokenCheckTimer = useRef<NodeJS.Timeout | null>(null);
    const countdownTimer = useRef<NodeJS.Timeout | null>(null);

    // ============ LOGOUT FUNCTION ============
    const logout = useCallback(async () => {
        // Clear all timers
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        if (warningTimer.current) clearTimeout(warningTimer.current);
        if (tokenCheckTimer.current) clearInterval(tokenCheckTimer.current);
        if (countdownTimer.current) clearInterval(countdownTimer.current);

        if (token) {
            try {
                await apiLogout(token);
            } catch {
                // Ignore errors, clear local data anyway
            }
        }

        clearAuthData();
        setToken(null);
        setUser(null);
        setSessionWarning(false);
        setRemainingTime(0);
    }, [token]);

    // ============ RESET INACTIVITY TIMER ============
    const resetInactivityTimer = useCallback(() => {
        if (!token || !user) return;

        lastActivityTime.current = Date.now();
        setSessionWarning(false);

        // Clear existing timers
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        if (warningTimer.current) clearTimeout(warningTimer.current);
        if (countdownTimer.current) clearInterval(countdownTimer.current);

        // Set warning timer (fires before logout)
        warningTimer.current = setTimeout(() => {
            setSessionWarning(true);
            setRemainingTime(Math.floor(WARNING_BEFORE_LOGOUT / 1000));

            // Start countdown
            countdownTimer.current = setInterval(() => {
                setRemainingTime(prev => {
                    if (prev <= 1) {
                        if (countdownTimer.current) clearInterval(countdownTimer.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }, INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT);

        // Set main inactivity timer
        inactivityTimer.current = setTimeout(() => {
            console.log('🔒 Auto logout: Session expired due to inactivity');
            logout();
        }, INACTIVITY_TIMEOUT);
    }, [token, user, logout]);

    // ============ EXTEND SESSION ============
    const extendSession = useCallback(() => {
        resetInactivityTimer();
    }, [resetInactivityTimer]);

    // ============ ACTIVITY DETECTION ============
    useEffect(() => {
        if (!token || !user) return;

        const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

        const handleActivity = () => {
            const now = Date.now();
            // Only reset if enough time has passed (debounce)
            if (now - lastActivityTime.current > 1000) {
                resetInactivityTimer();
            }
        };

        // Add event listeners
        activityEvents.forEach(event => {
            document.addEventListener(event, handleActivity, { passive: true });
        });

        // Initial timer setup
        resetInactivityTimer();

        // Cleanup
        return () => {
            activityEvents.forEach(event => {
                document.removeEventListener(event, handleActivity);
            });
        };
    }, [token, user, resetInactivityTimer]);

    // ============ TOKEN VALIDITY CHECK ============
    useEffect(() => {
        if (!token) return;

        const checkTokenValidity = async () => {
            try {
                const response = await getCurrentUser(token);
                if (!response.success) {
                    // Only logout if it's a clear authentication failure
                    // Don't logout on network errors or other issues
                    console.log('🔒 Token check failed, but keeping session active');
                }
            } catch (error: any) {
                // Only logout on explicit 401 Unauthorized
                if (error?.originalError?.response?.status === 401) {
                    console.log('🔒 Auto logout: Token explicitly rejected by server');
                    logout();
                }
                // Otherwise, keep session alive (might be network hiccup)
            }
        };

        // Don't check immediately on mount - give some grace period
        const initialCheck = setTimeout(checkTokenValidity, 5000);

        // Then check periodically
        tokenCheckTimer.current = setInterval(checkTokenValidity, TOKEN_CHECK_INTERVAL);

        return () => {
            clearTimeout(initialCheck);
            if (tokenCheckTimer.current) clearInterval(tokenCheckTimer.current);
        };
    }, [token, logout]);

    // ============ VISIBILITY CHANGE (Tab focus) ============
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && token) {
                // When tab becomes visible, check if session should have expired
                const timeSinceActivity = Date.now() - lastActivityTime.current;
                if (timeSinceActivity >= INACTIVITY_TIMEOUT) {
                    console.log('🔒 Auto logout: Session expired while tab was inactive');
                    logout();
                } else {
                    resetInactivityTimer();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [token, logout, resetInactivityTimer]);

    // ============ SYNC TOKEN FROM LOCALSTORAGE ============
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'auth_token' && e.newValue && e.newValue !== token) {
                console.log('🔄 Token updated in localStorage, syncing...');
                setToken(e.newValue);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [token]);

    // ============ INITIALIZE FROM LOCALSTORAGE ============
    useEffect(() => {
        const storedToken = getStoredToken();
        const storedUser = getStoredUser();

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(storedUser);

            // Validate token with server - but don't logout on failure, just log
            getCurrentUser(storedToken)
                .then(response => {
                    if (response.success && response.data) {
                        setUser(response.data);
                    }
                    // Don't clear auth on failure - might be network issue
                })
                .catch(() => {
                    // Network error, keep local data
                })
                .finally(() => {
                    setIsLoading(false);
                });
        } else {
            setIsLoading(false);
        }
    }, []);

    // ============ LOGIN ============
    const login = useCallback(async (username: string, password: string) => {
        try {
            const response = await apiLogin(username, password);

            if (response.success && response.data) {
                const { token: newToken, user: newUser } = response.data;
                setToken(newToken);
                setUser(newUser);
                saveAuthData(newToken, newUser);
                lastActivityTime.current = Date.now();
                return { success: true };
            }

            return { success: false, error: response.error || 'Login failed' };
        } catch (error) {
            return { success: false, error: 'Network error' };
        }
    }, []);

    // ============ REFRESH USER ============
    const refreshUser = useCallback(async () => {
        if (token) {
            const response = await getCurrentUser(token);
            if (response.success && response.data) {
                setUser(response.data);
            }
        }
    }, [token]);

    const value: AuthContextType = {
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        sessionWarning,
        remainingTime,
        login,
        logout,
        refreshUser,
        extendSession
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;

