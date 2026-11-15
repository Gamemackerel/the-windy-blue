import * as THREE from 'three';
import { Environment } from './env';
import { Ocean } from './ocean';
import { Wind } from './wind';
import { Boat } from './boat';
import { Input } from './input';
import { OrbitRig } from './camera';
import { World } from './world';
import { GameState } from './state';
import { Player } from './player';
import { Ctx } from './ctx';
import { buildIsland } from './island';
import { buildRigs, PLACES } from './rigs';
import { Satchel, ItemId } from './items';
import { buildWindmill } from './windmill';
import { buildLab } from './lab';

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
{
  // a soft neutral environment so metal and glass have something to reflect
  const envScene = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 d; void main(){ float h = normalize(d).y; vec3 c = mix(vec3(0.62, 0.62, 0.6), vec3(0.3, 0.36, 0.42), smoothstep(0.0, 0.8, h)); c = mix(vec3(0.05, 0.07, 0.09), c, smoothstep(-0.15, 0.05, h)); gl_FragColor = vec4(c, 1.0); }',
  }));
  envScene.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
}
const camera = new THREE.PerspectiveCamera(52, 1, 0.15, 20000);

// ---- state ----
const state = new GameState();
if (params.has('new')) GameState.wipe();
state.load(!params.has('nosave') && !params.has('new'));
if (params.has('boat')) for (const f of ['mast', 'sailTaken', 'sailRigged', 'loft', 'flooded']) state.set(f);
if (params.has('flags')) for (const f of params.get('flags')!.split(',')) { const [k, v] = f.split(':'); state.set(k, v ? Number(v) : 1); }

const env = new Environment(scene);
env.time = num('t', state.loaded ? state.data.time : 0.3);
env.timeScale = num('ts', 1);
const ocean = new Ocean(scene, env);
const wind = new Wind();
const world = new World();
const boat = new Boat(scene, 0, 0, 0);
boat.mode = 'cradle';
const input = new Input(canvas);
const rig = new OrbitRig(camera);

const _hand = new THREE.Vector3();
const player = new Player(scene, world, boat, state);
const fadeEl = document.getElementById('fade')!;
const pageEl = document.getElementById('page')!;
let reading = false;
const ctx: Ctx = {
  scene, world, env, boat, state, wind,
  playerHand: () => player.handWorld(_hand),
  playerPos: () => player.pos,
  held: () => player.held,
  takeHeld: () => { if (player.held) { state.take(player.held); player.setHeld(null); } },
  fade: (fn, hold = 0.45) => {
    player.busy = Math.max(player.busy, hold + 0.5);
    fadeEl.style.opacity = '1';
    world.after(0.4, () => { fn(); player.resetMotion(); rig.snap(); world.after(hold - 0.3, () => { fadeEl.style.opacity = '0'; }); });
  },
  turnView: (d) => { rig.yaw += d; player.yaw += d; },
  read: (text) => { (pageEl.firstElementChild as HTMLElement).textContent = text; pageEl.style.display = 'flex'; reading = true; player.busy = 0.3; },
  sfx: () => {},
};
const island = buildIsland(ctx);
const npcs = buildRigs(ctx);
const windmill = buildWindmill(ctx);
const lab = buildLab(ctx);
const satchel = new Satchel(ctx, (id) => player.setHeld(id), () => player.held);

// ---- where everyone starts ----
{
  const sv = state.data;
  if (state.loaded) {
    const m = world.moorings.find((k) => k.name === sv.boat.mooring);
    if (state.flag('flooded')) {
      if (m) { boat.mode = 'moored'; boat.mooring = m; boat.state.x = m.x; boat.state.z = m.z; boat.state.psi = m.psi; }
      else { boat.mode = 'sailing'; boat.state.x = sv.boat.x; boat.state.z = sv.boat.z; boat.state.psi = sv.boat.psi; }
    }
    player.place(sv.player.x, sv.player.y, sv.player.z, sv.player.yaw);
    if (sv.player.mode === 'sail' && boat.mode === 'sailing') player.mode = 'sail';
    else if (boat.mode === 'sailing') { // never leave the boat adrift without its sailor
      player.mode = 'sail';
    }
  } else {
    player.place(island.start.x, island.start.y, island.start.z, 1.2);
  }
  if (params.has('boat') && !state.loaded) {
    boat.mode = 'sailing';
    boat.state.x = num('bx', island.mooring.x + 60); boat.state.z = num('bz', island.mooring.z);
    boat.state.psi = num('psi', 1.6);
    player.mode = 'sail';
  }
  if (params.has('items')) for (const id of params.get('items')!.split(',')) state.give(id);
  if (params.has('hold')) player.setHeld(params.get('hold') as ItemId);
  if (params.has('at')) {
    const [x, z] = params.get('at')!.split(',').map(Number);
    player.mode = 'foot';
    player.place(x, params.has('aty') ? num('aty', 0) : world.groundAt(x, z, 1000), z, num('face', 0));
  }
  rig.yaw = num('yaw', player.mode === 'sail' ? boat.state.psi + Math.PI + 0.35 : player.yaw + Math.PI);
  rig.pitch = num('pitch', 0.2);
}

