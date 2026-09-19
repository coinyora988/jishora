const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getWallet,
  createDeposit,
  createWithdrawal,
  getWithdrawalStatus,
  getDepositNetworks
} = require('../controllers/walletController');
const {
  validateDeposit,
  validateWithdrawal
} = require('../middleware/validation');
const { transactionLimiter, apiLimiter } = require('../middleware/rateLimiter');

// @route   GET /api/wallet
// @desc    Get wallet balance and stats
// @access  Private
router.get('/', protect, apiLimiter, getWallet);

// @route   GET /api/wallet/withdrawal-eligibility
// @desc    Orders completed / remaining before withdrawal is allowed
// @access  Private
router.get('/withdrawal-eligibility', protect, apiLimiter, getWithdrawalStatus);

// @route   GET /api/wallet/deposit-networks
// @desc    Active deposit networks configured by admin (network + address)
// @access  Private
router.get('/deposit-networks', protect, apiLimiter, getDepositNetworks);

// @route   POST /api/wallet/deposit
// @desc    Create deposit request
// @access  Private
router.post('/deposit', protect, transactionLimiter, validateDeposit, createDeposit);

// @route   POST /api/wallet/withdraw
// @desc    Create withdrawal request
// @access  Private
router.post('/withdraw', protect, transactionLimiter, validateWithdrawal, createWithdrawal);

module.exports = router;
