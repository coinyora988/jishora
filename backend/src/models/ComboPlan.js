/**
 * ComboPlan Model
 *
 * A combo plan is an admin-configured special order for a specific customer:
 * at a given order number (their Nth task) a COMBO order of a set amount
 * appears instead of a normal balance-based order. Higher amount -> higher
 * commission (order amount x market rate). If the combo amount exceeds the
 * customer's balance they must recharge to submit it.
 */

const { query } = require('../config/database');

class ComboPlan {
  /**
   * Create a combo plan for a user.
   */
  static async create(userId, triggerOrder, amount, createdBy = null) {
    const result = await query(
      `INSERT INTO combo_plans (user_id, trigger_order, amount, status, created_by)
       VALUES (?, ?, ?, 'pending', ?)`,
      [userId, triggerOrder, amount, createdBy]
    );
    return result.insertId;
  }

  /**
   * The active (pending) combo plan for a user, if any. A user has at most one
   * pending plan at a time in the admin UI, but we return the earliest.
   */
  static async getPending(userId) {
    const rows = await query(
      `SELECT * FROM combo_plans
       WHERE user_id = ? AND status = 'pending'
       ORDER BY trigger_order ASC, id ASC
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  /**
   * Does the user have a pending combo that should trigger at the given
   * upcoming order number? Used inside the grab transaction. Runs on the passed
   * connection and locks the row.
   */
  static async pendingForOrderInTransaction(conn, userId, upcomingOrderNumber) {
    const [rows] = await conn.execute(
      `SELECT * FROM combo_plans
       WHERE user_id = ? AND status = 'pending' AND trigger_order = ?
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
      [userId, upcomingOrderNumber]
    );
    return rows[0] || null;
  }

  /**
   * Mark a combo plan as triggered (its combo order was grabbed).
   */
  static async markTriggeredInTransaction(conn, planId, taskId) {
    await conn.execute(
      `UPDATE combo_plans
       SET status = 'triggered', task_id = ?, triggered_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [taskId, planId]
    );
  }

  /**
   * Mark a combo plan completed (its combo order was submitted).
   */
  static async markCompletedByTask(taskId) {
    await query(
      `UPDATE combo_plans
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE task_id = ? AND status = 'triggered'`,
      [taskId]
    );
  }

  /**
   * Cancel all pending/triggered combo plans for a user.
   */
  static async cancelForUser(userId) {
    const result = await query(
      `UPDATE combo_plans SET status = 'cancelled'
       WHERE user_id = ? AND status IN ('pending','triggered')`,
      [userId]
    );
    return result.affectedRows || 0;
  }

  /**
   * Per-user pending combos for the admin list. Returns a map
   * user_id -> [ { triggerOrder, amount }, ... ] ordered by order number.
   */
  static async pendingByUser() {
    const rows = await query(
      `SELECT user_id, trigger_order, amount
       FROM combo_plans
       WHERE status = 'pending'
       ORDER BY user_id ASC, trigger_order ASC`
    );
    const map = {};
    for (const r of rows) {
      if (!map[r.user_id]) map[r.user_id] = [];
      map[r.user_id].push({ triggerOrder: r.trigger_order, amount: Number(r.amount) });
    }
    return map;
  }

  /**
   * Combo history for a user (admin detail).
   */
  static async history(userId, limit = 50) {
    return await query(
      `SELECT * FROM combo_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  }

  /**
   * Per-customer combo overview for the admin Combo Offers page.
   * For each customer (users with role 'user') returns:
   *   - balance                (wallets.balance)
   *   - total_orders           (all tasks)
   *   - completed_orders       (tasks with status 'completed')
   *   - combo_commission       (SUM of commission on completed combo tasks)
   *   - combos                 (pending combo plans: [{triggerOrder, amount}])
   *   - combos_completed       (count of completed combo plans)
   * Paginated + searchable by username/email.
   */
  static async customerOverview(page = 1, limit = 12, search = '') {
    const offset = (page - 1) * limit;
    const params = [];
    let where = "WHERE u.role = 'user' AND u.is_proxy = 0";
    if (search) {
      where += ' AND (u.username LIKE ? OR u.email LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like);
    }

    const rows = await query(
      `SELECT
         u.id, u.username, u.email, u.status,
         COALESCE(w.balance, 0) AS balance,
         COALESCE(t.total_orders, 0) AS total_orders,
         COALESCE(t.completed_orders, 0) AS completed_orders,
         COALESCE(t.combo_commission, 0) AS combo_commission,
         COALESCE(cp.combos_completed, 0) AS combos_completed
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       LEFT JOIN (
         SELECT user_id,
                COUNT(*) AS total_orders,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
                SUM(CASE WHEN status = 'completed' AND is_combo = 1 THEN commission ELSE 0 END) AS combo_commission
         FROM tasks GROUP BY user_id
       ) t ON t.user_id = u.id
       LEFT JOIN (
         SELECT user_id, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS combos_completed
         FROM combo_plans GROUP BY user_id
       ) cp ON cp.user_id = u.id
       ${where}
       ORDER BY u.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Attach the pending combos per user.
    const pending = await this.pendingByUser();
    // Attach each user's active sequence plan (earnings run) summary, so the
    // admin table can show it. Loaded lazily to avoid a circular require.
    let seqByUser = {};
    try {
      const SequencePlan = require('./SequencePlan');
      seqByUser = await SequencePlan.activeByUserIds(rows.map((u) => u.id));
    } catch (e) { seqByUser = {}; }
    const users = rows.map((u) => ({
      ...u,
      combos: pending[u.id] || [],
      sequencePlan: seqByUser[u.id] || null
    }));

    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM users u ${where}`,
      params
    );

    return { users, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

module.exports = ComboPlan;
