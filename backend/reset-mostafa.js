require('dotenv').config();
const db = require('./src/config/database');
const q = db.query;
const p = db.pool;

async function run() {
  const uid = 37;
  console.log('=== FIX mostafa #37 — commission dates ===');

  // Get all 69 completed tasks ordered by id
  const tasks = await q(
    "SELECT id, commission FROM tasks WHERE user_id=? AND status='completed' ORDER BY id ASC",
    [uid]
  );
  console.log('Total completed tasks:', tasks.length);

  // Print all tasks with running sum from end (to debug)
  // We need today=1938.18, yesterday=197.07
  // Find exact split by going from END backwards

  const TARGET_TODAY = 1938.18;
  const TARGET_YESTERDAY = 197.07;

  let sumToday = 0;
  let todayIds = [];
  let sumYest = 0;
  let yesterdayIds = [];
  let olderIds = [];

  // Go from end backwards — assign to today first, then yesterday, then older
  for (let i = tasks.length - 1; i >= 0; i--) {
    const c = Math.round(parseFloat(tasks[i].commission) * 10000) / 10000;
    const roundedSumToday = Math.round((sumToday + c) * 100) / 100;
    const roundedSumYest  = Math.round((sumYest + c) * 100) / 100;

    if (roundedSumToday <= TARGET_TODAY + 0.005) {
      sumToday = roundedSumToday;
      todayIds.unshift(tasks[i].id);
    } else if (roundedSumYest <= TARGET_YESTERDAY + 0.005) {
      sumYest = roundedSumYest;
      yesterdayIds.unshift(tasks[i].id);
    } else {
      olderIds.unshift(tasks[i].id);
    }
  }

  console.log('Today   :', todayIds.length, 'tasks | sum =', sumToday, '| target =', TARGET_TODAY);
  console.log('Yesterday:', yesterdayIds.length, 'tasks | sum =', sumYest, '| target =', TARGET_YESTERDAY);
  console.log('Older   :', olderIds.length, 'tasks');

  // First set ALL completed tasks to older date (clean slate)
  await q("UPDATE tasks SET completion_time='2026-10-01 10:00:00' WHERE user_id=? AND status='completed'", [uid]);
  console.log('✓ Reset all completion_time to Oct 1');

  // Set today tasks → Oct 4
  if (todayIds.length > 0) {
    const ph = todayIds.map(() => '?').join(',');
    await q(`UPDATE tasks SET completion_time='2026-10-04 10:00:00' WHERE id IN (${ph})`, todayIds);
    console.log('✓ Set', todayIds.length, 'tasks → Oct 4 (today)');
  }

  // Set yesterday tasks → Oct 3
  if (yesterdayIds.length > 0) {
    const ph = yesterdayIds.map(() => '?').join(',');
    await q(`UPDATE tasks SET completion_time='2026-10-03 10:00:00' WHERE id IN (${ph})`, yesterdayIds);
    console.log('✓ Set', yesterdayIds.length, 'tasks → Oct 3 (yesterday)');
  }

  // Verify sums directly from DB
  const [todayDB]  = await q("SELECT ROUND(SUM(commission),2) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-04'", [uid]);
  const [yesterDB] = await q("SELECT ROUND(SUM(commission),2) AS s FROM tasks WHERE user_id=? AND status='completed' AND DATE(completion_time)='2026-10-03'", [uid]);

  console.log('\n=== VERIFY ===');
  console.log('Today commission    :', todayDB?.s,  '(need 1938.18)');
  console.log('Yesterday commission:', yesterDB?.s, '(need 197.07)');

  if (Math.abs(parseFloat(todayDB?.s) - TARGET_TODAY) > 0.10) {
    console.log('\n⚠ Today sum off — showing all task commissions for manual check:');
    tasks.forEach((t, i) => console.log(i + 1, 'id:' + t.id, 'comm:' + parseFloat(t.commission).toFixed(4)));
  } else {
    console.log('\n✅ Commission dates correct!');
  }
}

run()
  .then(() => p.end())
  .catch(async e => { console.error('ERROR:', e.message); await p.end(); process.exit(1); });
