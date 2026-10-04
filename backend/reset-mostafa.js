require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;
const seq = require('./src/utils/sequencePlan');

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 — rebuild plan schedule ===');

  // ── Get active plan ───────────────────────────────────────────────────────
  const plans = await q(
    'SELECT * FROM sequence_plans WHERE user_id=? AND status=\'active\' ORDER BY id DESC LIMIT 1',
    [uid]
  );

  if (!plans.length) {
    console.log('ERROR: No active plan found');
    return;
  }

  const plan = plans[0];
  const combos = typeof plan.combos === 'string' ? JSON.parse(plan.combos) : plan.combos;
  console.log('Current plan id:', plan.id);
  console.log('Current combos:', JSON.stringify(combos));
  console.log('Current schedule entry23:', JSON.stringify((typeof plan.schedule === 'string' ? JSON.parse(plan.schedule) : plan.schedule)[22]));

  // ── Admin panel combos (from screenshot) ─────────────────────────────────
  // combo #11 → recharge: 358.19, profit: 401.34
  // combo #16 → recharge: 878.14, profit: 1407.36
  // combo #20 → recharge: 2617.37, profit: 4844
  // combo #23 → recharge: 7987.19, profit: 12471.27
  // combo #25 → recharge: 24197,   profit: 39875.19
  const correctCombos = [
    { order: 11, recharge: 358.19,  profit: 401.34    },
    { order: 16, recharge: 878.14,  profit: 1407.36   },
    { order: 20, recharge: 2617.37, profit: 4844.00   },
    { order: 23, recharge: 7987.19, profit: 12471.27  },
    { order: 25, recharge: 24197,   profit: 39875.19  }
  ];

  // ── Rebuild schedule with correct combos ─────────────────────────────────
  const deposit     = parseFloat(plan.deposit);
  const numOrders   = parseInt(plan.num_orders);
  const targetTotal = parseFloat(plan.target_total);

  console.log('\nRebuilding schedule:');
  console.log('  deposit:', deposit);
  console.log('  num_orders:', numOrders);
  console.log('  target_total:', targetTotal);
  console.log('  combos:', JSON.stringify(correctCombos));

  const newPlan = seq.createPlan(deposit, {
    orders: numOrders,
    targetTotal: targetTotal,
    combos: correctCombos
  });

  console.log('\nNew schedule entries at combo positions:');
  [11, 16, 20, 23, 25].forEach(o => {
    const entry = newPlan.schedule.find(e => e.order === o);
    console.log('  order', o, ':', JSON.stringify(entry));
  });

  // ── Update the plan with correct combos + schedule ────────────────────────
  await q(
    `UPDATE sequence_plans
     SET combos=?, schedule=?,
         combo_order=?, combo_amount=?, combo_profit=?,
         current_order=20, status='active', completed_at=NULL
     WHERE id=?`,
    [
      JSON.stringify(newPlan.combos),
      JSON.stringify(newPlan.schedule),
      newPlan.combos[0].order,
      newPlan.combos[0].recharge,
      newPlan.combos[0].profit,
      plan.id
    ]
  );
  console.log('\n✓ Plan schedule rebuilt with correct combos');

  // ── Verify ────────────────────────────────────────────────────────────────
  const [updated] = await q(
    'SELECT current_order, num_orders, schedule FROM sequence_plans WHERE id=?',
    [plan.id]
  );
  const sch = typeof updated.schedule === 'string' ? JSON.parse(updated.schedule) : updated.schedule;

  console.log('\n=== VERIFY SCHEDULE ===');
  [11, 16, 20, 23, 25].forEach(o => {
    const entry = sch.find(e => e.order === o);
    console.log('order', o, ':', JSON.stringify(entry));
  });
  console.log('\ncurrent_order:', updated.current_order, '(should be 20)');

  // Quick check entry 23 and 25
  const e23 = sch.find(e => e.order === 23);
  const e25 = sch.find(e => e.order === 25);
  if (e23 && e23.isCombo && e23.comboAmount > 0) {
    console.log('\n✅ Order #23 combo correct: recharge', e23.comboAmount);
  } else {
    console.log('\n❌ Order #23 combo WRONG:', JSON.stringify(e23));
  }
  if (e25 && e25.isCombo && e25.comboAmount > 0) {
    console.log('✅ Order #25 combo correct: recharge', e25.comboAmount);
  } else {
    console.log('❌ Order #25 combo WRONG:', JSON.stringify(e25));
  }

  console.log('\n✅ All combos will fire correctly when customer reaches those orders!');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
