// The title menu: first visit (Start), then a return visit (Continue / New game)
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const vis = () => page.evaluate(() => [...document.querySelectorAll('#title button')].filter((b) => b.offsetParent !== null).map((b) => b.textContent).join(' | ') || '(menu hidden)');
await page.goto('http://localhost:5173/');
await page.waitForTimeout(11000);
console.log('first visit:', await vis());
await page.screenshot({ path: 'shots/title.png' });
await page.click('#titleStart');
await page.waitForTimeout(5500);
console.log('keys shown:', await page.evaluate(() => document.getElementById('keys').textContent + ' @' + document.getElementById('keys').style.opacity));
console.log('after Start:', await vis(), await page.evaluate(() => { const g = window.__game; return g.player.mode + ' input ' + (g.input.suspended ? 'held' : 'live'); }));
await page.screenshot({ path: 'shots/title_after.png' });
await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW');   // move, so there is something to save
await page.evaluate(() => { window.__game.state.touch(); window.__game.state.flush(true); });
await page.reload();
await page.waitForTimeout(10000);
console.log('second visit:', await vis());
await page.click('#titleStart');           // "New game": wipes and comes straight back in
await page.waitForTimeout(10000);
console.log('after New game:', await vis(), await page.evaluate(() => 'loaded save: ' + window.__game.state.loaded));
console.log('errors', errs.join(';') || 'none');
await browser.close();
