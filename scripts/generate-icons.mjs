/**
 * Renders the PWA icon set from scripts/icon.svg using a headless Chromium.
 * Usage: node scripts/generate-icons.mjs  (requires playwright-core + a Chromium)
 */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
const out = (p) => new URL(`../public/icons/${p}`, import.meta.url);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

async function render(size, padding = 0, mark = svg) {
  const inner = Math.round(size * (1 - padding * 2));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#000;display:grid;place-items:center;width:${size}px;height:${size}px;overflow:hidden">
    <div style="width:${inner}px;height:${inner}px">${mark.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  return page.screenshot({ type: 'png', omitBackground: false });
}

const sos = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#000"/><circle cx="48" cy="48" r="28" fill="none" stroke="#fff" stroke-width="6"/><circle cx="48" cy="48" r="11" fill="none" stroke="#fff" stroke-width="6"/><path d="M28 28l12 12M56 56l12 12M68 28 56 40M40 56 28 68" stroke="#8fd3ff" stroke-width="6" stroke-linecap="round"/></svg>`;
const dashboard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#000"/><rect x="20" y="20" width="24" height="32" rx="7" fill="#fff"/><rect x="52" y="20" width="24" height="18" rx="7" fill="#fff" fill-opacity="0.55"/><rect x="20" y="58" width="24" height="18" rx="7" fill="#fff" fill-opacity="0.55"/><rect x="52" y="44" width="24" height="32" rx="7" fill="#8fd3ff"/></svg>`;

writeFileSync(out('icon-192.png'), await render(192));
writeFileSync(out('icon-512.png'), await render(512));
// Maskable: keep the mark inside the 80% safe zone.
writeFileSync(out('icon-maskable-512.png'), await render(512, 0.1));
writeFileSync(out('apple-touch-icon.png'), await render(180, 0.04));
writeFileSync(out('shortcut-sos.png'), await render(96, 0, sos));
writeFileSync(out('shortcut-dashboard.png'), await render(96, 0, dashboard));
await browser.close();
console.log('icons written');
