// Users Management
let currentPage = 1;
let totalPages = 1;
let filters = {
    search: '',
    status: '',
    role: '',
    vipLevel: ''
};

// Load users.
// `silent` = true is passed by the auto-refresh poller: it updates the table
// in place WITHOUT blanking it to "Loading..." first, so the list refreshes
// smoothly every few seconds instead of flashing a placeholder each cycle.
async function loadUsers(page = 1, silent = false) {
    currentPage = page;
    const tbody = document.getElementById('usersTableBody');
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center">Loading...</td></tr>';
    }

    const queryParams = new URLSearchParams({
        page,
        limit: 20,
        ...filters
    });

    const data = await apiRequest(`/admin/users?${queryParams}`);

    if (data && data.success) {
        const users = data.data.users;
        totalPages = data.data.pagination.totalPages;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr>
                <td>#${user.id}</td>
                <td><strong>${user.username}</strong></td>
                <td>${user.email}</td>
                <td><span style="font-family:monospace;font-weight:600;">${user.referral_code || '—'}</span></td>
                <td>${user.referred_by_username
                        ? `<span title="Sponsor's code: ${user.referred_by_code || ''}">${user.referred_by_username}${user.referred_by_code ? ` <small style="color:#9ca3af;">(${user.referred_by_code})</small>` : ''}</span>`
                        : '<span style="color:#9ca3af;">Admin code / none</span>'}</td>
                <td><span class="badge-status ${user.role === 'admin' ? 'approved' : 'pending'}">${user.role.toUpperCase()}</span></td>
                <td>${formatStatus(user.status)}</td>
                <td>VIP ${user.vip_level}</td>
                <td>${formatCurrency(user.balance || 0)}</td>
                <td>${formatDate(user.created_at)}</td>
                <td>${user.last_login ? formatDate(user.last_login) : 'Never'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editUser(${user.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${user.status === 'active' ? 
                        `<button class="btn btn-sm btn-warning" onclick="suspendUser(${user.id})">
                            <i class="fas fa-ban"></i>
                        </button>` :
                        `<button class="btn btn-sm btn-success" onclick="activateUser(${user.id})">
                            <i class="fas fa-check"></i>
                        </button>`
                    }
                </td>
            </tr>
        `).join('');

        renderPagination();
    } else if (!silent) {
        // On a silent auto-refresh, keep the last good table rather than
        // replacing it with an error (e.g. a brief network blip).
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-danger">Failed to load users</td></tr>';
    }
}

// Render pagination
function renderPagination() {
    const pagination = document.getElementById('pagination');
    let html = '';

    // Previous button
    html += `<button onclick="loadUsers(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left"></i>
    </button>`;

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="${i === currentPage ? 'active' : ''}" onclick="loadUsers(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += '<button disabled>...</button>';
        }
    }

    // Next button
    html += `<button onclick="loadUsers(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        <i class="fas fa-chevron-right"></i>
    </button>`;

    pagination.innerHTML = html;
}

// Search users
function searchUsers() {
    const searchInput = document.getElementById('searchInput').value;
    filters.search = searchInput;
    loadUsers(1);
}

// Filter users
function filterUsers() {
    filters.status = document.getElementById('statusFilter').value;
    filters.role = document.getElementById('roleFilter').value;
    filters.vipLevel = document.getElementById('vipFilter').value;
    loadUsers(1);
}

// Edit user
async function editUser(userId) {
    const data = await apiRequest(`/admin/users?userId=${userId}`);

    if (data && data.success) {
        const users = data.data.users;
        if (users.length > 0) {
            const user = users[0];
            
            document.getElementById('userId').value = user.id;
            document.getElementById('username').value = user.username;
            document.getElementById('email').value = user.email;
            document.getElementById('status').value = user.status;
            document.getElementById('vipLevel').value = user.vip_level;
            document.getElementById('country').value = user.country || '';
            document.getElementById('phone').value = user.phone || '';

            // Always start the reset-password field blank; it is never
            // pre-filled (the real password is hashed and unknowable).
            const pw = document.getElementById('newUserPassword');
            if (pw) pw.value = '';
            const eye = document.getElementById('newPwEye');
            if (pw) pw.type = 'password';
            if (eye) eye.className = 'fas fa-eye';

            document.getElementById('userModal').classList.add('active');
        }
    }
}

// Close modal
function closeModal() {
    document.getElementById('userModal').classList.remove('active');
}

// Show/hide the "Set New Password" field.
function toggleNewPwVisibility() {
    const input = document.getElementById('newUserPassword');
    const eye = document.getElementById('newPwEye');
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (eye) eye.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        if (eye) eye.className = 'fas fa-eye';
    }
}

// Client-side password rule check, matching the backend + the customer UI.
function isStrongPassword(pw) {
    return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

// Handle form submission
// Real-time: refresh the user list (and their balances) automatically.
document.addEventListener('DOMContentLoaded', () => {
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(() => loadUsers(currentPage, true));
    }
});

document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = document.getElementById('userId').value;
    const status = document.getElementById('status').value;
    const vipLevel = document.getElementById('vipLevel').value;
    const newPassword = (document.getElementById('newUserPassword')?.value || '').trim();

    // If a new password was entered, validate it before doing anything.
    if (newPassword && !isStrongPassword(newPassword)) {
        showNotification('Password must be at least 8 characters with an uppercase, lowercase, and a number.', 'error');
        return;
    }

    // Update status
    const statusData = await apiRequest(`/admin/user/${userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
    });

    // Update VIP level
    const vipData = await apiRequest(`/admin/user/${userId}/vip`, {
        method: 'PUT',
        body: JSON.stringify({ level: parseInt(vipLevel) })
    });

    // Optionally reset the password (customer-service recovery).
    let pwOk = true;
    if (newPassword) {
        const pwData = await apiRequest(`/admin/user/${userId}/password`, {
            method: 'PUT',
            body: JSON.stringify({ newPassword })
        });
        pwOk = !!(pwData && pwData.success);
        if (!pwOk) {
            showNotification((pwData && pwData.message) || 'Failed to set new password', 'error');
        }
    }

    if (statusData && statusData.success && vipData && vipData.success && pwOk) {
        showNotification(
            newPassword ? 'User updated and password reset successfully' : 'User updated successfully',
            'success'
        );
        closeModal();
        loadUsers(currentPage);
    } else if (!pwOk) {
        // password error already shown; keep modal open so support can retry
    } else {
        showNotification('Failed to update user', 'error');
    }
});

// Suspend user
async function suspendUser(userId) {
    if (!confirm('Are you sure you want to suspend this user?')) {
        return;
    }

    const data = await apiRequest(`/admin/user/${userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'suspended' })
    });

    if (data && data.success) {
        showNotification('User suspended', 'success');
        loadUsers(currentPage);
    } else {
        showNotification('Failed to suspend user', 'error');
    }
}

// Activate user
async function activateUser(userId) {
    const data = await apiRequest(`/admin/user/${userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'active' })
    });

    if (data && data.success) {
        showNotification('User activated', 'success');
        loadUsers(currentPage);
    } else {
        showNotification('Failed to activate user', 'error');
    }
}

// Export users
async function exportUsers() {
    showNotification('Exporting users...', 'info');
    
    const data = await apiRequest('/admin/users?limit=1000');
    
    if (data && data.success) {
        const users = data.data.users;
        
        // Create CSV
        const csv = [
            ['ID', 'Username', 'Email', 'Role', 'Status', 'VIP Level', 'Created', 'Last Login'].join(','),
            ...users.map(u => [
                u.id,
                u.username,
                u.email,
                u.role,
                u.status,
                u.vip_level,
                u.created_at,
                u.last_login || 'Never'
            ].join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();

        showNotification('Users exported successfully', 'success');
    }
}

// Close modal on outside click
document.getElementById('userModal').addEventListener('click', (e) => {
    if (e.target.id === 'userModal') {
        closeModal();
    }
});

// Load users on page load
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
});
