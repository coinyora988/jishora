/**
 * Settings Page
 *
 * Every save here persists to the backend `settings` and `payment_wallets`
 * tables via the shared apiRequest helper (admin-common.js). An earlier version
 * used raw fetch('/api/...') against endpoints that did not exist and showed a
 * fake "saved successfully" alert regardless — nothing was ever stored.
 */

let wallets = [];
let editingWalletId = null;

// ── Payment wallets ─────────────────────────────────────────────────

async function loadWallets() {
    const data = await apiRequest('/admin/wallets');
    wallets = data && data.success ? data.data : [];
    displayWallets();
}

function displayWallets() {
    const walletList = document.getElementById('walletList');
    if (!walletList) return;

    if (wallets.length === 0) {
        walletList.innerHTML =
            '<p style="text-align:center; color:#6b7280;">No payment wallets configured yet.</p>';
        return;
    }

    // address/name are admin-entered but escaped anyway for safety.
    walletList.innerHTML = wallets.map((w) => `
        <div class="wallet-item">
            <div class="wallet-info">
                <h4>${escapeHtml(w.name)} <small style="color:#6b7280;">(${escapeHtml(w.network)})</small></h4>
                <p style="word-break:break-all;">${escapeHtml(w.address)}</p>
                <span class="badge-status ${w.is_active ? 'approved' : 'cancelled'}">
                    ${w.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
            </div>
            <div class="wallet-actions">
                <button class="btn-icon btn-edit" onclick="editWallet(${Number(w.id)})" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-delete" onclick="deleteWallet(${Number(w.id)})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function readWalletForm() {
    return {
        name: document.getElementById('walletName').value.trim(),
        // walletType is a convenience selector; network is the authoritative field.
        currency: (document.getElementById('walletType').value || 'USDT').split('-')[0] || 'USDT',
        network: document.getElementById('walletNetwork').value.trim(),
        address: document.getElementById('walletAddress').value.trim(),
        active: document.getElementById('walletActive').checked
    };
}

function resetWalletForm() {
    document.getElementById('walletForm').reset();
    editingWalletId = null;
    const btn = document.querySelector('#walletForm button[type="submit"]');
    if (btn) btn.innerHTML = '<i class="fas fa-plus"></i> Add Wallet';
}

function initWalletForm() {
    const form = document.getElementById('walletForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const walletData = readWalletForm();

        if (!walletData.name || !walletData.network || !walletData.address) {
            showNotification('Name, network and address are required', 'error');
            return;
        }

        // Same form does both create and edit; editingWalletId decides which.
        const data = editingWalletId
            ? await apiRequest(`/admin/wallets/${editingWalletId}`, {
                method: 'PUT',
                body: JSON.stringify(walletData)
              })
            : await apiRequest('/admin/wallets', {
                method: 'POST',
                body: JSON.stringify(walletData)
              });

        if (data && data.success) {
            showNotification(editingWalletId ? 'Wallet updated' : 'Wallet added', 'success');
            resetWalletForm();
            loadWallets();
        } else {
            showNotification((data && data.message) || 'Failed to save wallet', 'error');
        }
    });
}

function editWallet(id) {
    const wallet = wallets.find((w) => Number(w.id) === Number(id));
    if (!wallet) return;

    document.getElementById('walletName').value = wallet.name;
    document.getElementById('walletNetwork').value = wallet.network;
    document.getElementById('walletAddress').value = wallet.address;
    document.getElementById('walletActive').checked = !!wallet.is_active;

    editingWalletId = Number(id);
    const btn = document.querySelector('#walletForm button[type="submit"]');
    if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Update Wallet';
    document.getElementById('walletForm').scrollIntoView({ behavior: 'smooth' });
}

async function deleteWallet(id) {
    if (!confirm('Delete this payment wallet?')) return;

    const data = await apiRequest(`/admin/wallets/${id}`, { method: 'DELETE' });
    if (data && data.success) {
        showNotification('Wallet deleted', 'success');
        if (editingWalletId === Number(id)) resetWalletForm();
        loadWallets();
    } else {
        showNotification((data && data.message) || 'Failed to delete wallet', 'error');
    }
}

// ── Settings groups ─────────────────────────────────────────────────

/**
 * Generic group save: collects field values by id, PUTs to /admin/settings/:group.
 * @param {string} group
 * @param {Record<string,string>} fieldToElementId  field name -> input id
 * @param {string[]} booleanFields                  which fields are checkboxes
 */
async function saveGroup(group, fieldToElementId, booleanFields = []) {
    const body = {};
    for (const [field, elementId] of Object.entries(fieldToElementId)) {
        const el = document.getElementById(elementId);
        if (!el) continue;
        body[field] = booleanFields.includes(field) ? el.checked : el.value;
    }

    const data = await apiRequest(`/admin/settings/${group}`, {
        method: 'PUT',
        body: JSON.stringify(body)
    });

    if (data && data.success) {
        showNotification('Settings saved', 'success');
    } else {
        showNotification((data && data.message) || 'Failed to save settings', 'error');
    }
}

/**
 * Load a group and populate its inputs.
 */
async function loadGroup(group, fieldToElementId, booleanFields = []) {
    const data = await apiRequest(`/admin/settings/${group}`);
    if (!data || !data.success) return;

    for (const [field, elementId] of Object.entries(fieldToElementId)) {
        const el = document.getElementById(elementId);
        if (!el) continue;
        const value = data.data[field];
        if (booleanFields.includes(field)) {
            el.checked = value === true || value === 'true';
        } else {
            el.value = value ?? '';
        }
    }
}

const CS_FIELDS = {
    whatsappNumber: 'whatsappNumber',
    whatsappTemplate: 'whatsappTemplate',
    telegramUsername: 'telegramUsername',
    telegramLink: 'telegramLink',
    supportEmail: 'supportEmail',
    liveChatCode: 'liveChatCode',
    active: 'customerServiceActive'
};

const SUPPORT_FIELDS = {
    title: 'supportTitle',
    welcomeMessage: 'supportWelcome',
    supportHours: 'supportHours',
    responseTime: 'responseTime',
    faq: 'faqData'
};

const GENERAL_FIELDS = {
    platformName: 'platformName',
    platformDescription: 'platformDescription',
    minDeposit: 'minDeposit',
    minWithdrawal: 'minWithdrawal',
    referralBonus: 'referralBonus',
    taskReward: 'taskReward',
    registrationEnabled: 'registrationEnabled',
    maintenanceMode: 'maintenanceMode'
};

const HOMEPAGE_FIELDS = {
    members: 'homeStatMembers',
    paidOut: 'homeStatPaidOut',
    successRate: 'homeStatSuccessRate'
};

function initGroupForm(formId, group, fields, booleanFields) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Validate the FAQ JSON client-side for immediate feedback; the server
        // re-checks it too.
        if (group === 'support-page') {
            const faq = document.getElementById('faqData').value.trim();
            if (faq) {
                try {
                    JSON.parse(faq);
                } catch (err) {
                    showNotification('FAQ must be valid JSON', 'error');
                    return;
                }
            }
        }

        saveGroup(group, fields, booleanFields);
    });
}

// ── Init ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initWalletForm();
    initGroupForm('customerServiceForm', 'customer-service', CS_FIELDS, ['active']);
    initGroupForm('supportPageForm', 'support-page', SUPPORT_FIELDS, []);
    initGroupForm('generalSettingsForm', 'general', GENERAL_FIELDS,
        ['registrationEnabled', 'maintenanceMode']);
    initGroupForm('homepageStatsForm', 'homepage', HOMEPAGE_FIELDS, []);

    loadWallets();
    loadGroup('customer-service', CS_FIELDS, ['active']);
    loadGroup('support-page', SUPPORT_FIELDS, []);
    loadGroup('general', GENERAL_FIELDS, ['registrationEnabled', 'maintenanceMode']);
    loadGroup('homepage', HOMEPAGE_FIELDS, []);
});

// ── Tab switching ───────────────────────────────────────────────────
// The Settings page has tabs: Wallet Setup / Customer Service / Support Page /
// General. Each tab button calls switchTab('<key>'); the matching content panel
// has id "tab-<key>". This shows the selected panel and highlights its button.
function switchTab(key) {
    // Content panels.
    document.querySelectorAll('.tab-content').forEach((el) => {
        el.classList.toggle('active', el.id === 'tab-' + key);
    });

    // Tab buttons: mark the clicked one active. Prefer the event target; fall
    // back to matching by the onclick argument.
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach((btn) => btn.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        buttons.forEach((btn) => {
            const oc = btn.getAttribute('onclick') || '';
            if (oc.indexOf("'" + key + "'") !== -1) btn.classList.add('active');
        });
    }
}

// Expose globally for the inline onclick handlers.
window.switchTab = switchTab;
