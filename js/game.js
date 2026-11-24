// =============================================================
//  Game: runs on every player's computer.
//  - Moves YOUR character (so it feels instant).
//  - On the host: also runs the Sim and sends snapshots.
//  - On friends' computers: shows the host's snapshots smoothly.
// =============================================================
import { WARRIOR, CLOAKS, FLAMES, CLASSES, PLAYER_RADIUS, MAX_PLAYERS, byId } from './data.js';
import { World } from './world.js';
import { Sim } from './sim.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { toast, Wardrobe } from './ui.js';

const SWING_TIME = 0.2;

// A timer that keeps ticking even if the host minimises the browser
// (normal timers get slowed to once a second in hidden tabs).
function makeTicker(ms, fn) {
  try {
    const src = `setInterval(() => postMessage(0), ${ms});`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = fn;
    return { stop: () => w.terminate() };
  } catch (e) {
    const id = setInterval(fn, ms);
    return { stop: () => clearInterval(id) };
  }
}

function publicChar(c) {
  return { name: c.name, cloak: c.cloak, hat: c.hat, flame: c.flame, cls: c.cls };
}

export class Game {
  constructor({ canvas, room, isHost, character, backend, onLeave }) {
    this.canvas = canvas;
    this.room = room;
    this.isHost = isHost;
    this.char = character;
    this.backend = backend;
    this.onLeave = onLeave;
    this.input = new Input(canvas);
    this.renderer = new Renderer(canvas);
    this.wardrobe = new Wardrobe(this);
    this.myId = isHost ? 'host' : null;
    this.lp = { x: 0, y: 0, aim: 0, moving: false, dashT: 0, dashCd: 0, ddx: 0, ddy: 0, atkCd: 0, combo: 0, comboT: 0 };
    this.ac = 0;            // how many attack presses we've sent
    this.sc = 0;            // how many skill presses we've sent
    this.lastCounts = { ...this.input.counts };
    this.edges = {};
    this.snap = null;
    this.world = null;
    this.sv = -1;
    this.views = new Map();
    this.particles = [];
    this.effects = [];
    this.cam = { x: 0, y: 0 };
    this.camSnap = true;
    this.shake = 0; this.shakeX = 0; this.shakeY = 0;
    this.hurtFlash = 0;
    this.bannerText = ''; this.bannerT = 0;
    this.prompt = null;
    this.t = 0;
    this.alive = true;
    this.lastSnapAt = performance.now();
    this.lastInputSend = 0;

    if (isHost) {
      this.sim = new Sim({ onScene: () => this.onHostScene() });
      this.sim.addPlayer('host', character);
      this.sim.goLobby();
      room.handlers.data = (from, msg) => this.onHostData(from, msg);
      room.handlers.leave = (id) => this.onPlayerLeft(id);
      this.lastTick = performance.now();
      this.simTimer = makeTicker(16, () => this.hostTick());
      this.netTimer = makeTicker(50, () => this.hostBroadcast());
    } else {
      room.handlers.data = (msg) => this.onClientData(msg);
      room.handlers.close = () => this.leave('The host closed the room.');
      room.send({ t: 'hello', char: publicChar(character) });
      // keeps sending even when this window is minimised, so the host doesn't drop us
      this.inputTimer = makeTicker(33, () => this.sendInput());
      this.watchdog = setInterval(() => {
        if (performance.now() - this.lastSnapAt > 10000) this.leave('Lost connection to the host.');
      }, 1000);
    }
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(() => this.frame());
  }

