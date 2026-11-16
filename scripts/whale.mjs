import { chromium } from 'playwright';
const kind = process.argv[2] || 'whale', offs = (process.argv[3] || '1.5,2.6,3.6').split(',').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?new&boat=sail&nosave&t=0.45&ts=0&sea=0.25&bx=0&bz=-300&pitch=0.12');
await page.waitForTimeout(11000);
await page.evaluate((k) => { const g = window.__game; g.rig.dist = 30; g.fauna.trigger(k); }, kind);
let last = 0;
for (const o of offs) { await page.waitForTimeout((o - last) * 1000); last = o; await page.screenshot({ path: `shots/fa_${kind}_${o}.png` }); }
console.log('active', await page.evaluate(() => window.__game.fauna.active), 'errors', errs.join(';') || 'none');
await browser.close();
