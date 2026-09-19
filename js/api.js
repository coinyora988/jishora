/**
 * Jishora Frontend API Integration
 * Centralized API communication handler
 */

// The API base URL is resolved centrally in js/config.js (loaded before this
// file) and exposed as window.API_BASE_URL. It handles local dev (:5000),
// same-origin production, and an explicit override for split deployments like
// Railway. Fall back to the old LAN behaviour if config.js is missing.
const API_BASE_URL = window.API_BASE_URL
  || `${window.location.protocol}//${window.location.hostname}:5000/api`;

// API Request Helper
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        }
    };

    // Add auth token if available
    if (token) {
        defaultOptions.headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        const data = await response.json();

        // Handle unauthorized (token expired)
        if (response.status === 401 && endpoint !== '/auth/login' && endpoint !== '/auth/register') {
            // Try to refresh token
            const refreshed = await refreshAuthToken();
            if (refreshed) {
                // Retry original request with new token
                return apiRequest(endpoint, options);
            } else {
                // Redirect to login
                redirectToLogin();
                return null;
            }
        }

        return data;
    } catch (error) {
        console.error('API Request Error:', error);
        showNotification('Network error. Please check your connection.', 'error');
        return null;
    }
}

// Refresh authentication token
async function refreshAuthToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (!refreshToken) {
        return false;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('authToken', data.data.token);
            localStorage.setItem('refreshToken', data.data.refreshToken);
            return true;
        }

        return false;
    } catch (error) {
        return false;
    }
}

// Redirect to login
function redirectToLogin() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// Check if user is authenticated
function isAuthenticated() {
    return localStorage.getItem('authToken') !== null;
}

// Get current user from localStorage
function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

// Require authentication (use on protected pages)
function requireAuth() {
    if (!isAuthenticated()) {
        redirectToLogin();
    }
}

/**
 * Log the current user out.
 *
 * Clearing the stored token is the important part: a plain <a href="login.html">
 * left the token in place, and js/auth.js bounces login.html straight back to
 * index.html whenever a token exists. That is why "Log Out" appeared to just
 * return to the home page.
 */
async function logoutUser() {
    try {
        // Best effort: tell the server, but never block logout on the response.
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
        // Ignored on purpose. Local sign-out must always succeed.
    }

    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    // Page-local caches that would otherwise leak between accounts.
    localStorage.removeItem('userProfile');
    localStorage.removeItem('taskData');

    window.location.href = 'login.html';
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;

    // Add to body
    document.body.appendChild(notification);

    // Show animation
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(Number(amount) || 0);
}

// Format a bare USDT amount, e.g. 1234.5 -> "1,234.50".
// The platform denominates in USDT, so no "$" symbol is used.
function formatUSDT(amount) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// API Endpoints shortcuts
const API = {
    // Authentication
    register: (data) => apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    
    login: (email, password) => apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    }),
    
    logout: () => apiRequest('/auth/logout', { method: 'POST' }),
    
    getProfile: () => apiRequest('/auth/me'),
    
    changePassword: (currentPassword, newPassword) => apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
    }),

    // User
    getUserProfile: () => apiRequest('/user/profile'),
    
    updateProfile: (data) => apiRequest('/user/profile', {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    
    getReferrals: () => apiRequest('/user/referrals'),
    
    getNotifications: (limit = 50) => apiRequest(`/user/notifications?limit=${limit}`),
    
    markNotificationRead: (id) => apiRequest(`/user/notifications/${id}/read`, {
        method: 'PUT'
    }),
    
    markAllNotificationsRead: () => apiRequest('/user/notifications/read-all', {
        method: 'PUT'
    }),

    // Wallet
    getWallet: () => apiRequest('/wallet'),

    // Active deposit networks configured by the admin (network + address).
    getDepositNetworks: () => apiRequest('/wallet/deposit-networks'),
    
    createDeposit: (amount, method, proofImage) => apiRequest('/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount, method, proofImage })
    }),
    
    createWithdrawal: (amount, method, accountDetails) => apiRequest('/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount, method, accountDetails })
    }),

    // Markets
    // NOTE: the backend mounts these as plural (/api/markets, /api/tasks,
    // /api/transactions). Using the singular form returns 404.
    getMarkets: () => apiRequest('/markets'),

    getMarket: (id) => apiRequest(`/markets/${id}`),

    getProduct: (id) => apiRequest(`/markets/product/${id}`),

    // Tasks
    grabTask: (productId) => apiRequest('/tasks/grab', {
        method: 'POST',
        body: JSON.stringify({ productId })
    }),

    getTasks: (filters = {}) => {
        const params = new URLSearchParams(filters);
        return apiRequest(`/tasks?${params}`);
    },

    getTask: (id) => apiRequest(`/tasks/${id}`),

    completeTask: (id) => apiRequest(`/tasks/${id}/complete`, {
        method: 'POST'
    }),

    cancelTask: (id) => apiRequest(`/tasks/${id}/cancel`, {
        method: 'POST'
    }),

    getTodayTasks: () => apiRequest('/tasks/today'),

    // Pass the browser's timezone offset so "today's" stats are computed in the
    // customer's local time, wherever they are in the world.
    getTaskStats: () => apiRequest('/tasks/stats?tzOffset=' + new Date().getTimezoneOffset()),

    // Transactions
    getTransactions: (filters = {}) => {
        const params = new URLSearchParams(filters);
        const qs = params.toString();
        return apiRequest(qs ? `/transactions?${qs}` : '/transactions');
    },

    getTransaction: (id) => apiRequest(`/transactions/${id}`),

    getTransactionStats: () => apiRequest('/transactions/stats'),

    // Deposits and withdrawals are transaction types, not separate resources.
    getDeposits: () => apiRequest('/transactions?type=deposit'),

    getWithdrawals: () => apiRequest('/transactions?type=withdraw'),

    // Public platform totals for the homepage. No auth required.
    getPlatformStats: () => apiRequest('/stats/platform')
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        API,
        apiRequest,
        isAuthenticated,
        getCurrentUser,
        requireAuth,
        logoutUser,
        showNotification,
        formatCurrency,
        formatUSDT,
        formatDate
    };
}
