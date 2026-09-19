/**
 * Setup Routes - For initial setup only
 * These routes help create admin user without command line
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');

/**
 * @route   POST /api/setup/create-admin
 * @desc    Create initial admin user
 * @access  Public (only works if no admin exists)
 */
router.post('/create-admin', async (req, res) => {
  try {
    // Check if admin already exists
    const existingAdmin = await query(
      'SELECT id FROM users WHERE role = ? LIMIT 1',
      ['admin']
    );

    if (existingAdmin.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Admin user already exists. Please login with admin@jishora.com'
      });
    }

    // Allow a custom initial password via the request body; default to a
    // known value if none is supplied. Change it immediately after first login.
    const initialPassword = (req.body && req.body.password) ? String(req.body.password) : 'admin123';
    const hashedPassword = await bcrypt.hash(initialPassword, 10);

    // A unique referral code is required by the schema (NOT NULL/UNIQUE).
    const referralCode = 'ADMIN' + Math.random().toString(36).slice(2, 8).toUpperCase();

    // Create admin user. Columns match the live schema: password_hash (not
    // "password"), vip_level (no is_vip column), status active.
    const result = await query(
      `INSERT INTO users (username, email, password_hash, role, vip_level, status, referral_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      ['admin', 'admin@jishora.com', hashedPassword, 'admin', 3, 'active', referralCode]
    );

    const userId = result.insertId;

    // Create the admin's wallet. The balance column is "balance".
    await query(
      `INSERT INTO wallets (user_id, balance) VALUES (?, 0.0000)`,
      [userId]
    );

    res.status(201).json({
      success: true,
      message: 'Admin user created successfully!',
      data: {
        email: 'admin@jishora.com',
        password: initialPassword,
        adminPanel: '/admin/login.html'
      }
    });

  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating admin user',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/setup/check
 * @desc    Check if admin exists
 * @access  Public
 */
router.get('/check', async (req, res) => {
  try {
    const adminExists = await query(
      'SELECT id FROM users WHERE role = ? LIMIT 1',
      ['admin']
    );

    res.json({
      success: true,
      adminExists: adminExists.length > 0,
      message: adminExists.length > 0 
        ? 'Admin user exists. Please login.' 
        : 'No admin user found. Please create one.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking admin status',
      error: error.message
    });
  }
});

module.exports = router;
