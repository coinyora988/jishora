/**
 * User Model
 * Handles all user-related database operations
 */

const { query, transaction } = require('../config/database');
const bcrypt = require('bcryptjs');

// Ambiguous characters (I, O, 0, 1) are excluded so codes stay easy to read
// aloud and retype, since users share them manually.
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_MAX_ATTEMPTS = 10;

class User {
  /**
   * Find user by email
   */
  static async findByEmail(email) {
    const results = await query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return results[0] || null;
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    const results = await query(
      `SELECT id, username, email, role, status, vip_level, phone, country,
              avatar_url, referral_code, created_at, last_login,
              withdrawal_locked, withdrawal_lock_reason
       FROM users WHERE id = ?`,
      [id]
    );
    return results[0] || null;
  }

  /**
   * Find user by username
   */
  static async findByUsername(username) {
    const results = await query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return results[0] || null;
  }

  /**
   * Create new user
   */
  /**
   * Create a new user, their wallet, and their referral link in one atomic unit.
   *
   * All three writes share a transaction because a user without a wallet is a
   * broken account: GET /api/wallet returns null and the dashboard cannot render.
   * Previously these were separate queries, so a failure between them left
   * orphaned users behind.
   *
   * @returns {Promise<{userId: number, referralCode: string}>}
   */
  static async create(userData) {
    const { username, email, password, referralCode } = userData;

    const passwordHash = await bcrypt.hash(password, 10);

    return await transaction(async (conn) => {
      // A referral code is REQUIRED. It is valid if it is EITHER:
      //   (1) an existing user's referral_code -> links referred_by (reusable,
      //       keeps customer-to-customer referrals working), OR
      //   (2) an active admin-generated single-use invite code -> consumed here.
      // Anything else is rejected so registration cannot proceed without a
      // valid code.
      const code = (referralCode || '').trim();
      if (!code) {
        const err = new Error('Referral code is required');
        err.code = 'REFERRAL_REQUIRED';
        throw err;
      }

      let referrerId = null;
      let inviteCodeId = null;

      // (1) Try an existing user's referral code (case-insensitive match).
      const [referrer] = await conn.execute(
        'SELECT id FROM users WHERE referral_code = ?',
        [code]
      );
      if (referrer.length > 0) {
        referrerId = referrer[0].id;
      } else {
        // (2) Try an active admin invite code, locked so two signups cannot
        //     consume the same single-use code.
        const [invite] = await conn.execute(
          "SELECT id FROM invite_codes WHERE code = ? AND status = 'active' LIMIT 1 FOR UPDATE",
          [code]
        );
        if (invite.length > 0) {
          inviteCodeId = invite[0].id;
        } else {
          const err = new Error('Invalid or already-used referral code');
          err.code = 'REFERRAL_INVALID';
          throw err;
        }
      }

      // referral_code is UNIQUE, so a collision would throw ER_DUP_ENTRY and
      // surface to the user as a 500. Retry until we find a free code.
      let userReferralCode = null;
      for (let attempt = 0; attempt < REFERRAL_CODE_MAX_ATTEMPTS; attempt += 1) {
        const candidate = this.generateReferralCode();
        const [clash] = await conn.execute(
          'SELECT 1 FROM users WHERE referral_code = ?',
          [candidate]
        );
        if (clash.length === 0) {
          userReferralCode = candidate;
          break;
        }
      }

      if (!userReferralCode) {
        throw new Error('Could not allocate a unique referral code');
      }

      const [result] = await conn.execute(
        `INSERT INTO users (username, email, password_hash, referral_code, referred_by)
         VALUES (?, ?, ?, ?, ?)`,
        [username, email, passwordHash, userReferralCode, referrerId]
      );

      const userId = result.insertId;

      // Every user starts at zero. Funds only arrive via an admin-approved deposit.
      await conn.execute(
        'INSERT INTO wallets (user_id, balance) VALUES (?, 0.0000)',
        [userId]
      );

      // Record the referral edge so the inviter's stats and commissions work.
      if (referrerId) {
        await conn.execute(
          `INSERT INTO referrals (referrer_id, referred_id, status)
           VALUES (?, ?, 'active')`,
          [referrerId, userId]
        );
      }

      // Consume the admin invite code (single-use) if that is what was used.
      if (inviteCodeId) {
        await conn.execute(
          "UPDATE invite_codes SET status = 'used', used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?",
          [userId, inviteCodeId]
        );
      }

      return { userId, referralCode: userReferralCode };
    });
  }

