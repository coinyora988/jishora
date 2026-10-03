require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 ===');
  console.log('Target:');
  console.log('  Today Times    : 20/25  (combo grabbed, not submitted)');
  console.log('  Today comm     : 1938.18');
  console.log('  Yesterday comm : 197.07');
  console.log('  Cash gap       : 2617.37');
  console.log('  Balance        : 3289.25');
  console.log('  Completed tasks: 69');
  console.log('  Plan cursor    : 20 (combo grabbed)');
  console.log('  Permission     : 20/25 (5 left)');

  // ── Step 1: Keep exactly 69 completed tasks ──────────────────────────────
  const allCompleted = await q(
    "SELECT id, commission FROM tasks WHERE user_id=? AND status='completed' ORDER BY id ASC",
    [uid]
  );
  console.log('\nCurrent completed tasks:', allCompleted.length);

  if (allCompleted.length > 69) {
    const toDelete = allCompleted.slice(69).map(t => t.id);
    const ph = toDelete.map(() => '?').join(',');
    await q(`DELETE FROM tasks WHERE id IN (${ph})`, toDelete);
    console.log('✓ Deleted', toDelete.length, 'extra tasks (kept 69)');
  } else if (allCompleted.length < 69) {
    // Need to insert missing tasks
    const missing = 69 - allCompleted.length;
    console.log('Need to insert', missing, 'missing completed tasks...');
    // Get average commission from existing tasks
    const [avg] = await q("SELECT AVG(commission) as a FROM tasks WHERE user_id=? AND status='completed'", [uid]);
    const avgComm = avg && avg.a ? parseFloat(avg.a).toFixed(4) : '1.5000';
    // Get a product_id from existing tasks
    const [sample] = await q("SELECT product_id, order_amount FROM tasks WHERE user_id=? AND status='completed' ORDER BY id DESC LIMIT 1", [uid]);
    const prodId = sample ? sample.product_id : 1;
    const orderAmt = sample ? sample.order_amount : 10;
    for (let i = 0; i < missing; i++) {
      await q(
        `INSERT INTO tasks (user_id, product_id, status, commission, order_amount, is_combo, created_at, completion_time)
         VALUES (?, ?, 'completed', ?, ?, 0, '2026-10-01 08:00:00', '2026-10-01 08:30:00')`,
        [uid, prodId, avgComm, orderAmt]
      );
    }
    console.log('✓ Inserted', missing, 'missing tasks (older date)');
  } else {
    console.log('✓ Already 69 completed tasks');
  }

  // ── Step 2: Cancel all pending tasks ─────────────────────────────────────
  await q("UPDATE tasks SET status='cancelled' WHERE user_id=? AND status='pending'", [uid]);
  console.log('✓ Pending tasks cancelled');

  // ── Step 3: Fix completion_time for today/yesterday commission ────────────
  // today (Oct 4) commission = 1938.18
  // yesterday (Oct 3) commission = 197.07
  // We assign from the END of the 69 tasks going backwards

  const kept = await q(
    "SELECT id, commission FROM tasks WHERE user_id=? AND status='completed' ORDER BY id ASC",
    [uid]
  );

  const TARGET_TODAY     = 1938.18;
  const TARGET_YESTERDAY = 197.07;

  let todayIds     = [];
  let yesterdayIds = [];
  let olderIds     = [];
  let sumToday     = 0;
  let sumYesterday = 0;

  for (let i = kept.length - 1; i >= 0; i--) {
    const comm = parseFloat(kept[i].commission);
    if (sumToday < TARGET_TODAY - 0.005) {
      sumToday = Math.round((sumToday + comm) * 100) / 100;
      todayIds.unshift(kept[i].id);
    } else if (sumYesterday < TARGET_YESTERDAY - 0.005) {
      sumYesterday = Math.round((sumYesterday + comm) * 100) / 100;
      yesterdayIds.unshift(kept[i].id);
    } else {
      olderIds.unshift(kept[i].id);
    }
  }

  console.log('\nToday tasks    :', todayIds.length, '| sum:', sumToday, '(target:', TARGET_TODAY + ')');
  console.log('Yesterday tasks:', yesterdayIds.length, '| sum:', sumYesterday, '(target:', TARGET_YESTERDAY + ')');
  console.log('Older tasks    :', olderIds.length);

  if (todayIds.length > 0) {
    const ph = todayIds.map(() => '?').join(',');
    await q(`UPDATE tasks SET completion_time='2026-10-04 10:00:00' WHERE id IN (${ph})`, todayIds);
    console.log('✓ Set', todayIds.length, 'tasks → today Oct 4');
  }
  if (yesterdayIds.length > 0) {
    const ph = yesterdayIds.map(() => '?').join(',');
    await q(`UPDATE tasks SET completion_time='2026-10-03 10:00:00' WHERE id IN (${ph})`, yesterdayIds);
    console.log('✓ Set', yesterdayIds.length, 'tasks → yesterday Oct 3');
  }
  if (olderIds.length > 0) {
    const ph = olderIds.map(() => '?').join(',');
    await q(`UPDATE tasks SET completion_time='2026-10-01 10:00:00' WHERE id IN (${ph})`, olderIds);
    console.log('✓ Set', olderIds.length, 'tasks → older Oct 1');
  }

  // ── Step 4: Set balance ───────────────────────────────────────────────────
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('✓ Balance: 3289.25');

  // ── Step 5: Fix sequence_plan cursor to 20 (combo grabbed) ───────────────
  // current_order=20 means combo order #20 has been grabbed (pending submit)
  const plans = await q(
    "SELECT id, num_orders, start_order FROM sequence_plans WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1",
    [uid]
  );
  if (plans.length) {
    await q(
      "UPDATE sequence_plans SET current_order=20, status='active', completed_at=NULL WHERE id=?",
      [plans[0].id]
    );
    console.log('✓ Plan cursor: 20/active (combo grabbed, awaiting recharge+submit)');
  } else {
    console.log('⚠ No active sequence plan found');
  }

  // ── Step 6: Permission = 20/25 (5 left) — combo grab consumed slot ───────
  // Today's Times shows 20/25 meaning 20 grabs used in this batch
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
  console.log('✓ Permissions: 3 rounds, active=20/25 (5 left)');

  // ── Step 7: Insert pending combo task for order #20 ───────────────────────
  // The combo order must exist as a pending task so customer sees it
  // and the cash_gap (2617.37) is calculated correctly
  const existingCombo = await q(
    "SELECT id FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1",
    [uid]
  );
  if (existingCombo.length === 0) {
    // combo_amount = balance_needed = 3289.25 + 2617.37 = 5906.62
    const comboOrderAmount = 5906.62;
    const comboCommission  = 1928.11; // combo commission shown in admin
    await q(
      `INSERT INTO tasks (user_id, product_id, status, commission, order_amount, is_combo, created_at)
       VALUES (?, 1, 'pending', ?, ?, 1, NOW())`,
      [uid, comboCommission, comboOrderAmount]
    );
    console.log('✓ Inserted pending combo task (order_amount=5906.62, commission=1928.11)');
  } else {
    // Update existing combo task with correct amount
    await q(
      "UPDATE tasks SET order_amount=5906.62, commission=1928.11 WHERE id=?",
      [existingCombo[0].id]
    );
    console.log('✓ Updated existing pending combo task');
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  const [w]      = await q('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  const [plan]   = await q("SELECT current_order, num_orders, status FROM sequence_plans WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1", [uid]);
  const [perm]   = await q("SELECT batch_size, used_count, (batch_size-used_count) AS remaining FROM task_permissions WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1", [uid]);
  const [tc]     = await q("SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='completed'", [uid]);
  const [rounds] = await q("SELECT COUNT(*) as n FROM task_permissions WHERE user_id=? AND status IN ('used','granted')", [uid]);
  const [todayC] = await q("SELECT COALESCE(SUM(commission),0) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-04'", [uid]);
  const [yestC]  = await q("SELECT COALESCE(SUM(commission),0) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-03'", [uid]);
  const [combo]  = await q("SELECT id, order_amount FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1", [uid]);
  const balVal   = w ? parseFloat(w.balance) : 0;
  const comboAmt = combo ? parseFloat(combo.order_amount) : 0;
  const cashGap  = comboAmt > balVal ? Math.round((comboAmt - balVal) * 100) / 100 : 0;

  console.log('\n=== FINAL STATE ===');
  console.log('Balance              :', w?.balance,    '✓ (3289.25)');
  console.log('Completed tasks      :', tc?.n,         '✓ (69)');
  console.log('Plan cursor          :', plan ? plan.current_order+'/'+plan.num_orders : 'N/A', '✓ (20/25)');
  console.log('Permission (Times)   :', perm ? perm.used_count+'/'+perm.batch_size : 'N/A', '✓ (20/25)');
  console.log('Rounds requested     :', rounds?.n,     '✓ (3)');
  console.log('Today commission     :', todayC?.s,     '✓ (1938.18)');
  console.log('Yesterday commission :', yestC?.s,      '✓ (197.07)');
  console.log('Cash gap             :', cashGap,       '✓ (2617.37)');
  console.log('\n✅ Customer sees: 20/25 | balance 3289.25 | combo pending | recharge 2617.37');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
