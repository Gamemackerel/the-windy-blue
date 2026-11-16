import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
for (const [name, q] of [['houseboat', 'cam=-640,3,362,-650,1.2,349'], ['raft', 'cam=236,2.5,-682,228,0.6,-690'], ['barge', 'cam=362,4,262,350,1.5,250'], ['home', 'cam=172,3,-738,164,1.5,-748']]) {
  await page.goto(`http://localhost:5173/?new&nosave&t=0.45&ts=0&sea=0.6&${q}`);
  await page.waitForTimeout(10000);
  const r = [];
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(700); r.push(await page.evaluate((n) => { const f = window.__game.floats.list.find((k) => k.name === n); return `${f.y.toFixed(2)}/${(f.rx * 57.3).toFixed(1)}/${(f.rz * 57.3).toFixed(1)} n${f.group.children.length}`; }, name)); }
  console.log(name, r.join('  '));
  await page.screenshot({ path: `shots/float_${name}.png` });
}
console.log('errors', errs.join(';') || 'none');
await browser.close();
