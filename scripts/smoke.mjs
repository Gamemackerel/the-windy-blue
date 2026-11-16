import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?report=2026-11-15_235355');
await page.waitForTimeout(11000);
// wait for the hand to be at the mouth
for (let i = 0; i < 120; i++) { const d = await page.evaluate(() => window.__game.npcs.find((n) => n.spec.key === 'watcher').drag); if (d > 0.97) break; await page.waitForTimeout(100); }
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/smoke_drag.png' });
await browser.close();
