import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(10000);
// sample how hard the letters lean over 20 s, and catch a calm frame and a gusty one
let calm = 1e9, gust = -1;
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => Math.max(...[...document.querySelectorAll('#titleName span:not(.gap)')].map((e) => Math.abs(parseFloat((/skewX\(([-\d.]+)/.exec(e.style.transform) || [0, 0])[1])))));
  if (m < calm) { calm = m; await page.screenshot({ path: 'shots/title_calm.png' }); }
  if (m > gust) { gust = m; await page.screenshot({ path: 'shots/title_gust.png' }); }
}
console.log('lean range (deg skew):', calm.toFixed(1), '..', gust.toFixed(1), 'errors', errs.join(';') || 'none');
await browser.close();
