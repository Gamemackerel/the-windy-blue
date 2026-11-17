import * as THREE from 'three';
import { Environment } from './env';
import { Ocean } from './ocean';
import { Wind } from './wind';
import { Boat } from './boat';
import { Input } from './input';
import { ViewRig } from './camera';
import { makeItem, addPickup } from './items';
import { World } from './world';
import { GameState } from './state';
import { Player } from './player';
import { Ctx } from './ctx';
import { buildIsland, ISLAND, islandHeight } from './island';
import { buildRigs, PLACES, HOME } from './rigs';
import { Satchel, ItemId } from './items';
import { buildWindmill, WINDMILL } from './windmill';
import { buildLab, LAB } from './lab';
import { buildAtoll, ATOLL, atollHeight } from './giant';
import { buildTower, TOWER } from './tower';
import { noteHtml } from './glyphs';
import { buildFauna, FaunaKind } from './fauna';
import { Floats } from './floats';
import { floraTick } from './plants';
import { bumpHeight, waveHeight } from './waves';
import { J } from './figure';
import { Audio } from './audio';
import { mergeStatic } from './build';
import { Post } from './post';
import { scatterJunk } from './junk';
import { Arms } from './arms';
import { Weather } from './weather';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.AgXToneMapping;
const baseExposure = num('exp', 1.0);
renderer.toneMappingExposure = baseExposure;
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
const camera = new THREE.PerspectiveCamera(62, 1, 0.07, 20000);
scene.add(camera); // the held item rides on the camera
const post = new Post(renderer);

// ---- state ----
const state = new GameState();
if (params.has('new')) GameState.wipe();
// ?report=<id> puts the game back exactly where a filed report was taken (nothing is saved while looking at one)
const reportId = params.get('report');
let reportInfo: any = null;
if (reportId) {
  try {
    const r = await (await fetch(`/reports/${reportId}/report.json`)).json();
    state.data = { ...state.data, ...r.save };
    state.loaded = true;
    reportInfo = r.info;
  } catch { console.warn('could not load report', reportId); }
}
const noSave = params.has('nosave') || !!reportId;
if (!reportId) state.load(!params.has('nosave') && !params.has('new'));
if (params.has('boat')) for (const f of ['mast', 'sailTaken', 'sailRigged', 'loft', 'flooded']) state.set(f);
if (params.has('flags')) for (const f of params.get('flags')!.split(',')) { const [k, v] = f.split(':'); state.set(k, v ? Number(v) : 1); }
if (params.has('day')) state.data.day = num('day', 0);

const env = new Environment(scene);
env.time = num('t', state.loaded ? state.data.time : 0.3);
env.timeScale = num('ts', 1);
env.days = num('days', state.data.day + env.time);
const ocean = new Ocean(scene, env);
const wind = new Wind();
const weather = new Weather();
if (params.has('sea')) weather.fixed = num('sea', 0.35);
weather.onRogue = () => audio.play('rogue', undefined, 1.6);
const world = new World();
const boat = new Boat(scene, 0, 0, 0);
boat.mode = 'cradle';
const input = new Input(canvas);
const rig = new ViewRig(camera);
const audio = new Audio(camera);

const _hand = new THREE.Vector3();
const player = new Player(scene, world, boat, state);
const fadeEl = document.getElementById('fade')!;
const pageEl = document.getElementById('page')!;
const dotEl = document.getElementById('dot')!;
let reading = false;
let carry: { obj: THREE.Object3D; size: number; drop: () => void } | null = null;
const arms = new Arms(camera);
const markEl = document.getElementById('mark')!;
const _mk = new THREE.Vector3(), _g0 = new THREE.Vector3(), _g1 = new THREE.Vector3(), _held = new THREE.Vector3();
let scopeT = 0;
let scopeDone: (() => void) | null = null, scopeAt: THREE.Vector3 | null = null;
const scopeEl = document.getElementById('scope')!;
const ctx: Ctx = {
  scene, world, env, boat, state, wind, input,
  hold: (s) => { player.busy = Math.max(player.busy, s); },
  // the offering hand is just in front of and below the eyes
  playerHand: () => camera.getWorldDirection(_hand).multiplyScalar(0.55).add(camera.position).setY(camera.position.y - 0.28),
  playerPos: () => player.pos,
  held: () => player.held,
  takeHeld: () => { if (player.held) { state.take(player.held); player.setHeld(null); } },
  fade: (fn, hold = 0.45) => {
    player.busy = Math.max(player.busy, hold + 0.5);
    fadeEl.style.opacity = '1';
    world.after(0.4, () => { fn(); player.resetMotion(); rig.snap(); world.after(Math.max(0.05, hold - 0.3), () => { fadeEl.style.opacity = '0'; }); });
  },
  turnView: (d) => { rig.yaw += d; player.yaw += d; },
  setHeld: (id) => player.setHeld(id as ItemId | null),
  view: camera,
  setCarry: (c) => {
    carry = c;
    arms.carry = c ? { obj: c.obj, size: c.size } : null;
    player.encumbered = !!c;
    player.dropHook = c ? () => { c.drop(); return true; } : null;
  },
  scope: (on, at, done) => {
    scopeDone?.();
    scopeDone = on ? done ?? null : null;
    scopeAt = on && at ? at.clone() : null;
    rig.scope = on;
    scopeT = 0;
    scopeEl.style.opacity = on ? '1' : '0';
    if (on) { rig.pitch = Math.min(rig.pitch, 0.05); player.busy = 0.4; }
  },
  scopeView: () => (rig.scope ? { yaw: rig.yaw, pitch: rig.pitch } : null),
  read: (text) => { const pg = pageEl.firstElementChild as HTMLElement; if (text.startsWith('<')) pg.innerHTML = text; else pg.textContent = text; pageEl.style.display = 'flex'; reading = true; player.busy = 0.3; audio.play('page'); },
  sfx: (name, pos, gain) => audio.play(name, pos, gain),
};

