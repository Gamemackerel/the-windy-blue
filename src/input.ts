// Keyboard and mouse through an action map, so other devices can be added later.
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

  constructor(canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (this.suspended) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.locked) { try { (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* not available here */ } }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener('mousemove', (e) => {
      if (this.locked || e.buttons & 3) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
    canvas.addEventListener('mousedown', (e) => { this.buttons.add(e.button); this.clicked.add(e.button); });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { this.wheel += e.deltaY; }, { passive: true });
  }

  down(code: string) { return this.keys.has(code); }
  /** true once per key press */
  hit(code: string) { return this.pressed.has(code); }
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
