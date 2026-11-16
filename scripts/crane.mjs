// Crane: carry a weight, set it down with Q, overload the pan, and try the winch underweight
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
await page.goto('http://localhost:5173/?new&nosave&t=0.42&ts=0&at=-607.6,-587&yaw=3.3&pitch=0.3');
await page.waitForTimeout(11000);
await page.mouse.click(640, 360);
await page.keyboard.press('KeyE'); await page.waitForTimeout(900);
console.log('picked up:', await ev(() => window.__game.player.encumbered));
await page.keyboard.down('KeyW'); await page.waitForTimeout(1000); await page.keyboard.up('KeyW');
await page.screenshot({ path: 'shots/carry.png' });
await page.keyboard.press('KeyQ'); await page.waitForTimeout(900);
console.log('after Q, carrying:', await ev(() => window.__game.player.encumbered));
// the winch with nothing on the pan: the jib swings, stops at the rail and comes back
await ev(() => { const g = window.__game; g.player.pos.set(-579.6, 1.6, -582.2); g.rig.yaw = 0.6; g.rig.pitch = -0.25; });
await page.waitForTimeout(600);
await page.keyboard.press('KeyE');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/crane_under.png' });
await page.waitForTimeout(3500);
console.log('mast stepped after underweight pull (want 0):', await ev(() => window.__game.state.flag('mast')));
console.log('errors', errs.join(';') || 'none');
await browser.close();
