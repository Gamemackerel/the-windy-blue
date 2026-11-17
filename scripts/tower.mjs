// The tower, end to end: note, door code, interior, stair, keeper, card, desk, jettison, the leap.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const shot = (n) => page.screenshot({ path: `shots/tw_${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5173/?new&nosave&t=0.45&ts=0&items=revolver&flags=ammo:3,power,hatch');
await wait(11000);
await page.mouse.click(640, 360);
const put = (x, y, z, yaw, pitch = 0) => ev(([x, y, z, yaw, pitch]) => { const g = window.__game; g.player.mode = 'foot'; g.player.pos.set(x, y, z); g.player.resetMotion(); g.rig.yaw = yaw; g.rig.pitch = pitch; }, [x, y, z, yaw, pitch]);
const T = await ev(() => { const g = window.__game; return { code: g.tower.code, enter: g.tower.enter.toArray(), roof: g.tower.roofY, seed: g.state.flag('seed') }; });
console.log('code', T.code.join(''), 'seed', T.seed);

// 1. the note: read it from the hand
await ev(() => { const g = window.__game; g.state.give('note'); g.player.setHeld('note'); });
await put(-640, 1.6, -560, 0); await wait(400);
await page.keyboard.press('KeyE'); await wait(700); await shot('note');
console.log('note page open:', await ev(() => document.getElementById('page').style.display));
await page.keyboard.press('KeyE'); await wait(400);

// 2. the keypad: type the code with the keys
const pad = await ev(() => { const g = window.__game, w = g.world; const it = w.interactables.filter((i) => Math.hypot(i.pos.x - 950, i.pos.z + 850) < 40 && i.pos.y > 60 && i.pos.y < 70); return it.map((i) => i.pos.toArray()); });
await put(pad[0][0], 63.2, pad[0][2], 0); await wait(500);
await page.keyboard.press('KeyE'); await wait(500);
// click each figure on the pad (keys in rows 1 2 3 / 4 5 6 / 7 8 9 / wipe 0 blank)
const KEYMAP = [1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 0, -2];
await ev(() => { const g = window.__game, T3 = g.THREE; const ks = []; g.scene.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.width === 0.24 && o.geometry.parameters.height === 0.24) ks.push(o); }); const v = new T3.Vector3(); for (const k of ks) v.add(k.getWorldPosition(new T3.Vector3())); v.multiplyScalar(1 / ks.length); { const p = g.player.pos, dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz); p.x = v.x + (dx / d) * 1.9; p.z = v.z + (dz / d) * 1.9; } g.camera.position.set(g.player.pos.x, g.player.pos.y + 1.64, g.player.pos.z); const c = g.camera.position; g.rig.yaw = Math.atan2(v.x - c.x, v.z - c.z) + Math.PI; g.rig.pitch = Math.atan2(c.y - v.y, Math.hypot(v.x - c.x, v.z - c.z)); });
await wait(900);
for (const d of T.code) {
  const xy = await ev((k) => { const g = window.__game, T3 = g.THREE; let m = null; g.scene.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.width === 0.24 && o.geometry.parameters.height === 0.24) { (window.__keys ??= new Set()).add(o); } }); const keys = [...window.__keys].sort((a, b) => a.id - b.id); m = keys[k]; const v = m.getWorldPosition(new T3.Vector3()).project(g.camera); return [(v.x + 1) * 640, (1 - v.y) * 360]; }, KEYMAP.indexOf(d));
  await page.mouse.move(xy[0], xy[1]); await wait(120); await page.mouse.down(); await page.mouse.up(); await wait(200);
}
await wait(1500); await shot('pad');
console.log('door open flag:', await ev(() => window.__game.state.flag('towerOpen')));
await wait(8000);
const doorAt = await ev(() => { const g = window.__game, its = g.world.interactables.filter((i) => Math.abs(i.pos.y - 64.4) < 0.3 && i.radius === 2.6 && Math.hypot(i.pos.x - 950, i.pos.z + 850) < 40); return its.map((i) => i.pos.toArray()); });
console.log('door candidates', JSON.stringify(doorAt));
const D = doorAt[doorAt.length - 1];
await put(D[0] + (D[0] - 950) * 0.02, 63.2, D[2] + (D[2] + 850) * 0.02, Math.atan2(950 - D[0], -850 - D[2]) + Math.PI); await wait(500);   // just outside, facing it
await console.log('at door:', await ev(() => { const g = window.__game, t = g.world.nearestInteractable(g.player.pos, g.player.yaw); return g.player.pos.toArray().map((v) => +v.toFixed(1)) + ' target ' + (t ? t.pos.toArray().map((v) => +v.toFixed(1)) + ' r' + t.radius : 'none') + ' busy ' + g.player.busy.toFixed(2); }));
await wait(600);
await page.keyboard.press('KeyE'); await wait(2500);     // go in
console.log('inside:', await ev(() => window.__game.tower.inside(window.__game.player.pos)), await ev(() => window.__game.player.pos.toArray().map((v) => +v.toFixed(1))));
await ev(() => { window.__game.rig.pitch = -0.5; }); await wait(600); await shot('atrium');

