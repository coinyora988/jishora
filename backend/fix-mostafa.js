/**
 * One-time fix script for mostafa (#37)
 * Run: node fix-mostafa.js
 */
require('dotenv').config();
const { query, pool } = require('./src/config/database');

async function run() {
  const userId = 37; // mostafa

  console.log('=== Fix mostafa (#37) ===\n');

  // 1. Check user + wallet
  const [user] = await query('SELECT id, username, status FROM users WHERE id = ?', [userId]);
  if (!user) { console.error('User #37 not found'); process.exit(1); }
  const [wallet] = await query('SELECT balance FROM wallets WHERE user_id = ?', [userId]);
  const balance = parseFloat(wallet ? wallet.balance : 0);
  console.log(`User: ${user.username}, Balance: ${balance} USDT`);

  // 2. Find most recent plan (any status)
  const plans = await query(
    `SELECT id, num_orders, status, current_order, start_order, combos, schedule
     FROM sequence_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  if (!plans.length) { console.error('No plan found'); process.exit(1); }
  const plan = plans[0];
  console.log(`Plan #${plan.id}: status=${plan.status}, current_order=${plan.current_order}`);
  console.log(`Raw combos: ${plan.combos}`);

  // Hardcode combo #20 values from the screenshot
  const recharge20 = 2617.37;
  const profit20   = 4844.00;
  console.log(`Using combo #20: recharge=${recharge20}, profit=${profit20}`);

  // 3. Completed task count
  const [cnt] = await query(
    "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'completed'",
    [userId]
  );
  const completedNow = Number(cnt.n);
  console.log(`Completed tasks: ${completedNow}`);

  // 4. Reset cursor to run-order #20 (current_order=19)
  const newCurrentOrder = 19;
  const newStartOrder = Math.max(0, completedNow - newCurrentOrder);

  await query(
    `UPDATE sequence_plans
       SET current_order = ?, start_order = ?, status = 'active', completed_at = NULL
     WHERE id = ?`,
    [newCurrentOrder, newStartOrder, plan.id]
  );
  console.log(`✓ Plan cursor reset: current_order=19, start_order=${newStartOrder}`);

  // 5. Cancel ALL pending tasks (combo and normal)
  const c1 = await query(
    `UPDATE tasks SET status = 'cancelled', completion_time = CURRENT_TIMESTAMP
     WHERE user_id = ? AND status = 'pending'`,
    [userId]
  );
  console.log(`✓ Cancelled ${c1.affectedRows} pending task(s)`);

  // 6. Revoke ALL existing permissions
  const r1 = await query(
    `UPDATE task_permissions SET status = 'revoked'
     WHERE user_id = ?  AND status = 'granted'`,
    [userId]
  );
  console.log(`✓ Revoked ${r1.affectedRows} permission(s)`);

  // 7. Grant permission: batch=25, used=20 → shows 20/25
  await query(
    `INSERT INTO task_permissions (user_id, status, batch_size, used_count, granted_by, note)
     VALUES (?, 'granted', 25, 20, 1, 'Fix: resume from combo #20')`,
    [userId]
  );
  console.log('✓ Permission granted: 25 batch, 20 used → shows 20/25');

  // 8. Verify
  const [up] = await query(
    'SELECT current_order, start_order, status FROM sequence_plans WHERE id = ?',
    [plan.id]
  );
  const [perm] = await query(
    `SELECT batch_size, used_count FROM task_permissions
     WHERE user_id = ? AND status = 'granted' ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  console.log('\n=== Result ===');
  console.log(`Plan: current_order=${up.current_order}, status=${up.status}`);
  console.log(`Permission: ${perm.batch_size - perm.used_count} remaining (${perm.used_count}/${perm.batch_size})`);
  console.log(`Expected Cash gap: ${recharge20} USDT`);
  console.log('\n✅ Done! Grab → combo #20 → recharge 2617.37 USDT required');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });


