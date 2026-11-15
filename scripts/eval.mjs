import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?' + process.argv[2]);
await page.waitForTimeout(Number(process.argv[4] ?? 6000));
console.log(await page.evaluate(process.argv[3]));
await browser.close();
