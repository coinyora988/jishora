/**
 * Migration 016
 * Add wallet_network column to wallets table.
 * Stores which network (trc20 / bep20 / erc20 / aptos) the user's saved
 * withdrawal address belongs to, alongside the existing wallet_address column.
 * Idempotent: safe to re-run.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

async function run() {
  console.log('Migration 016 starting...');

  const col = await query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'wallets'
       AND COLUMN_NAME  = 'wallet_network'`
  );
  if (col.length) {
    console.log('  = wallets.wallet_network already present, skipping');
  } else {
    await query(
      `ALTER TABLE wallets
       ADD COLUMN wallet_network VARCHAR(20) NULL DEFAULT NULL
       AFTER wallet_address`
    );
    console.log('  + wallets.wallet_network added');
  }

  console.log('Migration 016 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 016 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
