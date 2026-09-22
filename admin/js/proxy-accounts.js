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

/* ═══════════════════════════════════════════════════════════════════
   Global Proxy Plan (one sequence plan applied to ALL proxy accounts)
   ═══════════════════════════════════════════════════════════════════ */

let ppTiers = [];
function ppR2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function addPpComboRow(order, recharge, profit) {
    const c = document.getElementById('ppComboRows');
    if (!c) return;
    if (c.querySelectorAll('.pp-combo-row').length >= 3) {
        showNotification('A plan can have at most 3 combos', 'info');
        return;
    }
    const row = document.createElement('div');
    row.className = 'pp-combo-row';
    row.innerHTML =
        '<div class="ppf"><label>Combo at order #</label><input type="number" class="ppc-order" min="1" step="1" placeholder="e.g. 15" value="' + (order != null ? order : '') + '"></div>' +
        '<div class="ppf"><label>Recharge (USDT)</label><input type="number" class="ppc-recharge" min="0" step="0.01" placeholder="e.g. 8" value="' + (recharge != null ? recharge : '') + '"></div>' +
        '<div class="ppf"><label>Profit (USDT)</label><input type="number" class="ppc-profit" min="0" step="0.01" placeholder="e.g. 5" value="' + (profit != null ? profit : '') + '"></div>' +
        '<button type="button" class="pp-combo-remove" title="Remove" onclick="this.closest(\'.pp-combo-row\').remove(); renderPpPreview();"><i class="fas fa-xmark"></i></button>';
    c.appendChild(row);
    row.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', renderPpPreview));
}

function readPpCombos() {
    const rows = document.querySelectorAll('#ppComboRows .pp-combo-row');
    const combos = [];
    rows.forEach((row) => {
        const order = parseInt(row.querySelector('.ppc-order').value, 10);
        const recharge = parseFloat(row.querySelector('.ppc-recharge').value);
        const profit = parseFloat(row.querySelector('.ppc-profit').value);
        if (order >= 1 && recharge >= 0 && profit >= 0 && !isNaN(recharge) && !isNaN(profit)) {
            combos.push({ order, recharge, profit });
        }
    });
    return combos;
}

function readPpForm() {
    return {
        deposit: parseFloat(document.getElementById('ppDeposit').value),
        orders: parseInt(document.getElementById('ppOrders').value, 10),
        targetTotal: parseFloat(document.getElementById('ppTarget').value),
        combos: readPpCombos()
    };
}

