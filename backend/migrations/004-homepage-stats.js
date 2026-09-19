/**
 * Migration 004
 * Seeds the three homepage headline-stat settings so the landing page shows
 * fixed marketing figures the admin can edit, rather than the raw live counts.
 *
 * These are display strings (e.g. "128K+", "$4.2M", "99.8%") so the admin has
 * full control over formatting.
 *
 * Idempotent: INSERT IGNORE leaves any admin-edited value untouched on re-run.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

async function run() {
  console.log('Migration 004 starting...');

  const defaults = [
    ['home_stat_members', '128K+', 'Homepage: Active Members headline figure', 1],
    ['home_stat_paid_out', '$4.2M', 'Homepage: Total Paid Out headline figure', 1],
    ['home_stat_success_rate', '99.8%', 'Homepage: Success Rate headline figure', 1]
  ];

  let seeded = 0;
  for (const [key, value, description, isPublic] of defaults) {
    const result = await query(
      `INSERT IGNORE INTO settings (key_name, value, description, is_public)
       VALUES (?, ?, ?, ?)`,
      [key, value, description, isPublic]
    );
    if (result.affectedRows > 0) seeded += 1;
  }

  console.log(`  + ${seeded} homepage stat setting(s) seeded (${defaults.length - seeded} already present)`);
  console.log('Migration 004 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 004 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
