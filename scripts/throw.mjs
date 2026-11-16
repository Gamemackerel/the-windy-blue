// The giant picks up a swimmer, looks, and throws: node scripts/throw.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?new&boat=sail&nosave&bx=-100&bz=930&psi=3.14&wake&t=0.42&ts=0&sea=0.1');
await page.waitForTimeout(24000);
await page.evaluate(() => { const g = window.__game; g.player.mode = 'swim'; g.player.pos.set(-60, -1.3, 900); g.boat.mode = 'moored'; g.boat.mooring = { name: 'anchor', x: g.boat.state.x, z: g.boat.state.z, psi: 0, dock: g.player.pos.clone() }; });
let last = '', flown = false;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => { const g = window.__game, p = g.player.pos; return `${g.giant.phase}/${g.player.mode} ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}`; });
  const key = r.split(' ')[0];
  if (key !== last) { console.log(i, r); last = key; if (key === 'hold/held') await page.waitForTimeout(5000); await page.screenshot({ path: `shots/throw_${key.replace('/', '_')}.png` }); }
  if (r.includes('/flung')) flown = true;
  if (flown && !r.includes('/flung')) { console.log('landed', r); break; }
}
await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.__game; g.rig.yaw += 0; });
console.log('errors', errs.join(';') || 'none');
await browser.close();