// 3. climb a little by walking: find the stair and go up it
const P0 = await ev(() => window.__game.player.pos.y);
await ev(() => { const g = window.__game, p = g.player.pos, cx = 950, cz = -850; const a = Math.atan2(p.x - cx, p.z - cz) + 0.5; g.player.pos.set(cx + Math.sin(a) * 20.5, p.y, cz + Math.cos(a) * 20.5); g.rig.yaw = a + Math.PI / 2 + Math.PI; g.rig.pitch = -0.2; });
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await wait(6000); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
console.log('climbed', (await ev(() => window.__game.player.pos.y) - P0).toFixed(1), 'm in 6 s');
await shot('stair');

// 4. the roof and the keeper
const K = await ev(() => { const k = window.__game.tower.keeper; return k.pos.toArray(); });
await put(K[0] + 2.6, T.roof, K[2] + 1.1, Math.atan2(-2.6, -1.1) + Math.PI, 0.02); await wait(1800); await shot('keeper');
await ev(() => { const g = window.__game; g.player.setHeld('revolver'); }); await wait(300);
// aim at his chest and fire
await ev(() => { const g = window.__game, k = g.tower.keeper; const c = k.chest, p = g.camera.position; g.rig.yaw = Math.atan2(c.x - p.x, c.z - p.z) + Math.PI; g.rig.pitch = Math.atan2(p.y - c.y, Math.hypot(c.x - p.x, c.z - p.z)); });
await wait(400); await ev(() => window.__game.fire());
await wait(2500);
console.log('keeper condition (2 = dead):', await ev(() => window.__game.tower.keeper.condition), 'player mode', await ev(() => window.__game.player.mode));
await ev(() => { const g = window.__game; g.state.give('keycard'); g.state.set('got_trade_keeper'); });

// 5. the gallery and the desk
await ev(() => { const g = window.__game; g.state.set('ctrlOpen'); });
const deskAt = await ev(() => { const g = window.__game, its = g.world.interactables.filter((i) => i.radius === 0.55); return its.map((i) => i.pos.toArray()); });
console.log('desk controls:', deskAt.length);
const mid = deskAt[1];
const dirx = 950 - mid[0], dirz = -850 - mid[2], dl = Math.hypot(dirx, dirz);
await put(mid[0] - (dirx / dl) * 1.4, T.roof - 12, mid[2] - (dirz / dl) * 1.4, Math.atan2(dirx, dirz) + Math.PI, 0.25);
await wait(2500); await shot('desk');
// work both procedures by using each control in turn
for (const i of [0, 1, 2, 3, 4, 5]) { await ev((i) => { const g = window.__game, its = g.world.interactables.filter((q) => q.radius === 0.55); its[i].use(); }, i); await wait(500); }
console.log('flooded', await ev(() => window.__game.state.flag('reactorFlooded')), 'jettisoned', await ev(() => window.__game.state.flag('jettisoned')));
await wait(7000); await shot('desk_after');
await wait(18000);
// 6. down in the atrium: the heap
await put(T.enter[0] * 0 + 950, 63.2, -850, Math.atan2(T.enter[0] - 950, T.enter[2] + 850) + Math.PI, 0.1); await wait(1500); await shot('heap');
// 7. the roof, the long view, the leap
await put(950 + 8, T.roof, -850 + 4, 0); await wait(2500);
console.log('ending stage on the roof:', await ev(() => window.__game.ending)); await shot('end_roof');
await page.keyboard.press('KeyE'); await wait(5000); await shot('end_fall');
console.log('stage while falling:', await ev(() => window.__game.ending));
await wait(9000);
console.log('final stage:', await ev(() => window.__game.ending), 'credits', await ev(() => document.getElementById('credits').style.display)); await wait(3500); await shot('credits');
console.log('errors', errs.join(';') || 'none');
await browser.close();
