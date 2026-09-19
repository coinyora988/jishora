/**
 * Migration 002
 * Adds users.avatar_url so profile pictures persist server-side.
 *
 * Previously the chosen image was only kept in the browser's localStorage, so it
 * vanished on another device or after clearing site data.
 *
 * Idempotent: safe to re-run.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

async function run() {
  console.log('Migration 002 starting...');

  const exists = await query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar_url'`
  );

  if (exists.length) {
    console.log('  = users.avatar_url already present, skipping');
  } else {
    await query('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL AFTER country');
    console.log('  + users.avatar_url added');
  }

  console.log('Migration 002 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 002 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
