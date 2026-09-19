/**
 * Markets and Task Management
 */

requireAuth();

let selectedProduct = null;
let userBalance = 0;

// Load markets
async function loadMarkets() {
    try {
        const data = await API.getMarkets();
        
        if (data && data.success) {
            displayMarkets(data.data);
        } else {
            showNotification('Failed to load markets', 'error');
        }
    } catch (error) {
        console.error('Load markets error:', error);
        showNotification('Error loading markets', 'error');
    }
}

// Display markets
function displayMarkets(markets) {
    const container = document.getElementById('marketsContainer');
    if (!container) return;

    if (markets.length === 0) {
        container.innerHTML = '<p class="no-data">No markets available</p>';
        return;
    }

    container.innerHTML = markets.map(market => `
        <div class="market-card" onclick="viewMarket(${market.id})">
            <div class="market-header">
                <div class="market-logo">
                    ${market.logo_url ? 
                        `<img src="${market.logo_url}" alt="${market.name}">` :
                        `<i class="fas fa-store"></i>`
                    }
                </div>
                <div class="market-info">
                    <h3>${market.name}</h3>
                    <span class="market-category">${market.category || 'Shopping'}</span>
                </div>
            </div>
            <div class="market-details">
                <div class="detail-item">
                    <span class="label">Balance Range</span>
                    <span class="value">${formatCurrency(market.min_balance)} - ${formatCurrency(market.max_balance)}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Commission</span>
                    <span class="value commission">${(market.commission_rate * 100).toFixed(1)}%</span>
                </div>
            </div>
            <button class="btn-view-products">
                View Products <i class="fas fa-arrow-right"></i>
            </button>
        </div>
    `).join('');
}

// View specific market
async function viewMarket(marketId) {
    try {
        const data = await API.getMarket(marketId);
        
        if (data && data.success) {
            userBalance = data.data.userBalance;
            displayMarketProducts(data.data.market, data.data.products);
        } else {
            showNotification('Failed to load market details', 'error');
        }
    } catch (error) {
        console.error('View market error:', error);
        showNotification('Error loading market', 'error');
    }
}

// Display market products
function displayMarketProducts(market, products) {
    const container = document.getElementById('productsContainer');
    if (!container) return;

    // Update market name
    const marketNameEl = document.getElementById('currentMarketName');
    if (marketNameEl) {
        marketNameEl.textContent = market.name;
    }

    // Display balance info
    const balanceInfoEl = document.getElementById('balanceInfo');
    if (balanceInfoEl) {
        balanceInfoEl.innerHTML = `
            Your Balance: ${formatCurrency(userBalance)} | 
            Required: ${formatCurrency(market.min_balance)} - ${formatCurrency(market.max_balance)}
        `;
    }

    if (products.length === 0) {
        container.innerHTML = '<p class="no-data">No products available in this market</p>';
        return;
    }

    container.innerHTML = products.map(product => {
        const canGrab = userBalance >= parseFloat(product.min_balance) && 
                        userBalance <= parseFloat(product.max_balance);

        return `
            <div class="product-card ${canGrab ? '' : 'disabled'}">
                <div class="product-image">
                    ${product.image_url ? 
                        `<img src="${product.image_url}" alt="${product.name}">` :
                        `<i class="fas fa-box"></i>`
                    }
                </div>
                <div class="product-info">
                    <h4>${product.name}</h4>
                    ${product.description ? `<p>${product.description}</p>` : ''}
                    <div class="product-price">
                        <span class="price">${formatCurrency(product.price)}</span>
                        <span class="commission">+${formatCurrency(product.commission)}</span>
                    </div>
                    <div class="product-requirements">
                        <small>Required: ${formatCurrency(product.min_balance)} - ${formatCurrency(product.max_balance)}</small>
                    </div>
                </div>
                <button 
                    class="btn-grab ${canGrab ? 'btn-primary' : 'btn-disabled'}" 
                    onclick="grabOrder(${product.id}, '${product.name}', ${product.price}, ${product.commission})"
                    ${!canGrab ? 'disabled' : ''}
                >
                    ${canGrab ? 'Grab Order' : 'Insufficient Balance'}
                </button>
            </div>
        `;
    }).join('');
}