// ---- the world ----
const island = buildIsland(ctx);
const npcs = buildRigs(ctx);
const windmill = buildWindmill(ctx);
const lab = buildLab(ctx);
let pushX = 0, pushZ = 0, wrecking = false;
let homeT = 2;
/** 0: playing. 1: on the roof with nothing left to do. 2: falling. 3: over. */
let ending = 0;
const leap = new THREE.Vector3(), endCam = new THREE.Vector3();
const creditsEl = document.getElementById('credits')!;
const deepEl = document.getElementById('deep')!;
let turnTo = 0;   // seconds left of being turned to face the giant after it picks you up
const giant = buildAtoll(ctx, {
  wreck: wreckBoat, push: (ax, az) => { pushX += ax; pushZ += az; },
  stranded: () => boat.stranded,
  kill: () => killed(),
  swimming: () => player.mode === 'swim',
  hold: (on) => {
    if (on) { player.mode = 'held'; player.dropHook?.(); turnTo = 2.2; }
    else if (player.mode === 'held') player.mode = 'swim';
  },
  held: () => player.mode === 'held',
  fling: () => fling(),
  keepOut: (x, z, r) => { if (boat.mode !== 'sailing') return; const s = boat.state, d = Math.hypot(s.x - x, s.z - z); if (d < r) { const k = r / Math.max(d, 0.1); s.x = x + (s.x - x) * k; s.z = z + (s.z - z) * k; } },
});
const tower = buildTower(ctx, {
  // a security screen's picture: the plain scene from a fixed camera, with the sea and sky put back for the moment
  feed: (cam, rt) => {
    const ov = ocean.mesh.visible, sv = env.sky.visible, av = arms.group.visible, vv = viewModel.visible;
    ocean.mesh.visible = env.sky.visible = true; arms.group.visible = viewModel.visible = false;
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
    ocean.mesh.visible = ov; env.sky.visible = sv; arms.group.visible = av; viewModel.visible = vv;
  },
  kill: () => killed(),
});
npcs.push(tower.keeper);
player.useHeld = () => { if (player.held !== 'note') return false; ctx.read(noteHtml(state.flag('seed'))); return true; };
// the message in the bottle: washed up on the shingle north of the dock
{
  let lz = 22;
  while (lz < 70 && islandHeight(ISLAND.x + 97, ISLAND.z + lz) > 0.5) lz += 0.5;
  const at = new THREE.Vector3(ISLAND.x + 97, islandHeight(ISLAND.x + 97, ISLAND.z + lz) + 0.05, ISLAND.z + lz);
  addPickup(ctx, 'note', 'note', at, { scale: 1.7, rot: 0.7, radius: 1.8, onTake: () => { player.setHeld('note'); ctx.read(noteHtml(state.flag('seed'))); } });
}
const fauna = buildFauna(ctx, {
  push: (ax, az) => { pushX += ax; pushZ += az; },
  use: () => input.hit('KeyE') && !paused,
  bullet: () => { state.set('ammo', state.flag('ammo') + 1); },
  outdoors: () => !lab.inside() && !tower.inside(player.pos) && !island.indoors(player.pos) && !windmill.inside(player.pos),
});
if (params.has('fauna')) world.after(9, () => fauna.trigger(params.get('fauna') as FaunaKind));
ocean.setShoal(ATOLL.x, ATOLL.z, ATOLL.r - 14, ATOLL.hole);
ocean.addShore(ISLAND.x, ISLAND.z, 480, islandHeight);
ocean.addShore(ATOLL.x, ATOLL.z, 580, atollHeight);
if (params.has('wake')) world.after(1, () => giant.wake());
const satchel = new Satchel(ctx, (id) => player.setHeld(id), () => player.held);
boat.setPatches(state.data.boat.patches);
const junkCount = scatterJunk(ctx);
// the things that float are gathered up so they can ride the swell (see floats.ts)
const floats = new Floats(scene, [
  { name: 'houseboat', x: PLACES.houseboat.x, z: PLACES.houseboat.z + 0.5, hx: 3.0, hz: 6.4, live: 0.8 },
  { name: 'raft', x: PLACES.raft.x, z: PLACES.raft.z, hx: 3.3, hz: 3.3, live: 1.25 },
  { name: 'barge', x: PLACES.barge.x, z: PLACES.barge.z, hx: 3.6, hz: 8.2, live: 0.5 },
  { name: 'home', x: HOME.x, z: HOME.z, hx: 4.4, hz: 3.9, live: 0.45 },
], new Set<THREE.Object3D>([ocean.mesh, env.sky, boat.group, player.figure.group, ...npcs.map((n) => n.figure.group)]));
for (const n of npcs) floats.ride(n.figure.group, () => n.condition === 2);
world.updaters.push((dt, t) => { floats.update(dt, t); floraTick(t, wind.speed); });
const merged = mergeStatic(scene);

// ---- keeping the frame cheap ----
// 1. Every lit surface pays for every point light, so only the four nearest lamps are ever switched on.
//    (Always exactly four, so the shaders never need rebuilding.)
const lamps: THREE.PointLight[] = [];
scene.traverse((o) => { if ((o as THREE.PointLight).isPointLight) lamps.push(o as THREE.PointLight); });
// 2. Anything that would cover only a few pixels is not drawn at all.
const cullable: { o: THREE.Object3D; c: THREE.Vector3; r: number; moves: boolean }[] = [];
{
  const box = new THREE.Box3(), sph = new THREE.Sphere();
  for (const o of scene.children) {
    if (!((o as THREE.Mesh).isMesh || o.type === 'Group') || o === ocean.mesh || o === env.sky || o === boat.group || o === player.figure.group || (o as any).isInstancedMesh || o.userData.noCull) continue;
    box.setFromObject(o);
    if (box.isEmpty()) continue;
    box.getBoundingSphere(sph);
    cullable.push({ o, c: sph.center.clone(), r: Math.max(sph.radius, 0.3), moves: o.position.lengthSq() > 1 });   // anything with a place of its own may be moved (a carried weight); merged scenery sits at the origin
  }
}
const culled = new Set<THREE.Object3D>();
let cullT = 0;
const _lampP = new THREE.Vector3();
function cullPass(dt: number) {
  if ((cullT -= dt) > 0) return;
  cullT = 0.25;
  const p = camera.position;
  for (const l of lamps) l.userData.d = l.getWorldPosition(_lampP).distanceToSquared(p) / Math.max(l.distance * l.distance, 1);
  lamps.sort((a, b) => a.userData.d - b.userData.d);
  for (let i = 0; i < lamps.length; i++) lamps[i].visible = i < 4;
  const k = rig.scope ? 0.00007 * rig.scopeFov : 0.004;      // through the telescope, small things matter
  for (const e of cullable) {
    const d = (e.moves ? e.o.position : e.c).distanceTo(p);
    const tiny = e.r / Math.max(d, 1) < k;
    if (tiny && e.o.visible) { e.o.visible = false; culled.add(e.o); }
    else if (!tiny && culled.has(e.o)) { e.o.visible = true; culled.delete(e.o); }
  }
}
cullPass(1);
if (params.has('debug')) console.log(`${junkCount} junk objects; merged ${merged.before} static parts into ${merged.after}`);

/** put the boat back where it was built: afloat in the dock, or on its blocks if the dock has been pumped out */
function boatHome() {
  const m = island.mooring;
  boat.sinking = 0; boat.stranded = false;
  if (state.flag('flooded')) { boat.mode = 'moored'; boat.mooring = m; } else { boat.mode = 'cradle'; boat.mooring = null; }
  boat.state.x = m.x; boat.state.z = m.z; boat.state.psi = m.psi; boat.state.u = boat.state.v = 0;
  state.data.boat.mooring = m.name;
}
/** driven onto the reef: the boat breaks where it lies and its sailor is left standing beside it */
function strandBoat() {
  if (boat.stranded || wrecking) return;
  const s = boat.state;
  boat.stranded = true;
  boat.mode = 'moored';
  boat.mooring = { name: 'wreck', x: s.x, z: s.z, psi: s.psi, dock: new THREE.Vector3(s.x, 0, s.z) };
  s.u = s.v = 0;
  audio.play('wreck', boat.position, 2);
  // step out on the landward side
  let bx = s.x, bz = s.z, bh = -99;
  for (let a = 0; a < 6.28; a += 0.4) { const x = s.x + Math.sin(a) * 3.2, z = s.z + Math.cos(a) * 3.2, h = world.terrainHeight(x, z); if (h > bh) { bh = h; bx = x; bz = z; } }
  player.mode = 'foot';
  player.place(bx, Math.max(bh, 0), bz, 0);
  player.busy = 1.2;
  state.data.boat.patches++;
  state.touch();
}
/** the giant's hand comes down on someone with no boat to hide in: wake at home, beside a boat made good */
function killed() {
  if (wrecking) return;
  wrecking = true;
  audio.play('wreck', player.pos, 2);
  player.busy = 5;
  ctx.fade(() => {
    boatHome();
    boat.setPatches(state.data.boat.patches);
    const m = island.mooring;
    player.mode = 'foot'; player.swimT = 0; player.dip = 0;
    player.place(m.dock.x, m.dock.y, m.dock.z, 0);
    env.time = (env.time + 0.15) % 1;
    state.touch(); state.flush(true);
    wrecking = false;
  }, 2.2);
}
/** thrown by the giant: pick somewhere out at sea and work out the throw that lands there */
function fling() {
  const g = 12;
  let dx = 0, dz = 0;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.283, d = 1100 + Math.random() * 700;
    dx = ATOLL.x + Math.sin(a) * d; dz = ATOLL.z + Math.cos(a) * d;
    if (world.terrainHeight(dx, dz) > -3) continue;
    if (Object.values(PLACES).some((p) => Math.hypot(p.x - dx, p.z - dz) < 70)) continue;
    if (Math.hypot(dx - ISLAND.x, dz - ISLAND.z) < 260 || Math.hypot(dx - TOWER.x, dz - TOWER.z) < 80) continue;
    break;
  }
  const p = player.pos, dist = Math.hypot(dx - p.x, dz - p.z), T = THREE.MathUtils.clamp(dist / 80, 9, 22);
  player.fly.set((dx - p.x) / T, (0 - p.y) / T + 0.5 * g * T, (dz - p.z) / T);
  player.mode = 'flung';
  audio.play('giant-blow', p, 1.5);
}

