const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getMarkets,
  getMarketById,
  getProductById
} = require('../controllers/marketController');
const { validateIdParam } = require('../middleware/validation');
const { apiLimiter } = require('../middleware/rateLimiter');

// Apply general rate limiting
router.use(apiLimiter);

// @route   GET /api/market
// @desc    Get all markets
// @access  Private
router.get('/', protect, getMarkets);

// @route   GET /api/markets/product/:id
// @desc    Get product by ID
// @access  Private
// NOTE: must be declared BEFORE '/:id', otherwise "product" is captured as :id.
router.get('/product/:id', protect, validateIdParam, getProductById);

// @route   GET /api/markets/:id
// @desc    Get market by ID with products
// @access  Private
router.get('/:id', protect, validateIdParam, getMarketById);

module.exports = router;
