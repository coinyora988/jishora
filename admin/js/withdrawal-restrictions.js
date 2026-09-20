/**
 * Withdrawal Restrictions admin page.
 *
 * Lets an admin block/unblock a specific customer from withdrawing, with a
 * custom message the customer sees on their withdraw page. Uses:
 *   - GET  /admin/users?search=...            to look up a user by username/email
 *   - PUT  /admin/user/:id/withdrawal-restriction  { locked, reason }
 *   - GET  /admin/users?limit=1000            to list currently restricted users
 */

// Find one user by username or email. Returns the user object or null.
async function findUser(identifier) {
    const q = encodeURIComponent(identifier);
    const data = await apiRequest(`/admin/users?search=${q}&limit=50`);
    if (!data || !data.success) return null;
    const list = (data.data && data.data.users) || [];
    const ident = identifier.trim().toLowerCase();
    // Prefer an exact username/email match; fall back to the first result.
    return list.find(u =>
        String(u.username).toLowerCase() === ident ||
        String(u.email).toLowerCase() === ident
    ) || list[0] || null;
}

async function applyRestriction() {
    const username = document.getElementById('wrUsername').value.trim();
    const reason = document.getElementById('wrReason').value.trim();

    if (!username) {
        showNotification('Enter a customer username or email', 'error');
        return;
    }
    if (!reason) {
        showNotification('Write the restriction message the customer will see', 'error');
        return;
    }

    const user = await findUser(username);
    if (!user) {
        showNotification(`No customer found for "${username}"`, 'error');
        return;
    }

    const res = await apiRequest(`/admin/user/${user.id}/withdrawal-restriction`, {
        method: 'PUT',
        body: JSON.stringify({ locked: true, reason })
    });

    if (res && res.success) {
        showNotification(res.message || 'Restriction applied', 'success');
        document.getElementById('wrReason').value = '';
        loadRestricted();
    } else {
        showNotification((res && res.message) || 'Failed to apply restriction', 'error');
    }
}

async function clearRestriction() {
    const username = document.getElementById('wrUsername').value.trim();
    if (!username) {
        showNotification('Enter the customer username or email to unlock', 'error');
        return;
    }

    const user = await findUser(username);
    if (!user) {
        showNotification(`No customer found for "${username}"`, 'error');
        return;
    }

    const res = await apiRequest(`/admin/user/${user.id}/withdrawal-restriction`, {
        method: 'PUT',
        body: JSON.stringify({ locked: false })
    });

    if (res && res.success) {
        showNotification(res.message || 'Restriction removed', 'success');
        loadRestricted();
    } else {
        showNotification((res && res.message) || 'Failed to remove restriction', 'error');
    }
}

// Remove a restriction directly from the table row.
async function removeRestrictionById(userId, username) {
    if (!confirm(`Remove the withdrawal restriction from ${username}?`)) return;
    const res = await apiRequest(`/admin/user/${userId}/withdrawal-restriction`, {
        method: 'PUT',
        body: JSON.stringify({ locked: false })
    });
    if (res && res.success) {
        showNotification('Restriction removed', 'success');
        loadRestricted();
    } else {
        showNotification((res && res.message) || 'Failed to remove restriction', 'error');
    }
}

// Load and render all currently restricted customers.
async function loadRestricted(silent = false) {
    const tbody = document.getElementById('restrictedTableBody');
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
    }

    const data = await apiRequest('/admin/withdrawal-restrictions');
    if (!data || !data.success) {
        if (!silent) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load</td></tr>';
        }
        return;
    }

    const restricted = data.data || [];

    if (restricted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No customers are currently restricted.</td></tr>';
        return;
    }

    tbody.innerHTML = restricted.map(u => `
        <tr>
            <td>#${Number(u.id)}</td>
            <td><strong>${escapeHtml(u.username)}</strong></td>
            <td>${escapeHtml(u.email)}</td>
            <td class="wr-msg-cell">${escapeHtml(u.withdrawal_lock_reason || '')}</td>
            <td>
                <button class="btn btn-sm btn-success"
                        onclick="removeRestrictionById(${Number(u.id)}, '${escapeHtml(u.username).replace(/'/g, "\\'")}')">
                    <i class="fas fa-unlock"></i> Remove
                </button>
            </td>
        </tr>
    `).join('');
}

// Prefill the username box when arriving with ?user=... (handy from Users page).
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get('user');
    if (preset) document.getElementById('wrUsername').value = preset;
    loadRestricted();

    // Real-time: refresh the restricted-customers list automatically.
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(() => loadRestricted(true));
    }
});
