require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== MOSTAFA #37 FULL DB CHECK ===\n');

  // Balance
  const [w] = await q('SELECT balance, frozen_balance, total_earned, total_deposited FROM wallets WHERE user_id=?', [uid]);
  console.log('WALLET:', JSON.stringify(w));

  // Permissions
  const perms = await q('SELECT id, status, batch_size, used_count, created_at, note FROM task_permissions WHERE user_id=? ORDER BY id', [uid]);
  console.log('\nPERMISSIONS:');
  perms.forEach(p => console.log(' ', JSON.stringify(p)));

  // Plan
  const plans = await q('SELECT id, status, current_order, start_order, num_orders, created_at, completed_at FROM sequence_plans WHERE user_id=? ORDER BY id', [uid]);
  console.log('\nSEQUENCE PLANS:');
  plans.forEach(p => console.log(' ', JSON.stringify(p)));

  // Pending tasks
  const pending = await q("SELECT id, status, is_combo, order_amount, commission, created_at FROM tasks WHERE user_id=? AND status='pending' ORDER BY id", [uid]);
  console.log('\nPENDING TASKS:', pending.length);
  pending.forEach(t => console.log(' ', JSON.stringify(t)));

  // Today's completed tasks
  const todayDone = await q(
    `SELECT id, commission, completion_time FROM tasks 
     WHERE user_id=? AND status='completed' AND DATE(completion_time)=CURDATE() 
     ORDER BY completion_time DESC LIMIT 5`, [uid]
  );
  const todayComm = todayDone.reduce((s,t) => s + parseFloat(t.commission||0), 0);
  console.log('\nTODAY COMPLETED:', todayDone.length, 'total commission:', todayComm.toFixed(2));

  // Yesterday's completed tasks
  const yesterdayDone = await q(
    `SELECT id, commission, completion_time FROM tasks 
     WHERE user_id=? AND status='completed' 
     AND DATE(completion_time) = (
       SELECT MAX(DATE(completion_time)) FROM tasks 
       WHERE user_id=? AND status='completed' AND DATE(completion_time) < CURDATE()
     ) LIMIT 5`, [uid, uid]
  );
  const yestComm = yesterdayDone.reduce((s,t) => s + parseFloat(t.commission||0), 0);
  console.log('YESTERDAY COMPLETED:', yesterdayDone.length, 'total commission:', yestComm.toFixed(2));

  // Total completed
  const [total] = await q("SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='completed'", [uid]);
  console.log('\nTOTAL COMPLETED TASKS:', total.n);

  // Markets
  const mkts = await q('SELECT id, name FROM markets ORDER BY id', []);
  console.log('\nMARKETS:', mkts.map(m => m.id+':'+m.name).join(', '));
}

run().then(()=>p.end()).catch(async e=>{console.error(e.message);await p.end();process.exit(1)});
