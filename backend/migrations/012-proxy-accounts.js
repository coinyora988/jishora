/**
 * Migration 012
 * Proxy accounts + global per-market combo templates.
 *
 *  - users.is_proxy TINYINT(1)  — marks admin-created "proxy" customer accounts.
 *  - proxy_combo_templates       — GLOBAL combos that apply to ALL proxy
 *                                  accounts. One row = (market, order number,
 *                                  amount). Set once, works for every proxy
 *                                  account (regular accounts are unaffected).
 *
 * Idempotent: safe to re-run.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

async function run() {
  console.log('Migration 012 starting...');

  // 1) users.is_proxy
  const col = await query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_proxy'`
  );
  if (col.length) {
    console.log('  = users.is_proxy already present, skipping');
  } else {
    await query('ALTER TABLE users ADD COLUMN is_proxy TINYINT(1) NOT NULL DEFAULT 0 AFTER role');
    console.log('  + users.is_proxy added');
  }

  // 2) proxy_combo_templates
  const tbl = await query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proxy_combo_templates'`
  );
  if (tbl.length) {
    console.log('  = proxy_combo_templates already present, skipping');
  } else {
    await query(`
      CREATE TABLE proxy_combo_templates (
        id INT PRIMARY KEY AUTO_INCREMENT,
        market_id INT NOT NULL,
        trigger_order INT NOT NULL,
        amount DECIMAL(15,4) NOT NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_market_order (market_id, trigger_order),
        INDEX idx_market (market_id),
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('  + proxy_combo_templates table created');
  }

  console.log('Migration 012 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 012 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
