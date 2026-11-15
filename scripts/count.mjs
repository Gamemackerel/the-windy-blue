import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?' + (process.argv[2] ?? 'new'));
await page.waitForTimeout(Number(process.argv[3] ?? 4000));
console.log(await page.evaluate(() => {
  const g = window.__game; const rows = [];
  for (const c of g.scene.children) { let n = 0; c.traverseVisible((o) => { if (o.isMesh || o.isPoints || o.isSprite) n++; }); if (n > 12) rows.push(n + ' ' + (c.type) + ' @' + c.position.x.toFixed(0) + ',' + c.position.z.toFixed(0)); }
  let total = 0; g.scene.traverseVisible((o) => { if (o.isMesh) total++; });
  return rows.sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 14).join('\n') + '\nvisible meshes ' + total + '  calls ' + g.renderer.info.render.calls + '  top-level ' + g.scene.children.length;
}));
await browser.close();
