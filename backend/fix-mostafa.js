require('dotenv').config();
const { query, pool } = require('./src/config/database');

async function run() {
  const userId = 37;
  console.log('=== Fix mostafa (#37) ===\n');

  await query('UPDATE wallets SET balance = 3289.25 WHERE user_id = ?', [userId]);
  console.log('✓ Balance: 3289.25');

  const plans = await query(
    'SELECT id FROM sequence_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    [userId]
  );
  if (!plans.length) { console.error('No plan'); process.exit(1); }

  await query(
    `UPDATE sequence_plans SET current_order=19, status='active', completed_at=NULL WHERE id=?`,
    [plans[0].id]
  );
  console.log('✓ Plan cursor: 19 (next grab = order #20 combo)');

  await query(
    `UPDATE tasks SET status='cancelled', completion_time=NOW() WHERE user_id=? AND status='pending'`,
    [userId]
  );
  console.log('✓ Pending tasks cancelled');

  await query(
    `UPDATE task_permissions SET status='revoked' WHERE user_id=? AND status='granted'`,
    [userId]
  );
  await query(
    `INSERT INTO task_permissions (user_id,status,batch_size,used_count,granted_by,note) VALUES (?,'granted',25,20,1,'fix combo20')`,
    [userId]
  );
  console.log('✓ Permission: 20/25');

  const [w] = await query('SELECT balance FROM wallets WHERE user_id=?', [userId]);
  console.log('\n=== Done ===');
  console.log('Balance:', w.balance);
  console.log('Times: 20/25');
  console.log('Cash gap: 2617.37 USDT');
  console.log('Next Grab = combo #20');
}

run().then(() => pool.end()).catch(async e => { console.error(e.message); await pool.end(); process.exit(1); });
