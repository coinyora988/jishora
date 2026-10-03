require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 — commission fix ===');

  // ── Check current state ───────────────────────────────────────────────────
  const [current] = await q(
    "SELECT COUNT(*) as n, ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=? AND status='completed'",
    [uid]
  );
  console.log('Completed tasks:', current.n, '| Commission sum:', current.s);

  const TARGET_SUM = 2135.25;
  const currentSum = parseFloat(current.s || 0);
  const diff = Math.round((TARGET_SUM - currentSum) * 100) / 100;
  console.log('Target:', TARGET_SUM, '| Diff:', diff);

  // ── Fix commission sum ────────────────────────────────────────────────────
  if (Math.abs(diff) > 0.005) {
    if (diff > 0) {
      // Need to ADD commission — update last completed task's commission
      const [lastTask] = await q(
        "SELECT id, commission FROM tasks WHERE user_id=? AND status='completed' ORDER BY id DESC LIMIT 1",
        [uid]
      );
      if (lastTask) {
        const newComm = Math.round((parseFloat(lastTask.commission) + diff) * 100) / 100;
        await q("UPDATE tasks SET commission=? WHERE id=?", [newComm, lastTask.id]);
        console.log('✓ Updated task', lastTask.id, 'commission:', lastTask.commission, '→', newComm);
      }
    } else {
      // Need to REDUCE commission — update last task
      const [lastTask] = await q(
        "SELECT id, commission FROM tasks WHERE user_id=? AND status='completed' ORDER BY id DESC LIMIT 1",
        [uid]
      );
      if (lastTask) {
        const newComm = Math.round((parseFloat(lastTask.commission) + diff) * 100) / 100;
        await q("UPDATE tasks SET commission=? WHERE id=?", [newComm, lastTask.id]);
        console.log('✓ Reduced task', lastTask.id, 'commission:', lastTask.commission, '→', newComm);
      }
    }
  } else {
    console.log('✓ Commission sum already correct');
  }

  // ── Set ALL completed tasks to yesterday (Oct 3) ──────────────────────────
  await q(
    "UPDATE tasks SET completion_time='2026-10-03 10:00:00' WHERE user_id=? AND status='completed'",
    [uid]
  );
  console.log('✓ All completed tasks → Oct 3 (yesterday)');

  // ── Balance = 3289.25 ────────────────────────────────────────────────────
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('✓ Balance: 3289.25');

  // ── Pending combo task (cash gap = 2617.37) ───────────────────────────────
  // order_amount = 3289.25 + 2617.37 = 5906.62
  await q("UPDATE tasks SET status='cancelled' WHERE user_id=? AND status='pending' AND is_combo=0", [uid]);

  const existingCombo = await q(
    "SELECT id FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1",
    [uid]
  );
  if (existingCombo.length === 0) {
    // Get sample data from existing tasks
    const [sample] = await q(
      "SELECT product_id, market_id FROM tasks WHERE user_id=? ORDER BY id DESC LIMIT 1",
      [uid]
    );
    const prodId   = sample ? sample.product_id : 1;
    const marketId = sample ? sample.market_id  : 1;
    // order_number is required — generate a unique one
    const orderNum = 'ORD-' + Date.now();
    await q(
      `INSERT INTO tasks
         (user_id, market_id, product_id, order_number, quantity,
          order_amount, commission, expected_income, status, is_combo, no_freeze, created_at)
       VALUES (?, ?, ?, ?, 1, 5906.62, 1928.11, 7834.73, 'pending', 1, 1, NOW())`,
      [uid, marketId, prodId, orderNum]
    );
    console.log('✓ Created pending combo task (order_amount=5906.62)');
  } else {
    await q(
      "UPDATE tasks SET order_amount=5906.62, commission=1928.11, expected_income=7834.73 WHERE id=?",
      [existingCombo[0].id]
    );
    console.log('✓ Updated pending combo task (order_amount=5906.62)');
  }

  // ── Plan cursor = 20 ─────────────────────────────────────────────────────
  const plans = await q(
    "SELECT id FROM sequence_plans WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1",
    [uid]
  );
  if (plans.length) {
    await q(
      "UPDATE sequence_plans SET current_order=20, status='active', completed_at=NULL WHERE id=?",
      [plans[0].id]
    );
    console.log('✓ Plan cursor: 20');
  }

  // ── Permission = 20/25 ───────────────────────────────────────────────────
  await q("UPDATE task_permissions SET status='revoked' WHERE user_id=?", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round1')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round2')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'granted',25,20,1,'round3')", [uid]);
  console.log('✓ Permission: 20/25');

  // ── Verify ───────────────────────────────────────────────────────────────
  const [w]      = await q('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  const [tc]     = await q("SELECT COUNT(*) as n, ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=? AND status='completed'", [uid]);
  const [perm]   = await q("SELECT used_count, batch_size FROM task_permissions WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1", [uid]);
  const [todayC] = await q("SELECT COALESCE(ROUND(SUM(commission),2),0) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-04'", [uid]);
  const [yestC]  = await q("SELECT ROUND(SUM(commission),2) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-03'", [uid]);
  const [combo]  = await q("SELECT order_amount FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1", [uid]);
  const gap      = combo ? Math.round((parseFloat(combo.order_amount) - 3289.25) * 100) / 100 : 0;

  console.log('\n=== FINAL STATE ===');
  console.log('Balance              :', w?.balance,    '(need 3289.25)');
  console.log('Completed tasks      :', tc?.n,         '(need 69+)');
  console.log('Total commission     :', tc?.s,         '(need 2135.25)');
  console.log('Today commission     :', todayC?.s,     '(need 0.00)');
  console.log('Yesterday commission :', yestC?.s,      '(need 2135.25)');
  console.log('Today Times          :', perm ? perm.used_count+'/'+perm.batch_size : 'N/A', '(need 20/25)');
  console.log('Cash gap             :', gap,           '(need 2617.37)');
  console.log('\n✅ Done!');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