  /**
   * Create an account directly from the admin panel with a chosen password.
   * Used for "proxy accounts": admin-managed customer logins. No referral code
   * is required (admin-created), and it can be flagged as a proxy account.
   * Creates the user + a zero-balance wallet atomically.
   * @returns {Promise<{userId:number, referralCode:string}>}
   */
  static async createByAdmin({ username, email, password, isProxy = false }) {
    const passwordHash = await bcrypt.hash(password, 10);
    return await transaction(async (conn) => {
      // Allocate a unique referral code (same alphabet as normal signups).
      let referralCode = null;
      for (let attempt = 0; attempt < 5 && !referralCode; attempt++) {
        const candidate = User.generateReferralCode();
        const [existing] = await conn.execute(
          'SELECT id FROM users WHERE referral_code = ? LIMIT 1',
          [candidate]
        );
        if (!existing.length) referralCode = candidate;
      }
      if (!referralCode) throw new Error('Could not allocate a unique referral code');

      const [result] = await conn.execute(
        `INSERT INTO users (username, email, password_hash, referral_code, is_proxy, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [username, email, passwordHash, referralCode, isProxy ? 1 : 0]
      );
      const userId = result.insertId;

      await conn.execute(
        'INSERT INTO wallets (user_id, balance) VALUES (?, 0.0000)',
        [userId]
      );

      return { userId, referralCode };
    });
  }

  /**
   * List proxy accounts (admin-created) with their balance.
   */
  static async getProxyAccounts() {
    return await query(
      `SELECT u.id, u.username, u.email, u.status, u.created_at, u.last_login,
              COALESCE(w.balance, 0) AS balance
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.is_proxy = 1
       ORDER BY u.id DESC`
    );
  }

  /**
   * Update user
   */
  static async update(id, updates) {
    const allowedFields = [
      'username', 'phone', 'country', 'avatar_url',
      'email_verified', 'two_factor_enabled'
    ];
    const fields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    if (fields.length === 0) {
      return false;
    }

    values.push(id);
    await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return true;
  }

  /**
   * Update password
   */
  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, id]
    );
    return true;
  }

  /**
   * Update last login
   */
  static async updateLastLogin(id) {
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  /**
   * Verify password
   */
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Update user status
   */
  static async updateStatus(id, status) {
    await query(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, id]
    );
    return true;
  }

  /**
   * Update VIP level
   */
  static async updateVIPLevel(id, level) {
    await query(
      'UPDATE users SET vip_level = ? WHERE id = ?',
      [level, id]
    );
    return true;
  }

  /**
   * Set or clear a per-user withdrawal restriction.
   * @param {number} id      user id
   * @param {boolean} locked true = block withdrawals, false = allow
   * @param {string|null} reason message shown to the customer when blocked
   */
  static async setWithdrawalRestriction(id, locked, reason = null) {
    await query(
      'UPDATE users SET withdrawal_locked = ?, withdrawal_lock_reason = ? WHERE id = ?',
      [locked ? 1 : 0, locked ? (reason || 'Withdrawals are temporarily restricted. Please contact customer service.') : null, id]
    );
    return true;
  }

  /**
   * List all customers who currently have a withdrawal restriction applied.
   */
  static async getWithdrawalRestricted() {
    return await query(
      `SELECT id, username, email, withdrawal_lock_reason
       FROM users
       WHERE withdrawal_locked = 1
       ORDER BY username ASC`
    );
  }

  /**
   * Get all users (admin)
   */
  static async getAll(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    let params = [];

    if (filters.status) {
      whereConditions.push('u.status = ?');
      params.push(filters.status);
    }

    if (filters.role) {
      whereConditions.push('u.role = ?');
      params.push(filters.role);
    }

    if (filters.search) {
      // Search matches the account's own username/email, and also lets the
      // admin find accounts by the SPONSOR's username or referral code.
      whereConditions.push('(u.username LIKE ? OR u.email LIKE ? OR ref.username LIKE ? OR ref.referral_code LIKE ?)');
      const like = `%${filters.search}%`;
      params.push(like, like, like, like);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Self-join to the sponsor (the user whose referral code was used), and
    // LEFT JOIN the wallet so the admin list shows each user's REAL balance.
    // The authoritative balance lives in wallets.balance (keyed by user_id);
    // without this join the admin table defaulted every balance to 0.00.
    const users = await query(
      `SELECT u.id, u.username, u.email, u.role, u.status, u.vip_level,
              u.created_at, u.last_login, u.referral_code, u.referred_by,
              ref.username AS referred_by_username,
              ref.referral_code AS referred_by_code,
              COALESCE(w.balance, 0) AS balance,
              COALESCE(w.frozen_balance, 0) AS frozen_balance,
              u.withdrawal_locked, u.withdrawal_lock_reason
       FROM users u
       LEFT JOIN users ref ON u.referred_by = ref.id
       LEFT JOIN wallets w ON w.user_id = u.id
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total }] = await query(
      `SELECT COUNT(*) as total
       FROM users u
       LEFT JOIN users ref ON u.referred_by = ref.id
       ${whereClause}`,
      params
    );

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Generate random referral code
   */
  static generateReferralCode() {
    let code = '';
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
      code += REFERRAL_CODE_ALPHABET.charAt(
        Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length)
      );
    }
    return code;
  }

  /**
   * Get user statistics
   */
  static async getStats(userId) {
    const [stats] = await query(`
      SELECT 
        (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND status = 'completed') as completed_tasks,
        (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND DATE(created_at) = CURDATE()) as today_tasks,
        (SELECT SUM(commission) FROM tasks WHERE user_id = ? AND status = 'completed') as total_commission,
        (SELECT COUNT(*) FROM referrals WHERE referrer_id = ?) as total_referrals
    `, [userId, userId, userId, userId]);

    return stats;
  }
}

module.exports = User;
