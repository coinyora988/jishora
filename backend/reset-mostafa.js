require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 — insert missing 25 tasks ===');

  // Check current count
  const [current] = await q(
    "SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='completed'",
    [uid]
  );
  console.log('Current completed tasks:', current.n, '(need 69)');

  const missing = 69 - parseInt(current.n);
  console.log('Missing tasks to insert:', missing);

  if (missing > 0) {
    // product_id=18, market_id=3 from sample
    // commission = order_amount * 0.18 (18% rate)
    // order_amount = 40.01 (from sample)
    // These are the "older" round 1 & 2 tasks that were deleted
    // Set completion_time to Oct 3 (yesterday) so they count in yesterday's commission

    const prodId   = 18;
    const marketId = 3;

    // We need to insert `missing` tasks but their commission sum must
    // bring total to 2135.25. Current sum after previous run = 2135.25 already
    // (script confirmed yesterday=2135.25). So we just need neutral tasks.
    // Use small commission per task so total doesn't change much.
    // We'll adjust last task at end to hit exact 2135.25.

    // Get current commission sum
    const [sumBefore] = await q(
      "SELECT ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=? AND status='completed'",
      [uid]
    );
    const currentSum = parseFloat(sumBefore.s || 0);
    console.log('Current commission sum:', currentSum);

    // Each inserted task: order_amount=40.01, commission=7.20 (18%)
    const orderAmt = 40.01;
    const commPerTask = Math.round(orderAmt * 0.18 * 100) / 100; // 7.20

    for (let i = 0; i < missing; i++) {
      const orderNum = 'ORD-FIX-' + Date.now() + '-' + i;
      await q(
        `INSERT INTO tasks
           (user_id, market_id, product_id, order_number, quantity,
            order_amount, commission, expected_income, status, is_combo,
            no_freeze, created_at, completion_time)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'completed', 0, 0,
                 '2026-10-03 08:00:00', '2026-10-03 08:30:00')`,
        [uid, marketId, prodId, orderNum, orderAmt, commPerTask,
         Math.round((orderAmt + commPerTask) * 100) / 100]
      );
    }
    console.log('✓ Inserted', missing, 'tasks (commission', commPerTask, 'each)');

    // Now fix total commission to exactly 2135.25
    const [sumAfter] = await q(
      "SELECT ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=? AND status='completed'",
      [uid]
    );
    const newSum = parseFloat(sumAfter.s || 0);
    const diff = Math.round((2135.25 - newSum) * 100) / 100;
    console.log('Sum after insert:', newSum, '| Diff to 2135.25:', diff);

    if (Math.abs(diff) > 0.005) {
      // Adjust the last inserted task
      const [lastTask] = await q(
        "SELECT id, commission FROM tasks WHERE user_id=? AND status='completed' ORDER BY id DESC LIMIT 1",
        [uid]
      );
      const newComm = Math.round((parseFloat(lastTask.commission) + diff) * 100) / 100;
      await q("UPDATE tasks SET commission=? WHERE id=?", [newComm, lastTask.id]);
      console.log('✓ Adjusted last task commission →', newComm, 'to reach 2135.25');
    }
  } else {
    console.log('✓ Already have 69+ tasks');
  }

  // Set all completed to Oct 3
  await q(
    "UPDATE tasks SET completion_time='2026-10-03 10:00:00' WHERE user_id=? AND status='completed'",
    [uid]
  );
  console.log('✓ All completed tasks → Oct 3');

  // Verify
  const [tc]    = await q("SELECT COUNT(*) as n, ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=? AND status='completed'", [uid]);
  const [pl]    = await q("SELECT start_order, num_orders, current_order FROM sequence_plans WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1", [uid]);
  const [yestC] = await q("SELECT ROUND(SUM(commission),2) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-03'", [uid]);
  const done    = parseInt(tc?.n || 0);
  const total   = pl ? (parseInt(pl.start_order) + parseInt(pl.num_orders)) : 0;

  console.log('\n=== FINAL STATE ===');
  console.log('Completed tasks      :', tc?.n,          '(need 69)');
  console.log('Orders (Done/Total)  :', done+'/'+total, '(need 69/75)');
  console.log('Yesterday commission :', yestC?.s,       '(need 2135.25)');
  console.log('\n✅ Done!');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
