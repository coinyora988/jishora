/**
 * Admin Settings Controller
 *
 * Backs the Settings page: general platform config, customer-service links,
 * support-page content, and payment-wallet CRUD. Everything persists to the
 * `settings` and `payment_wallets` tables.
 */

const { query } = require('../config/database');
const Settings = require('../models/Settings');

// Maps each settings group to the DB keys it owns and the JSON field name the
// frontend uses. Keeping this table-driven avoids repeating the field list in
// both the read and write handlers.
const GROUPS = {
  general: {
    platform_name: 'platformName',
    platform_description: 'platformDescription',
    min_deposit: 'minDeposit',
    min_withdrawal: 'minWithdrawal',
    referral_bonus_percent: 'referralBonus',
    task_reward: 'taskReward',
    registration_enabled: 'registrationEnabled',
    maintenance_mode: 'maintenanceMode'
  },
  // Homepage hero figures. A dedicated group keeps them separate from core
  // platform config on the Settings page.
  homepage: {
    home_stat_members: 'members',
    home_stat_paid_out: 'paidOut',
    home_stat_success_rate: 'successRate'
  },
  'customer-service': {
    cs_whatsapp_number: 'whatsappNumber',
    cs_whatsapp_template: 'whatsappTemplate',
    cs_telegram_username: 'telegramUsername',
    cs_telegram_link: 'telegramLink',
    cs_support_email: 'supportEmail',
    cs_live_chat_code: 'liveChatCode',
    cs_active: 'active'
  },
  'support-page': {
    support_title: 'title',
    support_welcome: 'welcomeMessage',
    support_hours: 'supportHours',
    support_response_time: 'responseTime',
    support_faq: 'faq'
  },
  referrals: {
    referral_bonus_percent: 'bonusPercent',
    referral_signup_bonus: 'signupBonus'
  }
};

const BOOLEAN_FIELDS = new Set([
  'registrationEnabled',
  'maintenanceMode',
  'active'
]);

/**
 * @desc    Read one settings group
 * @route   GET /api/admin/settings/:group
 * @access  Admin
 */
const getSettingsGroup = async (req, res, next) => {
  try {
    const map = GROUPS[req.params.group];
    if (!map) {
      return res.status(404).json({ success: false, message: 'Unknown settings group' });
    }

    const stored = await Settings.getMany(Object.keys(map));

    // Translate DB keys -> frontend field names, coercing booleans back.
    const data = {};
    for (const [dbKey, field] of Object.entries(map)) {
      const raw = stored[dbKey];
      data[field] = BOOLEAN_FIELDS.has(field) ? raw === 'true' : (raw ?? '');
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Save one settings group
 * @route   PUT /api/admin/settings/:group
 * @access  Admin
 */
const saveSettingsGroup = async (req, res, next) => {
  try {
    const map = GROUPS[req.params.group];
    if (!map) {
      return res.status(404).json({ success: false, message: 'Unknown settings group' });
    }

    // Optional server-side validation of the FAQ JSON so a malformed blob is
    // rejected clearly rather than corrupting the support page later.
    if (req.params.group === 'support-page' && req.body.faq) {
      try {
        JSON.parse(req.body.faq);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'FAQ must be valid JSON' });
      }
    }

    // Only write keys that belong to this group and were actually provided.
    const pairs = {};
    for (const [dbKey, field] of Object.entries(map)) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        pairs[dbKey] = req.body[field];
      }
    }

    if (Object.keys(pairs).length === 0) {
      return res.status(400).json({ success: false, message: 'No settings provided' });
    }

    await Settings.setMany(pairs);

    res.json({ success: true, message: 'Settings saved' });
  } catch (error) {
    next(error);
  }
};

// ── Payment wallet CRUD ─────────────────────────────────────────────

/**
 * @desc    List payment wallets
 * @route   GET /api/admin/wallets
 * @access  Admin
 */
const getWallets = async (req, res, next) => {
  try {
    const wallets = await query(
      'SELECT * FROM payment_wallets ORDER BY sort_order ASC, id ASC'
    );
    res.json({ success: true, data: wallets });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a payment wallet
 * @route   POST /api/admin/wallets
 * @access  Admin
 */
const createWallet = async (req, res, next) => {
  try {
    const { name, currency, network, address, active } = req.body;

    if (!name || !network || !address) {
      return res.status(400).json({
        success: false,
        message: 'Name, network and address are required'
      });
    }

    const result = await query(
      `INSERT INTO payment_wallets (name, currency, network, address, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [name, currency || 'USDT', network, address, active === false ? 0 : 1]
    );

    res.status(201).json({
      success: true,
      message: 'Wallet added',
      data: { id: result.insertId }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a payment wallet
 * @route   PUT /api/admin/wallets/:id
 * @access  Admin
 */
const updateWallet = async (req, res, next) => {
  try {
    const { name, currency, network, address, active } = req.body;

    const allowed = { name, currency, network, address };
    const fields = [];
    const params = [];
    for (const [col, val] of Object.entries(allowed)) {
      if (val !== undefined) {
        fields.push(`${col} = ?`);
        params.push(val);
      }
    }
    if (active !== undefined) {
      fields.push('is_active = ?');
      params.push(active ? 1 : 0);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(req.params.id);
    const result = await query(
      `UPDATE payment_wallets SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }

    res.json({ success: true, message: 'Wallet updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a payment wallet
 * @route   DELETE /api/admin/wallets/:id
 * @access  Admin
 */
const deleteWallet = async (req, res, next) => {
  try {
    const result = await query('DELETE FROM payment_wallets WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }
    res.json({ success: true, message: 'Wallet deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Public customer-service + support settings for the support page.
 *          Read-only, exposes only the contact fields (no secrets).
 * @route   GET /api/support/config
 * @access  Public
 */
const getPublicSupportConfig = async (req, res, next) => {
  try {
    const csMap = GROUPS['customer-service'];
    const spMap = GROUPS['support-page'];
    const stored = await Settings.getMany([
      ...Object.keys(csMap),
      ...Object.keys(spMap)
    ]);

    const data = {};
    for (const [dbKey, field] of Object.entries(csMap)) {
      const raw = stored[dbKey];
      data[field] = BOOLEAN_FIELDS.has(field) ? raw === 'true' : (raw ?? '');
    }
    for (const [dbKey, field] of Object.entries(spMap)) {
      data[field] = stored[dbKey] ?? '';
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettingsGroup,
  saveSettingsGroup,
  getWallets,
  createWallet,
  updateWallet,
  deleteWallet,
  getPublicSupportConfig
};
