/**
 * Admin Permission Controller
 *
 * Powers the admin "Task Permissions" page. Admins grant one-time permissions
 * that let a customer start (grab) exactly one task. Permission is required
 * every time — each grant is consumed on the next successful grab.
 */

const TaskPermission = require('../models/TaskPermission');
const ComboPlan = require('../models/ComboPlan');
const SequencePlan = require('../models/SequencePlan');
const Notification = require('../models/Notification');
const { query } = require('../config/database');
const seqUtil = require('../utils/sequencePlan');

/**
 * @desc    List users with their available-permission status
 * @route   GET /api/admin/task-permissions
 * @access  Admin
 */
const listPermissions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = (req.query.search || '').trim();

    const result = await TaskPermission.listUserStatus(page, limit, search);

    // Attach pending combo plans per user so the admin can see/adjust them.
    const comboMap = await ComboPlan.pendingByUser();
    result.users = result.users.map((u) => ({
      ...u,
      combos: comboMap[u.id] || []
    }));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Grant a one-time task permission to a user
 * @route   POST /api/admin/task-permissions/:userId/grant
 * @access  Admin
 */
const grantPermission = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const [user] = await query('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const note = (req.body && req.body.note) ? String(req.body.note).slice(0, 255) : null;

    // Optional custom batch size (how many tasks this approval covers).
    let batchSize = TaskPermission.DEFAULT_BATCH_SIZE;
    if (req.body && req.body.batchSize != null) {
      const bs = parseInt(req.body.batchSize, 10);
      if (!bs || bs < 1) {
        return res.status(400).json({ success: false, message: 'Batch size must be 1 or more' });
      }
      batchSize = bs;
    }

    let permissionId;
    try {
      permissionId = await TaskPermission.grant(userId, req.user.id, note, batchSize);
    } catch (e) {
      // The customer still has an active batch — no new approval until it is
      // completed (or revoked first).
      if (e.message === 'Batch already active') {
        return res.status(409).json({
          success: false,
          code: 'BATCH_ACTIVE',
          message: `${user.username} still has an active batch. A new approval can only be granted once the current tasks are completed.`
        });
      }
      throw e;
    }

    // Let the customer know they can start working now.
    try {
      await Notification.create(
        userId,
        'Task Permission Granted',
        `The admin has approved you to start working. You can complete up to ${batchSize} tasks on this approval.`,
        'success'
      );
    } catch (e) {
      // Notification failure should not fail the grant.
    }

    const available = (await TaskPermission.availableCountsByUser())[userId] || 0;

    res.status(201).json({
      success: true,
      message: `Approved ${user.username} for a batch of ${batchSize} tasks`,
      data: { permissionId, userId, availablePermissions: available }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Revoke a user's available (unused) permissions
 * @route   POST /api/admin/task-permissions/:userId/revoke
 * @access  Admin
 */
const revokePermission = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const revoked = await TaskPermission.revokeAvailable(userId);

    res.json({
      success: true,
      message: revoked > 0
        ? `Revoked ${revoked} pending permission(s)`
        : 'No pending permissions to revoke',
      data: { revoked }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Grant a COMBO batch to a user (a special work round, tagged combo)
 * @route   POST /api/admin/task-permissions/:userId/combo
 * @access  Admin
 */
const grantCombo = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const [user] = await query('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // A combo round is a batch just like a normal approval, but tagged in the
    // note so it is distinguishable in history and stats. It also respects the
    // one-active-batch rule (cannot stack on an in-progress batch).
    let permissionId;
    try {
      permissionId = await TaskPermission.grant(userId, req.user.id, 'COMBO');
    } catch (e) {
      if (e.message === 'Batch already active') {
        return res.status(409).json({
          success: false,
          code: 'BATCH_ACTIVE',
          message: `${user.username} still has an active batch. Finish or reject it before granting a combo.`
        });
      }
      throw e;
    }

    try {
      await Notification.create(
        userId,
        'Combo Approved',
        `The admin has granted you a COMBO round. You can complete up to ${TaskPermission.DEFAULT_BATCH_SIZE} tasks.`,
        'success'
      );
    } catch (e) { /* notification failure must not fail the grant */ }

    res.status(201).json({
      success: true,
      message: `Combo granted to ${user.username}`,
      data: { permissionId, userId }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Set (configure) combo plan(s) for a user: each combo order of a
 *          given amount appears at a given order number. Accepts one combo or
 *          several at once.
 * @route   POST /api/admin/task-permissions/:userId/combo-plan
 * @access  Admin
 * body: { triggerOrder, amount }  OR  { combos: [{ triggerOrder, amount }, ...] }
 */
const setComboPlan = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    // Accept either a single combo or an array of combos.
    let rawCombos;
    if (Array.isArray(req.body.combos)) {
      rawCombos = req.body.combos;
    } else {
      rawCombos = [{ triggerOrder: req.body.triggerOrder, amount: req.body.amount }];
    }

    // Validate + normalise each entry.
    const combos = [];
    const seenOrders = new Set();
    for (const c of rawCombos) {
      const triggerOrder = parseInt(c.triggerOrder, 10);
      const amount = parseFloat(c.amount);
      if (!triggerOrder || triggerOrder < 1) {
        return res.status(400).json({ success: false, message: 'Each combo needs an order number of 1 or more' });
      }
      if (!(amount > 0)) {
        return res.status(400).json({ success: false, message: 'Each combo needs an amount greater than 0' });
      }
      if (seenOrders.has(triggerOrder)) {
        return res.status(400).json({ success: false, message: `Duplicate order number ${triggerOrder}. Use a different order for each combo.` });
      }
      seenOrders.add(triggerOrder);
      combos.push({ triggerOrder, amount });
    }

    if (!combos.length) {
      return res.status(400).json({ success: false, message: 'Add at least one combo' });
    }

    const [user] = await query('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Replace any existing pending plans, then create all the new ones.
    await ComboPlan.cancelForUser(userId);
    const created = [];
    for (const c of combos) {
      const planId = await ComboPlan.create(userId, c.triggerOrder, c.amount, req.user.id);
      created.push({ planId, triggerOrder: c.triggerOrder, amount: c.amount });
    }

    try {
      const summary = combos.map((c) => `${c.amount} USDT at order #${c.triggerOrder}`).join(', ');
      await Notification.create(
        userId,
        'Combo Offer Ready',
        `Combo offer(s) set for you: ${summary}.`,
        'info'
      );
    } catch (e) { /* non-fatal */ }

    res.status(201).json({
      success: true,
      message: `${created.length} combo(s) set for ${user.username}`,
      data: { combos: created }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel a user's pending combo plan
 * @route   POST /api/admin/task-permissions/:userId/combo-plan/cancel
 * @access  Admin
 */
const cancelComboPlan = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const cancelled = await ComboPlan.cancelForUser(userId);
    res.json({
      success: true,
      message: cancelled > 0 ? 'Combo plan cancelled' : 'No pending combo to cancel',
      data: { cancelled }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Per-customer combo overview (Combo Offers page customer table)
 * @route   GET /api/admin/combo-customers
 * @access  Admin
 *
 * Returns each customer's orders (total/completed), balance, combo commission
 * earned, pending combos and completed combos — so the admin can see the full
 * picture and set/cancel combos from the Combo Offers page.
 */
const listComboCustomers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = (req.query.search || '').trim();
    const result = await ComboPlan.customerOverview(page, limit, search);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a user's permission history
 * @route   GET /api/admin/task-permissions/:userId/history
 * @access  Admin
 */
const permissionHistory = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const history = await TaskPermission.history(userId);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a user's active sequence plan (earnings run) + a preview of the
 *          schedule totals. Also returns the default tier so the UI can prefill.
 * @route   GET /api/admin/task-permissions/:userId/sequence-plan
 * @access  Admin
 */
const getSequencePlan = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const plan = await SequencePlan.getActive(userId);
    res.json({
      success: true,
      data: {
        plan,
        defaultTier: seqUtil.DEFAULT_TIERS[0] || null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create / override a user's sequence plan (earnings run). Admin sets
 *          the deposit basis and (optionally) a custom target and combo config;
 *          the schedule is generated so the whole run lands on the target.
 * @route   POST /api/admin/task-permissions/:userId/sequence-plan
 * @access  Admin
 * body: { deposit, targetTotal?, orders?, comboOrder?, comboAmount?, comboProfit? }
 */
const setSequencePlan = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const deposit = parseFloat(req.body.deposit);
    if (!(deposit > 0)) {
      return res.status(400).json({ success: false, message: 'Deposit must be greater than 0' });
    }

    // Optional admin override fields. Undefined ones fall back to the tier.
    const override = {};
    ['targetTotal', 'orders', 'comboOrder', 'comboAmount', 'comboProfit'].forEach((k) => {
      if (req.body[k] !== undefined && req.body[k] !== null && req.body[k] !== '') {
        override[k] = req.body[k];
      }
    });

    // Validate the resulting plan is financially coherent before saving:
    // target must exceed outlay (deposit + combo) so there is profit to spread.
    const params = seqUtil.resolvePlanParams(deposit, Object.keys(override).length ? override : null);
    const outlay = seqUtil.r2(params.deposit + params.comboAmount);
    if (params.targetTotal <= outlay) {
      return res.status(400).json({
        success: false,
        message: `Target total (${params.targetTotal}) must be greater than the outlay (deposit ${params.deposit} + combo ${params.comboAmount} = ${outlay}).`
      });
    }
    if (params.comboProfit < 0 || params.comboProfit > (params.targetTotal - outlay)) {
      return res.status(400).json({
        success: false,
        message: 'Combo profit must be between 0 and the total profit.'
      });
    }
    if (params.comboOrder < 1 || params.comboOrder > params.orders) {
      return res.status(400).json({ success: false, message: 'Combo order must be within the run length.' });
    }

    const plan = await SequencePlan.createForUser(
      userId,
      deposit,
      Object.keys(override).length ? override : null,
      req.user.id
    );

    try {
      await Notification.create(
        userId,
        'Task Plan Ready',
        `A ${plan.orders}-order plan has been set up for you.`,
        'info'
      );
    } catch (e) { /* non-fatal */ }

    res.status(201).json({
      success: true,
      message: 'Sequence plan set',
      data: {
        id: plan.id,
        deposit: plan.deposit,
        orders: plan.orders,
        targetTotal: plan.targetTotal,
        comboOrder: plan.comboOrder,
        comboAmount: plan.comboAmount,
        comboProfit: plan.comboProfit,
        totalProfit: plan.totalProfit,
        normalPool: plan.normalPool,
        totalCommission: seqUtil.sumCommissions(plan.schedule)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel a user's active sequence plan.
 * @route   POST /api/admin/task-permissions/:userId/sequence-plan/cancel
 * @access  Admin
 */
const cancelSequencePlan = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const cancelled = await SequencePlan.cancelActive(userId);
    res.json({
      success: true,
      message: cancelled > 0 ? 'Sequence plan cancelled' : 'No active plan to cancel',
      data: { cancelled }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
