/**
 * Wallet Controller
 */

const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { query } = require('../config/database');
const realtime = require('../utils/realtime');

// A customer must complete a full set of orders before withdrawing.
const ORDERS_REQUIRED_FOR_WITHDRAWAL = 25;

/**
 * How many orders the user has completed since their last withdrawal request,
 * and how many remain before they can withdraw again. Each withdrawal requires
 * a fresh set of 25 completed orders.
 */
async function getWithdrawalEligibility(userId) {
  // The most recent withdrawal request marks the start of the current cycle.
  const [lastWd] = await query(
    `SELECT created_at FROM transactions
     WHERE user_id = ? AND type = 'withdraw'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  let completed;
  if (lastWd) {
    const [row] = await query(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE user_id = ? AND status = 'completed' AND completion_time > ?`,
      [userId, lastWd.created_at]
    );
    completed = Number(row.n) || 0;
  } else {
    const [row] = await query(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE user_id = ? AND status = 'completed'`,
      [userId]
    );
    completed = Number(row.n) || 0;
  }

  const remaining = Math.max(0, ORDERS_REQUIRED_FOR_WITHDRAWAL - completed);

  // Admin-applied per-user restriction takes priority: if set, the customer is
  // blocked regardless of order progress, and we surface the admin's message.
  const [u] = await query(
    'SELECT withdrawal_locked, withdrawal_lock_reason FROM users WHERE id = ?',
    [userId]
  );
  const restricted = !!(u && Number(u.withdrawal_locked) === 1);
  const restrictionMessage = restricted
    ? (u.withdrawal_lock_reason || 'Withdrawals are temporarily restricted. Please contact customer service.')
    : null;

  return {
    completed,
    remaining,
    required: ORDERS_REQUIRED_FOR_WITHDRAWAL,
    // "eligible" now means BOTH: orders complete AND not admin-restricted.
    eligible: remaining === 0 && !restricted,
    restricted,
    restrictionMessage
  };
}

const getWallet = async (req, res, next) => {
  try {
    const wallet = await Wallet.getByUserId(req.user.id);
    const stats = await Wallet.getStats(req.user.id);
    const withdrawalEligibility = await getWithdrawalEligibility(req.user.id);

    const data = Object.assign({}, stats || wallet, { withdrawalEligibility });

    res.json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Withdrawal eligibility (orders completed / remaining this cycle)
 * @route GET /api/wallet/withdrawal-eligibility
 */
const getWithdrawalStatus = async (req, res, next) => {
  try {
    const elig = await getWithdrawalEligibility(req.user.id);
    res.json({ success: true, data: elig });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Active deposit networks the admin has configured. Powers the deposit
 *        page: each entry is a network the customer can deposit to, with its
 *        address (and QR built from it on the frontend).
 * @route GET /api/wallet/deposit-networks
 * @access Private
 */
const getDepositNetworks = async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, name, currency, network, address
       FROM payment_wallets
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const createDeposit = async (req, res, next) => {
  try {
    const { amount, method, proofImage } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    const transactionId = await Transaction.createDeposit(req.user.id, amount, method, proofImage);

    // Push to the admin panel instantly (new pending deposit).
    realtime.emit('deposit', { userId: req.user.id, transactionId, amount });

    res.status(201).json({
      success: true,
      message: 'Deposit request submitted. Please wait for admin approval.',
      data: { transactionId }
    });
  } catch (error) {
    next(error);
  }
};

const createWithdrawal = async (req, res, next) => {
  try {
    const { amount, method, accountDetails } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    const elig = await getWithdrawalEligibility(req.user.id);

    // Admin restriction takes priority — show the admin's custom message.
    if (elig.restricted) {
      return res.status(403).json({
        success: false,
        code: 'WITHDRAWAL_RESTRICTED',
        message: elig.restrictionMessage,
        data: elig
      });
    }

    // Otherwise withdrawal is locked until the full set of orders is complete.
    if (!elig.eligible) {
      return res.status(403).json({
        success: false,
        code: 'TASKS_INCOMPLETE',
        message: `You have ${elig.remaining} ${elig.remaining === 1 ? 'order' : 'orders'} remaining. Complete all ${elig.required} orders before withdrawing.`,
        data: elig
      });
    }

    const transactionId = await Transaction.createWithdrawal(req.user.id, amount, method, accountDetails);

    // Push to the admin panel instantly (new pending withdrawal).
    realtime.emit('withdrawal', { userId: req.user.id, transactionId, amount });

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: { transactionId }
    });
  } catch (error) {
    if (error.message === 'Insufficient balance') {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance for withdrawal'
      });
    }
    next(error);
  }
};

/**
 * @desc  Get the user's saved withdrawal wallet address (network + address).
 * @route GET /api/wallet/address
 * @access Private
 */
const getWalletAddress = async (req, res, next) => {
  try {
    const [row] = await query(
      'SELECT wallet_address, wallet_network FROM wallets WHERE user_id = ?',
      [req.user.id]
    );
    if (!row || !row.wallet_address) {
      return res.json({ success: true, data: null });
    }
    res.json({
      success: true,
      data: { address: row.wallet_address, network: row.wallet_network || 'trc20' }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Save / update the user's withdrawal wallet address.
 * @route PUT /api/wallet/address
 * @access Private
 * body: { address, network }
 */
const saveWalletAddress = async (req, res, next) => {
  try {
    const address = (req.body.address || '').trim();
    const network = (req.body.network || 'trc20').trim().toLowerCase();

    if (!address || address.length < 20) {
      return res.status(400).json({ success: false, message: 'Invalid wallet address' });
    }

    const ALLOWED_NETWORKS = ['trc20', 'bep20', 'erc20', 'aptos'];
    if (!ALLOWED_NETWORKS.includes(network)) {
      return res.status(400).json({ success: false, message: 'Invalid network' });
    }

    // Check wallets table has wallet_network column; if not, only update address.
    const cols = await query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallets' AND COLUMN_NAME = 'wallet_network'`
    );
    if (cols.length) {
      await query(
        'UPDATE wallets SET wallet_address = ?, wallet_network = ? WHERE user_id = ?',
        [address, network, req.user.id]
      );
    } else {
      await query(
        'UPDATE wallets SET wallet_address = ? WHERE user_id = ?',
        [address, req.user.id]
      );
    }

    res.json({ success: true, message: 'Wallet address saved', data: { address, network } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getWallet,
  createDeposit,
  createWithdrawal,
  getWithdrawalStatus,
  getDepositNetworks,
  getWalletAddress,
  saveWalletAddress
};
