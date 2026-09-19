/**
 * Migration 005
 * Seeds sample products for each market so users have orders to grab.
 * The task/order flow needs product rows; without them "Grab order" has
 * nothing to create a task from.
 *
 * Idempotent: only seeds a market that currently has no products.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

// A small catalog per market. Prices are chosen to sit inside each market's
// balance band so a user in that band can actually grab them.
const CATALOG = {
  jd: [
    ['Wireless Earbuds', 25.00],
    ['Phone Stand', 30.00],
    ['USB-C Cable', 22.00],
    ['LED Desk Lamp', 45.00],
    ['Bluetooth Speaker', 60.00],
    ['Power Bank 10000mAh', 80.00]
  ],
  shopee: [
    ['Smart Watch Pro', 500.00],
    ['Noise-Cancelling Headphones', 550.00],
    ['Action Camera 4K', 620.00],
    ['Robot Vacuum', 750.00],
    ['Espresso Machine', 850.00]
  ],
  temu: [
    ['4K Monitor', 900.00],
    ['Premium Laptop', 1200.00],
    ['Gaming Console', 950.00],
    ['Tablet Pro 12 inch', 1100.00],
    ['Home Theatre System', 1000.00]
  ]
};

async function run() {
  console.log('Migration 005 starting...');

  // The live DB may never have had the base market seed run. Ensure the three
  // default markets exist (matching database_schema.sql) before adding products.
  let markets = await query('SELECT id, slug, name FROM markets');
  if (!markets.length) {
    const defaults = [
      ['JD.com', 'jd', 0.06, 20.00, 498.00, 1, 1],
      ['Shopee', 'shopee', 0.12, 499.00, 898.00, 2, 2],
      ['Temu', 'temu', 0.18, 899.00, null, 3, 3]
    ];
    for (const [name, slug, rate, minB, maxB, vip, sort] of defaults) {
      await query(
        `INSERT INTO markets (name, slug, commission_rate, min_balance, max_balance, vip_level_required, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        [name, slug, rate, minB, maxB, vip, sort]
      );
    }
    console.log(`  + seeded ${defaults.length} default markets`);
    markets = await query('SELECT id, slug, name FROM markets');
  }

  let inserted = 0;
  for (const market of markets) {
    const [existing] = await query(
      'SELECT COUNT(*) AS n FROM products WHERE market_id = ?',
      [market.id]
    );
    if (existing.n > 0) {
      console.log(`  = ${market.name} already has ${existing.n} product(s), skipping`);
      continue;
    }

    const items = CATALOG[market.slug] || CATALOG.jd;
    for (const [name, price] of items) {
      await query(
        `INSERT INTO products (name, description, price, image_url, market_id, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [
          name,
          `${name} available on ${market.name}`,
          price,
          // Deterministic placeholder image keyed to the product name.
          `https://picsum.photos/seed/${encodeURIComponent(name)}/200/200`,
          market.id
        ]
      );
      inserted += 1;
    }
    console.log(`  + seeded ${items.length} products for ${market.name}`);
  }

  console.log(`  ${inserted} product(s) inserted total`);
  console.log('Migration 005 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 005 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
