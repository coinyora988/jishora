/**
 * Migration 014 — sequence_plans
 *
 * A "sequence plan" is one earnings run for a customer: a fixed number of
 * orders (default 25) with a precomputed commission schedule so that, after
 * completing the whole run, the customer lands on a TARGET total balance.
 *
 * Model (the product owner's spec):
 *   deposit $20 -> 25 orders -> combo on order 15 ($8 recharge, $5 profit) ->
 *   the other 24 orders share a $7 pool as DISTINCT commissions ->
 *   final balance = $40.
 *
 * One ACTIVE plan per user at a time. The per-order commissions are stored as
 * a JSON schedule (built by src/utils/sequencePlan.js) so the run is fixed and
 * auditable, and each grab just reads its order's commission.
 *
 * Idempotent: only creates the table / columns if missing.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

async function tableExists(name) {
  const rows = await query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name]
  );
  return rows.length > 0;
}

async function run() {
  console.log('Migration 014 starting...');

  if (await tableExists('sequence_plans')) {
    console.log('  = sequence_plans already present, skipping');
  } else {
    await query(`
      CREATE TABLE sequence_plans (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        deposit DECIMAL(15,2) NOT NULL,
        num_orders INT NOT NULL,
        target_total DECIMAL(15,2) NOT NULL,
        combo_order INT NOT NULL,
        combo_amount DECIMAL(15,2) NOT NULL,
        combo_profit DECIMAL(15,2) NOT NULL,
        -- Precomputed per-order commission schedule (JSON array of
        -- { order, isCombo, commission, comboAmount? }). Order numbers are
        -- 1-based WITHIN the run.
        schedule JSON NOT NULL,
        -- The customer's global completed-order count at the moment the plan
        -- started. The run's order 1 = the customer's (start_order + 1)th
        -- global order, so an existing customer's schedule still lines up.
        start_order INT NOT NULL DEFAULT 0,
        -- How many orders of this run have been GRABBED so far (1-based cursor).
        current_order INT NOT NULL DEFAULT 0,
        status ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        INDEX idx_user_status (user_id, status),
        CONSTRAINT fk_seqplan_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  + created sequence_plans table');
  }

  console.log('Migration 014 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 014 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
