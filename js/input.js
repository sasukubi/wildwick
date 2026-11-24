// =============================================================
//  Input: keyboard + mouse, and gamepads (Xbox/PlayStation layout).
//  Button presses are counted so a quick tap is never missed.
//
//  Keyboard: WASD move, mouse aim, left click strike, right click
//  (hold) Smoulder Guard, E/Q Cinder Quake, R Pyre Cleave,
//  Space/Shift dash, F interact, T/Tab skill tree, Esc settings.
// =============================================================

const DEAD = 0.25;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, left: false, right: false };
    this.counts = { atk: 0, skill: 0, dash: 0, interact: 0, esc: 0, ult: 0, tree: 0, back: 0 };
    this.device = 'kbm';
    this.padMove = { x: 0, y: 0 };
    this.padAim = null;
    this.padAtk = false;
    this.padGuard = false;
    this.padPrev = [];

    this.onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!e.repeat) {
        const c = e.code;
        if (c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight') this.counts.dash++;
        if (c === 'KeyE' || c === 'KeyQ') this.counts.skill++;
        if (c === 'KeyR') this.counts.ult++;
        if (c === 'KeyF') this.counts.interact++;
        if (c === 'KeyT' || c === 'Tab') this.counts.tree++;
        if (c === 'Escape') this.counts.esc++;
      }
      this.keys.add(e.code);
      this.device = 'kbm';
      if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onMouseDown = (e) => {
      this.device = 'kbm';
      if (e.button === 0) { this.mouse.left = true; this.counts.atk++; }
      if (e.button === 2) this.mouse.right = true;
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };
    this.onMouseMove = (e) => {
      if (Math.abs(e.clientX - this.mouse.x) + Math.abs(e.clientY - this.mouse.y) > 2) this.device = 'kbm';
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    };
    this.onBlur = () => { this.keys.clear(); this.mouse.left = false; this.mouse.right = false; };
    this.onContext = (e) => e.preventDefault();

    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('mousedown', this.onMouseDown);
    addEventListener('mouseup', this.onMouseUp);
    addEventListener('mousemove', this.onMouseMove);
    addEventListener('blur', this.onBlur);
    canvas.addEventListener('contextmenu', this.onContext);
  }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { this.padMove = { x: 0, y: 0 }; this.padAim = null; this.padAtk = false; this.padGuard = false; return; }
    const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : v; };
    this.padMove = { x: ax(0), y: ax(1) };
    const rx = ax(2), ry = ax(3);
    this.padAim = Math.hypot(rx, ry) > 0.3 ? { x: rx, y: ry } : null;
    const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
    const edge = (i) => btn(i) && !this.padPrev[i];
    if (edge(0)) this.counts.dash++;                  // A / Cross
    if (edge(2) || edge(4)) this.counts.skill++;      // X / Square, LB
    if (edge(5)) this.counts.ult++;                   // RB
    if (edge(3)) this.counts.interact++;              // Y / Triangle
    if (edge(1)) this.counts.back++;                  // B / Circle
    if (edge(7)) this.counts.atk++;                   // RT
    if (edge(8)) this.counts.tree++;                  // View / Select
    if (edge(9)) this.counts.esc++;                   // Menu / Start
    this.padAtk = btn(7);
    this.padGuard = btn(6);                           // LT (hold)
    let any = this.padMove.x || this.padMove.y || this.padAim;
    for (let i = 0; i < gp.buttons.length; i++) if (btn(i)) any = true;
    if (any) this.device = 'pad';
    this.padPrev = gp.buttons.map((_, i) => btn(i));
  }

  moveVector() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (!x && !y && (this.padMove.x || this.padMove.y)) { x = this.padMove.x; y = this.padMove.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  attackHeld() { return this.mouse.left || this.padAtk; }
  guardHeld() { return this.mouse.right || this.padGuard; }

  destroy() {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    removeEventListener('mouseup', this.onMouseUp);
    removeEventListener('mousemove', this.onMouseMove);
    removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('contextmenu', this.onContext);
  }
}