/** the giant has broken the boat: wake on the slip beside a patched hull */
function wreckBoat() {
  if (wrecking || boat.mode !== 'sailing') return;
  wrecking = true;
  audio.play('wreck', boat.position, 2);
  boat.sinking = 1;
  ctx.fade(() => {
    const m = island.mooring;
    boatHome();
    player.mode = 'foot';
    player.place(m.dock.x, m.dock.y, m.dock.z, 0);
    state.data.boat.patches++;
    boat.setPatches(state.data.boat.patches);
    env.time = (env.time + 0.12) % 1;
    state.touch(); state.flush(true);
    wrecking = false;
  }, 3.4);
}

// ---- where everyone starts ----
{
  const sv = state.data;
  if (state.loaded) {
    const m = world.moorings.find((k) => k.name === sv.boat.mooring);
    if (state.flag('flooded')) {
      if (m) { boat.mode = 'moored'; boat.mooring = m; boat.state.x = m.x; boat.state.z = m.z; boat.state.psi = m.psi; }
      else if (sv.boat.mooring === 'anchor') { boat.mode = 'moored'; boat.state.x = sv.boat.x; boat.state.z = sv.boat.z; boat.state.psi = sv.boat.psi; boat.mooring = { name: 'anchor', x: sv.boat.x, z: sv.boat.z, psi: sv.boat.psi, dock: new THREE.Vector3(sv.boat.x, 0, sv.boat.z) }; }
      else { boat.mode = 'sailing'; boat.state.x = sv.boat.x; boat.state.z = sv.boat.z; boat.state.psi = sv.boat.psi; }
    }
    player.place(sv.player.x, sv.player.y, sv.player.z, sv.player.yaw);
    if (boat.mode === 'sailing') player.mode = 'sail'; // never leave the boat adrift without its sailor
    else if (sv.player.mode === 'sail' && boat.mode === 'moored') player.mode = 'sail';
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
  rig.yaw = num('yaw', player.mode === 'sail' ? boat.state.psi + Math.PI : player.yaw + Math.PI);
  rig.pitch = num('pitch', 0.04);
  if (reportInfo) { rig.yaw = reportInfo.yaw; rig.pitch = reportInfo.pitch; if (reportInfo.held) player.setHeld(reportInfo.held); }
}

const debugEl = document.getElementById('debug')!;
let debug = params.has('debug');
debugEl.style.display = debug ? 'block' : 'none';
const fixedCam = params.has('cam') ? params.get('cam')!.split(',').map(Number) : null;

// ---- the title: shown on a plain visit, over the view the game is about to begin with, dimmed a little ----
const titleEl = document.getElementById('title')!;
let title = location.search === '' && sessionStorage.getItem('ww-skip-title') === null;
sessionStorage.removeItem('ww-skip-title');
if (title) {
  const cont = document.getElementById('titleContinue')!, start = document.getElementById('titleStart')!;
  cont.style.display = state.loaded ? '' : 'none';
  start.textContent = state.loaded ? 'New game' : 'Start';
  titleEl.style.display = 'flex';
  // The name is written on a flag nobody can see. The flag is fixed along its left edge and the wind runs through it:
  // waves travel from the hoist to the fly, growing as they go, and the cloth folds toward and away from the eye, so
  // the letters ripple together, foreshorten where the cloth turns away, and darken in the troughs of the folds.
  // Gusts come and go: in a lull the free end sags and the waves slow; in a gust it streams out and snaps.
  {
    const h1 = document.getElementById('titleName')!;
    const view = document.createElement('canvas');
    view.style.display = 'block';
    view.style.filter = 'drop-shadow(0 2px 10px rgba(0, 12, 24, 0.6))';   // the shadow goes on the whole picture, after the cloth is drawn, so the slices never show
    h1.appendChild(view);
    const text = document.createElement('canvas');
    const vc = view.getContext('2d')!, tc = text.getContext('2d')!;
    const font = (px: number) => `italic 400 ${px}px "Cochin", "Hoefler Text", "Baskerville", "Palatino Linotype", "Book Antiqua", Georgia, serif`;
    let W = 0, H = 0, dpr = 1, pad = 0;
    const layout = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      const px = Math.max(44, Math.min(132, innerWidth * 0.095));
      tc.font = font(px);
      const tw = tc.measureText('Windy Blue').width;
      pad = px * 0.55;                                         // room for the cloth to move into
      W = Math.ceil(tw + pad * 2); H = Math.ceil(px * 1.9);
      for (const c of [view, text]) { c.width = W * dpr; c.height = H * dpr; }
      view.style.width = W + 'px'; view.style.height = H + 'px';
      tc.setTransform(dpr, 0, 0, dpr, 0, 0);
      tc.clearRect(0, 0, W, H);
      tc.font = font(px); tc.textBaseline = 'middle'; tc.fillStyle = '#f3f1ea';
      tc.fillText('Windy Blue', pad, H / 2);
    };
    layout();
    addEventListener('resize', layout);
    const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
    const noise = (x: number) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };
    let gust = 0.5, phase = 0, last = performance.now();
    const blow = (now: number) => {
      if (!title && titleEl.style.display === 'none') return;
      const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000; last = now;
      // the wind: long lulls and gusts, and the cloth answers it with a little lag
      const want = 0.25 + 0.75 * Math.pow(noise(t * 0.22) * 0.7 + noise(t * 0.61 + 9) * 0.3, 1.6);
      gust += (want - gust) * Math.min(1, dt * 1.4);
      phase += dt * (1.6 + 3.2 * gust);
      vc.setTransform(1, 0, 0, 1, 0, 0);
      vc.clearRect(0, 0, view.width, view.height);
      const SW = 2 * dpr, cols = Math.ceil(view.width / SW), Hd = view.height, P = pad * dpr, span = view.width - 2 * P;
      let x = P;                                                // where the cloth has got to across the screen
      for (let c = 0; c < cols; c++) {
        const sx = c * SW, u = Math.max(0, (sx - P) / span);   // 0 at the hoist .. 1 at the fly
        const amp = Math.pow(u, 0.85) * (0.05 + 0.07 * gust) * Hd;
        const k = 2.6 + 1.4 * gust;                             // waves along the flag
        const a1 = u * k * Math.PI * 2 - phase, a2 = u * k * 4.1 - phase * 1.7 + 1.3;
        const lift = Math.sin(a1) + 0.35 * Math.sin(a2);
        const slope = Math.cos(a1) + 0.5 * Math.cos(a2);
        const sag = u * u * (1 - gust) * 0.12 * Hd;             // in a lull the free end droops
        const dy = amp * lift * 0.55 + sag;
        // the cloth turning away from the eye takes up less width across the screen
        const turn = Math.min(1, Math.abs(slope) * amp / Hd * 3.5);
        const w = SW * (1 - 0.32 * turn * turn);
        const drawX = sx < P ? sx : x;
        vc.drawImage(text, sx, 0, SW, Hd, drawX, dy, w + 0.6, Hd);
        // folds: what faces away from the light is darker
        const shade = Math.max(0, 0.3 * slope * Math.min(1, u * 4) * (0.5 + gust));
        if (shade > 0.01) {
          vc.globalCompositeOperation = 'source-atop';
          vc.fillStyle = `rgba(10, 22, 34, ${shade.toFixed(3)})`;
          vc.fillRect(Math.round(drawX), 0, Math.max(1, Math.round(drawX + w) - Math.round(drawX)), Hd);   // edge to edge on whole pixels, so no strip is darkened twice
          vc.globalCompositeOperation = 'source-over';
        }
        if (sx >= P) x += w; else x = sx + SW;
      }
      requestAnimationFrame(blow);
    };
    requestAnimationFrame(blow);
  }
  input.suspended = true;
  const begin = () => {
    // the view is already the right one: the dimming simply lifts
    titleEl.style.opacity = '0'; titleEl.style.pointerEvents = 'none';
    setTimeout(() => { titleEl.style.display = 'none'; }, 1300);
    try { (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* the first click in the game will capture the mouse */ }
    title = false; input.suspended = false;
  };
  cont.addEventListener('click', begin);
  start.addEventListener('click', () => {
    if (!state.loaded) { begin(); return; }
    GameState.wipe();                                  // a fresh world needs a fresh load; come straight back in without the title
    sessionStorage.setItem('ww-skip-title', '1');
    location.reload();
  });
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(w, h, renderer.getPixelRatio());
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- the revolver ----
const flash = new THREE.PointLight('#ffd9a0', 0, 30, 1.5);
scene.add(flash);
const aimDir = new THREE.Vector3(), _o = new THREE.Vector3(), _j = new THREE.Vector3();
let kick = 0;
function fire() {
  const ammo = state.flag('ammo');
  if (ammo <= 0) { audio.play('dry', player.pos); return; }
  state.set('ammo', ammo - 1);
  audio.play('shot', player.pos, 2.5);
  player.handWorld(flash.position);
  flash.intensity = 400;
  kick = 0.07;
  camera.getWorldPosition(_o);
  camera.getWorldDirection(aimDir);
  // people first: the nearest joint the line passes through
  let best: { n: (typeof npcs)[number]; joint: number; d: number } | null = null;
  for (const n of npcs) for (let j = 0; j < J.COUNT; j++) {
    n.jointWorld(j, _j).sub(_o);
    const along = _j.dot(aimDir);
    if (along < 0.5 || along > 400) continue;
    const miss = Math.sqrt(Math.max(0, _j.lengthSq() - along * along));
    const r = j === J.head ? 0.15 : j === J.chest || j === J.hips ? 0.22 : 0.11;
    if (miss < r && (!best || along < best.d)) best = { n, joint: j, d: along };
  }
  if (best) best.n.hit(best.joint, aimDir);
  if (!best || best.n !== tower.keeper) tower.answer();      // fire on the roof and miss him, and he does not miss
  if (best) return;
  giant.shoot(_o, aimDir);
}

// ---- reports: R takes a picture and asks what is wrong; the note is written into ./reports ----
const reportEl = document.getElementById('report')!, reportText = document.getElementById('reportText') as HTMLTextAreaElement;
const reportMeta = document.getElementById('reportMeta')!;
let reporting = false, reportShot = '';
function whereAmI() {
  const p = player.pos, near = (x: number, z: number, r: number) => Math.hypot(p.x - x, p.z - z) < r;
  if (lab.inside()) return 'laboratory';
  if (near(ISLAND.x, ISLAND.z, 260)) return island.indoors(p) ? 'starting island, indoors' : 'starting island';
  if (near(ATOLL.x, ATOLL.z, 320)) return 'atoll';
  if (near(WINDMILL.x, WINDMILL.z, 40)) return 'windmill';
  if (near(LAB.x, LAB.z, 30)) return 'laboratory pontoon';
  if (near(TOWER.x, TOWER.z, 120)) return 'black tower';
  for (const [k, v] of Object.entries(PLACES)) if (near(v.x, v.z, 45)) return k;
  return 'open sea';
}
function openReport() {
  reportShot = canvas.toDataURL('image/jpeg', 0.92);
  reporting = true;
  input.suspended = true;
  document.exitPointerLock?.();
  (document.getElementById('reportShot') as HTMLImageElement).src = reportShot;
  reportMeta.textContent = `${whereAmI()}  ·  ${player.pos.x.toFixed(0)}, ${player.pos.y.toFixed(0)}, ${player.pos.z.toFixed(0)}`;
  reportEl.style.display = 'flex';
  reportText.value = '';
  setTimeout(() => reportText.focus(), 30);
}
function closeReport() { reporting = false; input.suspended = false; reportEl.style.display = 'none'; reportText.blur(); }
async function sendReport() {
  const p = player.pos, h = Math.floor(env.time * 24), mi = Math.floor((env.time * 24 - h) * 60);
  state.data.time = env.time;
  const info = {
    where: whereAmI(), pos: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), yaw: +rig.yaw.toFixed(4), pitch: +rig.pitch.toFixed(4),
    clock: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, day: state.data.day, mode: player.mode, held: player.held, quality: ['low', 'medium', 'high'][quality],
    fps: Math.round(fps), giant: giant.phase, view: [innerWidth, innerHeight, devicePixelRatio], boat: { mode: boat.mode, x: +boat.state.x.toFixed(1), z: +boat.state.z.toFixed(1), psi: +boat.state.psi.toFixed(3) },
  };
  reportMeta.textContent = 'sending…';
  try {
    const r = await fetch('/__report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: reportText.value.trim(), shot: reportShot, info, save: state.data }) });
    if (!r.ok) throw new Error(String(r.status));
    reportMeta.textContent = `saved as reports/${(await r.json()).id}`;
    setTimeout(closeReport, 900);
  } catch {
    reportMeta.textContent = 'could not save: reports only work while the game is run with "npm run dev"';
  }
}
document.getElementById('reportSend')!.addEventListener('click', sendReport);
document.getElementById('reportCancel')!.addEventListener('click', closeReport);
reportText.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeReport();
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReport();
  e.stopPropagation();
});

