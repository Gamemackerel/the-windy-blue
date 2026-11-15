// Things that can be carried: their generated models, pickups in the world,
// and the satchel. There are no names or descriptions anywhere.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { MAT } from './materials';
import { Input } from './input';

export type ItemId = 'sail' | 'fruit' | 'cigarettes' | 'key' | 'revolver' | 'bullet' | 'wheel' | 'contactor' | 'card' | 'orchid' | 'chart';

const m = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
};
const std = (color: string, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** A model of the item roughly 0.25 m across, centred on its origin. */
export function makeItem(id: ItemId): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'sail': {
      const roll = m(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), std('#c9c0aa', 0.95));
      roll.rotation.z = Math.PI / 2;
      g.add(roll);
      break;
    }
    case 'fruit': {
      const f = m(new THREE.SphereGeometry(0.075, 16, 12), std('#b3261a', 0.35));
      f.scale.y = 0.88;
      g.add(f, m(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 5), std('#3f6b2a'), 0, 0.075, 0));
      const leaf = m(new THREE.SphereGeometry(0.03, 6, 4), std('#3f8a34', 0.6), 0.02, 0.08, 0);
      leaf.scale.set(1.4, 0.2, 0.7);
      g.add(leaf);
      break;
    }
    case 'cigarettes': {
      g.add(m(new THREE.BoxGeometry(0.11, 0.17, 0.045), std('#b9b2a0', 0.8)));
      g.add(m(new THREE.BoxGeometry(0.112, 0.045, 0.047), std('#7a2a1c', 0.8), 0, 0.04, 0));
      for (let i = 0; i < 3; i++) g.add(m(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), std('#e8e2d2'), -0.03 + i * 0.03, 0.1, 0));
      break;
    }
    case 'key': {
      const ring = m(new THREE.TorusGeometry(0.045, 0.012, 6, 16), MAT.brass, 0, 0.08, 0);
      g.add(ring, m(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6), MAT.brass, 0, -0.04, 0));
      g.add(m(new THREE.BoxGeometry(0.04, 0.02, 0.012), MAT.brass, 0.022, -0.1, 0), m(new THREE.BoxGeometry(0.03, 0.02, 0.012), MAT.brass, 0.017, -0.07, 0));
      break;
    }
    case 'revolver': {
      const steel = std('#2a2c30', 0.35, 0.9);
      const barrel = m(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), steel, 0, 0.03, 0.11);
      barrel.rotation.x = Math.PI / 2;
      const drum = m(new THREE.CylinderGeometry(0.03, 0.03, 0.055, 10), steel, 0, 0.022, 0.0);
      drum.rotation.x = Math.PI / 2;
      g.add(barrel, drum, m(new THREE.BoxGeometry(0.024, 0.04, 0.1), steel, 0, 0.02, 0.0));
      const grip = m(new THREE.BoxGeometry(0.026, 0.11, 0.04), std('#4a3220', 0.6), 0, -0.04, -0.055);
      grip.rotation.x = -0.35;
      g.add(grip);
      break;
    }
    case 'bullet': {
      g.add(m(new THREE.CylinderGeometry(0.012, 0.012, 0.045, 10), MAT.brass));
      const tip = m(new THREE.SphereGeometry(0.012, 10, 6), std('#6a6a6a', 0.4, 0.8), 0, 0.022, 0);
      tip.scale.y = 1.6;
      g.add(tip);
      g.scale.setScalar(2.2);
      break;
    }
    case 'wheel': {
      g.add(m(new THREE.TorusGeometry(0.11, 0.014, 8, 22), MAT.red));
      for (let k = 0; k < 3; k++) { const sp = m(new THREE.BoxGeometry(0.21, 0.014, 0.014), MAT.red); sp.rotation.z = (k / 3) * Math.PI; g.add(sp); }
      g.add(m(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), MAT.dark).rotateX(Math.PI / 2));
      break;
    }
    case 'contactor': {
      g.add(m(new THREE.BoxGeometry(0.16, 0.12, 0.1), std('#22262a', 0.6, 0.3)));
      for (let i = 0; i < 3; i++) g.add(m(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8), MAT.brass, -0.05 + i * 0.05, 0.08, 0));
      g.add(m(new THREE.BoxGeometry(0.1, 0.03, 0.102), std('#b9b2a0'), 0, -0.02, 0));
      break;
    }
    case 'card': {
      g.add(m(new THREE.BoxGeometry(0.17, 0.012, 0.12), std('#1e4a36', 0.5)));
      for (let i = 0; i < 5; i++) g.add(m(new THREE.BoxGeometry(0.02, 0.014, 0.02), std('#0d0d0d', 0.4), -0.06 + i * 0.03, 0.012, (i % 2) * 0.03 - 0.02));
      g.add(m(new THREE.BoxGeometry(0.17, 0.006, 0.015), MAT.brass, 0, 0, 0.065));
      break;
    }
    case 'orchid': {
      const stem = m(new THREE.CylinderGeometry(0.006, 0.008, 0.2, 5), std('#3f6b2a'), 0, -0.05, 0);
      g.add(stem);
      const petal = std('#efe6f2', 0.5, 0, { emissive: '#b04a9a', emissiveIntensity: 0.25, side: THREE.DoubleSide });
      for (let i = 0; i < 5; i++) {
        const p = m(new THREE.SphereGeometry(0.045, 8, 6), petal);
        p.scale.set(0.55, 1, 0.14);
        const a = (i / 5) * Math.PI * 2;
        p.position.set(Math.sin(a) * 0.04, 0.08 + Math.cos(a) * 0.04, 0.01);
        p.rotation.z = -a;
        g.add(p);
      }
      g.add(m(new THREE.SphereGeometry(0.018, 8, 6), std('#c23a8a', 0.4, 0, { emissive: '#c23a8a', emissiveIntensity: 0.5 }), 0, 0.08, 0.02));
      break;
    }
    case 'chart': {
      const paper = m(new THREE.BoxGeometry(0.26, 0.004, 0.2), std('#c8bc9c', 0.95));
      g.add(paper);
      // the reef as a broken ring, with the passes left open
      const ink = std('#2a2622', 0.9);
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        if (CHART_GAPS.some((ga) => Math.abs(Math.atan2(Math.sin(a - ga), Math.cos(a - ga))) < 0.26)) continue;
        const dot = m(new THREE.BoxGeometry(0.018, 0.003, 0.012), ink, Math.sin(a) * 0.06, 0.004, Math.cos(a) * 0.06);
        dot.rotation.y = a;
        g.add(dot);
      }
      g.add(m(new THREE.CylinderGeometry(0.006, 0.006, 0.003, 8), std('#7a2a1c'), 0, 0.004, 0));
      g.rotation.x = 0.9;
      break;
    }
  }
  return g;
}
/** bearings of the atoll passes, shared with the atoll itself so the chart is true */
export const CHART_GAPS = [0.5, 2.7, 4.4];

