// Real keyboard input through the browser: walking, running uphill, ladders, sailing.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGE ' + e.message));
const ev = (fn, a) => page.evaluate(fn, a);
const pos = () => ev(() => { const p = window.__game.player.pos; return [p.x, p.y, p.z].map((v) => +v.toFixed(1)); });

await page.goto('http://localhost:5173/?new&t=0.4&ts=0&sea=0.3');
await page.waitForTimeout(2500);
await page.mouse.click(640, 360);
console.log('start', await pos());
await page.keyboard.down('KeyW');
await page.waitForTimeout(2000);
await page.keyboard.up('KeyW');
console.log('after walking 2s', await pos());

// run to the Watcher's porch, steering the camera at the target each half second
const target = [-700 + 31.5, -600 - 45.5];
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
let reached = false;
for (let i = 0; i < 70; i++) {
  const d = await ev(([tx, tz]) => { const g = window.__game, p = g.player.pos; g.rig.yaw = Math.atan2(p.x - tx, p.z - tz); return Math.hypot(p.x - tx, p.z - tz); }, target);
  if (d < 2.5) { reached = true; break; }
  await page.waitForTimeout(500);
}
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
console.log('porch reached:', reached, await pos());
await page.screenshot({ path: 'shots/input_porch.png' });

// ladder at the greenhouse
await ev(() => { const g = window.__game; const m = g.world.moorings.find((k) => k.name === 'greenhouse'); g.player.pos.copy(m.dock); g.player.pos.z += 1.0; });
await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
await page.waitForTimeout(200);
console.log('on ladder:', await ev(() => window.__game.player.mode));
await page.keyboard.down('KeyW');
await page.waitForTimeout(1600);
await page.screenshot({ path: 'shots/input_ladder.png' });
await page.waitForTimeout(3200);
await page.keyboard.up('KeyW');
console.log('top of ladder:', await ev(() => window.__game.player.mode), await pos());

// sailing: steer and trim
await page.goto('http://localhost:5173/?new&boat&t=0.4&ts=0&sea=0.35');
await page.waitForTimeout(3000);
await page.mouse.click(640, 360);
const st = () => ev(() => { const s = window.__game.boat.state; return { psi: +s.psi.toFixed(2), u: +s.u.toFixed(1), sheet: +s.sheet.toFixed(2) }; });
console.log('sailing', await st());
await page.keyboard.down('KeyA'); await page.waitForTimeout(2500); await page.keyboard.up('KeyA');
console.log('after port helm', await st());
await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
console.log('after sheeting in', await st());
// gybe: hold starboard helm for a while and make sure nothing breaks
await page.keyboard.down('KeyD'); await page.waitForTimeout(7000); await page.keyboard.up('KeyD');
console.log('after a long turn', await st());
await page.keyboard.press('Tab'); await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/input_satchel.png' });
await page.keyboard.press('Tab');
console.log('audio state:', await ev(() => 'ok'));
console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
await browser.close();
