/**
 * Migration 001
 * Fixes live-schema drift that breaks deposits, withdrawals and rejections.
 *
 *  - transactions.proof_image      : deposit proof upload target (code wrote it, column never existed)
 *  - transactions.account_details  : withdrawal payout details JSON (code wrote it, column never existed)
 *  - transactions.status           : add 'rejected' (admin reject wrote a value outside the enum)
 *  - wallets                       : backfill a wallet row for any user missing one (admin had none)
 *
 * Idempotent: safe to re-run.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

async function columnExists(table, column) {
  const rows = await query(
    `SELECT 1 AS found FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`  = ${table}.${column} already present, skipping`);
    return;
  }
  await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  + ${table}.${column} added`);
}

async function run() {
  console.log('Migration 001 starting...');

  // 1. Columns the model writes but the table lacks.
  await addColumn('transactions', 'proof_image', 'VARCHAR(255) NULL AFTER transaction_hash');
  await addColumn('transactions', 'account_details', 'TEXT NULL AFTER proof_image');

  // 2. Admin reject sets status='rejected', which the enum did not allow.
  const [statusCol] = await query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'status'`
  );
  if (statusCol && !statusCol.COLUMN_TYPE.includes("'rejected'")) {
    await query(
      `ALTER TABLE transactions MODIFY COLUMN status
       ENUM('pending','processing','completed','failed','cancelled','rejected')
       NOT NULL DEFAULT 'pending'`
    );
    console.log("  + transactions.status enum extended with 'rejected'");
  } else {
    console.log("  = transactions.status already allows 'rejected', skipping");
  }

  // 3. Every user needs a wallet row or GET /api/wallet returns null for them.
  const orphans = await query(
    `SELECT u.id FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE w.id IS NULL`
  );
  for (const u of orphans) {
    await query('INSERT INTO wallets (user_id, balance) VALUES (?, 0.0000)', [u.id]);
    console.log(`  + wallet created for user ${u.id}`);
  }
  if (!orphans.length) console.log('  = every user already has a wallet, skipping');

  // 4. Backfill referral_code for any user created before code generation existed.
  const noCode = await query(
    `SELECT id FROM users WHERE referral_code IS NULL OR referral_code = ''`
  );
  for (const u of noCode) {
    let code;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      code = generateCode();
      const clash = await query('SELECT 1 FROM users WHERE referral_code = ?', [code]);
      if (!clash.length) break;
      code = null;
    }
    if (!code) {
      console.log(`  ! could not generate unique code for user ${u.id}, skipped`);
      continue;
    }
    await query('UPDATE users SET referral_code = ? WHERE id = ?', [code, u.id]);
    console.log(`  + referral_code ${code} assigned to user ${u.id}`);
  }
  if (!noCode.length) console.log('  = every user already has a referral_code, skipping');

  // 5. Backfill referrals rows for users who have referred_by but no referral record.
  const missingReferrals = await query(
    `SELECT u.id, u.referred_by FROM users u
     LEFT JOIN referrals r ON r.referrer_id = u.referred_by AND r.referred_id = u.id
     WHERE u.referred_by IS NOT NULL AND r.id IS NULL`
  );
  for (const u of missingReferrals) {
    await query(
      `INSERT INTO referrals (referrer_id, referred_id, status) VALUES (?, ?, 'active')`,
      [u.referred_by, u.id]
    );
    console.log(`  + referral row ${u.referred_by} -> ${u.id}`);
  }
  if (!missingReferrals.length) console.log('  = no missing referral rows, skipping');

  console.log('Migration 001 complete.');
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 001 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
