require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 ===');
  console.log('Target:');
  console.log('  Today commission     : 0.00  (no orders today)');
  console.log('  Yesterday commission : 2135.25 (all 69 completed orders)');
  console.log('  Today Times          : 20/25 (combo grabbed today)');
  console.log('  Balance              : 3289.25');
  console.log('  Cash gap             : 2617.37');

  // ── Step 1: Set ALL completed tasks completion_time to YESTERDAY (Oct 3) ─
  // Customer completed all 69 orders before today.
  // Today they only grabbed the combo (pending, not completed).
  // So today_commission = 0.00, yesterday_commission = sum of all 69.
  await q(
    "UPDATE tasks SET completion_time='2026-10-03 10:00:00' WHERE user_id=? AND status='completed'",
    [uid]
  );
  console.log('✓ Set all completed tasks completion_time to Oct 3 (yesterday)');

  // ── Step 2: Verify yesterday commission sum ───────────────────────────────
  const [yestSum] = await q(
    "SELECT ROUND(SUM(commission),2) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-03'",
    [uid]
  );
  console.log('Yesterday commission sum:', yestSum?.s, '(should be ~2135.25)');

  // ── Step 3: Ensure balance = 3289.25 ─────────────────────────────────────
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('✓ Balance: 3289.25');

  // ── Step 4: Ensure pending combo task exists (for cash gap 2617.37) ───────
  // combo order_amount = balance + cash_gap = 3289.25 + 2617.37 = 5906.62
  const existingCombo = await q(
    "SELECT id, order_amount FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1",
    [uid]
  );
  if (existingCombo.length === 0) {
    const [sample] = await q(
      "SELECT product_id FROM tasks WHERE user_id=? AND status='completed' ORDER BY id DESC LIMIT 1",
      [uid]
    );
    await q(
      `INSERT INTO tasks (user_id, product_id, status, commission, order_amount, is_combo, created_at)
       VALUES (?, ?, 'pending', 1928.11, 5906.62, 1, NOW())`,
      [uid, sample ? sample.product_id : 1]
    );
    console.log('✓ Created pending combo task (order_amount=5906.62)');
  } else {
    await q(
      "UPDATE tasks SET order_amount=5906.62, commission=1928.11 WHERE id=?",
      [existingCombo[0].id]
    );
    console.log('✓ Updated pending combo task (order_amount=5906.62)');
  }

  // ── Step 5: Plan cursor = 20 (combo grabbed) ─────────────────────────────
  const plans = await q(
    "SELECT id, num_orders FROM sequence_plans WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1",
    [uid]
  );
  if (plans.length) {
    await q(
      "UPDATE sequence_plans SET current_order=20, status='active', completed_at=NULL WHERE id=?",
      [plans[0].id]
    );
    console.log('✓ Plan cursor: 20/active');
  }

  // ── Step 6: Permission = 20/25 (Today's Times = 20/25) ───────────────────
  await q("UPDATE task_permissions SET status='revoked' WHERE user_id=?", [uid]);
  await q(
    "INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round1')",
    [uid]
  );
  await q(
    "INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round2')",
    [uid]
  );
  await q(
    "INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'granted',25,20,1,'round3')",
    [uid]
  );
  console.log('✓ Permission: 20/25 (5 left)');

  // ── Verify ────────────────────────────────────────────────────────────────
  const [w]      = await q('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  const [tc]     = await q("SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='completed'", [uid]);
  const [perm]   = await q("SELECT used_count, batch_size FROM task_permissions WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1", [uid]);
  const [todayC] = await q("SELECT ROUND(SUM(commission),2) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-04'", [uid]);
  const [yestC]  = await q("SELECT ROUND(SUM(commission),2) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-03'", [uid]);
  const [combo]  = await q("SELECT order_amount FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1", [uid]);
  const gap      = combo ? Math.round((parseFloat(combo.order_amount) - 3289.25) * 100) / 100 : 0;

  console.log('\n=== FINAL STATE ===');
  console.log('Balance              :', w?.balance,                          '✓ need 3289.25');
  console.log('Completed tasks      :', tc?.n,                              '✓ need 69');
  console.log('Today commission     :', todayC?.s ?? '0.00',                '✓ need 0.00');
  console.log('Yesterday commission :', yestC?.s,                           '✓ need 2135.25');
  console.log('Today Times          :', perm ? perm.used_count+'/'+perm.batch_size : 'N/A', '✓ need 20/25');
  console.log('Cash gap             :', gap,                                '✓ need 2617.37');
  console.log('\n✅ Done. Customer sees combo #20 pending. Recharge 2617.37 USDT to continue.');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
