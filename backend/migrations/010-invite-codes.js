/**
 * Migration 010
 * Admin-generated single-use invite codes.
 *
 * A referral code is required to register. It can be EITHER an existing user's
 * referral_code (customer-to-customer, reusable) OR one of these admin-created
 * invite codes (single-use — consumed on the registration that uses it).
 *
 *   invite_codes:
 *     code        the code the customer enters (UNIQUE)
 *     status      active | used | disabled
 *     used_by     the user id that consumed it (once used)
 *     created_by  admin id that generated it
 *     note        optional label (e.g. who it was given to)
 *     created_at / used_at
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
  console.log('Migration 010 starting...');

  if (await tableExists('invite_codes')) {
    console.log('  = invite_codes already exists, skipping');
  } else {
    await query(`
      CREATE TABLE invite_codes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(32) NOT NULL UNIQUE,
        status ENUM('active','used','disabled') NOT NULL DEFAULT 'active',
        used_by INT NULL,
        created_by INT NULL,
        note VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP NULL,
        INDEX idx_code_status (code, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  + created invite_codes table');
  }

  console.log('Migration 010 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 010 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
