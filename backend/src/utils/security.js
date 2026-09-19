/**
 * Security Utilities
 * Additional security helpers and sanitization functions
 */

const crypto = require('crypto');

/**
 * Sanitize user input to prevent XSS
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') {
    return input;
  }
  
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers like onclick=
    .trim();
};

/**
 * Sanitize object recursively
 */
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return sanitizeInput(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  
  return sanitized;
};

/**
 * Generate secure random token
 */
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash data using SHA256
 */
const hashData = (data) => {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
};

/**
 * Validate and sanitize email
 */
const sanitizeEmail = (email) => {
  if (typeof email !== 'string') {
    return null;
  }
  
  const sanitized = email.toLowerCase().trim();
  
  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(sanitized)) {
    return null;
  }
  
  return sanitized;
};

/**
 * Validate username (alphanumeric and underscore only)
 */
const sanitizeUsername = (username) => {
  if (typeof username !== 'string') {
    return null;
  }
  
  const sanitized = username.trim();
  
  // Only allow alphanumeric and underscore
  const usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
  
  if (!usernameRegex.test(sanitized)) {
    return null;
  }
  
  return sanitized;
};

/**
 * Mask sensitive data for logging
 */
const maskSensitiveData = (data) => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sensitiveFields = [
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'apiKey',
    'privateKey',
    'cardNumber',
    'cvv',
    'ssn'
  ];
  
  const masked = { ...data };
  
  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = '***REDACTED***';
    }
  }
  
  return masked;
};

/**
 * Check if request is from suspicious IP patterns
 * (This is a basic implementation - in production, use more sophisticated methods)
 */
const isSuspiciousIP = (ip) => {
  // List of suspicious patterns (example)
  const suspiciousPatterns = [
    /^0\.0\.0\.0$/,
    /^127\.0\.0\.1$/,
    /^169\.254\./,
    /^224\./,
    /^240\./
  ];
  
  return suspiciousPatterns.some(pattern => pattern.test(ip));
};

/**
 * Validate request origin
 */
const validateOrigin = (origin, allowedOrigins) => {
  if (!origin) {
    return false;
  }
  
  return allowedOrigins.some(allowed => {
    if (allowed === '*') {
      return true;
    }
    
    if (allowed instanceof RegExp) {
      return allowed.test(origin);
    }
    
    return origin === allowed;
  });
};

/**
 * Generate CSRF token
 */
const generateCSRFToken = () => {
  return generateSecureToken(32);
};

/**
 * Verify CSRF token
 */
const verifyCSRFToken = (token, sessionToken) => {
  if (!token || !sessionToken) {
    return false;
  }
  
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(sessionToken)
  );
};

/**
 * Constant-time string comparison to prevent timing attacks
 */
const timingSafeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  if (a.length !== b.length) {
    return false;
  }
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(a),
      Buffer.from(b)
    );
  } catch (error) {
    return false;
  }
};

/**
 * Validate amount (prevent negative or extremely large values)
 */
const validateAmount = (amount) => {
  const num = parseFloat(amount);
  
  if (isNaN(num)) {
    return { valid: false, error: 'Invalid amount' };
  }
  
  if (num < 0) {
    return { valid: false, error: 'Amount cannot be negative' };
  }
  
  if (num > 1000000) {
    return { valid: false, error: 'Amount exceeds maximum limit' };
  }
  
  if (!/^\d+(\.\d{1,2})?$/.test(amount.toString())) {
    return { valid: false, error: 'Amount can have maximum 2 decimal places' };
  }
  
  return { valid: true, amount: num };
};

/**
 * Check password strength
 */
const checkPasswordStrength = (password) => {
  const minLength = 6;
  const hasNumber = /\d/.test(password);
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (password.length < minLength) {
    return { strong: false, message: 'Password must be at least 6 characters' };
  }
  
  if (!hasNumber) {
    return { strong: false, message: 'Password must contain at least one number' };
  }
  
  if (!hasLetter) {
    return { strong: false, message: 'Password must contain at least one letter' };
  }
  
  let strength = 'weak';
  if (password.length >= 8 && hasNumber && hasLetter) {
    strength = 'medium';
  }
  if (password.length >= 10 && hasNumber && hasLetter && hasSpecial) {
    strength = 'strong';
  }
  
  return { strong: true, strength };
};

/**
 * Prevent SQL injection by escaping special characters
 * Note: This is a backup - always use parameterized queries
 */
const escapeSQLInput = (input) => {
  if (typeof input !== 'string') {
    return input;
  }
  
  return input
    .replace(/'/g, "''")
    .replace(/\\/g, '\\\\')
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
};

module.exports = {
  sanitizeInput,
  sanitizeObject,
  generateSecureToken,
  hashData,
  sanitizeEmail,
  sanitizeUsername,
  maskSensitiveData,
  isSuspiciousIP,
  validateOrigin,
  generateCSRFToken,
  verifyCSRFToken,
  timingSafeCompare,
  validateAmount,
  checkPasswordStrength,
  escapeSQLInput
};
