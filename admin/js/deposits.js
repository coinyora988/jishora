// Deposits Management
let currentFilter = 'pending';
let currentPage = 1;
let currentTransactionId = null;

// Base URL for files served by the API (uploads live on the backend, e.g.
// http://host:5000/uploads/...). API_URL ends with "/api" — strip that.
const FILE_BASE = (typeof API_URL === 'string' ? API_URL : '').replace(/\/api\/?$/, '');

// Turn a stored proof_image value into a usable image src, or null if it's a
// legacy plain filename (old deposits stored only the file name, not a file).
function proofImageSrc(proof) {
    if (!proof) return null;
    const p = String(proof);
    if (/^https?:\/\//i.test(p)) return p;                 // absolute URL
    if (p.startsWith('/uploads/')) return FILE_BASE + p;   // uploaded file on the API
    return null;                                           // legacy: just a filename
}

// Build the "Proof" row: a clickable thumbnail when we have a real image,
// otherwise just the filename text (legacy deposits).
function renderProofBlock(proof) {
    const src = proofImageSrc(proof);
    if (src) {
        return `
            <div class="detail-row proof-row">
                <strong>Proof:</strong>
                <span>
                    <img src="${src}" alt="Deposit proof" class="proof-thumb"
                         onclick="openProofLightbox('${src.replace(/'/g, "\\'")}')"
                         onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'text-muted',textContent:'Image could not be loaded'}))">
                    <small class="proof-hint">Click to enlarge</small>
                </span>
            </div>`;
    }
    return `
        <div class="detail-row">
            <strong>Proof filename:</strong>
            <span>${escapeHtml(proof)} <small class="text-muted">(no image uploaded)</small></span>
        </div>`;
}

// Full-size proof image popup (lightbox) with a close button.
function openProofLightbox(src) {
    let lb = document.getElementById('proofLightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'proofLightbox';
        lb.className = 'proof-lightbox';
        lb.innerHTML = `
            <div class="proof-lightbox-inner">
                <button class="proof-lightbox-close" onclick="closeProofLightbox()" aria-label="Close">&times;</button>
                <img id="proofLightboxImg" src="" alt="Deposit proof">
            </div>`;
        // Click the dark backdrop (but not the image) to close.
        lb.addEventListener('click', (e) => { if (e.target === lb) closeProofLightbox(); });
        document.body.appendChild(lb);
        // Escape key closes it too.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeProofLightbox();
        });
    }
    document.getElementById('proofLightboxImg').src = src;
    lb.classList.add('active');
}

function closeProofLightbox() {
    const lb = document.getElementById('proofLightbox');
    if (lb) lb.classList.remove('active');
}

// Load deposits. `silent` (from auto-refresh) updates in place without the
// "Loading..." flash so the table refreshes smoothly.
async function loadDeposits(page = 1, silent = false) {
    currentPage = page;
    const tbody = document.getElementById('depositsTableBody');
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading...</td></tr>';
    }

    const data = await apiRequest(`/admin/transactions?type=deposit&status=${currentFilter}&page=${page}`);

    if (data && data.success) {
        const transactions = data.data.transactions;
        
        // Update counts
        updateCounts();

        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No deposits found</td></tr>';
            return;
        }

        // Usernames, emails and proof filenames are user-supplied, so they are
        // escaped before being interpolated into markup.
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
                <td>
                    ${txn.proof_image
                        ? `<span class="text-muted" title="Uploaded by user">
                             <i class="fas fa-image"></i> ${escapeHtml(txn.proof_image)}
                           </span>`
                        : '<span class="text-muted">No proof</span>'}
                </td>
                <td>${formatDate(txn.created_at)}</td>
                <td>
                    ${txn.status === 'pending' ? 
                        `<button class="btn btn-sm btn-primary" onclick="reviewDeposit(${Number(txn.id)})">
                            <i class="fas fa-eye"></i> Review
                        </button>` :
                        `<button class="btn btn-sm btn-secondary" onclick="viewDeposit(${Number(txn.id)})">
                            <i class="fas fa-info-circle"></i> Details
                        </button>`
                    }
                </td>
            </tr>
        `).join('');
    } else if (!silent) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Failed to load deposits</td></tr>';
    }
}

/**
 * Refresh the per-status tab counters.
 *
 * Each status is counted server-side via pagination.total. The previous version
 * fetched one unfiltered page and counted it in JS, so any deposit beyond the
 * 50-row page limit was missing from the totals.
 */
async function updateCounts() {
    const targets = {
        pending: 'pendingCount',
        completed: 'completedCount',
        rejected: 'rejectedCount'
    };

    await Promise.all(
        Object.entries(targets).map(async ([status, elementId]) => {
            // limit=1 because only the total is needed, not the rows.
            const data = await apiRequest(
                `/admin/transactions?type=deposit&status=${status}&limit=1`
            );
            const el = document.getElementById(elementId);
            if (el && data && data.success) {
                el.textContent = data.data.pagination.total ?? 0;
            }
        })
    );
}

/**
 * Switch the active status tab.
 * The button is passed explicitly rather than relying on the implicit global
 * `event`, which is non-standard and undefined in strict contexts.
 */
function filterDeposits(status, buttonEl) {
    currentFilter = status;

    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

    const activeTab = buttonEl
        ? buttonEl.closest('.tab')
        : document.querySelector(`.tab[data-status="${status}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    loadDeposits(1);
}

