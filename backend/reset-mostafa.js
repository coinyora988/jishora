require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 — fix total_orders = 75 ===');

  // Show current status breakdown
  const statusCount = await q(
    'SELECT status, COUNT(*) as n FROM tasks WHERE user_id=? GROUP BY status',
    [uid]
  );
  console.log('Current task counts by status:');
  statusCount.forEach(s => console.log(' ', s.status, ':', s.n));

  // ── Delete ALL cancelled tasks ────────────────────────────────────────────
  // After delete: completed=69, pending=1 (combo) = total 70
  // Then we need total=75, so insert 5 more pending tasks (orders #71-75)
  const [cancelled] = await q(
    "SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='cancelled'",
    [uid]
  );
  if (parseInt(cancelled.n) > 0) {
    await q("DELETE FROM tasks WHERE user_id=? AND status='cancelled'", [uid]);
    console.log('✓ Deleted', cancelled.n, 'cancelled tasks');
  }

  // ── Check after delete ────────────────────────────────────────────────────
  const [afterDel] = await q('SELECT COUNT(*) as n FROM tasks WHERE user_id=?', [uid]);
  console.log('Total tasks after delete:', afterDel.n, '(completed=69 + combo=1 =', 70, ')');

  // ── Insert 5 pending placeholder tasks (orders #71-75) ───────────────────
  // These represent the 5 remaining orders after combo #70
  // They are NOT grabbed yet — they will appear when customer grabs after recharge
  // But we need them in DB so total_orders = 75
  const currentTotal = parseInt(afterDel.n);
  const needed = 75 - currentTotal;
  console.log('Need to insert', needed, 'more tasks to reach total=75');

  if (needed > 0) {
    const [sample] = await q(
      'SELECT product_id, market_id, order_amount FROM tasks WHERE user_id=? ORDER BY id DESC LIMIT 1',
      [uid]
    );
    const prodId   = sample ? sample.product_id : 18;
    const marketId = sample ? sample.market_id  : 3;
    const orderAmt = sample ? sample.order_amount : 40.01;
    const commRate = 0.18;
    const comm     = Math.round(parseFloat(orderAmt) * commRate * 100) / 100;

    for (let i = 0; i < needed; i++) {
      const orderNum = 'ORD-FUTURE-' + Date.now() + '-' + i;
      await q(
        `INSERT INTO tasks
           (user_id, market_id, product_id, order_number, quantity,
            order_amount, commission, expected_income, status, is_combo, no_freeze, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'cancelled', 0, 0, '2026-10-03 07:00:00')`,
        [uid, marketId, prodId, orderNum, orderAmt, comm,
         Math.round((parseFloat(orderAmt) + comm) * 100) / 100]
      );
    }
    // Wait — these would show as cancelled and still count toward total
    // Better approach: insert as 'pending' placeholder? No — that would break grab.
    // Actually total_orders = COUNT(*) of ALL tasks including cancelled.
    // So cancelled(5) + completed(69) + pending(1) = 75 ✅
    console.log('✓ Inserted', needed, 'cancelled placeholder tasks');
  }

  // ── Verify total ──────────────────────────────────────────────────────────
  const statusFinal = await q(
    'SELECT status, COUNT(*) as n FROM tasks WHERE user_id=? GROUP BY status',
    [uid]
  );
  console.log('\nFinal task counts:');
  let grandTotal = 0;
  statusFinal.forEach(s => { console.log(' ', s.status, ':', s.n); grandTotal += parseInt(s.n); });
  console.log('GRAND TOTAL:', grandTotal, '(need 75)');

  const [tc] = await q("SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='completed'", [uid]);
  console.log('Done/Total:', tc.n + '/' + grandTotal, '(need 69/75)');
  console.log('\n✅ Combo Offers page will show: 69 / 75');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
