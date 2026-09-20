// Task Permissions Management
// Admin approves a customer to work: one approval grants a BATCH of task starts
// (default 25). The customer keeps grabbing until the batch is used up, then
// needs a fresh approval. Approve -> "Confirm" (different colour) once active.

let currentPage = 1;
let totalPages = 1;
let searchTerm = '';

// Load the user permission-status list.
// `silent` = true (from the auto-refresh poller) updates the table in place
// without blanking it to "Loading..." first, so it refreshes smoothly.
async function loadPermissions(page = 1, silent = false) {
    currentPage = page;
    const tbody = document.getElementById('permissionsTableBody');
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading...</td></tr>';
    }

    const queryParams = new URLSearchParams({
        page,
        limit: 20,
        search: searchTerm
    });

    const data = await apiRequest(`/admin/task-permissions?${queryParams}`);

    if (data && data.success) {
        const users = data.data.users;
        totalPages = data.data.pagination.totalPages || 1;

        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No users found</td></tr>';
            renderPagination();
            return;
        }

        tbody.innerHTML = users.map(user => {
            const available = Number(user.available_permissions) || 0; // remaining task starts
            const batchTotal = Number(user.batch_size) || 0;
            const batchUsed = Number(user.batch_used) || 0;
            const timesRequested = Number(user.times_requested) || 0; // approvals granted
            const hasActiveBatch = available > 0;
            const lastGranted = user.last_granted_at ? formatDate(user.last_granted_at) : '—';
            const uname = escapeHtml(user.username);

            // Show remaining + progress through the active batch, e.g. "24 left (1/25)".
            const permCell = hasActiveBatch
                ? `<span class="perm-count has">${available} left</span>
                   <div class="batch-progress">${batchUsed}/${batchTotal} used</div>`
                : `<span class="perm-count none">0</span>`;

            // How many times this customer has been approved to work.
            const requestedCell = `<span class="perm-count ${timesRequested > 0 ? 'has' : 'none'}">${timesRequested}</span>`;

            // Once approved (an active batch exists), the button turns a
            // different colour and reads "Confirm". It is disabled while the
            // batch is active — no new approval can be granted until the
            // customer finishes the current 25 tasks (or the admin rejects).
            const approveBtn = hasActiveBatch
                ? `<button class="btn btn-sm btn-confirm" disabled title="Batch active — no new approval until these tasks are completed">
                       <i class="fas fa-circle-check"></i> Confirm
                   </button>`
                : `<button class="btn btn-sm btn-success" onclick="grantPermission(${user.id}, '${uname}')">
                       <i class="fas fa-check"></i> Approve
                   </button>`;

            // Combo: opens the modal to set one or more (order number + amount)
            // combos. If any are pending, the modal pre-fills them; the button
            // shows how many are set, plus a small cancel (×) to clear all.
            const combos = Array.isArray(user.combos) ? user.combos : [];
            const combosJson = escapeHtml(JSON.stringify(combos));
            // Show the target order # and amount right on the button, e.g.
            // "Combo #4 · 50" (or "#4·50, #8·120" for several).
            const comboSummary = combos
                .map(c => `#${c.triggerOrder}·${c.amount}`)
                .join(', ');
            const comboBtn = combos.length
                ? `<button class="btn btn-sm btn-combo" onclick='grantCombo(${user.id}, "${uname}", ${combosJson})' title="Combo target(s): ${comboSummary} — click to edit">
                       <i class="fas fa-gift"></i> ${escapeHtml(comboSummary)}
                   </button>
                   <button class="btn btn-sm btn-danger" onclick="cancelCombo(${user.id}, '${uname}')" title="Cancel all combos">
                       <i class="fas fa-xmark"></i>
                   </button>`
                : `<button class="btn btn-sm btn-combo" onclick='grantCombo(${user.id}, "${uname}")'>
                       <i class="fas fa-gift"></i> Combo
                   </button>`;

            return `
                <tr>
                    <td><strong>#${user.id}</strong></td>
                    <td>${uname}</td>
                    <td>${escapeHtml(user.email || '—')}</td>
                    <td>${formatCurrency(user.balance || 0)}</td>
                    <td>${permCell}</td>
                    <td>${requestedCell}</td>
                    <td>${lastGranted}</td>
                    <td>
                        ${approveBtn}
                        ${comboBtn}
                        <button class="btn btn-sm btn-danger" onclick="revokePermission(${user.id}, '${uname}')" ${hasActiveBatch ? '' : 'disabled'}>
                            <i class="fas fa-xmark"></i> Reject
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="viewHistory(${user.id}, '${uname}')">
                            <i class="fas fa-clock-rotate-left"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        renderPagination();
    } else if (!silent) {
        // Keep the last good table on a silent auto-refresh failure.
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Failed to load permissions</td></tr>';
    }
}

// Render pagination
function renderPagination() {
    const pagination = document.getElementById('pagination');
    let html = '';

    html += `<button onclick="loadPermissions(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left"></i>
    </button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="${i === currentPage ? 'active' : ''}" onclick="loadPermissions(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += '<button disabled>...</button>';
        }
    }

    html += `<button onclick="loadPermissions(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        <i class="fas fa-chevron-right"></i>
    </button>`;

    pagination.innerHTML = html;
}