  // ======================================================= host side
  hostTick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.sim.update(dt);
    for (const p of [...this.sim.players.values()]) {
      if (p.id !== 'host' && now - p.lastSeen > 10000) { this.room.kick(p.id); this.onPlayerLeft(p.id); }
    }
  }

  hostBroadcast() {
    const s = this.sim.snapshot();
    s.fx = this.sim.fxNet;
    this.sim.fxNet = [];
    this.room.broadcast(s);
  }

  onHostScene() {
    this.setWorld(this.sim.world, this.sim.sv);
    const me = this.sim.players.get('host');
    this.lp.x = me.x;
    this.lp.y = me.y;
    for (const p of this.sim.players.values()) if (p.id !== 'host') this.sendScene(p.id);
  }

  sendScene(id) {
    const p = this.sim.players.get(id);
    if (!p) return;
    this.room.sendTo(id, { t: 'scene', sv: this.sim.sv, ...this.sim.world.toMsg(), you: { x: p.x, y: p.y } });
  }

  onHostData(from, msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'hello': {
        if (this.sim.players.has(from)) return;
        if (this.sim.players.size >= MAX_PLAYERS) {
          this.room.sendTo(from, { t: 'full' });
          setTimeout(() => this.room.kick(from), 300);
          return;
        }
        const p = this.sim.addPlayer(from, msg.char || {});
        this.sim.placeNewPlayer(p);
        this.room.sendTo(from, { t: 'welcome', id: from });
        this.sendScene(from);
        toast(`${p.name} joined the party`);
        break;
      }
      case 'in':
        this.sim.applyInput(from, msg);
        break;
      case 'cosm': {
        const ok = this.sim.setCosmetic(from, msg.field, msg.value);
        this.room.sendTo(from, { t: ok ? 'cosmOk' : 'cosmNo', field: msg.field, value: msg.value });
        break;
      }
    }
  }

  onPlayerLeft(id) {
    const p = this.sim.players.get(id);
    if (!p) return;
    this.sim.removePlayer(id);
    toast(`${p.name} left the party`);
  }

  // ======================================================= client side
  onClientData(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        this.myId = msg.id;
        break;
      case 'scene':
        this.setWorld(World.fromMsg(msg), msg.sv);
        this.lp.x = msg.you.x;
        this.lp.y = msg.you.y;
        this.snap = null;
        break;
      case 's':
        this.lastSnapAt = performance.now();
        if (msg.sv !== this.sv) return; // from an older scene
        this.snap = msg;
        for (const f of msg.fx || []) this.handleFx(f);
        break;
      case 'cosmOk':
        this.saveCosmetic(msg.field, msg.value);
        break;
      case 'cosmNo':
        toast(msg.field === 'cloak' ? 'Someone in your party already wears that colour.' : 'Not available yet.');
        break;
      case 'full':
        this.leave('That room is full (4 players max).');
        break;
    }
  }

  // ======================================================= shared
  setWorld(world, sv) {
    this.world = world;
    this.sv = sv;
    this.renderer.setWorld(world);
    this.views.clear();
    this.particles = [];
    this.effects = [];
    this.lp.dashT = 0;
    this.camSnap = true;
    this.wardrobe.close();
    const help = document.getElementById('help');
    if (help) help.classList.toggle('hidden', world.kind !== 'lobby');
  }

  requestCosmetic(field, value) {
    if (this.isHost) {
      if (this.sim.setCosmetic('host', field, value)) this.saveCosmetic(field, value);
      else toast(field === 'cloak' ? 'Someone in your party already wears that colour.' : 'Not available yet.');
    } else this.room.send({ t: 'cosm', field, value });
  }

  // Your character's look is saved to your account when the host accepts it.
  saveCosmetic(field, value) {
    this.char[field] = value;
    this.backend.saveChar(this.char).catch((e) => console.warn('save failed', e));
    if (field === 'cls') toast(`You are now a ${byId(CLASSES, value).name}.`);
  }

  leave(msg) {
    if (!this.alive) return;
    this.alive = false;
    cancelAnimationFrame(this.raf);
    if (this.simTimer) this.simTimer.stop();
    if (this.netTimer) this.netTimer.stop();
    if (this.inputTimer) this.inputTimer.stop();
    clearInterval(this.watchdog);
    this.input.destroy();
    this.wardrobe.close();
    try { this.room.close(); } catch (e) { /* ignore */ }
    this.onLeave(msg);
  }

  frame() {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.t += dt;
    this.input.poll();

    let snap;
    if (this.isHost) {
      snap = this.sim.snapshot();
      for (const f of this.sim.fxLocal) this.handleFx(f);
      this.sim.fxLocal = [];
    } else snap = this.snap;

    const me = snap && this.world && this.myId ? snap.ps.find((p) => p.id === this.myId) : null;
    if (!me) { this.renderer.drawLoading('Joining the campfire…', this.t); return; }

    this.updateLocal(dt, me);
    if (this.isHost) this.sendInput();
    this.updateViews(snap, dt);
    this.updateParticles(dt, snap);
    this.updateCamera(dt);
    this.updateInteract(me);
    this.wardrobe.refresh(snap);
    if (this.bannerT > 0) this.bannerT -= dt;
    this.renderer.draw(this, snap, me);
  }

  // ---------------------------------------------------- your character
  updateLocal(dt, me) {
    const lp = this.lp, inp = this.input, W = WARRIOR, c = inp.counts;
    const pressed = (k) => c[k] > this.lastCounts[k];
    const blocked = this.wardrobe.open;
    const atkPressed = pressed('atk') && !blocked;
    const skillPressed = pressed('skill') && !blocked;
    const dashPressed = pressed('dash') && !blocked;
    this.edges = { interact: pressed('interact'), esc: pressed('esc') };
    this.lastCounts = { ...c };

    lp.dashCd -= dt; lp.atkCd -= dt; lp.comboT -= dt;
    const down = !!me.dn;
    const mv = blocked ? { x: 0, y: 0 } : inp.moveVector();
    lp.moving = !down && (mv.x !== 0 || mv.y !== 0);

    if (inp.device === 'pad') {
      if (inp.padAim) lp.aim = Math.atan2(inp.padAim.y, inp.padAim.x);
      else if (lp.moving) lp.aim = Math.atan2(mv.y, mv.x);
    } else {
      lp.aim = Math.atan2(inp.mouse.y - (lp.y - 20 - this.cam.y), inp.mouse.x - (lp.x - this.cam.x));
    }
    if (down) { lp.dashT = 0; return; }

    if (dashPressed && lp.dashCd <= 0) {
      const dx = lp.moving ? mv.x : Math.cos(lp.aim), dy = lp.moving ? mv.y : Math.sin(lp.aim);
      const l = Math.hypot(dx, dy) || 1;
      lp.ddx = dx / l; lp.ddy = dy / l;
      lp.dashT = W.dashTime;
      lp.dashCd = W.dashCd;
      this.burst(lp.x, lp.y - 10, 10, { color: byId(FLAMES, me.f).mid, speed: 120, life: 0.4, glow: true });
    }
    let vx, vy;
    if (lp.dashT > 0) {
      lp.dashT -= dt;
      vx = lp.ddx * W.dashSpeed;
      vy = lp.ddy * W.dashSpeed;
      this.particles.push({ x: lp.x + (Math.random() - 0.5) * 10, y: lp.y - 16 + (Math.random() - 0.5) * 16, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 3, color: byId(FLAMES, me.f).mid, glow: true, shrink: true });
    } else {
      const sp = W.speed * (me.w > 0 ? 1.25 : 1) * (this.world.kind === 'lobby' ? 1.1 : 1);
      vx = mv.x * sp;
      vy = mv.y * sp;
    }
    const pos = this.world.collide(lp.x + vx * dt, lp.y + vy * dt, PLAYER_RADIUS);
    lp.x = pos.x;
    lp.y = pos.y;

    if (atkPressed) this.ac++;
    if (skillPressed) this.sc++;
    // show your own swing straight away (the host decides if it hit)
    if ((atkPressed || (inp.attackHeld() && !blocked)) && lp.atkCd <= 0) {
      lp.atkCd = W.atkCd;
      lp.combo = lp.comboT > 0 ? (lp.combo % 3) + 1 : 1;
      lp.comboT = 1.0;
      this.startSwing(this.myId, lp.aim, lp.combo === 3);
    }
  }

  sendInput() {
    if (!this.alive || this.sv < 0) return;
    const lp = this.lp;
    const msg = {
      t: 'in', sv: this.sv,
      x: Math.round(lp.x * 10) / 10, y: Math.round(lp.y * 10) / 10,
      aim: Math.round(lp.aim * 1000) / 1000,
      m: lp.moving ? 1 : 0, d: lp.dashT > 0 ? 1 : 0,
      ac: this.ac, sc: this.sc,
      ah: this.input.attackHeld() && !this.wardrobe.open ? 1 : 0,
    };
    if (this.isHost) this.sim.applyInput('host', msg);
    else this.room.send(msg);
  }

  // ---------------------------------------------------- views (smoothing)
  viewFor(id) {
    let v = this.views.get('p' + id);
    if (!v) { v = { x: this.lp.x, y: this.lp.y, swingT: -9, heavy: false, init: false }; this.views.set('p' + id, v); }
    return v;
  }

  playerView(p) {
    const v = this.viewFor(p.id);
    if (p.id === this.myId) { v.x = this.lp.x; v.y = this.lp.y; }
    return v;
  }

  charOpts(p, v) {
    const mine = p.id === this.myId;
    const sw = (this.t - v.swingT) / SWING_TIME;
    return {
      cloak: byId(CLOAKS, p.c).hex,
      hat: p.h,
      aim: mine ? this.lp.aim : p.a,
      moving: mine ? this.lp.moving : !!p.m,
      swing: sw >= 0 && sw < 1 ? sw : -1,
      heavy: v.heavy,
      down: !!p.dn,
      hurt: !!p.hu,
      dash: mine ? this.lp.dashT > 0 : !!p.d,
    };
  }

  updateViews(snap, dt) {
    const k = 1 - Math.exp(-dt * 16);
    const seen = new Set();
    for (const p of snap.ps) {
      seen.add('p' + p.id);
      if (p.id === this.myId) { this.viewFor(p.id); continue; }
      const v = this.viewFor(p.id);
      if (!v.init || Math.hypot(p.x - v.x, p.y - v.y) > 300) { v.x = p.x; v.y = p.y; v.init = true; }
      v.x += (p.x - v.x) * k;
      v.y += (p.y - v.y) * k;
    }
    for (const e of snap.es) {
      const key = 'e' + e.id;
      seen.add(key);
      let v = this.views.get(key);
      if (!v) { v = { x: e.x, y: e.y, moving: false }; this.views.set(key, v); }
      const ox = v.x, oy = v.y;
      v.x += (e.x - v.x) * k;
      v.y += (e.y - v.y) * k;
      v.moving = Math.hypot(v.x - ox, v.y - oy) / Math.max(dt, 0.001) > 20;
    }
    for (const key of this.views.keys()) if (!seen.has(key)) this.views.delete(key);
  }

  // ---------------------------------------------------- effects
  startSwing(id, aim, heavy) {
    const v = this.viewFor(id);
    v.swingT = this.t;
    v.heavy = heavy;
    this.effects.push({ k: 'arc', id, aim, heavy, t0: this.t, life: 0.22 });
  }

  banner(text, secs) { this.bannerText = text; this.bannerT = secs; }

  burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = o.speed * (0.3 + Math.random() * 0.7);
      const life = o.life * (0.6 + Math.random() * 0.4);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), life, max: life, size: o.size || 2.5, color: o.color, glow: !!o.glow, drag: 3, grav: o.grav || 0, shrink: true });
    }
  }

  handleFx(f) {
    const near = (x, y) => Math.hypot(x - this.lp.x, y - this.lp.y) < 700;
    switch (f.k) {
      case 'sw':
        if (f.id !== this.myId) this.startSwing(f.id, f.a, !!f.h);
        break;
      case 'hit':
        this.burst(f.x, f.y - 14, 8, { color: '#ffd9a0', speed: 160, life: 0.35, glow: true });
        this.effects.push({ k: 'num', x: f.x, y: f.y - 34, text: String(f.d), t0: this.t, life: 0.8, big: !!f.big, color: f.big ? '#ffb347' : '#ffffff' });
        break;
      case 'die':
        this.burst(f.x, f.y - 12, 18, { color: '#6f9a4a', speed: 200, life: 0.7 });
        this.burst(f.x, f.y - 12, 10, { color: '#ffb060', speed: 120, life: 0.8, glow: true });
        break;
      case 'hurt':
        this.burst(f.x, f.y - 18, 10, { color: '#ff5a3a', speed: 150, life: 0.4, glow: true });
        if (f.id === this.myId) { this.shake = Math.max(this.shake, 7); this.hurtFlash = 0.35; }
        break;
      case 'slam':
        this.effects.push({ k: 'ring', x: f.x, y: f.y, t0: this.t, life: 0.45, r: WARRIOR.skillRadius });
        this.burst(f.x, f.y - 6, 28, { color: '#ffb060', speed: 300, life: 0.6, glow: true });
        if (near(f.x, f.y)) this.shake = Math.max(this.shake, 9);
        break;
      case 'nope':
        if (f.id === this.myId) toast('Your flame is too weak for Cinder Quake.');
        break;
      case 'wild':
        this.effects.push({ k: 'ring', x: f.x, y: f.y, t0: this.t, life: 0.6, r: 150, color: '#fff0a0' });
        this.burst(f.x, f.y - 20, 40, { color: '#fff0a0', speed: 320, life: 0.8, glow: true });
        if (f.id === this.myId) this.shake = Math.max(this.shake, 6);
        break;
      case 'pick':
        this.burst(f.x, f.y, 6, { color: '#ffd080', speed: 80, life: 0.4, glow: true });
        break;
      case 'down':
        this.burst(f.x, f.y - 20, 20, { color: '#888', speed: 90, life: 1, up: 40 });
        if (f.id !== this.myId) toast(`${f.n}'s flame went out! Stand close to rekindle them.`);
        break;
      case 'revive':
        this.burst(f.x, f.y - 20, 24, { color: '#ffe0a0', speed: 200, life: 0.7, glow: true });
        toast(f.id === this.myId ? 'You have been rekindled!' : `${f.n} has been rekindled!`);
        break;
      case 'victory':
        this.banner('THE GATE OPENS', 3);
        break;
      case 'msg':
        toast(f.text);
        break;
    }
  }

  updateParticles(dt, snap) {
    const W = innerWidth, H = innerHeight;
    // fireflies drifting through the forest
    let ff = 0;
    for (const p of this.particles) if (p.ff) ff++;
    while (ff < 28) {
      const life = 4 + Math.random() * 5;
      this.particles.push({ x: this.cam.x + Math.random() * W, y: this.cam.y + Math.random() * H, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life, max: life, size: 1.6, color: '#d8ff8a', glow: true, ff: true });
      ff++;
    }
    // campfire sparks
    const cf = this.world.campfire;
    if (cf && Math.random() < dt * 14) {
      this.particles.push({ x: cf.x + (Math.random() - 0.5) * 16, y: cf.y - 10, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 50, life: 1.4, max: 1.4, size: 1.8, color: '#ffb060', glow: true, shrink: true });
    }
    // Wildfire flames swirling around a player
    for (const p of snap.ps) {
      if (p.w <= 0) continue;
      const v = this.playerView(p);
      const col = byId(FLAMES, p.f).mid;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 140;
        this.particles.push({ x: v.x + Math.cos(a) * r, y: v.y + Math.sin(a) * r * 0.6, vx: 0, vy: -60, life: 0.5, max: 0.5, size: 3, color: col, glow: true, shrink: true });
      }
    }
    for (const p of this.particles) {
      p.life -= dt;
      if (p.drag) { p.vx *= Math.exp(-dt * p.drag); p.vy *= Math.exp(-dt * p.drag); }
      if (p.ff) { p.vx += (Math.random() - 0.5) * 30 * dt; p.vy += (Math.random() - 0.5) * 30 * dt; }
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
    this.effects = this.effects.filter((e) => this.t - e.t0 < e.life);
  }

  updateCamera(dt) {
    const W = innerWidth, H = innerHeight, pw = this.world.pw, ph = this.world.ph;
    let tx = this.lp.x - W / 2, ty = this.lp.y - 24 - H / 2;
    tx = pw < W ? (pw - W) / 2 : Math.max(0, Math.min(pw - W, tx));
    ty = ph < H ? (ph - H) / 2 : Math.max(0, Math.min(ph - H, ty));
    if (this.camSnap) { this.cam.x = tx; this.cam.y = ty; this.camSnap = false; }
    else {
      const k = 1 - Math.exp(-dt * 9);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
    }
    this.shake *= Math.exp(-dt * 10);
    this.shakeX = (Math.random() - 0.5) * 2 * this.shake;
    this.shakeY = (Math.random() - 0.5) * 2 * this.shake;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
  }

  // ---------------------------------------------------- lobby stations
  updateInteract(me) {
    this.prompt = null;
    if (this.edges.esc) this.wardrobe.close();
    if (this.world.kind !== 'lobby') return;
    let best = null, bd = 70;
    for (const p of this.world.props) {
      if (p.type !== 'wardrobe' && p.type !== 'shrine') continue;
      const d = Math.hypot(p.x - this.lp.x, p.y - this.lp.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const key = this.input.device === 'pad' ? 'Y' : 'F';
    if (best.type === 'wardrobe') {
      this.prompt = { x: best.x, y: best.y - 64, text: `[${key}] Wardrobe`, sub: 'Change your cloak, hat and flame' };
      if (this.edges.interact) this.wardrobe.toggle();
    } else {
      const c = byId(CLASSES, best.cls);
      const text = !c.available ? `${c.name}: still dormant (coming soon)` : me.k === c.id ? `${c.name}: chosen` : `[${key}] Become a ${c.name}`;
      this.prompt = { x: best.x, y: best.y - 84, text, sub: c.blurb };
      if (this.edges.interact) {
        if (!c.available) toast(`The ${c.name} shrine is still dormant. Coming soon!`);
        else if (me.k !== c.id) this.requestCosmetic('cls', c.id);
      }
    }
  }
}
