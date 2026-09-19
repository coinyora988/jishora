/**
 * One-shot database initializer for a FRESH deployment (e.g. Railway).
 *
 * Order:
 *   1. Runs database_schema.sql to create the base tables (users, wallets,
 *      markets, products, tasks, transactions, notifications, referrals,
 *      settings, audit_logs, user_sessions, password_resets) and seed the
 *      default markets + settings.
 *   2. Runs every migration in ./migrations in order (001 → 012) to add the
 *      admin-panel tables, products seed, task permissions, combo plans,
 *      invite codes, withdrawal restriction, proxy accounts, etc.
 *
 * It connects using the same env vars the app uses (DB_HOST/DB_USER/... which
 * on Railway point at the `railway` database), so it does NOT depend on a
 * database named jishora_db. The schema's own `CREATE DATABASE`/`USE` lines and
 * its placeholder admin row are skipped.
 *
 * Safe to run once on an empty database. Run from the app root:  node setup-db.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function splitSqlStatements(sql) {
  // Remove line comments, then split on semicolons. The schema has no stored
  // procedures/triggers, so a simple semicolon split is safe.
  const noComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return noComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runBaseSchema(conn) {
  const schemaPath = path.join(__dirname, 'database_schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.log('! database_schema.sql not found, skipping base schema');
    return;
  }
  const raw = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitSqlStatements(raw);
  console.log(`\n=== BASE SCHEMA (${statements.length} statements) ===`);
  for (const stmt of statements) {
    const head = stmt.slice(0, 60).replace(/\s+/g, ' ');
    // Skip database selection and the placeholder admin insert (bad hash).
    if (/^CREATE DATABASE/i.test(stmt) || /^USE\s/i.test(stmt)) {
      console.log(`  skip: ${head}`);
      continue;
    }
    if (/^INSERT INTO users/i.test(stmt) && stmt.includes('YourHashedPasswordHere')) {
      console.log('  skip: placeholder admin insert (create admin separately)');
      continue;
    }
    try {
      await conn.query(stmt);
      console.log(`  ok:   ${head}`);
    } catch (e) {
      // Ignore "already exists" so the script is re-runnable.
      if (/already exists|Duplicate entry|Duplicate key/i.test(e.message)) {
        console.log(`  skip (exists): ${head}`);
      } else {
        console.error(`  FAIL: ${head}\n        ${e.message}`);
        throw e;
      }
    }
  }
}

async function runMigrations() {
  const dir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) {
    console.log('! migrations folder not found, skipping');
    return;
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+.*\.js$/.test(f))
    .sort();
  console.log(`\n=== MIGRATIONS (${files.length}) ===`);
  for (const f of files) {
    console.log(`\n--- running ${f} ---`);
    // Each migration is a standalone script that connects on its own and calls
    // process.exit(); requiring it in a child would exit us. Run via child.
    const { execFileSync } = require('child_process');
    try {
      const out = execFileSync('node', [path.join(dir, f)], {
        cwd: __dirname,
        stdio: 'pipe',
        env: process.env
      });
      process.stdout.write(out.toString());
      console.log(`--- ${f} OK ---`);
    } catch (e) {
      const msg = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
      // Tolerate idempotent re-runs.
      if (/already exists|Duplicate/i.test(msg)) {
        console.log(`--- ${f} skipped (already applied) ---`);
      } else {
        process.stdout.write(msg);
        console.error(`--- ${f} FAILED ---`);
        throw e;
      }
    }
  }
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jishora_db',
    multipleStatements: false
  });
  try {
    console.log('Connected to database:', process.env.DB_NAME);
    await runBaseSchema(conn);
    await conn.end();
    await runMigrations();
    console.log('\n✅ DATABASE SETUP COMPLETE');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ SETUP FAILED:', e.message);
    try { await conn.end(); } catch (_) {}
    process.exit(1);
  }
})();
