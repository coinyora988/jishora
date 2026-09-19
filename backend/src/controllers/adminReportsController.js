/**
 * Admin Reports Controller
 *
 * Real financial and activity aggregates for the Reports page, replacing the
 * hardcoded figures the frontend previously displayed.
 */

const { query } = require('../config/database');

/**
 * @desc    Platform report/overview aggregates
 * @route   GET /api/admin/reports
 * @access  Admin
 *
 * Optional ?days=N narrows the time-boxed figures (default 30).
 */
const getReports = async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));

    // Money in / out. Only completed movements count toward realised figures.
    const [money] = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'deposit'  AND status = 'completed' THEN amount END), 0) AS total_deposits,
         COALESCE(SUM(CASE WHEN type = 'withdraw' AND status = 'completed' THEN amount END), 0) AS total_withdrawals,
         COALESCE(SUM(CASE WHEN type IN ('commission','referral','bonus') AND status = 'completed' THEN amount END), 0) AS total_payouts
       FROM transactions`
    );

    const [pending] = await query(
      `SELECT
         COUNT(CASE WHEN type = 'deposit'  AND status = 'pending' THEN 1 END) AS pending_deposits,
         COUNT(CASE WHEN type = 'withdraw' AND status = 'pending' THEN 1 END) AS pending_withdrawals
       FROM transactions`
    );

    const [users] = await query(
      `SELECT
         COUNT(*) AS total_users,
         COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_users,
         COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 END) AS new_users
       FROM users WHERE role = 'user'`,
      [days]
    );

    const [tasks] = await query(
      `SELECT
         COUNT(*) AS total_tasks,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_tasks,
         COALESCE(SUM(CASE WHEN status = 'completed' THEN commission END), 0) AS total_commission
       FROM tasks`
    );

    // Top markets by task volume, so the report reflects real usage.
    const topMarkets = await query(
      `SELECT m.name, COUNT(t.id) AS task_count,
              COALESCE(SUM(t.commission), 0) AS commission
       FROM markets m
       LEFT JOIN tasks t ON t.market_id = m.id
       GROUP BY m.id, m.name
       ORDER BY task_count DESC
       LIMIT 10`
    );

    const totalDeposits = parseFloat(money.total_deposits);
    const totalWithdrawals = parseFloat(money.total_withdrawals);
    const totalPayouts = parseFloat(money.total_payouts);

    res.json({
      success: true,
      data: {
        financial: {
          totalDeposits,
          totalWithdrawals,
          totalPayouts,
          // Net platform position: money in, minus money paid back out.
          netProfit: totalDeposits - totalWithdrawals - totalPayouts,
          pendingDeposits: Number(pending.pending_deposits) || 0,
          pendingWithdrawals: Number(pending.pending_withdrawals) || 0
        },
        users: {
          totalUsers: Number(users.total_users) || 0,
          activeUsers: Number(users.active_users) || 0,
          newUsers: Number(users.new_users) || 0
        },
        tasks: {
          totalTasks: Number(tasks.total_tasks) || 0,
          completedTasks: Number(tasks.completed_tasks) || 0,
          totalCommission: parseFloat(tasks.total_commission) || 0
        },
        topMarkets: topMarkets.map((m) => ({
          name: m.name,
          taskCount: Number(m.task_count) || 0,
          commission: parseFloat(m.commission) || 0
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getReports };
