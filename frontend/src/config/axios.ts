import axios from 'axios';
import { getApiBase } from './api';

// Create Axios instance
const api = axios.create({
    baseURL: getApiBase(),
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // For cookies
});

// Request Interceptor: Add Bearer Token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('auth_token');
        if (token && !config.headers['Authorization']) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor: Handle token refresh and errors
api.interceptors.response.use(
    (response) => {
        // Check if backend sent a refreshed token
        const newToken = response.headers['x-new-token'];
        if (newToken) {
            console.log('🔄 Token refreshed by server');
            localStorage.setItem('auth_token', newToken);
        }

        return response.data; // Return data directly for cleaner service calls
    },
    (error) => {
        // Log 401 errors but don't force logout here
        // AuthContext will handle session expiry more gracefully
        if (error.response?.status === 401) {
            console.log('🔒 401 Unauthorized response received');
            // Don't clear auth here - it causes aggressive redirects
            // Let the natural token check in AuthContext handle expiry
        }

        // Format error message
        const message = error.response?.data?.error || error.response?.data?.message || 'Something went wrong';
        console.error('API Error:', message, error);

        return Promise.reject({
            success: false,
            error: message,
            originalError: error
        });
    }
);

export default api;
