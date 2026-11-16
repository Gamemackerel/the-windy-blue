import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
// 1. a storm with the helping hand on the sheet: should survive
await page.goto('http://localhost:5173/?new&boat&t=0.42&sea=1&ts=0&bx=0&bz=0&psi=2.0');
await page.waitForTimeout(18000);
console.log('assisted, 15 s of storm:', await ev(() => { const g = window.__game, s = g.boat.state; return `${g.player.mode} heel ${(s.heel * 57.3).toFixed(0)} speed ${s.u.toFixed(1)} side ${s.side.toFixed(0)}`; }));
// 2. haul the sheet hard in across the wind and hold it: should go over
await page.mouse.click(640, 360);
await ev(() => { const g = window.__game; g.boat.state.psi = g.wind.dir + Math.PI / 2; });
await page.keyboard.down('KeyW');
let over = false;
for (let i = 0; i < 24 && !over; i++) { await page.waitForTimeout(500); over = await ev(() => window.__game.player.mode !== 'sail'); }
await page.keyboard.up('KeyW');
console.log('sheet held in, beam to the storm -> capsized:', over);
// 3. the great wave, taken on the beam and then bow-on
for (const [name, off] of [['beam-on', Math.PI / 2], ['bow-on', Math.PI]]) {
  await page.goto('http://localhost:5173/?new&boat&t=0.42&sea=0.9&ts=0&bx=0&bz=0');
  await page.waitForTimeout(3000);
  await ev((off) => { const g = window.__game; g.weather.raise(g.boat.state.x, g.boat.state.z, g.wind, 11); window.__off = off; }, off);
  let res = 'survived', peak = 0;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(500);
    const r = await ev(() => { const g = window.__game, s = g.boat.state; s.psi = g.wind.dir + window.__off; s.r = 0; s.sheet = 1.45; s.trimAssist = 0; return [g.player.mode, g.boat.position.y]; });
    peak = Math.max(peak, r[1]);
    if (name === 'beam-on' && i === 50) await page.screenshot({ path: 'shots/rogue.png' });
    if (r[0] !== 'sail') { res = 'capsized'; break; }
  }
  console.log(`great wave ${name}: ${res}, boat lifted ${peak.toFixed(1)} m`);
}
console.log('errors', errors.join(';') || 'none');
await browser.close();
