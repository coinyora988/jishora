// Admin Notifications Management

// API base URL resolved centrally in js/config.js (loaded before this file).
const API_BASE_URL = window.API_BASE_URL
  || `${window.location.protocol}//${window.location.hostname}:5000/api`;

// Make API request with auth
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('adminToken');
    
    const config = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    };

    const response = await fetch(API_BASE_URL + endpoint, config);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

// Load notification statistics
async function loadNotificationStats() {
    try {
        const response = await apiRequest('/admin/notifications/stats');
        const stats = response.data;

        document.getElementById('totalSent').textContent = formatNumber(stats.totalSent);
        document.getElementById('totalRead').textContent = formatNumber(stats.totalRead);
        document.getElementById('totalUnread').textContent = formatNumber(stats.totalUnread);
        document.getElementById('openRate').textContent = stats.openRate + '%';
    } catch (error) {
        console.error('Error loading stats:', error);
        showNotification('Failed to load statistics', 'error');
    }
}

// Load recent notifications
async function loadNotifications() {
    const tbody = document.getElementById('notificationsTableBody');
    const filterType = document.getElementById('filterType').value;

    try {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

        const queryParams = new URLSearchParams({
            page: 1,
            limit: 20
        });

        if (filterType) {
            queryParams.append('type', filterType);
        }

        const response = await apiRequest(`/admin/notifications/all?${queryParams}`);
        const notifications = response.data.notifications;

        if (notifications.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No notifications found</td></tr>';
            return;
        }

        tbody.innerHTML = notifications.map(notif => `
            <tr>
                <td>#${notif.id}</td>
                <td>
                    <span class="type-badge ${getTypeBadgeClass(notif.type)}">
                        ${escapeHtml(notif.type)}
                    </span>
                </td>
                <td><strong>${escapeHtml(notif.title)}</strong></td>
                <td>${notif.recipients} users</td>
                <td>${formatDate(notif.created_at)}</td>
                <td class="read-rate-cell">
                    <div class="rr-track"><div class="rr-fill" style="width: ${notif.read_rate}%"></div></div>
                    <span class="rr-label">${notif.read_rate}%</span>
                </td>
                <td>
                    <button class="btn-icon btn-edit" title="View details" onclick="viewNotificationDetails(${notif.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading notifications:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to load notifications</td></tr>';
        showNotification('Failed to load notifications', 'error');
    }
}

// Get badge class for notification type. Maps to the .type-badge colour
// variants defined in notifications.html (success/info/warning/announcement).
function getTypeBadgeClass(type) {
    const classes = {
        'announcement': 'announcement',
        'success': 'success',
        'info': 'info',
        'warning': 'warning'
    };
    return classes[type] || 'info';
}

// Show broadcast modal
function showBroadcastModal() {
    document.getElementById('broadcastModal').classList.add('active');
    
    // Reset form
    document.getElementById('broadcastForm').reset();
    updatePreview();
}

// Close broadcast modal
function closeBroadcastModal() {
    document.getElementById('broadcastModal').classList.remove('active');
}

// Show targeted modal
function showTargetedModal() {
    document.getElementById('targetedModal').classList.add('active');
    document.getElementById('targetedForm').reset();
}

// Close targeted modal
function closeTargetedModal() {
    document.getElementById('targetedModal').classList.remove('active');
}

// Show templates modal
function showTemplatesModal() {
    const templates = [
        {
            title: 'Welcome New Users',
            message: 'Welcome to Jishora! Start earning commissions today by completing marketplace tasks.'
        },
        {
            title: 'Deposit Approved',
            message: 'Your deposit has been approved and added to your wallet. Happy trading!'
        },
        {
            title: 'VIP Upgrade',
            message: 'Congratulations! You have been upgraded to VIP Level {level}. Enjoy exclusive benefits!'
        },
        {
            title: 'Maintenance Notice',
            message: 'Scheduled maintenance on {date} from {time}. Platform will be temporarily unavailable.'
        }
    ];

    let html = '<div class="templates-modal"><h3>Message Templates</h3><div class="templates-list">';
    
    templates.forEach((template, index) => {
        html += `
            <div class="template-item" onclick="useTemplate('${template.title}', '${template.message}')">
                <h4>${template.title}</h4>
                <p>${template.message}</p>
            </div>
        `;
    });
    
    html += '</div></div>';
    
    // Show in a simple alert for now - in production, use a proper modal
    showNotification('Templates feature coming soon!', 'info');
}

// Use template
function useTemplate(title, message) {
    document.getElementById('broadcastTitle').value = title;
    document.getElementById('broadcastMessage').value = message;
    updatePreview();
    showBroadcastModal();
}

// Update preview
function updatePreview() {
    const title = document.getElementById('broadcastTitle')?.value || 'Notification Title';
    const message = document.getElementById('broadcastMessage')?.value || 'Your message will appear here...';
    const type = document.getElementById('broadcastType')?.value || 'info';
    
    document.getElementById('previewTitle').textContent = title;
    document.getElementById('previewMessage').textContent = message;
    
    // Update character count
    const charCount = document.getElementById('charCount');
    if (charCount) {
        charCount.textContent = message.length;
        if (message.length > 500) {
            charCount.style.color = 'var(--danger-color)';
        } else {
            charCount.style.color = 'var(--text-secondary)';
        }
    }
}

// Handle broadcast form submission
document.getElementById('broadcastForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const type = document.getElementById('broadcastType').value;
    const title = document.getElementById('broadcastTitle').value;
    const message = document.getElementById('broadcastMessage').value;

    if (!confirm(`Send this notification to ALL users?\n\nTitle: ${title}\nMessage: ${message}`)) {
        return;
    }

    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        const response = await apiRequest('/admin/notifications/broadcast', {
            method: 'POST',
            body: JSON.stringify({ type, title, message })
        });

        showNotification(`Broadcast sent successfully to ${response.data.sentCount} users!`, 'success');
        closeBroadcastModal();
        loadNotifications();
        loadNotificationStats();
    } catch (error) {
        console.error('Error sending broadcast:', error);
        showNotification(error.message || 'Failed to send broadcast', 'error');
    } finally {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Broadcast';
    }
});

// Handle targeted form submission
document.getElementById('targetedForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const audience = document.getElementById('targetAudience').value;
    const type = 'info';
    const title = document.getElementById('targetedTitle').value;
    const message = document.getElementById('targetedMessage').value;

    const audienceLabel = document.getElementById('targetAudience').options[
        document.getElementById('targetAudience').selectedIndex
    ].text;

    if (!confirm(`Send this notification to: ${audienceLabel}?`)) {
        return;
    }

    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        const response = await apiRequest('/admin/notifications/targeted', {
            method: 'POST',
            body: JSON.stringify({ audience, type, title, message })
        });

        showNotification(`Notification sent successfully to ${response.data.sentCount} users!`, 'success');
        closeTargetedModal();
        loadNotifications();
        loadNotificationStats();
    } catch (error) {
        console.error('Error sending targeted notification:', error);
        showNotification(error.message || 'Failed to send notification', 'error');
    } finally {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Send Message';
    }
});

// Update preview on input
document.getElementById('broadcastTitle')?.addEventListener('input', updatePreview);
document.getElementById('broadcastMessage')?.addEventListener('input', updatePreview);
document.getElementById('broadcastType')?.addEventListener('change', updatePreview);

// View notification details
function viewNotificationDetails(id) {
    showNotification('Viewing notification details...', 'info');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadNotificationStats();
    loadNotifications();

    // Real-time: refresh notification stats + recent list automatically.
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(() => { loadNotificationStats(); loadNotifications(); });
    }
});

// Close modal on outside click
document.getElementById('broadcastModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'broadcastModal') {
        closeBroadcastModal();
    }
});

document.getElementById('targetedModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'targetedModal') {
        closeTargetedModal();
    }
});

// Utility functions
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ── Send to a single customer by username ───────────────────────────

function showUserModal() {
    const m = document.getElementById('userModal');
    if (!m) return;
    document.getElementById('umUsername').value = '';
    document.getElementById('umTitle').value = '';
    document.getElementById('umMessage').value = '';
    document.getElementById('umType').value = 'info';
    m.classList.add('active');
}

function closeUserModal() {
    const m = document.getElementById('userModal');
    if (m) m.classList.remove('active');
}

async function sendToCustomer() {
    const username = document.getElementById('umUsername').value.trim();
    const type = document.getElementById('umType').value;
    const title = document.getElementById('umTitle').value.trim();
    const message = document.getElementById('umMessage').value.trim();

    if (!username) { showNotification('Enter a customer username', 'error'); return; }
    if (!title || !message) { showNotification('Enter a title and message', 'error'); return; }

    try {
        const response = await apiRequest('/admin/notifications/user', {
            method: 'POST',
            body: JSON.stringify({ username, type, title, message })
        });
        if (response && response.success) {
            showNotification(response.message || 'Notification sent', 'success');
            closeUserModal();
            if (typeof loadNotifications === 'function') loadNotifications();
            if (typeof loadNotificationStats === 'function') loadNotificationStats();
        } else {
            showNotification((response && response.message) || 'Failed to send', 'error');
        }
    } catch (error) {
        showNotification(error.message || 'Failed to send', 'error');
    }
}

// Close the user modal when clicking outside it.
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'userModal') closeUserModal();
});
