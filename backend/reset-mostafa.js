require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 ===');

  // ── 1. Fix pending combo task values ─────────────────────────────────────
  // order_amount    = 5906.62
  // commission      = 4844.00
  // expected_income = 10750.62
  const existingCombo = await q(
    "SELECT id, order_amount, commission FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1",
    [uid]
  );

  if (existingCombo.length > 0) {
    await q(
      "UPDATE tasks SET order_amount=5906.62, commission=4844.00, expected_income=10750.62 WHERE id=?",
      [existingCombo[0].id]
    );
    console.log('✓ Updated combo task: commission=4844.00, expected=10750.62');
  } else {
    // Create fresh combo task
    const [sample] = await q(
      "SELECT product_id, market_id FROM tasks WHERE user_id=? ORDER BY id DESC LIMIT 1",
      [uid]
    );
    const orderNum = 'ORD-' + Date.now();
    await q(
      `INSERT INTO tasks
         (user_id, market_id, product_id, order_number, quantity,
          order_amount, commission, expected_income, status, is_combo, no_freeze, created_at)
       VALUES (?, ?, ?, ?, 1, 5906.62, 4844.00, 10750.62, 'pending', 1, 1, NOW())`,
      [uid, sample ? sample.market_id : 1, sample ? sample.product_id : 1, orderNum]
    );
    console.log('✓ Created combo task: commission=4844.00, expected=10750.62');
  }

  // ── 2. Fix yesterday commission = 2135.25 ────────────────────────────────
  const [current] = await q(
    "SELECT COUNT(*) as n, ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=? AND status='completed'",
    [uid]
  );
  console.log('Completed tasks:', current.n, '| Sum:', current.s);

  const TARGET_SUM = 2135.25;
  const currentSum = parseFloat(current.s || 0);
  const diff = Math.round((TARGET_SUM - currentSum) * 100) / 100;
  console.log('Diff to target 2135.25:', diff);

  if (Math.abs(diff) > 0.005) {
    const [lastTask] = await q(
      "SELECT id, commission FROM tasks WHERE user_id=? AND status='completed' ORDER BY id DESC LIMIT 1",
      [uid]
    );
    if (lastTask) {
      const newComm = Math.round((parseFloat(lastTask.commission) + diff) * 100) / 100;
      await q("UPDATE tasks SET commission=? WHERE id=?", [newComm, lastTask.id]);
      console.log('✓ Adjusted commission of task', lastTask.id, '→', newComm);
    }
  } else {
    console.log('✓ Commission sum already correct');
  }

  // ── 3. All completed tasks → yesterday (Oct 3) ───────────────────────────
  await q(
    "UPDATE tasks SET completion_time='2026-10-03 10:00:00' WHERE user_id=? AND status='completed'",
    [uid]
  );
  console.log('✓ All completed tasks → Oct 3 (yesterday)');

  // ── 4. Balance = 3289.25 ─────────────────────────────────────────────────
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('✓ Balance: 3289.25');

  // ── 5. Plan cursor = 20 ──────────────────────────────────────────────────
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

  // ── 6. Permission = 20/25 ────────────────────────────────────────────────
  await q("UPDATE task_permissions SET status='revoked' WHERE user_id=?", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round1')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round2')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'granted',25,20,1,'round3')", [uid]);
  console.log('✓ Permission: 20/25 (5 left)');

  // ── Verify ───────────────────────────────────────────────────────────────
  const [w]      = await q('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  const [tc]     = await q("SELECT COUNT(*) as n, ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=? AND status='completed'", [uid]);
  const [perm]   = await q("SELECT used_count, batch_size FROM task_permissions WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1", [uid]);
  const [todayC] = await q("SELECT COALESCE(ROUND(SUM(commission),2),0) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-04'", [uid]);
  const [yestC]  = await q("SELECT ROUND(SUM(commission),2) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-03'", [uid]);
  const [combo]  = await q("SELECT order_amount, commission, expected_income FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1", [uid]);
  const gap      = combo ? Math.round((parseFloat(combo.order_amount) - 3289.25) * 100) / 100 : 0;

  console.log('\n=== FINAL STATE ===');
  console.log('Balance              :', w?.balance,                     '(need 3289.25)');
  console.log('Completed tasks      :', tc?.n,                         '(need 44+)');
  console.log('Yesterday commission :', yestC?.s,                      '(need 2135.25)');
  console.log('Today commission     :', todayC?.s,                     '(need 0.00)');
  console.log('Today Times          :', perm ? perm.used_count+'/'+perm.batch_size : 'N/A', '(need 20/25)');
  console.log('Cash gap             :', gap,                           '(need 2617.37)');
  console.log('Combo commission     :', combo?.commission,             '(need 4844.00)');
  console.log('Combo expected income:', combo?.expected_income,        '(need 10750.62)');
  console.log('\n✅ Done!');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