/**
 * Open the review modal for one deposit.
 *
 * @param {number} transactionId
 * @param {boolean} readOnly Hide approve/reject for already-resolved deposits.
 */
async function reviewDeposit(transactionId, readOnly = false) {
    currentTransactionId = transactionId;

    const data = await apiRequest(`/admin/transactions?transactionId=${transactionId}`);

    if (!data || !data.success || !data.data.transactions.length) {
        showNotification('Could not load that deposit', 'error');
        return;
    }

    const txn = data.data.transactions[0];

    // Confirm the API returned the transaction we actually asked for. If the
    // filter were ever ignored again, this stops an admin approving one
    // deposit while reading another one's details.
    if (Number(txn.id) !== Number(transactionId)) {
        showNotification('Deposit details did not match the selected record', 'error');
        return;
    }

    document.getElementById('depositDetails').innerHTML = `
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
            <span style="font-size: 20px; font-weight: 700; color: var(--success-color);">
                ${formatCurrency(txn.amount)}
            </span>
        </div>
        <div class="detail-row">
            <strong>Payment Method:</strong>
            <span>${escapeHtml(txn.payment_method || 'USDT')}</span>
        </div>
        <div class="detail-row">
            <strong>Status:</strong>
            <span>${formatStatus(txn.status)}</span>
        </div>
        <div class="detail-row">
            <strong>Date:</strong>
            <span>${formatDate(txn.created_at)}</span>
        </div>
        ${txn.proof_image ? renderProofBlock(txn.proof_image) : `
            <div class="detail-row">
                <strong>Proof:</strong>
                <span class="text-muted">No proof provided</span>
            </div>
        `}
        ${txn.admin_notes ? `
            <div class="detail-row">
                <strong>Admin notes:</strong>
                <span>${escapeHtml(txn.admin_notes)}</span>
            </div>
        ` : ''}
    `;

    // Only pending deposits can be acted on; the server enforces this too.
    const actions = document.querySelector('.modal-actions');
    if (actions) {
        actions.style.display = (readOnly || txn.status !== 'pending') ? 'none' : 'flex';
    }

    document.getElementById('reviewModal').classList.add('active');
}

// View a resolved deposit in read-only mode.
function viewDeposit(transactionId) {
    // Passing the flag through avoids the previous race, where the buttons were
    // hidden before the async fetch had opened the modal.
    reviewDeposit(transactionId, true);
}

// Approve deposit
async function approveDeposit() {
    if (!confirm('Approve this deposit? The amount will be added to user\'s wallet.')) {
        return;
    }

    const data = await apiRequest(`/admin/transaction/${currentTransactionId}/approve`, {
        method: 'POST'
    });

    if (data && data.success) {
        showNotification('Deposit approved successfully', 'success');
        closeReviewModal();
        loadDeposits(currentPage);
    } else {
        showNotification(data?.message || 'Failed to approve deposit', 'error');
    }
}

// Reject deposit
async function rejectDeposit() {
    // Reject immediately — no reason required. A default note is stored so the
    // record still shows why it was declined.
    if (!confirm('Reject this deposit?')) {
        return;
    }

    const data = await apiRequest(`/admin/transaction/${currentTransactionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Rejected by admin' })
    });

    if (data && data.success) {
        showNotification('Deposit rejected', 'success');
        closeReviewModal();
        loadDeposits(currentPage);
    } else {
        showNotification(data?.message || 'Failed to reject deposit', 'error');
    }
}

// Close review modal
function closeReviewModal() {
    document.getElementById('reviewModal').classList.remove('active');
    document.querySelector('.modal-actions').style.display = 'flex';
    currentTransactionId = null;
}

// Load deposits on page load
document.addEventListener('DOMContentLoaded', () => {
    loadDeposits();

    // Real-time auto-refresh (shared poller pauses while a review modal is open).
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(() => loadDeposits(currentPage, true));
    }
});
