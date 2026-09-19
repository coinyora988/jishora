/**
 * Admin Content Controller
 *
 * CRUD the admin panel needs for content it manages: markets, products,
 * combo offers, plus read-only referral overview. All operations persist to
 * their real tables.
 */

const { query } = require('../config/database');
const InviteCode = require('../models/InviteCode');

// ── Markets ─────────────────────────────────────────────────────────

/**
 * @desc    List all markets (admin view, includes inactive)
 * @route   GET /api/admin/markets
 */
const listMarkets = async (req, res, next) => {
  try {
    const markets = await query('SELECT * FROM markets ORDER BY sort_order ASC, id ASC');
    res.json({ success: true, data: markets });
  } catch (error) {
    next(error);
  }
};

// Turn a display name into a URL-safe slug: "JD.com" -> "jd-com".
function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @desc    Create a market
 * @route   POST /api/admin/markets
 */
const createMarket = async (req, res, next) => {
  try {
    const {
      name, description, commissionRate, minBalance, maxBalance,
      vipLevelRequired, status, sortOrder, logoUrl
    } = req.body;

    if (!name || commissionRate === undefined || minBalance === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, commission rate and minimum balance are required'
      });
    }

    // Slug is UNIQUE; derive from the name and disambiguate on collision.
    let slug = slugify(name);
    const clash = await query('SELECT id FROM markets WHERE slug = ?', [slug]);
    if (clash.length) slug = `${slug}-${Date.now().toString().slice(-4)}`;

    const result = await query(
      `INSERT INTO markets
         (name, slug, description, logo_url, commission_rate, min_balance,
          max_balance, vip_level_required, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        slug,
        description || null,
        logoUrl || null,
        commissionRate,
        minBalance,
        maxBalance === '' || maxBalance === undefined ? null : maxBalance,
        vipLevelRequired || 0,
        status || 'active',
        sortOrder || 0
      ]
    );

    res.status(201).json({ success: true, message: 'Market created', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a market
 * @route   PUT /api/admin/markets/:id
 */
const updateMarket = async (req, res, next) => {
  try {
    const columnByField = {
      name: 'name',
      description: 'description',
      logoUrl: 'logo_url',
      commissionRate: 'commission_rate',
      minBalance: 'min_balance',
      maxBalance: 'max_balance',
      vipLevelRequired: 'vip_level_required',
      status: 'status',
      sortOrder: 'sort_order'
    };

    const fields = [];
    const params = [];
    for (const [field, col] of Object.entries(columnByField)) {
      if (req.body[field] !== undefined) {
        fields.push(`${col} = ?`);
        params.push(req.body[field] === '' && col === 'max_balance' ? null : req.body[field]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(req.params.id);
    const result = await query(`UPDATE markets SET ${fields.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Market not found' });
    }

    res.json({ success: true, message: 'Market updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a market
 * @route   DELETE /api/admin/markets/:id
 */
const deleteMarket = async (req, res, next) => {
  try {
    const result = await query('DELETE FROM markets WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Market not found' });
    }
    res.json({ success: true, message: 'Market deleted' });
  } catch (error) {
    next(error);
  }
};

// ── Products ────────────────────────────────────────────────────────

/**
 * @desc    List products (optionally by market)
 * @route   GET /api/admin/products
 */
const listProducts = async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.marketId) {
      where = 'WHERE p.market_id = ?';
      params.push(req.query.marketId);
    }
    const products = await query(
      `SELECT p.*, m.name AS market_name
       FROM products p
       LEFT JOIN markets m ON p.market_id = m.id
       ${where}
       ORDER BY p.id DESC`,
      params
    );
    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a product
 * @route   POST /api/admin/products
 */
