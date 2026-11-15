// Keyboard and mouse through an action map, so other devices can be added later.
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  lookX = 0;
  lookY = 0;
  wheel = 0;
  locked = false;

  constructor(canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener('mousemove', (e) => {
      if (this.locked || e.buttons & 1) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
    addEventListener('wheel', (e) => { this.wheel += e.deltaY; }, { passive: true });
  }

  down(code: string) { return this.keys.has(code); }
  /** true once per key press */
  hit(code: string) { return this.pressed.has(code); }
  axis(neg: string, pos: string) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }

  endFrame() {
    this.pressed.clear();
    this.lookX = 0; this.lookY = 0; this.wheel = 0;
  }
}
