// Keyboard and mouse through an action map, so other devices can be added later.
/** the arrow keys do whatever W A S D do */
const ALIAS: Record<string, string> = { KeyW: 'ArrowUp', KeyS: 'ArrowDown', KeyA: 'ArrowLeft', KeyD: 'ArrowRight' };
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private buttons = new Set<number>();
  private clicked = new Set<number>();
  lookX = 0;
  lookY = 0;
  wheel = 0;
  locked = false;
  /** true while typing into a form: the game ignores the keyboard */
  suspended = false;
  /** the pointer is let go to click on something in the world (a keypad): clicks do not recapture it, dragging does not look */
  freeMouse = false;
  /** where the free pointer is, -1..1 each way */
  readonly pointer = { x: 0, y: 0 };
  private canvas: HTMLCanvasElement;
  /** let the pointer go (true), or take it back (false: only takes effect from a click, as browsers require) */
  release(free: boolean) {
    this.freeMouse = free;
    if (free && document.pointerLockElement) document.exitPointerLock();
    if (!free) { try { (this.canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* the next click will */ } }
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (this.suspended) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.locked && !this.freeMouse) { try { (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* not available here */ } }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1; this.pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      if (this.locked || (e.buttons & 3 && !this.freeMouse)) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
    canvas.addEventListener('mousedown', (e) => { this.buttons.add(e.button); this.clicked.add(e.button); });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { this.wheel += e.deltaY; }, { passive: true });
  }

  down(code: string) { return this.keys.has(code) || (ALIAS[code] !== undefined && this.keys.has(ALIAS[code])); }
  /** true once per key press */
  hit(code: string) { return this.pressed.has(code) || (ALIAS[code] !== undefined && this.pressed.has(ALIAS[code])); }
  axis(neg: string, pos: string) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }

  mouse(button: number) { return this.buttons.has(button); }
  mouseHit(button: number) { return this.clicked.has(button); }
  /** for automated testing */
  press(code: string) { this.pressed.add(code); }

  endFrame() {
    this.pressed.clear();
    this.clicked.clear();
    this.lookX = 0; this.lookY = 0; this.wheel = 0;
  }
}
