/**
 * Transaction Controller
 */

const Transaction = require('../models/Transaction');

const getTransactions = async (req, res, next) => {
  try {
    const transactions = await Transaction.getUserTransactions(req.user.id, req.query);

    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    next(error);
  }
};

const getTransactionById = async (req, res, next) => {
  try {
    const transaction = await Transaction.getById(req.params.id, req.user.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    next(error);
  }
};

const getTransactionStats = async (req, res, next) => {
  try {
    const stats = await Transaction.getStats(req.user.id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTransactions,
  getTransactionById,
  getTransactionStats
};
