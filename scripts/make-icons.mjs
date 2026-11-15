// Renders the app icons (PNG) from one SVG design using the local Chromium.
// Run with: npm run icons
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

// glyphScale < 1 keeps the house inside the maskable safe zone (central 80%).
function svg({ rounded, glyphScale }) {
  const r = rounded ? 112 : 0;
  const s = glyphScale;
  const t = (512 - 512 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${r}" fill="#1f5135"/>
  <g transform="translate(${t} ${t}) scale(${s})" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">
    <path d="M96 236 256 104l160 132" stroke-width="36"/>
    <path d="M136 212v188h240V212" stroke-width="36"/>
    <path d="M196 302l44 44 80-88" stroke-width="40" stroke="#9fe3b8"/>
  </g>
</svg>`;
}

const icons = [
  { file: 'icon-192.png', size: 192, rounded: false, glyphScale: 0.9 },
  { file: 'icon-512.png', size: 512, rounded: false, glyphScale: 0.9 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, glyphScale: 0.7 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, glyphScale: 0.85 },
];

writeFileSync(new URL('favicon.svg', out), svg({ rounded: true, glyphScale: 0.9 }));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  const markup = svg(icon).replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" `);
  await page.setContent(`<html><body style="margin:0">${markup}</body></html>`);
  const png = await page.screenshot({ omitBackground: false });
  writeFileSync(new URL(icon.file, out), png);
  console.log('wrote', icon.file);
}
await browser.close();
