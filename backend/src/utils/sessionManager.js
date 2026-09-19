/**
 * Session Manager
 * Track active sessions and manage user sessions
 */

const { query } = require('../config/database');

class SessionManager {
  /**
   * Create a new session record
   */
  static async createSession(userId, token, refreshToken, ipAddress, userAgent) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await query(
      `INSERT INTO user_sessions (user_id, token_hash, refresh_token_hash, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, this.hashToken(token), this.hashToken(refreshToken), ipAddress, userAgent, expiresAt]
    );
  }

  /**
   * Invalidate a specific session
   */
  static async invalidateSession(userId, token) {
    await query(
      'UPDATE user_sessions SET is_active = 0 WHERE user_id = ? AND token_hash = ?',
      [userId, this.hashToken(token)]
    );
  }

  /**
   * Invalidate all sessions for a user
   */
  static async invalidateAllSessions(userId) {
    await query(
      'UPDATE user_sessions SET is_active = 0 WHERE user_id = ?',
      [userId]
    );
  }

  /**
   * Get active sessions for a user
   */
  static async getActiveSessions(userId) {
    return await query(
      `SELECT id, ip_address, user_agent, created_at, last_active
       FROM user_sessions 
       WHERE user_id = ? AND is_active = 1 AND expires_at > NOW()
       ORDER BY last_active DESC`,
      [userId]
    );
  }

  /**
   * Update session activity
   */
  static async updateActivity(token) {
    await query(
      'UPDATE user_sessions SET last_active = NOW() WHERE token_hash = ? AND is_active = 1',
      [this.hashToken(token)]
    );
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions() {
    await query(
      'DELETE FROM user_sessions WHERE expires_at < NOW() OR (is_active = 0 AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY))'
    );
  }

  /**
   * Hash token for storage (simple hash for demo)
   */
  static hashToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

// Run cleanup every hour
setInterval(() => {
  SessionManager.cleanupExpiredSessions().catch(console.error);
}, 60 * 60 * 1000);

module.exports = SessionManager;
