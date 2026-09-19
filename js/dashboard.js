/**
 * Dashboard Data Handler
 * Loads real-time data from backend API
 */

// Require authentication
requireAuth();

// Load dashboard data
async function loadDashboard() {
    try {
        // Load user profile
        const profileData = await API.getProfile();
        if (profileData && profileData.success) {
            updateUserInfo(profileData.data);
        }

        // Load wallet data
        const walletData = await API.getWallet();
        if (walletData && walletData.success) {
            updateWalletDisplay(walletData.data);
        }

        // Load task statistics
        const taskStats = await API.getTaskStats();
        if (taskStats && taskStats.success) {
            updateTaskStats(taskStats.data);
        }

        // Load today's tasks
        const todayTasks = await API.getTodayTasks();
        if (todayTasks && todayTasks.success) {
            updateTodayTasks(todayTasks.data);
        }

        // Load notifications
        loadNotifications();

    } catch (error) {
        console.error('Dashboard load error:', error);
        showNotification('Failed to load dashboard data', 'error');
    }
}

// Update user info display
function updateUserInfo(data) {
    const user = data.user;
    const stats = data.stats;

    // Update username displays
    document.querySelectorAll('[data-user-name]').forEach(el => {
        el.textContent = user.username;
    });

    // Update VIP level
    document.querySelectorAll('[data-vip-level]').forEach(el => {
        el.textContent = `VIP ${user.vipLevel}`;
    });

    // Update referral code
    const referralCodeEl = document.getElementById('referralCode');
    if (referralCodeEl) {
        referralCodeEl.textContent = user.referralCode;
    }

    // Update user stats
    if (stats) {
        const completedTasksEl = document.getElementById('completedTasks');
        if (completedTasksEl) {
            completedTasksEl.textContent = stats.completed_tasks || 0;
        }

        const totalCommissionEl = document.getElementById('totalCommission');
        if (totalCommissionEl) {
            totalCommissionEl.textContent = formatCurrency(stats.total_commission || 0);
        }

        const totalReferralsEl = document.getElementById('totalReferrals');
        if (totalReferralsEl) {
            totalReferralsEl.textContent = stats.total_referrals || 0;
        }
    }
}

// Update wallet display
function updateWalletDisplay(walletData) {
    // Main balance
    const balanceEl = document.getElementById('walletBalance');
    if (balanceEl) {
        balanceEl.textContent = formatCurrency(walletData.balance || 0);
    }

    // Frozen balance
    const frozenBalanceEl = document.getElementById('frozenBalance');
    if (frozenBalanceEl) {
        frozenBalanceEl.textContent = formatCurrency(walletData.frozen_balance || 0);
    }

    // Total deposited
    const depositedEl = document.getElementById('totalDeposited');
    if (depositedEl) {
        depositedEl.textContent = formatCurrency(walletData.total_deposited || 0);
    }

    // Total withdrawn
    const withdrawnEl = document.getElementById('totalWithdrawn');
    if (withdrawnEl) {
        withdrawnEl.textContent = formatCurrency(walletData.total_withdrawn || 0);
    }

    // Total earned
    const earnedEl = document.getElementById('totalEarned');
    if (earnedEl) {
        earnedEl.textContent = formatCurrency(walletData.total_earned || 0);
    }

    // Available balance (for display)
    const availableBalanceEls = document.querySelectorAll('[data-available-balance]');
    availableBalanceEls.forEach(el => {
        el.textContent = formatCurrency(walletData.balance || 0);
    });
}

// Update task statistics
function updateTaskStats(stats) {
    const todayTasksEl = document.getElementById('todayTasksCount');
    if (todayTasksEl) {
        todayTasksEl.textContent = stats.today_tasks || 0;
    }

    const completedTasksEl = document.getElementById('completedTasksTotal');
    if (completedTasksEl) {
        completedTasksEl.textContent = stats.completed_tasks || 0;
    }

    const pendingTasksEl = document.getElementById('pendingTasksCount');
    if (pendingTasksEl) {
        pendingTasksEl.textContent = stats.pending_tasks || 0;
    }
}

// Update today's tasks list
function updateTodayTasks(tasks) {
    const container = document.getElementById('todayTasksList');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = '<p class="no-tasks">No tasks completed today. Start earning now!</p>';
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-item">
            <div class="task-info">
                <h4>${task.product_name}</h4>
                <span class="task-market">${task.market_name || 'Market'}</span>
            </div>
            <div class="task-details">
                <span class="task-amount">${formatCurrency(task.product_price)}</span>
                <span class="task-commission">+${formatCurrency(task.commission)}</span>
                <span class="task-status ${task.status}">${task.status}</span>
            </div>
        </div>
    `).join('');
}

// Load notifications
async function loadNotifications() {
    try {
        const data = await API.getNotifications(10);
        
        if (data && data.success) {
            updateNotificationBell(data.data.unreadCount);
            updateNotificationList(data.data.notifications);
        }
    } catch (error) {
        console.error('Notifications load error:', error);
    }
}

// Update notification bell
function updateNotificationBell(count) {
    const badges = document.querySelectorAll('[data-notification-count]');
    badges.forEach(badge => {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    });
}

// Update notification list
function updateNotificationList(notifications) {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    if (notifications.length === 0) {
        container.innerHTML = '<p class="no-notifications">No notifications</p>';
        return;
    }

    container.innerHTML = notifications.map(notif => `
        <div class="notification-item ${notif.is_read ? 'read' : 'unread'}" data-id="${notif.id}">
            <div class="notif-icon ${notif.type}">
                <i class="fas fa-${getNotificationIcon(notif.type)}"></i>
            </div>
            <div class="notif-content">
                <h4>${notif.title}</h4>
                <p>${notif.message}</p>
                <span class="notif-time">${formatDate(notif.created_at)}</span>
            </div>
            ${!notif.is_read ? `
                <button class="mark-read-btn" onclick="markNotificationRead(${notif.id})">
                    <i class="fas fa-check"></i>
                </button>
            ` : ''}
        </div>
    `).join('');
}

// Get notification icon
function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'info': 'info-circle',
        'warning': 'exclamation-triangle',
        'error': 'exclamation-circle',
        'announcement': 'bullhorn'
    };
    return icons[type] || 'bell';
}

// Mark notification as read
async function markNotificationRead(id) {
    try {
        const data = await API.markNotificationRead(id);
        if (data && data.success) {
            loadNotifications();
        }
    } catch (error) {
        console.error('Mark notification error:', error);
    }
}

// Mark all notifications as read
async function markAllNotificationsRead() {
    try {
        const data = await API.markAllNotificationsRead();
        if (data && data.success) {
            showNotification('All notifications marked as read', 'success');
            loadNotifications();
        }
    } catch (error) {
        console.error('Mark all notifications error:', error);
    }
}

// Refresh dashboard periodically
function startAutoRefresh() {
    setInterval(() => {
        loadDashboard();
    }, 60000); // Refresh every 60 seconds
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    startAutoRefresh();
});

// Export functions for use in other files
if (typeof window !== 'undefined') {
    window.markNotificationRead = markNotificationRead;
    window.markAllNotificationsRead = markAllNotificationsRead;
}
