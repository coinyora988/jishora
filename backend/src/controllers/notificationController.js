/**
 * Notification Controller
 */

const Notification = require('../models/Notification');

const getNotifications = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const notifications = await Notification.getUserNotifications(req.user.id, limit);
    const unreadCount = await Notification.getUnreadCount(req.user.id);

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount
      }
    });
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    await Notification.markAsRead(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    next(error);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.markAllAsRead(req.user.id);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    next(error);
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    await Notification.delete(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Broadcast notification to all users
const broadcastNotification = async (req, res, next) => {
  try {
    const { type, title, message } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Type, title, and message are required'
      });
    }

    const result = await Notification.broadcastToAll(type, title, message);

    res.json({
      success: true,
      message: 'Notification broadcast successfully',
      data: {
        sentCount: result.sentCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Send a notification to ONE user, found by username (or email).
const sendToUser = async (req, res, next) => {
  try {
    const { username, title, message, type } = req.body;
    if (!username || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Username, title, and message are required'
      });
    }

    const { query } = require('../config/database');
    const ident = String(username).trim();
    const rows = await query(
      'SELECT id, username FROM users WHERE username = ? OR email = ? LIMIT 1',
      [ident, ident]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: `No customer found for "${ident}"` });
    }

    const user = rows[0];
    await Notification.create(user.id, title, message, type || 'info');

    res.json({
      success: true,
      message: `Notification sent to ${user.username}`,
      data: { userId: user.id, username: user.username }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Send targeted notification
const sendTargetedNotification = async (req, res, next) => {
  try {
    const { audience, type, title, message } = req.body;

    if (!audience || !type || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Audience, type, title, and message are required'
      });
    }

    const result = await Notification.sendTargeted(audience, type, title, message);

    res.json({
      success: true,
      message: 'Targeted notification sent successfully',
      data: {
        sentCount: result.sentCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Get notification statistics
const getNotificationStats = async (req, res, next) => {
  try {
    const stats = await Notification.getStatistics();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Get all notifications history
const getAllNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (page - 1) * limit;

    const notifications = await Notification.getAllWithStats(parseInt(limit), offset, type);
    const total = await Notification.getTotalCount(type);

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  broadcastNotification,
  sendTargetedNotification,
  sendToUser,
  getNotificationStats,
  getAllNotifications
};
