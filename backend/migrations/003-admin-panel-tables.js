/**
 * Migration 003
 * Adds the tables the admin panel needs to actually persist data:
 *   - payment_wallets : deposit addresses admins configure for users to pay into
 *   - combo_offers     : special bonus offers shown after N orders
 * and seeds the existing `settings` table with the default keys the Settings
 * page reads/writes (platform config, customer service links, support page,
 * referral rewards).
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
  console.log('Migration 003 starting...');

  // ── payment_wallets ──────────────────────────────────────────────
  if (await tableExists('payment_wallets')) {
    console.log('  = payment_wallets already exists, skipping');
  } else {
    await query(`
      CREATE TABLE payment_wallets (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        currency VARCHAR(20) NOT NULL DEFAULT 'USDT',
        network VARCHAR(50) NOT NULL,
        address VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB
    `);
    console.log('  + payment_wallets created');
  }

  // ── combo_offers ─────────────────────────────────────────────────
  if (await tableExists('combo_offers')) {
    console.log('  = combo_offers already exists, skipping');
  } else {
    await query(`
      CREATE TABLE combo_offers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        trigger_order_count INT NOT NULL DEFAULT 3,
        bonus_amount DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
        bonus_type ENUM('fixed', 'percentage') DEFAULT 'fixed',
        min_balance DECIMAL(15, 4) DEFAULT 0.0000,
        is_active BOOLEAN DEFAULT TRUE,
        claim_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB
    `);
    console.log('  + combo_offers created');
  }

  // ── settings ─────────────────────────────────────────────────────
  // Present in database_schema.sql but never actually created in this DB.
  if (await tableExists('settings')) {
    console.log('  = settings already exists, skipping');
  } else {
    await query(`
      CREATE TABLE settings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        key_name VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        description VARCHAR(255),
        is_public BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_key_name (key_name)
      ) ENGINE=InnoDB
    `);
    console.log('  + settings created');
  }

  // ── seed default settings ────────────────────────────────────────
  // key_name is UNIQUE, so INSERT IGNORE leaves any admin-changed value intact.
  const defaults = [
    ['platform_name', 'Jishora', 'Platform display name', 1],
    ['platform_description', 'Earn commissions by completing product promotion tasks', 'Short tagline', 1],
    ['min_deposit', '10', 'Minimum deposit amount (USDT)', 1],
    ['min_withdrawal', '50', 'Minimum withdrawal amount (USDT)', 1],
    ['referral_bonus_percent', '5', 'Referral commission percentage', 0],
    ['referral_signup_bonus', '2', 'One-time bonus for a successful referral (USDT)', 0],
    ['task_reward', '1', 'Base task reward (USDT)', 0],
    ['registration_enabled', 'true', 'Allow new user registration', 0],
    ['maintenance_mode', 'false', 'Site maintenance mode', 1],
    ['cs_whatsapp_number', '', 'Customer service WhatsApp number', 1],
    ['cs_whatsapp_template', 'Hello, I need help with my Jishora account.', 'Prefilled WhatsApp message', 1],
    ['cs_telegram_username', '', 'Customer service Telegram username', 1],
    ['cs_telegram_link', '', 'Customer service Telegram link', 1],
    ['cs_support_email', '', 'Support email address', 1],
    ['cs_live_chat_code', '', 'Live chat embed code', 0],
    ['cs_active', 'true', 'Customer service enabled', 1],
    ['support_title', 'Customer Support', 'Support page title', 1],
    ['support_welcome', 'How can we help you today?', 'Support page welcome message', 1],
    ['support_hours', '24/7', 'Support hours', 1],
    ['support_response_time', 'Within 24 hours', 'Expected response time', 1],
    ['support_faq', '[]', 'FAQ items as JSON', 1]
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
  console.log(`  + ${seeded} default setting(s) seeded (${defaults.length - seeded} already present)`);

  console.log('Migration 003 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 003 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