const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, marketId, imageUrl, status } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ success: false, message: 'Name and price are required' });
    }
    const result = await query(
      `INSERT INTO products (name, description, price, image_url, market_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, description || null, price, imageUrl || null, marketId || null, status || 'active']
    );
    res.status(201).json({ success: true, message: 'Product created', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a product
 * @route   PUT /api/admin/products/:id
 */
const updateProduct = async (req, res, next) => {
  try {
    const columnByField = {
      name: 'name',
      description: 'description',
      price: 'price',
      imageUrl: 'image_url',
      marketId: 'market_id',
      status: 'status'
    };
    const fields = [];
    const params = [];
    for (const [field, col] of Object.entries(columnByField)) {
      if (req.body[field] !== undefined) {
        fields.push(`${col} = ?`);
        params.push(req.body[field]);
      }
    }
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    params.push(req.params.id);
    const result = await query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a product
 * @route   DELETE /api/admin/products/:id
 */
const deleteProduct = async (req, res, next) => {
  try {
    const result = await query('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};

// ── Combo Offers ────────────────────────────────────────────────────

/**
 * @desc    List combo offers
 * @route   GET /api/admin/combo-offers
 */
const listComboOffers = async (req, res, next) => {
  try {
    const offers = await query('SELECT * FROM combo_offers ORDER BY id DESC');
    res.json({ success: true, data: offers });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a combo offer
 * @route   POST /api/admin/combo-offers
 */
const createComboOffer = async (req, res, next) => {
  try {
    const { name, description, triggerOrderCount, bonusAmount, bonusType, minBalance, active } = req.body;
    if (!name || bonusAmount === undefined) {
      return res.status(400).json({ success: false, message: 'Name and bonus amount are required' });
    }
    const result = await query(
      `INSERT INTO combo_offers
         (name, description, trigger_order_count, bonus_amount, bonus_type, min_balance, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        triggerOrderCount || 3,
        bonusAmount,
        bonusType === 'percentage' ? 'percentage' : 'fixed',
        minBalance || 0,
        active === false ? 0 : 1
      ]
    );
    res.status(201).json({ success: true, message: 'Offer created', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a combo offer
 * @route   PUT /api/admin/combo-offers/:id
 */
const updateComboOffer = async (req, res, next) => {
  try {
    const columnByField = {
      name: 'name',
      description: 'description',
      triggerOrderCount: 'trigger_order_count',
      bonusAmount: 'bonus_amount',
      bonusType: 'bonus_type',
      minBalance: 'min_balance'
    };
    const fields = [];
    const params = [];
    for (const [field, col] of Object.entries(columnByField)) {
      if (req.body[field] !== undefined) {
        fields.push(`${col} = ?`);
        params.push(req.body[field]);
      }
    }
    if (req.body.active !== undefined) {
      fields.push('is_active = ?');
      params.push(req.body.active ? 1 : 0);
    }
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    params.push(req.params.id);
    const result = await query(`UPDATE combo_offers SET ${fields.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }
    res.json({ success: true, message: 'Offer updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle a combo offer active state
 * @route   POST /api/admin/combo-offers/:id/toggle
 */
const toggleComboOffer = async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE combo_offers SET is_active = NOT is_active WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }
    res.json({ success: true, message: 'Offer toggled' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a combo offer
 * @route   DELETE /api/admin/combo-offers/:id
 */
const deleteComboOffer = async (req, res, next) => {
  try {
    const result = await query('DELETE FROM combo_offers WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }
    res.json({ success: true, message: 'Offer deleted' });
  } catch (error) {
    next(error);
  }
};

// ── Referrals (admin overview) ──────────────────────────────────────

/**
 * @desc    Referral program aggregate stats
 * @route   GET /api/admin/referrals/stats
 */
const getReferralStats = async (req, res, next) => {
  try {
    const [totals] = await query(`
      SELECT
        COUNT(*) AS total_referrals,
        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_referrals,
        COALESCE(SUM(commission_earned), 0) AS total_rewards
      FROM referrals
    `);

    const [referrers] = await query(
      'SELECT COUNT(DISTINCT referrer_id) AS total_referrers FROM referrals'
    );

    res.json({
      success: true,
      data: {
        totalReferrals: Number(totals.total_referrals) || 0,
        activeReferrals: Number(totals.active_referrals) || 0,
        totalReferrers: Number(referrers.total_referrers) || 0,
        totalRewards: parseFloat(totals.total_rewards) || 0
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Top referrers with their invite counts and earnings
 * @route   GET /api/admin/referrals
 */
const getReferrers = async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT u.id, u.username, u.email, u.referral_code,
             COUNT(r.id) AS referral_count,
             COALESCE(SUM(r.commission_earned), 0) AS total_earned
      FROM users u
      INNER JOIN referrals r ON r.referrer_id = u.id
      GROUP BY u.id, u.username, u.email, u.referral_code
      ORDER BY referral_count DESC, total_earned DESC
      LIMIT 100
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// ── Invite codes (admin-generated single-use registration codes) ─────

/**
 * @desc  List invite codes (paginated) + status counts
 * @route GET /api/admin/invite-codes
 */
const listInviteCodes = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const status = req.query.status || '';
    const data = await InviteCode.list(page, limit, status);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Generate one or more invite codes
 * @route POST /api/admin/invite-codes   body: { count, note }
 */
const createInviteCodes = async (req, res, next) => {
  try {
    const count = parseInt(req.body.count, 10) || 1;
    const note = req.body.note ? String(req.body.note).slice(0, 255) : null;
    const created = await InviteCode.generate(count, req.user.id, note);
    res.status(201).json({
      success: true,
      message: `${created.length} code(s) generated`,
      data: created
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Disable an active invite code
 * @route POST /api/admin/invite-codes/:id/disable
 */
const disableInviteCode = async (req, res, next) => {
  try {
    const n = await InviteCode.disable(req.params.id);
    res.json({ success: true, message: n ? 'Code disabled' : 'Code not found or already used' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Delete an invite code (only if not used)
 * @route DELETE /api/admin/invite-codes/:id
 */
const deleteInviteCode = async (req, res, next) => {
  try {
    const n = await InviteCode.remove(req.params.id);
    res.json({ success: true, message: n ? 'Code deleted' : 'Used codes cannot be deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
