/**
 * Rate Limiting Middleware
 * Protects against brute force attacks and API abuse
 */

const rateLimit = require('express-rate-limit');

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force attacks on login/register
 */
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // 30 failed attempts per window (was 5 — too tight, blocked normal use)
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests (only count failed attempts)
  skipSuccessfulRequests: true
});

/**
 * Moderate rate limiter for sensitive operations
 * Used for password resets, email changes, etc.
 */
const sensitiveOperationsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: {
    success: false,
    message: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Standard rate limiter for general API endpoints
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    message: 'Too many requests from this IP. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Strict limiter for transaction operations
 * Prevents spam deposits/withdrawals
 */
const transactionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60, // 60 successful transactions per hour
  message: {
    success: false,
    message: 'Transaction limit exceeded. Please wait before making another transaction.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Rejected attempts (validation errors, insufficient balance) must not consume
  // the quota. Otherwise a user who mistypes an amount a few times gets locked
  // out of depositing for an hour.
  skipFailedRequests: true
});

/**
 * Limiter for admin notification broadcasts
 * Prevents notification spam
 */
const notificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 notifications per hour
  message: {
    success: false,
    message: 'Notification limit exceeded. Please wait before sending more notifications.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Very strict limiter for task operations
 * Prevents automated task grabbing/completion
 */
const taskLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  // Each completed order makes TWO calls (grab + complete), and users can
  // legitimately do a run of orders in a minute. 10 was far too low (only ~5
  // orders). 120 gives ~60 orders/min of headroom while still blocking scripted
  // abuse.
  max: 120,
  message: {
    success: false,
    message: 'You are performing tasks too quickly. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't count rejected calls (validation errors, insufficient balance) toward
  // the quota, so a few mistakes can't lock a user out.
  skipFailedRequests: true
});

/**
 * Admin operations limiter
 * Protects admin panel from abuse
 */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window (higher for admin operations)
  message: {
    success: false,
    message: 'Admin request limit exceeded. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * File upload limiter
 * Protects against upload spam
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 uploads per hour
  message: {
    success: false,
    message: 'Upload limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Create custom rate limiter with specific options
 */
const createLimiter = (options) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: {
      success: false,
      message: options.message || 'Too many requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    ...options
  });
};

module.exports = {
  authLimiter,
  sensitiveOperationsLimiter,
  apiLimiter,
  transactionLimiter,
  notificationLimiter,
  taskLimiter,
  adminLimiter,
  uploadLimiter,
  createLimiter
};
