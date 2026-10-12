require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const newPassword = 'noman963852';
  const hash = await bcrypt.hash(newPassword, 10);

  // Show current admin
  const admins = await q("SELECT id, username, email FROM users WHERE role='admin'");
  console.log('Admin accounts:');
  admins.forEach(a => console.log(' id:', a.id, '| username:', a.username, '| email:', a.email));

  // Update password
  await q("UPDATE users SET password_hash=?, updated_at=NOW() WHERE role='admin'", [hash]);
  console.log('\n✓ Password updated to: noman963852');

  // Verify it works
  const [admin] = await q("SELECT password_hash FROM users WHERE role='admin' ORDER BY id LIMIT 1");
  const valid = await bcrypt.compare(newPassword, admin.password_hash);
  console.log('✓ Password verify test:', valid ? 'PASS ✅' : 'FAIL ❌');

  console.log('\nLogin with:');
  console.log('  Email   : admin@jishora.com');
  console.log('  Password: noman963852');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
