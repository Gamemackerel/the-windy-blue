// Drives a whole playthrough through the game's own interactions and reports
// what happened at each step. Expects the dev server on :5173.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGE ' + e.message));
await page.goto('http://localhost:5173/?new&t=0.4&ts=0&sea=0.3&debug');
await page.waitForTimeout(2500);
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
let n = 0;
const shot = async (name) => page.screenshot({ path: `shots/flow_${String(++n).padStart(2, '0')}_${name}.png` });
const log = (...a) => console.log(...a);

// use the nearest enabled interactable to a point (teleporting the player there first)
const useAt = (x, y, z) => ev(([x, y, z]) => {
  const g = window.__game;
  g.player.mode = 'foot';
  g.player.pos.set(x, y, z);
  let best = null, bd = 1e9;
  for (const it of g.world.interactables) {
    if (it.enabled && !it.enabled()) continue;
    const d = Math.hypot(it.pos.x - x, it.pos.z - z) + Math.abs(it.pos.y - (y + 1)) * 0.5;
    if (d < it.radius + 0.5 && d < bd) { bd = d; best = it; }
  }
  if (!best) return 'nothing to use';
  best.use();
  return 'used';
}, [x, y, z]);
const flags = () => ev(() => JSON.stringify(window.__game.state.data.flags));
const items = () => ev(() => window.__game.state.data.items.join(','));
const I = { x: -700, z: -600 };

// ---- crane: load 1 + 3 units and work the winch
// pick each weight up and set it on the pan
for (const [x, z] of [[93, 13], [101, 2.5]]) {
  log('lift', await useAt(I.x + x, 1.6, I.z + z)); await wait(300);
  log('place', await useAt(I.x + 122.4, 1.6, I.z + 15.4)); await wait(700);
}
await wait(1200);
log('winch', await useAt(I.x + 120.2, 1.6, I.z + 17.2));
await wait(13500);
await shot('mast');
// ---- mirror: turn to face the loft (step 8, starts at 3)
for (let i = 0; i < 5; i++) { await useAt(I.x + 64, 1.6, I.z + 5); await wait(350); }
await wait(5000);
log('sail', await useAt(I.x + 64, 1.6, I.z - 16.8));
// ---- valves in order 1, 2, 3 marks
for (const x of [125, 121, 123]) { await useAt(I.x + x, 1.6, I.z + 2.2); await wait(400); }
await wait(24000);
log('rig sail', await useAt(I.x + 119, 1.6, I.z + 14));
log('island flags', await flags());
await shot('launched');
// ---- board the boat
await ev(() => { const g = window.__game; g.player.pos.copy(g.boat.mooring.dock); g.input.press('KeyE'); });
await wait(1200);
await ev(() => window.__game.input.press('KeyF'));   // weigh anchor
await wait(900);
log('mode', await ev(() => window.__game.player.mode + ' / boat ' + window.__game.boat.mode));

