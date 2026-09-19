/**
 * Authentication Routes
 */

const express = require('express');
const router = express.Router();
const {
  register,
  login,
  refreshToken,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
  changePassword
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const {
  validateRegister,
  validateLogin,
  validatePasswordReset,
  validatePasswordChange
} = require('../middleware/validation');
const {
  authLimiter,
  sensitiveOperationsLimiter
} = require('../middleware/rateLimiter');

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
// No rate limit on registration: unlimited new accounts can be created. (Login
// keeps authLimiter to protect against password brute-forcing.)
router.post('/register', validateRegister, register);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authLimiter, validateLogin, login);

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', refreshToken);

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', sensitiveOperationsLimiter, validatePasswordReset, forgotPassword);

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', sensitiveOperationsLimiter, resetPassword);

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', protect, getMe);

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', protect, logout);

// @route   POST /api/auth/change-password
// @desc    Change password (authenticated user)
// @access  Private
router.post('/change-password', protect, sensitiveOperationsLimiter, validatePasswordChange, changePassword);

module.exports = router;