// Grab order
async function grabOrder(productId, productName, price, commission) {
    // Confirm action
    if (!confirm(`Grab this order?\n\nProduct: ${productName}\nPrice: ${formatCurrency(price)}\nCommission: ${formatCurrency(commission)}\n\nAmount will be frozen until task completion.`)) {
        return;
    }

    try {
        const data = await API.grabTask(productId);
        
        if (data && data.success) {
            showNotification(`Order grabbed successfully! Commission: ${formatCurrency(data.data.commission)}`, 'success');
            
            // Redirect to task page
            setTimeout(() => {
                window.location.href = `/task.html?id=${data.data.taskId}`;
            }, 1500);
        } else {
            // Check if redirect to deposit is needed
            if (data && data.redirectTo) {
                if (confirm(data.message + '\n\nGo to deposit page?')) {
                    window.location.href = data.redirectTo;
                }
            } else {
                showNotification(data?.message || 'Failed to grab order', 'error');
            }
        }
    } catch (error) {
        console.error('Grab order error:', error);
        showNotification('Error grabbing order', 'error');
    }
}

// Load tasks
async function loadTasks(filters = {}) {
    try {
        const data = await API.getTasks(filters);
        
        if (data && data.success) {
            displayTasks(data.data);
        } else {
            showNotification('Failed to load tasks', 'error');
        }
    } catch (error) {
        console.error('Load tasks error:', error);
        showNotification('Error loading tasks', 'error');
    }
}

// Display tasks
function displayTasks(tasks) {
    const container = document.getElementById('tasksContainer');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = '<p class="no-data">No tasks found</p>';
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-card status-${task.status}">
            <div class="task-header">
                <h4>${task.product_name}</h4>
                <span class="task-status ${task.status}">${task.status}</span>
            </div>
            <div class="task-details">
                <div class="detail-row">
                    <span>Market:</span>
                    <strong>${task.market_name || 'N/A'}</strong>
                </div>
                <div class="detail-row">
                    <span>Amount:</span>
                    <strong>${formatCurrency(task.product_price)}</strong>
                </div>
                <div class="detail-row">
                    <span>Commission:</span>
                    <strong class="commission">${formatCurrency(task.commission)}</strong>
                </div>
                <div class="detail-row">
                    <span>Created:</span>
                    <span>${formatDate(task.created_at)}</span>
                </div>
                ${task.completed_at ? `
                    <div class="detail-row">
                        <span>Completed:</span>
                        <span>${formatDate(task.completed_at)}</span>
                    </div>
                ` : ''}
            </div>
            ${task.status === 'pending' ? `
                <button class="btn btn-success" onclick="completeTask(${task.id})">
                    Complete Task
                </button>
            ` : ''}
        </div>
    `).join('');
}

// Complete task
async function completeTask(taskId) {
    if (!confirm('Complete this task?')) {
        return;
    }

    try {
        const data = await API.completeTask(taskId);
        
        if (data && data.success) {
            showNotification(`Task completed! Earned: ${formatCurrency(data.data.commission)}`, 'success');
            
            // Reload tasks
            loadTasks();
            
            // Reload dashboard data
            if (typeof loadDashboard === 'function') {
                loadDashboard();
            }
        } else {
            showNotification(data?.message || 'Failed to complete task', 'error');
        }
    } catch (error) {
        console.error('Complete task error:', error);
        showNotification('Error completing task', 'error');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Load markets if on markets page
    if (document.getElementById('marketsContainer')) {
        loadMarkets();
    }

    // Load tasks if on tasks page
    if (document.getElementById('tasksContainer')) {
        loadTasks();
    }
});

// Export functions
if (typeof window !== 'undefined') {
    window.viewMarket = viewMarket;
    window.grabOrder = grabOrder;
    window.completeTask = completeTask;
}
