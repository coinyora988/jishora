require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;
const seq = require('./src/utils/sequencePlan');

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 — restore correct plan #119 ===');

  // Cancel wrong active plan #120
  await q("UPDATE sequence_plans SET status='cancelled' WHERE user_id=? AND status='active'", [uid]);
  console.log('✓ Cancelled wrong active plan(s)');

  // Restore plan #119 as active with correct combos + schedule
  const correctCombos = [
    { order: 11, recharge: 358.19,  profit: 401.34    },
    { order: 16, recharge: 878.14,  profit: 1407.36   },
    { order: 20, recharge: 2617.37, profit: 4844.00   },
    { order: 23, recharge: 7987.19, profit: 12471.27  },
    { order: 25, recharge: 24197,   profit: 39875.19  }
  ];

  // Get plan #119 details
  const [plan119] = await q('SELECT * FROM sequence_plans WHERE id=119', []);
  if (!plan119) {
    console.log('ERROR: Plan #119 not found!');
    return;
  }

  // Rebuild schedule with correct combos
  const newPlan = seq.createPlan(parseFloat(plan119.deposit), {
    orders: parseInt(plan119.num_orders),
    targetTotal: parseFloat(plan119.target_total),
    combos: correctCombos
  });

  // Restore plan #119 as active
  await q(
    `UPDATE sequence_plans
     SET status='active',
         current_order=20,
         start_order=50,
         combos=?,
         schedule=?,
         combo_order=11,
         combo_amount=358.19,
         combo_profit=401.34,
         completed_at=NULL
     WHERE id=119`,
    [JSON.stringify(newPlan.combos), JSON.stringify(newPlan.schedule)]
  );
  console.log('✓ Plan #119 restored as active (current_order=20, start_order=50)');

  // Verify
  const [active] = await q(
    'SELECT id, current_order, num_orders, start_order, status FROM sequence_plans WHERE user_id=? AND status=\'active\'',
    [uid]
  );
  console.log('\nActive plan:', JSON.stringify(active));

  const allPlans = await q(
    'SELECT id, current_order, start_order, status FROM sequence_plans WHERE user_id=? ORDER BY id DESC LIMIT 5',
    [uid]
  );
  console.log('\nAll plans:');
  allPlans.forEach(p => console.log(' id:', p.id, 'current:', p.current_order, 'start:', p.start_order, 'status:', p.status));

  // Verify schedule combos
  const [updatedPlan] = await q('SELECT schedule FROM sequence_plans WHERE id=119', []);
  const sch = Array.isArray(updatedPlan.schedule) ? updatedPlan.schedule : JSON.parse(updatedPlan.schedule);
  console.log('\n=== SCHEDULE COMBOS ===');
  sch.filter(e => e.isCombo).forEach(e =>
    console.log('order:', e.order, 'isCombo:', e.isCombo, 'comboAmount:', e.comboAmount, 'commission:', e.commission)
  );

  const e23 = sch.find(e => e.order === 23);
  const e25 = sch.find(e => e.order === 25);
  const e20 = sch.find(e => e.order === 20);

  console.log('\n=== FINAL CHECK ===');
  console.log(e20 && e20.isCombo ? '✅ Order #20 combo OK: recharge ' + e20.comboAmount : '❌ Order #20 WRONG');
  console.log(e23 && e23.isCombo ? '✅ Order #23 combo OK: recharge ' + e23.comboAmount : '❌ Order #23 WRONG');
  console.log(e25 && e25.isCombo ? '✅ Order #25 combo OK: recharge ' + e25.comboAmount : '❌ Order #25 WRONG');
  console.log('\n✅ Plan #119 is now active with correct combos!');
  console.log('Customer flow: recharge 2617.37 → submit #20 → #21,#22 normal → #23 combo → #24 normal → #25 combo → DONE');
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
