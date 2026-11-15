import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?' + process.argv[2]);
await page.waitForTimeout(6000);
const [, , , ...jobs] = process.argv;
for (let i = 0; i < jobs.length; i += 2) {
  await page.evaluate(jobs[i + 1]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/${jobs[i]}.png` });
  const px = await page.evaluate(() => 0);
}
await browser.close();
