/**
 * Notification Model
 * Handles user notifications
 */

const { query } = require('../config/database');

class Notification {
  /**
   * Create notification
   */
  static async create(userId, title, message, type = 'info') {
    const result = await query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, ?, ?, ?)`,
      [userId, title, message, type]
    );

    return result.insertId;
  }

  /**
   * Create broadcast notification (all users)
   */
  static async createBroadcast(title, message, type = 'announcement') {
    // Get all active users
    const users = await query(
      'SELECT id FROM users WHERE status = "active"'
    );

    const values = users.map(user => [user.id, title, message, type]);
    
    if (values.length === 0) {
      return 0;
    }

    await query(
      `INSERT INTO notifications (user_id, title, message, type) VALUES ?`,
      [values]
    );

    return values.length;
  }

  /**
   * Get user notifications
   */
  static async getUserNotifications(userId, limit = 50) {
    const notifications = await query(
      `SELECT * FROM notifications 
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );

    return notifications;
  }

  /**
   * Get unread count
   */
  static async getUnreadCount(userId) {
    const [result] = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );

    return result.count;
  }

  /**
   * Mark as read
   */
  static async markAsRead(notificationId, userId) {
    await query(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    return true;
  }

  /**
   * Mark all as read
   */
  static async markAllAsRead(userId) {
    await query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );

    return true;
  }

  /**
   * Delete notification
   */
  static async delete(notificationId, userId) {
    await query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    return true;
  }

  /**
   * Delete all notifications
   */
  static async deleteAll(userId) {
    await query(
      'DELETE FROM notifications WHERE user_id = ?',
      [userId]
    );

    return true;
  }

  /**
   * Clean up old notifications (older than 30 days)
   */
  static async cleanup() {
    await query(
      'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );
  }

  /**
   * Broadcast to all users
   */
  static async broadcastToAll(type, title, message) {
    const users = await query(
      'SELECT id FROM users WHERE status = "active"'
    );

    if (users.length === 0) {
      return { sentCount: 0 };
    }

    const values = users.map(user => [user.id, title, message, type]);
    
    await query(
      `INSERT INTO notifications (user_id, title, message, type) VALUES ?`,
      [values]
    );

    return { sentCount: values.length };
  }

  /**
   * Send targeted notification based on audience filter
   */
  static async sendTargeted(audience, type, title, message) {
    let userQuery = 'SELECT id FROM users WHERE status = "active"';
    const params = [];

    // Build query based on audience type
    switch (audience) {
      case 'vip':
        userQuery += ' AND is_vip = TRUE';
        break;
      case 'vip1':
        userQuery += ' AND vip_level = 1';
        break;
      case 'vip2':
        userQuery += ' AND vip_level = 2';
        break;
      case 'vip3':
        userQuery += ' AND vip_level = 3';
        break;
      case 'active':
        userQuery += ' AND last_login > DATE_SUB(NOW(), INTERVAL 7 DAY)';
        break;
      case 'inactive':
        userQuery += ' AND last_login < DATE_SUB(NOW(), INTERVAL 30 DAY)';
        break;
      case 'all':
      default:
        // No additional filter
        break;
    }

    const users = await query(userQuery, params);

    if (users.length === 0) {
      return { sentCount: 0 };
    }

    const values = users.map(user => [user.id, title, message, type]);
    
    await query(
      `INSERT INTO notifications (user_id, title, message, type) VALUES ?`,
      [values]
    );

    return { sentCount: values.length };
  }

  /**
   * Get notification statistics for admin
   */
  static async getStatistics() {
    const [totalSent] = await query(
      'SELECT COUNT(*) as count FROM notifications'
    );

    const [totalRead] = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE is_read = TRUE'
    );

    const [totalUnread] = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE'
    );

    const openRate = totalSent.count > 0 
      ? Math.round((totalRead.count / totalSent.count) * 100) 
      : 0;

    return {
      totalSent: totalSent.count,
      totalRead: totalRead.count,
      totalUnread: totalUnread.count,
      openRate: openRate
    };
  }

  /**
   * Get all notifications with stats for admin
   */
  static async getAllWithStats(limit = 20, offset = 0, type = null) {
    let sql = `
      SELECT 
        n.id,
        n.type,
        n.title,
        n.message,
        n.created_at,
        COUNT(DISTINCT n.user_id) as recipients,
        COUNT(CASE WHEN n.is_read = TRUE THEN 1 END) as read_count,
        COUNT(*) as total_count,
        ROUND((COUNT(CASE WHEN n.is_read = TRUE THEN 1 END) / COUNT(*)) * 100) as read_rate
      FROM notifications n
    `;

    const params = [];

    if (type) {
      sql += ' WHERE n.type = ?';
      params.push(type);
    }

    sql += `
      GROUP BY n.title, n.message, n.type, DATE(n.created_at)
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const notifications = await query(sql, params);
    return notifications;
  }

  /**
   * Get total notification count for pagination
   */
  static async getTotalCount(type = null) {
    let sql = `
      SELECT COUNT(DISTINCT CONCAT(title, message, type, DATE(created_at))) as count
      FROM notifications
    `;

    const params = [];

    if (type) {
      sql += ' WHERE type = ?';
      params.push(type);
    }

    const [result] = await query(sql, params);
    return result.count;
  }
}

// Run cleanup weekly
setInterval(() => {
  Notification.cleanup().catch(console.error);
}, 7 * 24 * 60 * 60 * 1000);

module.exports = Notification;
