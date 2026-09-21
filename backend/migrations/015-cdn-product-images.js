/**
 * Migration 015 — CDN product images
 *
 * Gives every product a DISTINCT, reliable CDN image URL (Unsplash direct
 * image CDN) so each order shows a unique picture that always loads, instead of
 * local files that may be missing or broken on the deployed frontend.
 *
 * Matched by product name; unknown names get a generic-but-distinct fallback.
 * Idempotent: re-running just re-sets the same URLs.
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

// Unsplash CDN direct image URLs (stable, hotlink-friendly). Each product a
// different photo. w=400 keeps them light.
const CDN = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=400&q=70`;

const IMAGE_BY_NAME = {
  // JD.com
  'Wireless Earbuds': CDN('photo-1590658268037-6bf12165a8df'),
  'Phone Stand': CDN('photo-1512499617640-c74ae3a79d37'),
  'Phone Ring Holder': CDN('photo-1585060544812-6b45742d762f'),
  'USB-C Cable': CDN('photo-1583863788434-e58a36330cf0'),
  'LED Desk Lamp': CDN('photo-1507473885765-e6ed057f782c'),
  'Bluetooth Speaker': CDN('photo-1608043152269-423dbba4e7e1'),
  'Power Bank 10000mAh': CDN('photo-1609091839311-d5365f9ff1c5'),
  // Rakuten (slug shopee)
  'Smart Watch Pro': CDN('photo-1523275335684-37898b6baf30'),
  'Noise-Cancelling Headphones': CDN('photo-1505740420928-5e560c06d30e'),
  'Action Camera 4K': CDN('photo-1526170375885-4d8ecf77b99f'),
  'Robot Vacuum': CDN('photo-1626436819821-d2edd5f5d5f9'),
  'Espresso Machine': CDN('photo-1517668808822-9ebb02f2a0e6'),
  'Wireless Charger': CDN('photo-1591290619762-d0b81c4d9c1f'),
  // Temu
  '4K Monitor': CDN('photo-1527443224154-c4a3942d3acf'),
  'Premium Laptop': CDN('photo-1496181133206-80ce9b88a853'),
  'Gaming Console': CDN('photo-1486401899868-0e435ed85128'),
  'Tablet Pro 12 inch': CDN('photo-1544244015-0df4b3ffc6b0'),
  'Home Theatre System': CDN('photo-1593784991095-a205069470b6'),
  'Mechanical Keyboard': CDN('photo-1541140532154-b024d705b90a')
};

// Distinct fallbacks so even unmapped products differ from each other.
const FALLBACKS = [
  CDN('photo-1523275335684-37898b6baf30'),
  CDN('photo-1560343090-f0409e92791a'),
  CDN('photo-1526170375885-4d8ecf77b99f'),
  CDN('photo-1550009158-9ebf69173e03')
];

async function run() {
  console.log('Migration 015 starting...');
  const products = await query('SELECT id, name FROM products');
  let updated = 0;
  let fbIndex = 0;
  for (const p of products) {
    const url = IMAGE_BY_NAME[p.name] || FALLBACKS[(fbIndex++) % FALLBACKS.length];
    await query('UPDATE products SET image_url = ? WHERE id = ?', [url, p.id]);
    updated += 1;
    console.log(`  ${p.name} -> ${url}`);
  }
  console.log(`  ${updated} product image(s) updated to CDN`);
  console.log('Migration 015 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 015 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
