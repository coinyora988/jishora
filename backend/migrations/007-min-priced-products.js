/**
 * Migration 007
 * Ensures each market has at least one product priced exactly at its minimum
 * balance, so a customer who meets the stated minimum can actually start a task.
 *
 * Problem this fixes: the seed markets had min_balance (20 / 499 / 899) set
 * BELOW their cheapest product (22 / 500 / 900). A customer at exactly the
 * minimum could never afford any order and was wrongly told to recharge.
 *
 * Idempotent: only adds the entry-level product if the market has none at (or
 * below) its minimum.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

// A sensible entry-level product name per market slug.
const ENTRY = {
  jd: 'Phone Ring Holder',
  shopee: 'Wireless Charger',
  temu: 'Mechanical Keyboard'
};

async function run() {
  console.log('Migration 007 starting...');

  const markets = await query('SELECT id, slug, name, min_balance FROM markets');

  let inserted = 0;
  for (const market of markets) {
    const minBal = parseFloat(market.min_balance) || 0;

    // Is there already a product the min-balance customer can afford?
    const [row] = await query(
      'SELECT COUNT(*) AS n FROM products WHERE market_id = ? AND status = "active" AND price <= ?',
      [market.id, minBal]
    );
    if (row.n > 0) {
      console.log(`  = ${market.name} already has a product <= ${minBal}, skipping`);
      continue;
    }

    const name = ENTRY[market.slug] || `${market.name} Starter Item`;
    await query(
      `INSERT INTO products (name, description, price, image_url, market_id, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [
        name,
        `${name} available on ${market.name}`,
        minBal,
        `https://picsum.photos/seed/${encodeURIComponent(name)}/200/200`,
        market.id
      ]
    );
    inserted += 1;
    console.log(`  + added entry product "${name}" at ${minBal} for ${market.name}`);
  }

  console.log(`  ${inserted} entry product(s) inserted total`);
  console.log('Migration 007 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 007 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
