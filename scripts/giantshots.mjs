import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/?new&boat&bx=-100&bz=850&psi=0.4&t=' + (process.argv[2] ?? '0.45') + '&ts=0&debug');
await page.waitForTimeout(16000);
const seen = new Set();
for (let i = 0; i < 46; i++) {
  await page.waitForTimeout(1500);
  const ph = await page.evaluate(() => {
    const g = window.__game, s = g.boat.state;
    // keep the boat circling at a steady distance so the giant has something to play with
    const a = Math.atan2(s.x + 100, s.z - 800), d = Math.hypot(s.x + 100, s.z - 800);
    if (g.boat.mode === 'sailing') { const r = 135; s.x += (-100 + Math.sin(a) * r - s.x) * 0.02; s.z += (800 + Math.cos(a) * r - s.z) * 0.02; }
    g.rig.yaw = a + 0.25; g.rig.pitch = 0.04;
    return g.giant.phase + '|' + g.boat.mode + '|' + d.toFixed(0);
  });
  const phase = ph.split('|')[0];
  const key = phase + (seen.has(phase) ? '2' : '');
  if (!seen.has(key) && phase !== 'watch') { seen.add(key); await page.waitForTimeout(phase === 'slap' ? 2600 : 3000); await page.screenshot({ path: `shots/g_${process.argv[3] ?? ''}${key}.png` }); console.log('captured', key, ph); }
}
console.log('errors', errors.join('\n') || 'none');
await browser.close();
