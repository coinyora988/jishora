const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  grabTask,
  completeTask,
  cancelTask,
  getUserTasks,
  getTaskById,
  getTodayTasks,
  getTaskStats
} = require('../controllers/taskController');
const {
  validateTaskGrab,
  validateTaskComplete,
  validateIdParam,
  validatePagination
} = require('../middleware/validation');
const { taskLimiter, apiLimiter } = require('../middleware/rateLimiter');

// @route   POST /api/task/grab
// @desc    Grab a task/order
// @access  Private
router.post('/grab', protect, taskLimiter, validateTaskGrab, grabTask);

// @route   GET /api/task
// @desc    Get user tasks
// @access  Private
router.get('/', protect, apiLimiter, validatePagination, getUserTasks);

// @route   GET /api/task/today
// @desc    Get today's tasks
// @access  Private
router.get('/today', protect, apiLimiter, getTodayTasks);

// @route   GET /api/task/stats
// @desc    Get task statistics
// @access  Private
router.get('/stats', protect, apiLimiter, getTaskStats);

// @route   GET /api/task/:id
// @desc    Get task by ID
// @access  Private
router.get('/:id', protect, apiLimiter, validateIdParam, getTaskById);

// @route   POST /api/task/:id/complete
// @desc    Complete task
// @access  Private
router.post('/:id/complete', protect, taskLimiter, validateTaskComplete, completeTask);

// @route   POST /api/task/:id/cancel
// @desc    Cancel task
// @access  Private
router.post('/:id/cancel', protect, taskLimiter, validateIdParam, cancelTask);

module.exports = router;
