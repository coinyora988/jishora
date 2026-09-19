/**
 * Input Validation Middleware
 * Uses express-validator for comprehensive input validation and sanitization
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  
  next();
};

/**
 * Auth validation rules
 */
const validateRegister = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email too long'),
  
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores')
    .escape(),
  
  body('password')
    .isLength({ min: 4 }).withMessage('Password must be at least 4 characters'),
  
  body('referralCode')
    .trim()
    .notEmpty().withMessage('Referral code is required')
    .isLength({ max: 50 }).withMessage('Referral code too long')
    .escape(),
  
  handleValidationErrors
];

const validateLogin = [
  // The login identifier can be a username OR an email, so only require it to
  // be non-empty here (the controller resolves which one it is). Do NOT force
  // isEmail(), or logging in with a username would be rejected.
  body('email')
    .trim()
    .notEmpty().withMessage('Username or email is required'),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
  
  handleValidationErrors
];

const validatePasswordReset = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  
  handleValidationErrors
];

const validatePasswordChange = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  
  // Enforce the same strength rules the profile-edit UI shows, so a weak
  // password can't slip through if the client checks are bypassed.
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('New password must contain an uppercase letter')
    .matches(/[a-z]/).withMessage('New password must contain a lowercase letter')
    .matches(/[0-9]/).withMessage('New password must contain a number'),
  
  handleValidationErrors
];

/**
 * Transaction validation rules
 */
/**
 * Payment methods the deposit and withdrawal screens can actually submit.
 *
 * These must stay in sync with the network options in deposit.html and
 * withdraw.html, which send the uppercased network id (TRC20 / ERC20).
 * The previous list ('usdt', 'bank_transfer', 'crypto') matched nothing the UI
 * sends, so every deposit and withdrawal was rejected with a 400.
 */
const PAYMENT_METHODS = [
  'TRC20',
  'ERC20',
  'BEP20',
  'USDT-TRC20',
  'USDT-ERC20',
  'USDT-BEP20',
  'USDT',
  'BANK_TRANSFER',
  'CRYPTO'
];

const validateDeposit = [
  body('amount')
    .isFloat({ min: 0.01, max: 1000000 }).withMessage('Invalid deposit amount')
    .toFloat(),

  body('method')
    .trim()
    // Normalise before checking so 'trc20' and 'TRC20' are both accepted.
    .customSanitizer((value) => String(value || '').toUpperCase())
    .isIn(PAYMENT_METHODS).withMessage('Invalid deposit method'),

  // The controller reads `proofImage`, not `proof`. Validating the wrong field
  // meant the real one was never checked at all.
  body('proofImage')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Proof reference too long'),

  handleValidationErrors
];

const validateWithdrawal = [
  body('amount')
    .isFloat({ min: 0.01, max: 1000000 }).withMessage('Invalid withdrawal amount')
    .toFloat(),

  body('method')
    .trim()
    .customSanitizer((value) => String(value || '').toUpperCase())
    .isIn(PAYMENT_METHODS).withMessage('Invalid withdrawal method'),

  // The controller reads `accountDetails`, an object holding the payout target.
  // The old rule required a top-level `address`, which the client never sends.
  body('accountDetails')
    .isObject().withMessage('Account details are required'),

  body('accountDetails.address')
    .trim()
    .notEmpty().withMessage('Withdrawal address is required')
    .isLength({ max: 255 }).withMessage('Address too long'),

  handleValidationErrors
];

/**
 * Market validation rules
 */
const validateMarket = [
  body('name')
    .trim()
    .notEmpty().withMessage('Market name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .escape(),
  
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 500 }).withMessage('Description too long')
    .escape(),
  
  body('logo')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Logo URL too long'),
  
  body('status')
    .optional()
    .isIn(['active', 'inactive']).withMessage('Invalid status'),
  
  handleValidationErrors
];

const validateProduct = [
  body('name')
    .trim()
    .notEmpty().withMessage('Product name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .escape(),
  
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 1000 }).withMessage('Description too long')
    .escape(),
  
  body('dailyLimit')
    .isInt({ min: 1, max: 10000 }).withMessage('Invalid daily limit')
    .toInt(),
  
  body('dailyCommission')
    .isFloat({ min: 0, max: 100000 }).withMessage('Invalid daily commission')
    .toFloat(),
  
  body('balanceRequired')
    .isFloat({ min: 0, max: 10000000 }).withMessage('Invalid balance required')
    .toFloat(),
  
  body('taskCommission')
    .isFloat({ min: 0, max: 100000 }).withMessage('Invalid task commission')
    .toFloat(),
  
  body('vipLevel')
    .optional()
    .isInt({ min: 0, max: 3 }).withMessage('Invalid VIP level')
    .toInt(),
  
  handleValidationErrors
];

/**
 * Task validation rules
 */
const validateTaskGrab = [
  // Grab sends { productId } in the request body, not a URL param.
  body('productId')
    .isInt({ min: 1 }).withMessage('Invalid product ID')
    .toInt(),

  handleValidationErrors
];

const validateTaskComplete = [
  // The route param is ':id', not ':taskId'.
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid task ID')
    .toInt(),

  handleValidationErrors
];

/**
 * Notification validation rules
 */
const validateNotification = [
  body('type')
    .trim()
    .isIn(['announcement', 'info', 'success', 'warning', 'error']).withMessage('Invalid notification type')
    .escape(),
  
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters')
    .escape(),
  
  body('message')
    .trim()
    .notEmpty().withMessage('Message is required')
    .isLength({ min: 10, max: 500 }).withMessage('Message must be 10-500 characters')
    .escape(),
  
  handleValidationErrors
];

const validateTargetedNotification = [
  body('audience')
    .trim()
    .isIn(['all', 'active', 'vip', 'vip1', 'vip2', 'vip3', 'inactive']).withMessage('Invalid audience type')
    .escape(),
  
  ...validateNotification
];

/**
 * Admin validation rules
 */
const validateUserUpdate = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid user ID')
    .toInt(),
  
  body('status')
    .optional()
    .isIn(['active', 'suspended', 'inactive']).withMessage('Invalid status'),
  
  body('isVip')
    .optional()
    .isBoolean().withMessage('isVip must be boolean')
    .toBoolean(),
  
  body('vipLevel')
    .optional()
    .isInt({ min: 0, max: 3 }).withMessage('Invalid VIP level')
    .toInt(),
  
  handleValidationErrors
];

const validateTransactionAction = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid transaction ID')
    .toInt(),
  
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Reason too long')
    .escape(),
  
  handleValidationErrors
];

/**
 * Query parameter validation
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 10000 }).withMessage('Invalid page number')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Invalid limit (max 100)')
    .toInt(),
  
  handleValidationErrors
];

const validateIdParam = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid ID')
    .toInt(),
  
  handleValidationErrors
];

module.exports = {
  // Auth
  validateRegister,
  validateLogin,
  validatePasswordReset,
  validatePasswordChange,
  
  // Transactions
  validateDeposit,
  validateWithdrawal,
  
  // Markets & Products
  validateMarket,
  validateProduct,
  
  // Tasks
  validateTaskGrab,
  validateTaskComplete,
  
  // Notifications
  validateNotification,
  validateTargetedNotification,
  
  // Admin
  validateUserUpdate,
  validateTransactionAction,
  
  // Common
  validatePagination,
  validateIdParam,
  
  // Generic handler
  handleValidationErrors
};
