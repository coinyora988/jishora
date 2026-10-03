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
  saveProxyCombos,
  getProxyPlan,
  saveProxyPlan,
  clearProxyPlan
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
// Single global proxy plan (sequence plan applied to ALL proxy accounts)
router.get('/proxy-plan', getProxyPlan);
router.post('/proxy-plan', saveProxyPlan);
router.post('/proxy-plan/clear', clearProxyPlan);

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
    const result = { steps: [] };

    // 1) sequence_plans table
    const exists = await query(
      `SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sequence_plans'`
    );
    if (exists.length) {
      result.steps.push('sequence_plans already exists');
    } else {
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
      result.steps.push('sequence_plans table created');
    }

    // 2) tasks.no_freeze column (for sequence-normal display-only order amounts)
    const col = await query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'no_freeze'`
    );
    if (col.length) {
      result.steps.push('tasks.no_freeze already exists');
    } else {
      await query(`ALTER TABLE tasks ADD COLUMN no_freeze TINYINT(1) NOT NULL DEFAULT 0 AFTER is_combo`);
      result.steps.push('tasks.no_freeze column added');
    }

    // 2b) sequence_plans.combos JSON column (holds up to 3 combos per plan)
    const comboCol = await query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sequence_plans' AND COLUMN_NAME = 'combos'`
    );
    if (comboCol.length) {
      result.steps.push('sequence_plans.combos already exists');
    } else {
      await query(`ALTER TABLE sequence_plans ADD COLUMN combos JSON NULL AFTER combo_profit`);
      result.steps.push('sequence_plans.combos column added');
    }

    // 2c) sequence_plans.is_killed — marks a plan as "killed" by admin
    // (button turns yellow in admin panel; customer still follows the plan)
    const killedCol = await query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sequence_plans' AND COLUMN_NAME = 'is_killed'`
    );
    if (killedCol.length) {
      result.steps.push('sequence_plans.is_killed already exists');
    } else {
      await query(`ALTER TABLE sequence_plans ADD COLUMN is_killed TINYINT(1) NOT NULL DEFAULT 0 AFTER combos`);
      result.steps.push('sequence_plans.is_killed column added');
    }

    // 3) Distinct CDN images for every product (so each order shows a unique
    // picture that always loads). Uses Unsplash direct CDN URLs.
    const CDN = (imgId) => `https://images.unsplash.com/${imgId}?auto=format&fit=crop&w=400&q=70`;
    const IMAGE_BY_NAME = {
      'Wireless Earbuds': CDN('photo-1590658268037-6bf12165a8df'),
      'Phone Stand': CDN('photo-1512499617640-c74ae3a79d37'),
      'Phone Ring Holder': CDN('photo-1585060544812-6b45742d762f'),
      'USB-C Cable': CDN('photo-1583863788434-e58a36330cf0'),
      'LED Desk Lamp': CDN('photo-1507473885765-e6ed057f782c'),
      'Bluetooth Speaker': CDN('photo-1608043152269-423dbba4e7e1'),
      'Power Bank 10000mAh': CDN('photo-1609091839311-d5365f9ff1c5'),
      'Smart Watch Pro': CDN('photo-1523275335684-37898b6baf30'),
      'Noise-Cancelling Headphones': CDN('photo-1505740420928-5e560c06d30e'),
      'Action Camera 4K': CDN('photo-1526170375885-4d8ecf77b99f'),
      'Robot Vacuum': CDN('photo-1626436819821-d2edd5f5d5f9'),
      'Espresso Machine': CDN('photo-1517668808822-9ebb02f2a0e6'),
      'Wireless Charger': CDN('photo-1591290619762-d0b81c4d9c1f'),
      '4K Monitor': CDN('photo-1527443224154-c4a3942d3acf'),
      'Premium Laptop': CDN('photo-1496181133206-80ce9b88a853'),
      'Gaming Console': CDN('photo-1486401899868-0e435ed85128'),
      'Tablet Pro 12 inch': CDN('photo-1544244015-0df4b3ffc6b0'),
      'Home Theatre System': CDN('photo-1593784991095-a205069470b6'),
      'Mechanical Keyboard': CDN('photo-1541140532154-b024d705b90a')
    };
    const FALLBACKS = [
      CDN('photo-1523275335684-37898b6baf30'),
      CDN('photo-1560343090-f0409e92791a'),
      CDN('photo-1526170375885-4d8ecf77b99f'),
      CDN('photo-1550009158-9ebf69173e03')
    ];
    const products = await query('SELECT id, name FROM products');
    let fb = 0;
    for (const p of products) {
      const url = IMAGE_BY_NAME[p.name] || FALLBACKS[(fb++) % FALLBACKS.length];
      await query('UPDATE products SET image_url = ? WHERE id = ?', [url, p.id]);
    }
    result.steps.push(`${products.length} product image(s) set to CDN`);

    res.json({ success: true, message: 'Migration applied', ...result });
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

/**
 * @route  POST /api/admin/fix/plan-cursor/:userId
 * @desc   Reset a user's active sequence plan cursor so it re-runs from a
 *         specific run-order (e.g. to replay a missed combo from order #20).
 *         Body: { runOrder: 19 }  — sets current_order to runOrder-1 so the
 *         NEXT grab is at runOrder. Also resets start_order so the plan math
 *         lines up correctly from the user's current completed-task count.
 * @access Admin
 */
