// Screenshot the running game: node scripts/shot.mjs <name> "<query>" [waitMs]
// Expects the dev server on http://localhost:5173.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [name = 'shot', query = '', wait = '4000'] = process.argv.slice(2);
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5173/?${query}`);
await page.waitForTimeout(Number(wait));
const info = await page.evaluate(() => {
  const g = window.__game;
  if (!g) return 'no game handle';
  const s = g.boat.state;
  return `speed ${s.u.toFixed(2)} pos ${s.x.toFixed(1)},${s.z.toFixed(1)} calls ${g.renderer.info.render.calls} tris ${g.renderer.info.render.triangles}`;
});
console.log(info);
await page.screenshot({ path: `shots/${name}.png` });
await browser.close();
