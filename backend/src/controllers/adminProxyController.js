/**
 * Admin Proxy Controller
 *
 * Manages "proxy accounts" (admin-created customer logins) and the GLOBAL
 * per-market combo templates that apply to ALL proxy accounts.
 */

const User = require('../models/User');
const ProxyCombo = require('../models/ProxyCombo');
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

module.exports = {
  listProxyAccounts,
  createProxyAccount,
  listProxyCombos,
  saveProxyCombos
};
