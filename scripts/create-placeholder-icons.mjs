/**
 * Creates minimal valid PNG placeholder icons so the build succeeds.
 * Replace with real icons before sharing with the team.
 */
import { writeFileSync } from 'fs';

// Minimal 1x1 green PNG (will be upscaled by browser — good enough for dev)
// Real icons: run scripts/generate-icons.mjs after: npm install canvas
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

writeFileSync('public/icon-192.png', PLACEHOLDER_PNG);
writeFileSync('public/icon-512.png', PLACEHOLDER_PNG);
writeFileSync('public/apple-touch-icon.png', PLACEHOLDER_PNG);
console.log('✓ Placeholder icons written. Replace with real icons before launch.');