router.post('/fix/plan-cursor/:userId', async (req, res, next) => {
  try {
    const { query } = require('../config/database');
    const userId = parseInt(req.params.userId, 10);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid userId' });

    // runOrder: the plan run-order we want to be the NEXT grab (1-based within plan).
    const runOrder = parseInt(req.body.runOrder, 10);
    if (!runOrder || runOrder < 1) {
      return res.status(400).json({ success: false, message: 'runOrder must be >= 1' });
    }

    // Get most recent plan (active OR completed — we may need to reactivate it)
    const plans = await query(
      `SELECT id, num_orders, status FROM sequence_plans
       WHERE user_id = ? AND status IN ('active','completed')
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (!plans.length) {
      return res.status(404).json({ success: false, message: 'No active or completed plan found for this user' });
    }
    const plan = plans[0];

    if (runOrder > plan.num_orders) {
      return res.status(400).json({ success: false, message: `runOrder ${runOrder} exceeds plan length ${plan.num_orders}` });
    }

    // Get user's current completed task count
    const [cnt] = await query(
      "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'completed'",
      [userId]
    );
    const completedNow = Number(cnt ? cnt.n : 0);

    // Set current_order = runOrder - 1 so the NEXT grab lands on runOrder.
    // Set start_order so planRunOrder = (non-cancelled tasks since plan) + 1 = runOrder
    const newCurrentOrder = runOrder - 1;
    const newStartOrder = Math.max(0, completedNow - newCurrentOrder);

    // Reactivate plan if it was completed, reset cursor
    await query(
      `UPDATE sequence_plans
         SET current_order = ?, start_order = ?, status = 'active', completed_at = NULL
       WHERE id = ?`,
      [newCurrentOrder, newStartOrder, plan.id]
    );

    // Cancel any stale pending combo tasks so sticky-combo doesn't re-show old ones.
    await query(
      `UPDATE tasks SET status = 'cancelled', completion_time = CURRENT_TIMESTAMP
       WHERE user_id = ? AND status = 'pending' AND is_combo = 1`,
      [userId]
    );

    res.json({
      success: true,
      message: `Plan ${plan.status === 'completed' ? 'reactivated and ' : ''}cursor reset: next grab will be plan run-order #${runOrder}`,
      data: { planId: plan.id, previousStatus: plan.status, newCurrentOrder, newStartOrder, completedNow }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route  POST /api/admin/fix/permission-count/:userId
 * @desc   Reduce a user's Times Requested count by revoking the most recent
 *         unused grant row. Body: { count: 1 } — how many to revoke (default 1).
 * @access Admin
 */
router.post('/fix/permission-count/:userId', async (req, res, next) => {
  try {
    const { query } = require('../config/database');
    const userId = parseInt(req.params.userId, 10);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid userId' });

    const count = Math.max(1, parseInt(req.body.count, 10) || 1);

    // Find the most recent 'used' or 'granted' non-revoked rows and mark them revoked.
    // We target 'used' rows first (already exhausted) to avoid blocking active work.
    const rows = await query(
      `SELECT id, status FROM task_permissions
       WHERE user_id = ? AND status IN ('used','granted')
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, count]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'No eligible permission rows found' });
    }

    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    await query(
      `UPDATE task_permissions SET status = 'revoked' WHERE id IN (${placeholders})`,
      ids
    );

    res.json({
      success: true,
      message: `Revoked ${ids.length} permission row(s) — Times Requested reduced by ${ids.length}`,
      data: { revokedIds: ids }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route  POST /api/admin/fix/apply-mostafa
 * @desc   One-time fix for user #37 (mostafa): reset plan cursor to run-order
 *         #20 (missed combo) and grant a fresh 6-task permission batch.
 *         Safe to call multiple times (idempotent-ish).
 * @access Admin
 */
router.post('/fix/apply-mostafa', async (req, res, next) => {
  try {
    const { query } = require('../config/database');
    const userId = 37; // mostafa

    // 1) Find most recent plan (active or completed)
    const plans = await query(
      `SELECT id, num_orders, status FROM sequence_plans
       WHERE user_id = ? AND status IN ('active','completed')
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (!plans.length) {
      return res.status(404).json({ success: false, message: 'No plan found for user #37' });
    }
    const plan = plans[0];
    const runOrder = 20; // resume from combo #20

    // 2) Get current completed count
    const [cnt] = await query(
      "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'completed'",
      [userId]
    );
    const completedNow = Number(cnt ? cnt.n : 0);

    const newCurrentOrder = runOrder - 1; // 19
    const newStartOrder = Math.max(0, completedNow - newCurrentOrder);

    // 3) Reactivate plan and reset cursor to order #20
    await query(
      `UPDATE sequence_plans
         SET current_order = ?, start_order = ?, status = 'active', completed_at = NULL
       WHERE id = ?`,
      [newCurrentOrder, newStartOrder, plan.id]
    );

    // 4) Cancel any stale pending combo tasks
    await query(
      `UPDATE tasks SET status = 'cancelled', completion_time = CURRENT_TIMESTAMP
       WHERE user_id = ? AND status = 'pending' AND is_combo = 1`,
      [userId]
    );

    // 5) Grant a fresh 6-task permission batch (revoke any existing active ones first)
    await query(
      `UPDATE task_permissions SET status = 'revoked'
       WHERE user_id = ? AND status = 'granted' AND used_count < batch_size`,
      [userId]
    );
    await query(
      `INSERT INTO task_permissions (user_id, status, batch_size, used_count, granted_by, note)
       VALUES (?, 'granted', 6, 0, 1, 'Auto-fix: resume from combo #20')`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Fixed! Plan reset to order #20, 6-task permission granted.',
      data: { planId: plan.id, previousStatus: plan.status, newCurrentOrder, newStartOrder, completedNow, permissionGranted: 6 }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