const debugEl = document.getElementById('debug')!;
let debug = params.has('debug');
debugEl.style.display = debug ? 'block' : 'none';
const fixedCam = params.has('cam') ? params.get('cam')!.split(',').map(Number) : null;

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
let saveTimer = 0;
const focus = new THREE.Vector3();

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
  const prevTime = env.time;
  if (reading) {
    player.busy = Math.max(player.busy, 0.2);
    if (input.hit('KeyE') || input.hit('Escape') || input.hit('Space')) { reading = false; pageEl.style.display = 'none'; }
    input.endFrame();
  } else satchel.update(dt, t, input);
  if (satchel.open) player.busy = Math.max(player.busy, 0.15);
  world.update(dt, t);

  const sailing = player.mode === 'sail';
  const helm = sailing && player.busy <= 0
    ? { steer: input.axis('KeyD', 'KeyA'), sheet: input.axis('KeyS', 'KeyW') }
    : { steer: 0, sheet: 0 };
  boat.update(dt, t, helm, wind, world);
  player.update(dt, t, input, rig.yaw, wind);

  // camera
  player.focus(focus);
  const indoors = windmill.inside(player.pos) || lab.inside();
  const zone = player.mode === 'sail' ? 'sail' : indoors ? 'in' : player.mode;
  const wantDist = zone === 'sail' ? 12 : zone === 'in' ? 2.9 : zone === 'climb' ? 4.5 : 5.2;
  if (rigMode !== zone) { rig.wantDist = wantDist; rigMode = zone; }
  rig.height = player.mode === 'sail' ? 1.8 : 1.45;
  rig.submerged = lab.inside();
  rig.update(dt, t, input, focus, player.mode === 'sail' ? boat.state.psi : null, world);
  if (fixedCam) {
    camera.position.set(fixedCam[0], fixedCam[1], fixedCam[2]);
    camera.lookAt(fixedCam[3], fixedCam[4], fixedCam[5]);
  }

  // shadows hug the action
  const sc = env.sun.shadow.camera;
  const ext = player.mode === 'sail' ? 9 : 16;
  if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }

  env.update(dt, camera.position, focus);
  ocean.update(focus, camera.position);
  const submerged = env.under.amount > 0.5;
  scene.environmentIntensity = (0.12 + 0.6 * env.daylight) * (1 - env.under.amount * 0.75);
  ocean.mesh.visible = !submerged;
  env.sky.visible = !submerged;
  scene.background = submerged ? env.fog.color : null;
  renderer.render(scene, camera);
  satchel.render(renderer, camera.aspect);
  if (env.time < prevTime) { state.data.day++; state.touch(); } // midnight passed

  // quiet autosave
  state.data.time = env.time;
  state.data.boat.x = boat.state.x; state.data.boat.z = boat.state.z; state.data.boat.psi = boat.state.psi;
  saveTimer += dt;
  if (saveTimer > 3) { saveTimer = 0; state.flush(!params.has('nosave')); }

  if (debug) {
    const s = boat.state;
    const deg = (r: number) => ((r * 180) / Math.PI).toFixed(0);
    debugEl.textContent =
      `fps ${fps.toFixed(0)}  time ${(env.time * 24).toFixed(1)}h  ${player.mode}\n` +
      `speed ${s.u.toFixed(1)} m/s  heel ${deg(s.heel)}°\n` +
      `wind ${wind.speed.toFixed(1)} m/s  off bow ${deg(s.awa)}°\n` +
      `sheet ${deg(s.sheet)}°  boom ${deg(s.boom)}°  attack ${deg(s.alpha)}°\n` +
      `player ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}\n` +
      `calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}`;
  }
  input.endFrame();
  requestAnimationFrame(frame);
}
let rigMode = '';
requestAnimationFrame(frame);

// handle for automated screenshots and tuning
(window as any).__game = { env, boat, wind, rig, renderer, scene, camera, player, world, state, input, npcs, satchel, PLACES };
