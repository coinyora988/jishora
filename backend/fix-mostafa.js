require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== Fix mostafa #37 - FINAL ===');

  // 1. Balance
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('✓ Balance: 3289.25');

  // 2. Plan cursor = 19
  const plans = await q('SELECT id FROM sequence_plans WHERE user_id=? ORDER BY id DESC LIMIT 1', [uid]);
  if (plans.length) {
    await q("UPDATE sequence_plans SET current_order=19,status='active',completed_at=NULL WHERE id=?", [plans[0].id]);
    console.log('✓ Plan cursor: 19');
  }

  // 3. Cancel ALL pending tasks (normal and combo)
  await q("UPDATE tasks SET status='cancelled',completion_time=NOW() WHERE user_id=? AND status='pending'", [uid]);
  console.log('✓ Pending tasks cleared');

  // 4. Permissions
  await q("UPDATE task_permissions SET status='revoked' WHERE user_id=?", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'r1')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'r2')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'granted',25,20,1,'r3')", [uid]);
  console.log('✓ Times: 3, Available: 5 left (20/25)');

  // 5. Insert pending combo task directly
  // Get any product from Temu market
  const mkts = await q("SELECT id FROM markets WHERE LOWER(name) LIKE '%temu%' LIMIT 1", []);
  const marketId = mkts.length ? mkts[0].id : 1;
  const prods = await q('SELECT id FROM products WHERE market_id=? LIMIT 1', [marketId]);
  const productId = prods.length ? prods[0].id : 1;

  const orderAmount = 3289.25 + 2617.37; // balance + recharge = 5906.62
  const commission = 4844.00;

  await q(
    `INSERT INTO tasks (user_id,market_id,product_id,order_number,quantity,
      order_amount,commission,expected_income,status,is_combo,no_freeze,created_at)
     VALUES (?,?,?,?,1,?,?,?,'pending',1,0,NOW())`,
    [uid, marketId, productId, 'ORD-FIX-COMBO20', orderAmount, commission, orderAmount+commission]
  );

  // Use one permission slot
  await q("UPDATE task_permissions SET used_count=21 WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1", [uid]);
  console.log('✓ Combo task created (pending) - order_amount:', orderAmount);

  // 6. Verify
  const [w] = await q('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  const [perm] = await q("SELECT batch_size,used_count FROM task_permissions WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1", [uid]);
  const [combo] = await q("SELECT id,order_amount,commission FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1", [uid]);

  console.log('\n=== RESULT ===');
  console.log('Balance:', w.balance, 'USDT');
  console.log('Times:', perm ? perm.used_count+'/'+perm.batch_size : 'N/A');
  console.log('Combo task:', combo ? 'YES - order_amount='+combo.order_amount+' commission='+combo.commission : 'NOT FOUND');
  console.log('\n✅ NOW: Grab the order => combo shows immediately');
  console.log('   Need to recharge: 2617.37 USDT');
}

run().then(()=>p.end()).catch(async e=>{console.error(e.message);await p.end();process.exit(1)});