/** A thing lying in the world that can be picked up. */
export function addPickup(ctx: Ctx, id: ItemId, key: string, pos: THREE.Vector3, opts: { scale?: number; rot?: number; enabled?: () => boolean; onTake?: () => void; radius?: number } = {}) {
  const { state, world, scene } = ctx;
  if (state.flag('got_' + key)) return null;
  const mesh = makeItem(id);
  mesh.position.copy(pos);
  mesh.scale.multiplyScalar(opts.scale ?? 1);
  mesh.rotation.y = opts.rot ?? 0;
  scene.add(mesh);
  const it = {
    pos: pos.clone(), radius: opts.radius ?? 1.6,
    enabled: () => mesh.visible && (opts.enabled ? opts.enabled() : true),
    use: () => {
      mesh.visible = false;
      state.set('got_' + key);
      state.give(id);
      ctx.sfx('take', pos);
      opts.onTake?.();
    },
  };
  world.interactables.push(it);
  return mesh;
}

/** The satchel: carried items laid out in a shallow arc in front of the camera. */
export class Satchel {
  open = false;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(36, 1, 0.05, 10);
  private slots: { id: ItemId; obj: THREE.Group }[] = [];
  private index = 0;
  private fade = 0;
  private veil: THREE.Mesh;
  private signature = '';

  constructor(private ctx: Ctx, private onHold: (id: ItemId | null) => void, private held: () => string | null) {
    this.scene.add(new THREE.HemisphereLight('#d8d2c4', '#2a2622', 2.2));
    const key = new THREE.DirectionalLight('#fff0dc', 2.5);
    key.position.set(1, 2, 2);
    this.scene.add(key);
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: '#05070a', transparent: true, opacity: 0, depthWrite: false }));
    this.veil.position.z = -3;
    this.scene.add(this.veil);
    this.cam.position.set(0, 0.25, 1.6);
    this.cam.lookAt(0, 0, 0);
  }

  toggle() { this.open = !this.open; if (this.open) this.rebuild(); }

  private rebuild() {
    const items = [...new Set(this.ctx.state.data.items)] as ItemId[];
    const sig = items.join(',');
    if (sig === this.signature) return;
    this.signature = sig;
    for (const s of this.slots) this.scene.remove(s.obj);
    this.slots = items.map((id) => {
      const obj = makeItem(id);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3()).length();
      obj.scale.multiplyScalar(0.34 / Math.max(size, 0.01));
      this.scene.add(obj);
      return { id, obj };
    });
    const h = this.held();
    const hi = this.slots.findIndex((s) => s.id === h);
    this.index = hi >= 0 ? hi : Math.min(this.index, Math.max(0, this.slots.length - 1));
  }

  update(dt: number, t: number, input: Input) {
    if (input.hit('Tab')) this.toggle();
    this.fade += ((this.open ? 1 : 0) - this.fade) * Math.min(1, dt * 9);
    if (!this.open) return;
    this.rebuild();
    const n = this.slots.length;
    if (n > 0) {
      if (input.hit('KeyD') || input.hit('ArrowRight')) this.index = (this.index + 1) % n;
      if (input.hit('KeyA') || input.hit('ArrowLeft')) this.index = (this.index + n - 1) % n;
      if (input.hit('KeyE') || input.hit('Enter')) {
        const id = this.slots[this.index].id;
        this.onHold(this.held() === id ? null : id);
        this.open = false;
      }
    }
    if (input.hit('Escape')) this.open = false;
    this.slots.forEach((s, i) => {
      const k = i - this.index;
      const sel = i === this.index;
      const tx = k * 0.42, tz = -Math.abs(k) * 0.22, ty = sel ? 0.08 : -0.04;
      s.obj.position.x += (tx - s.obj.position.x) * Math.min(1, dt * 10);
      s.obj.position.y += (ty - s.obj.position.y) * Math.min(1, dt * 10);
      s.obj.position.z += (tz - s.obj.position.z) * Math.min(1, dt * 10);
      if (sel) s.obj.rotation.y += dt * 0.9; else s.obj.rotation.y += (0.5 - s.obj.rotation.y) * Math.min(1, dt * 4);
    });
  }

  render(renderer: THREE.WebGLRenderer, aspect: number) {
    if (this.fade < 0.01) return;
    (this.veil.material as THREE.MeshBasicMaterial).opacity = this.fade * 0.72;
    for (const s of this.slots) s.obj.visible = this.fade > 0.5;
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
    renderer.autoClear = auto;
  }
}
