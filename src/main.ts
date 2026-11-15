import * as THREE from 'three';
import { Environment } from './env';
import { Ocean } from './ocean';
import { Wind } from './wind';
import { Boat } from './boat';
import { Input } from './input';
import { OrbitRig } from './camera';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = num('exp', 1.15);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.2, 20000);

const env = new Environment(scene);
env.time = num('t', 0.36);
env.timeScale = num('ts', 1);
const ocean = new Ocean(scene, env);
const wind = new Wind();
const boat = new Boat(scene, 0, 0, num('psi', 1.9));
const input = new Input(canvas);
const rig = new OrbitRig(camera);
rig.yawOffset = num('yaw', rig.yawOffset);
rig.pitch = num('pitch', rig.pitch);
rig.dist = num('dist', rig.dist);

const debugEl = document.getElementById('debug')!;
let debug = params.has('debug');
debugEl.style.display = debug ? 'block' : 'none';

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now();
let fps = 60;

function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;

  if (input.hit('Backquote')) {
    debug = !debug;
    debugEl.style.display = debug ? 'block' : 'none';
  }

  wind.update(dt);
  const t = env.elapsed + dt; // matches the value the shaders will see this frame
  boat.update(dt, t, { steer: input.axis('KeyD', 'KeyA'), sheet: input.axis('KeyS', 'KeyW') }, wind);
  rig.update(dt, t, input, boat.position, boat.state.psi);
  env.update(dt, camera.position, boat.position);
  ocean.update(boat.position, camera.position);

  renderer.render(scene, camera);

  if (debug) {
    const s = boat.state;
    const deg = (r: number) => ((r * 180) / Math.PI).toFixed(0);
    debugEl.textContent =
      `fps ${fps.toFixed(0)}  time ${(env.time * 24).toFixed(1)}h\n` +
      `speed ${s.u.toFixed(1)} m/s  heel ${deg(s.heel)}°\n` +
      `wind ${wind.speed.toFixed(1)} m/s  off bow ${deg(s.awa)}°\n` +
      `sheet ${deg(s.sheet)}°  boom ${deg(s.boom)}°  attack ${deg(s.alpha)}°\n` +
      `pos ${s.x.toFixed(0)}, ${s.z.toFixed(0)}`;
  }
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handle for automated screenshots and tuning
(window as any).__game = { env, boat, wind, rig, renderer, scene, camera };
