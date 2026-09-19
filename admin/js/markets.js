/**
 * Markets & Products Management
 *
 * Real CRUD against /admin/markets and /admin/products. The previous version
 * was pure mock data with toast-only "saves" that never persisted.
 *
 * Note on commission: the UI shows a percentage (e.g. 6 for 6%) but the DB
 * stores a decimal fraction (0.06). Conversion happens at the edges here.
 */

let markets = [];
let products = [];
let currentMarketId = null;
let editingMarketId = null;
let editingProductId = null;

// ── Load + render markets ───────────────────────────────────────────

async function loadMarkets() {
    const grid = document.getElementById('marketsGrid');
    grid.innerHTML = '<div class="loading-card">Loading markets...</div>';

    const data = await apiRequest('/admin/markets');
    markets = data && data.success ? data.data : [];

    if (markets.length === 0) {
        grid.innerHTML = '<div class="loading-card">No markets yet. Click "Add Market" to create one.</div>';
        return;
    }

    grid.innerHTML = markets.map((m) => {
        const commissionPct = (parseFloat(m.commission_rate) * 100).toFixed(2);
        const maxBalance = m.max_balance == null ? 'Unlimited' : formatCurrency(m.max_balance);
        return `
            <div class="market-card">
                <div class="market-card-head">
                    <div class="market-logo">${escapeHtml((m.name || '?').charAt(0).toUpperCase())}</div>
                    <div class="market-title">
                        <h3>${escapeHtml(m.name)}</h3>
                        ${m.description ? `<p class="market-desc">${escapeHtml(m.description)}</p>` : ''}
                    </div>
                    <span class="badge-status ${m.status === 'active' ? 'approved' : 'cancelled'}">
                        ${escapeHtml((m.status || 'active').toUpperCase())}
                    </span>
                </div>
                <div class="market-meta">
                    <div class="mm-item"><span><i class="fas fa-percent"></i> Commission</span><strong>${commissionPct}%</strong></div>
                    <div class="mm-item"><span><i class="fas fa-arrow-down"></i> Min Balance</span><strong>${formatCurrency(m.min_balance)}</strong></div>
                    <div class="mm-item"><span><i class="fas fa-arrow-up"></i> Max Balance</span><strong>${maxBalance}</strong></div>
                    <div class="mm-item"><span><i class="fas fa-crown"></i> VIP Level</span><strong>${Number(m.vip_level_required) || 0}</strong></div>
                </div>
                <div class="market-card-actions">
                    <button class="btn btn-sm btn-secondary" onclick="viewProducts(${Number(m.id)})">
                        <i class="fas fa-box"></i> Products
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="editMarket(${Number(m.id)})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMarket(${Number(m.id)})" title="Delete market">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
    }).join('');
}

// ── Market modal ────────────────────────────────────────────────────

function showAddMarketModal() {
    editingMarketId = null;
    document.getElementById('marketModalTitle').textContent = 'Add Market';
    document.getElementById('marketForm').reset();
    document.getElementById('marketId').value = '';
    document.getElementById('marketModal').classList.add('active');
}

function editMarket(id) {
    const m = markets.find((x) => Number(x.id) === Number(id));
    if (!m) return;

    editingMarketId = Number(id);
    document.getElementById('marketModalTitle').textContent = 'Edit Market';
    document.getElementById('marketId').value = m.id;
    document.getElementById('marketName').value = m.name;
    document.getElementById('marketDescription').value = m.description || '';
    const logoEl = document.getElementById('marketLogo');
    if (logoEl) logoEl.value = m.logo_url || '';
    document.getElementById('marketMinBalance').value = m.min_balance;
    document.getElementById('marketMaxBalance').value = m.max_balance == null ? '' : m.max_balance;
    // DB stores a fraction; show it as a percentage.
    document.getElementById('marketCommission').value = (parseFloat(m.commission_rate) * 100).toFixed(2);
    document.getElementById('marketStatus').value = m.status || 'active';

    document.getElementById('marketModal').classList.add('active');
}

function closeMarketModal() {
    document.getElementById('marketModal').classList.remove('active');
    editingMarketId = null;
}

async function submitMarket(e) {
    e.preventDefault();

    const commissionPct = parseFloat(document.getElementById('marketCommission').value);
    const maxRaw = document.getElementById('marketMaxBalance').value;

    const payload = {
        name: document.getElementById('marketName').value.trim(),
        description: document.getElementById('marketDescription').value.trim(),
        logoUrl: (document.getElementById('marketLogo') || {}).value || '',
        // Percentage in the UI -> fraction in the DB.
        commissionRate: isNaN(commissionPct) ? 0 : commissionPct / 100,
        minBalance: parseFloat(document.getElementById('marketMinBalance').value) || 0,
        maxBalance: maxRaw === '' ? null : parseFloat(maxRaw),
        status: document.getElementById('marketStatus').value
    };

    if (!payload.name) {
        showNotification('Market name is required', 'error');
        return;
    }

    const data = editingMarketId
        ? await apiRequest(`/admin/markets/${editingMarketId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          })
        : await apiRequest('/admin/markets', {
            method: 'POST',
            body: JSON.stringify(payload)
          });

    if (data && data.success) {
        showNotification(editingMarketId ? 'Market updated' : 'Market created', 'success');
        closeMarketModal();
        loadMarkets();
    } else {
        showNotification((data && data.message) || 'Failed to save market', 'error');
    }
}

async function deleteMarket(id) {
    if (!confirm('Delete this market? Its products will lose their market link.')) return;
    const data = await apiRequest(`/admin/markets/${id}`, { method: 'DELETE' });
    if (data && data.success) {
        showNotification('Market deleted', 'success');
        loadMarkets();
        // If we were viewing this market's products, hide the section.
        if (currentMarketId === Number(id)) {
            document.getElementById('productsSection').style.display = 'none';
            currentMarketId = null;
        }
    } else {
        showNotification((data && data.message) || 'Failed to delete market', 'error');
    }
}

// ── Products ────────────────────────────────────────────────────────

async function viewProducts(marketId) {
    currentMarketId = Number(marketId);
    const market = markets.find((m) => Number(m.id) === currentMarketId);

    document.getElementById('currentMarketName').textContent = market ? market.name : '';
    document.getElementById('productsSection').style.display = 'block';
    document.getElementById('productsSection').scrollIntoView({ behavior: 'smooth' });

    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '<div class="loading-card">Loading products...</div>';

    const data = await apiRequest(`/admin/products?marketId=${currentMarketId}`);
    products = data && data.success ? data.data : [];

    if (products.length === 0) {
        grid.innerHTML = '<div class="loading-card">No products in this market yet.</div>';
        return;
    }

    grid.innerHTML = products.map((p) => `
        <div class="product-card">
            ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="" class="product-img" onerror="this.style.display='none'">` : ''}
            <div class="product-body">
                <h4>${escapeHtml(p.name)}</h4>
                <p>${escapeHtml(p.description || '')}</p>
                <div class="product-price">${formatCurrency(p.price)}</div>
                <span class="badge-status ${p.status === 'active' ? 'approved' : 'cancelled'}">
                    ${escapeHtml((p.status || 'active').toUpperCase())}
                </span>
            </div>
            <div class="product-actions">
                <button class="btn btn-sm btn-primary" onclick="editProduct(${Number(p.id)})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct(${Number(p.id)})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function showAddProductModal() {
    if (!currentMarketId) {
        showNotification('Open a market first, then add products to it', 'error');
        return;
    }
    editingProductId = null;
    document.getElementById('productModalTitle').textContent = 'Add Product';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productMarketId').value = currentMarketId;
    document.getElementById('productModal').classList.add('active');
}

function editProduct(id) {
    const p = products.find((x) => Number(x.id) === Number(id));
    if (!p) return;

    editingProductId = Number(id);
    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('productId').value = p.id;
    document.getElementById('productMarketId').value = p.market_id || currentMarketId;
    document.getElementById('productName').value = p.name;
    document.getElementById('productDescription').value = p.description || '';
    document.getElementById('productImage').value = p.image_url || '';
    document.getElementById('productPrice').value = p.price;
    document.getElementById('productStatus').value = p.status || 'active';

    document.getElementById('productModal').classList.add('active');
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
    editingProductId = null;
}

async function submitProduct(e) {
    e.preventDefault();

    const payload = {
        name: document.getElementById('productName').value.trim(),
        description: document.getElementById('productDescription').value.trim(),
        imageUrl: document.getElementById('productImage').value.trim(),
        price: parseFloat(document.getElementById('productPrice').value) || 0,
        marketId: Number(document.getElementById('productMarketId').value) || currentMarketId,
        status: document.getElementById('productStatus').value
    };

    if (!payload.name) {
        showNotification('Product name is required', 'error');
        return;
    }

    const data = editingProductId
        ? await apiRequest(`/admin/products/${editingProductId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          })
        : await apiRequest('/admin/products', {
            method: 'POST',
            body: JSON.stringify(payload)
          });

    if (data && data.success) {
        showNotification(editingProductId ? 'Product updated' : 'Product created', 'success');
        closeProductModal();
        viewProducts(currentMarketId);
    } else {
        showNotification((data && data.message) || 'Failed to save product', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    const data = await apiRequest(`/admin/products/${id}`, { method: 'DELETE' });
    if (data && data.success) {
        showNotification('Product deleted', 'success');
        viewProducts(currentMarketId);
    } else {
        showNotification((data && data.message) || 'Failed to delete product', 'error');
    }
}

// ── Init ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const marketForm = document.getElementById('marketForm');
    if (marketForm) marketForm.addEventListener('submit', submitMarket);

    const productForm = document.getElementById('productForm');
    if (productForm) productForm.addEventListener('submit', submitProduct);

    loadMarkets();
});
