// Dashboard Script
let revenueChart, activityChart;

// Load dashboard data
async function loadDashboardData() {
    try {
        const data = await apiRequest('/admin/dashboard');
        
        if (data && data.success) {
            updateStatCards(data.data.stats);
            loadRecentTransactions();
            initializeCharts(data.data.charts);
        }
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
    }
}

// Update stat cards
function updateStatCards(stats) {
    document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
    document.getElementById('usersGrowth').textContent = `${stats.usersGrowth || 0}%`;
    
    document.getElementById('totalRevenue').textContent = formatCurrency(stats.totalRevenue || 0);
    document.getElementById('revenueGrowth').textContent = `${stats.revenueGrowth || 0}%`;
    
    document.getElementById('totalTasks').textContent = stats.totalTasks || 0;
    document.getElementById('tasksGrowth').textContent = `${stats.tasksGrowth || 0}%`;
    
    document.getElementById('pendingRequests').textContent = stats.pendingRequests || 0;
}

// Load recent transactions
async function loadRecentTransactions() {
    const tbody = document.getElementById('recentTransactions');
    
    try {
        const data = await apiRequest('/admin/transactions?limit=10');
        
        if (data && data.success) {
            const transactions = data.data.transactions;
            
            if (transactions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No transactions found</td></tr>';
                return;
            }
            
            tbody.innerHTML = transactions.map(txn => `
                <tr>
                    <td>#${txn.id}</td>
                    <td>${txn.username || 'N/A'}</td>
                    <td>${txn.type.toUpperCase()}</td>
                    <td>${formatCurrency(txn.amount)}</td>
                    <td>${formatStatus(txn.status)}</td>
                    <td>${formatDate(txn.created_at)}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load transactions</td></tr>';
    }
}

// Initialize charts
function initializeCharts(chartData) {
    // Revenue Chart
    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
        revenueChart = new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels: chartData?.revenue?.labels || ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
                datasets: [{
                    label: 'Revenue',
                    data: chartData?.revenue?.data || [120, 190, 300, 500, 200, 300, 450],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value;
                            }
                        }
                    }
                }
            }
        });
    }

    // Activity Chart
    const activityCtx = document.getElementById('activityChart');
    if (activityCtx) {
        activityChart = new Chart(activityCtx, {
            type: 'bar',
            data: {
                labels: chartData?.activity?.labels || ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                datasets: [{
                    label: 'Active Users',
                    data: chartData?.activity?.data || [65, 85, 95, 110],
                    backgroundColor: '#8b5cf6'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

// Update revenue chart based on timeframe
async function updateRevenueChart() {
    const timeframe = document.getElementById('revenueTimeframe').value;
    
    try {
        const data = await apiRequest(`/admin/chart/revenue?days=${timeframe}`);
        
        if (data && data.success && revenueChart) {
            revenueChart.data.labels = data.data.labels;
            revenueChart.data.datasets[0].data = data.data.values;
            revenueChart.update();
        }
    } catch (error) {
        console.error('Failed to update revenue chart:', error);
    }
}

// Update activity chart based on timeframe
async function updateActivityChart() {
    const timeframe = document.getElementById('activityTimeframe').value;
    
    try {
        const data = await apiRequest(`/admin/chart/activity?days=${timeframe}`);
        
        if (data && data.success && activityChart) {
            activityChart.data.labels = data.data.labels;
            activityChart.data.datasets[0].data = data.data.values;
            activityChart.update();
        }
    } catch (error) {
        console.error('Failed to update activity chart:', error);
    }
}

// Load dashboard on page load
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();

    // Real-time auto-refresh via the shared poller.
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(loadDashboardData);
    }
});
