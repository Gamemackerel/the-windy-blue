import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const st = () => ev(() => { const g = window.__game, p = g.player.pos; return `${g.player.mode} [${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}] boat ${g.boat.mode}`; });
// sail up near the greenhouse landing, anchor 9 m off, go over the side, swim in, haul out
await page.goto('http://localhost:5173/?new&boat&t=0.42&sea=0.2&ts=0&bx=-253&bz=-171&psi=0');
await page.waitForTimeout(3500);
await page.mouse.click(640, 360);
await page.keyboard.press('KeyF'); await page.waitForTimeout(900);
console.log('anchored:', await st());
await page.keyboard.press('KeyE'); await page.waitForTimeout(900);
console.log('standing in the boat:', await st());
// step over the side
await ev(() => { const g = window.__game; g.rig.yaw = g.boat.state.psi + Math.PI / 2 + Math.PI; g.rig.pitch = 0; });
await page.keyboard.down('KeyW'); for (let i = 0; i < 20; i++) { await page.waitForTimeout(150); if (await ev(() => window.__game.player.mode === 'swim')) break; } await page.keyboard.up('KeyW');
console.log('over the side:', await st());
await page.screenshot({ path: 'shots/swim1.png' });
// swim toward the landing (at -247, -156.5)
await page.keyboard.down('KeyW');
let out = false;
for (let i = 0; i < 60 && !out; i++) {
  await ev(() => { const g = window.__game, p = g.player.pos; g.rig.yaw = Math.atan2(p.x + 254, p.z + 156.6); g.rig.pitch = 0.0; });
  await page.waitForTimeout(400);
  if (i % 3 === 2) await page.keyboard.press('Space');
  out = await ev(() => window.__game.player.mode === 'foot' && window.__game.player.pos.z > -162);
}
await page.keyboard.up('KeyW');
console.log('hauled out:', out, await st());
// jump
await page.keyboard.press('Space'); await page.waitForTimeout(180);
console.log('mid jump y:', await ev(() => window.__game.player.pos.y.toFixed(2)));
await page.waitForTimeout(900);
// back to the boat: walk off the edge toward it, swim, board, weigh anchor
await page.keyboard.down('KeyW');
let aboard = false;
for (let i = 0; i < 80 && !aboard; i++) {
  await ev(() => { const g = window.__game, p = g.player.pos, b = g.boat.position; g.rig.yaw = Math.atan2(p.x - b.x, p.z - b.z); });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  aboard = await ev(() => window.__game.player.mode === 'sail');
}
await page.keyboard.up('KeyW');
console.log("back aboard:", aboard, await st()); await page.waitForTimeout(900);
await page.keyboard.press('KeyF'); await page.waitForTimeout(800);
console.log('anchor up:', await st());
// exhaustion: fast-forward the swim clock
await ev(() => { const g = window.__game; g.player.mode = 'swim'; g.player.pos.set(-100, -1.4, 0); g.player.swimT = 262; });
await page.waitForTimeout(6000);
await page.screenshot({ path: 'shots/swim_tired.png' });
console.log('tired dip:', await ev(() => window.__game.player.dip.toFixed(2)));
await ev(() => { window.__game.player.swimT = 318; });
await page.waitForTimeout(9000);
console.log('after drowning:', await st());
console.log('errors', errors.join(';') || 'none');
await browser.close();
