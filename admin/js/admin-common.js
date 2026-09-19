// Common Admin Functions
// The API base URL is resolved centrally in js/config.js (loaded before this
// file) and exposed as window.API_URL. It handles local dev (:5000),
// same-origin production, and an explicit override for split deployments like
// Railway. Fall back to the old LAN behaviour if config.js is missing.
const API_URL = window.API_URL
  || `${window.location.protocol}//${window.location.hostname}:5000/api`;

// Check authentication on page load
function checkAuth() {
    if (window.location.pathname.includes('login.html')) {
        return;
    }

    const token = localStorage.getItem('adminToken');
    const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');

    if (!token || adminUser.role !== 'admin') {
        window.location.href = 'login.html';
        return;
    }

    // Display admin name
    const adminNameEl = document.getElementById('adminName');
    if (adminNameEl && adminUser.username) {
        adminNameEl.textContent = adminUser.username;
    }
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        const token = localStorage.getItem('adminToken');
        
        // Call logout API
        fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        // Clear local storage
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminRefreshToken');
        localStorage.removeItem('adminUser');
        localStorage.removeItem('rememberAdmin');

        // Redirect to login
        window.location.href = 'login.html';
    }
}

// Sidebar toggle for mobile
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
}

// API Request helper with authentication
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('adminToken');
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const config = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        const data = await response.json();

        // Handle unauthorized
        if (response.status === 401) {
            // Try to refresh token
            const refreshed = await refreshToken();
            if (refreshed) {
                // Retry request with new token
                return apiRequest(endpoint, options);
            } else {
                logout();
                return null;
            }
        }

        return data;
    } catch (error) {
        console.error('API Request failed:', error);
        showNotification('Request failed. Please try again.', 'error');
        return null;
    }
}

// Refresh token
async function refreshToken() {
    const refreshToken = localStorage.getItem('adminRefreshToken');
    
    if (!refreshToken) {
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('adminToken', data.data.token);
            localStorage.setItem('adminRefreshToken', data.data.refreshToken);
            return true;
        }

        return false;
    } catch (error) {
        return false;
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
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

// Format a USDT amount for display, e.g. 1234.5 -> "1,234.50 USDT".
// The platform is USDT-denominated, so a "$" prefix would be misleading.
function formatCurrency(amount) {
    const value = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
    return `${value} USDT`;
}

// Escape text that came from user input before it reaches innerHTML.
// Usernames and admin notes are user-controlled.
function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
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

// Format status badge
function formatStatus(status) {
    const statusMap = {
        'completed': 'approved',
        'pending': 'pending',
        'processing': 'pending',
        'rejected': 'rejected',
        'failed': 'rejected',
        'cancelled': 'cancelled',
        'active': 'approved',
        'inactive': 'cancelled'
    };

    // Guard against a missing status, which previously threw on .toUpperCase()
    // and blanked the whole table row.
    const safe = status || 'unknown';
    const badgeClass = statusMap[safe] || 'pending';
    return `<span class="badge-status ${badgeClass}">${escapeHtml(safe).toUpperCase()}</span>`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Load pending counts for sidebar badges
    loadPendingCounts();

    // Start the shared real-time poller (pages register their loaders).
    __startAutoRefresh();
});

// Load pending transaction counts
async function loadPendingCounts() {
    const data = await apiRequest('/admin/pending-counts');
    
    if (data && data.success) {
        const pendingDepositsEl = document.getElementById('pendingDeposits');
        const pendingWithdrawalsEl = document.getElementById('pendingWithdrawals');
        
        if (pendingDepositsEl) {
            pendingDepositsEl.textContent = data.data.deposits || 0;
        }
        
        if (pendingWithdrawalsEl) {
            pendingWithdrawalsEl.textContent = data.data.withdrawals || 0;
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════
   Real-time auto-refresh
   Every admin page registers its data-loading function(s) here; a single
   shared timer re-runs them every ~10s so the admin sees customer actions
   (deposits, withdrawals, completed orders, balance changes, combos, etc.)
   without clicking Refresh. The poll PAUSES when:
     - the browser tab is hidden (saves work when not looking),
     - a modal is open (so a review/edit isn't interrupted),
     - the admin is typing in an input/textarea/select (so search/edit
       fields aren't wiped mid-typing).
   ═══════════════════════════════════════════════════════════════════ */
const AUTO_REFRESH_MS = 10000; // 10 seconds
let __autoRefreshFns = [];

// Pages call this once (in their DOMContentLoaded) with their refresh function.
function registerAutoRefresh(fn) {
    if (typeof fn === 'function') __autoRefreshFns.push(fn);
}

// True when a refresh would be disruptive and should be skipped this tick.
function __shouldSkipAutoRefresh() {
    if (document.hidden) return true;
    // Any open modal — pages use either `.active` or `.show`.
    if (document.querySelector('.modal.active, .modal.show, .modal.open')) return true;
    // The admin is interacting with a field (search box, edit form, filter).
    const el = document.activeElement;
    if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
    return false;
}

// Run all registered page loaders now (used by both the poll and live events).
function __runAutoRefresh() {
    if (__shouldSkipAutoRefresh()) return;
    loadPendingCounts();
    __autoRefreshFns.forEach((fn) => {
        try { fn(); } catch (e) { console.error('auto-refresh error:', e); }
    });
}

// Single shared poller — a safety net / fallback. The live SSE stream below is
// what makes updates INSTANT; this slower poll just guarantees the panel is
// never stale even if the live connection drops.
function __startAutoRefresh() {
    setInterval(__runAutoRefresh, AUTO_REFRESH_MS);
    __startLiveEvents();
}

/* ── Live events (Server-Sent Events) ──────────────────────────────────
   Opens a persistent stream to GET /api/admin/events. The backend pushes an
   event the instant a customer acts (deposit, withdrawal, order grab/complete,
   registration, etc.), and we refresh the page immediately — real-time, no
   polling delay. Reconnects automatically if the connection drops. */
let __eventSource = null;
let __liveDebounce = null;

function __startLiveEvents() {
    if (typeof EventSource === 'undefined') return; // very old browsers: rely on poll
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
        __eventSource = new EventSource(`${API_URL}/admin/events?token=${encodeURIComponent(token)}`);
    } catch (e) {
        return; // fall back to polling
    }

    __eventSource.onmessage = () => {
        // Refresh immediately for true real-time. A tiny 20ms coalesce only
        // merges events that arrive in the exact same instant; it is not a
        // perceptible delay.
        clearTimeout(__liveDebounce);
        __liveDebounce = setTimeout(__runAutoRefresh, 20);
    };

    // On error the browser auto-reconnects (we sent retry: 3000). If it closed
    // for good, try to reopen after a short delay.
    __eventSource.onerror = () => {
        if (__eventSource && __eventSource.readyState === EventSource.CLOSED) {
            setTimeout(__startLiveEvents, 4000);
        }
    };
}

// Close sidebar on outside click (mobile)
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const btnMenu = document.querySelector('.btn-menu');
    
    if (sidebar && btnMenu && window.innerWidth <= 768) {
        if (!sidebar.contains(e.target) && !btnMenu.contains(e.target)) {
            sidebar.classList.remove('active');
        }
    }
});