// ---- pause menu and quality ----
const pauseEl = document.getElementById('pause')!;
const hintEl = document.getElementById('hint')!;
let paused = false;
let aimOn = false;
let calmT = 0, cine = 0, cineDist = 11, holdT = 0, holdPsi = 0;
let baseRatio = 1, resScale = 1, slowT = 0, fastT = 0, frameMs = 16;
let quality = params.has('q') ? num('q', 2) : Number(localStorage.getItem('ww-quality') ?? 2);
function applyQuality(q: number, remember = true) {
  quality = q;
  // drawing at a screen's full density costs four times the pixels for little gain: High stops at 1.5
  baseRatio = [0.7 * Math.min(devicePixelRatio, 1), Math.min(devicePixelRatio, 1), Math.min(devicePixelRatio, 1.5)][q];
  resScale = 1;
  renderer.setPixelRatio(baseRatio);
  renderer.shadowMap.enabled = q > 0;
  post.setQuality(q);
  if (params.has('noao')) post.ao = false;
  if (params.has('norays')) post.rays = false;
  if (params.has('nobloom')) post.bloom = false;
  env.sun.shadow.mapSize.setScalar(num('shadow', q >= 2 ? 3072 : 2048));
  if (params.has('msaa')) post.setSamples(num('msaa', 4));
  if (env.sun.shadow.map) { env.sun.shadow.map.dispose(); (env.sun.shadow as any).map = null; }
  env.sun.castShadow = q > 0;
  resize();
  if (remember) localStorage.setItem('ww-quality', String(q));
  pauseEl.querySelectorAll<HTMLElement>('[data-q]').forEach((b) => b.classList.toggle('on', Number(b.dataset.q) === q));
}
function setSound(on: boolean) {
  audio.enabled = on;
  localStorage.setItem('ww-sound', on ? '1' : '0');
  pauseEl.querySelectorAll<HTMLElement>('[data-s]').forEach((b) => b.classList.toggle('on', (b.dataset.s === '1') === on));
}
function setPaused(p: boolean) {
  paused = p;
  pauseEl.style.display = p ? 'flex' : 'none';
  if (p) document.exitPointerLock?.();
  state.flush(true);
}
pauseEl.querySelectorAll<HTMLElement>('[data-q]').forEach((b) => b.addEventListener('click', () => applyQuality(Number(b.dataset.q))));
pauseEl.querySelectorAll<HTMLElement>('[data-s]').forEach((b) => b.addEventListener('click', () => setSound(b.dataset.s === '1')));
document.getElementById('resume')!.addEventListener('click', () => setPaused(false));
document.getElementById('newgame')!.addEventListener('click', () => { GameState.wipe(); sessionStorage.setItem('ww-skip-title', '1'); if (location.search) location.search = ''; else location.reload(); });
applyQuality(quality, false);
setSound(localStorage.getItem('ww-sound') !== '0');
// ---- the few words the game ever says about its controls ----
const keysEl = document.getElementById('keys')!;
const hints = location.search === '';                 // never in test or report views
let keysT = 0, sailSlow = 0, nagT = 0;
const WALK_KEYS = '<b>↑ ↓ ← →</b>move<i>·</i><b>E</b>interact<i>·</i><b>Tab</b>satchel';
const SAIL_KEYS = '<b>A D</b>tiller<i>·</i><b>W S</b>haul in, let out<br><b>F</b>anchor<i>·</i><b>E</b>ashore<i>·</i><b>Wheel</b>view<i>·</i><b>H</b>this';
function showKeys(html: string, secs: number) { keysEl.innerHTML = html; keysEl.style.opacity = '0.9'; keysT = secs; }
function hideKeys() { keysEl.style.opacity = '0'; keysT = 0; }
function nag(text: string, secs: number) { hintEl.textContent = text; hintEl.style.opacity = '0.6'; nagT = secs; }
let walkHint = hints ? (state.loaded ? 40 : 2.5) : -1;     // seconds until the first words appear, once the game is under way
let idleT = 0, sinceHelp = 0;
// on a first run, step the quality down if the machine is struggling
let probe = localStorage.getItem('ww-quality') === null ? 0 : -1, probeFrames = 0;

