/**
 * Market Controller
 * Handles marketplace operations
 */

const Market = require('../models/Market');
const Wallet = require('../models/Wallet');

/**
 * @desc    Get all markets
 * @route   GET /api/market
 * @access  Private
 */
const getMarkets = async (req, res, next) => {
  try {
    const markets = await Market.getAll(req.query);

    res.json({
      success: true,
      data: markets
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get market by ID with products
 * @route   GET /api/market/:id
 * @access  Private
 */
const getMarketById = async (req, res, next) => {
  try {
    const market = await Market.getById(req.params.id);

    if (!market) {
      return res.status(404).json({
        success: false,
        message: 'Market not found'
      });
    }

    // Get user's wallet balance
    const wallet = await Wallet.getByUserId(req.user.id);
    const userBalance = wallet ? parseFloat(wallet.balance) : 0;

    // Products available in this market.
    const products = await Market.getProducts(req.params.id);

    res.json({
      success: true,
      data: {
        market,
        products,
        userBalance
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get product by ID
 * @route   GET /api/market/product/:id
 * @access  Private
 */
const getProductById = async (req, res, next) => {
  try {
    const product = await Market.getProductById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user meets balance requirement
    const wallet = await Wallet.getByUserId(req.user.id);
    const userBalance = wallet ? parseFloat(wallet.balance) : 0;

    // Eligibility is checked against the product's market band at grab time.
    // Here we just confirm the user could afford the order amount.
    const meetsRequirement = userBalance >= parseFloat(product.price);

    res.json({
      success: true,
      data: {
        product,
        userBalance,
        meetsRequirement
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMarkets,
  getMarketById,
  getProductById
};
