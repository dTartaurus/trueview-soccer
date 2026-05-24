/**
 * Generates icon-192.png and icon-512.png for the PWA manifest.
 * Run once: node scripts/generate-icons.mjs
 * Requires: npm install canvas (or use an online SVG→PNG converter)
 *
 * Alternative (no Node canvas required):
 *   1. Open public/favicon.svg in a browser
 *   2. Screenshot and resize to 192x192 and 512x512
 *   3. Save as public/icon-192.png and public/icon-512.png
 *
 * OR use https://realfavicongenerator.net — upload favicon.svg, download package,
 * copy android-chrome-192x192.png → public/icon-192.png
 *     android-chrome-512x512.png → public/icon-512.png
 */

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Green background
  ctx.fillStyle = '#15803d';
  const r = size * 0.12;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Soccer ball emoji
  ctx.font = `${size * 0.55}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚽', size / 2, size / 2 + size * 0.03);

  return canvas.toBuffer('image/png');
}

try {
  writeFileSync('public/icon-192.png', drawIcon(192));
  writeFileSync('public/icon-512.png', drawIcon(512));
  console.log('✓ Icons generated: public/icon-192.png, public/icon-512.png');
} catch (e) {
  console.log('canvas package not installed. Use the manual method described above.');
  console.log('Run: npm install canvas  then re-run this script');
}
