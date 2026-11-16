// The few other people. They sit or stand, breathe, smoke, watch you, and
// trade without a word. They can also be shot.
import * as THREE from 'three';
import { Figure, FigureLook, J, LIMB, solveIK } from './figure';
import { Ctx } from './ctx';
import { ItemId, makeItem, addPickup } from './items';
import { waveHeight } from './waves';
import { World } from './world';

const _t = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const POLE_KNEE = new THREE.Vector3(0, 0.4, 1), POLE_L = new THREE.Vector3(0.55, -1, -0.35), POLE_R = new THREE.Vector3(-0.55, -1, -0.35);
const _fq = new THREE.Quaternion(), _hq = new THREE.Quaternion(), _tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0.25, 0));
const { UARM, FARM, THIGH, SHIN, SH_W, HIP_W } = LIMB;

type Pose = THREE.Vector3[];
const newPose = (): Pose => Array.from({ length: J.COUNT }, () => new THREE.Vector3());

function limbs(p: Pose, handL: THREE.Vector3, handR: THREE.Vector3, footL: THREE.Vector3, footR: THREE.Vector3) {
  solveIK(p[J.shL], handL, UARM, FARM, POLE_L, p[J.elL], p[J.haL]);
  solveIK(p[J.shR], handR, UARM, FARM, POLE_R, p[J.elR], p[J.haR]);
  solveIK(p[J.hipL], footL, THIGH, SHIN, POLE_KNEE, p[J.knL], p[J.ftL]);
  solveIK(p[J.hipR], footR, THIGH, SHIN, POLE_KNEE, p[J.knR], p[J.ftR]);
}
function trunk(p: Pose, hipY: number, hipZ: number, leanF: number, leanS: number, breathe: number) {
  const spine = 0.48;
  p[J.hips].set(0, hipY, hipZ);
  p[J.chest].set(leanS * spine, hipY + Math.cos(leanF) * spine + breathe, hipZ + Math.sin(leanF) * spine);
  p[J.head].set(p[J.chest].x * 1.2, p[J.chest].y + 0.22, p[J.chest].z + 0.02 + leanF * 0.12);
  p[J.shL].set(p[J.chest].x + SH_W, p[J.chest].y - 0.03, p[J.chest].z);
  p[J.shR].set(p[J.chest].x - SH_W, p[J.chest].y - 0.03, p[J.chest].z);
  p[J.hipL].set(HIP_W, hipY - 0.04, hipZ); p[J.hipR].set(-HIP_W, hipY - 0.04, hipZ);
}
const hL = new THREE.Vector3(), hR = new THREE.Vector3(), fL = new THREE.Vector3(), fR = new THREE.Vector3();

export interface NpcSpec {
  key: string;
  look: FigureLook;
  pos: THREE.Vector3;       // ground under the hips (or the floor under a seat)
  yaw: number;
  pose: 'sit' | 'stand';
  seat?: number;            // seat height for sitters
  smokes?: boolean;
  wants?: ItemId;
  gives?: ItemId;
  giveSpot?: THREE.Vector3; // where a traded item is set down
}

export class Npc {
  readonly figure: Figure;
  readonly pos: THREE.Vector3;
  /** 0 alive, 1 wounded, 2 dead */
  condition = 0;
  private target = newPose();
  private t = Math.random() * 20;
  private smokeT = Math.random() * 6;
  private lookAway = 0;
  private consider = 0;      // seconds left studying an offered item
  private reach = 0;         // 0..1 hand going out to take
  private pending: (() => void) | null = null;
  private wound = new THREE.Vector3();
  private knock = new THREE.Vector3();
  private ragdoll: Ragdoll | null = null;
  private ember: THREE.MeshStandardMaterial | null = null;
  private cig: THREE.Group | null = null;
  private puffs: THREE.Sprite[] = [];
  private puffI = 0;
  private wasAtMouth = false;
  private drag = 0;
  readonly chest = new THREE.Vector3();

