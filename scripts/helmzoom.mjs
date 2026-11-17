import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 2400, height: 1350 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?new&boat=sail&nosave&t=' + (process.argv[2] || '0.45') + '&ts=0&sea=0.1&bx=0&bz=-300&q=2');
await page.waitForTimeout(12000);
for (const [name, dyaw, pitch] of [['front', 2.6, 0.32], ['back', 0.5, 0.42]]) {
  await page.keyboard.press('KeyD'); await page.evaluate(([dy, p]) => { const g = window.__game; g.rig.dist = 4.5; g.rig.yaw = g.boat.state.psi + Math.PI + dy; g.rig.pitch = p; }, [dyaw, pitch]);
  await page.mouse.click(1200, 675); await page.keyboard.press('KeyA'); await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/helmz_${name}.png`, clip: { x: 700, y: 420, width: 1000, height: 700 } });
}
console.log('errors', errs.join(';') || 'none');
await browser.close();