// moor helper: put the boat beside a mooring and press E
const moorAt = async (name) => {
  await ev((name) => { const g = window.__game; const m = g.world.moorings.find((k) => k.name === name); g.player.mode = 'sail'; g.boat.mode = 'sailing'; g.boat.mooring = null; g.boat.state.x = m.x + 2; g.boat.state.z = m.z + 2; g.boat.state.u = 0; g.player.busy = 0; }, name);
  await wait(300);
  await ev(() => window.__game.input.press('KeyF'));      // drop anchor
  await wait(700);
  await ev(() => window.__game.input.press('KeyE'));      // step ashore
  await wait(600);
  return ev(() => { const g = window.__game; return `${g.player.mode}, boat ${g.boat.mooring?.name} y=${g.player.pos.y.toFixed(2)}`; });
};
log('greenhouse', await moorAt('greenhouse'));
log('fruit', await useAt(-250 - 3.2, 3.4, -150 + 0.6), await items());
log('raft', await moorAt('raft'));
await ev(() => { const g = window.__game; g.player.setHeld('fruit'); });
log('offer fruit', await useAt(228 + 0.6, 0.36, -690 + 0.2));
await wait(5500);
await shot('fisher');
log('take key', await useAt(228 + 0.3, 0.36, -690 - 1.2), await items());
log('houseboat', await moorAt('houseboat'));
log('cigs', await useAt(-650 + 0.6, 0.74, 350 - 3.4), await items());
log('strongbox', await useAt(-650 - 0.8, 0.74, 350 - 1.2));
await wait(1600);
log('revolver', await useAt(-650 - 0.9, 0.74, 350 - 1.3), await items(), 'ammo', await ev(() => window.__game.state.flag('ammo')));
log('barge', await moorAt('barge'));
await ev(() => { window.__game.player.setHeld('cigarettes'); });
log('offer cigs', await useAt(350 + 2.0, 1.04, 250 + 1.8));
await wait(5500);
log('take wheel', await useAt(350 + 1.9, 1.04, 250 + 4.4), await items());
// ---- lab, dark
log('lab', await moorAt('lab'));
log('fit wheel', await useAt(720, 0.54, 220 - 2.2));
await wait(2600);
log('enter', await useAt(720, 0.54, 220 - 2.2));
await wait(2200);
log('in lab y', await ev(() => window.__game.player.pos.y.toFixed(1)));
await shot('lab_dark');
log('parts', await useAt(720 - 10.8, -14, 220 - 3.2), await useAt(720 - 10.2, -14, 220 - 3.2), await items());
log('journal dark', await useAt(720 - 7.6, -14, 220 + 3.3));
// ---- windmill
log('windmill', await moorAt('windmill'));
log('fit parts', await useAt(600 - 1.0, 118.6, 100 - 1.0));
// find the controls by their world positions through the game
const ctl = async (i) => ev((i) => { const g = window.__game; const its = g.world.interactables.filter((it) => Math.abs(it.pos.y - 119.8) < 1.2 && Math.hypot(it.pos.x - 600, it.pos.z - 100) < 4); return its.map((it) => `${it.pos.x.toFixed(1)},${it.pos.z.toFixed(1)}:${it.enabled ? it.enabled() : true}`).join(' '); }, i);
log('controls', await ctl());
const useCtl = (k) => ev((k) => { const g = window.__game; const its = g.world.interactables.filter((it) => it.pos.y > 119 && it.pos.y < 121 && Math.hypot(it.pos.x - 600, it.pos.z - 100) < 4); g.player.pos.set(600, 118.6, 101.3); its[k].use(); return 'ok'; }, k);
await useCtl(0); await wait(500);
log('after fit', await flags());
await useCtl(3); await wait(4500);            // pitch too early: refuses
log('early pitch -> power?', await ev(() => window.__game.state.flag('power')));
await useCtl(1); await wait(600);            // brake off
for (let i = 0; i < 12; i++) {
  const off = await ev(() => { const g = window.__game; return g.windmillOff ? g.windmillOff() : -1; });
  const need = await ev(() => { const g = window.__game; const yaw = ((g.state.flag('wmYaw') || 0) - 1) * Math.PI / 6; const d = yaw - (g.wind.dir + Math.PI); return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); });
  if (need < 0.3 && i > 0) break;
  await useCtl(2); await wait(3600);
}
await useCtl(3); await wait(3000);
log('power', await ev(() => window.__game.state.flag('power')));
await shot('nacelle');
await ev(() => { const g = window.__game; g.player.pos.set(600 - 0.8, 121.95, 100 + 1); });
await wait(8000);
await shot('windmill_top');
// ---- lab, lit
await ev(() => { const g = window.__game; g.player.pos.set(720 - 4, -14, 220 + 1); g.rig.yaw = 3.4; g.rig.pitch = 0.1; });
await wait(15000);
await shot('lab_lit');
log('lab flags', await ev(() => { const s = window.__game.state; return `labLit ${s.flag('labLit')} cab ${s.flag('cabOpen')}`; }));
log('bullet', await useAt(720 + 9.6, -14, 220 - 3.4), 'ammo', await ev(() => window.__game.state.flag('ammo')));
log('journal', await useAt(720 - 7.6, -14, 220 + 3.3));
await wait(800);
await shot('journal');
await ev(() => window.__game.input.press('KeyE'));
await wait(500);
// ---- shoot the smoker in the leg, then the fisher in the head
const shootJoint = (key, joint) => ev(([key, joint]) => {
  const g = window.__game; const n = g.npcs.find((k) => k.spec.key === key);
  const p = n.jointWorld(joint, new g.camera.position.constructor());
  g.player.mode = 'foot'; g.player.pos.set(p.x + 3, n.pos.y, p.z + 0.5); g.player.setHeld('revolver');
  g.camera.position.set(p.x + 4, p.y + 0.3, p.z + 0.6); g.camera.lookAt(p); g.camera.updateMatrixWorld();
  g.fire();
  return `${key} condition ${n.condition}, ammo ${g.state.flag('ammo')}`;
}, [key, joint]);
log(await shootJoint('smoker', 10));
await wait(2500);
await ev(() => { const g = window.__game; g.rig.yaw = 1.2; g.rig.pitch = 0.25; });
await wait(600);
await shot('smoker_wounded');
await ev(() => window.__game.state.set('ammo', 3));
log(await shootJoint('fisher', 2));
await wait(3500);
await shot('fisher_dead');
// ---- the giant
await ev(() => { const g = window.__game; g.player.mode = 'sail'; g.boat.mode = 'sailing'; g.boat.mooring = null; g.boat.state.x = -100; g.boat.state.z = 800 + 40; g.boat.state.u = 0; g.boat.state.psi = 3.14; g.rig.yaw = 0.3; g.rig.pitch = 0.05; });
await wait(17000);
await ev(() => { const g = window.__game; g.boat.state.x = -60; g.boat.state.z = 800 + 150; g.boat.state.u = 0; });
await wait(2500);
await shot('giant_up');
log('giant phase', await ev(() => window.__game.giant.phase));
await wait(9000);
await shot('giant_act');
log('giant phase', await ev(() => window.__game.giant.phase + ' boat ' + window.__game.boat.mode));
const kill = await ev(() => { const g = window.__game; const T = g.camera.position.constructor; const o = new T(), d = new T(); g.camera.getWorldPosition(o);
  // aim straight at an eye
  let eye = null; g.scene.traverse((m) => { if (!eye && m.isMesh && m.geometry.type === 'SphereGeometry' && Math.abs(m.geometry.parameters.radius - 0.027) < 1e-4) eye = m; });
  const p = new T(); eye.getWorldPosition(p); d.subVectors(p, o).normalize();
  return String(g.giant.shoot(o, d)) + ' eye at ' + p.x.toFixed(0) + ',' + p.y.toFixed(0) + ',' + p.z.toFixed(0); });
