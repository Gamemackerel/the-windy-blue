import * as THREE from 'three';
import { Environment } from './env';
import { Ocean } from './ocean';
import { Wind } from './wind';
import { Boat } from './boat';
import { Input } from './input';
import { ViewRig } from './camera';
import { makeItem } from './items';
import { World } from './world';
import { GameState } from './state';
import { Player } from './player';
import { Ctx } from './ctx';
import { buildIsland, ISLAND, islandHeight } from './island';
import { buildRigs, PLACES } from './rigs';
import { Satchel, ItemId } from './items';
import { buildWindmill, WINDMILL } from './windmill';
import { buildLab, LAB } from './lab';
import { buildAtoll, ATOLL, atollHeight } from './giant';
import { buildTower, TOWER } from './tower';
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
    scopeEl.style.opacity = on ? '1' : '0';
    if (on) { rig.pitch = Math.min(rig.pitch, 0.05); player.busy = 0.4; }
  },
  scopeView: () => (rig.scope ? { yaw: rig.yaw, pitch: rig.pitch } : null),
  read: (text) => { (pageEl.firstElementChild as HTMLElement).textContent = text; pageEl.style.display = 'flex'; reading = true; player.busy = 0.3; audio.play('page'); },
  sfx: (name, pos, gain) => audio.play(name, pos, gain),
};

// ---- the world ----
const island = buildIsland(ctx);
const npcs = buildRigs(ctx);
const windmill = buildWindmill(ctx);
const lab = buildLab(ctx);
let pushX = 0, pushZ = 0, wrecking = false;
const giant = buildAtoll(ctx, { wreck: wreckBoat, push: (ax, az) => { pushX += ax; pushZ += az; } });
const tower = buildTower(ctx);
ocean.setShoal(ATOLL.x, ATOLL.z, ATOLL.r - 14, ATOLL.hole);
ocean.addShore(ISLAND.x, ISLAND.z, 480, islandHeight);
ocean.addShore(ATOLL.x, ATOLL.z, 580, atollHeight);
if (params.has('wake')) world.after(1, () => giant.wake());
const satchel = new Satchel(ctx, (id) => player.setHeld(id), () => player.held);
boat.setPatches(state.data.boat.patches);
const junkCount = scatterJunk(ctx);
const merged = mergeStatic(scene);
if (params.has('debug')) console.log(`${junkCount} junk objects; merged ${merged.before} static parts into ${merged.after}`);

