/**
 * Public Support Routes
 * Exposes the customer-service / support-page settings the admin configures, so
 * the public support page can render them dynamically (Telegram link, WhatsApp,
 * email, etc.). Read-only, non-sensitive.
 */
const express = require('express');
const router = express.Router();
const { getPublicSupportConfig } = require('../controllers/adminSettingsController');

// @route  GET /api/support/config
// @desc   Public customer-service + support settings
// @access Public
router.get('/config', getPublicSupportConfig);

module.exports = router;
