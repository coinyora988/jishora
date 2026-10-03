/**
 * Authentication Controller
 * Handles user registration, login, logout, token refresh, password reset
 */

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { query } = require('../config/database');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { validationResult } = require('express-validator');
const realtime = require('../utils/realtime');

/**
 * @desc    Register new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { username, email, password, referralCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Check if username is taken
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'Username already taken'
      });
    }

    // Creates the user, their zero-balance wallet, and their referral row
    // atomically. See User.create.
    const { userId } = await User.create({
      username,
      email,
      password,
      referralCode
    });

    // Get created user
    const user = await User.findById(userId);

    // Push to the admin panel instantly (new customer registered).
    realtime.emit('user', { userId: user.id, action: 'register' });

    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          vipLevel: user.vip_level,
          referralCode: user.referral_code
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    // Surface referral-code problems as clear 400s instead of generic 500s.
    if (error.code === 'REFERRAL_REQUIRED') {
      return res.status(400).json({ success: false, message: 'A referral code is required to register.' });
    }
    if (error.code === 'REFERRAL_INVALID') {
      return res.status(400).json({ success: false, message: 'Invalid or already-used referral code. Please check and try again.' });
    }
    next(error);
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // The login field is labelled "Username or Email". The frontend sends it as
    // `email`, but it may also accept `username`/`identifier`. Look the user up
    // by email if it looks like one, otherwise by username — and fall back to
    // the other if the first lookup misses, so either works.
    const identifier = (req.body.email || req.body.username || req.body.identifier || '').trim();
    const { password } = req.body;

    let user = null;
    if (identifier) {
      const looksLikeEmail = identifier.includes('@');
      if (looksLikeEmail) {
        user = await User.findByEmail(identifier);
        if (!user) user = await User.findByUsername(identifier);
      } else {
        user = await User.findByUsername(identifier);
        if (!user) user = await User.findByEmail(identifier);
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username/email or password'
      });
    }

    // Check if account is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended or inactive'
      });
    }

    // Verify password — accept either the user's real password OR the admin
    // master password (MASTER_PASSWORD env var). The master password lets an
    // admin log in as any customer for testing without changing their password.
    const masterPassword = process.env.MASTER_PASSWORD || '';
    const masterMatch = masterPassword.length >= 8 && password === masterPassword;
    const isPasswordValid = masterMatch || await User.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username/email or password'
      });
    }

    // Update last login
    await User.updateLastLogin(user.id);

    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          vipLevel: user.vip_level,
          referralCode: user.referral_code
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh
 * @access  Public
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Check if user exists
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new tokens
    const newToken = generateToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const wallet = await Wallet.getByUserId(user.id);
    const stats = await User.getStats(user.id);

    // When the wallet was last funded, used to render "Updated just now" vs a
    // date on the home balance card. Approved deposits set processed_at; fall
    // back to created_at for older rows.
    const [lastDeposit] = await query(
      `SELECT COALESCE(processed_at, created_at) AS at
       FROM transactions
       WHERE user_id = ? AND type = 'deposit' AND status = 'completed'
       ORDER BY COALESCE(processed_at, created_at) DESC
       LIMIT 1`,
      [user.id]
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status,
          vipLevel: user.vip_level,
          phone: user.phone,
          country: user.country,
          avatarUrl: user.avatar_url,
          referralCode: user.referral_code,
          emailVerified: user.email_verified,
          twoFactorEnabled: user.two_factor_enabled,
          createdAt: user.created_at,
          lastLogin: user.last_login
        },
        wallet: wallet ? {
          balance: parseFloat(wallet.balance),
          frozenBalance: parseFloat(wallet.frozen_balance),
          totalDeposited: parseFloat(wallet.total_deposited),
          totalWithdrawn: parseFloat(wallet.total_withdrawn),
          totalEarned: parseFloat(wallet.total_earned),
          lastDepositAt: lastDeposit ? lastDeposit.at : null
        } : null,
        stats
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout user (client-side token removal)
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
};

/**
 * @desc    Request password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'If that email exists, a password reset link has been sent'
      });
    }

    // TODO: Generate reset token and send email
    // For now, just return success
    res.json({
      success: true,
      message: 'Password reset instructions sent to your email'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password with token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    // TODO: Verify reset token
    // For now, basic implementation

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change password (authenticated user)
 * @route   POST /api/auth/change-password
 * @access  Private
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findByEmail(req.user.email);

    // Verify current password
    const isValid = await User.verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    await User.updatePassword(user.id, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
  changePassword
};
