/**
 * One-time fix script for mostafa (#37)
 * Run: node fix-mostafa.js
 *
 * What it does:
 * 1. Finds mostafa's sequence plan (active or completed)
 * 2. Resets plan cursor to run-order #20 (missed combo)
 * 3. Revokes any active permissions
 * 4. Grants a fresh 6-task permission batch
 */
require('dotenv').config();
const { query, pool } = require('./src/config/database');

async function run() {
  const userId = 37; // mostafa

  console.log('=== Fix mostafa (#37) ===\n');

  // 1. Check user
  const [user] = await query('SELECT id, username, status FROM users WHERE id = ?', [userId]);
  if (!user) { console.error('User #37 not found'); process.exit(1); }
  console.log(`User: ${user.username} (status: ${user.status})`);

  // 2. Find plan
  const plans = await query(
    `SELECT id, num_orders, status, current_order, start_order
     FROM sequence_plans
     WHERE user_id = ? AND status IN ('active','completed')
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  if (!plans.length) { console.error('No plan found'); process.exit(1); }
  const plan = plans[0];
  console.log(`Plan #${plan.id}: status=${plan.status}, current_order=${plan.current_order}, start_order=${plan.start_order}, num_orders=${plan.num_orders}`);

  // 3. Completed task count
  const [cnt] = await query(
    "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'completed'",
    [userId]
  );
  const completedNow = Number(cnt.n);
  console.log(`Completed tasks: ${completedNow}`);

  // 4. Reset cursor to run-order #20
  const runOrder = 20;
  const newCurrentOrder = runOrder - 1; // 19
  const newStartOrder = Math.max(0, completedNow - newCurrentOrder);
  console.log(`\nResetting plan cursor: current_order=${newCurrentOrder}, start_order=${newStartOrder}`);

  await query(
    `UPDATE sequence_plans
       SET current_order = ?, start_order = ?, status = 'active', completed_at = NULL
     WHERE id = ?`,
    [newCurrentOrder, newStartOrder, plan.id]
  );
  console.log('✓ Plan cursor reset to order #20');

  // 5. Cancel stale pending combos
  const cancelled = await query(
    `UPDATE tasks SET status = 'cancelled', completion_time = CURRENT_TIMESTAMP
     WHERE user_id = ? AND status = 'pending' AND is_combo = 1`,
    [userId]
  );
  console.log(`✓ Cancelled ${cancelled.affectedRows} stale pending combo task(s)`);

  // 6. Revoke existing active permissions
  const revoked = await query(
    `UPDATE task_permissions SET status = 'revoked'
     WHERE user_id = ? AND status = 'granted' AND used_count < batch_size`,
    [userId]
  );
  console.log(`✓ Revoked ${revoked.affectedRows} active permission(s)`);

  // 7. Grant 6-task permission
  await query(
    `INSERT INTO task_permissions (user_id, status, batch_size, used_count, granted_by, note)
     VALUES (?, 'granted', 6, 0, 1, 'Fix: resume from combo #20 (orders #20-#25)')`,
    [userId]
  );
  console.log('✓ Granted 6-task permission batch');

  // 8. Verify
  const [updatedPlan] = await query(
    'SELECT current_order, start_order, status FROM sequence_plans WHERE id = ?',
    [plan.id]
  );
  const [perm] = await query(
    `SELECT batch_size, used_count, status FROM task_permissions
     WHERE user_id = ? AND status = 'granted' ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  console.log('\n=== Result ===');
  console.log(`Plan: current_order=${updatedPlan.current_order}, start_order=${updatedPlan.start_order}, status=${updatedPlan.status}`);
  console.log(`Permission: ${perm ? perm.batch_size - perm.used_count + ' tasks available' : 'NOT FOUND'}`);
  console.log('\n✅ Done! Next grab will show combo order #20 (recharge 2617.37 USDT required)');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
