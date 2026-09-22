/**
 * Combo Offers Management
 *
 * Real CRUD against /admin/combo-offers. The previous version showed sample
 * offers and faked create/update/delete in memory inside catch blocks.
 */

let offers = [];
let editingOfferId = null;

async function loadOffers() {
    const grid = document.getElementById('offersGrid');
    const empty = document.getElementById('emptyState');
    // Only flash "Loading" on the very first load, not on background refreshes.
    if (grid && !grid.dataset.loaded) grid.innerHTML = '<div class="loading-card">Loading offers...</div>';

    const data = await apiRequest('/admin/combo-offers');
    offers = data && data.success ? data.data : [];

    displayOffers();
}

function renderStats() {
    const bar = document.getElementById('comboStats');
    if (!bar) return;
    const total = offers.length;
    const active = offers.filter(o => o.is_active).length;
    const claims = offers.reduce((s, o) => s + (Number(o.claim_count) || 0), 0);
    // Total bonus value = sum of fixed bonus amounts (percentage offers excluded).
    const bonusValue = offers.reduce((s, o) =>
        s + (o.bonus_type === 'percentage' ? 0 : Number(o.bonus_amount) || 0), 0);

    const cards = [
        { icon: 'fa-gift',        cls: 'c1', value: total,   label: 'Total Offers' },
        { icon: 'fa-circle-check', cls: 'c2', value: active,  label: 'Active Offers' },
        { icon: 'fa-hand-holding-dollar', cls: 'c3', value: claims, label: 'Total Claims' },
        { icon: 'fa-coins',       cls: 'c4', value: formatCurrency(bonusValue), label: 'Total Bonus Value' }
    ];
    bar.innerHTML = cards.map(c => `
        <div class="combo-stat">
            <div class="combo-stat-icon ${c.cls}"><i class="fas ${c.icon}"></i></div>
            <div>
                <div class="combo-stat-value">${c.value}</div>
                <div class="combo-stat-label">${c.label}</div>
            </div>
        </div>
    `).join('');
}

