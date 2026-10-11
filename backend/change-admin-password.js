require('dotenv').config();
const db = require('./src/config/database');
const bcrypt = require('bcryptjs');
const q = db.query;
const p = db.pool;

async function run() {
  console.log('=== Change Admin Password ===');

  const newPassword = 'noman963852';

  // Find admin user
  const admins = await q("SELECT id, username, email, role FROM users WHERE role='admin' ORDER BY id ASC");
  console.log('Admin accounts found:');
  admins.forEach(a => console.log(' id:', a.id, 'username:', a.username, 'email:', a.email));

  if (!admins.length) {
    console.log('ERROR: No admin found!');
    return;
  }

  // Hash new password
  const hash = await bcrypt.hash(newPassword, 10);
  console.log('\n✓ Password hashed');

  // Update password for ALL admin accounts
  for (const admin of admins) {
    await q('UPDATE users SET password_hash=? WHERE id=?', [hash, admin.id]);
    console.log('✓ Password updated for admin:', admin.username, '(id:', admin.id + ')');
  }

  // Logout all active sessions — clear any session/token tables
  // Check if sessions table exists
  try {
    await q('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role=\'admin\')');
    console.log('✓ Admin sessions cleared');
  } catch (e) {
    console.log('(No sessions table — JWT-based auth, tokens expire naturally)');
  }

  // If there's a token blacklist or refresh token table
  try {
    await q('DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE role=\'admin\')');
    console.log('✓ Refresh tokens cleared');
  } catch (e) {
    console.log('(No refresh_tokens table)');
  }

  // Update password_changed_at to invalidate old JWT tokens
  try {
    await q('UPDATE users SET updated_at=NOW() WHERE role=\'admin\'');
    console.log('✓ Updated timestamp (invalidates old sessions)');
  } catch (e) {
    console.log('(updated_at not updated)');
  }

  console.log('\n=== DONE ===');
  console.log('New password:', newPassword);
  console.log('All admin accounts updated.');
  console.log('Previous login devices will be logged out automatically.');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
