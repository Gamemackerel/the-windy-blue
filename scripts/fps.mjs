import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const q of process.argv.slice(2)) {
  await page.goto('http://localhost:5173/?' + q);
  await page.waitForTimeout(7000);
  console.log((await page.evaluate(() => window.__game.fps.toFixed(0))).padStart(4), 'fps  ', q);
}
await browser.close();
