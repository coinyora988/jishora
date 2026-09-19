/**
 * Password Reset Utilities
 * Generate and verify password reset tokens
 */

const crypto = require('crypto');
const { query } = require('../config/database');

class PasswordReset {
  /**
   * Generate password reset token
   */
  static async generateResetToken(email) {
    // Generate random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Store in database
    await query(
      `INSERT INTO password_resets (email, token_hash, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE token_hash = ?, expires_at = ?`,
      [email, hashedToken, expiresAt, hashedToken, expiresAt]
    );

    return resetToken;
  }

  /**
   * Verify reset token
   */
  static async verifyResetToken(token) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const results = await query(
      `SELECT email FROM password_resets 
       WHERE token_hash = ? AND expires_at > NOW() AND used = FALSE`,
      [hashedToken]
    );

    return results.length > 0 ? results[0].email : null;
  }

  /**
   * Mark token as used
   */
  static async markTokenAsUsed(token) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    await query(
      'UPDATE password_resets SET used = TRUE WHERE token_hash = ?',
      [hashedToken]
    );
  }

  /**
   * Clean up expired tokens
   */
  static async cleanupExpiredTokens() {
    await query(
      'DELETE FROM password_resets WHERE expires_at < NOW() OR (used = TRUE AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY))'
    );
  }

  /**
   * Delete all tokens for an email
   */
  static async deleteTokensForEmail(email) {
    await query(
      'DELETE FROM password_resets WHERE email = ?',
      [email]
    );
  }
}

// Run cleanup every 6 hours
setInterval(() => {
  PasswordReset.cleanupExpiredTokens().catch(console.error);
}, 6 * 60 * 60 * 1000);

module.exports = PasswordReset;
