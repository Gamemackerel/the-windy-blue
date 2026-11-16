import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?new&boat=sail&nosave&bx=-100&bz=930&psi=3.14&wake&t=0.42&ts=0&sea=0.1');
await page.waitForTimeout(25000);
// put the boat on the inside edge of the reef, as a shove from the giant would
await page.evaluate(() => { const g = window.__game, s = g.boat.state; s.x = -100; s.z = 800 + 190; s.u = 0; });
const st = () => page.evaluate(() => { const g = window.__game, p = g.player.pos; return `${g.giant.phase} boat:${g.boat.mode}${g.boat.stranded ? '(stranded)' : ''} player:${g.player.mode} ${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)}`; });
await page.waitForTimeout(1500);
console.log('after grounding:', await st());
await page.screenshot({ path: 'shots/strand.png' });
let last = '';
for (let i = 0; i < 45; i++) { await page.waitForTimeout(1000); const r = await st(); const k = r.split(' ').slice(0, 3).join(' '); if (k !== last) { console.log(i, r); last = k; } if (r.includes('-581')) break; }
console.log('errors', errs.join(';') || 'none');
await browser.close();
