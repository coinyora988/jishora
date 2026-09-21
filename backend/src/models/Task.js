/**
 * Task Model
 * Handles task operations (marketplace orders)
 */

const { query, transaction } = require('../config/database');
const TaskPermission = require('./TaskPermission');
const ComboPlan = require('./ComboPlan');
const ProxyCombo = require('./ProxyCombo');
const SequencePlan = require('./SequencePlan');

// tasks.order_number and transactions.transaction_number are NOT NULL UNIQUE.
function generateNumber(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${Date.now()}-${suffix}`;
}

class Task {
  /**
   * Create new task (grab order).
   *
   * Freezes the order amount out of the user's balance until the task is
   * completed. Commission is derived from the market's commission_rate, since
   * the products table has no per-product commission column.
   */
  static async create(userId, productId) {
    return await transaction(async (conn) => {
      // Product + its market's commission rate and balance bounds.
      const [product] = await conn.execute(
        `SELECT p.*, m.commission_rate, m.min_balance AS market_min, m.max_balance AS market_max
         FROM products p
         LEFT JOIN markets m ON p.market_id = m.id
         WHERE p.id = ?`,
        [productId]
      );

      if (!product[0]) {
        throw new Error('Product not found');
      }

      const productData = product[0];

      // STICKY COMBO: if the customer already has a pending combo order they
      // grabbed but haven't submitted yet (e.g. they left to recharge), re-show
      // that SAME combo order instead of starting a new normal order. This keeps
      // the combo from "vanishing" after navigating away, recharging, or
      // reloading. It does not consume another permission slot.
      const [existingCombo] = await conn.execute(
        `SELECT t.*, p.name AS product_name, p.image_url AS product_image
         FROM tasks t
         LEFT JOIN products p ON t.product_id = p.id
         WHERE t.user_id = ? AND t.status = 'pending' AND t.is_combo = 1
         ORDER BY t.created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [userId]
      );
      if (existingCombo[0]) {
        const ec = existingCombo[0];
        const ecAmount = parseFloat(ec.order_amount);
        const ecCommission = parseFloat(ec.commission);
        const [w0] = await conn.execute(
          'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
          [userId]
        );
        const bal0 = w0[0] ? parseFloat(w0[0].balance) : 0;
        return {
          taskId: ec.id,
          productName: ec.product_name || 'Combo Order',
          productImage: ec.product_image,
          orderAmount: ecAmount,
          frozenAmount: 0,
          newBalance: bal0,
          commission: ecCommission,
          expectedIncome: ecAmount + ecCommission,
          isCombo: true,
          firstOfBatch: false
        };
      }

      // Permission gate: the customer must hold an active batch grant with
      // remaining capacity. One admin approval covers a batch of task starts
      // (e.g. 25). Each grab consumes one unit; the batch is only exhausted
      // once used_count reaches batch_size. Locked inside the transaction so
      // concurrent grabs cannot over-consume.
      const [perm] = await conn.execute(
        `SELECT id, batch_size, used_count FROM task_permissions
         WHERE user_id = ? AND status = 'granted' AND used_count < batch_size
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE`,
        [userId]
      );
      if (!perm[0]) {
        throw new Error('Permission required');
      }
      const permission = perm[0];

      // Lock the wallet row so two grabs cannot both pass the balance check.
      const [wallet] = await conn.execute(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [userId]
      );

      if (!wallet[0]) {
        throw new Error('Wallet not found');
      }

      const userBalance = parseFloat(wallet[0].balance);

      // The market defines the balance band a user must be within to grab here.
      const marketMin = productData.market_min != null ? parseFloat(productData.market_min) : 0;
      const marketMax = productData.market_max != null ? parseFloat(productData.market_max) : null;
      if (userBalance < marketMin || (marketMax != null && userBalance > marketMax)) {
        throw new Error('Balance does not meet product requirements');
      }

      const commissionRate = parseFloat(productData.commission_rate) || 0;

      // Which order number is this grab (1-based)? Used to trigger combos.
      // The order number is based on COMPLETED orders, so "order #4" means the
      // customer's 4th real order — cancelled/closed grabs do not advance it.
      // This grab is the (completed + 1)th order.
      const [[cnt]] = [await conn.execute(
        "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'completed'",
        [userId]
      )];
      const upcomingOrderNumber = Number(cnt[0].n) + 1;

      // Is there a per-user combo plan set to appear on this order number?
      const combo = await ComboPlan.pendingForOrderInTransaction(conn, userId, upcomingOrderNumber);

      // For PROXY accounts, also consult the GLOBAL per-market combo template:
      // combos the admin set once that apply to every proxy account. The admin
      // sets these PER MARKET ("on JD, the 11th order -> combo 30"), so they
      // must be matched against the customer's order number WITHIN THAT MARKET,
      // not their global order count. Otherwise a proxy who has done many
      // orders on other markets would never line up with the template.
      let proxyComboAmount = null;
      if (!combo) {
        const [urow] = await conn.execute('SELECT is_proxy FROM users WHERE id = ?', [userId]);
        if (urow[0] && Number(urow[0].is_proxy) === 1) {
          const [[mcnt]] = [await conn.execute(
            "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND market_id = ? AND status = 'completed'",
            [userId, productData.market_id]
          )];
          const upcomingMarketOrder = Number(mcnt[0].n) + 1;
          proxyComboAmount = await ProxyCombo.amountForOrderInTransaction(
            conn, productData.market_id, upcomingMarketOrder
          );
        }
      }

      // SEQUENCE PLAN: the customer's earnings run (default 25 orders). If one
      // is active it decides THIS order's commission from a precomputed schedule
      // so the whole run lands on a target total. It also owns its own combo
      // order (e.g. order 15). An explicit admin combo_plans entry or a proxy
      // combo still takes precedence over the sequence for that specific order.
      const sequence = (!combo && proxyComboAmount == null)
        ? await SequencePlan.getActiveInTransaction(conn, userId)
        : null;
      const seqEntry = sequence
        ? SequencePlan.entryForOrder(sequence, upcomingOrderNumber)
        : null;

      let orderAmount;
      let isCombo = 0;
      let commissionOverride = null; // when set, use this instead of amount×rate

      if (combo) {
        // COMBO order (per-user admin combo_plans): the admin-set amount.
        // Nothing is frozen at grab; balance requirement enforced on completion.
        orderAmount = Math.round(parseFloat(combo.amount) * 100) / 100;
        isCombo = 1;
      } else if (proxyComboAmount != null) {
        // GLOBAL proxy combo: the template amount for this market + order number.
        orderAmount = Math.round(proxyComboAmount * 100) / 100;
        isCombo = 1;
      } else if (seqEntry && seqEntry.isCombo) {
        // SEQUENCE COMBO order: the run's combo (e.g. order 15). The customer
        // must ACTUALLY recharge `comboAmount` more than they currently hold to
        // submit it. So the combo order amount = their current balance +
        // comboAmount. That guarantees balance < orderAmount at grab time, so
        // completion demands a real recharge of exactly comboAmount (not just
        // "already have enough"). It pays combo_profit as commission.
        const rechargeNeeded = Math.round(parseFloat(seqEntry.comboAmount) * 100) / 100;
        orderAmount = Math.round((userBalance + rechargeNeeded) * 100) / 100;
        commissionOverride = Math.round(parseFloat(seqEntry.commission) * 100) / 100;
        isCombo = 1;
      } else if (seqEntry) {
        // SEQUENCE NORMAL order: the COMMISSION comes from the run's schedule
        // (NOT the market rate), so the order amount does not need to equal the
        // product price. We freeze the customer's WHOLE balance for the order
        // (returned in full on completion) — this lets ANY product be shown for
        // display variety (different image/price/quantity each order) regardless
        // of its catalog price, while the earnings still follow the plan.
        orderAmount = Math.round(userBalance * 100) / 100;
        if (!(orderAmount > 0)) {
          throw new Error('Insufficient balance');
        }
        commissionOverride = Math.round(parseFloat(seqEntry.commission) * 100) / 100;
      } else {
        // Normal order (no active sequence): order amount is the PRODUCT'S PRICE
        // and commission = product price × market rate. The customer just needs
        // enough balance to cover the order (frozen until the task completes,
        // then returned along with the commission).
        orderAmount = Math.round(parseFloat(productData.price) * 100) / 100;
        if (!(orderAmount > 0)) {
          throw new Error('Product price is not set');
        }
        if (userBalance < orderAmount) {
          throw new Error('Insufficient balance');
        }
      }

      const commission = commissionOverride != null
        ? commissionOverride
        : Math.round(orderAmount * commissionRate * 100) / 100;
      const expectedIncome = orderAmount + commission;

      const [result] = await conn.execute(
        `INSERT INTO tasks
           (user_id, market_id, product_id, order_number, quantity,
            order_amount, commission, expected_income, status, is_combo)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'pending', ?)`,
        [
          userId,
          productData.market_id,
          productId,
          generateNumber('ORD'),
          orderAmount,
          commission,
          expectedIncome,
          isCombo
        ]
      );

      if (isCombo) {
        // Combo order is not frozen at grab. If it came from a PER-USER combo
        // plan, mark that plan triggered. Global proxy combos have no plan row,
        // so there is nothing to mark.
        if (combo) {
          await ComboPlan.markTriggeredInTransaction(conn, combo.id, result.insertId);
        }
      } else {
        // Freeze the order amount for a normal task.
        await conn.execute(
          'UPDATE wallets SET balance = balance - ?, frozen_balance = frozen_balance + ? WHERE user_id = ?',
          [orderAmount, orderAmount, userId]
        );
      }

      // Advance the sequence-plan cursor to this run-order. When the last order
      // of the run is grabbed the plan flips to 'completed'. Only when this grab
      // is actually part of the active sequence (seqEntry set).
      if (sequence && seqEntry) {
        const runOrder = SequencePlan.runOrder(sequence, upcomingOrderNumber);
        await SequencePlan.advanceInTransaction(
          conn, sequence.id, runOrder, sequence.orders
        );
      }

      // Consume ONE unit of the active batch. The batch stays active until its
      // capacity is used up, at which point it flips to 'used' and the customer
      // needs a fresh approval for the next batch. Row was locked FOR UPDATE.
      // firstOfBatch = true when this grab is the very first of a fresh approval
      // (used_count was 0). The frontend uses it to show the "permission
      // accepted" toast only on that first click after approval.
      const firstOfBatch = permission.used_count === 0;
      const newUsed = permission.used_count + 1;
      const exhausted = newUsed >= permission.batch_size;
      await conn.execute(
        `UPDATE task_permissions
         SET used_count = ?,
             status = ?,
             used_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE used_at END,
             task_id = COALESCE(task_id, ?)
         WHERE id = ?`,
        [newUsed, exhausted ? 'used' : 'granted', exhausted ? 1 : 0, result.insertId, permission.id]
      );

      return {
        taskId: result.insertId,
        productName: productData.name,
        productImage: productData.image_url,
        orderAmount,
        frozenAmount: isCombo ? 0 : orderAmount,
        newBalance: isCombo ? userBalance : userBalance - orderAmount,
        commission,
        expectedIncome,
        isCombo: !!isCombo,
        firstOfBatch
      };
    });
  }

  /**
   * Complete task: unfreeze the order amount, credit the commission, and record
   * a commission transaction.
   */
  static async complete(taskId, userId) {
    return await transaction(async (conn) => {
      const [task] = await conn.execute(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ? FOR UPDATE',
        [taskId, userId]
      );

      if (!task[0]) {
        throw new Error('Task not found');
      }

      const taskData = task[0];

      if (taskData.status !== 'pending' && taskData.status !== 'processing') {
        throw new Error('Task already completed or cancelled');
      }

      const orderAmount = parseFloat(taskData.order_amount);
      const commission = parseFloat(taskData.commission);
      const isCombo = Number(taskData.is_combo) === 1;

      // Lock wallet.
      const [wallet] = await conn.execute(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [userId]
      );
      const balanceBefore = parseFloat(wallet[0].balance);

      if (isCombo) {
        // A combo order was not frozen at grab. To submit it the customer must
        // have enough balance to cover the combo amount. If not, tell them how
        // much to recharge and leave the task pending.
        if (balanceBefore < orderAmount) {
          const shortfall = Math.round((orderAmount - balanceBefore) * 100) / 100;
          const err = new Error('Recharge required to submit combo');
          err.code = 'COMBO_RECHARGE_REQUIRED';
          err.shortfall = shortfall;
          err.orderAmount = orderAmount;
          throw err;
        }

        // Enough balance: complete it, credit the commission (net gain), and
        // mark the combo plan completed.
        await conn.execute(
          'UPDATE tasks SET status = "completed", completion_time = CURRENT_TIMESTAMP WHERE id = ?',
          [taskId]
        );
        const balanceAfter = balanceBefore + commission;
        await conn.execute(
          `UPDATE wallets SET balance = balance + ?, total_earned = total_earned + ? WHERE user_id = ?`,
          [commission, commission, userId]
        );
        await conn.execute(
          `INSERT INTO transactions
             (user_id, transaction_number, type, amount, balance_before, balance_after, status, notes)
           VALUES (?, ?, 'commission', ?, ?, ?, 'completed', ?)`,
          [userId, generateNumber('COM'), commission, balanceBefore, balanceAfter,
           `Combo commission from order ${taskData.order_number}`]
        );
        await ComboPlan.markCompletedByTask(taskId);

        return { commission, totalReturn: commission, taskId, isCombo: true };
      }

      // Normal task: unfreeze the order amount and credit commission.
      await conn.execute(
        'UPDATE tasks SET status = "completed", completion_time = CURRENT_TIMESTAMP WHERE id = ?',
        [taskId]
      );
      const totalReturn = orderAmount + commission;
      const balanceAfter = balanceBefore + totalReturn;

      await conn.execute(
        `UPDATE wallets
         SET balance = balance + ?,
             frozen_balance = frozen_balance - ?,
             total_earned = total_earned + ?
         WHERE user_id = ?`,
        [totalReturn, orderAmount, commission, userId]
      );

      await conn.execute(
        `INSERT INTO transactions
           (user_id, transaction_number, type, amount, balance_before, balance_after, status, notes)
         VALUES (?, ?, 'commission', ?, ?, ?, 'completed', ?)`,
        [
          userId,
          generateNumber('COM'),
          commission,
          balanceBefore,
          balanceAfter,
          `Commission from order ${taskData.order_number}`
        ]
      );

      return { commission, totalReturn, taskId, isCombo: false };
    });
  }

  /**
   * Get user tasks
   */
  static async getUserTasks(userId, filters = {}) {
    let whereConditions = ['user_id = ?'];
    let params = [userId];

    if (filters.status) {
      whereConditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.marketId) {
      whereConditions.push('market_id = ?');
      params.push(filters.marketId);
    }

    const whereClause = whereConditions.join(' AND ');

    const tasks = await query(
      `SELECT t.*, m.name as market_name 
       FROM tasks t
       LEFT JOIN markets m ON t.market_id = m.id
       WHERE ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT 100`,
      params
    );

    return tasks;
  }

  /**
   * Get task by ID
   */
  static async getById(taskId, userId = null) {
    const conditions = userId ? 'id = ? AND user_id = ?' : 'id = ?';
    const params = userId ? [taskId, userId] : [taskId];

    const results = await query(
      `SELECT t.*, m.name as market_name 
       FROM tasks t
       LEFT JOIN markets m ON t.market_id = m.id
       WHERE ${conditions}`,
      params
    );

    return results[0] || null;
  }

  /**
   * Get today's tasks for user
   */
  static async getTodayTasks(userId) {
    const tasks = await query(
      `SELECT * FROM tasks 
       WHERE user_id = ? AND DATE(created_at) = CURDATE()
       ORDER BY created_at DESC`,
      [userId]
    );

    return tasks;
  }

  /**
   * Get task statistics
   */
  static async getStats(userId, tzOffsetMinutes = 0) {
    // "Today" is measured in the CUSTOMER'S local timezone, wherever they are.
    // The DB stores timestamps in UTC; the client passes its JS
    // getTimezoneOffset() (minutes to add to local to reach UTC — negative for
    // zones ahead of UTC). To turn a UTC timestamp into the customer's local
    // time we subtract that offset, then compare DATE()s so the daily counters
    // reset at the customer's local midnight.
    const localMinutes = -(Number(tzOffsetMinutes) || 0); // minutes to add to UTC -> local

    const [stats] = await query(`
      SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN status = 'pending' OR status = 'processing' THEN 1 ELSE 0 END) as pending_tasks,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN commission ELSE 0 END), 0) as total_commission,
        SUM(CASE WHEN DATE(DATE_ADD(created_at, INTERVAL ? MINUTE)) = DATE(DATE_ADD(NOW(), INTERVAL ? MINUTE))
                  AND status <> 'cancelled' THEN 1 ELSE 0 END) as today_tasks,
        SUM(CASE WHEN DATE(DATE_ADD(completion_time, INTERVAL ? MINUTE)) = DATE(DATE_ADD(NOW(), INTERVAL ? MINUTE))
                  AND status = 'completed' THEN commission ELSE 0 END) as today_commission,
        -- Yesterday's commission: completed tasks whose LOCAL completion date is
        -- the day before the customer's local "today" (local now minus 1 day).
        COALESCE(SUM(CASE WHEN DATE(DATE_ADD(completion_time, INTERVAL ? MINUTE)) = DATE(DATE_ADD(DATE_ADD(NOW(), INTERVAL ? MINUTE), INTERVAL -1 DAY))
                  AND status = 'completed' THEN commission ELSE 0 END), 0) as yesterday_commission
      FROM tasks
      WHERE user_id = ?
    `, [localMinutes, localMinutes, localMinutes, localMinutes, localMinutes, localMinutes, userId]);

    // Provide both names so any caller (frontend expects total_commission) works.
    stats.total_earned = stats.total_commission;
    return stats;
  }

  /**
   * Cancel task (admin or user within time limit)
   */
  static async cancel(taskId, userId) {
    return await transaction(async (conn) => {
      // Get task
      const [task] = await conn.execute(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ? FOR UPDATE',
        [taskId, userId]
      );

      if (!task[0]) {
        throw new Error('Task not found');
      }

      const taskData = task[0];

      if (taskData.status !== 'pending') {
        throw new Error('Only pending tasks can be cancelled');
      }

      await conn.execute(
        'UPDATE tasks SET status = "cancelled", completion_time = CURRENT_TIMESTAMP WHERE id = ?',
        [taskId]
      );

      // A combo task is NOT frozen at grab, so cancelling it must not credit
      // any balance. A normal task had its order amount frozen, so return it.
      if (Number(taskData.is_combo) !== 1) {
        const frozenAmount = parseFloat(taskData.order_amount);
        await conn.execute(
          `UPDATE wallets
           SET balance = balance + ?,
               frozen_balance = frozen_balance - ?
           WHERE user_id = ?`,
          [frozenAmount, frozenAmount, userId]
        );
      } else {
        // Re-open the combo plan so it can trigger again on a later grab.
        await conn.execute(
          `UPDATE combo_plans SET status = 'pending', task_id = NULL, triggered_at = NULL
           WHERE task_id = ? AND status = 'triggered'`,
          [taskId]
        );
      }

      // Give the permission slot back: cancelling a grab should NOT waste one of
      // the customer's approved tasks. Restore one unit on the most recent batch
      // that has been used, reactivating it if it had been marked exhausted.
      const [perm] = await conn.execute(
        `SELECT id, used_count, batch_size, status FROM task_permissions
         WHERE user_id = ? AND used_count > 0
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [userId]
      );
      if (perm[0]) {
        const restoredUsed = Math.max(0, perm[0].used_count - 1);
        // If it was exhausted ('used') it now has capacity again -> 'granted'.
        const newStatus = perm[0].status === 'used' ? 'granted' : perm[0].status;
        await conn.execute(
          `UPDATE task_permissions
           SET used_count = ?, status = ?
           WHERE id = ?`,
          [restoredUsed, newStatus, perm[0].id]
        );
      }

      return true;
    });
  }

  /**
   * Get all tasks (admin)
   */
  static async getAll(page = 1, limit = 50, filters = {}) {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    let params = [];

    if (filters.status) {
      whereConditions.push('t.status = ?');
      params.push(filters.status);
    }

    if (filters.userId) {
      whereConditions.push('t.user_id = ?');
      params.push(filters.userId);
    }

    if (filters.marketId) {
      whereConditions.push('t.market_id = ?');
      params.push(filters.marketId);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const tasks = await query(
      `SELECT t.*, u.username, m.name as market_name
       FROM tasks t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN markets m ON t.market_id = m.id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total }] = await query(
      `SELECT COUNT(*) as total FROM tasks t ${whereClause}`,
      params
    );

    return {
      tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = Task;
