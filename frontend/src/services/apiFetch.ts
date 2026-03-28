/**
 * Central authenticated fetch utility.
 * Automatically attaches the JWT token from localStorage to every request.
 */
let isRedirecting = false;

export const apiFetch = async (input: RequestInfo, init: RequestInit = {}): Promise<Response> => {
    const isBrowser = typeof window !== 'undefined';
    const token = isBrowser ? localStorage.getItem('token') : null;
    
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> || {}),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const apiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL || '';
    const fullUrl = typeof input === 'string' && input.startsWith('/') ? `${apiBaseUrl}${input}` : input;

    const response = await fetch(fullUrl, { ...init, headers });
    
    if (response.status === 401 && !isRedirecting && isBrowser) {
        isRedirecting = true;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('autosdr_settings'); 
        localStorage.removeItem('autosdr_logs');
        window.location.href = '/';
    }
    return response;
};
