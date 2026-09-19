/**
 * TaskPermission Model
 *
 * Gates the "Grab order" action. A customer cannot start (grab) a task until an
 * admin grants permission. One approval grants a BATCH of task starts
 * (default 25). Each grab consumes one unit of the active grant; when the grant
 * is exhausted (used_count reaches batch_size) it flips to 'used' and the
 * customer needs a fresh approval for the next batch.
 *
 * status:
 *   granted  -> an active batch with remaining capacity
 *   used     -> the batch has been fully consumed
 *   revoked  -> the admin cancelled the remaining capacity
 */

const { query, transaction } = require('../config/database');

const DEFAULT_BATCH_SIZE = 25;

class TaskPermission {
  /**
   * Grant a new batch permission to a user.
   *
   * A customer may only hold ONE active batch at a time. If they still have an
   * active batch (some of the current 25 not yet used), no new approval is
   * issued until that batch is completed. Throws 'Batch already active' in that
   * case so the caller can tell the admin why.
   *
   * @param {number} batchSize how many task starts this grant covers
   * Returns the created permission id.
   */
  static async grant(userId, grantedBy = null, note = null, batchSize = DEFAULT_BATCH_SIZE) {
    const size = Number(batchSize) > 0 ? Math.floor(Number(batchSize)) : DEFAULT_BATCH_SIZE;
    return await transaction(async (conn) => {
      // Lock this user's active grants so a second concurrent approval cannot
      // slip in between the check and the insert.
      const [active] = await conn.execute(
        `SELECT id FROM task_permissions
         WHERE user_id = ? AND status = 'granted' AND used_count < batch_size
         FOR UPDATE`,
        [userId]
      );
      if (active.length) {
        throw new Error('Batch already active');
      }
      const [result] = await conn.execute(
        `INSERT INTO task_permissions (user_id, status, batch_size, used_count, granted_by, note)
         VALUES (?, 'granted', ?, 0, ?, ?)`,
        [userId, size, grantedBy, note]
      );
      return result.insertId;
    });
  }

  /**
   * Does the user currently have an active batch with remaining capacity?
   */
  static async hasUnused(userId) {
    const rows = await query(
      `SELECT id FROM task_permissions
       WHERE user_id = ? AND status = 'granted' AND used_count < batch_size
       ORDER BY created_at ASC
       LIMIT 1`,
      [userId]
    );
    return rows.length > 0;
  }

  /**
   * Consume one unit of the user's active batch inside an existing transaction
   * connection (atomic with the task grab). Increments used_count; when the
   * batch is fully used it flips to 'used'. Locks the row so two concurrent
   * grabs cannot over-consume.
   *
   * @returns {boolean} true if a unit was consumed, false if no active batch
   */
  static async consumeInTransaction(conn, userId, taskId = null) {
    const [rows] = await conn.execute(
      `SELECT id, batch_size, used_count FROM task_permissions
       WHERE user_id = ? AND status = 'granted' AND used_count < batch_size
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    if (!rows[0]) {
      return false;
    }

    const perm = rows[0];
    const newUsed = perm.used_count + 1;
    const exhausted = newUsed >= perm.batch_size;

    await conn.execute(
      `UPDATE task_permissions
       SET used_count = ?,
           status = ?,
           used_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE used_at END,
           task_id = COALESCE(task_id, ?)
       WHERE id = ?`,
      [newUsed, exhausted ? 'used' : 'granted', exhausted ? 1 : 0, taskId, perm.id]
    );

    return true;
  }

  /**
   * Per-user summary of remaining task starts (sum of remaining capacity across
   * active batches). Returns a map keyed by user_id -> remaining.
   */
  static async availableCountsByUser() {
    const rows = await query(
      `SELECT user_id, SUM(batch_size - used_count) AS remaining
       FROM task_permissions
       WHERE status = 'granted' AND used_count < batch_size
       GROUP BY user_id`
    );
    const map = {};
    for (const r of rows) {
      map[r.user_id] = Number(r.remaining);
    }
    return map;
  }

  /**
   * Users with their remaining task starts + active-batch info, paginated.
   * Powers the admin Tasks / permissions page.
   */
  static async listUserStatus(page = 1, limit = 20, search = '') {
    const offset = (page - 1) * limit;
    const params = [];
    let where = '';
    if (search) {
      // Search by account id, username, email or phone. A numeric search also
      // matches the exact user id so the admin can look a customer up by ID.
      const like = `%${search}%`;
      if (/^\d+$/.test(search)) {
        where = 'WHERE u.id = ? OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?';
        params.push(Number(search), like, like, like);
      } else {
        where = 'WHERE u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?';
        params.push(like, like, like);
      }
    }

    // Balance lives in the wallets table, not on users.
    // available_permissions = remaining task starts across active batches.
    // batch_size / batch_used describe the active batch (if any).
    // times_requested       = how many times this customer has been approved to
    //                         work (every non-revoked grant is one work round).
    const users = await query(
      `SELECT
         u.id, u.username, u.email, u.phone, u.status,
         COALESCE(w.balance, 0) AS balance,
         COALESCE(p.remaining, 0) AS available_permissions,
         COALESCE(p.batch_total, 0) AS batch_size,
         COALESCE(p.batch_used, 0) AS batch_used,
         COALESCE(p.grant_count, 0) AS times_requested,
         p.last_granted_at
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       LEFT JOIN (
         SELECT user_id,
                SUM(CASE WHEN status = 'granted' AND used_count < batch_size
                         THEN batch_size - used_count ELSE 0 END) AS remaining,
                SUM(CASE WHEN status = 'granted' AND used_count < batch_size
                         THEN batch_size ELSE 0 END) AS batch_total,
                SUM(CASE WHEN status = 'granted' AND used_count < batch_size
                         THEN used_count ELSE 0 END) AS batch_used,
                SUM(CASE WHEN status <> 'revoked' THEN 1 ELSE 0 END) AS grant_count,
                MAX(created_at) AS last_granted_at
         FROM task_permissions
         GROUP BY user_id
       ) p ON p.user_id = u.id
       ${where}
       ORDER BY u.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM users u ${where}`,
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
   * Revoke any active (not-yet-exhausted) batches for a user. Returns count.
   */
  static async revokeAvailable(userId) {
    const result = await query(
      `UPDATE task_permissions
       SET status = 'revoked'
       WHERE user_id = ? AND status = 'granted' AND used_count < batch_size`,
      [userId]
    );
    return result.affectedRows || 0;
  }

  /**
   * Recent grant/use history for a user (admin detail view).
   */
  static async history(userId, limit = 50) {
    return await query(
      `SELECT tp.*, a.username AS granted_by_username
       FROM task_permissions tp
       LEFT JOIN users a ON tp.granted_by = a.id
       WHERE tp.user_id = ?
       ORDER BY tp.created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }
}

TaskPermission.DEFAULT_BATCH_SIZE = DEFAULT_BATCH_SIZE;

module.exports = TaskPermission;
