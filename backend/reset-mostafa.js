require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 ===');
  console.log('Target: completed=69, balance=3289.25, permission=19/25(6 left), cursor=19/75');
  console.log('        today_commission=1938.18, yesterday_commission=197.07');

  // ── Step 1: Keep only 69 completed tasks ────────────────────────────────
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
  } else {
    console.log('✓ Completed tasks OK:', allCompleted.length);
  }

  // ── Step 2: Cancel all pending tasks ────────────────────────────────────
  await q("UPDATE tasks SET status='cancelled' WHERE user_id=? AND status='pending'", [uid]);
  console.log('✓ Pending tasks cancelled');

  // ── Step 3: Fix completion_time so commission totals are correct ─────────
  // We have 69 completed tasks total.
  // yesterday_commission = 197.07  → tasks completed on "yesterday" (Oct 3)
  // today_commission     = 1938.18 → tasks completed on "today"     (Oct 4)
  //
  // Strategy: get the 69 completed tasks ordered by id.
  // Sum up from the end: last N tasks = today (1938.18), tasks before that
  // on the previous day = yesterday (197.07), the rest = older dates.
  //
  // We set completion_time directly to achieve the correct sums.

  const kept = await q(
    "SELECT id, commission FROM tasks WHERE user_id=? AND status='completed' ORDER BY id ASC",
    [uid]
  );
  console.log('\nKept completed tasks:', kept.length);

  // Work backwards: assign today's tasks first (sum = 1938.18)
  const TARGET_TODAY     = 1938.18;
  const TARGET_YESTERDAY = 197.07;

  let todayIds      = [];
  let yesterdayIds  = [];
  let olderIds      = [];

  let sumToday = 0;
  let sumYesterday = 0;

  // Iterate from the END (most recent tasks = today)
  for (let i = kept.length - 1; i >= 0; i--) {
    const comm = parseFloat(kept[i].commission);
    if (Math.abs(sumToday - TARGET_TODAY) > 0.005 && sumToday < TARGET_TODAY) {
      sumToday = Math.round((sumToday + comm) * 100) / 100;
      todayIds.unshift(kept[i].id);
    } else if (Math.abs(sumYesterday - TARGET_YESTERDAY) > 0.005 && sumYesterday < TARGET_YESTERDAY) {
      sumYesterday = Math.round((sumYesterday + comm) * 100) / 100;
      yesterdayIds.unshift(kept[i].id);
    } else {
      olderIds.unshift(kept[i].id);
    }
  }

  console.log('Today tasks:', todayIds.length, '| sum:', sumToday, '(target:', TARGET_TODAY + ')');
  console.log('Yesterday tasks:', yesterdayIds.length, '| sum:', sumYesterday, '(target:', TARGET_YESTERDAY + ')');
  console.log('Older tasks:', olderIds.length);

  // Set completion_time for today's tasks → today Oct 4 2026
  if (todayIds.length > 0) {
    const ph = todayIds.map(() => '?').join(',');
    await q(
      `UPDATE tasks SET completion_time = '2026-10-04 10:00:00' WHERE id IN (${ph})`,
      todayIds
    );
    console.log('✓ Set', todayIds.length, 'tasks to today (Oct 4)');
  }

  // Set completion_time for yesterday's tasks → Oct 3 2026
  if (yesterdayIds.length > 0) {
    const ph = yesterdayIds.map(() => '?').join(',');
    await q(
      `UPDATE tasks SET completion_time = '2026-10-03 10:00:00' WHERE id IN (${ph})`,
      yesterdayIds
    );
    console.log('✓ Set', yesterdayIds.length, 'tasks to yesterday (Oct 3)');
  }

  // Set completion_time for older tasks → older dates
  if (olderIds.length > 0) {
    const ph = olderIds.map(() => '?').join(',');
    await q(
      `UPDATE tasks SET completion_time = '2026-10-01 10:00:00' WHERE id IN (${ph})`,
      olderIds
    );
    console.log('✓ Set', olderIds.length, 'tasks to older date (Oct 1)');
  }

  // ── Step 4: Set balance to 3289.25 ──────────────────────────────────────
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('✓ Balance: 3289.25');

  // ── Step 5: Fix sequence_plan cursor to 19/75 ───────────────────────────
  const plans = await q(
    "SELECT id, num_orders FROM sequence_plans WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1",
    [uid]
  );
  if (plans.length) {
    await q(
      "UPDATE sequence_plans SET current_order=19, status='active', completed_at=NULL WHERE id=?",
      [plans[0].id]
    );
    console.log('✓ Plan cursor: 19 / num_orders:', plans[0].num_orders, '(should be 75)');
  } else {
    console.log('⚠ No active sequence plan found');
  }

  // ── Step 6: Fix permissions → 3 rounds, active = 19/25 (6 left) ─────────
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
    "INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'granted',25,19,1,'round3')",
    [uid]
  );
  console.log('✓ Permissions: 3 rounds, active=19/25 (6 left)');

  // ── Verify ───────────────────────────────────────────────────────────────
  const [w]       = await q('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  const [plan]    = await q("SELECT current_order, num_orders, status FROM sequence_plans WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1", [uid]);
  const [perm]    = await q("SELECT batch_size, used_count, (batch_size-used_count) AS remaining FROM task_permissions WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1", [uid]);
  const [tc]      = await q("SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='completed'", [uid]);
  const [tRounds] = await q("SELECT COUNT(*) as n FROM task_permissions WHERE user_id=? AND status IN ('used','granted')", [uid]);
  const [todayC]  = await q("SELECT COALESCE(SUM(commission),0) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-04'", [uid]);
  const [yestC]   = await q("SELECT COALESCE(SUM(commission),0) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-03'", [uid]);

  console.log('\n=== FINAL STATE ===');
  console.log('Balance              :', w?.balance,          '(should be 3289.25)');
  console.log('Completed tasks      :', tc?.n,               '(should be 69)');
  console.log('Plan cursor          :', plan ? plan.current_order+'/'+plan.num_orders : 'N/A', '(should be 19/75)');
  console.log('Permission           :', perm ? perm.used_count+'/'+perm.batch_size+' ('+perm.remaining+' left)' : 'N/A', '(should be 19/25, 6 left)');
  console.log('Times requested      :', tRounds?.n,          '(should be 3)');
  console.log('Today commission     :', todayC?.s,           '(should be 1938.18)');
  console.log('Yesterday commission :', yestC?.s,            '(should be 197.07)');
  console.log('\nCombo Offers page   : 69 / 75');
  console.log('Tasks page          : 6 left (19/25 used)');
  console.log('Customer website    : 19/25, today=1938.18, yesterday=197.07');
  console.log('\n✅ Done. Customer is at combo #20. Needs to recharge 2617.37 USDT.');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
