/**
 * Admin Routes
 */

const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const realtime = require('../utils/realtime');
const {
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
} = require('../controllers/adminController');
const {
  broadcastNotification,
  sendTargetedNotification,
  sendToUser,
  getNotificationStats,
  getAllNotifications
} = require('../controllers/notificationController');
const {
  getSettingsGroup,
  saveSettingsGroup,
  getWallets,
  createWallet,
  updateWallet,
  deleteWallet
} = require('../controllers/adminSettingsController');
const {
  listMarkets,
  createMarket,
  updateMarket,
  deleteMarket,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listComboOffers,
  createComboOffer,
  updateComboOffer,
  toggleComboOffer,
  deleteComboOffer,
  getReferralStats,
  getReferrers,
  listInviteCodes,
  createInviteCodes,
  disableInviteCode,
  deleteInviteCode
} = require('../controllers/adminContentController');
const { getReports } = require('../controllers/adminReportsController');
const {
  listProxyAccounts,
  createProxyAccount,
  listProxyCombos,
  saveProxyCombos
} = require('../controllers/adminProxyController');
const {
  listPermissions,
  grantPermission,
  revokePermission,
  grantCombo,
  setComboPlan,
  cancelComboPlan,
  listComboCustomers,
  permissionHistory,
  getSequencePlan,
  setSequencePlan,
  cancelSequencePlan
} = require('../controllers/adminPermissionController');
const {
  validateUserUpdate,
  validateTransactionAction,
  validateNotification,
  validateTargetedNotification,
  validatePagination
} = require('../middleware/validation');
const { adminLimiter, notificationLimiter } = require('../middleware/rateLimiter');

/**
 * @route  GET /api/admin/events
 * @desc   Server-Sent Events stream. The admin browser connects here once and
 *         receives instant push notifications whenever a customer acts, so the
 *         panel updates in real time with no polling delay.
 * @access Admin (token passed as ?token= because EventSource can't set headers)
 *
 * Declared BEFORE the header-based `protect` middleware below, since EventSource
 * cannot send an Authorization header — it authenticates via the query token.
 */
