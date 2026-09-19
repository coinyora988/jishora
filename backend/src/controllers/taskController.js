/**
 * Task Controller
 * Handles task/order operations
 */

const Task = require('../models/Task');
const Notification = require('../models/Notification');
const realtime = require('../utils/realtime');

/**
 * @desc    Create task (grab order)
 * @route   POST /api/task/grab
 * @access  Private
 */
const grabTask = async (req, res, next) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const result = await Task.create(req.user.id, productId);

    // Create notification
    await Notification.create(
      req.user.id,
      'Order Grabbed',
      `You have successfully grabbed an order. Commission: $${result.commission}`,
      'success'
    );

    // Push to the admin panel instantly (order grabbed -> balances/status change).
    realtime.emit('task', { userId: req.user.id, action: 'grab', taskId: result.taskId });

    res.status(201).json({
      success: true,
      message: 'Order grabbed successfully',
      data: result
    });
  } catch (error) {
    if (error.message === 'Permission required') {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_REQUIRED',
        message: 'You need approval to start this task. Please contact customer service to get approved, then try again.'
      });
    }

    if (error.message === 'Insufficient balance') {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance. Please deposit funds.',
        redirectTo: '/deposit.html'
      });
    }

    if (error.message === 'Balance does not meet product requirements') {
      return res.status(400).json({
        success: false,
        message: 'Your balance does not meet the requirements for this product. Please deposit more funds.',
        redirectTo: '/deposit.html'
      });
    }

    next(error);
  }
};

/**
 * @desc    Complete task
 * @route   POST /api/task/:id/complete
 * @access  Private
 */
const completeTask = async (req, res, next) => {
  try {
    const result = await Task.complete(req.params.id, req.user.id);

    // Create notification
    await Notification.create(
      req.user.id,
      'Order Completed',
      `Order completed! You earned $${result.commission} commission.`,
      'success'
    );

    // Push to the admin panel instantly (order completed -> commission/balance).
    realtime.emit('task', { userId: req.user.id, action: 'complete', taskId: req.params.id });

    res.json({
      success: true,
      message: 'Task completed successfully',
      data: result
    });
  } catch (error) {
    // Combo order needs a bigger balance to submit — tell the customer how much
    // to recharge, matching the "recharge X to submit this order" prompt.
    if (error.code === 'COMBO_RECHARGE_REQUIRED') {
      return res.status(400).json({
        success: false,
        code: 'COMBO_RECHARGE_REQUIRED',
        message: `Your account balance is not enough, you need to recharge ${error.shortfall} USDT to submit this order.`,
        data: { shortfall: error.shortfall, orderAmount: error.orderAmount }
      });
    }
    next(error);
  }
};

/**
 * @desc    Cancel task
 * @route   POST /api/task/:id/cancel
 * @access  Private
 */
const cancelTask = async (req, res, next) => {
  try {
    await Task.cancel(req.params.id, req.user.id);

    // Push to the admin panel instantly (order cancelled -> balance refunded).
    realtime.emit('task', { userId: req.user.id, action: 'cancel', taskId: req.params.id });

    res.json({
      success: true,
      message: 'Task cancelled successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user tasks
 * @route   GET /api/task
 * @access  Private
 */
const getUserTasks = async (req, res, next) => {
  try {
    const tasks = await Task.getUserTasks(req.user.id, req.query);

    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get task by ID
 * @route   GET /api/task/:id
 * @access  Private
 */
const getTaskById = async (req, res, next) => {
  try {
    const task = await Task.getById(req.params.id, req.user.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get today's tasks
 * @route   GET /api/task/today
 * @access  Private
 */
const getTodayTasks = async (req, res, next) => {
  try {
    const tasks = await Task.getTodayTasks(req.user.id);

    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get task statistics
 * @route   GET /api/task/stats
 * @access  Private
 */
const getTaskStats = async (req, res, next) => {
  try {
    // The client sends its timezone offset so "today" is computed in the
    // customer's LOCAL time, wherever they are. tzOffset is JS
    // getTimezoneOffset() minutes: minutes to ADD to local time to get UTC,
    // i.e. it is negative for zones ahead of UTC (e.g. -360 for UTC+6).
    let tzOffsetMinutes = parseInt(req.query.tzOffset, 10);
    if (isNaN(tzOffsetMinutes)) tzOffsetMinutes = 0;

    const stats = await Task.getStats(req.user.id, tzOffsetMinutes);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  grabTask,
  completeTask,
  cancelTask,
  getUserTasks,
  getTaskById,
  getTodayTasks,
  getTaskStats
};
