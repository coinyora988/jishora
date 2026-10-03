require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== Fix mostafa #37 ===');

  // 1. Balance
  await q('UPDATE wallets SET balance=3289.25 WHERE user_id=?', [uid]);
  console.log('✓ Balance: 3289.25');

  // 2. Plan cursor = 19
  const plans = await q('SELECT id FROM sequence_plans WHERE user_id=? ORDER BY id DESC LIMIT 1', [uid]);
  if (plans.length) {
    await q("UPDATE sequence_plans SET current_order=19,status='active',completed_at=NULL WHERE id=?", [plans[0].id]);
    console.log('✓ Plan cursor: 19');
  }

  // 3. Cancel pending tasks
  await q("UPDATE tasks SET status='cancelled',completion_time=NOW() WHERE user_id=? AND status='pending'", [uid]);

  // 4. Permissions: revoke all, insert 2 used + 1 active(20/25)
  await q("UPDATE task_permissions SET status='revoked' WHERE user_id=?", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round1')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'used',25,25,1,'round2')", [uid]);
  await q("INSERT INTO task_permissions(user_id,status,batch_size,used_count,granted_by,note) VALUES(?,'granted',25,20,1,'round3-fix')", [uid]);
  console.log('✓ Permissions set: Times=3, 20/25');

  // 5. TODAY's commission fix - update today's tasks commission sum
  // Today's commission comes from SUM of completed task commissions today
  // We need to find a product for the combo task
  const products = await q('SELECT id, market_id, price FROM products LIMIT 1', []);
  if (products.length) {
    const prod = products[0];
    const orderAmount = parseFloat((3289.25 + 2617.37).toFixed(2)); // balance + recharge
    const commission = 4844.00; // combo profit

    // 6. Insert the combo task as PENDING so sticky-combo shows it immediately
    const taskResult = await q(
      `INSERT INTO tasks (user_id, market_id, product_id, order_number, quantity,
         order_amount, commission, expected_income, status, is_combo, no_freeze)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'pending', 1, 0)`,
      [uid, prod.market_id, prod.id, 'ORD-COMBO20-FIX', orderAmount, commission, orderAmount + commission]
    );
    console.log('✓ Combo task inserted (pending) - sticky combo will show on Grab');
    console.log('  Order amount:', orderAmount, '| Commission:', commission);

    // Consume one permission slot for this grab
    await q(
      "UPDATE task_permissions SET used_count=used_count+1 WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1",
      [uid]
    );
    console.log('✓ Permission used_count: 21/25 (shows 21 after grab, correct)');
  }

  // 7. Verify
  const [w] = await q('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  const [perm] = await q("SELECT batch_size,used_count FROM task_permissions WHERE user_id=? AND status='granted' ORDER BY id DESC LIMIT 1", [uid]);
  const comboPending = await q("SELECT id,order_amount,commission FROM tasks WHERE user_id=? AND status='pending' AND is_combo=1 ORDER BY id DESC LIMIT 1", [uid]);

  console.log('\n=== Result ===');
  console.log('Balance:', w.balance);
  if (perm) console.log('Times:', perm.used_count + '/' + perm.batch_size);
  if (comboPending.length) console.log('Combo pending:', comboPending[0].order_amount, '| profit:', comboPending[0].commission);
  console.log('\n✅ Grab now => combo #20 shows immediately (sticky combo)');
  console.log('   Recharge 2617.37 USDT => Submit => done');
}

run().then(()=>p.end()).catch(async e=>{console.error(e.message);await p.end();process.exit(1)});