router.get('/events', async (req, res) => {
  try {
    const token = req.query.token;
    const decoded = token ? verifyToken(token) : null;
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    const user = await User.findById(decoded.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    // Open the SSE stream.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    // Send headers + initial bytes immediately (no buffering) and disable
    // Nagle's algorithm on the socket so each event is flushed instantly.
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    if (req.socket && typeof req.socket.setNoDelay === 'function') req.socket.setNoDelay(true);
    res.write('retry: 3000\n\n');        // tell the browser to reconnect after 3s if dropped
    res.write(': connected\n\n');
    realtime.addClient(res);
  } catch (e) {
    if (!res.headersSent) res.status(500).end();
  }
});

// All routes require admin authentication
router.use(protect, admin, adminLimiter);

// Dashboard
router.get('/dashboard', getDashboardStats);
router.get('/pending-counts', getPendingCounts);

// Users management
router.get('/users', validatePagination, getAllUsers);
router.put('/user/:id/status', validateUserUpdate, updateUserStatus);
router.put('/user/:id/vip', validateUserUpdate, updateUserVIP);
router.put('/user/:id/password', updateUserPassword);
router.put('/user/:id/withdrawal-restriction', updateWithdrawalRestriction);
router.get('/withdrawal-restrictions', listWithdrawalRestricted);

// Transactions management
router.get('/transactions', validatePagination, getAllTransactions);
router.post('/transaction/:id/approve', validateTransactionAction, approveTransaction);
router.post('/transaction/:id/reject', validateTransactionAction, rejectTransaction);

// Tasks management
router.get('/tasks', validatePagination, getAllTasks);

// Task permissions (admin grants one-time permission for a user to start a task)
router.get('/task-permissions', listPermissions);
router.post('/task-permissions/:userId/grant', grantPermission);
router.post('/task-permissions/:userId/revoke', revokePermission);
router.post('/task-permissions/:userId/combo', grantCombo);
router.post('/task-permissions/:userId/combo-plan', setComboPlan);
router.post('/task-permissions/:userId/combo-plan/cancel', cancelComboPlan);
router.get('/task-permissions/:userId/sequence-plan', getSequencePlan);
router.post('/task-permissions/:userId/sequence-plan', setSequencePlan);
router.post('/task-permissions/:userId/sequence-plan/cancel', cancelSequencePlan);
router.get('/task-permissions/:userId/history', permissionHistory);
router.get('/combo-customers', listComboCustomers);

// Proxy accounts + global per-market combo templates
router.get('/proxy-accounts', listProxyAccounts);
router.post('/proxy-accounts', createProxyAccount);
router.get('/proxy-combos', listProxyCombos);
router.put('/proxy-combos/:marketId', saveProxyCombos);

// Notifications management
router.post('/notifications/broadcast', notificationLimiter, validateNotification, broadcastNotification);
router.post('/notifications/targeted', notificationLimiter, validateTargetedNotification, sendTargetedNotification);
router.post('/notifications/user', notificationLimiter, sendToUser);
router.get('/notifications/stats', getNotificationStats);
router.get('/notifications/all', validatePagination, getAllNotifications);

// Settings (general / customer-service / support-page)
router.get('/settings/:group', getSettingsGroup);
router.put('/settings/:group', saveSettingsGroup);

// Payment wallets
router.get('/wallets', getWallets);
router.post('/wallets', createWallet);
router.put('/wallets/:id', updateWallet);
router.delete('/wallets/:id', deleteWallet);

// Markets & products
router.get('/markets', listMarkets);
router.post('/markets', createMarket);
router.put('/markets/:id', updateMarket);
router.delete('/markets/:id', deleteMarket);
router.get('/products', listProducts);
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

// Combo offers
router.get('/combo-offers', listComboOffers);
router.post('/combo-offers', createComboOffer);
router.put('/combo-offers/:id', updateComboOffer);
router.post('/combo-offers/:id/toggle', toggleComboOffer);
router.delete('/combo-offers/:id', deleteComboOffer);

// Referrals overview
router.get('/referrals/stats', getReferralStats);
router.get('/referrals', getReferrers);

// Invite codes (admin-generated single-use registration codes)
router.get('/invite-codes', listInviteCodes);
router.post('/invite-codes', createInviteCodes);
router.post('/invite-codes/:id/disable', disableInviteCode);
router.delete('/invite-codes/:id', deleteInviteCode);

// Reports
router.get('/reports', getReports);

/**
 * @route  POST /api/admin/run-migration/sequence-plans
 * @desc   One-time, idempotent creation of the sequence_plans table on the live
 *         DB (Railway) without shell access. Safe to call repeatedly — it only
 *         creates the table if it does not already exist.
 * @access Admin
 */
router.post('/run-migration/sequence-plans', async (req, res, next) => {
  try {
    const { query } = require('../config/database');
    const exists = await query(
      `SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sequence_plans'`
    );
    if (exists.length) {
      return res.json({ success: true, message: 'sequence_plans already exists', created: false });
    }
    await query(`
      CREATE TABLE sequence_plans (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        deposit DECIMAL(15,2) NOT NULL,
        num_orders INT NOT NULL,
        target_total DECIMAL(15,2) NOT NULL,
        combo_order INT NOT NULL,
        combo_amount DECIMAL(15,2) NOT NULL,
        combo_profit DECIMAL(15,2) NOT NULL,
        schedule JSON NOT NULL,
        start_order INT NOT NULL DEFAULT 0,
        current_order INT NOT NULL DEFAULT 0,
        status ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        INDEX idx_user_status (user_id, status),
        CONSTRAINT fk_seqplan_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    res.json({ success: true, message: 'sequence_plans table created', created: true });
  } catch (error) {
    next(error);
  }
});

// Chart data
router.get('/chart/revenue', async (req, res, next) => {
  try {
    const { getRevenueChartData } = require('../controllers/adminController');
    const days = parseInt(req.query.days) || 30;
    const data = await getRevenueChartData(days);
    
    res.json({
      success: true,
      data: {
        labels: data.labels,
        values: data.data
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/chart/activity', async (req, res, next) => {
  try {
    const { getActivityChartData } = require('../controllers/adminController');
    const days = parseInt(req.query.days) || 30;
    const data = await getActivityChartData(days);
    
    res.json({
      success: true,
      data: {
        labels: data.labels,
        values: data.data
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
