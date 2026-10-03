require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== Fix mostafa #37 - COMPLETE RESET ===');

  // 1. Balance
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('✓ Balance: 3289.25');

  // 2. Cancel ALL pending tasks
  const c1 = await q("UPDATE tasks SET status='cancelled',completion_time=NOW() WHERE user_id=? AND status IN ('pending','processing')", [uid]);
  console.log('✓ Cancelled pending tasks:', c1.affectedRows);

  // 3. Get total completed count now
  const [cnt] = await q("SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='completed'", [uid]);
  console.log('Completed tasks in DB:', cnt.n);

  // 4. Plan: find and reset
  const plans = await q('SELECT id,num_orders FROM sequence_plans WHERE user_id=? ORDER BY id DESC LIMIT 1', [uid]);
  if (plans.length) {
    // current_order=19 means next grab = run-order 20 (combo)
    await q("UPDATE sequence_plans SET current_order=19,status='active',completed_at=NULL WHERE id=?", [plans[0].id]);
    console.log('✓ Plan cursor: 19 (next=combo #20)');
  }

  // 5. Permissions: revoke ALL, set correctly
  await q("UPDATE task_permissions SET status='revoked' WHERE user_id=?", [uid]);
  // 3 rounds: 2 completed(used), 1 active with 20 used (19 done + 1 combo grabbed)
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'r1')",[uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'r2')",[uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'granted',25,20,1,'r3-active')",[uid]);
  console.log('✓ Permissions: Times=3, 20/25 active');

  // 6. Insert pending combo task (sticky combo)
  const mkts = await q("SELECT id FROM markets WHERE LOWER(name) LIKE '%temu%' LIMIT 1",[]);
  const mktId = mkts.length ? mkts[0].id : 1;
  const prods = await q('SELECT id FROM products WHERE market_id=? LIMIT 1',[mktId]);
  const prodId = prods.length ? prods[0].id : 1;

  const orderAmt = parseFloat((3289.25 + 2617.37).toFixed(2));
  const comm = 4844.00;

  await q(
    `INSERT INTO tasks(user_id,market_id,product_id,order_number,quantity,order_amount,commission,expected_income,status,is_combo,no_freeze)
     VALUES(?,?,?,'ORD-COMBO20',1,?,?,?,'pending',1,0)`,
    [uid,mktId,prodId,orderAmt,comm,orderAmt+comm]
  );
  console.log('✓ Combo task inserted: order_amount='+orderAmt+', commission='+comm);

  // 7. Verify
  const [w] = await q('SELECT balance FROM wallets WHERE user_id=?',[uid]);
  const [perm] = await q("SELECT batch_size,used_count FROM task_permissions WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1",[uid]);
  const [combo] = await q("SELECT id,order_amount FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1",[uid]);
  const perms_count = await q("SELECT COUNT(*) as n FROM task_permissions WHERE user_id=? AND status!='revoked'",[uid]);

  console.log('\n=== RESULT ===');
  console.log('Balance:', w.balance);
  console.log('Times Requested:', perms_count[0].n);
  console.log('Active permission:', perm ? perm.used_count+'/'+perm.batch_size : 'NONE');
  console.log('Combo pending:', combo ? 'YES (order_amount='+combo.order_amount+')' : 'NO');
  console.log('\n✅ Grab => combo #20 shows. Recharge 2617.37 => Submit');
}

run().then(()=>p.end()).catch(async e=>{console.error(e.message);await p.end();process.exit(1)});
