/**
 * Admin Controller
 * Handles admin-specific operations
 */

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Task = require('../models/Task');
const Market = require('../models/Market');
const Notification = require('../models/Notification');
const SequencePlan = require('../models/SequencePlan');
const { query } = require('../config/database');

/**
 * @desc    Get dashboard statistics
 * @route   GET /api/admin/dashboard
 * @access  Admin
 */
const getDashboardStats = async (req, res, next) => {
  try {
    // Get total users
    const [userStats] = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last_month,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as previous_month
      FROM users
    `);

    // Get revenue stats
    const [revenueStats] = await query(`
      SELECT 
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total,
        SUM(CASE WHEN status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount ELSE 0 END) as last_month,
        SUM(CASE WHEN status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount ELSE 0 END) as previous_month
      FROM transactions
      WHERE type = 'deposit'
    `);

    // Get task stats
    const [taskStats] = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last_month,
        SUM(CASE WHEN status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND completed_at < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as previous_month
      FROM tasks
      WHERE status = 'completed'
    `);

    // Get pending requests
    const [pendingStats] = await query(`
      SELECT COUNT(*) as count
      FROM transactions
      WHERE status = 'pending'
    `);

    // Calculate growth percentages
    const usersGrowth = calculateGrowth(userStats.last_month, userStats.previous_month);
    const revenueGrowth = calculateGrowth(revenueStats.last_month, revenueStats.previous_month);
    const tasksGrowth = calculateGrowth(taskStats.last_month, taskStats.previous_month);

    // Get chart data (last 30 days)
    const revenueChart = await getRevenueChartData(30);
    const activityChart = await getActivityChartData(30);

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers: userStats.total,
          usersGrowth,
          totalRevenue: parseFloat(revenueStats.total || 0),
          revenueGrowth,
          totalTasks: taskStats.total,
          tasksGrowth,
          pendingRequests: pendingStats.count
        },
        charts: {
          revenue: revenueChart,
          activity: activityChart
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get pending transaction counts
 * @route   GET /api/admin/pending-counts
 * @access  Admin
 */
const getPendingCounts = async (req, res, next) => {
  try {
    const [deposits] = await query(
      'SELECT COUNT(*) as count FROM transactions WHERE type = "deposit" AND status = "pending"'
    );

    const [withdrawals] = await query(
      'SELECT COUNT(*) as count FROM transactions WHERE type = "withdraw" AND status = "pending"'
    );

    res.json({
      success: true,
      data: {
        deposits: deposits.count,
        withdrawals: withdrawals.count
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all transactions (admin)
 * @route   GET /api/admin/transactions
 * @access  Admin
 */
const getAllTransactions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await Transaction.getAll(page, limit, req.query);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve deposit
 * @route   POST /api/admin/transaction/:id/approve
 * @access  Admin
 */
const approveTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.getById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.type === 'deposit') {
      await Transaction.approveDeposit(req.params.id, req.user.id);

      // Auto-start an earnings sequence plan from this deposit IF the customer
      // has no active plan yet. This gives every funded customer the default
      // run (e.g. deposit $20 -> 25 orders -> target $40) without the admin
      // having to set it manually. The admin can still override it afterwards.
      try {
        const existing = await SequencePlan.getActive(transaction.user_id);
        if (!existing) {
          await SequencePlan.createForUser(
            transaction.user_id,
            parseFloat(transaction.amount),
            null,          // use the default tier / proportional scaling
            req.user.id
          );
        }
      } catch (e) {
        // Never fail the deposit approval because of plan creation.
        console.error('Sequence plan auto-create failed:', e.message);
      }
    } else if (transaction.type === 'withdraw') {
      await Transaction.approveWithdrawal(req.params.id, req.user.id);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction type'
      });
    }

    res.json({
      success: true,
      message: 'Transaction approved successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reject transaction
 * @route   POST /api/admin/transaction/:id/reject
 * @access  Admin
 */
const rejectTransaction = async (req, res, next) => {
  try {
    const { reason } = req.body;

    await Transaction.reject(req.params.id, req.user.id, reason);

    res.json({
      success: true,
      message: 'Transaction rejected'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all users (admin)
 * @route   GET /api/admin/users
 * @access  Admin
 */
const getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await User.getAll(page, limit, req.query);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user status
 * @route   PUT /api/admin/user/:id/status
 * @access  Admin
 */
const updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    await User.updateStatus(req.params.id, status);

    res.json({
      success: true,
      message: 'User status updated'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user VIP level
 * @route   PUT /api/admin/user/:id/vip
 * @access  Admin
 */
const updateUserVIP = async (req, res, next) => {
  try {
    const { level } = req.body;

    await User.updateVIPLevel(req.params.id, level);

    res.json({
      success: true,
      message: 'VIP level updated'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset a user's password (customer-service recovery)
 * @route   PUT /api/admin/user/:id/password
 * @access  Admin
 *
 * Passwords are stored hashed and cannot be read, so support cannot see the
 * user's old password — this sets a NEW one. It is hashed (bcrypt) by
 * User.updatePassword. Enforces the same strength rules as the customer UI.
 */
const updateUserPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword ||
        newPassword.length < 8 ||
        !/[A-Z]/.test(newPassword) ||
        !/[a-z]/.test(newPassword) ||
        !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with an uppercase letter, a lowercase letter, and a number.'
      });
    }

    // Make sure the user exists before touching the password.
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await User.updatePassword(req.params.id, newPassword);

    res.json({
      success: true,
      message: `Password reset for ${user.username}`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Set or clear a customer's withdrawal restriction
 * @route   PUT /api/admin/user/:id/withdrawal-restriction
 * @access  Admin
 *
 * Body: { locked: boolean, reason?: string }
 * When locked=true the customer cannot withdraw and sees `reason` on the
 * withdraw page. When locked=false the restriction is removed. The admin can
 * call this repeatedly to change the message or re-apply/remove it.
 */
const updateWithdrawalRestriction = async (req, res, next) => {
  try {
    const locked = req.body.locked === true || req.body.locked === 'true' || req.body.locked === 1;
    const reason = (req.body.reason || '').toString().trim().slice(0, 255);

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await User.setWithdrawalRestriction(req.params.id, locked, reason || null);

    // Let the customer know via a notification so they see the reason even
    // before they open the withdraw page.
    if (locked) {
      await Notification.create(
        req.params.id,
        'Withdrawal Restricted',
        reason || 'Withdrawals are temporarily restricted. Please contact customer service.',
        'warning'
      );
    }

    res.json({
      success: true,
      message: locked
        ? `Withdrawal restriction applied to ${user.username}`
        : `Withdrawal restriction removed from ${user.username}`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List all customers currently under a withdrawal restriction
 * @route   GET /api/admin/withdrawal-restrictions
 * @access  Admin
 */
const listWithdrawalRestricted = async (req, res, next) => {
  try {
    const users = await User.getWithdrawalRestricted();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all tasks (admin)
 * @route   GET /api/admin/tasks
 * @access  Admin
 */
const getAllTasks = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await Task.getAll(page, limit, req.query);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get revenue chart data
 * @route   GET /api/admin/chart/revenue
 * @access  Admin
 */
const getRevenueChartData = async (days = 30) => {
  const chartData = await query(`
    SELECT 
      DATE(created_at) as date,
      SUM(amount) as total
    FROM transactions
    WHERE type = 'deposit' 
      AND status = 'completed'
      AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `, [days]);

  return {
    labels: chartData.map(d => new Date(d.date).toLocaleDateString()),
    data: chartData.map(d => parseFloat(d.total))
  };
};

/**
 * @desc    Get activity chart data
 * @route   GET /api/admin/chart/activity
 * @access  Admin
 */
const getActivityChartData = async (days = 30) => {
  const chartData = await query(`
    SELECT 
      DATE(last_login) as date,
      COUNT(DISTINCT id) as count
    FROM users
    WHERE last_login >= DATE_SUB(NOW(), INTERVAL ? DAY)
    GROUP BY DATE(last_login)
    ORDER BY date ASC
  `, [days]);

  return {
    labels: chartData.map(d => new Date(d.date).toLocaleDateString()),
    data: chartData.map(d => d.count)
  };
};

// Helper function to calculate growth percentage
function calculateGrowth(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

module.exports = {
  getDashboardStats,
  getPendingCounts,
  getAllTransactions,
  approveTransaction,
  rejectTransaction,
  getAllUsers,
  updateUserStatus,
  updateUserVIP,
  updateUserPassword,
  updateWithdrawalRestriction,
  listWithdrawalRestricted,
  getAllTasks
};