// Search (debounced)
let searchTimer = null;
function searchPermissions() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        searchTerm = document.getElementById('searchInput').value.trim();
        loadPermissions(1);
    }, 300);
}

// Approve: grant a batch of task starts to a user (default 25 tasks)
// Approve: open a confirmation modal where the admin confirms and can set how
// many tasks this approval covers (defaults to 25).
function grantPermission(userId, username) {
    document.getElementById('approveUserId').value = userId;
    document.getElementById('approveForUser').textContent = `Customer: ${username} (#${userId})`;
    document.getElementById('approveBatchSize').value = 25;
    document.getElementById('approveModal').classList.add('active');
}

function closeApproveModal() {
    document.getElementById('approveModal').classList.remove('active');
}

// Do the approval with the chosen batch size.
async function confirmApprove() {
    const userId = document.getElementById('approveUserId').value;
    const batchSize = parseInt(document.getElementById('approveBatchSize').value, 10);
    if (!batchSize || batchSize < 1) {
        showNotification('Enter a valid number of tasks (1 or more)', 'error');
        return;
    }

    const data = await apiRequest(`/admin/task-permissions/${userId}/grant`, {
        method: 'POST',
        body: JSON.stringify({ batchSize })
    });

    if (data && data.success) {
        showNotification(data.message || 'Approved', 'success');
        closeApproveModal();
        loadPermissions(currentPage);
    } else if (data && data.code === 'BATCH_ACTIVE') {
        // Customer still working through the current batch.
        showNotification(data.message, 'warning');
        closeApproveModal();
        loadPermissions(currentPage);
    } else {
        showNotification((data && data.message) || 'Failed to approve', 'error');
    }
}

// Combo: open the modal to configure one or more combo orders (order number +
// amount) for a customer. Pre-fills existing combos if any are pending.
function grantCombo(userId, username, existingCombos) {
    document.getElementById('comboUserId').value = userId;
    document.getElementById('comboForUser').textContent = `Customer: ${username} (#${userId})`;

    const container = document.getElementById('comboRows');
    container.innerHTML = '';

    const list = Array.isArray(existingCombos) && existingCombos.length ? existingCombos : [null];
    list.forEach(c => addComboRow(c ? c.triggerOrder : '', c ? c.amount : ''));

    document.getElementById('comboModal').classList.add('active');
}

// Add one combo input row (order number + amount + remove button).
function addComboRow(orderVal, amountVal) {
    const container = document.getElementById('comboRows');
    const row = document.createElement('div');
    row.className = 'combo-row';
    row.innerHTML = `
        <div class="combo-field">
            <label>Order #</label>
            <input type="number" class="combo-order" min="1" step="1" placeholder="e.g. 6" value="${orderVal != null ? orderVal : ''}">
        </div>
        <div class="combo-field">
            <label>Amount (USDT)</label>
            <input type="number" class="combo-amount" min="1" step="0.01" placeholder="e.g. 493.09" value="${amountVal != null ? amountVal : ''}">
        </div>
        <button type="button" class="combo-remove" title="Remove" onclick="this.closest('.combo-row').remove()">
            <i class="fas fa-xmark"></i>
        </button>
    `;
    container.appendChild(row);
}

function closeComboModal() {
    document.getElementById('comboModal').classList.remove('active');
}