function displayOffers() {
    const grid = document.getElementById('offersGrid');
    const empty = document.getElementById('emptyState');
    const statsBar = document.getElementById('comboStats');
    if (!grid) return;

    renderStats();

    // Mark loaded so background auto-refreshes skip the "Loading" flash.
    if (grid) grid.dataset.loaded = '1';

    // Always show the stats bar (it shows zeros when there are no offers) so the
    // top of the page never looks empty.
    if (statsBar) statsBar.style.display = 'grid';

    if (offers.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    grid.innerHTML = offers.map((o) => {
        const isPct = o.bonus_type === 'percentage';
        const bonus = isPct ? `${Number(o.bonus_amount)}%` : formatCurrency(o.bonus_amount);
        return `
        <div class="offer-card">
            <div class="offer-header">
                <div>
                    <h3 class="offer-title">${escapeHtml(o.name)}</h3>
                    <p class="offer-subtitle">${escapeHtml(o.description || 'No description')}</p>
                </div>
                <span class="offer-status ${o.is_active ? 'status-active' : 'status-inactive'}">
                    <span class="status-badge"></span>${o.is_active ? 'Active' : 'Inactive'}
                </span>
            </div>
            <div class="offer-body">
                <div class="offer-reward">
                    <div class="offer-reward-label">Bonus / Reward</div>
                    <div class="offer-reward-value">${bonus}</div>
                </div>
                <div class="offer-stats">
                    <div class="offer-stat">
                        <div class="offer-stat-value">${Number(o.trigger_order_count)}</div>
                        <div class="offer-stat-label"><i class="fas fa-list-ol"></i> Combo Orders</div>
                    </div>
                    <div class="offer-stat">
                        <div class="offer-stat-value">${formatCurrency(o.min_balance)}</div>
                        <div class="offer-stat-label"><i class="fas fa-wallet"></i> Required Deposit</div>
                    </div>
                    <div class="offer-stat">
                        <div class="offer-stat-value">${Number(o.claim_count) || 0}×</div>
                        <div class="offer-stat-label"><i class="fas fa-users"></i> Claimed</div>
                    </div>
                    <div class="offer-stat">
                        <div class="offer-stat-value">${isPct ? 'Percentage' : 'Fixed'}</div>
                        <div class="offer-stat-label"><i class="fas fa-tag"></i> Bonus Type</div>
                    </div>
                </div>
            </div>
            <div class="offer-footer">
                <button class="btn-icon btn-toggle" title="${o.is_active ? 'Disable' : 'Enable'}" onclick="toggleOffer(${Number(o.id)})">
                    <i class="fas fa-power-off"></i>
                </button>
                <div class="offer-actions">
                    <button class="btn-icon btn-edit" title="Edit" onclick="editOffer(${Number(o.id)})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" title="Delete" onclick="deleteOffer(${Number(o.id)})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function showCreateOfferModal() {
    editingOfferId = null;
    const title = document.getElementById('modalTitle');
    if (title) title.textContent = 'Create Combo Offer';
    document.getElementById('offerForm').reset();
    document.getElementById('offerModal').classList.add('show');
}

function editOffer(id) {
    const o = offers.find((x) => Number(x.id) === Number(id));
    if (!o) return;

    editingOfferId = Number(id);
    const title = document.getElementById('modalTitle');
    if (title) title.textContent = 'Edit Combo Offer';

    document.getElementById('offerName').value = o.name;
    document.getElementById('offerDescription').value = o.description || '';
    document.getElementById('requiredOrders').value = o.trigger_order_count;
    document.getElementById('rewardAmount').value = o.bonus_amount;
    const minEl = document.getElementById('minOrderValue');
    if (minEl) minEl.value = o.min_balance;
    document.getElementById('offerActive').checked = !!o.is_active;

    document.getElementById('offerModal').classList.add('show');
}

function closeOfferModal() {
    document.getElementById('offerModal').classList.remove('show');
    editingOfferId = null;
}

async function submitOffer(e) {
    e.preventDefault();

    const payload = {
        name: document.getElementById('offerName').value.trim(),
        description: document.getElementById('offerDescription').value.trim(),
        triggerOrderCount: parseInt(document.getElementById('requiredOrders').value, 10) || 3,
        bonusAmount: parseFloat(document.getElementById('rewardAmount').value) || 0,
        bonusType: 'fixed',
        minBalance: parseFloat((document.getElementById('minOrderValue') || {}).value) || 0,
        active: document.getElementById('offerActive').checked
    };

    if (!payload.name) {
        showNotification('Offer name is required', 'error');
        return;
    }

    const data = editingOfferId
        ? await apiRequest(`/admin/combo-offers/${editingOfferId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          })
        : await apiRequest('/admin/combo-offers', {
            method: 'POST',
            body: JSON.stringify(payload)
          });

    if (data && data.success) {
        showNotification(editingOfferId ? 'Offer updated' : 'Offer created', 'success');
        closeOfferModal();
        loadOffers();
    } else {
        showNotification((data && data.message) || 'Failed to save offer', 'error');
    }
}

async function toggleOffer(id) {
    const data = await apiRequest(`/admin/combo-offers/${id}/toggle`, { method: 'POST' });
    if (data && data.success) {
        showNotification('Offer updated', 'success');
        loadOffers();
    } else {
        showNotification((data && data.message) || 'Failed to update offer', 'error');
    }
}

async function deleteOffer(id) {
    if (!confirm('Delete this combo offer?')) return;
    const data = await apiRequest(`/admin/combo-offers/${id}`, { method: 'DELETE' });
    if (data && data.success) {
        showNotification('Offer deleted', 'success');
        loadOffers();
    } else {
        showNotification((data && data.message) || 'Failed to delete offer', 'error');
    }
}

/* ═══════════════════════════════════════════════════════════════════
   Customers & Combo Plans
   Per-customer table: orders (done/total), balance, combo commission,
   combos set, with Set/Clear combo controls.
   ═══════════════════════════════════════════════════════════════════ */

let custPage = 1;
let custSearch = '';
let custSearchTimer = null;
let comboSetUserId = null;

async function loadCustomers(page = 1) {
    custPage = page;
    const tbody = document.getElementById('custTableBody');
    if (!tbody) return;
    // Only show the "Loading..." flash on the first load; background auto-
    // refreshes update in place without the flicker.
    if (!tbody.dataset.loaded) {
        tbody.innerHTML = '<tr><td colspan="6" class="cust-empty">Loading customers...</td></tr>';
    }

    const q = encodeURIComponent(custSearch);
    const data = await apiRequest(`/admin/combo-customers?page=${page}&limit=12&search=${q}`);

    if (!data || !data.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="cust-empty">Failed to load customers</td></tr>';
        return;
    }

    const users = data.data.users || [];
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="cust-empty">No customers found</td></tr>';
        renderCustPagination(data.data.pagination);
        return;
    }

    tbody.innerHTML = users.map((u) => {
        const combos = Array.isArray(u.combos) ? u.combos : [];
        // Plan chip (earnings run) shown above any manual combo chips.
        const plan = u.sequencePlan;
        const planCombos = (plan && Array.isArray(plan.combos)) ? plan.combos : [];
        const comboOrdersLabel = planCombos.map((c) => `#${c.order}`).join(', ');
        const planChip = plan
            ? `<div style="margin-bottom:5px;"><span class="plan-chip" title="Deposit ${plan.deposit}, ${plan.orders} orders, combos at ${comboOrdersLabel || 'none'}"><i class="fas fa-sliders"></i> Plan: ${formatCurrency(plan.targetTotal)} · ${planCombos.length} combo${planCombos.length === 1 ? '' : 's'} (${comboOrdersLabel}) · ${plan.currentOrder}/${plan.orders}</span></div>`
            : '';
        const comboChips = combos.length
            ? `<div class="combo-chips">${combos.map(c => `<span class="combo-chip">#${c.triggerOrder} · ${formatCurrency(c.amount)}</span>`).join('')}</div>`
            : (plan ? '' : '<span class="combo-none">None set</span>');
        const chips = planChip + comboChips;
        const combosJson = escapeHtml(JSON.stringify(combos));
        const uname = escapeHtml(u.username);
        return `
        <tr>
            <td class="cust-user">
                <strong>${uname}</strong>
                <span>${escapeHtml(u.email)}</span>
            </td>
            <td>
                <span class="orders-pill">
                    <span class="done">${Number(u.completed_orders) || 0}</span>
                    <span class="sep">/</span>
                    <span class="total">${Number(u.total_orders) || 0}</span>
                </span>
            </td>
            <td class="money-plain">${formatCurrency(u.balance)}</td>
            <td class="money-green">${formatCurrency(u.combo_commission)}</td>
            <td>${chips}</td>
            <td>
                <div class="cust-actions">
                    <button class="btn-mini plan" onclick='openPlanModal(${Number(u.id)}, "${uname}")'>
                        <i class="fas fa-sliders"></i> Set Plan
                    </button>
                    <button class="btn-mini set" onclick='openComboSetModal(${Number(u.id)}, "${uname}", ${combosJson})'>
                        <i class="fas fa-gift"></i> ${combos.length ? 'Edit Combo' : 'Set Combo'}
                    </button>
                    ${combos.length ? `<button class="btn-mini clear" onclick="clearCombo(${Number(u.id)}, '${uname}')"><i class="fas fa-xmark"></i></button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');

    tbody.dataset.loaded = '1';
    renderCustPagination(data.data.pagination);
}

function renderCustPagination(pg) {
    const el = document.getElementById('custPagination');
    if (!el || !pg) return;
    const { page, totalPages } = pg;
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    let html = `<button ${page === 1 ? 'disabled' : ''} onclick="loadCustomers(${page - 1})"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
            html += `<button class="${i === page ? 'active' : ''}" onclick="loadCustomers(${i})">${i}</button>`;
        } else if (i === page - 2 || i === page + 2) {
            html += `<button disabled>…</button>`;
        }
    }
    html += `<button ${page === totalPages ? 'disabled' : ''} onclick="loadCustomers(${page + 1})"><i class="fas fa-chevron-right"></i></button>`;
    el.innerHTML = html;
}

// ── Set-combo modal ──
function openComboSetModal(userId, username, existingCombos) {
    comboSetUserId = userId;
    document.getElementById('comboSetTitle').textContent = 'Set Combo';
    document.getElementById('comboSetFor').textContent = `Customer: ${username} (#${userId})`;

    const container = document.getElementById('comboSetRows');
    container.innerHTML = '';
    const list = Array.isArray(existingCombos) && existingCombos.length ? existingCombos : [null];
    list.forEach(c => addComboSetRow(c ? c.triggerOrder : '', c ? c.amount : ''));

    document.getElementById('comboSetModal').classList.add('show');
}

function addComboSetRow(orderVal, amountVal) {
    const container = document.getElementById('comboSetRows');
    const row = document.createElement('div');
    row.className = 'combo-set-row';
    row.innerHTML = `
        <div class="csf">
            <label>Order #</label>
            <input type="number" class="cs-order" min="1" step="1" placeholder="e.g. 4" value="${orderVal != null ? orderVal : ''}">
        </div>
        <div class="csf">
            <label>Amount (USDT)</label>
            <input type="number" class="cs-amount" min="1" step="0.01" placeholder="e.g. 300" value="${amountVal != null ? amountVal : ''}">
        </div>
        <button type="button" class="combo-set-remove" title="Remove" onclick="this.closest('.combo-set-row').remove()">
            <i class="fas fa-xmark"></i>
        </button>`;
    container.appendChild(row);
}

function closeComboSetModal() {
    document.getElementById('comboSetModal').classList.remove('show');
    comboSetUserId = null;
}

async function saveComboSet() {
    if (!comboSetUserId) return;
    const rows = document.querySelectorAll('#comboSetRows .combo-set-row');
    const combos = [];
    const seen = new Set();
    for (const row of rows) {
        const triggerOrder = parseInt(row.querySelector('.cs-order').value, 10);
        const amount = parseFloat(row.querySelector('.cs-amount').value);
        if (!triggerOrder || triggerOrder < 1) { showNotification('Each combo needs an order number of 1 or more', 'error'); return; }
        if (!(amount > 0)) { showNotification('Each combo needs an amount greater than 0', 'error'); return; }
        if (seen.has(triggerOrder)) { showNotification(`Duplicate order number ${triggerOrder}`, 'error'); return; }
        seen.add(triggerOrder);
        combos.push({ triggerOrder, amount });
    }
    if (!combos.length) { showNotification('Add at least one combo', 'error'); return; }

    const data = await apiRequest(`/admin/task-permissions/${comboSetUserId}/combo-plan`, {
        method: 'POST',
        body: JSON.stringify({ combos })
    });
    if (data && data.success) {
        showNotification(data.message || 'Combo set', 'success');
        closeComboSetModal();
        loadCustomers(custPage);
    } else {
        showNotification((data && data.message) || 'Failed to set combo', 'error');
    }
}

async function clearCombo(userId, username) {
    if (!confirm(`Cancel the pending combo(s) for ${username}?`)) return;
    const data = await apiRequest(`/admin/task-permissions/${userId}/combo-plan/cancel`, {
        method: 'POST',
        body: JSON.stringify({})
    });
    if (data && data.success) {
        showNotification(data.message || 'Combo cancelled', 'success');
        loadCustomers(custPage);
    } else {
        showNotification((data && data.message) || 'Failed to cancel combo', 'error');
    }
}

/* ═══════════════════════════════════════════════════════════════════
   Sequence Plan (per-customer earnings run)
   Admin sets deposit / target / combo; a live preview shows the computed
   profit split; saving writes the plan the customer's orders follow.
   ═══════════════════════════════════════════════════════════════════ */

let planUserId = null;
let planTiers = [];

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Add one combo row to the modal (order #, recharge, profit). Max 3.
function addPlanComboRow(order, recharge, profit) {
    const container = document.getElementById('planComboRows');
    if (!container) return;
    if (container.querySelectorAll('.plan-combo-row').length >= 3) {
        showNotification('A plan can have at most 3 combos', 'info');
        return;
    }
    const row = document.createElement('div');
    row.className = 'plan-combo-row';
    row.innerHTML = `
        <div class="pcf">
            <label>Combo at order #</label>
            <input type="number" class="pc-order" min="1" step="1" placeholder="e.g. 15" value="${order != null ? order : ''}">
        </div>
        <div class="pcf">
            <label>Recharge (USDT)</label>
            <input type="number" class="pc-recharge" min="0" step="0.01" placeholder="e.g. 8" value="${recharge != null ? recharge : ''}">
        </div>
        <div class="pcf">
            <label>Profit (USDT)</label>
            <input type="number" class="pc-profit" min="0" step="0.01" placeholder="e.g. 5" value="${profit != null ? profit : ''}">
        </div>
        <button type="button" class="plan-combo-remove" title="Remove" onclick="this.closest('.plan-combo-row').remove(); renderPlanPreview();">
            <i class="fas fa-xmark"></i>
        </button>`;
    container.appendChild(row);
    // Recompute preview when any field in this row changes.
    row.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', renderPlanPreview));
}

// Read the combos entered in the modal.
function readPlanCombos() {
    const rows = document.querySelectorAll('#planComboRows .plan-combo-row');
    const combos = [];
    rows.forEach((row) => {
        const order = parseInt(row.querySelector('.pc-order').value, 10);
        const recharge = parseFloat(row.querySelector('.pc-recharge').value);
        const profit = parseFloat(row.querySelector('.pc-profit').value);
        if (order >= 1 && recharge >= 0 && profit >= 0 && !isNaN(recharge) && !isNaN(profit)) {
            combos.push({ order, recharge, profit });
        }
    });
    return combos;
}

// Read the current form values (deposit/orders/target + combos).
function readPlanForm() {
    return {
        deposit: parseFloat(document.getElementById('planDeposit').value),
        orders: parseInt(document.getElementById('planOrders').value, 10),
        targetTotal: parseFloat(document.getElementById('planTarget').value),
        combos: readPlanCombos()
    };
}

// Render the tier template buttons.
function renderPlanTierButtons() {
    const wrap = document.getElementById('planTierButtons');
    if (!wrap) return;
    if (!planTiers.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = planTiers.map((t, i) => {
        const label = t.range ? `$${t.range[0]}–${t.range[1]}` : `$${t.deposit}`;
        return `<button type="button" class="plan-tier-btn" onclick="applyPlanTier(${i})">${label} → $${t.targetTotal}</button>`;
    }).join('');
}

// Apply a tier template into the form.
function applyPlanTier(index) {
    const t = planTiers[index];
    if (!t) return;
    document.getElementById('planDeposit').value = t.range ? t.range[0] : t.deposit;
    document.getElementById('planOrders').value = t.orders || 25;
    document.getElementById('planTarget').value = t.targetTotal;
    const container = document.getElementById('planComboRows');
    container.innerHTML = '';
    (t.combos || []).forEach((c) => addPlanComboRow(c.order, c.recharge, c.profit));
    renderPlanPreview();
}

// Live preview: recompute the multi-combo profit math and validate, exactly
// like the backend does, so the admin sees the result before saving.
function renderPlanPreview() {
    const el = document.getElementById('planPreview');
    if (!el) return;
    const p = readPlanForm();

    const bad = (msg) => `<div class="pp-title">Preview</div><div class="pp-row"><span class="pp-bad">${msg}</span></div>`;

    if (!(p.deposit > 0)) { el.innerHTML = bad('Enter a deposit greater than 0.'); return; }
    if (!(p.orders >= 2)) { el.innerHTML = bad('Total orders must be at least 2.'); return; }
    if (!(p.targetTotal > 0)) { el.innerHTML = bad('Enter a target total greater than 0.'); return; }
    if (!p.combos.length) { el.innerHTML = bad('Add at least one combo.'); return; }
    if (p.combos.length > 3) { el.innerHTML = bad('At most 3 combos.'); return; }

    const orders = new Set();
    for (const c of p.combos) {
        if (c.order < 1 || c.order > p.orders) { el.innerHTML = bad(`Combo order #${c.order} must be within 1–${p.orders}.`); return; }
        if (orders.has(c.order)) { el.innerHTML = bad(`Two combos share order #${c.order}. Use different orders.`); return; }
        orders.add(c.order);
    }

    const rechargeTotal = r2(p.combos.reduce((s, c) => s + c.recharge, 0));
    const comboProfitTotal = r2(p.combos.reduce((s, c) => s + c.profit, 0));
    const outlay = r2(p.deposit + rechargeTotal);
    const totalProfit = r2(p.targetTotal - outlay);
    const normalPool = r2(totalProfit - comboProfitTotal);
    const normalCount = p.orders - p.combos.length;

    if (totalProfit <= 0) {
        el.innerHTML = bad(`Target (${p.targetTotal}) must be greater than outlay (deposit ${p.deposit} + recharges ${rechargeTotal} = ${outlay}).`);
        return;
    }
    if (comboProfitTotal > totalProfit) {
        el.innerHTML = bad(`Combo profits (${comboProfitTotal}) can't exceed total profit (${totalProfit}).`);
        return;
    }
    if (normalPool < 0) { el.innerHTML = bad('Not enough profit left for the other orders.'); return; }

    const comboLines = p.combos
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((c) => `<div class="pp-row"><span>Combo at order #${c.order} — recharge ${c.recharge.toFixed(2)}, profit</span><strong class="pp-good">+${c.profit.toFixed(2)} USDT</strong></div>`)
        .join('');

    el.innerHTML = `
        <div class="pp-title">Preview — what the customer will experience</div>
        <div class="pp-row"><span>Money the customer puts in (deposit + recharges)</span><strong>${outlay.toFixed(2)} USDT</strong></div>
        ${comboLines}
        <div class="pp-row"><span>Spread across the other ${normalCount} orders (different amounts)</span><strong class="pp-good">+${normalPool.toFixed(2)} USDT</strong></div>
        <div class="pp-row"><span>Total commission earned</span><strong class="pp-good">+${totalProfit.toFixed(2)} USDT</strong></div>
        <div class="pp-row"><span>Final balance after all ${p.orders} orders</span><strong class="pp-good">${p.targetTotal.toFixed(2)} USDT</strong></div>
    `;
}

async function openPlanModal(userId, username) {
    planUserId = userId;
    document.getElementById('planTitle').textContent = 'Set Order Plan';
    document.getElementById('planFor').textContent = `Customer: ${username} (#${userId})`;

    // Load the customer's active plan (if any) + the default tiers to prefill.
    const data = await apiRequest(`/admin/task-permissions/${userId}/sequence-plan`);
    const plan = data && data.success ? data.data.plan : null;
    planTiers = (data && data.success && Array.isArray(data.data.tiers)) ? data.data.tiers : [];
    const tier = (data && data.success && data.data.defaultTier)
        ? data.data.defaultTier
        : { deposit: 20, orders: 25, targetTotal: 40, combos: [{ order: 15, recharge: 8, profit: 5 }] };

    renderPlanTierButtons();

    // Prefill deposit / orders / target from the active plan or default tier.
    document.getElementById('planDeposit').value = plan ? plan.deposit : (tier.range ? tier.range[0] : tier.deposit);
    document.getElementById('planOrders').value = (plan ? plan.orders : tier.orders) || 25;
    document.getElementById('planTarget').value = plan ? plan.targetTotal : tier.targetTotal;

    // Fill combo rows from the active plan's combos, or the tier's combos.
    const container = document.getElementById('planComboRows');
    container.innerHTML = '';
    const combos = (plan && Array.isArray(plan.combos) && plan.combos.length)
        ? plan.combos
        : (tier.combos || []);
    combos.forEach((c) => addPlanComboRow(c.order, c.recharge, c.profit));
    if (!combos.length) addPlanComboRow();

    // Show "Remove Plan" only when one is active.
    document.getElementById('planCancelBtn').style.display = plan ? '' : 'none';

    renderPlanPreview();
    document.getElementById('planModal').classList.add('show');
}

function closePlanModal() {
    document.getElementById('planModal').classList.remove('show');
    planUserId = null;
}

async function savePlan() {
    if (!planUserId) return;
    const p = readPlanForm();
    if (!(p.deposit > 0)) { showNotification('Enter a deposit greater than 0', 'error'); return; }
    if (!p.combos.length) { showNotification('Add at least one combo', 'error'); return; }

    const payload = {
        deposit: p.deposit,
        orders: p.orders,
        targetTotal: p.targetTotal,
        combos: p.combos
    };

    const data = await apiRequest(`/admin/task-permissions/${planUserId}/sequence-plan`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (data && data.success) {
        showNotification('Order plan saved', 'success');
        closePlanModal();
        loadCustomers(custPage);
    } else {
        showNotification((data && data.message) || 'Failed to save plan', 'error');
    }
}

async function cancelActivePlan() {
    if (!planUserId) return;
    if (!confirm('Remove this customer\'s order plan? Their orders will fall back to the default commission.')) return;
    const data = await apiRequest(`/admin/task-permissions/${planUserId}/sequence-plan/cancel`, {
        method: 'POST',
        body: JSON.stringify({})
    });
    if (data && data.success) {
        showNotification(data.message || 'Plan removed', 'success');
        closePlanModal();
        loadCustomers(custPage);
    } else {
        showNotification((data && data.message) || 'Failed to remove plan', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('offerForm');
    if (form) form.addEventListener('submit', submitOffer);
    loadOffers();

    // Live preview: recompute whenever deposit/orders/target change. (Combo row
    // inputs get their own listeners as they're added.)
    ['planDeposit', 'planOrders', 'planTarget'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', renderPlanPreview);
    });
    // Close plan modal on outside click.
    const pm = document.getElementById('planModal');
    if (pm) pm.addEventListener('click', (e) => { if (e.target.id === 'planModal') closePlanModal(); });

    // Customer table
    loadCustomers(1);
    const search = document.getElementById('custSearch');
    if (search) {
        search.addEventListener('input', (e) => {
            clearTimeout(custSearchTimer);
            custSearch = e.target.value.trim();
            custSearchTimer = setTimeout(() => loadCustomers(1), 350);
        });
    }
    // Close set-combo modal on outside click
    const m = document.getElementById('comboSetModal');
    if (m) m.addEventListener('click', (e) => { if (e.target.id === 'comboSetModal') closeComboSetModal(); });

    // Real-time: refresh offers + customer combo table automatically.
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(() => { loadOffers(); loadCustomers(custPage); });
    }
});