function renderPpTierButtons() {
    const wrap = document.getElementById('ppTierButtons');
    if (!wrap) return;
    if (!ppTiers.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = ppTiers.map((t, i) => {
        const label = t.range ? ('$' + t.range[0] + '–' + t.range[1]) : ('$' + t.deposit);
        return '<button type="button" class="pp-tier-btn" onclick="applyPpTier(' + i + ')">' + label + ' → $' + t.targetTotal + '</button>';
    }).join('');
}

function applyPpTier(index) {
    const t = ppTiers[index];
    if (!t) return;
    document.getElementById('ppDeposit').value = t.range ? t.range[0] : t.deposit;
    document.getElementById('ppOrders').value = t.orders || 25;
    document.getElementById('ppTarget').value = t.targetTotal;
    const c = document.getElementById('ppComboRows');
    c.innerHTML = '';
    (t.combos || []).forEach((x) => addPpComboRow(x.order, x.recharge, x.profit));
    renderPpPreview();
}

function renderPpPreview() {
    const el = document.getElementById('ppPreview');
    if (!el) return;
    const p = readPpForm();
    const bad = (m) => '<div class="pp-title">Preview</div><div class="pp-row"><span class="pp-bad">' + m + '</span></div>';

    if (!(p.deposit > 0)) { el.innerHTML = bad('Enter a deposit greater than 0.'); return; }
    if (!(p.orders >= 2)) { el.innerHTML = bad('Total orders must be at least 2.'); return; }
    if (!(p.targetTotal > 0)) { el.innerHTML = bad('Enter a target total greater than 0.'); return; }
    if (!p.combos.length) { el.innerHTML = bad('Add at least one combo.'); return; }

    const orders = new Set();
    for (const c of p.combos) {
        if (c.order < 1 || c.order > p.orders) { el.innerHTML = bad('Combo order #' + c.order + ' must be within 1–' + p.orders + '.'); return; }
        if (orders.has(c.order)) { el.innerHTML = bad('Two combos share order #' + c.order + '.'); return; }
        orders.add(c.order);
    }

    const rechargeTotal = ppR2(p.combos.reduce((s, c) => s + c.recharge, 0));
    const comboProfitTotal = ppR2(p.combos.reduce((s, c) => s + c.profit, 0));
    const outlay = ppR2(p.deposit + rechargeTotal);
    const totalProfit = ppR2(p.targetTotal - outlay);
    const normalPool = ppR2(totalProfit - comboProfitTotal);
    const normalCount = p.orders - p.combos.length;

    if (totalProfit <= 0) { el.innerHTML = bad('Target (' + p.targetTotal + ') must be greater than outlay (' + outlay + ').'); return; }
    if (comboProfitTotal > totalProfit) { el.innerHTML = bad("Combo profits (" + comboProfitTotal + ") can't exceed total profit (" + totalProfit + ').'); return; }
    if (normalPool < 0) { el.innerHTML = bad('Not enough profit left for the other orders.'); return; }

    const comboLines = p.combos.slice().sort((a, b) => a.order - b.order)
        .map((c) => '<div class="pp-row"><span>Combo at order #' + c.order + ' — recharge ' + c.recharge.toFixed(2) + ', profit</span><strong class="pp-good">+' + c.profit.toFixed(2) + ' USDT</strong></div>').join('');

    el.innerHTML =
        '<div class="pp-title">Preview — applies to every proxy account</div>' +
        '<div class="pp-row"><span>Money put in (deposit + recharges)</span><strong>' + outlay.toFixed(2) + ' USDT</strong></div>' +
        comboLines +
        '<div class="pp-row"><span>Spread across the other ' + normalCount + ' orders</span><strong class="pp-good">+' + normalPool.toFixed(2) + ' USDT</strong></div>' +
        '<div class="pp-row"><span>Total commission earned</span><strong class="pp-good">+' + totalProfit.toFixed(2) + ' USDT</strong></div>' +
        '<div class="pp-row"><span>Final balance after all ' + p.orders + ' orders</span><strong class="pp-good">' + p.targetTotal.toFixed(2) + ' USDT</strong></div>';
}

async function loadProxyPlan() {
    const data = await apiRequest('/admin/proxy-plan');
    const plan = data && data.success ? data.data.plan : null;
    ppTiers = (data && data.success && Array.isArray(data.data.tiers)) ? data.data.tiers : [];
    const tier = (data && data.success && data.data.defaultTier)
        ? data.data.defaultTier
        : { deposit: 20, orders: 25, targetTotal: 40, combos: [{ order: 15, recharge: 8, profit: 5 }] };

    renderPpTierButtons();

    document.getElementById('ppDeposit').value = plan ? plan.deposit : (tier.range ? tier.range[0] : tier.deposit);
    document.getElementById('ppOrders').value = (plan ? plan.orders : tier.orders) || 25;
    document.getElementById('ppTarget').value = plan ? plan.targetTotal : tier.targetTotal;

    const c = document.getElementById('ppComboRows');
    c.innerHTML = '';
    const combos = (plan && Array.isArray(plan.combos) && plan.combos.length) ? plan.combos : (tier.combos || []);
    combos.forEach((x) => addPpComboRow(x.order, x.recharge, x.profit));
    if (!combos.length) addPpComboRow();

    document.getElementById('ppClearBtn').style.display = plan ? '' : 'none';
    renderPpPreview();
}

async function saveProxyPlan() {
    const p = readPpForm();
    if (!(p.deposit > 0)) { showNotification('Enter a deposit greater than 0', 'error'); return; }
    if (!p.combos.length) { showNotification('Add at least one combo', 'error'); return; }

    const data = await apiRequest('/admin/proxy-plan', {
        method: 'POST',
        body: JSON.stringify({ deposit: p.deposit, orders: p.orders, targetTotal: p.targetTotal, combos: p.combos })
    });
    if (data && data.success) {
        showNotification('Global proxy plan saved', 'success');
        loadProxyPlan();
    } else {
        showNotification((data && data.message) || 'Failed to save plan', 'error');
    }
}

async function clearProxyPlan() {
    if (!confirm('Remove the global proxy plan? Proxy accounts will fall back to the per-market combo template / default commission.')) return;
    const data = await apiRequest('/admin/proxy-plan/clear', { method: 'POST', body: JSON.stringify({}) });
    if (data && data.success) {
        showNotification('Global proxy plan removed', 'success');
        loadProxyPlan();
    } else {
        showNotification((data && data.message) || 'Failed to remove plan', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadProxyAccounts();
    loadProxyCombos();
    loadProxyPlan();

    ['ppDeposit', 'ppOrders', 'ppTarget'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', renderPpPreview);
    });

    // Real-time: keep the proxy accounts list fresh (balances change as they work).
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(loadProxyAccounts);
    }
});
