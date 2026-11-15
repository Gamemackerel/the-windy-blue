import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Reports filed from inside the game (press R) are written into ./reports,
// one folder each: the screenshot, the note, and everything needed to put the
// game back in the same state (open the game with ?report=<folder name>).
export default defineConfig({
  build: { target: 'es2022' },
  server: { watch: { ignored: ['**/reports/**', '**/shots/**'] } },
  plugins: [{
    name: 'waterworld-reports',
    configureServer(server) {
      server.middlewares.use('/__report', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const d = new Date(), p2 = (n: number) => String(n).padStart(2, '0');
            let id = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
            const root = path.resolve(server.config.root, 'reports');
            while (fs.existsSync(path.join(root, id))) id += 'b';
            const dir = path.join(root, id);
            fs.mkdirSync(dir, { recursive: true });
            const m = /^data:image\/(png|jpeg);base64,(.*)$/.exec(body.shot ?? '');
            if (m) fs.writeFileSync(path.join(dir, m[1] === 'png' ? 'shot.png' : 'shot.jpg'), Buffer.from(m[2], 'base64'));
            fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ id, text: body.text, info: body.info, save: body.save }, null, 2));
            const i = body.info ?? {};
            fs.writeFileSync(path.join(dir, 'note.md'), `# ${id}\n\n${body.text || '(no note)'}\n\n- where: ${i.where}\n- position: ${i.pos}\n- looking: yaw ${i.yaw}, pitch ${i.pitch}\n- time of day: ${i.clock}, day ${i.day}\n- mode: ${i.mode}, holding: ${i.held}\n- quality: ${i.quality}, frame rate: ${i.fps}\n- reproduce: open the game with ?report=${id}\n- status: open\n`);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ id }));
          } catch (e) { res.statusCode = 500; res.end(String(e)); }
        });
      });
    },
  }],
});
