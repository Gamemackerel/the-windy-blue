// node scripts/walkto.mjs "<query>" tx tz [seconds]  -> does holding W toward a target get there?
import { chromium } from 'playwright';
const [query, tx, tz, secs = '60'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?' + query);
await page.waitForTimeout(3000);
await page.mouse.click(640, 360);
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
let d = 0, reached = false;
for (let i = 0; i < Number(secs) * 2; i++) {
  d = await page.evaluate(([tx, tz]) => { const g = window.__game, p = g.player.pos; g.rig.yaw = Math.atan2(p.x - tx, p.z - tz); return Math.hypot(p.x - tx, p.z - tz); }, [Number(tx), Number(tz)]);
  if (d < 3) { reached = true; break; }
  await page.waitForTimeout(500);
}
console.log('reached', reached, 'dist', d.toFixed(1), await page.evaluate(() => { const p = window.__game.player.pos; return [p.x, p.y, p.z].map((v) => v.toFixed(1)).join(','); }));
await browser.close();
