// Persistent game state. Saved silently on every change.
const KEY = 'waterworld-save-v1';

export interface Save {
  flags: Record<string, number>;
  items: string[];
  time: number;
  day: number;
  player: { x: number; y: number; z: number; yaw: number; mode: 'foot' | 'sail' };
  boat: { x: number; z: number; psi: number; mooring: string | null; patches: number };
}

const fresh = (): Save => ({
  flags: {},
  items: [],
  time: 0.3,
  day: 0,
  player: { x: 0, y: 0, z: 0, yaw: 0, mode: 'foot' },
  boat: { x: 0, z: 0, psi: 0, mooring: 'drydock', patches: 0 },
});

export class GameState {
  data: Save = fresh();
  loaded = false;
  private dirty = false;

  load(allow = true) {
    if (!allow) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { this.data = { ...fresh(), ...JSON.parse(raw) }; this.loaded = true; }
    } catch { /* storage unavailable: play without saving */ }
  }
  flag(name: string) { return this.data.flags[name] ?? 0; }
  set(name: string, v = 1) { this.data.flags[name] = v; this.dirty = true; }
  has(item: string) { return this.data.items.includes(item); }
  give(item: string) { this.data.items.push(item); this.dirty = true; }
  take(item: string) {
    const i = this.data.items.indexOf(item);
    if (i >= 0) { this.data.items.splice(i, 1); this.dirty = true; return true; }
    return false;
  }
  touch() { this.dirty = true; }
  flush(force = false) {
    if (!this.dirty && !force) return;
    this.dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }
  static wipe() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
}
