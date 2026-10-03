require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== RESET mostafa #37 ===');

  // Find the 20th completed task (order #20 combo position)
  const tasks = await q(
    "SELECT id, is_combo, commission FROM tasks WHERE user_id=? AND status='completed' ORDER BY id LIMIT 25",
    [uid]
  );
  console.log('Total completed tasks found:', tasks.length);
  
  if (tasks.length < 20) {
    console.log('Less than 20 completed tasks, nothing to delete after #20');
  } else {
    // Task at index 19 = 20th task (0-based)
    const task20 = tasks[19];
    console.log('20th task:', JSON.stringify(task20));
    
    // Delete all completed tasks after the 20th
    const tasksToDelete = tasks.slice(20).map(t => t.id);
    if (tasksToDelete.length > 0) {
      console.log('Deleting tasks after #20:', tasksToDelete.length, 'tasks, IDs:', tasksToDelete.join(','));
      const ph = tasksToDelete.map(()=>'?').join(',');
      
      // First delete related transactions
      await q(`DELETE FROM transactions WHERE user_id=? AND notes LIKE '%ORD-%' AND id IN (
        SELECT id FROM (SELECT t.id FROM transactions t WHERE t.user_id=? ORDER BY t.id DESC LIMIT ?) sub
      )`, [uid, uid, tasksToDelete.length]);
      
      // Delete the tasks
      await q(`DELETE FROM tasks WHERE id IN (${ph})`, tasksToDelete);
      console.log('✓ Deleted', tasksToDelete.length, 'tasks after order #20');
    }
  }

  // Cancel all pending tasks
  await q("UPDATE tasks SET status='cancelled' WHERE user_id=? AND status='pending'", [uid]);
  console.log('✓ Pending tasks cancelled');

  // Recalculate balance from remaining completed tasks
  const remaining = await q(
    "SELECT SUM(commission) as total_comm, COUNT(*) as cnt FROM tasks WHERE user_id=? AND status='completed'",
    [uid]
  );
  console.log('Remaining completed tasks:', remaining[0].cnt, '| Total commission:', remaining[0].total_comm);

  // Set balance to 3289.25 (from screenshot)
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('✓ Balance: 3289.25');

  // Reset plan cursor to 19 (next grab = order #20 combo)
  const plans = await q('SELECT id FROM sequence_plans WHERE user_id=? ORDER BY id DESC LIMIT 1', [uid]);
  if (plans.length) {
    await q("UPDATE sequence_plans SET current_order=19, status='active', completed_at=NULL WHERE id=?", [plans[0].id]);
    console.log('✓ Plan cursor: 19 (next = combo #20)');
  }

  // Fix permissions: revoke all, add 3 rounds (2 used + 1 active 20/25)
  await q("UPDATE task_permissions SET status='revoked' WHERE user_id=?", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'r1')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'r2')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'granted',25,20,1,'r3')", [uid]);
  console.log('✓ Permissions: Times=3, 20/25 (5 left)');

  // Verify
  const [w] = await q('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  const [plan] = await q('SELECT current_order, status FROM sequence_plans WHERE user_id=? ORDER BY id DESC LIMIT 1', [uid]);
  const [perm] = await q("SELECT batch_size, used_count FROM task_permissions WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1", [uid]);
  const [tc] = await q("SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='completed'", [uid]);

  console.log('\n=== FINAL STATE ===');
  console.log('Balance:', w.balance);
  console.log('Completed tasks:', tc.n);
  console.log('Plan cursor:', plan ? plan.current_order+'/'+plan.status : 'N/A');
  console.log('Permission:', perm ? perm.used_count+'/'+perm.batch_size : 'N/A');
  console.log('\n✅ Customer is now at order #20 combo. Recharge 2617.37 USDT required.');
}

run().then(()=>p.end()).catch(async e=>{console.error('ERROR:', e.message); await p.end(); process.exit(1)});
