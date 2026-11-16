// All sound is synthesised: filtered noise for wind, sea and steel; sines
// for machinery and for the giant's voice. Nothing is recorded.
import * as THREE from 'three';

export interface Mix {
  sailing: boolean; boatSpeed: number; drive: number; wind: number; luff: number;
  height: number; indoors: boolean; submerged: boolean; walking: number; climbing: number;
  night: number; towerDist: number; turbine: number; bump: number; rot: number;
  /** walking on steel rather than earth, wood or concrete */
  metal: boolean;
  /** 0 at the water's edge, 1 deep inland */
  inland: number;
}

type Recipe = (a: Audio, out: AudioNode, t: number) => void;

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private tone!: BiquadFilterNode;
  private noiseBuf!: AudioBuffer;
  private shots!: DynamicsCompressorNode;
  private layers: Record<string, { gain: GainNode; filter: BiquadFilterNode }> = {};
  private stepT = 0;
  private gustT = 0;
  private _p = new THREE.Vector3();
  private lastBump = 0;
  /** master switch from the pause menu */
  enabled = true;

  constructor(private camera: THREE.Camera) {
    const start = () => { this.init(); removeEventListener('pointerdown', start); removeEventListener('keydown', start); };
    addEventListener('pointerdown', start);
    addEventListener('keydown', start);
  }

  private init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(0.9, c.currentTime + 3);
    this.tone = c.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    // Only the one-shot sounds pass through the limiter. The steady beds (sea, wind) go
    // straight out, so a footstep can never make the sea duck and pump.
    this.shots = c.createDynamicsCompressor();
    this.shots.threshold.value = -10; this.shots.ratio.value = 3; this.shots.attack.value = 0.003; this.shots.release.value = 0.25;
    this.shots.connect(this.tone);
    this.tone.connect(this.master).connect(c.destination);

    const len = c.sampleRate * 4;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = b * 0.6 + w * 0.4; d[i] = w * 0.6 + b * 0.8; }

    const layer = (name: string, type: BiquadFilterType, freq: number, q: number) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const filter = c.createBiquadFilter();
      filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
      const gain = c.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.tone);
      src.start(0, Math.random() * 3);
      this.layers[name] = { gain, filter };
    };
    layer('wind', 'bandpass', 520, 0.7);
    layer('windHigh', 'bandpass', 2300, 2.5);
    layer('sea', 'lowpass', 420, 0.3);
    layer('hull', 'highpass', 1400, 0.4);
    layer('luff', 'bandpass', 900, 1.2);
    layer('deep', 'lowpass', 90, 2);
    layer('turbine', 'lowpass', 260, 1.5);
    layer('flies', 'bandpass', 5200, 14);
  }

  // ----- building blocks -----
  noise(out: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, attack = 0.005) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(20, f0), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 3, dur + 0.05);
  }
  sine(out: AudioNode, t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine', attack = 0.01, vib = 0) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.03; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.1);
  }
  /** a sparse tonal swell, used only at the big moments */
  pad(out: AudioNode, t: number, dur: number, notes: number[], gain: number) {
    for (const n of notes) { this.sine(out, t, dur, n, n, gain, 'sine', dur * 0.4, 0.2); this.sine(out, t, dur, n * 2.003, n * 2.003, gain * 0.25, 'triangle', dur * 0.5); }
  }

  /** one-shot by name, optionally placed in the world */
  play(name: string, pos?: THREE.Vector3, gain = 1) {
    const c = this.ctx;
    if (!c) return;
    const r = RECIPES[name] ?? RECIPES[name.split('-')[0]] ?? RECIPES.click;
    const g = c.createGain();
    let level = gain, pan = 0;
    if (pos) {
      this.camera.getWorldPosition(this._p);
      const d = this._p.distanceTo(pos);
      const far = name.startsWith('giant') ? 260 : name === 'shot' ? 80 : 14;
      level *= 1 / (1 + (d / far) ** 2);
      this._p.copy(pos).applyMatrix4(this.camera.matrixWorldInverse);
      pan = THREE.MathUtils.clamp(this._p.x / (Math.abs(this._p.z) + 6), -0.8, 0.8);
    }
    g.gain.value = level;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.shots);
    r(this, g, c.currentTime + 0.01);
  }

  update(dt: number, m: Mix) {
    const c = this.ctx;
    if (!c) return;
    const L = this.layers, now = c.currentTime;
    const set = (n: string, v: number, tc = 0.4) => L[n].gain.gain.setTargetAtTime(Math.max(0, v), now, tc);
    const shelter = m.submerged ? 0 : m.indoors ? 0.35 : 1;
    const w = Math.min(2.6, Math.pow(m.wind / 9, 1.3)) * (1 + Math.max(0, m.height) / 60);
    this.gustT += dt;
    const gust = 0.8 + 0.25 * Math.sin(this.gustT * 0.37) + 0.15 * Math.sin(this.gustT * 1.3);
    set('wind', 0.11 * w * gust * shelter, 0.8);
    L.wind.filter.frequency.setTargetAtTime(380 + 260 * gust + m.height * 4, now, 1);
    set('windHigh', 0.012 * w * gust * (m.sailing ? 1.6 : 0.5 + Math.max(0, m.height) / 40) * shelter, 0.8);
    const near = Math.exp(-Math.max(0, m.height) / 30);
    // the sea falls away, and loses its hiss, as you go inland
    set('sea', (0.08 + 0.13 * Math.min(2.4, m.wind / 9)) * near * shelter * (1 - 0.85 * m.inland) * (0.8 + 0.2 * Math.sin(this.gustT * 0.5)), 1);
    L.sea.filter.frequency.setTargetAtTime(420 - 250 * m.inland, now, 1);
    set('hull', m.sailing ? Math.min(0.09, Math.abs(m.boatSpeed) * 0.012) : 0, 0.3);
    set('luff', m.sailing ? 0.07 * m.luff * (0.5 + 0.5 * Math.sin(this.gustT * 23)) : 0, 0.05);
    set('deep', m.submerged ? 0.5 : 0, 1.2);
    set('turbine', m.turbine >= 0 ? 0.35 * (0.6 + 0.4 * Math.sin(this.gustT * 2.55)) / (1 + (m.turbine / 90) ** 2) * (m.submerged ? 0.3 : 1) : 0, 0.2);
    set('flies', m.rot >= 0 ? 0.05 / (1 + (m.rot / 190) ** 2) * (0.7 + 0.3 * Math.sin(this.gustT * 9)) : 0, 0.3);
    // near the tower the world goes quiet
    const hush = THREE.MathUtils.clamp((m.towerDist - 45) / 170, 0.12, 1);
    this.master.gain.setTargetAtTime(this.enabled ? 0.9 * hush : 0, now, this.enabled ? 1.5 : 0.1);
    this.tone.frequency.setTargetAtTime(m.submerged ? 900 : 18000, now, 0.5);

    // footsteps and rungs
    const pace = m.walking > 0.1 ? m.walking : m.climbing;
    if (pace > 0.1) {
      this.stepT -= dt * (m.walking > 0.1 ? 0.9 + m.walking * 0.42 : 2.4 * m.climbing);
      if (this.stepT <= 0) { this.stepT = 1; this.play(m.walking > 0.1 ? (m.metal ? 'stepMetal' : 'step') : 'rung', undefined, 0.32 + Math.random() * 0.12); }
    } else this.stepT = 0.3;
    if (m.bump > 1 && this.lastBump <= 1) this.play('scrape', undefined, Math.min(1.5, m.bump * 0.3));
    this.lastBump = m.bump;
  }
}

