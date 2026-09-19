const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getProfile,
  updateProfile,
  getReferrals
} = require('../controllers/userController');
const Notification = require('../models/Notification');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../controllers/notificationController');

// @route   GET /api/user/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', protect, getProfile);

// @route   PUT /api/user/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, updateProfile);

// @route   GET /api/user/referrals
// @desc    Get user referrals
// @access  Private
router.get('/referrals', protect, getReferrals);

// @route   GET /api/user/notifications
// @desc    Get user notifications
// @access  Private
router.get('/notifications', protect, getNotifications);

// @route   PUT /api/user/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/notifications/:id/read', protect, markAsRead);

// @route   PUT /api/user/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/notifications/read-all', protect, markAllAsRead);

// @route   DELETE /api/user/notifications/:id
// @desc    Delete notification
// @access  Private
router.delete('/notifications/:id', protect, deleteNotification);

module.exports = router;
