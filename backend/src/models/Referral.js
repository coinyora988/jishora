/**
 * Referral Model
 * Handles referral system operations.
 *
 * Column names here must match the live `referrals` table:
 *   id, referrer_id, referred_id, commission_earned, status, created_at
 * An earlier version queried referred_user_id / commission_rate / total_earned,
 * none of which exist, so every referral query failed at runtime.
 */

const { query, transaction } = require('../config/database');

class Referral {
  /**
   * Create referral record.
   *
   * Normally called inside User.create's transaction at signup. This standalone
   * version exists for backfills and admin tooling.
   */
  static async create(referrerId, referredId) {
    const result = await query(
      `INSERT INTO referrals (referrer_id, referred_id, status)
       VALUES (?, ?, 'active')`,
      [referrerId, referredId]
    );

    return result.insertId;
  }

  /**
   * Get user's referrals with the invited user's details.
   */
  static async getUserReferrals(userId) {
    const referrals = await query(
      `SELECT r.id, r.referrer_id, r.referred_id, r.commission_earned, r.status,
              r.created_at,
              u.username, u.email, u.vip_level, u.created_at AS joined_date
       FROM referrals r
       LEFT JOIN users u ON r.referred_id = u.id
       WHERE r.referrer_id = ?
       ORDER BY r.created_at DESC`,
      [userId]
    );

    return referrals;
  }

  /**
   * Get referral statistics.
   *
   * COALESCE keeps the response numeric for users with no referrals, where
   * SUM() would otherwise return NULL and render as "null" in the UI.
   */
  static async getStats(userId) {
    const [stats] = await query(
      `SELECT
         COUNT(*) AS total_referrals,
         COALESCE(SUM(commission_earned), 0) AS total_commission,
         COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_referrals
       FROM referrals
       WHERE referrer_id = ?`,
      [userId]
    );

    return {
      total_referrals: Number(stats.total_referrals) || 0,
      total_commission: parseFloat(stats.total_commission) || 0,
      active_referrals: Number(stats.active_referrals) || 0
    };
  }

  /**
   * Credit a referral commission to the referrer.
   *
   * The referrals row, the transaction record and the wallet credit must all
   * land together, otherwise the ledger disagrees with the balance.
   */
  static async recordCommission(referralId, amount, description) {
    return await transaction(async (conn) => {
      const [referral] = await conn.execute(
        'SELECT referrer_id FROM referrals WHERE id = ? FOR UPDATE',
        [referralId]
      );

      if (!referral[0]) {
        throw new Error('Referral not found');
      }

      const referrerId = referral[0].referrer_id;
      const credit = parseFloat(amount);

      await conn.execute(
        'UPDATE referrals SET commission_earned = commission_earned + ? WHERE id = ?',
        [credit, referralId]
      );

      const [wallet] = await conn.execute(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [referrerId]
      );

      if (!wallet[0]) {
        throw new Error('Referrer wallet not found');
      }

      const balanceBefore = parseFloat(wallet[0].balance);
      const balanceAfter = balanceBefore + credit;

      await conn.execute(
        'UPDATE wallets SET balance = balance + ?, total_earned = total_earned + ? WHERE user_id = ?',
        [credit, credit, referrerId]
      );

      // type must be 'referral'; 'referral_commission' is not in the enum.
      await conn.execute(
        `INSERT INTO transactions
           (user_id, transaction_number, type, amount, balance_before, balance_after,
            status, notes)
         VALUES (?, ?, 'referral', ?, ?, ?, 'completed', ?)`,
        [
          referrerId,
          `REF-${Date.now()}-${referralId}`,
          credit,
          balanceBefore,
          balanceAfter,
          description || 'Referral commission'
        ]
      );

      return true;
    });
  }

  /**
   * Get referral by the invited user's id.
   */
  static async getByReferredUser(referredId) {
    const results = await query(
      'SELECT * FROM referrals WHERE referred_id = ?',
      [referredId]
    );

    return results[0] || null;
  }

  /**
   * Update referral status.
   */
  static async updateStatus(referralId, status) {
    await query('UPDATE referrals SET status = ? WHERE id = ?', [status, referralId]);
    return true;
  }

  /**
   * Get top referrers (leaderboard).
   */
  static async getTopReferrers(limit = 10) {
    // LIMIT is interpolated because MySQL prepared statements reject a
    // placeholder there. Coerced to an integer to keep it injection-safe.
    const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    const referrers = await query(
      `SELECT u.id, u.username,
              COUNT(r.id) AS referral_count,
              COALESCE(SUM(r.commission_earned), 0) AS total_earned
       FROM users u
       INNER JOIN referrals r ON u.id = r.referrer_id
       WHERE r.status = 'active'
       GROUP BY u.id, u.username
       ORDER BY referral_count DESC, total_earned DESC
       LIMIT ${safeLimit}`
    );

    return referrers;
  }
}

module.exports = Referral;
