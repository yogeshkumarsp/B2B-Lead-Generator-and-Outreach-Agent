import axios from 'axios';

const apiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL || '';
const API_URL = `${apiBaseUrl}/api`;

const api = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export const authService = {
    register: async (name: string, email: string, password: string) => {
        const response = await api.post('/auth/register', { name, email, password });
        if (response.data.token) {
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    login: async (email: string, password: string) => {
        const response = await api.post('/auth/login', { email, password });
        if (response.data.token) {
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    forgotPassword: async (email: string) => {
        const response = await api.post('/auth/forgot-password', { email });
        return response.data;
    },

    resetPassword: async (data: any) => {
        const response = await api.post('/auth/reset-password', data);
        return response.data;
    },

    requestAccess: async (data: any) => {
        const response = await api.post('/auth/request-access', data);
        return response.data;
    },

    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Clear any user-specific localStorage cache
        localStorage.removeItem('autosdr_settings');
        localStorage.removeItem('autosdr_logs');
        window.location.href = '/';
    },

    getCurrentUser: () => {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    isAuthenticated: () => {
        return !!localStorage.getItem('token');
    },

    getToken: () => {
        return localStorage.getItem('token');
    }
};