  constructor(private ctx: Ctx, readonly spec: NpcSpec, private playerHand: () => THREE.Vector3, private playerPos: () => THREE.Vector3) {
    this.figure = new Figure(spec.look);
    this.pos = spec.pos.clone();
    ctx.scene.add(this.figure.group);
    this.figure.group.position.copy(this.pos);
    this.figure.group.rotation.y = spec.yaw;
    if (spec.pose === 'sit') this.figure.skirtAmount = 0.4;

    if (spec.smokes) {
      // held between the first two fingers, lit end away from the face
      const cig = new THREE.Group();
      const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.05, 6), new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.9 }));
      paper.rotation.x = Math.PI / 2; paper.position.z = 0.047;
      const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.0044, 0.0044, 0.022, 6), new THREE.MeshStandardMaterial({ color: '#b08a4a', roughness: 0.9 }));
      filter.rotation.x = Math.PI / 2; filter.position.z = 0.011;
      const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0042, 0.008, 6), new THREE.MeshStandardMaterial({ color: '#8a8a86', roughness: 1 }));
      ash.rotation.x = Math.PI / 2; ash.position.z = 0.076;
      this.ember = new THREE.MeshStandardMaterial({ color: '#2a1206', emissive: '#ff5a1a', emissiveIntensity: 1 });
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0046, 6, 4), this.ember);
      tip.position.z = 0.081;
      cig.add(paper, filter, ash, tip);
      cig.position.set(0.006, 0.098, 0.006);
      this.cig = cig;
      this.figure.rightHandSlot.add(cig);
      const tex = puffTexture();
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: '#c9c6bd' }));
        s.visible = false;
        ctx.scene.add(s);
        this.puffs.push(s);
      }
    }

    this.condition = ctx.state.flag('npc_' + spec.key);
    this.computePose(0);
    for (let i = 0; i < J.COUNT; i++) this.figure.joints[i].copy(this.target[i]);
    if (this.condition === 2) this.startRagdoll(new THREE.Vector3(0, 0, -1), J.chest, true);
    this.figure.refresh(0);

    ctx.world.interactables.push({
      pos: this.chest, radius: 2.7,
      enabled: () => this.condition === 0,
      use: () => this.onUse(),
    });
    ctx.world.updaters.push((dt, t) => this.update(dt, t));
    this.dropTradeItem(true);
  }

  private traded() { return !!this.ctx.state.flag('traded_' + this.spec.key); }

  /** called when the player interacts; holding something means offering it */
  onUse() {}
  offer(item: string | null, take: () => void): void {
    if (this.condition !== 0) return;
    if (!item) { this.lookAway = 0; this.consider = 0.6; this.ctx.sfx('hm', this.chest, 0.7); return; }
    this.consider = 1.3;
    this.pending = () => {
      if (item === this.spec.wants && !this.traded()) {
        this.reach = 0.001;
        this.ctx.world.after(0.55, () => {
          take();
          this.ctx.state.set('traded_' + this.spec.key);
          this.ctx.sfx('take', this.pos);
          this.ctx.world.after(1.6, () => this.dropTradeItem(false));
        });
      } else this.lookAway = 2.6;
    };
  }

  /** put the thing they give where the player can take it */
  private dropTradeItem(restoring: boolean) {
    const s = this.spec;
    if (!s.gives || !s.giveSpot) return;
    const due = this.traded() || this.condition > 0;
    if (!due || this.ctx.state.flag('got_trade_' + s.key)) return;
    if (!restoring) { this.reach = 0.001; this.ctx.sfx('place', s.giveSpot); }
    addPickup(this.ctx, s.gives, 'trade_' + s.key, s.giveSpot, { scale: s.gives === 'chart' ? 1.4 : 1.2 });
  }

  /** a bullet has struck this joint, travelling along dir */
  hit(joint: number, dir: THREE.Vector3) {
    if (this.condition === 2) { this.ragdoll?.impulse(joint, dir, 3); return; }
    const fatal = joint === J.head || joint === J.chest || joint === J.shL || joint === J.shR;
    this.ctx.sfx(fatal ? 'bodyfall' : 'grunt', this.pos);
    if (fatal) {
      this.condition = 2;
      this.startRagdoll(dir, joint, false);
    } else {
      this.condition = 1;
      this.figure.group.worldToLocal(this.wound.copy(this.figure.group.localToWorld(_t.copy(this.figure.joints[joint]))));
      this.knock.copy(dir).setY(0).normalize().multiplyScalar(2.4);
    }
    this.ctx.state.set('npc_' + this.spec.key, this.condition);
    this.dropTradeItem(false);
  }

  /** world positions of the joints, for hit testing */
  jointWorld(i: number, out: THREE.Vector3) {
    out.copy(this.figure.joints[i]);
    return this.ragdoll ? out : this.figure.group.localToWorld(out);
  }

  private startRagdoll(dir: THREE.Vector3, joint: number, settled: boolean) {
    const f = this.figure;
    const pts = f.joints.map((j) => f.group.localToWorld(j.clone()));
    f.group.position.set(0, 0, 0);
    f.group.rotation.set(0, 0, 0);
    f.group.updateMatrixWorld();
    f.skirtAmount = 0.8;
    for (let i = 0; i < J.COUNT; i++) f.joints[i].copy(pts[i]);
    this.ragdoll = new Ragdoll(f.joints, this.ctx.world);
    this.ragdoll.impulse(joint, dir, settled ? 2 : 5.5);
    if (settled) for (let i = 0; i < 360; i++) this.ragdoll.step(1 / 60, 0);
    for (const s of this.puffs) s.visible = false;
    if (this.ember) this.ember.emissiveIntensity = 0;
  }

  private computePose(dt: number) {
    const p = this.target, s = this.spec, t = this.t;
    const breathe = Math.sin(t * 1.3) * 0.007;
    if (this.condition === 1) {
      // crouched over the wound, breathing hard
      const pant = Math.sin(t * 5.5) * 0.012;
      trunk(p, 0.4, -0.08, 0.75, 0.06, pant);
      p[J.head].set(0.03, p[J.chest].y + 0.1, p[J.chest].z + 0.2);
      hL.copy(this.wound); hL.y = Math.min(hL.y, 0.7); hL.z = Math.max(hL.z, 0.1);
      hR.set(-0.28, 0.06, 0.42);
      fL.set(0.15, 0.03, 0.08); fR.set(-0.16, 0.03, -0.02);
      limbs(p, hL, hR, fL, fR);
      return;
    }
    if (s.pose === 'sit') {
      const seat = s.seat ?? 0.45;
      trunk(p, seat + 0.09, 0, -0.16, Math.sin(t * 0.21) * 0.02, breathe);
      hL.set(0.15, seat + 0.2, 0.3); hR.set(-0.15, seat + 0.2, 0.3);
      fL.set(0.13, 0.03, 0.44); fR.set(-0.13, 0.03, 0.4);
    } else {
      const sway = Math.sin(t * 0.33) * 0.025;
      trunk(p, LIMB.HIP_Y - 0.03, 0, 0.04, sway * 0.6, breathe);
      p[J.hips].x = sway;
      hL.set(SH_W + 0.05, p[J.chest].y - 0.58, 0.06); hR.set(-SH_W - 0.05, p[J.chest].y - 0.58, 0.06);
      fL.set(0.11, 0.03, 0.02); fR.set(-0.11, 0.03, -0.03);
    }
    // smoking: the right hand travels to the mouth and back
    let atMouth = false;
    if (s.smokes) {
      this.smokeT += dt;
      const c = this.smokeT % 9.5;
      const k = c < 1.1 ? c / 1.1 : c < 2.6 ? 1 : c < 3.6 ? 1 - (c - 2.6) : 0;
      const e = k * k * (3 - 2 * k);
      // the wrist stops below the chin so the fingertips, and the cigarette in them, reach the lips
      _t.set(p[J.head].x - 0.03, p[J.head].y - 0.155, p[J.head].z + 0.075);
      hR.lerp(_t, e);
      this.drag = e;
      atMouth = c > 1.1 && c < 2.6;
      if (this.ember) this.ember.emissiveIntensity = atMouth ? 5 + Math.sin(c * 6) * 2 : 0.8 + Math.sin(t * 3) * 0.3;
      if (this.wasAtMouth && !atMouth) this.exhale();
      this.wasAtMouth = atMouth;
    }
    // taking or giving: the left hand goes out
    if (this.reach > 0) {
      const e = Math.sin(Math.min(1, this.reach) * Math.PI);
      this.figure.group.worldToLocal(_t.copy(this.playerHand()));
      _t.y = Math.max(_t.y, 0.5);
      hL.lerp(_t, e * 0.85);
    }
    limbs(p, hL, hR, fL, fR);
  }

  private exhale() {
    for (let i = 0; i < 4; i++) {
      const s = this.puffs[this.puffI++ % this.puffs.length];
      this.figure.mouthSlot.getWorldPosition(s.position);
      s.userData = { age: -i * 0.18, vx: (Math.random() - 0.5) * 0.1, vz: (Math.random() - 0.5) * 0.1 };
      s.visible = true;
    }
  }

  private update(dt: number, t: number) {
    this.t += dt;
    const f = this.figure;
    for (const s of this.puffs) {
      if (!s.visible) continue;
      const u = s.userData as { age: number; vx: number; vz: number };
      u.age += dt;
      if (u.age < 0) { s.material.opacity = 0; continue; }
      s.position.x += (u.vx + 0.12) * dt; s.position.z += u.vz * dt; s.position.y += 0.22 * dt;
      const k = u.age / 3.2;
      s.scale.setScalar(0.08 + k * 0.5);
      s.material.opacity = Math.max(0, 0.28 * (1 - k));
      if (k >= 1) s.visible = false;
    }
    if (this.ragdoll) {
      this.ragdoll.step(dt, t);
      this.chest.copy(f.joints[J.chest]);
      f.refresh(0);
      return;
    }
    // knocked back by a wounding shot
    if (this.knock.lengthSq() > 1e-4) {
      this.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 7));
      f.group.position.copy(this.pos);
    }
    if (this.consider > 0) {
      this.consider -= dt;
      if (this.consider <= 0 && this.pending) { this.pending(); this.pending = null; }
    }
    if (this.reach > 0) { this.reach += dt * 1.1; if (this.reach >= 1) this.reach = 0; }
    this.lookAway = Math.max(0, this.lookAway - dt);

    // the wind finds their coats too
    { const w = this.ctx.wind, a = w.dir - f.group.rotation.y; f.wind.set(Math.sin(a) * w.speed * 0.6, 0, Math.cos(a) * w.speed * 0.6); }
    this.computePose(dt);
    const rate = Math.min(1, dt * (this.condition === 1 ? 5 : 9));
    for (let i = 0; i < J.COUNT; i++) f.joints[i].lerp(this.target[i], rate);
    f.skirtAmount += ((this.condition === 1 ? 0.45 : this.spec.pose === 'sit' ? 0.4 : 1) - f.skirtAmount) * rate;

    // eyes follow the player when they are near
    let wantYaw = 0, wantPitch = this.condition === 1 ? 0.5 : 0.03;
    const pp = this.playerPos();
    const d = pp.distanceTo(this.pos);
    if (this.condition === 0 && d < 16) {
      f.group.worldToLocal(_t.copy(pp)).y += 1.5;
      if (this.consider > 0) f.group.worldToLocal(_t.copy(this.playerHand()));
      wantYaw = THREE.MathUtils.clamp(Math.atan2(_t.x, _t.z), -1.25, 1.25);
      wantPitch = THREE.MathUtils.clamp(-Math.atan2(_t.y - f.joints[J.head].y, Math.hypot(_t.x, _t.z)), -0.5, 0.6);
      if (this.lookAway > 0) { wantYaw = -Math.sign(wantYaw || 1) * 0.9; wantPitch = 0.15; }
    } else wantYaw = Math.sin(this.t * 0.13) * 0.35;
    f.headYaw += (wantYaw - f.headYaw) * Math.min(1, dt * 2.2);
    f.headPitch += (wantPitch - f.headPitch) * Math.min(1, dt * 2.2);
    f.refresh(0);
    if (this.cig) {
      // keep the cigarette pointing out from the face whatever the wrist is doing
      f.group.getWorldQuaternion(_fq).multiply(_tilt);
      f.rightHandSlot.getWorldQuaternion(_hq).invert();
      this.cig.quaternion.copy(_hq).multiply(_fq);
    }
    // the head dips a little to meet the hand
    f.headPitch += this.drag * 0.12;
    f.group.localToWorld(this.chest.copy(f.joints[J.chest]));
  }
}

