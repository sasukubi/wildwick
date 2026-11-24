// =============================================================
//  Input: keyboard + mouse (rebindable in Settings > Controls),
//  and gamepads (Xbox/PlayStation layout).
//  Button presses are counted so a quick tap is never missed.
// =============================================================
import { prefs } from './prefs.js';

const DEAD = 0.25;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, left: false, right: false, middle: false };
    this.scroll = 0;        // mouse-wheel steps (used to flip reaction-wheel pages)
    this.wheelOpen = false; // while a wheel is open, scrolling doesn't scroll the page
    this.counts = { atk: 0, s1: 0, s2: 0, s3: 0, dash: 0, interact: 0, esc: 0, ult: 0, tree: 0, back: 0, controls: 0, chat: 0, photo: 0, dev: 0, item1: 0, item2: 0, item3: 0 };
    this.device = 'kbm';
    this.padMove = { x: 0, y: 0 };
    this.padAim = null;
    this.padAtk = false;
    this.padS2 = false;
    this.padPrev = [];
    this.toggleGuard = false;

    this.onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (window.__rebinding) return;
      const k = prefs.keys, c = e.code;
      if (!e.repeat) {
        if (c === k.dash) this.counts.dash++;
        if (c === k.controls) this.counts.controls++;
        if (c === k.skill1) this.counts.s1++;
        if (c === k.skill3) this.counts.s3++;
        if (c === k.ult) this.counts.ult++;
        if (c === k.interact) this.counts.interact++;
        if (c === k.tree || c === 'Tab') this.counts.tree++;
        if (c === k.strike) this.counts.atk++;
        if (c === k.skill2) { this.counts.s2++; this.toggleGuard = !this.toggleGuard; }
        if (c === 'Escape') this.counts.esc++;
        if (c === k.chat) { this.counts.chat++; e.preventDefault(); }
        if (c === k.photo) this.counts.photo++;
        if (c === 'Backquote') { this.counts.dev++; e.preventDefault(); }
        if (c === 'Digit1') this.counts.item1++;
        if (c === 'Digit2') this.counts.item2++;
        if (c === 'Digit3') this.counts.item3++;
      }
      this.keys.add(c);
      this.device = 'kbm';
      if (c === 'Space' || c === 'Tab' || c.startsWith('Arrow')) e.preventDefault();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onMouseDown = (e) => {
      this.device = 'kbm';
      if (e.button === 0) { this.mouse.left = true; this.counts.atk++; }
      if (e.button === 2) { this.mouse.right = true; this.counts.s2++; this.toggleGuard = !this.toggleGuard; }
      if (e.button === 1) { this.mouse.middle = true; e.preventDefault(); }
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      if (e.button === 1) this.mouse.middle = false;
    };
    this.onWheel = (e) => { if (!this.wheelOpen) return; e.preventDefault(); this.scroll += Math.sign(e.deltaY); };
    this.onMouseMove = (e) => {
      if (Math.abs(e.clientX - this.mouse.x) + Math.abs(e.clientY - this.mouse.y) > 2) this.device = 'kbm';
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    };
    this.onBlur = () => { this.keys.clear(); this.mouse.left = false; this.mouse.right = false; this.mouse.middle = false; };
    this.onContext = (e) => e.preventDefault();

    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('mousedown', this.onMouseDown);
    addEventListener('mouseup', this.onMouseUp);
    addEventListener('mousemove', this.onMouseMove);
    addEventListener('blur', this.onBlur);
    canvas.addEventListener('contextmenu', this.onContext);
    addEventListener('wheel', this.onWheel, { passive: false });
  }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { this.padMove = { x: 0, y: 0 }; this.padAim = null; this.padAtk = false; this.padS2 = false; return; }
    const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : v; };
    this.padMove = { x: ax(0), y: ax(1) };
    const rx = ax(2), ry = ax(3);
    this.padAim = Math.hypot(rx, ry) > 0.3 ? { x: rx, y: ry } : null;
    const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
    const edge = (i) => btn(i) && !this.padPrev[i];
    if (edge(0)) this.counts.dash++;      // A
    if (edge(2)) this.counts.s1++;        // X: Quake / Fire
    if (edge(4)) this.counts.s3++;        // LB: Quake / Frost
    if (edge(6)) { this.counts.s2++; this.toggleGuard = !this.toggleGuard; } // LT: Guard / Gale
    if (edge(5)) this.counts.ult++;       // RB
    if (edge(3)) this.counts.interact++;  // Y
    if (edge(1)) this.counts.back++;      // B
    if (edge(7)) this.counts.atk++;       // RT
    if (edge(8)) this.counts.tree++;      // View
    if (edge(9)) this.counts.esc++;       // Start
    this.padAtk = btn(7);
    this.padS2 = btn(6);
    let any = this.padMove.x || this.padMove.y || this.padAim;
    for (let i = 0; i < gp.buttons.length; i++) if (btn(i)) any = true;
    if (any) this.device = 'pad';
    this.padPrev = gp.buttons.map((_, i) => btn(i));
  }

  moveVector() {
    let x = 0, y = 0;
    const k = this.keys, b = prefs.keys;
    if (k.has(b.left) || k.has('ArrowLeft')) x -= 1;
    if (k.has(b.right) || k.has('ArrowRight')) x += 1;
    if (k.has(b.up) || k.has('ArrowUp')) y -= 1;
    if (k.has(b.down) || k.has('ArrowDown')) y += 1;
    if (!x && !y && (this.padMove.x || this.padMove.y)) { x = this.padMove.x; y = this.padMove.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  attackHeld() { return this.mouse.left || this.padAtk || (prefs.keys.strike && this.keys.has(prefs.keys.strike)); }
  // Smoulder Guard: hold (or toggle, if chosen in settings)
  guardHeld() {
    if (prefs.guardToggle) return this.toggleGuard;
    return this.mouse.right || this.padS2 || (prefs.keys.skill2 && this.keys.has(prefs.keys.skill2));
  }

  destroy() {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    removeEventListener('mouseup', this.onMouseUp);
    removeEventListener('mousemove', this.onMouseMove);
    removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('contextmenu', this.onContext);
    removeEventListener('wheel', this.onWheel);
  }
}