const RECIPES: Record<string, Recipe> = {
  click: (a, o, t) => a.noise(o, t, 0.05, 'bandpass', 2400, 1200, 2, 0.15),
  step: (a, o, t) => { a.noise(o, t, 0.11, 'lowpass', 700, 180, 0.7, 0.16); a.noise(o, t, 0.05, 'bandpass', 2600, 1800, 1, 0.03); },
  stepMetal: (a, o, t) => { a.noise(o, t, 0.1, 'bandpass', 900, 500, 3, 0.12); a.sine(o, t, 0.25, 310 + Math.random() * 60, 290, 0.02, 'triangle'); },
  rung: (a, o, t) => { a.sine(o, t, 0.3, 520 + Math.random() * 120, 500, 0.025, 'triangle'); a.noise(o, t, 0.04, 'bandpass', 1800, 900, 2, 0.06); },
  take: (a, o, t) => { a.noise(o, t, 0.12, 'bandpass', 1900, 700, 1.2, 0.1); },
  place: (a, o, t) => { a.noise(o, t, 0.1, 'lowpass', 900, 200, 0.8, 0.2); },
  cloth: (a, o, t) => { a.noise(o, t, 0.5, 'bandpass', 1200, 500, 0.8, 0.18, 0.08); a.noise(o, t + 0.25, 0.4, 'bandpass', 800, 400, 0.8, 0.12, 0.05); },
  lift: (a, o, t) => { a.noise(o, t, 0.3, 'bandpass', 500, 900, 2, 0.08, 0.1); },
  clank: (a, o, t) => { a.sine(o, t, 0.5, 410, 380, 0.07, 'triangle'); a.sine(o, t, 0.35, 977, 940, 0.04, 'triangle'); a.noise(o, t, 0.07, 'bandpass', 2600, 900, 1.5, 0.22); },
  thud: (a, o, t) => { a.sine(o, t, 0.5, 90, 38, 0.5); a.noise(o, t, 0.2, 'lowpass', 500, 120, 0.6, 0.3); },
  ratchet: (a, o, t) => { for (let i = 0; i < 5; i++) a.noise(o, t + i * 0.045, 0.03, 'bandpass', 2600, 1700, 4, 0.14); },
  valve: (a, o, t) => { for (let i = 0; i < 9; i++) a.noise(o, t + i * 0.16, 0.12, 'bandpass', 700 + i * 30, 500, 5, 0.1, 0.03); a.noise(o, t + 1.2, 2.5, 'lowpass', 300, 900, 0.5, 0.2, 0.8); },
  lever: (a, o, t) => { a.noise(o, t, 0.25, 'bandpass', 600, 300, 3, 0.2, 0.05); a.sine(o, t + 0.22, 0.4, 180, 140, 0.15, 'triangle'); a.noise(o, t + 0.22, 0.08, 'bandpass', 2000, 800, 1, 0.25); },
  door: (a, o, t) => { a.noise(o, t, 1.6, 'bandpass', 180, 120, 4, 0.3, 0.3); a.sine(o, t, 1.6, 70, 55, 0.12, 'sawtooth', 0.4); a.sine(o, t + 1.5, 0.5, 80, 40, 0.4); },
  gate: (a, o, t) => { a.noise(o, t, 6, 'bandpass', 140, 100, 5, 0.35, 0.8); a.sine(o, t, 6, 52, 44, 0.14, 'sawtooth', 1); a.sine(o, t + 5.8, 0.8, 70, 30, 0.5); },
  flood: (a, o, t) => { a.noise(o, t, 17, 'lowpass', 500, 1400, 0.4, 0.4, 2.5); a.noise(o, t, 17, 'bandpass', 2400, 1500, 0.6, 0.08, 3); },
  winch: (a, o, t) => { for (let i = 0; i < 40; i++) a.noise(o, t + i * 0.17, 0.05, 'bandpass', 1500, 900, 5, 0.09); a.sine(o, t, 6.8, 95, 88, 0.05, 'sawtooth', 0.5); },
  groan: (a, o, t) => { a.sine(o, t, 1.4, 96, 61, 0.22, 'sawtooth', 0.2, 5); a.noise(o, t, 1.2, 'bandpass', 240, 150, 6, 0.25, 0.2); },
  yaw: (a, o, t) => { a.sine(o, t, 3.3, 48, 52, 0.25, 'sawtooth', 0.5); a.noise(o, t, 3.3, 'bandpass', 300, 260, 5, 0.2, 0.5); for (let i = 0; i < 14; i++) a.noise(o, t + i * 0.23, 0.04, 'bandpass', 1900, 1100, 4, 0.07); },
  hum: (a, o, t) => { a.sine(o, t, 3, 100, 100, 0.12, 'sine', 0.6); a.sine(o, t, 3, 200, 200, 0.04, 'sine', 0.8); },
  spinup: (a, o, t) => {
    a.sine(o, t, 22, 22, 46, 0.5, 'sine', 8); a.noise(o, t, 22, 'lowpass', 120, 420, 1, 0.45, 9);
    a.pad(o, t + 3, 18, [73.4, 110, 146.8, 220], 0.07);
  },
  relay: (a, o, t) => { a.noise(o, t, 0.05, 'bandpass', 2000, 900, 1.5, 0.4); a.sine(o, t + 0.05, 1.2, 100, 100, 0.08, 'sawtooth', 0.1); a.noise(o, t + 0.1, 0.3, 'highpass', 5000, 7000, 1, 0.04); },
  'flood-lights': (a, o, t) => { a.sine(o, t, 0.6, 60, 50, 0.4); a.pad(o, t + 0.3, 16, [61.7, 92.5, 123.5, 185, 277.2], 0.065); },
  unlock: (a, o, t) => { a.noise(o, t, 0.06, 'bandpass', 2600, 1500, 3, 0.25); a.sine(o, t + 0.12, 0.4, 150, 110, 0.2, 'triangle'); a.noise(o, t + 0.12, 0.1, 'bandpass', 1400, 600, 2, 0.25); },
  key: (a, o, t) => { a.sine(o, t, 0.5, 196, 196, 0.12, 'sine', 0.005); a.noise(o, t, 0.03, 'bandpass', 1500, 900, 2, 0.1); },
  deny: (a, o, t) => { a.sine(o, t, 2.6, 41.2, 41.2, 0.6, 'sine', 0.05); a.sine(o, t, 2.6, 82.4, 82.4, 0.12, 'sine', 0.3); },
  page: (a, o, t) => { a.noise(o, t, 0.3, 'highpass', 2500, 5000, 0.6, 0.07, 0.08); },
  scrape: (a, o, t) => { a.noise(o, t, 0.7, 'bandpass', 420, 260, 3, 0.4, 0.05); a.sine(o, t, 0.4, 70, 45, 0.3); },
  shot: (a, o, t) => { a.noise(o, t, 0.09, 'highpass', 900, 400, 0.5, 1.0, 0.001); a.sine(o, t, 0.35, 150, 40, 0.9, 'sine', 0.001); a.noise(o, t + 0.05, 1.8, 'lowpass', 1800, 250, 0.4, 0.35, 0.02); a.noise(o, t + 0.5, 2.6, 'lowpass', 700, 160, 0.4, 0.12, 0.3); },
  dry: (a, o, t) => { a.noise(o, t, 0.04, 'bandpass', 3200, 2000, 3, 0.25); a.sine(o, t, 0.08, 900, 700, 0.04, 'triangle'); },
  rogue: (a, o, t) => { a.noise(o, t, 34, 'lowpass', 60, 420, 0.6, 0.9, 22); a.sine(o, t, 34, 22, 34, 0.7, 'sine', 20); a.noise(o, t + 20, 16, 'highpass', 1400, 2400, 0.4, 0.25, 9); },
  hm: (a, o, t) => { const f = 105 + Math.random() * 30; a.sine(o, t, 0.32, f, f * 0.86, 0.16, 'sawtooth', 0.05, 7); a.noise(o, t, 0.3, 'bandpass', 420, 300, 2, 0.06, 0.05); },
  grunt: (a, o, t) => { a.sine(o, t, 0.35, 150, 95, 0.25, 'sawtooth', 0.02, 9); a.noise(o, t, 0.3, 'bandpass', 600, 400, 2, 0.2, 0.02); a.noise(o, t + 0.5, 0.25, 'lowpass', 500, 150, 0.7, 0.25); },
  bodyfall: (a, o, t) => { a.sine(o, t, 0.12, 140, 90, 0.2, 'sawtooth', 0.01); a.noise(o, t + 0.45, 0.3, 'lowpass', 600, 120, 0.7, 0.45); a.sine(o, t + 0.45, 0.4, 80, 35, 0.45); },
  wreck: (a, o, t) => { a.noise(o, t, 0.5, 'bandpass', 900, 250, 1, 0.9, 0.005); for (let i = 0; i < 7; i++) a.noise(o, t + 0.05 + Math.random() * 0.6, 0.12, 'bandpass', 1500 + Math.random() * 1500, 600, 3, 0.4); a.noise(o, t + 0.2, 3.5, 'lowpass', 1200, 200, 0.4, 0.7, 0.2); a.sine(o, t, 1.2, 70, 28, 0.8); },

  // ----- the giant: very low, close to felt rather than heard, with small bright sounds on top
  giant: (a, o, t) => { a.sine(o, t, 3, 44, 40, 0.6, 'sine', 0.8, 0.6); },
  'giant-rise': (a, o, t) => {
    a.noise(o, t, 15, 'lowpass', 80, 600, 0.6, 0.9, 6); a.sine(o, t, 15, 24, 36, 0.8, 'sine', 5);
    a.noise(o, t + 7, 12, 'highpass', 1800, 900, 0.4, 0.16, 3);           // water pouring off
    a.pad(o, t + 6, 16, [55, 82.4, 110, 164.8, 207.7], 0.09);
    a.sine(o, t + 9, 5, 58, 47, 0.7, 'sine', 1.5, 0.4);
  },
  'giant-hum': (a, o, t) => { a.sine(o, t, 4.5, 46, 41, 0.7, 'sine', 1.2, 0.5); a.sine(o, t, 4.5, 92.5, 82, 0.14, 'sine', 1.5, 0.5); },
  'giant-amused': (a, o, t) => {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.42 + i * 0.03);
      a.sine(o, s, 0.36, 66 - i * 2, 50, 0.75, 'sine', 0.05);
      a.sine(o, s + 0.02, 0.2, 420 + Math.random() * 90, 330, 0.035, 'sine', 0.03);
    }
  },
  'giant-curious': (a, o, t) => { a.sine(o, t, 3.2, 42, 63, 0.7, 'sine', 1, 0.7); a.sine(o, t + 1.4, 1.6, 310, 392, 0.03, 'sine', 0.6); },
  'giant-sigh': (a, o, t) => { a.noise(o, t, 5, 'lowpass', 500, 140, 0.5, 0.5, 1.2); a.sine(o, t, 5, 52, 36, 0.45, 'sine', 1.5); },
  'giant-blow': (a, o, t) => { a.noise(o, t, 3.6, 'bandpass', 380, 700, 0.6, 0.9, 0.6); a.noise(o, t, 3.6, 'highpass', 2400, 3000, 0.5, 0.12, 0.8); },
  'giant-slap': (a, o, t) => { a.sine(o, t, 1.6, 62, 22, 1.0, 'sine', 0.004); a.noise(o, t, 0.5, 'lowpass', 1600, 200, 0.5, 1.0, 0.004); a.noise(o, t + 0.2, 5, 'bandpass', 1900, 700, 0.4, 0.5, 0.5); },
  'giant-annoyed': (a, o, t) => { a.sine(o, t, 1.8, 74, 46, 0.9, 'sawtooth', 0.15, 6); a.noise(o, t, 1.5, 'lowpass', 300, 120, 1, 0.4, 0.2); },
  'giant-sink': (a, o, t) => { a.noise(o, t, 8, 'lowpass', 500, 90, 0.5, 0.6, 2); a.sine(o, t, 8, 40, 24, 0.5, 'sine', 2); },
  'giant-death': (a, o, t) => {
    a.sine(o, t, 2.2, 132, 70, 0.9, 'sawtooth', 0.04, 5); a.noise(o, t, 1.5, 'bandpass', 500, 220, 1.5, 0.5, 0.05);
    a.sine(o, t + 2, 13, 68, 23, 0.85, 'sine', 1.2, 0.35); a.sine(o, t + 2, 13, 136, 47, 0.12, 'sine', 2, 0.35);
    a.pad(o, t + 8, 20, [49, 73.4, 98, 116.5], 0.06);
  },
  'giant-fall': (a, o, t) => { a.sine(o, t, 3, 48, 18, 1.0, 'sine', 0.01); a.noise(o, t, 7, 'lowpass', 1400, 150, 0.4, 1.0, 0.1); },
};
