const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getTransactions,
  getTransactionById,
  getTransactionStats
} = require('../controllers/transactionController');
const {
  validateIdParam,
  validatePagination
} = require('../middleware/validation');
const { apiLimiter } = require('../middleware/rateLimiter');

// Apply general rate limiting to all transaction routes
router.use(apiLimiter);

// @route   GET /api/transaction
// @desc    Get user transactions
// @access  Private
router.get('/', protect, validatePagination, getTransactions);

// @route   GET /api/transaction/stats
// @desc    Get transaction statistics
// @access  Private
router.get('/stats', protect, getTransactionStats);

// @route   GET /api/transaction/:id
// @desc    Get transaction by ID
// @access  Private
router.get('/:id', protect, validateIdParam, getTransactionById);

module.exports = router;