let _puff: THREE.Texture | null = null;
function puffTexture() {
  if (_puff) return _puff;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _puff = new THREE.CanvasTexture(c);
  return _puff;
}
export const softDot = puffTexture;

// ----------------------------------------------------------------- ragdoll
// Verlet points at the joints held together by bone-length constraints.
const BONES: [number, number][] = [
  [J.hips, J.chest], [J.chest, J.head],
  [J.chest, J.shL], [J.chest, J.shR], [J.shL, J.shR],
  [J.shL, J.elL], [J.elL, J.haL], [J.shR, J.elR], [J.elR, J.haR],
  [J.hips, J.hipL], [J.hips, J.hipR], [J.hipL, J.hipR],
  [J.hipL, J.knL], [J.knL, J.ftL], [J.hipR, J.knR], [J.knR, J.ftR],
  // bracing so the trunk keeps its shape
  [J.shL, J.hipL], [J.shR, J.hipR], [J.shL, J.hipR], [J.shR, J.hipL], [J.head, J.shL], [J.head, J.shR], [J.chest, J.hipL], [J.chest, J.hipR],
];
// pairs that may not come closer than a minimum (stops limbs folding through the body)
const APART: [number, number, number][] = [
  [J.head, J.hips, 0.52], [J.knL, J.knR, 0.13], [J.ftL, J.ftR, 0.12], [J.ftL, J.hips, 0.3], [J.ftR, J.hips, 0.3],
  [J.haL, J.chest, 0.16], [J.haR, J.chest, 0.16], [J.knL, J.chest, 0.3], [J.knR, J.chest, 0.3], [J.elL, J.elR, 0.25],
];

