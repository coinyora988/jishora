require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== Fix mostafa #37 ===');

  // Balance
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('Balance: 3289.25');

  // Plan cursor = 19 (next grab = order #20 combo)
  const plans = await q('SELECT id FROM sequence_plans WHERE user_id=? ORDER BY id DESC LIMIT 1', [uid]);
  if (plans.length) {
    await q("UPDATE sequence_plans SET current_order=19,status='active',completed_at=NULL WHERE id=?", [plans[0].id]);
    console.log('Plan cursor: 19');
  }

  // Cancel pending tasks
  await q("UPDATE tasks SET status='cancelled',completion_time=NOW() WHERE user_id=? AND status='pending'", [uid]);

  // Revoke ALL permissions
  await q("UPDATE task_permissions SET status='revoked' WHERE user_id=?", [uid]);

  // Grant: batch=25, used=20 => shows 20/25, 5 left, Times=3
  // Insert 3 rows: 2 used + 1 active (used=20)
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round1')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round2')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'granted',25,20,1,'round3-fix')", [uid]);
  console.log('Permissions: 2 used + 1 active(20/25) = Times:3, Available:5 left');

  // Verify
  const [w] = await q('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  const rows = await q("SELECT status,batch_size,used_count FROM task_permissions WHERE user_id=? AND status!='revoked' ORDER BY id", [uid]);
  console.log('Balance:', w.balance);
  console.log('Permissions:', JSON.stringify(rows));
  console.log('DONE - Grab => combo #20 => recharge 2617.37 USDT');
}

run().then(()=>p.end()).catch(async e=>{console.error(e.message);await p.end();process.exit(1)});
