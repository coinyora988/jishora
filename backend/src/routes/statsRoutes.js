/**
 * Public Platform Stats Routes
 *
 * Backs the headline figures on the public homepage. These were previously
 * hardcoded in index.html ("128K+", "$4.2M", "99.8%"), which meant they never
 * reflected reality. This endpoint returns real aggregates.
 *
 * Public by design: it exposes only non-identifying totals.
 */

const express = require('express');
const { query } = require('../config/database');
const Settings = require('../models/Settings');

const router = express.Router();

// Aggregates are cheap but not free, and these numbers do not need to be
// second-accurate on a marketing panel. Cache briefly to blunt traffic spikes.
const CACHE_TTL_MS = 60 * 1000;
let cache = { at: 0, payload: null };

/**
 * @desc    Public platform totals
 * @route   GET /api/stats/platform
 * @access  Public
 */
router.get('/platform', async (req, res, next) => {
  try {
    if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) {
      return res.json({ success: true, data: cache.payload, cached: true });
    }

    const [members] = await query(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'user' AND status = 'active'"
    );

    const [paidOut] = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE type = 'withdraw' AND status = 'completed'`
    );

    // Success rate = completed withdrawals / all resolved withdrawals.
    // Pending requests are excluded because their outcome is not yet known.
    const [outcomes] = await query(
      `SELECT
         COUNT(*) AS resolved,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) AS succeeded
       FROM transactions
       WHERE type = 'withdraw' AND status IN ('completed', 'failed', 'cancelled', 'rejected')`
    );

    const resolved = Number(outcomes.resolved) || 0;
    const succeeded = Number(outcomes.succeeded) || 0;

    // Admin-configured display figures for the homepage hero stats. These are
    // formatted strings the admin controls (e.g. "128K+"), shown instead of the
    // raw live counts. The live counts are still returned for anywhere that
    // wants the true numbers.
    const display = await Settings.getMany([
      'home_stat_members',
      'home_stat_paid_out',
      'home_stat_success_rate'
    ]);

    const payload = {
      activeMembers: Number(members.n) || 0,
      totalPaidOut: parseFloat(paidOut.total) || 0,
      // With no resolved withdrawals yet there is no rate to report. null lets
      // the UI hide the figure instead of claiming a misleading 0% or 100%.
      successRate: resolved > 0 ? Math.round((succeeded / resolved) * 1000) / 10 : null,
      // What the homepage actually displays.
      display: {
        members: display.home_stat_members || '',
        paidOut: display.home_stat_paid_out || '',
        successRate: display.home_stat_success_rate || ''
      }
    };

    cache = { at: Date.now(), payload };

    res.json({ success: true, data: payload });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
