/**
 * SequencePlan model.
 *
 * A sequence plan holds a customer's full earnings run: a fixed number of
 * orders with a precomputed per-order commission schedule that lands the
 * customer on a target total after completing the whole run. See
 * src/utils/sequencePlan.js for the schedule maths and migration 014 for the
 * table shape.
 *
 * At most ONE active plan per user. The plan is consulted during the grab
 * transaction to decide each order's commission (and whether it's the combo
 * order), overriding the market-rate commission.
 */

const { query } = require('../config/database');
const seq = require('../utils/sequencePlan');

class SequencePlan {
  /**
   * Create (or replace) an active plan for a user from a deposit + optional
   * admin override. Cancels any existing active plan first, then inserts the
   * new one with a freshly generated schedule.
   *
   * @param {number} userId
   * @param {number} deposit       the deposit that starts this run
   * @param {object|null} override optional admin override params
   * @param {number|null} createdBy admin id (null if auto-created)
   * @returns {object} the created plan (row-ish + parsed schedule)
   */
  static async createForUser(userId, deposit, override = null, createdBy = null, isKilled = false) {
    const plan = seq.createPlan(deposit, override);

    await SequencePlan.cancelActive(userId);

    // Cancel any lingering PENDING COMBO tasks from the old plan so the sticky-
    // combo short-circuit doesn't re-show stale combos after a plan change. The
    // customer hasn't submitted/recharged them yet, so no balance impact.
    await query(
      `UPDATE tasks SET status = 'cancelled', completion_time = CURRENT_TIMESTAMP
       WHERE user_id = ? AND status = 'pending' AND is_combo = 1`,
      [userId]
    );

    // Baseline the run at the customer's current global completed-order count,
    // so run-order 1 = their next real order even if they already have history.
    const rows = await query(
      "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'completed'",
      [userId]
    );
    const startOrder = Number(rows[0] ? rows[0].n : 0);

    // The plan may have up to 3 combos. The single combo_* columns keep the
    // FIRST combo (backward-compat / NOT NULL), and the full list is stored in
    // the `combos` JSON column. The `schedule` JSON already encodes every
    // per-order combo/normal entry the grab needs.
    const combos = Array.isArray(plan.combos) ? plan.combos : [];
    const first = combos[0] || { order: 0, recharge: 0, profit: 0 };

    const result = await query(
      `INSERT INTO sequence_plans
         (user_id, deposit, num_orders, target_total, combo_order,
          combo_amount, combo_profit, combos, schedule, start_order, current_order, status, is_killed, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
      [
        userId,
        plan.deposit,
        plan.orders,
        plan.targetTotal,
        first.order,
        first.recharge,
        first.profit,
        JSON.stringify(combos),
        JSON.stringify(plan.schedule),
        startOrder,
        isKilled ? 1 : 0,
        createdBy
      ]
    );

    return { id: result.insertId, startOrder, ...plan };
  }

  /**
   * Create a per-user plan from a config INSIDE an existing transaction
   * connection (used when a proxy account's grab materialises the global proxy
   * plan). Mirrors createForUser but runs on `conn` so it's atomic with the
   * grab. `cfg` = { deposit, orders, targetTotal, combos:[{order,recharge,profit}] }.
   */
  static async createForUserInTransaction(conn, userId, cfg, createdBy = null) {
    const plan = seq.createPlan(Number(cfg.deposit), {
      orders: cfg.orders,
      targetTotal: cfg.targetTotal,
      combos: cfg.combos
    });

    // Cancel any prior active plan for this user (on the txn connection).
    await conn.execute(
      `UPDATE sequence_plans SET status = 'cancelled' WHERE user_id = ? AND status = 'active'`,
      [userId]
    );

    // Cancel stale pending combo tasks so the sticky-combo path can't re-show them.
    await conn.execute(
      `UPDATE tasks SET status = 'cancelled', completion_time = CURRENT_TIMESTAMP
       WHERE user_id = ? AND status = 'pending' AND is_combo = 1`,
      [userId]
    );

    const [rows] = await conn.execute(
      "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'completed'",
      [userId]
    );
    const startOrder = Number(rows[0] ? rows[0].n : 0);

    const combos = Array.isArray(plan.combos) ? plan.combos : [];
    const first = combos[0] || { order: 0, recharge: 0, profit: 0 };

    const [result] = await conn.execute(
      `INSERT INTO sequence_plans
         (user_id, deposit, num_orders, target_total, combo_order,
          combo_amount, combo_profit, combos, schedule, start_order, current_order, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)`,
      [
        userId, plan.deposit, plan.orders, plan.targetTotal,
        first.order, first.recharge, first.profit,
        JSON.stringify(combos), JSON.stringify(plan.schedule), startOrder, createdBy
      ]
    );
    return { id: result.insertId, startOrder, ...plan };
  }

  /**
   * The active plan for a user, or null. Schedule is parsed to an array.
   */
  static async getActive(userId) {
    try {
      const rows = await query(
        `SELECT * FROM sequence_plans
         WHERE user_id = ? AND status = 'active'
         ORDER BY id DESC
         LIMIT 1`,
        [userId]
      );
      return rows[0] ? SequencePlan._parse(rows[0]) : null;
    } catch (e) {
      // Table not created yet (migration 014 not run) -> behave as "no plan".
      if (e && e.code === 'ER_NO_SUCH_TABLE') return null;
      throw e;
    }
  }

  /**
   * The active plan for a user INSIDE a transaction, row-locked, or null.
   * Mirrors ComboPlan.pendingForOrderInTransaction so the grab can read + lock
   * the plan atomically.
   */
  static async getActiveInTransaction(conn, userId) {
    try {
      const [rows] = await conn.execute(
        `SELECT * FROM sequence_plans
         WHERE user_id = ? AND status = 'active'
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [userId]
      );
      return rows[0] ? SequencePlan._parse(rows[0]) : null;
    } catch (e) {
      // Table not created yet (migration 014 not run) -> behave as "no plan"
      // so grabs keep working until the migration is applied.
      if (e && e.code === 'ER_NO_SUCH_TABLE') return null;
      throw e;
    }
  }

  /**
   * The schedule entry for the customer's GLOBAL order number. The run is
   * baselined at start_order, so run-order = globalOrderNumber - start_order.
   * Returns null if this global order falls outside the run (before it started
   * or after it finished).
   */
  static entryForOrder(plan, globalOrderNumber) {
    if (!plan || !Array.isArray(plan.schedule)) return null;
    const runOrder = Number(globalOrderNumber) - Number(plan.startOrder || 0);
    if (runOrder < 1 || runOrder > Number(plan.orders)) return null;
    return plan.schedule.find((e) => Number(e.order) === runOrder) || null;
  }

  /**
   * The schedule entry for a RUN order number directly (1-based within the
   * plan). The plan's own cursor decides this, so combo #N fires on the plan's
   * Nth order EXACTLY — independent of the customer's global history or which
   * market they grab on. Returns null if the run order is outside the plan.
   */
  static entryByRunOrder(plan, runOrder) {
    if (!plan || !Array.isArray(plan.schedule)) return null;
    const n = Number(runOrder);
    if (n < 1 || n > Number(plan.orders)) return null;
    return plan.schedule.find((e) => Number(e.order) === n) || null;
  }

  /**
   * Map a global order number to this run's 1-based order number.
   */
  static runOrder(plan, globalOrderNumber) {
    return Number(globalOrderNumber) - Number(plan.startOrder || 0);
  }

  /**
   * Advance the plan's grab cursor to the given order number (inside a txn).
   * When the last order is reached the plan flips to 'completed'.
   */
  static async advanceInTransaction(conn, planId, orderNumber, numOrders) {
    const completed = Number(orderNumber) >= Number(numOrders);
    await conn.execute(
      `UPDATE sequence_plans
       SET current_order = ?,
           status = ?,
           completed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = ?`,
      [orderNumber, completed ? 'completed' : 'active', completed ? 1 : 0, planId]
    );
  }

  /**
   * Active plans for a set of user ids, keyed by user_id. Used by the admin
   * customer table to show each customer's plan summary. Returns {} if the
   * table doesn't exist yet.
   */
  static async activeByUserIds(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return {};
    try {
      const placeholders = userIds.map(() => '?').join(',');
      const rows = await query(
        `SELECT * FROM sequence_plans
         WHERE status = 'active' AND user_id IN (${placeholders})`,
        userIds
      );
      const map = {};
      rows.forEach((r) => {
        const p = SequencePlan._parse(r);
        map[p.userId] = {
          deposit: p.deposit,
          orders: p.orders,
          targetTotal: p.targetTotal,
          combos: p.combos,
          currentOrder: p.currentOrder,
          isKilled: p.isKilled
        };
      });
      return map;
    } catch (e) {
      if (e && e.code === 'ER_NO_SUCH_TABLE') return {};
      throw e;
    }
  }

  /**
   * Cancel a user's active plan (e.g. admin reset, or replaced by a new plan).
   */
  static async cancelActive(userId) {
    const result = await query(
      `UPDATE sequence_plans SET status = 'cancelled'
       WHERE user_id = ? AND status = 'active'`,
      [userId]
    );
    return result.affectedRows || 0;
  }

  // Parse the JSON columns into real arrays (mysql2 may return them as a string
  // or already-parsed object depending on the driver/column type).
  static _parse(row) {
    const parseJson = (v, fallback) => {
      if (v == null) return fallback;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch (_) { return fallback; }
      }
      return v;
    };
    const schedule = parseJson(row.schedule, []) || [];
    let combos = parseJson(row.combos, null);
    // Fall back to the single combo_* columns for older rows without `combos`.
    if (!Array.isArray(combos)) {
      combos = Number(row.combo_order) > 0
        ? [{ order: Number(row.combo_order), recharge: parseFloat(row.combo_amount), profit: parseFloat(row.combo_profit) }]
        : [];
    }
    return {
      id: row.id,
      userId: row.user_id,
      deposit: parseFloat(row.deposit),
      orders: Number(row.num_orders),
      targetTotal: parseFloat(row.target_total),
      combos,
      // Keep the single-combo fields for any legacy caller/display.
      comboOrder: Number(row.combo_order),
      comboAmount: parseFloat(row.combo_amount),
      comboProfit: parseFloat(row.combo_profit),
      schedule,
      startOrder: Number(row.start_order || 0),
      currentOrder: Number(row.current_order),
      isKilled: Number(row.is_killed) === 1,
      createdAt: row.created_at,
      status: row.status
    };
  }
}

module.exports = SequencePlan;
