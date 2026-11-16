// The player: walking, climbing, and sitting at the helm.
import * as THREE from 'three';
import { Figure, J, LIMB, GaitState, newGait, animateGait, solveIK } from './figure';
import { World, Ladder, Interactable } from './world';
import { waveHeight } from './waves';
import { Boat } from './boat';
import { Input } from './input';
import { Wind } from './wind';
import { GameState } from './state';
import { ItemId } from './items';

const RADIUS = 0.3;
const WALK = 2.1, RUN = 4.8;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion();
const POLE_KNEE = new THREE.Vector3(0, 0.3, 1), POLE_ELBOW = new THREE.Vector3(0, -0.6, -1), POLE_ELBOW_OUT = new THREE.Vector3(0, -1, -0.2);

const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class Player {
  readonly figure = new Figure({ coat: '#b08a3c', trousers: '#2b2a2c', skin: '#b08f78', hood: true });
  readonly pos = new THREE.Vector3();
  yaw = 0;
  mode: 'foot' | 'sail' | 'climb' | 'swim' = 'foot';
  /** seconds spent swimming without a rest; past five minutes the swimmer goes under */
  swimT = 0;
  /** how far the eyes are being pulled under by exhaustion (m) */
  dip = 0;
  drowned = false;
  /** inside something watertight below the surface (the laboratory): no swimming here */
  dry = false;
  private dipPhase = 0;
  private mantle: { from: THREE.Vector3; to: THREE.Vector3; k: number } | null = null;
  /** blocks input during scripted moments */
  busy = 0;
  held: string | null = null;
  target: Interactable | null = null;
  speed = 0;
  /** the thing most recently used; the main loop clears it once the hand has been sent out */
  used: Interactable | null = null;
  /** set while carrying something: called when E is pressed with nothing in reach */
  dropHook: (() => boolean) | null = null;
  /** hands full: slower, and no climbing or boarding */
  encumbered = false;
  /** world direction the revolver is being aimed along, or null */
  aimDir: THREE.Vector3 | null = null;
  private gait: GaitState = newGait();
  private velY = 0;
  private ladder: Ladder | null = null;
  private climbY = 0;
  private climbPhase = 0;
  private reach = 0;
  private side = 1;
  private sideSmooth = 1;
  private turnRate = 0;

  constructor(scene: THREE.Scene, private world: World, private boat: Boat, private state: GameState) {
    scene.add(this.figure.group);
    this.figure.group.visible = false; // first person: the body is never seen
  }

  /** hold an item (null puts it away); the view model is drawn by the main loop */
  setHeld(id: ItemId | null) { this.held = id; this.reach = 0; }
  /** 0..1 pulse after using or offering something, for the view model */
  get reaching() { return Math.sin(Math.min(1, Math.max(0, this.reach)) * Math.PI); }
  handWorld(out: THREE.Vector3) { return this.figure.rightHandSlot.getWorldPosition(out); }

  /** after a teleport: no carried-over falling or climbing */
  resetMotion() { this.velY = 0; if (this.mode === 'climb') this.mode = 'foot'; }

  place(x: number, y: number, z: number, yaw = 0) {
    this.pos.set(x, y, z); this.yaw = yaw; this.velY = 0;
  }

  /** point the camera should orbit */
  focus(out: THREE.Vector3) {
    if (this.mode === 'sail') return out.copy(this.boat.position);
    return out.copy(this.pos);
  }

  /** while on a ladder: where it is and how high the feet are */
  climbing() { return this.mode === 'climb' && this.ladder ? { l: this.ladder, y: this.climbY } : null; }
  /** what E would do right now if nothing usable is in reach: a ladder, or the boat */
  fallback(out: THREE.Vector3): boolean {
    if (this.mode !== 'foot' || this.encumbered) return false;
    const lad = this.world.nearestLadder(this.pos);
    if (lad) { out.set(lad.ladder.x, lad.atTop ? lad.ladder.y1 + 0.5 : Math.min(lad.ladder.y1, this.pos.y + 1.3), lad.ladder.z); return true; }
    const b = this.boat;
    if (b.mode === 'moored' && b.hasMast && b.hasSail && Math.hypot(this.pos.x - b.position.x, this.pos.z - b.position.z) <= 4.6) { b.local(0, 0.7, -0.6, out); return true; }
    return false;
  }
  /** where the eyes are */
  eye(out: THREE.Vector3) {
    if (this.mode === 'sail') { this.boat.seat(out, this.sideSmooth); out.y += 0.82; return out; }
    if (this.mode === 'climb') return out.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    if (this.mode === 'swim') return out.set(this.pos.x, this.pos.y + 1.64 - this.dip, this.pos.z);
    return out.set(this.pos.x, this.pos.y + 1.64, this.pos.z);
  }

  update(dt: number, t: number, input: Input, camYaw: number, wind: Wind) {
    this.busy = Math.max(0, this.busy - dt);
    const free = this.busy <= 0;
    if (this.mode !== 'swim') { this.swimT = Math.max(0, this.swimT - dt * 4); this.dip *= Math.max(0, 1 - dt * 4); }
    if (this.mode === 'foot') this.updateFoot(dt, t, input, camYaw, free);
    else if (this.mode === 'swim') this.updateSwim(dt, t, input, camYaw, free);
    else if (this.mode === 'climb') this.updateClimb(dt, input, free);
    else this.updateSail(dt, t, input, wind, free);
    this.state.data.player = { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, mode: this.mode === 'sail' ? 'sail' : 'foot' };
  }

  // ---------------------------------------------------------------- on foot
  private updateFoot(dt: number, t: number, input: Input, camYaw: number, free: boolean) {
    const w = this.world;
    let ix = 0, iz = 0;
    if (free) { ix = input.axis('KeyA', 'KeyD'); iz = input.axis('KeyS', 'KeyW'); }
    // camera sits at target + (sin yaw, cos yaw) * dist, so forward is the opposite
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let mx = fx * iz + -fz * ix, mz = fz * iz + fx * ix;
    const ml = Math.hypot(mx, mz);
    const prevYaw = this.yaw;
    this.yaw = camYaw + Math.PI;
    let speed = 0;
    if (ml > 0.01) {
      mx /= ml; mz /= ml;
      speed = this.encumbered ? WALK * 0.8 : input.down('ShiftLeft') || input.down('ShiftRight') ? RUN : WALK;
      if (this.pos.y < -0.25) speed *= 0.55;   // wading
      const step = speed * dt;
      const tryMove = (dx: number, dz: number) => {
        _v.set(this.pos.x + dx, this.pos.y, this.pos.z + dz);
        w.resolve(_v, RADIUS);
        const g = w.groundAt(_v.x, _v.z, this.pos.y);
        // too steep to climb
        const ahead = w.groundAt(_v.x + dx * 4, _v.z + dz * 4, this.pos.y + 2);
        const run = Math.hypot(dx, dz) * 4;
        if (ahead - g > run * 1.25 && ahead - this.pos.y > 0.5) return false;
        this.pos.x = _v.x; this.pos.z = _v.z;
        return true;
      };
      if (!tryMove(mx * step, mz * step)) {
        // slide along whichever axis is open
        if (!tryMove(mx * step, 0) && !tryMove(0, mz * step)) speed = 0;
        else speed *= 0.6;
      }
    }
    this.turnRate = Math.atan2(Math.sin(this.yaw - prevYaw), Math.cos(this.yaw - prevYaw)) / Math.max(dt, 1e-4);

    // gravity and ground following
    const ground = w.groundAt(this.pos.x, this.pos.z, this.pos.y);
    // a short hop: enough to clear a kerb or get onto a crate
    if (free && input.hit('Space') && !this.encumbered && this.pos.y <= ground + 0.08) { this.velY = 5.3; this.pos.y = ground + 0.1; }
    // out of your depth: start swimming
    const sea = waveHeight(this.pos.x, this.pos.z, t);
    if (!this.dry && ground < sea - 1.2 && this.pos.y < sea - 1.15) { this.mode = 'swim'; this.velY = 0; if (this.dropHook) this.dropHook(); return; }
    if (this.pos.y > ground + 0.08) {
      this.velY -= 20 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y < ground) { this.pos.y = ground; this.velY = 0; }
    } else {
      this.velY = 0;
      this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 18);
    }
    this.speed = speed;

    // what is within reach?
    this.target = free ? w.nearestInteractable(this.pos, this.yaw) : null;
    if (free && input.hit('KeyE')) {
      const lad = w.nearestLadder(this.pos);
      if (this.target) { this.used = this.target; this.target.use(); this.busy = 0.45; this.reach = 1; }
      else if (this.dropHook?.()) this.busy = 0.35;
      else if (lad && !this.encumbered) this.startClimb(lad.ladder, lad.atTop);
      else if (!this.encumbered) this.tryBoard();
    }

    this.poseHandsOnly(dt);
    if (!this.figure.group.visible) return;   // first person: nobody can see the body, so do not pose it
    // animate
    const f = this.figure;
    f.skirtAmount = 1;
    f.group.position.copy(this.pos);
    f.group.rotation.set(0, this.yaw, 0);
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    animateGait(f, this.gait, dt, speed, this.turnRate, (lx, lz) => {
      const wx = this.pos.x + lx * cs + lz * sn, wz = this.pos.z - lx * sn + lz * cs;
      return THREE.MathUtils.clamp(w.groundAt(wx, wz, this.pos.y + 0.3) - this.pos.y, -0.35, 0.35);
    });
    this.poseHands(dt);
    this.lookAt(dt, camYaw);
    if (this.aimDir) {
      this.yaw = lerpAngle(this.yaw, Math.atan2(this.aimDir.x, this.aimDir.z), Math.min(1, dt * 14));
      this.poseAim();
    }
    f.refresh(0);
  }

  /** right arm out along the line of aim */
  private poseAim() {
    const f = this.figure, p = f.joints;
    f.group.updateMatrixWorld();
    _w.copy(this.aimDir!).transformDirection(_m4.copy(f.group.matrixWorld).invert());
    _t.copy(p[J.shR]).addScaledVector(_w, 0.56);
    _t.x += 0.1;
    solveIK(p[J.shR], _t, LIMB.UARM, LIMB.FARM, POLE_ELBOW_OUT, p[J.elR], p[J.haR]);
    f.headYaw += (Math.atan2(_w.x, _w.z) - f.headYaw) * 0.3;
  }

  private poseHandsOnly(dt: number) { this.reach = Math.max(0, this.reach - dt * 2.2); }
  /** the hand lifts toward things that can be used, and reaches when using them */
  private poseHands(dt: number) {
    const f = this.figure, p = f.joints;
    const want = this.target ? 0.28 : 0;
    const amt = Math.max(want, Math.sin(Math.min(1, this.reach) * Math.PI) * 1.0);
    if (this.held) {
      // carry the held thing in front of the body; hold it out when offering
      const out = Math.sin(Math.min(1, this.reach) * Math.PI);
      _t.set(-0.16, p[J.chest].y - 0.24 + out * 0.1, 0.3 + out * 0.2);
      solveIK(p[J.shR], _t, LIMB.UARM, LIMB.FARM, POLE_ELBOW_OUT, p[J.elR], p[J.haR]);
    } else if (amt > 0.01 && this.target) {
      f.group.worldToLocal(_t.copy(this.target.pos));
      _w.copy(p[J.haR]).lerp(_t, amt);
      solveIK(p[J.shR], _w, LIMB.UARM, LIMB.FARM, POLE_ELBOW_OUT, p[J.elR], p[J.haR]);
    }
  }

  private lookAt(dt: number, camYaw: number) {
    const f = this.figure;
    let wantYaw = 0, wantPitch = 0;
    if (this.target) {
      f.group.worldToLocal(_t.copy(this.target.pos));
      wantYaw = Math.atan2(_t.x, _t.z);
      wantPitch = -Math.atan2(_t.y - LIMB.HEAD_Y, Math.hypot(_t.x, _t.z));
    } else if (this.speed < 0.1) {
      // idle: glance where the camera is looking
      wantYaw = Math.atan2(Math.sin(camYaw + Math.PI - this.yaw), Math.cos(camYaw + Math.PI - this.yaw));
    }
    wantYaw = THREE.MathUtils.clamp(wantYaw, -1.1, 1.1);
    wantPitch = THREE.MathUtils.clamp(wantPitch, -0.6, 0.6);
    f.headYaw += (wantYaw - f.headYaw) * Math.min(1, dt * 4);
    f.headPitch += (wantPitch - f.headPitch) * Math.min(1, dt * 4);
  }

  // ---------------------------------------------------------------- ladders
  private startClimb(l: Ladder, atTop: boolean) {
    this.mode = 'climb';
    this.ladder = l;
    this.climbY = atTop ? l.y1 - 1.0 : l.y0 + 0.05;
    this.yaw = l.face;
  }
  private updateClimb(dt: number, input: Input, free: boolean) {
    const l = this.ladder!;
    const dir = free ? input.axis('KeyS', 'KeyW') : 0;
    const sp = (input.down('ShiftLeft') ? 1.5 : 0.9) * dir;
    this.climbY += sp * dt;
    this.climbPhase += Math.abs(sp) * dt / 0.6;
    if (this.climbY > l.y1 - 0.9) { this.mode = 'foot'; this.pos.copy(l.topExit); this.velY = 0; return; }
    if (this.climbY < l.y0) { this.mode = 'foot'; this.pos.copy(l.bottomExit); this.velY = 0; return; }
    if (free && input.hit('KeyE') && this.climbY < l.y0 + 1.2) { this.mode = 'foot'; this.pos.copy(l.bottomExit); return; }
    const back = 0.34;
    this.pos.set(l.x - Math.sin(l.face) * back, this.climbY, l.z - Math.cos(l.face) * back);
    this.yaw = lerpAngle(this.yaw, l.face, Math.min(1, dt * 10));
    this.speed = Math.abs(sp);

    const f = this.figure, p = f.joints;
    f.group.position.copy(this.pos);
    f.group.rotation.set(0, this.yaw, 0);
    const ph = this.climbPhase;
    const bob = Math.sin(ph * Math.PI * 2) * 0.02;
    p[J.hips].set(0, 0.92 + bob, -0.02);
    p[J.chest].set(0, 0.92 + 0.47 + bob, 0.08);
    p[J.head].set(0, 0.92 + 0.69 + bob, 0.1);
    p[J.shL].set(LIMB.SH_W, p[J.chest].y - 0.03, 0.08); p[J.shR].set(-LIMB.SH_W, p[J.chest].y - 0.03, 0.08);
    p[J.hipL].set(LIMB.HIP_W, 0.88 + bob, 0); p[J.hipR].set(-LIMB.HIP_W, 0.88 + bob, 0);
    // each limb grips a rung fixed in the world, then reaches for the next one
    const S = 0.6;
    const grip = (base: number, off: number) => {
      const q = (this.climbY + base) / S + off;
      const i = Math.floor(q), fr = q - i;
      const k = THREE.MathUtils.smoothstep(fr, 0.68, 1);
      return (i + 0.5 - off + k) * S - this.climbY;
    };
    for (let s = 0; s < 2; s++) {
      const sgn = s === 0 ? 1 : -1;
      _t.set(sgn * 0.17, grip(1.62, s === 0 ? 0 : 0.5), back - 0.02);
      solveIK(p[s === 0 ? J.shL : J.shR], _t, LIMB.UARM, LIMB.FARM, POLE_ELBOW_OUT, p[s === 0 ? J.elL : J.elR], p[s === 0 ? J.haL : J.haR]);
      _t.set(sgn * 0.13, grip(0.22, s === 0 ? 0.5 : 0), back - 0.08);
      solveIK(s === 0 ? p[J.hipL] : p[J.hipR], _t, LIMB.THIGH, LIMB.SHIN, POLE_KNEE, p[s === 0 ? J.knL : J.knR], p[s === 0 ? J.ftL : J.ftR]);
    }
    f.headYaw *= 0.9; f.headPitch += (-0.35 * Math.sign(sp || 1) - f.headPitch) * Math.min(1, dt * 3);
    f.refresh(0);
  }

  // ---------------------------------------------------------------- sailing
  /** get into the boat from a dock or from the water. It stays at anchor until the anchor is weighed. */
  private tryBoard() {
    const b = this.boat;
    if (b.mode !== 'moored' || !b.hasMast || !b.hasSail) return false;
    if (Math.hypot(this.pos.x - b.position.x, this.pos.z - b.position.z) > 4.6) return false;
    this.mode = 'sail';
    this.busy = 0.6;
    this.state.touch();
    return true;
  }

  /** drop the anchor where the boat lies, or weigh it and get under way */
  private toggleAnchor() {
    const b = this.boat, s = b.state;
    if (b.mode === 'sailing') {
      b.mode = 'moored';
      b.mooring = { name: 'anchor', x: s.x, z: s.z, psi: s.psi, dock: new THREE.Vector3(s.x, 0, s.z) };
      this.state.data.boat.mooring = 'anchor';
    } else if (b.mode === 'moored') {
      b.mode = 'sailing';
      b.mooring = null;
      s.sheet = 1.2;
      this.state.data.boat.mooring = null;
    }
    this.busy = 0.5;
    this.anchorHit = true;
    this.state.touch();
    this.state.flush(true);
  }
  /** set for one frame when the anchor goes down or comes up, for the sound */
  anchorHit = false;

  /** step ashore if anything solid is within a stride or two; otherwise over the side and swim */
  private leaveBoat(t: number) {
    const b = this.boat, w = this.world;
    let best: THREE.Vector3 | null = null, bd = Infinity;
    for (const r of [1.7, 2.4, 3.1, 3.8, 4.5]) for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = b.position.x + Math.sin(a) * r, z = b.position.z + Math.cos(a) * r;
      const g = w.groundAt(x, z, 2.4);
      if (g < waveHeight(x, z, t) - 0.25 || g > 2.9) continue;
      _v.set(x, g, z);
      w.resolve(_v, RADIUS);
      if (Math.abs(_v.x - x) + Math.abs(_v.z - z) > 0.05) continue;     // inside something
      if (r < bd) { bd = r; best = _v.clone(); }
    }
    this.busy = 0.5;
    this.velY = 0;
    if (best) { this.mode = 'foot'; this.pos.copy(best); return; }
    // nothing to stand on: slip into the water on the side away from the boom
    const sx = Math.cos(b.state.psi) * 1.5 * this.side, sz = -Math.sin(b.state.psi) * 1.5 * this.side;
    this.mode = 'swim';
    this.pos.set(b.position.x + sx, waveHeight(b.position.x + sx, b.position.z + sz, t) - 1.42, b.position.z + sz);
  }

  // ---------------------------------------------------------------- swimming
  private updateSwim(dt: number, t: number, input: Input, camYaw: number, free: boolean) {
    const w = this.world;
    this.yaw = camYaw + Math.PI;
    this.swimT += dt;
    // exhaustion: nothing for the first few minutes, then the head starts to go under, longer and deeper
    const f = THREE.MathUtils.clamp((this.swimT - 200) / 100, 0, 1);
    this.dipPhase += dt * (0.45 + 1.5 * f);
    const want = f * (0.12 + 0.75 * f) * Math.max(0, Math.sin(this.dipPhase)) + f * f * 0.35;
    this.dip += (want - this.dip) * Math.min(1, dt * 3);
    if (this.swimT > 322) { this.drowned = true; return; }

    if (this.mantle) {
      // hauling out onto something
      const m = this.mantle;
      m.k = Math.min(1, m.k + dt * 1.7);
      const e = m.k * m.k * (3 - 2 * m.k);
      this.pos.lerpVectors(m.from, m.to, e);
      this.pos.y = m.from.y + (m.to.y - m.from.y) * Math.min(1, e * 1.5) + Math.sin(e * Math.PI) * 0.15;
      if (m.k >= 1) { this.mantle = null; this.mode = 'foot'; this.velY = 0; }
      return;
    }
    let ix = 0, iz = 0;
    if (free) { ix = input.axis('KeyA', 'KeyD'); iz = input.axis('KeyS', 'KeyW'); }
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let mx = fx * iz + -fz * ix, mz = fz * iz + fx * ix;
    const ml = Math.hypot(mx, mz);
    let speed = 0;
    if (ml > 0.01) {
      mx /= ml; mz /= ml;
      speed = (input.down('ShiftLeft') || input.down('ShiftRight') ? 1.55 : 1.1) * (1 - 0.6 * f);
      _v.set(this.pos.x + mx * speed * dt, this.pos.y, this.pos.z + mz * speed * dt);
      w.resolve(_v, RADIUS);
      this.pos.x = _v.x; this.pos.z = _v.z;
    }
    this.speed = 0;
    const sea = waveHeight(this.pos.x, this.pos.z, t);
    const ground = w.groundAt(this.pos.x, this.pos.z, sea - 0.9);
    // feet find the bottom: wade out
    if (ground > sea - 1.15) { this.mode = 'foot'; this.pos.y = Math.max(this.pos.y, ground); this.velY = 0; return; }
    this.pos.y += (sea - 1.42 + Math.sin(t * 2.1) * 0.035 - this.pos.y) * Math.min(1, dt * 5);

    if (free && (input.hit('KeyE') || input.hit('Space'))) {
      // the boat, a ladder, or an edge low enough to haul out on
      if (input.hit('KeyE') && this.tryBoard()) return;      // only E gets you back into the boat
      for (const l of w.ladders) {
        if (Math.hypot(this.pos.x - l.x, this.pos.z - l.z) < 1.7 && l.y0 < sea + 1.3) { this.startClimb(l, false); return; }
      }
      for (const d of [0.6, 0.95, 1.3]) {
        const x = this.pos.x + fx * d, z = this.pos.z + fz * d, g = w.groundAt(x, z, sea + 1.6);
        if (g > sea - 0.5 && g < sea + 2.1) {
          this.mantle = { from: this.pos.clone(), to: new THREE.Vector3(x, g, z), k: 0 };
          this.busy = 0.6;
          return;
        }
      }
    }
  }
  /** is there something here to climb out on (for the marker)? */
  swimExit(out: THREE.Vector3, camYaw: number, t: number): boolean {
    if (this.mode !== 'swim' || this.mantle) return false;
    const b = this.boat, sea = waveHeight(this.pos.x, this.pos.z, t);
    if (b.mode === 'moored' && b.hasSail && Math.hypot(this.pos.x - b.position.x, this.pos.z - b.position.z) <= 4.6) { b.local(0, 0.7, -0.6, out); return true; }
    for (const l of this.world.ladders) if (Math.hypot(this.pos.x - l.x, this.pos.z - l.z) < 1.7 && l.y0 < sea + 1.3) { out.set(l.x, sea + 1.2, l.z); return true; }
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    for (const d of [0.6, 0.95, 1.3]) {
      const x = this.pos.x + fx * d, z = this.pos.z + fz * d, g = this.world.groundAt(x, z, sea + 1.6);
      if (g > sea - 0.5 && g < sea + 2.1) { out.set(x, g + 0.1, z); return true; }
    }
    return false;
  }

  private updateSail(dt: number, t: number, input: Input, wind: Wind, free: boolean) {
    const b = this.boat, s = b.state;
    this.anchorHit = false;
    if (free && input.hit('KeyF')) this.toggleAnchor();
    if (free && input.hit('KeyE') && b.mode === 'moored') { this.leaveBoat(t); if (this.mode !== 'sail') return; }

    // sit on the windward side; change sides when the boom comes across
    if (Math.abs(s.boom) > 0.12) this.side = s.boom > 0 ? 1 : -1;
    this.sideSmooth += (this.side - this.sideSmooth) * Math.min(1, dt * 3.5);
    const crossing = 1 - Math.abs(this.sideSmooth); // 1 while ducking under the boom

    const f = this.figure, p = f.joints;
    b.seat(_v, this.sideSmooth);
    f.group.position.copy(_v);
    f.group.quaternion.copy(b.group.quaternion);
    // face forward, turned a little inboard
    f.group.rotateY(this.sideSmooth * 0.5);
    this.pos.copy(b.position);
    this.yaw = s.psi;
    this.speed = 0;

    // hike out against the heel, duck when crossing
    const hike = THREE.MathUtils.clamp(Math.abs(s.heel) * 1.6, 0, 0.5) * -this.sideSmooth;
    const duck = crossing * 0.22;
    const breathe = Math.sin(t * 1.4) * 0.005;
    p[J.hips].set(0, 0.1, 0);
    p[J.chest].set(hike * 0.5, 0.1 + 0.46 - duck + breathe, 0.06 + duck * 0.6);
    p[J.head].set(hike * 0.62, 0.1 + 0.68 - duck * 1.5 + breathe, 0.1 + duck);
    p[J.shL].set(p[J.chest].x + LIMB.SH_W, p[J.chest].y - 0.03, p[J.chest].z);
    p[J.shR].set(p[J.chest].x - LIMB.SH_W, p[J.chest].y - 0.03, p[J.chest].z);
    p[J.hipL].set(LIMB.HIP_W, 0.08, 0); p[J.hipR].set(-LIMB.HIP_W, 0.08, 0);
    // feet braced on the floor boards, toward the low side
    for (let k = 0; k < 2; k++) {
      const sgn = k === 0 ? 1 : -1;
      _t.set(sgn * 0.13 + this.sideSmooth * 0.3, -0.43, 0.55 + sgn * 0.06 * this.sideSmooth);
      solveIK(k === 0 ? p[J.hipL] : p[J.hipR], _t, LIMB.THIGH, LIMB.SHIN, POLE_KNEE, p[k === 0 ? J.knL : J.knR], p[k === 0 ? J.ftL : J.ftR]);
    }
    // aft hand on the tiller, forward hand on the sheet
    const aftIsLeft = this.sideSmooth < 0; // sitting to starboard faces port: left hand is aft
    f.group.worldToLocal(b.tillerGrip(_t));
    const aSh = aftIsLeft ? J.shL : J.shR, aEl = aftIsLeft ? J.elL : J.elR, aHa = aftIsLeft ? J.haL : J.haR;
    solveIK(p[aSh], _t, LIMB.UARM, LIMB.FARM, POLE_ELBOW, p[aEl], p[aHa]);
    f.group.worldToLocal(b.sheetPoint(_w));
    const fSh = aftIsLeft ? J.shR : J.shL, fEl = aftIsLeft ? J.elR : J.elL, fHa = aftIsLeft ? J.haR : J.haL;
    // the hand holds the sheet a forearm's length toward the boom, hauling as it is trimmed
    _u.copy(p[fSh]).lerp(_w, 0.34);
    _u.y = Math.min(_u.y, p[fSh].y - 0.12) - (1.5 - s.sheet) * 0.06;
    solveIK(p[fSh], _u, LIMB.UARM, LIMB.FARM, POLE_ELBOW, p[fEl], p[fHa]);

    f.skirtAmount = 0.55;
    // eyes forward, glancing up at the sail now and then
    const glance = Math.max(0, Math.sin(t * 0.37) - 0.86) * 5;
    f.headYaw += (-this.sideSmooth * 0.5 + s.rudder * 0.3 - f.headYaw) * Math.min(1, dt * 3);
    f.headPitch += (-glance * 0.5 - f.headPitch) * Math.min(1, dt * 3);
    if (this.aimDir) this.poseAim();
    // the wind over the deck, as the sailor feels it
    {
      const sn = Math.sin(s.psi), cs = Math.cos(s.psi);
      _w.set(wind.x - (s.u * sn + s.v * cs), 0, wind.z - (s.u * cs - s.v * sn));
      f.wind.copy(_w).applyQuaternion(_q4.copy(f.group.quaternion).invert());
    }
    f.refresh(-this.sideSmooth * 0.4);
  }
}
