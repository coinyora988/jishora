/**
 * Migration 011
 * Adds per-user withdrawal restriction fields so an admin can block a specific
 * customer from withdrawing and show them a custom reason:
 *   - users.withdrawal_locked      TINYINT(1)  (0 = can withdraw, 1 = blocked)
 *   - users.withdrawal_lock_reason VARCHAR(255) (message shown to the customer)
 *
 * The admin can set/clear this repeatedly from the Withdrawal Restrictions page.
 *
 * Idempotent: safe to re-run.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

async function addColumn(name, ddl) {
  const exists = await query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
    [name]
  );
  if (exists.length) {
    console.log(`  = users.${name} already present, skipping`);
  } else {
    await query(`ALTER TABLE users ADD COLUMN ${ddl}`);
    console.log(`  + users.${name} added`);
  }
}

async function run() {
  console.log('Migration 011 starting...');
  await addColumn('withdrawal_locked', 'withdrawal_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER two_factor_enabled');
  await addColumn('withdrawal_lock_reason', 'withdrawal_lock_reason VARCHAR(255) NULL AFTER withdrawal_locked');
  console.log('Migration 011 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 011 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