// Save all combos configured in the modal.
async function saveCombo() {
    const userId = document.getElementById('comboUserId').value;
    const rows = document.querySelectorAll('#comboRows .combo-row');

    const combos = [];
    const seen = new Set();
    for (const row of rows) {
        const triggerOrder = parseInt(row.querySelector('.combo-order').value, 10);
        const amount = parseFloat(row.querySelector('.combo-amount').value);
        if (!triggerOrder || triggerOrder < 1) {
            showNotification('Each combo needs an order number of 1 or more', 'error');
            return;
        }
        if (!(amount > 0)) {
            showNotification('Each combo needs an amount greater than 0', 'error');
            return;
        }
        if (seen.has(triggerOrder)) {
            showNotification(`Duplicate order number ${triggerOrder}. Use a different order for each combo.`, 'error');
            return;
        }
        seen.add(triggerOrder);
        combos.push({ triggerOrder, amount });
    }

    if (!combos.length) {
        showNotification('Add at least one combo', 'error');
        return;
    }

    const data = await apiRequest(`/admin/task-permissions/${userId}/combo-plan`, {
        method: 'POST',
        body: JSON.stringify({ combos })
    });

    if (data && data.success) {
        showNotification(data.message || 'Combo(s) set', 'success');
        closeComboModal();
        loadPermissions(currentPage);
    } else {
        showNotification((data && data.message) || 'Failed to set combo', 'error');
    }
}

// Cancel a pending combo plan for a user.
async function cancelCombo(userId, username) {
    if (!confirm(`Cancel the pending combo for ${username}?`)) return;
    const data = await apiRequest(`/admin/task-permissions/${userId}/combo-plan/cancel`, {
        method: 'POST',
        body: JSON.stringify({})
    });
    if (data && data.success) {
        showNotification(data.message || 'Combo cancelled', 'success');
        loadPermissions(currentPage);
    } else {
        showNotification((data && data.message) || 'Failed to cancel combo', 'error');
    }
}

// Reject: revoke all pending (unused) permissions for a user
async function revokePermission(userId, username) {
    if (!confirm(`Reject / revoke ${username}'s pending permission(s)?`)) {
        return;
    }

    const data = await apiRequest(`/admin/task-permissions/${userId}/revoke`, {
        method: 'POST',
        body: JSON.stringify({})
    });

    if (data && data.success) {
        showNotification(data.message || 'Rejected', 'success');
        loadPermissions(currentPage);
    } else {
        showNotification((data && data.message) || 'Failed to reject', 'error');
    }
}

// View permission history for a user
async function viewHistory(userId, username) {
    document.getElementById('historyTitle').textContent = `Permission History — ${username}`;
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';
    document.getElementById('historyModal').classList.add('active');

    const data = await apiRequest(`/admin/task-permissions/${userId}/history`);

    if (data && data.success) {
        const rows = data.data;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No history yet</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>#${r.id}</td>
                <td>${formatStatus(r.status)}</td>
                <td>${escapeHtml(r.granted_by_username || 'System')}</td>
                <td>${r.task_id ? '#' + r.task_id : '—'}</td>
                <td>${formatDate(r.created_at)}</td>
                <td>${r.used_at ? formatDate(r.used_at) : '—'}</td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load history</td></tr>';
    }
}

function closeHistory() {
    document.getElementById('historyModal').classList.remove('active');
}

// Close modal on outside click
document.getElementById('historyModal').addEventListener('click', (e) => {
    if (e.target.id === 'historyModal') {
        closeHistory();
    }
});

// Close combo modal on outside click
const comboModalEl = document.getElementById('comboModal');
if (comboModalEl) {
    comboModalEl.addEventListener('click', (e) => {
        if (e.target.id === 'comboModal') {
            closeComboModal();
        }
    });
}

// Close approve modal on outside click
const approveModalEl = document.getElementById('approveModal');
if (approveModalEl) {
    approveModalEl.addEventListener('click', (e) => {
        if (e.target.id === 'approveModal') {
            closeApproveModal();
        }
    });
}

// Load on page load
document.addEventListener('DOMContentLoaded', () => {
    loadPermissions();

    // Real-time: keep the permission/combo status current automatically.
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(() => loadPermissions(currentPage, true));
    }
});