log('shot hits eye:', kill);
await wait(9000);
await shot('giant_dying');
await wait(11000);
await shot('giant_dead');
log('giant', await ev(() => window.__game.giant.phase + ' ' + JSON.stringify(Object.fromEntries(Object.entries(window.__game.state.data.flags).filter(([k]) => k.startsWith('giant'))))));
// ---- decay: go away past a dawn, twice
for (const name of ['rot', 'bones']) {
  await ev(() => { const g = window.__game; g.player.mode = 'foot'; g.player.pos.set(-700 + 74, 1.6, -600 + 20); g.boat.mode = 'moored'; g.boat.mooring = g.world.moorings[0]; g.state.data.day++; });
  await wait(1200);
  await ev(() => { const g = window.__game; g.player.mode = 'sail'; g.boat.mode = 'sailing'; g.boat.mooring = null; g.boat.state.x = -30; g.boat.state.z = 800 + 120; g.boat.state.u = 0; g.boat.state.psi = 3.6; g.rig.yaw = 0.9; g.rig.pitch = 0.06; g.rig.wantDist = 16; });
  await wait(3500);
  await shot('giant_' + name);
  log(name, await ev(() => window.__game.state.flag('giantPhase')));
}
log('ERRORS', errors.length ? errors.slice(0, 12).join('\n') : 'none');
await browser.close();