let last = performance.now();
let fps = 60;
let saveTimer = 0;
let wakeT = 0, wakeI = 0;
let wasPulledBack = false;
const focus = new THREE.Vector3(), eyePos = new THREE.Vector3();
const viewModel = new THREE.Group();
camera.add(viewModel);
let viewHeld: string | null = null;
const safe = new THREE.Vector3().copy(player.pos);
// open on black and let the world come up slowly
fadeEl.style.transition = 'none'; fadeEl.style.opacity = '1';
let shownFrames = 0;

function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;

  if (input.hit('Backquote')) {
    debug = !debug;
    debugEl.style.display = debug ? 'block' : 'none';
  }
  if (input.hit('Escape') && !aimOn && !title && !ending && !satchel.open && !reading && !tower.padActive() && !rig.scope) setPaused(!paused);
  if (paused || reporting) { input.endFrame(); post.render(scene, camera, env.elapsed, env.air); requestAnimationFrame(frame); return; }
  // Dynamic resolution: if frames are taking too long, draw slightly fewer pixels; when there is room, restore them.
  frameMs += (dt * 1000 - frameMs) * 0.08;
  if (!document.hidden && !params.has('fixedres')) {
    slowT = frameMs > 19.5 ? slowT + dt : 0;
    fastT = frameMs < 15.5 ? fastT + dt : 0;
    let next = resScale;
    if (slowT > 1.2 && resScale > 0.62) next = Math.max(0.62, resScale - 0.1);
    else if (fastT > 6 && resScale < 1) next = Math.min(1, resScale + 0.1);
    if (next !== resScale) { resScale = next; slowT = fastT = 0; renderer.setPixelRatio(baseRatio * resScale); resize(); }
  }
  if (probe >= 0 && !document.hidden) {
    probe += dt; probeFrames++;
    if (probe > 6) {
      const avg = probeFrames / probe;
      if (avg < 34 && quality > 0) { applyQuality(quality - 1); probe = 0; probeFrames = 0; }
      else { localStorage.setItem('ww-quality', String(quality)); probe = -1; }
    }
  }

  weather.update(dt, wind, env, player.pos);
  wind.update(dt);
  const t = env.elapsed + dt; // matches the value the shaders will see this frame
  const prevTime = env.time;
  if (reading) {
    player.busy = Math.max(player.busy, 0.2);
    if (input.hit('KeyE') || input.hit('Escape') || input.hit('Space')) { reading = false; pageEl.style.display = 'none'; }
    input.endFrame();
  } else if (!tower.padActive()) satchel.update(dt, t, input);
  if (satchel.open) player.busy = Math.max(player.busy, 0.15);

  // at the telescope: nothing but looking, until E or any step away
  if (rig.scope) {
    scopeT += dt;
    if (scopeT > 0.4 && (input.hit('KeyE') || input.hit('Escape') || input.hit('Space') || input.mouseHit(0) || input.axis('KeyS', 'KeyW') !== 0 || input.axis('KeyA', 'KeyD') !== 0)) { ctx.scope(false); player.busy = 0.3; input.endFrame(); }
    else player.busy = Math.max(player.busy, 0.05);   // hands and feet stay still while the eye is at the glass
  }
  // aiming and firing
  // both hands are on tiller and sheet while the boat is under way: nothing else can be held
  if (player.mode === 'sail' && boat.mode === 'sailing' && player.held) player.setHeld(null);
  // the revolver: a click brings it up to the eye; a click then fires; Esc, or any step, lowers it again
  const canAim = player.held === 'revolver' && player.busy <= 0 && player.mode !== 'climb' && !satchel.open && !reading;
  if (!canAim) aimOn = false;
  else if (aimOn) {
    if (input.hit('Escape') || input.axis('KeyS', 'KeyW') !== 0 || input.axis('KeyA', 'KeyD') !== 0 || input.hit('Space')) { aimOn = false; input.endFrame(); }
  } else if (input.mouseHit(0) && input.locked) { aimOn = true; input.endFrame(); }
  const aiming = aimOn;
  rig.aim = aiming;
  dotEl.style.opacity = aiming ? '0.85' : '0';
  if (aiming) { camera.getWorldDirection(aimDir); player.aimDir = aimDir; if (input.mouseHit(0)) fire(); }
  else player.aimDir = null;
  flash.intensity *= Math.max(0, 1 - dt * 30);
  if (kick > 0) { rig.pitch -= kick * dt * 6; kick = Math.max(0, kick - dt * 0.5); }

  world.update(dt, t);

  const sailing = player.mode === 'sail';
  const helm = sailing && player.busy <= 0
    ? { steer: input.axis('KeyD', 'KeyA'), sheet: input.axis('KeyS', 'KeyW') }
    : { steer: 0, sheet: 0 };
  if (boat.mode === 'sailing') {
    // the sea shoved about by the giant carries the boat with it
    const s = boat.state, e = 3;
    const gx = (bumpHeight(s.x + e, s.z) - bumpHeight(s.x - e, s.z)) / (2 * e);
    const gz = (bumpHeight(s.x, s.z + e) - bumpHeight(s.x, s.z - e)) / (2 * e);
    const ax = pushX - gx * 26, az = pushZ - gz * 26;
    const sn = Math.sin(s.psi), cs = Math.cos(s.psi);
    s.u += (ax * sn + az * cs) * dt;
    const side = (ax * cs - az * sn) * dt * 0.6;
    s.x += side * cs; s.z -= side * sn;
  }
  // shoved up onto the atoll's reef, the hull breaks there
  if (boat.mode === 'sailing' && giant.phase !== 'asleep' && giant.phase !== 'dead' && Math.hypot(boat.state.x - ATOLL.x, boat.state.z - ATOLL.z) < ATOLL.r + 60 && world.terrainHeight(boat.state.x, boat.state.z) > -0.5) strandBoat();
  pushX = pushZ = 0;
  boat.update(dt, t, helm, wind, world);
  if (boat.capsized) { boat.capsized = false; wreckBoat(); }
  // lay down the wake
  {
    const wk = ocean.wake, s = boat.state, moving = boat.mode === 'sailing' ? Math.min(1, Math.abs(s.u) / 4) : 0;
    wakeT += dt;
    if (wakeT > 0.22) { wakeT = 0; wakeI = 1 + (wakeI % (wk.length - 1)); wk[wakeI].set(s.x - Math.sin(s.psi) * 2.5, s.z - Math.cos(s.psi) * 2.5, 0.9, moving); }
    for (let i = 1; i < wk.length; i++) { wk[i].z += dt * 0.45; wk[i].w = Math.max(0, wk[i].w - dt * 0.26); }
    // the bow wave travels with the hull
    wk[0].set(s.x + Math.sin(s.psi) * 0.9, s.z + Math.cos(s.psi) * 0.9, 0.85, moving * 0.3);   // small, and tucked under the forefoot: never out ahead of the stem
  }
  player.dry = lab.inside() || island.dockDry(player.pos) || tower.inside(player.pos);
  player.update(dt, t, input, rig.yaw, wind);
  // the anchor going down or coming up
  if (player.anchorHit) audio.play('anchor', boat.position, 1.2);
  if (player.splashed) audio.play('giant-slap', player.pos, 0.5);
  // Nobody is ever left on the home island without a boat. If the sailor is ashore there and the boat lies
  // somewhere far off (left at anchor, lost in a throw), it is found back in its dock the next time they look.
  if ((homeT -= dt) < 0) {
    homeT = 2;
    const m = island.mooring;
    const ashore = player.mode === 'foot' && Math.hypot(player.pos.x - ISLAND.x, player.pos.z - ISLAND.z) < 230;
    const boatFar = boat.mode !== 'cradle' && Math.hypot(boat.state.x - m.x, boat.state.z - m.z) > 320;
    const unseen = Math.hypot(player.pos.x - m.x, player.pos.z - m.z) > 40 || island.indoors(player.pos);
    if (ashore && boatFar && unseen && !wrecking && state.flag('sailRigged')) { boatHome(); state.touch(); }
  }
  // gone under for good: wake where the boat was built, with the boat brought home
  if (player.drowned) {
    player.drowned = false;
    player.busy = 5;
    ctx.fade(() => {
      const m = island.mooring;
      boatHome();                                        // whoever drowns wakes beside their boat, brought home
      player.mode = 'foot'; player.swimT = 0; player.dip = 0;
      player.place(m.dock.x, m.dock.y, m.dock.z, 0);
      env.time = (env.time + 0.15) % 1;
      state.touch(); state.flush(true);
    }, 4);
  }

  if (turnTo > 0 && player.mode === 'held') {
    // lifted up to the face: the eyes are drawn to it
    turnTo -= dt;
    const want = Math.atan2(ATOLL.x - player.pos.x, ATOLL.z - player.pos.z) + Math.PI;
    rig.yaw += Math.atan2(Math.sin(want - rig.yaw), Math.cos(want - rig.yaw)) * Math.min(1, dt * 3);
    rig.pitch += (0.12 - rig.pitch) * Math.min(1, dt * 3);
  }
  // ---- hints ----
  if (hints && !title) {
    if (walkHint > 0 && (walkHint -= dt) <= 0) { showKeys(WALK_KEYS, 10); if (!state.loaded) nag('ESC', 10); sinceHelp = 0; }
    // every so often, when someone has stood still on foot for a few seconds, the help comes back for a moment
    sinceHelp += dt;
    const still = player.mode === 'foot' && player.speed < 0.05 && !reading && !satchel.open && !rig.scope && keysT <= 0;
    idleT = still ? idleT + dt : 0;
    if (idleT > 6 && sinceHelp > 420) { showKeys(WALK_KEYS, 8); sinceHelp = 0; idleT = 0; }
    const helm = player.mode === 'sail';
    if (helm && !state.flag('sailHint')) { state.set('sailHint'); showKeys(SAIL_KEYS, 16); }
    if (helm && input.hit('KeyH')) { if (keysT > 0) hideKeys(); else showKeys(SAIL_KEYS, 14); }
    // making no way for a while (pinned head to wind, sheet hauled in hard, sail flogging): offer the reminder, quietly
    if (helm && boat.mode === 'sailing' && keysT <= 0) {
      sailSlow = Math.abs(boat.state.u) < 1.3 ? sailSlow + dt : Math.max(0, sailSlow - dt * 3);
      if (sailSlow > 12) { sailSlow = -45; nag('H · controls', 9); }
    } else if (!helm) sailSlow = 0;
    if (keysT > 0 && (keysT -= dt) <= 0) hideKeys();
    if (nagT > 0 && (nagT -= dt) <= 0) hintEl.style.opacity = '0';
  }
  if (player.mode !== 'sail') boat.sheetHand = null;
  boat.night = 1 - env.daylight;
  // the view
  player.focus(focus);
  const indoors = windmill.inside(player.pos) || lab.inside() || island.indoors(player.pos) || tower.inside(player.pos);
  player.eye(eyePos);
  if (player.mode === 'foot' && player.pos.y < 8) eyePos.y += floats.lift(player.pos.x, player.pos.z);   // standing on something afloat
  if (rig.scope && scopeAt) eyePos.set(scopeAt.x, scopeAt.y + 0.85, scopeAt.z); // above the ring wall, so nothing near blocks the view
  // sailing is seen from outside the boat; aiming brings the view back behind the eyes
  const pulledBack = sailing && !aiming && !rig.scope;
  if (pulledBack && !wasPulledBack && rig.pitch < 0.12) rig.pitch = 0.2;
  wasPulledBack = pulledBack;
  // ---- a long straight run with nothing near: the view drifts out and round, and comes straight back at a touch ----
  {
    const s = boat.state;
    const touched = helm.steer !== 0 || helm.sheet !== 0 || input.lookX !== 0 || input.lookY !== 0 || input.wheel !== 0 || aiming;
    const under = sailing && boat.mode === 'sailing';
    let nearLand = false;
    if (under) {
      const reach = Math.max(120, Math.abs(s.u) * 30);
      const marks: [number, number, number][] = [[ISLAND.x, ISLAND.z, 230], [ATOLL.x, ATOLL.z, ATOLL.r + 20], [TOWER.x, TOWER.z, 40], [WINDMILL.x, WINDMILL.z, 20], [LAB.x, LAB.z, 20], ...Object.values(PLACES).map((p) => [p.x, p.z, 15] as [number, number, number])];
      nearLand = marks.some(([x, z, r]) => Math.hypot(boat.position.x - x, boat.position.z - z) - r < reach);
    }
    calmT = under && !touched && !nearLand ? calmT + dt : 0;
    const want = calmT > 10 ? 1 : 0;
    if (want && cine === 0) cineDist = rig.dist;
    cine += (want - cine) * Math.min(1, dt * (want ? 0.25 : 3));
    if (cine < 0.002 && !want) cine = 0;
    if (cine > 0) {
      rig.yaw += dt * 0.045 * cine;
      rig.dist = cineDist + (34 - cineDist) * cine;
      rig.pitch += (0.22 * cine + rig.pitch * (1 - cine) - rig.pitch) * Math.min(1, dt * 0.5);
    }
    // making no way on one heading for a minute: the wind comes round onto the beam to help
    if (under && Math.abs(Math.atan2(Math.sin(s.psi - holdPsi), Math.cos(s.psi - holdPsi))) < 0.25) holdT += dt; else { holdT = 0; holdPsi = s.psi; }
    if (holdT > 60 && Math.abs(s.u) < 2) {
      const a = s.psi + Math.PI / 2, b2 = s.psi - Math.PI / 2;
      const pick = Math.abs(Math.atan2(Math.sin(a - wind.dir), Math.cos(a - wind.dir))) < Math.abs(Math.atan2(Math.sin(b2 - wind.dir), Math.cos(b2 - wind.dir))) ? a : b2;
      wind.nudge(pick, 0.04, dt);
    }
  }
  rig.update(dt, t, input, eyePos, sailing ? boat.state.psi : null, player.mode === 'foot' ? player.speed : 0, pulledBack ? boat.position : null);
  const outside = rig.third > 0.3;
  player.figure.group.visible = outside && sailing;
  viewModel.visible = !rig.scope && !outside && !title;
  // under the surface: the light goes green-blue and close
  // a swimmer whose head goes under sees nothing but blue (the sea's underside, seen from inches below, only confused)
  {
    const under = player.mode === 'swim' && camera.position.y < waveHeight(camera.position.x, camera.position.z, t) - 0.02;
    deepEl.style.opacity = under ? '1' : '0';
    if (under) deepEl.style.background = `rgb(${(11 * (0.25 + 0.75 * env.daylight)) | 0}, ${(52 * (0.2 + 0.8 * env.daylight)) | 0}, ${(66 * (0.2 + 0.8 * env.daylight)) | 0})`;
  }
  if (!lab.inside() && !tower.inside(player.pos) && !ending && camera.position.y < waveHeight(camera.position.x, camera.position.z, t) - 0.03) {
    const un = env.under;
    un.amount = 1; un.density = 0.11; un.intensity = 0.55 * (0.25 + env.daylight);
    un.fog.set('#0b3442').multiplyScalar(0.15 + 0.85 * env.daylight); un.ambient.set('#3a7080');
  }
  // what is being carried rides in front of the chest
  if (carry) {
    // held like anything else in a first-person game: fixed in the view, turning and tilting with it, with a little weight in the step
    camera.updateMatrixWorld();
    const sw = player.mode === 'foot' ? Math.min(1, player.speed / 3) : 0;
    carry.obj.position.copy(_mk.set(Math.sin(t * 4.4) * 0.012 * sw, -0.4 - carry.size * 0.25 + Math.abs(Math.sin(t * 4.4)) * 0.014 * sw, -0.72).applyMatrix4(camera.matrixWorld));
    carry.obj.quaternion.copy(camera.quaternion);
  }
  // hands: out to whatever was just used, on the tiller and sheet, on the rungs
  if (player.used) { arms.reach(player.used.pos, !!player.held); player.used = null; }
  let grips: [THREE.Vector3, THREE.Vector3] | null = null;
  const cl = player.climbing();
  if (sailing) grips = [boat.tillerGrip(_g0), boat.sheetPoint(_g1)];
  else if (cl) {
    const sx = Math.cos(cl.l.face) * 0.13, sz = -Math.sin(cl.l.face) * 0.13, top = cl.l.y1 + 0.95;
    _g0.set(cl.l.x + sx, Math.min(top, Math.round((cl.y + 1.42) / 0.6) * 0.6), cl.l.z + sz);
    _g1.set(cl.l.x - sx, Math.min(top, Math.round((cl.y + 1.42) / 0.6 + 0.5) * 0.6 - 0.3), cl.l.z - sz);
    grips = [_g0, _g1];
  }
  arms.group.visible = !rig.scope && !outside && !title;
  arms.heldGun = player.held === 'revolver';
  arms.aiming = aiming;
  let heldAt: THREE.Vector3 | null = null;
  if (player.held && !carry) {
    heldAt = _held.copy(viewModel.position);
    const gp = arms.heldGun ? viewModel.getObjectByName('grip') : null;
    if (gp) { viewModel.updateMatrixWorld(true); camera.worldToLocal(gp.getWorldPosition(_held)); heldAt = _held; }
  }
  arms.update(dt, t, player.mode === 'foot' ? player.speed : 0, heldAt, grips);
  // a small ring on whatever E would act on
  {
    let show = false;
    if (player.busy <= 0 && !rig.scope && !satchel.open && !reading) {
      if (player.mode === 'foot' && player.target) { _mk.copy(player.target.pos); show = true; }
      else if (player.fallback(_mk)) show = true;
      else if (player.swimExit(_mk, rig.yaw, t)) show = true;
    }
    if (!show && fauna.prompt && !rig.scope) { _mk.copy(fauna.prompt); show = true; }
    if (show) {
      _mk.project(camera);
      if (_mk.z > 1 || Math.abs(_mk.x) > 1.05 || Math.abs(_mk.y) > 1.05) show = false;
      else markEl.style.transform = `translate(${((_mk.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-_mk.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px)`;
    }
    markEl.style.opacity = show ? '0.9' : '0';
  }
  // what is held is seen in the lower right of the view; it comes up to the eye when aiming and goes out when offered
  if (viewHeld !== player.held) {
    viewModel.clear();
    viewHeld = player.held;
    if (viewHeld) {
      const o = makeItem(viewHeld as ItemId);
      const box = new THREE.Box3().setFromObject(o);
      o.scale.multiplyScalar(0.13 / Math.max(0.01, box.getSize(_hand).length()));
      if (viewHeld === 'revolver') { o.rotation.y = Math.PI; o.scale.multiplyScalar(2.3); }   // a heavy old revolver: the frame and barrel stand well clear of the fist
      else if (viewHeld === 'chart') { o.rotation.set(0.5, 0, 0); o.scale.multiplyScalar(1.7); }
      else o.rotation.set(0.2, 0.6, 0);
      o.traverse((m) => { m.castShadow = false; m.frustumCulled = false; });
      viewModel.add(o);
    }
  }
  {
    const k = Math.min(1, dt * 10), out = player.reaching;
    // the revolver is held at the hip of the view; anything else rests on the palm, lower and further out, so the forearm runs forward under it
    const onPalm = !aiming && player.held !== 'revolver';
    // aiming, the gun comes up so that the line of its sights runs through the middle of the screen
    let sightY = 0.075;
    const sight = aiming ? viewModel.getObjectByName('sight') : null;
    if (sight && sight.parent) sightY = (sight.position.y * (sight.parent as THREE.Object3D).scale.y);
    const tx = aiming ? 0.0 : onPalm ? 0.14 : 0.17, ty = (aiming ? -sightY - 0.007 : onPalm ? -0.25 : -0.15) + out * 0.05, tz = (aiming ? -0.44 : onPalm ? -0.5 : -0.42) - out * 0.22;
    viewModel.position.x += (tx - viewModel.position.x) * k;
    viewModel.position.y += (ty - viewModel.position.y + Math.sin(t * 1.3) * 0.0015) * k;
    viewModel.position.z += (tz - viewModel.position.z) * k;
    viewModel.rotation.x = kick * 6;
  }
  if (fixedCam) {
    camera.position.set(fixedCam[0], fixedCam[1], fixedCam[2]);
    camera.lookAt(fixedCam[3], fixedCam[4], fixedCam[5]);
  }
  if (title) markEl.style.opacity = '0';
  // ---- the end: alone on the roof with the tower emptied, seen from very far off ----
  if (ending === 0 && tower.over() && player.mode === 'foot' && !wrecking) { ending = 1; player.mode = 'ended'; endCam.set(player.pos.x - TOWER.x, 0, player.pos.z - TOWER.z).normalize(); }
  if (ending > 0) {
    if (ending === 1 && input.hit('KeyE')) {
      // off the edge
      ending = 2;
      leap.set(endCam.x * 7, 2.5, endCam.z * 7);
      player.pos.set(TOWER.x + endCam.x * 27.5, tower.roofY, TOWER.z + endCam.z * 27.5);
      audio.play('cloth', player.pos, 1.5);
    }
    if (ending === 2) {
      leap.y -= 5.2 * dt;
      player.pos.addScaledVector(leap, dt);
      if (player.pos.y < tower.roofY * 0.25) { ending = 3; creditsEl.style.display = 'flex'; requestAnimationFrame(() => { creditsEl.style.opacity = '1'; }); }
    }
    if (ending === 3 && (input.hit('Escape') || input.hit('Enter'))) location.reload();
    // side-on from far out over the sea: the whole height of the tower, and a speck on top of it
    const sx = -endCam.z, sz = endCam.x;
    const lookY = ending === 1 ? tower.roofY - 70 : Math.max(tower.roofY * 0.32, player.pos.y - 40);
    camera.position.set(TOWER.x + endCam.x * 140 + sx * 520, lookY - 30, TOWER.z + endCam.z * 140 + sz * 520);
    camera.lookAt(TOWER.x + endCam.x * 40, lookY, TOWER.z + endCam.z * 40);
    if (Math.abs(camera.fov - 44) > 0.01) { camera.fov = 44; camera.updateProjectionMatrix(); }
    focus.copy(player.pos);
    const fg = player.figure.group;
    fg.visible = ending < 3; fg.position.copy(player.pos); fg.rotation.set(ending === 2 ? -1.2 : 0, Math.atan2(endCam.x, endCam.z), 0, 'YXZ'); fg.scale.setScalar(2.4);   // still only a speck at this distance
    camera.updateMatrixWorld();
    arms.group.visible = viewModel.visible = false;
    if (ending === 1) { _mk.copy(player.pos); _mk.y += 9; _mk.project(camera); markEl.style.opacity = '1'; markEl.style.transform = `translate(${((_mk.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-_mk.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px)`; }
    else markEl.style.opacity = '0';
  }

  // shadows hug the action
  const sc = env.sun.shadow.camera;
  const ext = quality >= 2 ? 46 : 30;
  if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }

  cullPass(dt);
  env.update(dt, camera.position, focus);
  ocean.update(focus, camera.position);
  const submerged = env.under.amount > 0.5;
  scene.environmentIntensity = (0.08 + 0.34 * env.daylight) * (1 - env.under.amount * 0.75);
  // the eye opens up at night and indoors
  const wantExp = baseExposure * (1 + (1 - env.daylight) * 0.5 + (indoors && !submerged ? 0.35 : 0));
  renderer.toneMappingExposure += (wantExp - renderer.toneMappingExposure) * Math.min(1, dt * 1.2);
  ocean.mesh.visible = !submerged;
  env.sky.visible = !submerged;
  scene.background = submerged ? env.fog.color : null;
  post.render(scene, camera, t, env.air);
  satchel.render(renderer, camera.aspect);
  if (input.hit('KeyR') && !reading && !satchel.open) openReport();   // must follow the render: the picture is read straight off the canvas
  if (prevTime < 0.25 && env.time >= 0.25) { state.data.day++; state.touch(); } // a dawn has passed

  audio.update(dt, {
    sailing, boatSpeed: boat.state.u, drive: boat.state.drive, wind: wind.speed, luff: boat.mode === 'sailing' ? 1 - Math.min(1, boat.state.alpha / 0.2) : 0,
    height: player.pos.y, indoors, submerged, walking: player.mode === 'foot' ? player.speed : 0, climbing: player.mode === 'climb' ? player.speed : 0,
    night: 1 - env.daylight, towerDist: Math.hypot(player.pos.x - TOWER.x, player.pos.z - TOWER.z),
    turbine: windmill.powered() ? Math.hypot(player.pos.x - WINDMILL.x, player.pos.z - WINDMILL.z) : -1,
    inland: sailing ? 0 : THREE.MathUtils.clamp((150 - Math.hypot(player.pos.x - ISLAND.x, player.pos.z - ISLAND.z)) / 105, 0, 1),
    metal: windmill.inside(player.pos) || lab.inside() || (player.pos.y > 2.5 && Math.hypot(player.pos.x - ISLAND.x, player.pos.z - ISLAND.z) > 260),
    bump: boat.bump, rot: state.flag('giantPhase') === 2 ? Math.hypot(player.pos.x - ATOLL.x, player.pos.z - ATOLL.z) : -1,
  });

  // quiet autosave
  state.data.time = env.time;
  state.data.boat.x = boat.state.x; state.data.boat.z = boat.state.z; state.data.boat.psi = boat.state.psi;
  saveTimer += dt;
  if (saveTimer > 3) { saveTimer = 0; if (!noSave) state.flush(); }

  if (debug) {
    const s = boat.state;
    const deg = (r: number) => ((r * 180) / Math.PI).toFixed(0);
    debugEl.textContent =
      `fps ${fps.toFixed(0)}  time ${(env.time * 24).toFixed(1)}h  day ${state.data.day}  ${player.mode}  giant ${giant.phase}\n` +
      `speed ${s.u.toFixed(1)} m/s  heel ${deg(s.heel)}°\n` +
      `wind ${wind.speed.toFixed(1)} m/s  off bow ${deg(s.awa)}°\n` +
      `sheet ${deg(s.sheet)}°  boom ${deg(s.boom)}°  attack ${deg(s.alpha)}°\n` +
      `player ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}\n` +
      `items ${state.data.items.join(' ')}  ammo ${state.flag('ammo')}\n` +
      `calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}`;
  }
  // lift the opening black only once the world is really being drawn (the first frames compile every shader)
  if (shownFrames < 4 && ++shownFrames === 4) {
    fadeEl.style.transition = 'opacity 2.5s ease'; fadeEl.style.opacity = '0';
    setTimeout(() => { fadeEl.style.transition = ''; }, 2700);
  }
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handle for automated screenshots and tuning
(window as any).__game = { THREE, arms, viewModel, get aim() { return aimOn; }, set aim(v: boolean) { aimOn = v; }, fauna, floats, tower, get ending() { return ending; }, get res() { return resScale; }, weather, get fps() { return fps; }, post, env, boat, wind, rig, renderer, scene, camera, player, world, state, input, npcs, satchel, giant, fire, wreckBoat, PLACES, LAB, ATOLL, TOWER, WINDMILL };
