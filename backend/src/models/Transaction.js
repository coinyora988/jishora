/**
 * Transaction Model
 * Handles transaction operations (deposits, withdrawals, commissions)
 */

const { query, transaction } = require('../config/database');

/**
 * transactions.transaction_number is NOT NULL UNIQUE, so every insert must
 * supply one. Format: TXN-<epoch ms>-<6 random chars>.
 */
function generateTransactionNumber(prefix = 'TXN') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${Date.now()}-${suffix}`;
}

class Transaction {
  /**
   * Create deposit request.
   *
   * A pending deposit does not move money, so balance_before and balance_after
   * both record the balance at request time. They are rewritten on approval.
   */
  static async createDeposit(userId, amount, method, proofImage = null) {
    return await transaction(async (conn) => {
      const [wallet] = await conn.execute(
        'SELECT balance FROM wallets WHERE user_id = ?',
        [userId]
      );

      if (!wallet[0]) {
        throw new Error('Wallet not found');
      }

      const currentBalance = parseFloat(wallet[0].balance);

      const [result] = await conn.execute(
        `INSERT INTO transactions
           (user_id, transaction_number, type, amount, balance_before, balance_after,
            status, payment_method, proof_image, notes)
         VALUES (?, ?, 'deposit', ?, ?, ?, 'pending', ?, ?, 'Deposit request')`,
        [
          userId,
          generateTransactionNumber('DEP'),
          amount,
          currentBalance,
          currentBalance,
          method,
          proofImage
        ]
      );

      return result.insertId;
    });
  }

  /**
   * Create withdrawal request.
   *
   * Funds move from balance to frozen_balance immediately so they cannot be
   * spent twice while the request is pending.
   */
  static async createWithdrawal(userId, amount, method, accountDetails) {
    return await transaction(async (conn) => {
      // Lock the wallet row so two concurrent requests cannot both pass the check
      const [wallet] = await conn.execute(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [userId]
      );

      if (!wallet[0]) {
        throw new Error('Wallet not found');
      }

      const balance = parseFloat(wallet[0].balance);

      if (balance < amount) {
        throw new Error('Insufficient balance');
      }

      const [result] = await conn.execute(
        `INSERT INTO transactions
           (user_id, transaction_number, type, amount, balance_before, balance_after,
            status, payment_method, account_details, notes)
         VALUES (?, ?, 'withdraw', ?, ?, ?, 'pending', ?, ?, 'Withdrawal request')`,
        [
          userId,
          generateTransactionNumber('WDR'),
          amount,
          balance,
          balance - amount,
          method,
          JSON.stringify(accountDetails)
        ]
      );

      // Freeze withdrawal amount
      await conn.execute(
        'UPDATE wallets SET balance = balance - ?, frozen_balance = frozen_balance + ? WHERE user_id = ?',
        [amount, amount, userId]
      );

      return result.insertId;
    });
  }

  /**
   * Approve deposit (admin)
   */
  static async approveDeposit(transactionId, adminId) {
    return await transaction(async (conn) => {
      // Get transaction
      const [txn] = await conn.execute(
        'SELECT * FROM transactions WHERE id = ? AND type = "deposit" FOR UPDATE',
        [transactionId]
      );

      if (!txn[0]) {
        throw new Error('Transaction not found');
      }

      const txnData = txn[0];

      if (txnData.status !== 'pending') {
        throw new Error('Transaction already processed');
      }

      // Lock the wallet and read the true pre-credit balance
      const [wallet] = await conn.execute(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [txnData.user_id]
      );

      if (!wallet[0]) {
        throw new Error('Wallet not found');
      }

      const balanceBefore = parseFloat(wallet[0].balance);
      const amount = parseFloat(txnData.amount);
      const balanceAfter = balanceBefore + amount;

      // Credit the wallet
      await conn.execute(
        'UPDATE wallets SET balance = balance + ?, total_deposited = total_deposited + ? WHERE user_id = ?',
        [amount, amount, txnData.user_id]
      );

      // Record the audit trail on the transaction itself
      await conn.execute(
        `UPDATE transactions
         SET status = 'completed', balance_before = ?, balance_after = ?,
             processed_by = ?, processed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [balanceBefore, balanceAfter, adminId, transactionId]
      );

      // Let the user know their funds landed
      await conn.execute(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES (?, 'Deposit approved', ?, 'success')`,
        [
          txnData.user_id,
          `Your deposit of ${amount.toFixed(2)} USDT has been approved and added to your balance.`
        ]
      );

      return true;
    });
  }

  /**
   * Approve withdrawal (admin)
   */
  static async approveWithdrawal(transactionId, adminId) {
    return await transaction(async (conn) => {
      // Get transaction
      const [txn] = await conn.execute(
        'SELECT * FROM transactions WHERE id = ? AND type = "withdraw" FOR UPDATE',
        [transactionId]
      );

      if (!txn[0]) {
        throw new Error('Transaction not found');
      }

      const txnData = txn[0];

      if (txnData.status !== 'pending') {
        throw new Error('Transaction already processed');
      }

      const amount = parseFloat(txnData.amount);

      // Unfreeze and subtract from wallet. The balance itself was already
      // reduced when the request was created, so only frozen_balance moves.
      await conn.execute(
        'UPDATE wallets SET frozen_balance = frozen_balance - ?, total_withdrawn = total_withdrawn + ? WHERE user_id = ?',
        [amount, amount, txnData.user_id]
      );

      await conn.execute(
        `UPDATE transactions
         SET status = 'completed', processed_by = ?, processed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [adminId, transactionId]
      );

      await conn.execute(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES (?, 'Withdrawal approved', ?, 'success')`,
        [
          txnData.user_id,
          `Your withdrawal of ${amount.toFixed(2)} USDT has been approved and sent.`
        ]
      );

      return true;
    });
  }

  /**
   * Reject transaction (admin)
   */
  static async reject(transactionId, adminId, reason) {
    return await transaction(async (conn) => {
      // Get transaction
      const [txn] = await conn.execute(
        'SELECT * FROM transactions WHERE id = ? FOR UPDATE',
        [transactionId]
      );

      if (!txn[0]) {
        throw new Error('Transaction not found');
      }

      const txnData = txn[0];

      if (txnData.status !== 'pending') {
        throw new Error('Transaction already processed');
      }

      const amount = parseFloat(txnData.amount);

      await conn.execute(
        `UPDATE transactions
         SET status = 'rejected', processed_by = ?, processed_at = CURRENT_TIMESTAMP, admin_notes = ?
         WHERE id = ?`,
        [adminId, reason || null, transactionId]
      );

      // A rejected withdrawal must return the frozen funds to spendable balance.
      // A rejected deposit never credited anything, so there is nothing to undo.
      if (txnData.type === 'withdraw') {
        await conn.execute(
          'UPDATE wallets SET balance = balance + ?, frozen_balance = frozen_balance - ? WHERE user_id = ?',
          [amount, amount, txnData.user_id]
        );
      }

      await conn.execute(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES (?, ?, ?, 'error')`,
        [
          txnData.user_id,
          txnData.type === 'withdraw' ? 'Withdrawal rejected' : 'Deposit rejected',
          reason
            ? `Your ${txnData.type} of ${amount.toFixed(2)} USDT was rejected: ${reason}`
            : `Your ${txnData.type} of ${amount.toFixed(2)} USDT was rejected.`
        ]
      );

      return true;
    });
  }

  /**
   * Get user transactions
   */
  static async getUserTransactions(userId, filters = {}) {
    let whereConditions = ['user_id = ?'];
    let params = [userId];

    if (filters.type) {
      whereConditions.push('type = ?');
      params.push(filters.type);
    }

    if (filters.status) {
      whereConditions.push('status = ?');
      params.push(filters.status);
    }

    const whereClause = whereConditions.join(' AND ');

    const transactions = await query(
      `SELECT * FROM transactions 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT 100`,
      params
    );

    return transactions;
  }

  /**
   * Get transaction by ID
   */
  static async getById(transactionId, userId = null) {
    // Columns must be table-qualified: three tables are joined here and all of
    // them have `id` and `user_id`, so a bare `id = ?` raises
    // ER_NON_UNIQ_ERROR. That made every admin approve/reject fail with a 500.
    const conditions = userId ? 't.id = ? AND t.user_id = ?' : 't.id = ?';
    const params = userId ? [transactionId, userId] : [transactionId];

    const results = await query(
      `SELECT t.*, u.username, a.username as processed_by_username
       FROM transactions t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN users a ON t.processed_by = a.id
       WHERE ${conditions}`,
      params
    );

    return results[0] || null;
  }

  /**
   * Get all transactions (admin)
   */
  static async getAll(page = 1, limit = 50, filters = {}) {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    let params = [];

    if (filters.type) {
      whereConditions.push('t.type = ?');
      params.push(filters.type);
    }

    if (filters.status) {
      whereConditions.push('t.status = ?');
      params.push(filters.status);
    }

    if (filters.userId) {
      whereConditions.push('t.user_id = ?');
      params.push(filters.userId);
    }

    // Lets the admin UI fetch one specific transaction for its review modal.
    // Without this the filter was silently ignored and the modal displayed the
    // newest transaction instead of the one the admin clicked.
    if (filters.transactionId) {
      whereConditions.push('t.id = ?');
      params.push(filters.transactionId);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const transactions = await query(
      `SELECT t.*, u.username, u.email
       FROM transactions t
       LEFT JOIN users u ON t.user_id = u.id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total }] = await query(
      `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
      params
    );

    return {
      transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get transaction statistics
   */
  static async getStats(userId = null) {
    const userCondition = userId ? 'WHERE user_id = ?' : '';
    const params = userId ? [userId] : [];

    const [stats] = await query(`
      SELECT 
        SUM(CASE WHEN type = 'deposit' AND status = 'completed' THEN amount ELSE 0 END) as total_deposits,
        SUM(CASE WHEN type = 'withdraw' AND status = 'completed' THEN amount ELSE 0 END) as total_withdrawals,
        SUM(CASE WHEN type = 'commission' AND status = 'completed' THEN amount ELSE 0 END) as total_commissions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount
      FROM transactions
      ${userCondition}
    `, params);

    return stats;
  }
}

module.exports = Transaction;
