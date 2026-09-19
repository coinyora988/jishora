/**
 * Migration 009
 * Per-customer combo plans.
 *
 * The admin configures, for a specific customer, that a COMBO order should
 * appear at a given order number (e.g. their 6th task) with a specific order
 * amount. When the customer grabs that Nth task, the backend produces a combo
 * order of that amount (with the market's commission rate) instead of a normal
 * balance-based order. If the combo amount exceeds their balance, they must
 * recharge to submit it.
 *
 *   combo_plans:
 *     user_id        which customer
 *     trigger_order  which order number (1-based) the combo appears on
 *     amount         the combo order amount
 *     status         pending | triggered | completed | cancelled
 *
 * "pending"   = configured, waiting for the customer to reach trigger_order
 * "triggered" = the combo order has been grabbed (task created)
 * "completed" = the combo order was submitted/completed
 * "cancelled" = admin cancelled it
 *
 * Idempotent.
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
  console.log('Migration 009 starting...');

  if (await tableExists('combo_plans')) {
    console.log('  = combo_plans already exists, skipping');
  } else {
    await query(`
      CREATE TABLE combo_plans (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        trigger_order INT NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        status ENUM('pending','triggered','completed','cancelled') NOT NULL DEFAULT 'pending',
        created_by INT NULL,
        task_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        triggered_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        INDEX idx_user_status (user_id, status),
        CONSTRAINT fk_combo_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  + created combo_plans table');
  }

  console.log('Migration 009 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 009 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
