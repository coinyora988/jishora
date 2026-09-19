/**
 * Proxy Accounts admin page.
 *  - Create proxy customer accounts (username + password set by admin).
 *  - Manage a GLOBAL per-market combo template that applies to ALL proxy
 *    accounts (JD / Shopee / Temu, unlimited order#->amount rows).
 */

function togglePaPw() {
    const input = document.getElementById('paPassword');
    const eye = document.getElementById('paEye');
    if (input.type === 'password') { input.type = 'text'; eye.className = 'fas fa-eye-slash'; }
    else { input.type = 'password'; eye.className = 'fas fa-eye'; }
}

async function createProxyAccount() {
    const username = document.getElementById('paUsername').value.trim();
    const email = document.getElementById('paEmail').value.trim();
    const password = document.getElementById('paPassword').value.trim();

    if (!username || username.length < 3) { showNotification('Username must be at least 3 characters', 'error'); return; }
    if (!password || password.length < 6) { showNotification('Password must be at least 6 characters', 'error'); return; }

    const data = await apiRequest('/admin/proxy-accounts', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
    });
    if (data && data.success) {
        showNotification(data.message || 'Proxy account created', 'success');
        document.getElementById('paUsername').value = '';
        document.getElementById('paEmail').value = '';
        document.getElementById('paPassword').value = '';
        loadProxyAccounts();
    } else {
        showNotification((data && data.message) || 'Failed to create account', 'error');
    }
}

async function loadProxyAccounts() {
    const tbody = document.getElementById('proxyTableBody');
    if (!tbody) return;
    if (!tbody.dataset.loaded) tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

    const data = await apiRequest('/admin/proxy-accounts');
    if (!data || !data.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load</td></tr>';
        return;
    }
    const accounts = data.data || [];
    if (accounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No proxy accounts yet. Create one above.</td></tr>';
        tbody.dataset.loaded = '1';
        return;
    }
    tbody.innerHTML = accounts.map(a => `
        <tr>
            <td>#${Number(a.id)}</td>
            <td><strong>${escapeHtml(a.username)}</strong></td>
            <td>${escapeHtml(a.email)}</td>
            <td><strong>${formatCurrency(a.balance)}</strong></td>
            <td>${formatStatus(a.status)}</td>
            <td>${formatDate(a.created_at)}</td>
        </tr>
    `).join('');
    tbody.dataset.loaded = '1';
}

// ── Global combo template per market ──
let __markets = [];

async function loadProxyCombos() {
    const wrap = document.getElementById('marketsCombos');
    if (!wrap) return;
    if (!wrap.dataset.loaded) wrap.innerHTML = '<div class="loading-card">Loading markets...</div>';

    const data = await apiRequest('/admin/proxy-combos');
    if (!data || !data.success) {
        wrap.innerHTML = '<div class="loading-card">Failed to load markets</div>';
        return;
    }
    __markets = data.data || [];
    wrap.innerHTML = __markets.map(m => `
        <div class="market-combo-block" data-market="${m.marketId}">
            <div class="market-combo-head">
                <h4><span class="mc-badge">${escapeHtml(m.slug || '')}</span> ${escapeHtml(m.name)}</h4>
            </div>
            <div class="mc-rows" id="mcRows_${m.marketId}"></div>
            <div class="mc-actions">
                <button class="btn btn-sm btn-secondary" onclick="addMcRow(${m.marketId})"><i class="fas fa-plus"></i> Add combo</button>
                <button class="btn btn-sm btn-primary" onclick="saveMarketCombos(${m.marketId})"><i class="fas fa-save"></i> Save ${escapeHtml(m.name)}</button>
            </div>
        </div>
    `).join('');

    // Fill each market's existing rows (at least one empty row if none).
    __markets.forEach(m => {
        const rows = m.combos && m.combos.length ? m.combos : [null];
        rows.forEach(c => addMcRow(m.marketId, c ? c.triggerOrder : '', c ? c.amount : ''));
    });
    wrap.dataset.loaded = '1';
}

function addMcRow(marketId, orderVal, amountVal) {
    const container = document.getElementById('mcRows_' + marketId);
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'mc-row';
    row.innerHTML = `
        <div class="mc-field">
            <label title="Nth completed order on THIS market">Order # (on this market)</label>
            <input type="number" class="mc-order" min="1" step="1" placeholder="e.g. 11" value="${orderVal != null ? orderVal : ''}">
        </div>
        <div class="mc-field">
            <label>Combo Amount (USDT)</label>
            <input type="number" class="mc-amount" min="1" step="0.01" placeholder="e.g. 30" value="${amountVal != null ? amountVal : ''}">
        </div>
        <button type="button" class="mc-remove" title="Remove" onclick="this.closest('.mc-row').remove()"><i class="fas fa-xmark"></i></button>
    `;
    container.appendChild(row);
}

async function saveMarketCombos(marketId) {
    const container = document.getElementById('mcRows_' + marketId);
    const rows = container.querySelectorAll('.mc-row');
    const combos = [];
    const seen = new Set();
    for (const row of rows) {
        const orderStr = row.querySelector('.mc-order').value;
        const amtStr = row.querySelector('.mc-amount').value;
        // Allow fully-empty rows (skip them) so a market can be cleared.
        if (orderStr === '' && amtStr === '') continue;
        const triggerOrder = parseInt(orderStr, 10);
        const amount = parseFloat(amtStr);
        if (!triggerOrder || triggerOrder < 1) { showNotification('Each combo needs an order number of 1 or more', 'error'); return; }
        if (!(amount > 0)) { showNotification('Each combo needs an amount greater than 0', 'error'); return; }
        if (seen.has(triggerOrder)) { showNotification(`Duplicate order number ${triggerOrder}`, 'error'); return; }
        seen.add(triggerOrder);
        combos.push({ triggerOrder, amount });
    }

    const data = await apiRequest(`/admin/proxy-combos/${marketId}`, {
        method: 'PUT',
        body: JSON.stringify({ combos })
    });
    if (data && data.success) {
        showNotification(data.message || 'Saved', 'success');
    } else {
        showNotification((data && data.message) || 'Failed to save', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadProxyAccounts();
    loadProxyCombos();

    // Real-time: keep the proxy accounts list fresh (balances change as they work).
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(loadProxyAccounts);
    }
});
