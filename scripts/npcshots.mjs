import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/?new&t=0.42&ts=0&items=revolver&hold=revolver&flags=ammo:6');
await page.waitForTimeout(2500);
const ev = (fn, a) => page.evaluate(fn, a);
// stand on the barge near the smoker, aim at a leg, fire
const shoot = (key, joint, ox, oz) => ev(([key, joint, ox, oz]) => {
  const g = window.__game; const n = g.npcs.find((k) => k.spec.key === key);
  const T = g.camera.position.constructor;
  const p = n.jointWorld(joint, new T());
  g.player.mode = 'foot'; g.player.pos.set(n.pos.x + ox, n.pos.y, n.pos.z + oz);
  const o = new T(g.player.pos.x, g.player.pos.y + 1.5, g.player.pos.z);
  const d = p.clone().sub(o).normalize();
  // fire along the line from the player's eye to the joint
  const saveP = g.camera.position.clone(), saveQ = g.camera.quaternion.clone();
  g.camera.position.copy(o); g.camera.lookAt(p); g.camera.updateMatrixWorld();
  g.fire();
  g.camera.position.copy(saveP); g.camera.quaternion.copy(saveQ);
  g.rig.yaw = Math.atan2(ox, oz) + 0.5; g.rig.pitch = 0.3; g.rig.snap();
  return `${key}: condition ${n.condition}`;
}, [key, joint, ox, oz]);
console.log(await shoot('smoker', 10, -2.6, -0.4));
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/npc_knock.png' });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/npc_wounded.png' });
console.log(await shoot('watcher', 2, 3.2, 1.2));
await page.waitForTimeout(450);
await page.screenshot({ path: 'shots/npc_ragdoll1.png' });
await page.waitForTimeout(3500);
await page.screenshot({ path: 'shots/npc_ragdoll2.png' });
console.log(await shoot('fisher', 1, -2.2, -0.6));
await page.waitForTimeout(4000);
await page.screenshot({ path: 'shots/npc_ragdoll3.png' });
console.log('errors', errors.join('\n') || 'none');
await browser.close();
