// Withdrawals Management
//
// Mirrors deposits.js. The important difference: when a user submits a
// withdrawal the backend already moved the amount out of balance into
// frozen_balance. Approving finalises it; rejecting returns it to balance.
// Either way the funds must not stay frozen indefinitely.

let currentFilter = 'pending';
let currentPage = 1;
let currentTransactionId = null;

// Load withdrawals
async function loadWithdrawals(page = 1, silent = false) {
    currentPage = page;
    const tbody = document.getElementById('withdrawalsTableBody');
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading...</td></tr>';
    }

    const data = await apiRequest(
        `/admin/transactions?type=withdraw&status=${currentFilter}&page=${page}`
    );

    if (!data || !data.success) {
        if (!silent) {
            tbody.innerHTML =
                '<tr><td colspan="8" class="text-center text-danger">Failed to load withdrawals</td></tr>';
        }
        return;
    }

    const transactions = data.data.transactions;

    updateCounts();

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No withdrawals found</td></tr>';
        return;
    }

    // Usernames, emails and payout addresses are user-supplied, so escape them.
    tbody.innerHTML = transactions.map(txn => `
        <tr>
            <td>#${Number(txn.id)}</td>
            <td>
                <strong>${escapeHtml(txn.username)}</strong><br>
                <small>${escapeHtml(txn.email)}</small>
            </td>
            <td><strong>${formatCurrency(txn.amount)}</strong></td>
            <td>${escapeHtml(txn.payment_method || 'USDT')}</td>
            <td>${formatStatus(txn.status)}</td>
            <td><small>${escapeHtml(payoutAddress(txn))}</small></td>
            <td>${formatDate(txn.created_at)}</td>
            <td>
                ${txn.status === 'pending'
                    ? `<button class="btn btn-sm btn-primary" onclick="reviewWithdrawal(${Number(txn.id)})">
                           <i class="fas fa-eye"></i> Review
                       </button>`
                    : `<button class="btn btn-sm btn-secondary" onclick="viewWithdrawal(${Number(txn.id)})">
                           <i class="fas fa-info-circle"></i> Details
                       </button>`
                }
            </td>
        </tr>
    `).join('');
}

/**
 * account_details is stored as a JSON string by the withdrawal form.
 * Fall back gracefully if it is malformed or absent.
 */
function payoutAddress(txn) {
    if (!txn.account_details) {
        return txn.payment_address || '-';
    }
    try {
        const parsed = JSON.parse(txn.account_details);
        return parsed.address || '-';
    } catch (err) {
        return String(txn.account_details);
    }
}

/**
 * Refresh the per-status tab counters using server-side totals.
 */
async function updateCounts() {
    const targets = {
        pending: 'pendingCount',
        completed: 'completedCount',
        rejected: 'rejectedCount'
    };

    await Promise.all(
        Object.entries(targets).map(async ([status, elementId]) => {
            const data = await apiRequest(
                `/admin/transactions?type=withdraw&status=${status}&limit=1`
            );
            const el = document.getElementById(elementId);
            if (el && data && data.success) {
                el.textContent = data.data.pagination.total ?? 0;
            }
        })
    );
}

function filterWithdrawals(status, buttonEl) {
    currentFilter = status;

    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

    const activeTab = buttonEl
        ? buttonEl.closest('.tab')
        : document.querySelector(`.tab[data-status="${status}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    loadWithdrawals(1);
}

/**
 * Open the review modal for one withdrawal.
 *
 * @param {number} transactionId
 * @param {boolean} readOnly Hide approve/reject for already-resolved records.
 */
async function reviewWithdrawal(transactionId, readOnly = false) {
    currentTransactionId = transactionId;

    const data = await apiRequest(`/admin/transactions?transactionId=${transactionId}`);

    if (!data || !data.success || !data.data.transactions.length) {
        showNotification('Could not load that withdrawal', 'error');
        return;
    }

    const txn = data.data.transactions[0];

    // Never let the admin act on one record while reading another's details.
    if (Number(txn.id) !== Number(transactionId)) {
        showNotification('Withdrawal details did not match the selected record', 'error');
        return;
    }

    document.getElementById('withdrawalDetails').innerHTML = `
        <div class="detail-row">
            <strong>Transaction ID:</strong>
            <span>#${Number(txn.id)}</span>
        </div>
        <div class="detail-row">
            <strong>Reference:</strong>
            <span>${escapeHtml(txn.transaction_number)}</span>
        </div>
        <div class="detail-row">
            <strong>User:</strong>
            <span>${escapeHtml(txn.username)} (${escapeHtml(txn.email)})</span>
        </div>
        <div class="detail-row">
            <strong>Amount:</strong>
            <span style="font-size: 20px; font-weight: 700; color: var(--danger-color, #ef4444);">
                ${formatCurrency(txn.amount)}
            </span>
        </div>
        <div class="detail-row">
            <strong>Network:</strong>
            <span>${escapeHtml(txn.payment_method || 'USDT')}</span>
        </div>
        <div class="detail-row">
            <strong>Payout address:</strong>
            <span style="word-break: break-all;">${escapeHtml(payoutAddress(txn))}</span>
        </div>
        <div class="detail-row">
            <strong>Status:</strong>
            <span>${formatStatus(txn.status)}</span>
        </div>
        <div class="detail-row">
            <strong>Requested:</strong>
            <span>${formatDate(txn.created_at)}</span>
        </div>
        ${txn.admin_notes ? `
            <div class="detail-row">
                <strong>Admin notes:</strong>
                <span>${escapeHtml(txn.admin_notes)}</span>
            </div>
        ` : ''}
    `;

    const actions = document.querySelector('.modal-actions');
    if (actions) {
        actions.style.display = (readOnly || txn.status !== 'pending') ? 'none' : 'flex';
    }

    document.getElementById('reviewModal').classList.add('active');
}

function viewWithdrawal(transactionId) {
    reviewWithdrawal(transactionId, true);
}

// Approve withdrawal: releases the frozen amount and records it as withdrawn.
async function approveWithdrawal() {
    if (!confirm('Approve this withdrawal? Send the funds before confirming, as this finalises the deduction.')) {
        return;
    }

    const data = await apiRequest(`/admin/transaction/${currentTransactionId}/approve`, {
        method: 'POST'
    });

    if (data && data.success) {
        showNotification('Withdrawal approved', 'success');
        closeReviewModal();
        loadWithdrawals(currentPage);
    } else {
        showNotification(data?.message || 'Failed to approve withdrawal', 'error');
    }
}

// Reject withdrawal: returns the frozen amount to the user's spendable balance.
async function rejectWithdrawal() {
    // Reject immediately — no reason required. The frozen amount is returned
    // to the user's balance. A default note is stored for the record.
    if (!confirm('Reject this withdrawal? The amount returns to the user\'s balance.')) {
        return;
    }

    const data = await apiRequest(`/admin/transaction/${currentTransactionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Rejected by admin' })
    });

    if (data && data.success) {
        showNotification('Withdrawal rejected and funds returned', 'success');
        closeReviewModal();
        loadWithdrawals(currentPage);
    } else {
        showNotification(data?.message || 'Failed to reject withdrawal', 'error');
    }
}

function closeReviewModal() {
    document.getElementById('reviewModal').classList.remove('active');
    const actions = document.querySelector('.modal-actions');
    if (actions) {
        actions.style.display = 'flex';
    }
    currentTransactionId = null;
}

document.addEventListener('DOMContentLoaded', () => {
    loadWithdrawals();

    // Real-time auto-refresh (shared poller pauses while a review modal is open).
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(() => loadWithdrawals(currentPage, true));
    }
});
