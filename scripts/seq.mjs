// Several screenshots over time: node scripts/seq.mjs <name> "<query>" t1,t2,... (seconds)
import { chromium } from 'playwright';
const [name = 'seq', query = '', times = '10'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5173/?${query}`);
let last = 0;
for (const t of times.split(',').map(Number)) {
  await page.waitForTimeout((t - last) * 1000); last = t;
  await page.screenshot({ path: `shots/${name}_${t}.png` });
  console.log(t, await page.evaluate(() => window.__game.giant.phase));
}
await browser.close();
