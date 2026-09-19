/**
 * Migration 008
 * Turns a task permission into a BATCH grant: one admin approval lets the
 * customer start a whole batch of tasks (default 25) instead of a single one.
 *
 * Adds:
 *   - batch_size  : how many task starts this grant covers (default 25)
 *   - used_count  : how many have been used so far
 * When used_count reaches batch_size the grant is exhausted (status -> 'used').
 *
 * Backfills existing rows so old single-use grants keep working:
 *   - rows currently 'used'   -> batch_size 1, used_count 1 (already exhausted)
 *   - rows currently 'granted'-> batch_size 25, used_count 0 (fresh batch)
 *
 * Idempotent: checks for the columns before adding.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

const BATCH_DEFAULT = 25;

async function columnExists(table, column) {
  const rows = await query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function run() {
  console.log('Migration 008 starting...');

  if (await columnExists('task_permissions', 'batch_size')) {
    console.log('  = batch_size already exists, skipping add');
  } else {
    await query(
      `ALTER TABLE task_permissions
       ADD COLUMN batch_size INT NOT NULL DEFAULT ${BATCH_DEFAULT} AFTER status,
       ADD COLUMN used_count INT NOT NULL DEFAULT 0 AFTER batch_size`
    );
    console.log('  + added batch_size + used_count columns');

    // Backfill: previously-used single grants stay exhausted; pending grants
    // become fresh batches of the default size.
    await query(`UPDATE task_permissions SET batch_size = 1, used_count = 1 WHERE status = 'used'`);
    await query(`UPDATE task_permissions SET batch_size = ${BATCH_DEFAULT}, used_count = 0 WHERE status = 'granted'`);
    console.log('  = backfilled existing rows');
  }

  console.log('Migration 008 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 008 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
