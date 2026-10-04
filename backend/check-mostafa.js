require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function check() {
  console.log('=== FINAL CHECK mostafa #37 ===');

  const [w]     = await q('SELECT balance FROM wallets WHERE user_id=37');
  const [tc]    = await q("SELECT COUNT(*) as n FROM tasks WHERE user_id=37 AND status='completed'");
  const [total] = await q('SELECT COUNT(*) as n FROM tasks WHERE user_id=37');
  const [perm]  = await q("SELECT used_count,batch_size FROM task_permissions WHERE user_id=37 AND status='granted' ORDER BY id DESC LIMIT 1");
  const [yest]  = await q("SELECT ROUND(SUM(commission),2) as s FROM tasks WHERE user_id=37 AND status='completed' AND DATE(completion_time)='2026-10-03'");
  const [today] = await q("SELECT COALESCE(ROUND(SUM(commission),2),0) as s FROM tasks WHERE user_id=37 AND status='completed' AND DATE(completion_time)='2026-10-04'");
  const [combo] = await q("SELECT order_amount,commission,expected_income FROM tasks WHERE user_id=37 AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1");
  const [plan]  = await q("SELECT id,current_order,num_orders,start_order FROM sequence_plans WHERE user_id=37 AND status='active' LIMIT 1");

  const gap = combo ? Math.round((parseFloat(combo.order_amount) - 3289.25) * 100) / 100 : 0;
  const done = parseInt(tc.n);
  const tot  = parseInt(total.n);

  console.log('Balance       :', w?.balance,                          w?.balance == 3289.25                    ? '✅' : '❌ need 3289.25');
  console.log('Completed     :', tc?.n,                               parseInt(tc?.n) == 69                    ? '✅' : '❌ need 69');
  console.log('Total tasks   :', total?.n,                            parseInt(total?.n) == 75                 ? '✅' : '❌ need 75');
  console.log('Done/Total    :', done+'/'+tot,                        done==69 && tot==75                      ? '✅' : '❌ need 69/75');
  console.log('Permission    :', perm ? perm.used_count+'/'+perm.batch_size : 'none', perm?.used_count==20    ? '✅' : '❌ need 20/25');
  console.log('Yesterday     :', yest?.s,                             parseFloat(yest?.s)==2135.25             ? '✅' : '❌ need 2135.25');
  console.log('Today         :', today?.s,                            parseFloat(today?.s)==0                  ? '✅' : '❌ need 0.00');
  console.log('Cash gap      :', gap,                                 gap==2617.37                             ? '✅' : '❌ need 2617.37');
  console.log('Combo comm    :', combo?.commission,                   parseFloat(combo?.commission)==4844      ? '✅' : '❌ need 4844');
  console.log('Plan cursor   :', plan ? plan.current_order+'/'+plan.num_orders+' start:'+plan.start_order : 'none', plan?.current_order==20 ? '✅' : '❌ need 20');

  // Check schedule combos
  const [planFull] = await q('SELECT schedule FROM sequence_plans WHERE user_id=37 AND status=\'active\' LIMIT 1');
  if (planFull) {
    const sch = Array.isArray(planFull.schedule) ? planFull.schedule : JSON.parse(planFull.schedule);
    const e20 = sch.find(e => e.order === 20);
    const e23 = sch.find(e => e.order === 23);
    const e25 = sch.find(e => e.order === 25);
    console.log('Combo #20 schedule:', e20?.isCombo && e20?.comboAmount == 2617.37 ? '✅ recharge 2617.37' : '❌ ' + JSON.stringify(e20));
    console.log('Combo #23 schedule:', e23?.isCombo && e23?.comboAmount == 7987.19 ? '✅ recharge 7987.19' : '❌ ' + JSON.stringify(e23));
    console.log('Combo #25 schedule:', e25?.isCombo && e25?.comboAmount == 24197   ? '✅ recharge 24197'   : '❌ ' + JSON.stringify(e25));
  }

  console.log('\n=== DONE ===');
}

check()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
