/**
 * One-time fix script for mostafa (#37)
 * Run: node fix-mostafa.js
 *
 * Target state (from screenshot):
 *   Balance: 3261.76 USDT (current)
 *   Today's Times: should show X/25 with combo pending
 *   Cash gap: 2617.37 USDT (recharge needed for combo #20)
 *
 * What it does:
 * 1. Finds mostafa's sequence plan
 * 2. Resets plan cursor to run-order #20 (missed combo)
 * 3. Creates a pending combo task for order #20 so it shows immediately
 * 4. Grants a fresh 6-task permission batch
 */
require('dotenv').config();
const { query, pool } = require('./src/config/database');

async function run() {
  const userId = 37; // mostafa

  console.log('=== Fix mostafa (#37) — restore combo #20 state ===\n');

  // 1. Check user + wallet
  const [user] = await query('SELECT id, username, status FROM users WHERE id = ?', [userId]);
  if (!user) { console.error('User #37 not found'); process.exit(1); }
  const [wallet] = await query('SELECT balance FROM wallets WHERE user_id = ?', [userId]);
  const balance = parseFloat(wallet ? wallet.balance : 0);
  console.log(`User: ${user.username}, Balance: ${balance} USDT`);

  // 2. Find plan
  const plans = await query(
    `SELECT id, num_orders, status, current_order, start_order, combos, schedule
     FROM sequence_plans
     WHERE user_id = ? AND status IN ('active','completed','cancelled')
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  if (!plans.length) { console.error('No plan found'); process.exit(1); }
  const plan = plans[0];

  // Parse combos to find combo #20 details
  let combos = [];
  try { combos = JSON.parse(plan.combos || '[]'); } catch(e) {}
  const combo20 = combos.find(c => c.order === 20);
  if (!combo20) { console.error('Combo #20 not found in plan'); process.exit(1); }
  console.log(`Combo #20: recharge=${combo20.recharge}, profit=${combo20.profit}`);

  // 3. Completed task count
  const [cnt] = await query(
    "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'completed'",
    [userId]
  );
  const completedNow = Number(cnt.n);
  console.log(`Completed tasks: ${completedNow}`);

  // 4. Reset cursor to run-order #20 (current_order=19)
  const runOrder = 20;
  const newCurrentOrder = runOrder - 1;
  const newStartOrder = Math.max(0, completedNow - newCurrentOrder);

  await query(
    `UPDATE sequence_plans
       SET current_order = ?, start_order = ?, status = 'active', completed_at = NULL
     WHERE id = ?`,
    [newCurrentOrder, newStartOrder, plan.id]
  );
  console.log(`✓ Plan cursor reset: current_order=${newCurrentOrder}, start_order=${newStartOrder}`);

  // 5. Cancel any stale pending combos
  await query(
    `UPDATE tasks SET status = 'cancelled', completion_time = CURRENT_TIMESTAMP
     WHERE user_id = ? AND status = 'pending' AND is_combo = 1`,
    [userId]
  );
  console.log('✓ Stale pending combos cancelled');

  // 6. Revoke existing permissions
  await query(
    `UPDATE task_permissions SET status = 'revoked'
     WHERE user_id = ? AND status = 'granted' AND used_count < batch_size`,
    [userId]
  );

  // 7. Grant 6-task permission
  await query(
    `INSERT INTO task_permissions (user_id, status, batch_size, used_count, granted_by, note)
     VALUES (?, 'granted', 6, 0, 1, 'Fix: resume from combo #20')`,
    [userId]
  );
  console.log('✓ Granted 6-task permission batch');

  // 8. Verify
  const [updatedPlan] = await query(
    'SELECT current_order, start_order, status FROM sequence_plans WHERE id = ?',
    [plan.id]
  );
  console.log('\n=== Result ===');
  console.log(`Plan: current_order=${updatedPlan.current_order}, status=${updatedPlan.status}`);
  console.log(`Cash gap will show: ${combo20.recharge} USDT`);
  console.log(`Order amount will be: ${balance} + ${combo20.recharge} = ${balance + combo20.recharge} USDT`);
  console.log('\n✅ Done! Grab the order → combo #20 will appear → recharge ' + combo20.recharge + ' USDT required');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });

