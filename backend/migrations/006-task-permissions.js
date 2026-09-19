/**
 * Migration 006
 * Adds the task_permissions table used to gate the "Grab order" action.
 *
 * Business rule: a customer cannot start (grab) a task until the admin grants
 * permission. Permission is required EVERY time — one grant = exactly one task
 * start. When the customer successfully grabs a task, the grant is consumed
 * (status -> 'used'). They then need a fresh grant for the next task.
 *
 * Idempotent: safe to re-run.
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
  console.log('Migration 006 starting...');

  if (await tableExists('task_permissions')) {
    console.log('  = task_permissions already exists, skipping');
  } else {
    await query(`
      CREATE TABLE task_permissions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        status ENUM('granted', 'used', 'revoked') NOT NULL DEFAULT 'granted',
        granted_by INT NULL,
        task_id INT NULL,
        note VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP NULL,
        INDEX idx_user_status (user_id, status),
        CONSTRAINT fk_taskperm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  + created task_permissions table');
  }

  console.log('Migration 006 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 006 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