export class Ragdoll {
  private prev: THREE.Vector3[];
  private rest: number[];
  private quiet = 0;
  asleep = false;

  constructor(private p: THREE.Vector3[], private world: World) {
    this.prev = p.map((v) => v.clone());
    this.rest = BONES.map(([a, b]) => p[a].distanceTo(p[b]));
  }

  impulse(joint: number, dir: THREE.Vector3, speed: number) {
    this.asleep = false; this.quiet = 0;
    const dt = 1 / 60;
    for (let i = 0; i < this.p.length; i++) {
      const near = 1 / (1 + this.p[i].distanceTo(this.p[joint]) * 3);
      this.prev[i].addScaledVector(dir, -speed * dt * (0.25 + near));
    }
    this.prev[joint].y += 0.01;
  }

  step(dt: number, t: number) {
    if (this.asleep) return;
    const h = Math.min(dt, 1 / 30);
    const p = this.p, prev = this.prev;
    let motion = 0;
    for (let i = 0; i < p.length; i++) {
      const v = _u.subVectors(p[i], prev[i]).multiplyScalar(0.985);
      prev[i].copy(p[i]);
      p[i].add(v);
      p[i].y -= 13 * h * h;
      motion += v.lengthSq();
    }
    for (let it = 0; it < 6; it++) {
      for (let k = 0; k < BONES.length; k++) {
        const a = p[BONES[k][0]], b = p[BONES[k][1]];
        _u.subVectors(b, a);
        const d = _u.length() || 1e-6;
        const corr = ((d - this.rest[k]) / d) * 0.5;
        a.addScaledVector(_u, corr); b.addScaledVector(_u, -corr);
      }
      for (const [ia, ib, min] of APART) {
        const a = p[ia], b = p[ib];
        _u.subVectors(b, a);
        const d = _u.length() || 1e-6;
        if (d < min) { const corr = ((d - min) / d) * 0.5; a.addScaledVector(_u, corr); b.addScaledVector(_u, -corr); }
      }
      for (let i = 0; i < p.length; i++) {
        const r = i === J.head ? 0.11 : i === J.hips || i === J.chest ? 0.14 : 0.06;
        const g = this.world.groundAt(p[i].x, p[i].z, p[i].y + 0.25);
        const sea = waveHeight(p[i].x, p[i].z, t);
        if (g < sea - 0.4) {
          // in the water: floats low, heavily damped
          if (p[i].y < sea - 0.12) {
            p[i].y += (sea - 0.12 - p[i].y) * 0.08;
            prev[i].lerp(p[i], 0.12);
          }
        } else if (p[i].y < g + r) {
          p[i].y = g + r;
          // ground friction
          prev[i].x += (p[i].x - prev[i].x) * 0.35; prev[i].z += (p[i].z - prev[i].z) * 0.35;
        }
        _w.copy(p[i]); _w.y -= 0.04;
        this.world.resolve(_w, r, 0.08);
        p[i].x = _w.x; p[i].z = _w.z;
      }
    }
    if (motion < 2e-5) { this.quiet += dt; if (this.quiet > 2.5) this.asleep = true; } else this.quiet = 0;
  }
}
