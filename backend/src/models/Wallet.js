/**
 * Wallet Model
 * Handles wallet-related database operations
 */

const { query, transaction } = require('../config/database');

class Wallet {
  /**
   * Create wallet for new user
   */
  static async create(userId) {
    const result = await query(
      'INSERT INTO wallets (user_id, balance) VALUES (?, 0.0000)',
      [userId]
    );
    return result.insertId;
  }

  /**
   * Get wallet by user ID
   */
  static async getByUserId(userId) {
    const results = await query(
      'SELECT * FROM wallets WHERE user_id = ?',
      [userId]
    );
    return results[0] || null;
  }

  /**
   * Update balance
   */
  static async updateBalance(userId, amount, type = 'add') {
    const wallet = await this.getByUserId(userId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const newBalance = type === 'add' 
      ? parseFloat(wallet.balance) + parseFloat(amount)
      : parseFloat(wallet.balance) - parseFloat(amount);

    if (newBalance < 0) {
      throw new Error('Insufficient balance');
    }

    await query(
      'UPDATE wallets SET balance = ? WHERE user_id = ?',
      [newBalance, userId]
    );

    return newBalance;
  }

  /**
   * Freeze balance (for tasks)
   */
  static async freezeBalance(userId, amount) {
    return await transaction(async (conn) => {
      const [wallet] = await conn.execute(
        'SELECT balance, frozen_balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [userId]
      );

      if (!wallet[0]) {
        throw new Error('Wallet not found');
      }

      const currentBalance = parseFloat(wallet[0].balance);
      const currentFrozen = parseFloat(wallet[0].frozen_balance);

      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }

      const newBalance = currentBalance - amount;
      const newFrozen = currentFrozen + amount;

      await conn.execute(
        'UPDATE wallets SET balance = ?, frozen_balance = ? WHERE user_id = ?',
        [newBalance, newFrozen, userId]
      );

      return { balance: newBalance, frozen_balance: newFrozen };
    });
  }

  /**
   * Unfreeze balance (complete task)
   */
  static async unfreezeBalance(userId, amount, commission) {
    return await transaction(async (conn) => {
      const [wallet] = await conn.execute(
        'SELECT balance, frozen_balance, total_earned FROM wallets WHERE user_id = ? FOR UPDATE',
        [userId]
      );

      if (!wallet[0]) {
        throw new Error('Wallet not found');
      }

      const currentBalance = parseFloat(wallet[0].balance);
      const currentFrozen = parseFloat(wallet[0].frozen_balance);
      const currentEarned = parseFloat(wallet[0].total_earned);

      const newBalance = currentBalance + amount + commission;
      const newFrozen = currentFrozen - amount;
      const newEarned = currentEarned + commission;

      await conn.execute(
        'UPDATE wallets SET balance = ?, frozen_balance = ?, total_earned = ? WHERE user_id = ?',
        [newBalance, newFrozen, newEarned, userId]
      );

      return { balance: newBalance, frozen_balance: newFrozen, total_earned: newEarned };
    });
  }

  /**
   * Update deposit total
   */
  static async addDeposit(userId, amount) {
    await query(
      'UPDATE wallets SET total_deposited = total_deposited + ? WHERE user_id = ?',
      [amount, userId]
    );
  }

  /**
   * Update withdrawal total
   */
  static async addWithdrawal(userId, amount) {
    await query(
      'UPDATE wallets SET total_withdrawn = total_withdrawn + ? WHERE user_id = ?',
      [amount, userId]
    );
  }

  /**
   * Get wallet statistics
   */
  static async getStats(userId) {
    const wallet = await this.getByUserId(userId);
    if (!wallet) {
      return null;
    }

    const [pending] = await query(
      'SELECT COALESCE(SUM(amount), 0) as pending_withdrawal FROM transactions WHERE user_id = ? AND type = "withdraw" AND status = "pending"',
      [userId]
    );

    return {
      balance: parseFloat(wallet.balance),
      frozen_balance: parseFloat(wallet.frozen_balance),
      total_deposited: parseFloat(wallet.total_deposited),
      total_withdrawn: parseFloat(wallet.total_withdrawn),
      total_earned: parseFloat(wallet.total_earned),
      pending_withdrawal: parseFloat(pending.pending_withdrawal)
    };
  }
}

module.exports = Wallet;
