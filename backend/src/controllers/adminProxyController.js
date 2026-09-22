/**
 * Admin Proxy Controller
 *
 * Manages "proxy accounts" (admin-created customer logins) and the GLOBAL
 * per-market combo templates that apply to ALL proxy accounts.
 */

const User = require('../models/User');
const ProxyCombo = require('../models/ProxyCombo');
const { ProxyPlan } = require('../models/ProxyPlan');
const seqUtil = require('../utils/sequencePlan');
const { query } = require('../config/database');
const realtime = require('../utils/realtime');

/**
 * @desc    List proxy accounts
 * @route   GET /api/admin/proxy-accounts
 */
const listProxyAccounts = async (req, res, next) => {
  try {
    const accounts = await User.getProxyAccounts();
    res.json({ success: true, data: accounts });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a proxy account (admin sets username + password)
 * @route   POST /api/admin/proxy-accounts
 * body: { username, email?, password }
 */
const createProxyAccount = async (req, res, next) => {
  try {
    const username = (req.body.username || '').trim();
    const password = (req.body.password || '').trim();
    let email = (req.body.email || '').trim();

    if (!username || username.length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    // Email is optional for a proxy account; auto-generate one if blank so the
    // NOT NULL/UNIQUE email column is satisfied.
    if (!email) email = `${username.toLowerCase()}@proxy.local`;

    // Reject duplicates up front for a clear message.
    const [dupU] = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
    if (dupU) return res.status(409).json({ success: false, message: 'Username already exists' });
    const [dupE] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (dupE) return res.status(409).json({ success: false, message: 'Email already exists' });

    const { userId, referralCode } = await User.createByAdmin({ username, email, password, isProxy: true });

    realtime.emit('user', { userId, action: 'proxy-create' });

    res.status(201).json({
      success: true,
      message: `Proxy account "${username}" created`,
      data: { userId, username, email, referralCode }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List markets with their current proxy combo templates
 * @route   GET /api/admin/proxy-combos
 * Returns: [{ marketId, name, slug, combos: [{ triggerOrder, amount }] }]
 */
const listProxyCombos = async (req, res, next) => {
  try {
    const markets = await query(
      "SELECT id, name, slug FROM markets ORDER BY sort_order ASC, id ASC"
    );
    const all = await ProxyCombo.listAll();
    const byMarket = {};
    for (const r of all) {
      if (!byMarket[r.market_id]) byMarket[r.market_id] = [];
      byMarket[r.market_id].push({ triggerOrder: r.trigger_order, amount: Number(r.amount) });
    }
    const data = markets.map((m) => ({
      marketId: m.id,
      name: m.name,
      slug: m.slug,
      combos: byMarket[m.id] || []
    }));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Replace the proxy combo template for one market
 * @route   PUT /api/admin/proxy-combos/:marketId
 * body: { combos: [{ triggerOrder, amount }, ...] }
 */
const saveProxyCombos = async (req, res, next) => {
  try {
    const marketId = parseInt(req.params.marketId, 10);
    if (!marketId) {
      return res.status(400).json({ success: false, message: 'Invalid market id' });
    }
    const [market] = await query('SELECT id, name FROM markets WHERE id = ?', [marketId]);
    if (!market) {
      return res.status(404).json({ success: false, message: 'Market not found' });
    }

    const combos = Array.isArray(req.body.combos) ? req.body.combos : [];
    const clean = [];
    const seen = new Set();
    for (const c of combos) {
      const triggerOrder = parseInt(c.triggerOrder, 10);
      const amount = parseFloat(c.amount);
      if (!triggerOrder || triggerOrder < 1) {
        return res.status(400).json({ success: false, message: 'Each combo needs an order number of 1 or more' });
      }
      if (!(amount > 0)) {
        return res.status(400).json({ success: false, message: 'Each combo needs an amount greater than 0' });
      }
      if (seen.has(triggerOrder)) {
        return res.status(400).json({ success: false, message: `Duplicate order number ${triggerOrder}` });
      }
      seen.add(triggerOrder);
      clean.push({ triggerOrder, amount });
    }

    await ProxyCombo.replaceForMarket(marketId, clean, req.user.id);

    res.json({
      success: true,
      message: `Saved ${clean.length} combo(s) for ${market.name}`,
      data: { marketId, count: clean.length }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get the single GLOBAL proxy plan (applies to all proxy accounts).
 * @route   GET /api/admin/proxy-plan
 */
const getProxyPlan = async (req, res, next) => {
  try {
    const cfg = await ProxyPlan.getConfig();
    res.json({
      success: true,
      data: {
        plan: cfg,                          // null if not set
        tiers: seqUtil.DEFAULT_TIERS,
        defaultTier: seqUtil.DEFAULT_TIERS[0] || null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Save the single GLOBAL proxy plan. Applies to ALL proxy accounts on
 *          their next run. Regular customers are unaffected.
 * @route   POST /api/admin/proxy-plan
 * body: { deposit, orders?, targetTotal, combos:[{order,recharge,profit}] }
 */
const saveProxyPlan = async (req, res, next) => {
  try {
    const deposit = parseFloat(req.body.deposit);
    if (!(deposit > 0)) {
      return res.status(400).json({ success: false, message: 'Deposit must be greater than 0' });
    }

    const override = {};
    if (req.body.targetTotal !== undefined && req.body.targetTotal !== null && req.body.targetTotal !== '') {
      override.targetTotal = req.body.targetTotal;
    }
    if (req.body.orders !== undefined && req.body.orders !== null && req.body.orders !== '') {
      override.orders = req.body.orders;
    }
    if (Array.isArray(req.body.combos) && req.body.combos.length) {
      override.combos = req.body.combos;
    }

    // Resolve + validate the money exactly like the per-user sequence plan.
    const params = seqUtil.resolvePlanParams(deposit, Object.keys(override).length ? override : null);
    const combos = seqUtil.normaliseCombos(params.combos);

    if (!combos.length) {
      return res.status(400).json({ success: false, message: 'Add at least one combo.' });
    }
    if (combos.length > 3) {
      return res.status(400).json({ success: false, message: 'A plan can have at most 3 combos.' });
    }
    for (const c of combos) {
      if (c.order < 1 || c.order > params.orders) {
        return res.status(400).json({ success: false, message: `Combo order #${c.order} must be within 1–${params.orders}.` });
      }
    }
    const rechargeTotal = seqUtil.r2(combos.reduce((s, c) => s + c.recharge, 0));
    const comboProfitTotal = seqUtil.r2(combos.reduce((s, c) => s + c.profit, 0));
    const outlay = seqUtil.r2(params.deposit + rechargeTotal);
    const totalProfit = seqUtil.r2(params.targetTotal - outlay);
    const normalPool = seqUtil.r2(totalProfit - comboProfitTotal);

    if (totalProfit <= 0) {
      return res.status(400).json({ success: false, message: `Target (${params.targetTotal}) must be greater than the outlay (${outlay}).` });
    }
    if (comboProfitTotal > totalProfit) {
      return res.status(400).json({ success: false, message: `Combo profits (${comboProfitTotal}) can't exceed total profit (${totalProfit}).` });
    }
    if (normalPool < 0) {
      return res.status(400).json({ success: false, message: 'Not enough profit left for the other orders.' });
    }

    const cfg = {
      deposit: params.deposit,
      orders: params.orders,
      targetTotal: params.targetTotal,
      combos
    };
    await ProxyPlan.saveConfig(cfg);

    res.status(201).json({
      success: true,
      message: 'Global proxy plan saved — applies to all proxy accounts',
      data: { ...cfg, outlay, totalProfit, comboProfitTotal, normalPool }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Clear the global proxy plan (disables it for all proxy accounts).
 * @route   POST /api/admin/proxy-plan/clear
 */
const clearProxyPlan = async (req, res, next) => {
  try {
    await ProxyPlan.clear();
    res.json({ success: true, message: 'Global proxy plan cleared' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listProxyAccounts,
  createProxyAccount,
  listProxyCombos,
  saveProxyCombos,
  getProxyPlan,
  saveProxyPlan,
  clearProxyPlan
};
