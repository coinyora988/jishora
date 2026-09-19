/**
 * Migration 013
 * Replaces the random picsum.photos placeholder images with the REAL product
 * photos that ship in the frontend at images/products/*.jpg.
 *
 * The image_url is stored as a RELATIVE path ("images/products/usb-cable.jpg")
 * so it resolves against whatever frontend domain serves the page (Railway URL
 * or the custom domain). Products are matched by name; any product whose name
 * is not in the map is given a sensible default so nothing stays broken.
 *
 * Idempotent: safe to re-run (it just re-sets the same URLs).
 */
require('dotenv').config();
const { query, pool } = require('../src/config/database');

// Product name -> real image file in images/products/
const IMAGE_BY_NAME = {
  // JD.com
  'Wireless Earbuds': 'wireless-earbuds.jpg',
  'Phone Stand': 'phone-stand.jpg',
  'USB-C Cable': 'usb-cable.jpg',
  'LED Desk Lamp': 'desk-lamp.jpg',
  'Bluetooth Speaker': 'bluetooth-speaker.jpg',
  'Power Bank 10000mAh': 'power-bank.jpg',
  'Phone Ring Holder': 'phone-ring-holder.jpg',
  // Rakuten (slug shopee)
  'Smart Watch Pro': 'smart-watch.jpg',
  'Noise-Cancelling Headphones': 'noise-cancelling-headphones.jpg',
  'Action Camera 4K': 'action-camera.jpg',
  'Robot Vacuum': 'robot-vacuum.jpg',
  'Espresso Machine': 'espresso-machine.jpg',
  'Wireless Charger': 'wireless-charger.jpg',
  // Temu
  '4K Monitor': '4k-monitor.jpg',
  'Premium Laptop': 'premium-laptop.jpg',
  'Gaming Console': 'gaming-console.jpg',
  'Tablet Pro 12 inch': 'tablet.jpg',
  'Home Theatre System': 'home-theatre-system.jpg',
  'Mechanical Keyboard': 'mechanical-keyboard.jpg'
};

// A per-market fallback if a product name is unknown.
const DEFAULT_IMAGE = 'headphones.jpg';

async function run() {
  console.log('Migration 013 starting...');

  const products = await query('SELECT id, name FROM products');
  let updated = 0;
  for (const p of products) {
    const file = IMAGE_BY_NAME[p.name] || DEFAULT_IMAGE;
    // Leading slash = root-relative, so it resolves the same from /task.html
    // and from /admin/*.html against the frontend domain.
    const url = `/images/products/${file}`;
    await query('UPDATE products SET image_url = ? WHERE id = ?', [url, p.id]);
    updated += 1;
    console.log(`  ${p.name} -> ${url}`);
  }

  console.log(`  ${updated} product image(s) updated`);
  console.log('Migration 013 complete.');
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration 013 FAILED:', err.message);
    await pool.end();
    process.exit(1);
  });