/** the giant has broken the boat: wake on the slip beside a patched hull */
function wreckBoat() {
  if (wrecking || boat.mode !== 'sailing') return;
  wrecking = true;
  audio.play('wreck', boat.position, 2);
  boat.sinking = 1;
  ctx.fade(() => {
    const m = island.mooring;
    boat.sinking = 0;
    boat.mode = 'moored'; boat.mooring = m;
    boat.state.x = m.x; boat.state.z = m.z; boat.state.psi = m.psi; boat.state.u = boat.state.v = 0;
    player.mode = 'foot';
    player.place(m.dock.x, m.dock.y, m.dock.z, 0);
    state.data.boat.patches++; state.data.boat.mooring = m.name;
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
  if (best) { best.n.hit(best.joint, aimDir); return; }
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
let quality = params.has('q') ? num('q', 2) : Number(localStorage.getItem('ww-quality') ?? 2);
function applyQuality(q: number, remember = true) {
  quality = q;
  renderer.setPixelRatio([0.7, 1, Math.min(devicePixelRatio, 2)][q] * (q < 2 ? Math.min(devicePixelRatio, 1) : 1));
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
document.getElementById('newgame')!.addEventListener('click', () => { GameState.wipe(); location.search = ''; });
applyQuality(quality, false);
setSound(localStorage.getItem('ww-sound') !== '0');
if (!state.loaded && !fixedCam) { setTimeout(() => { hintEl.style.opacity = '0.55'; }, 5000); setTimeout(() => { hintEl.style.opacity = '0'; }, 14000); }
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
setTimeout(() => { fadeEl.style.transition = 'opacity 3.5s ease'; fadeEl.style.opacity = '0'; setTimeout(() => { fadeEl.style.transition = ''; }, 3700); }, params.has('cam') || params.has('at') || params.has('boat') ? 0 : 600);

function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;

  if (input.hit('Backquote')) {
    debug = !debug;
    debugEl.style.display = debug ? 'block' : 'none';
  }
  if (input.hit('Escape') && !satchel.open && !reading && !tower.padActive() && !rig.scope) setPaused(!paused);
  if (paused || reporting) { input.endFrame(); post.render(scene, camera, env.elapsed, env.air); requestAnimationFrame(frame); return; }
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
    if (player.busy <= 0 && (input.hit('KeyE') || input.hit('Escape') || input.axis('KeyS', 'KeyW') !== 0 || input.axis('KeyA', 'KeyD') !== 0)) { ctx.scope(false); player.busy = 0.3; input.endFrame(); }
    else player.busy = Math.max(player.busy, 0.05);
  }
  // aiming and firing
  const canAim = player.held === 'revolver' && player.busy <= 0 && player.mode !== 'climb';
  const aiming = canAim && input.mouse(2);
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
  pushX = pushZ = 0;
  boat.update(dt, t, helm, wind, world);
  if (boat.capsized) { boat.capsized = false; boat.state.over = 0; wreckBoat(); }
  // lay down the wake
  {
    const wk = ocean.wake, s = boat.state, moving = boat.mode === 'sailing' ? Math.min(1, Math.abs(s.u) / 4) : 0;
    wakeT += dt;
    if (wakeT > 0.22) { wakeT = 0; wakeI = 1 + (wakeI % (wk.length - 1)); wk[wakeI].set(s.x - Math.sin(s.psi) * 2.5, s.z - Math.cos(s.psi) * 2.5, 0.9, moving); }
    for (let i = 1; i < wk.length; i++) { wk[i].z += dt * 0.45; wk[i].w = Math.max(0, wk[i].w - dt * 0.26); }
    // the bow wave travels with the hull
    wk[0].set(s.x + Math.sin(s.psi) * 1.9, s.z + Math.cos(s.psi) * 1.9, 1.5, moving * 0.6);
  }
  player.update(dt, t, input, rig.yaw, wind);
  // the anchor going down or coming up
  if (player.anchorHit) audio.play('anchor', boat.position, 1.2);
  // gone under for good: wake where the boat was built, the boat left where it lay
  if (player.drowned) {
    player.drowned = false;
    player.busy = 5;
    ctx.fade(() => {
      const m = island.mooring;
      player.mode = 'foot'; player.swimT = 0; player.dip = 0;
      player.place(m.dock.x, m.dock.y, m.dock.z, 0);
      env.time = (env.time + 0.15) % 1;
      state.touch(); state.flush(true);
    }, 4);
  }

  // the view
  player.focus(focus);
  const indoors = windmill.inside(player.pos) || lab.inside() || island.indoors(player.pos);
  player.eye(eyePos);
  if (rig.scope && scopeAt) eyePos.set(scopeAt.x, scopeAt.y + 0.85, scopeAt.z); // above the ring wall, so nothing near blocks the view
  // sailing is seen from outside the boat; aiming brings the view back behind the eyes
  const pulledBack = sailing && !aiming && !rig.scope;
  if (pulledBack && !wasPulledBack && rig.pitch < 0.12) rig.pitch = 0.2;
  wasPulledBack = pulledBack;
  rig.update(dt, t, input, eyePos, sailing ? boat.state.psi : null, player.mode === 'foot' ? player.speed : 0, pulledBack ? boat.position : null);
  const outside = rig.third > 0.3;
  player.figure.group.visible = outside && sailing;
  viewModel.visible = !rig.scope && !outside;
  // under the surface: the light goes green-blue and close
  if (!lab.inside() && camera.position.y < waveHeight(camera.position.x, camera.position.z, t) - 0.03) {
    const un = env.under;
    un.amount = 1; un.density = 0.11; un.intensity = 0.55 * (0.25 + env.daylight);
    un.fog.set('#0b3442').multiplyScalar(0.15 + 0.85 * env.daylight); un.ambient.set('#3a7080');
  }
  // what is being carried rides in front of the chest
  if (carry) {
    camera.getWorldDirection(_mk).setY(0).normalize();
    carry.obj.position.set(camera.position.x + _mk.x * 0.66, camera.position.y - 0.6, camera.position.z + _mk.z * 0.66);
    carry.obj.rotation.set(0, rig.yaw, 0);
  }
  // hands: out to whatever was just used, on the tiller and sheet, on the rungs
  if (player.used) { arms.reach(player.used.pos, !!player.held); player.used = null; }
  let grips: [THREE.Vector3, THREE.Vector3] | null = null;
  const cl = player.climbing();
  if (sailing) grips = [boat.tillerGrip(_g0), boat.sheetPoint(_g1)];
  else if (cl) {
    const sx = Math.cos(cl.l.face) * 0.24, sz = -Math.sin(cl.l.face) * 0.24, top = cl.l.y1 + 0.95;
    _g0.set(cl.l.x + sx, Math.min(top, Math.round((cl.y + 1.42) / 0.6) * 0.6), cl.l.z + sz);
    _g1.set(cl.l.x - sx, Math.min(top, Math.round((cl.y + 1.42) / 0.6 + 0.5) * 0.6 - 0.3), cl.l.z - sz);
    grips = [_g0, _g1];
  }
  arms.group.visible = !rig.scope && !outside;
  arms.update(dt, t, player.mode === 'foot' ? player.speed : 0, player.held && !carry ? _held.copy(viewModel.position) : null, grips);
  // a small ring on whatever E would act on
  {
    let show = false;
    if (player.busy <= 0 && !rig.scope && !satchel.open && !reading) {
      if (player.mode === 'foot' && player.target) { _mk.copy(player.target.pos); show = true; }
      else if (player.fallback(_mk)) show = true;
      else if (player.swimExit(_mk, rig.yaw, t)) show = true;
    }
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
      if (viewHeld === 'revolver') { o.rotation.y = Math.PI; o.scale.multiplyScalar(1.7); }
      else if (viewHeld === 'chart') { o.rotation.set(0.5, 0, 0); o.scale.multiplyScalar(1.7); }
      else o.rotation.set(0.2, 0.6, 0);
      o.traverse((m) => { m.castShadow = false; m.frustumCulled = false; });
      viewModel.add(o);
    }
  }
  {
    const k = Math.min(1, dt * 10), out = player.reaching;
    const tx = aiming ? 0.0 : 0.17, ty = (aiming ? -0.075 : -0.15) + out * 0.05, tz = (aiming ? -0.36 : -0.42) - out * 0.22;
    viewModel.position.x += (tx - viewModel.position.x) * k;
    viewModel.position.y += (ty - viewModel.position.y + Math.sin(t * 1.3) * 0.0015) * k;
    viewModel.position.z += (tz - viewModel.position.z) * k;
    viewModel.rotation.x = kick * 6;
  }
  if (fixedCam) {
    camera.position.set(fixedCam[0], fixedCam[1], fixedCam[2]);
    camera.lookAt(fixedCam[3], fixedCam[4], fixedCam[5]);
  }

  // shadows hug the action
  const sc = env.sun.shadow.camera;
  const ext = quality >= 2 ? 46 : 30;
  if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }

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
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handle for automated screenshots and tuning
(window as any).__game = { weather, get fps() { return fps; }, post, env, boat, wind, rig, renderer, scene, camera, player, world, state, input, npcs, satchel, giant, fire, wreckBoat, PLACES, LAB, ATOLL, TOWER, WINDMILL };
