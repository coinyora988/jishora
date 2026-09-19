/**
 * Reports Page
 *
 * Populates every figure from real backend aggregates (/admin/reports).
 * The previous version was 100% hardcoded (e.g. totalRevenue 125430.50) with
 * fake trend badges. Trends are not computed by the backend, so the static
 * "+15.3%" style badges are hidden rather than left showing invented numbers.
 */

let currentReport = 'overview';

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// Remove the hardcoded trend badges (e.g. "+15.3%") so no invented figure shows.
function stripFakeTrends() {
    document.querySelectorAll('.summary-details .trend').forEach((el) => {
        el.remove();
    });
}

async function loadReports() {
    const days = parseInt((document.getElementById('dateRange') || {}).value, 10) || 30;
    const data = await apiRequest(`/admin/reports?days=${days}`);
    if (!data || !data.success) {
        showNotification('Failed to load reports', 'error');
        return;
    }

    const { financial, users, tasks, topMarkets } = data.data;

    // ── Overview ──
    // "Revenue" here = completed deposits (money into the platform).
    setText('totalRevenue', formatCurrency(financial.totalDeposits));
    setText('totalDeposits', formatCurrency(financial.totalDeposits));
    setText('totalWithdrawals', formatCurrency(financial.totalWithdrawals));
    setText('netProfit', formatCurrency(financial.netProfit));

    const tbody = document.getElementById('topMarketsTable');
    if (tbody) {
        if (!topMarkets || topMarkets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No market activity yet</td></tr>';
        } else {
            tbody.innerHTML = topMarkets.map((m, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${escapeHtml(m.name)}</td>
                    <td>${m.taskCount}</td>
                    <td>${formatCurrency(m.commission)}</td>
                    <td><span class="badge-status approved">ACTIVE</span></td>
                </tr>
            `).join('');
        }
    }

    // ── Financial ──
    setText('finDeposits', formatCurrency(financial.totalDeposits));
    setText('finWithdrawals', formatCurrency(financial.totalWithdrawals));
    setText('finCommissions', formatCurrency(financial.totalPayouts));
    setText('finBalance', formatCurrency(financial.netProfit));

    // ── Users ──
    setText('activeUsers', users.activeUsers);
    setText('newUsers', users.newUsers);
    const retention = users.totalUsers > 0
        ? Math.round((users.activeUsers / users.totalUsers) * 1000) / 10
        : 0;
    setText('retentionRate', `${retention}%`);
    // VIP count is not returned separately; show total users as a stand-in label.
    setText('vipUsers', users.totalUsers);

    // ── Tasks ──
    setText('totalTasksCount', tasks.totalTasks);
    setText('completedTasksCount', tasks.completedTasks);
    setText('pendingTasksCount', Math.max(0, tasks.totalTasks - tasks.completedTasks));
    const completion = tasks.totalTasks > 0
        ? Math.round((tasks.completedTasks / tasks.totalTasks) * 1000) / 10
        : 0;
    setText('completionRate', `${completion}%`);
}

// Switch between the report tabs (overview/financial/users/tasks).
function showReport(type) {
    currentReport = type;
    document.querySelectorAll('.report-section').forEach((s) => {
        s.style.display = 'none';
    });
    const section = document.getElementById(`${type}Report`);
    if (section) section.style.display = 'block';

    document.querySelectorAll('.report-tab').forEach((t) => t.classList.remove('active'));
    // Highlight the clicked tab.
    if (window.event && window.event.target) {
        window.event.target.classList.add('active');
    }
}

function updateReports() {
    loadReports();
}

document.addEventListener('DOMContentLoaded', () => {
    stripFakeTrends();
    loadReports();
});
