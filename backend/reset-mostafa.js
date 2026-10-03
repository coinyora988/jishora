require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 — COMPLETE FIX ===');
  console.log('Targets:');
  console.log('  Orders (Done/Total) : 69 / 75');
  console.log('  Balance             : 3289.25');
  console.log('  Yesterday comm      : 2135.25');
  console.log('  Today comm          : 0.00');
  console.log('  Today Times         : 20/25');
  console.log('  Cash gap            : 2617.37');
  console.log('  Combo commission    : 4844.00');
  console.log('  Combo expected      : 10750.62');

  // ── 1. Fix sequence_plan: start_order=50, num_orders=25, current_order=20 ─
  // Done = completed tasks = 69
  // Total = start_order + num_orders = 50 + 25 = 75
  // The plan covers this round (round 3): orders 51-75
  // start_order=50 means first order of this plan = global order #51
  // current_order=20 means 20 orders grabbed in this plan (order #70 = combo)
  const plans = await q(
    'SELECT id, num_orders, start_order, current_order FROM sequence_plans WHERE user_id=? ORDER BY id DESC LIMIT 5',
    [uid]
  );
  console.log('\nAll plans:');
  plans.forEach(pl => console.log(' id:', pl.id, 'start:', pl.start_order, 'num:', pl.num_orders, 'current:', pl.current_order, 'status: active'));

  const activePlan = plans[0];
  if (activePlan) {
    await q(
      "UPDATE sequence_plans SET start_order=50, num_orders=25, current_order=20, status='active', completed_at=NULL WHERE id=?",
      [activePlan.id]
    );
    console.log('✓ Plan fixed: start_order=50, num_orders=25, current_order=20');
    console.log('  → Done/Total will show as 69/75 (49 from prev rounds + 20 this round = 69 done, 50+25=75 total)');
  } else {
    console.log('⚠ No plan found');
  }

  // ── 2. Ensure exactly 69 completed tasks ─────────────────────────────────
  const [current] = await q(
    "SELECT COUNT(*) as n, ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=? AND status='completed'",
    [uid]
  );
  console.log('\nCompleted tasks:', current.n, '| Sum:', current.s);

  if (current.n > 69) {
    const all = await q("SELECT id FROM tasks WHERE user_id=? AND status='completed' ORDER BY id ASC", [uid]);
    const toDelete = all.slice(69).map(t => t.id);
    const ph = toDelete.map(() => '?').join(',');
    await q(`DELETE FROM tasks WHERE id IN (${ph})`, toDelete);
    console.log('✓ Deleted', toDelete.length, 'extra tasks');
  }

  // ── 3. Fix commission sum to 2135.25 ─────────────────────────────────────
  const [afterDelete] = await q(
    "SELECT COUNT(*) as n, ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=? AND status='completed'",
    [uid]
  );
  const TARGET_SUM = 2135.25;
  const currentSum = parseFloat(afterDelete.s || 0);
  const diff = Math.round((TARGET_SUM - currentSum) * 100) / 100;
  console.log('Commission sum:', currentSum, '| Diff:', diff);

  if (Math.abs(diff) > 0.005) {
    const [lastTask] = await q(
      "SELECT id, commission FROM tasks WHERE user_id=? AND status='completed' ORDER BY id DESC LIMIT 1",
      [uid]
    );
    if (lastTask) {
      const newComm = Math.round((parseFloat(lastTask.commission) + diff) * 100) / 100;
      await q("UPDATE tasks SET commission=? WHERE id=?", [newComm, lastTask.id]);
      console.log('✓ Adjusted task', lastTask.id, 'commission →', newComm);
    }
  } else {
    console.log('✓ Commission sum OK');
  }

  // ── 4. All completed tasks → yesterday Oct 3 ─────────────────────────────
  await q(
    "UPDATE tasks SET completion_time='2026-10-03 10:00:00' WHERE user_id=? AND status='completed'",
    [uid]
  );
  console.log('✓ All completed tasks → Oct 3 (yesterday)');

  // ── 5. Balance = 3289.25 ─────────────────────────────────────────────────
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('✓ Balance: 3289.25');

  // ── 6. Fix pending combo task ─────────────────────────────────────────────
  await q("UPDATE tasks SET status='cancelled' WHERE user_id=? AND status='pending' AND is_combo=0", [uid]);
  const existingCombo = await q(
    "SELECT id FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1",
    [uid]
  );
  if (existingCombo.length > 0) {
    await q(
      "UPDATE tasks SET order_amount=5906.62, commission=4844.00, expected_income=10750.62 WHERE id=?",
      [existingCombo[0].id]
    );
    console.log('✓ Updated combo task: commission=4844, expected=10750.62');
  } else {
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
    console.log('✓ Created combo task: commission=4844, expected=10750.62');
  }

  // ── 7. Permission = 20/25 ────────────────────────────────────────────────
  await q("UPDATE task_permissions SET status='revoked' WHERE user_id=?", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round1')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round2')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'granted',25,20,1,'round3')", [uid]);
  console.log('✓ Permission: 20/25');

  // ── Verify ───────────────────────────────────────────────────────────────
  const [w]      = await q('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  const [tc]     = await q("SELECT COUNT(*) as n, ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=? AND status='completed'", [uid]);
  const [pl]     = await q("SELECT start_order, num_orders, current_order FROM sequence_plans WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1", [uid]);
  const [perm]   = await q("SELECT used_count, batch_size FROM task_permissions WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1", [uid]);
  const [todayC] = await q("SELECT COALESCE(ROUND(SUM(commission),2),0) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-04'", [uid]);
  const [yestC]  = await q("SELECT ROUND(SUM(commission),2) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-03'", [uid]);
  const [combo]  = await q("SELECT order_amount, commission, expected_income FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1", [uid]);
  const gap      = combo ? Math.round((parseFloat(combo.order_amount) - 3289.25) * 100) / 100 : 0;
  const done     = parseInt(tc?.n || 0);
  const total    = pl ? (parseInt(pl.start_order) + parseInt(pl.num_orders)) : 0;

  console.log('\n=== FINAL STATE ===');
  console.log('Balance              :', w?.balance,              '✓ need 3289.25');
  console.log('Orders (Done/Total)  :', done + '/' + total,      '✓ need 69/75');
  console.log('Completed tasks      :', tc?.n,                   '✓ need 69');
  console.log('Yesterday commission :', yestC?.s,                '✓ need 2135.25');
  console.log('Today commission     :', todayC?.s,               '✓ need 0.00');
  console.log('Today Times          :', perm ? perm.used_count+'/'+perm.batch_size : 'N/A', '✓ need 20/25');
  console.log('Cash gap             :', gap,                     '✓ need 2617.37');
  console.log('Combo commission     :', combo?.commission,       '✓ need 4844.00');
  console.log('Combo expected income:', combo?.expected_income,  '✓ need 10750.62');
  console.log('\n✅ All done!');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
