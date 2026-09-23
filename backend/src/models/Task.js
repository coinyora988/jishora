/**
 * Task Model
 * Handles task operations (marketplace orders)
 */

const { query, transaction } = require('../config/database');
const TaskPermission = require('./TaskPermission');
const ComboPlan = require('./ComboPlan');
const ProxyCombo = require('./ProxyCombo');
const SequencePlan = require('./SequencePlan');
const { ProxyPlan } = require('./ProxyPlan');

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
      // orders. An explicit admin combo_plans entry still takes precedence.
      let sequence = !combo
        ? await SequencePlan.getActiveInTransaction(conn, userId)
        : null;

      // GLOBAL PROXY PLAN: if this is a PROXY account with no active plan yet,
      // and the admin has set a single global proxy plan, materialise a
      // per-account sequence plan from it now so the whole run follows the
      // global config. This is what makes "set once -> applies to all proxy
      // accounts" work. Regular (non-proxy) customers are never affected.
      if (!combo && !sequence) {
        const [urow2] = await conn.execute('SELECT is_proxy FROM users WHERE id = ?', [userId]);
        if (urow2[0] && Number(urow2[0].is_proxy) === 1) {
          const proxyCfg = await ProxyPlan.getConfig();
          if (proxyCfg) {
            // Create the per-account plan (cancels any prior, baselines start
            // order to this account's completed count) using the global config.
            await SequencePlan.createForUserInTransaction(conn, userId, proxyCfg);
            sequence = await SequencePlan.getActiveInTransaction(conn, userId);
            // A proxy plan supersedes the per-market proxy combo template.
            proxyComboAmount = null;
          }
        }
      }

      // The plan's run-order is derived from the ACTUAL number of non-cancelled
      // tasks the customer has grabbed SINCE the plan started (created_at). This
      // is self-correcting: it can never desync from real grabs (cancelled
      // grabs are excluded automatically, so combo #N always lands on the plan's
      // Nth real order — exactly as the admin set it), independent of prior
      // history or which market. This grab is the (count + 1)th plan order.
      let planRunOrder = null;
      let seqEntry = null;
      if (sequence) {
        // Run-order = (orders the customer has already FINISHED since the plan
        // started) + 1 for THIS grab. We count only COMPLETED tasks (plus any
        // still-pending combo, which occupies its slot until submitted) so a
        // normal pending grab does NOT inflate the count. This makes combo #N
        // fire EXACTLY on the plan's Nth order, exactly as the admin set it.
        // We also count a currently-pending COMBO as its own slot so the run
        // doesn't skip it. `> ?` (not >=) excludes anything created in the same
        // instant as the plan itself.
        const [[pcnt]] = [await conn.execute(
          `SELECT COUNT(*) AS n FROM tasks
           WHERE user_id = ?
             AND created_at > ?
             AND (status = 'completed' OR (status = 'pending' AND is_combo = 1))`,
          [userId, sequence.createdAt]
        )];
        planRunOrder = Number(pcnt[0].n) + 1;
        seqEntry = SequencePlan.entryByRunOrder(sequence, planRunOrder);
        // If a sequence plan drives this grab, it takes precedence over the
        // per-market proxy combo template for this order.
        if (seqEntry) proxyComboAmount = null;
      }

      let orderAmount;
      let isCombo = 0;
      let commissionOverride = null; // when set, use this instead of amount×rate
      let noFreeze = false;          // sequence normal order: order amount is
                                     // display-only, do not freeze the balance

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
        // SEQUENCE NORMAL order (Option ক): order amount is derived from the
        // customer's CURRENT BALANCE (varied per order, always <= balance so it
        // never fails) and commission = order amount × THIS MARKET'S rate.
        // This means Rakuten (12%) and Temu (18%) orders automatically have
        // higher amounts AND higher commissions than JD (6%) — same plan
        // continues across markets, only combo timing/profit is plan-driven.
        // Use the plan schedule's orderAmount as a FRACTION of the deposit,
        // then scale it to the customer's current balance so the order amount
        // grows proportionally when the customer moves to a richer market.
        const planDeposit = parseFloat(sequence.deposit) || userBalance;
        const scheduledAmt = Math.round(parseFloat(seqEntry.orderAmount) * 100) / 100;
        // Scale: scheduledAmt was generated relative to the plan deposit.
        // When balance > deposit (e.g. Rakuten 506 vs JD deposit 20–50),
        // scale the amount proportionally so it reflects the bigger balance.
        // Cap at the actual current balance to never exceed what they have.
        const scaleFactor = planDeposit > 0 ? (userBalance / planDeposit) : 1;
        let scaledAmt = Math.round(scheduledAmt * scaleFactor * 100) / 100;
        // Always keep the amount in a reasonable range: at least 40% of balance,
        // at most 100% of balance, so Rakuten/Temu orders look proportionate.
        const floor = Math.round(userBalance * 0.4 * 100) / 100;
        const cap = Math.round(userBalance * 100) / 100;
        orderAmount = Math.min(cap, Math.max(floor, scaledAmt));
        orderAmount = Math.round(orderAmount * 100) / 100;
        if (!(orderAmount > 0)) {
          throw new Error('Insufficient balance');
        }
        // Commission = market rate × order amount (NOT plan schedule).
        // commissionOverride stays null so the code below uses market rate.
        noFreeze = false;
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
            order_amount, commission, expected_income, status, is_combo, no_freeze)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'pending', ?, ?)`,
        [
          userId,
          productData.market_id,
          productId,
          generateNumber('ORD'),
          orderAmount,
          commission,
          expectedIncome,
          isCombo,
          noFreeze ? 1 : 0
        ]
      );

      if (isCombo || noFreeze) {
        // Not frozen at grab: combo orders and sequence-normal orders (whose
        // order amount is display-only). If it came from a PER-USER combo plan,
        // mark that plan triggered.
        if (combo) {
          await ComboPlan.markTriggeredInTransaction(conn, combo.id, result.insertId);
        }
      } else {
        // Freeze the order amount for a plain normal task.
        await conn.execute(
          'UPDATE wallets SET balance = balance - ?, frozen_balance = frozen_balance + ? WHERE user_id = ?',
          [orderAmount, orderAmount, userId]
        );
      }

      // Advance the sequence-plan cursor to this run-order. When the last order
      // of the run is grabbed the plan flips to 'completed'. Only when this grab
      // is actually part of the active sequence (seqEntry set).
      if (sequence && seqEntry) {
        // Advance the plan's own cursor by exactly one (this grab = planRunOrder).
        await SequencePlan.advanceInTransaction(
          conn, sequence.id, planRunOrder, sequence.orders
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

      const frozen = (isCombo || noFreeze) ? 0 : orderAmount;
      return {
        taskId: result.insertId,
        productName: productData.name,
        productImage: productData.image_url,
        orderAmount,
        frozenAmount: frozen,
        newBalance: userBalance - frozen,
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
      const noFreeze = Number(taskData.no_freeze) === 1;

      // Lock wallet.
      const [wallet] = await conn.execute(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [userId]
      );
      const balanceBefore = parseFloat(wallet[0].balance);

      // SEQUENCE NORMAL order (no_freeze): nothing was frozen at grab and the
      // order amount is display-only. Completing it just credits the scheduled
      // commission. No recharge required, no unfreeze.
      if (noFreeze && !isCombo) {
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
           `Commission from order ${taskData.order_number}`]
        );
        return { commission, totalReturn: commission, taskId, isCombo: false };
      }

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
                  AND status = 'completed' THEN commission ELSE 0 END) as today_commission
      FROM tasks
      WHERE user_id = ?
    `, [localMinutes, localMinutes, localMinutes, localMinutes, userId]);

    // "Yesterday's buy commission" = the total commission from the customer's
    // MOST RECENT active day BEFORE today (in their local timezone) — not
    // strictly the calendar day before today. So if they last worked two days
    // ago, it shows that day's total instead of 0. We first find the latest
    // local completion-date that is before today, then sum that day's
    // commissions.
    const ydayRows = await query(`
      SELECT COALESCE(SUM(commission), 0) AS yesterday_commission
      FROM tasks
      WHERE user_id = ?
        AND status = 'completed'
        AND DATE(DATE_ADD(completion_time, INTERVAL ? MINUTE)) = (
          SELECT MAX(DATE(DATE_ADD(completion_time, INTERVAL ? MINUTE)))
          FROM tasks
          WHERE user_id = ?
            AND status = 'completed'
            AND DATE(DATE_ADD(completion_time, INTERVAL ? MINUTE)) < DATE(DATE_ADD(NOW(), INTERVAL ? MINUTE))
        )
    `, [userId, localMinutes, localMinutes, userId, localMinutes, localMinutes]);

    stats.yesterday_commission = ydayRows[0] ? ydayRows[0].yesterday_commission : 0;

    // "Cash gap between tasks" = how much the customer still needs to RECHARGE
    // to submit a pending combo order. When they have a pending combo whose
    // order amount exceeds their current balance, the gap is (order_amount -
    // balance). Once they recharge enough (or submit / have no pending combo),
    // the gap is 0. This drives the "Cash gap between tasks" card.
    const comboRows = await query(
      `SELECT order_amount FROM tasks
       WHERE user_id = ? AND status = 'pending' AND is_combo = 1
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    let cashGap = 0;
    if (comboRows[0]) {
      const balRows = await query('SELECT COALESCE(balance, 0) AS balance FROM wallets WHERE user_id = ?', [userId]);
      const balance = balRows[0] ? parseFloat(balRows[0].balance) : 0;
      const need = parseFloat(comboRows[0].order_amount) - balance;
      cashGap = need > 0 ? Math.round(need * 100) / 100 : 0;
    }
    stats.cash_gap = cashGap;

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

      // A combo task and a sequence-normal (no_freeze) task were NOT frozen at
      // grab, so cancelling them must not credit any balance. A plain normal
      // task had its order amount frozen, so return it.
      const wasFrozen = Number(taskData.is_combo) !== 1 && Number(taskData.no_freeze) !== 1;
      if (wasFrozen) {
        const frozenAmount = parseFloat(taskData.order_amount);
        await conn.execute(
          `UPDATE wallets
           SET balance = balance + ?,
               frozen_balance = frozen_balance - ?
           WHERE user_id = ?`,
          [frozenAmount, frozenAmount, userId]
        );
      } else if (Number(taskData.is_combo) === 1) {
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

      // NOTE: the sequence-plan run-order is derived at grab time from the
      // COUNT of non-cancelled tasks since the plan started, so cancelling this
      // task automatically excludes it from that count — the run-order
      // self-corrects and combos still fire on the plan's Nth real order. We
      // only reactivate the plan if it had been marked completed, so the
      // customer can grab again after a cancel near the end of the run.
      try {
        await conn.execute(
          `UPDATE sequence_plans
           SET status = 'active', completed_at = NULL
           WHERE user_id = ? AND status = 'completed'`,
          [userId]
        );
      } catch (e) {
        if (!e || e.code !== 'ER_NO_SUCH_TABLE') throw e;
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
