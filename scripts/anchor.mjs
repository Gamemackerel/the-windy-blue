import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?new&boat=sail&nosave&t=0.45&ts=0&sea=0.1&bx=0&bz=-300&q=2');
await page.waitForTimeout(12000);
await page.mouse.click(800, 450);
const view = (dy, p, d) => page.evaluate(([dy, p, d]) => { const g = window.__game; g.rig.dist = d; g.rig.yaw = g.boat.state.psi + Math.PI + dy; g.rig.pitch = p; }, [dy, p, d]);
await view(0.9, 0.5, 2.9);
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/an_helm.png', clip: { x: 300, y: 150, width: 1000, height: 700 } });
await page.keyboard.down('KeyA'); await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/an_helmA.png', clip: { x: 300, y: 150, width: 1000, height: 700 } });
await page.keyboard.up('KeyA'); await page.waitForTimeout(600);
await page.keyboard.press('KeyF');
for (const ms of [450, 800, 1050]) { await page.waitForTimeout(ms === 450 ? 450 : ms === 800 ? 350 : 250); await page.screenshot({ path: `shots/an_${ms}.png`, clip: { x: 300, y: 150, width: 1000, height: 700 } }); }
console.log('k', await page.evaluate(() => window.__game.boat.anchorK.toFixed(2)), 'errors', errs.join(';') || 'none');
await browser.close();
