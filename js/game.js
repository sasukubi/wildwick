// =============================================================
//  Game: runs on every player's computer.
//  - Moves YOUR character (so it feels instant).
//  - On the host: also runs the Sim and sends snapshots.
//  - On friends' computers: shows the host's snapshots smoothly.
// =============================================================
import { WARRIOR, SORCERER, CLOAKS, FLAMES, CLASSES, BOONS, ELEMENTS, PLAYER_RADIUS, MAX_PLAYERS, classStats, byId } from './data.js';
import { World } from './world.js';
import { Sim } from './sim.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { toast, Wardrobe, TreePanel, BoonPanel, settings } from './ui.js';
import { buildHud, updateHud } from './hud.js';
import { audio } from './audio.js';
import { prefs, keyName } from './prefs.js';

const SWING_TIME = 0.2;
const PAD_LABEL = { strike: 'RT', skill2: 'LT', skill1: 'X', skill3: 'LB', ult: 'RB', dash: 'A', interact: 'Y', tree: 'View' };

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
  constructor({ canvas, room, isHost, character, user, backend, onLeave }) {
    this.canvas = canvas;
    this.room = room;
    this.isHost = isHost;
    this.char = character;
    this.user = user;
    this.backend = backend;
    this.onLeave = onLeave;
    this.input = new Input(canvas);
    this.renderer = new Renderer(canvas);
    this.wardrobe = new Wardrobe(this);
    this.tree = new TreePanel(this);
    this.boons = new BoonPanel(this);
    this.myId = isHost ? 'host' : null;
    this.lp = { x: 0, y: 0, aim: 0, aimD: 100, moving: false, dashT: 0, dashCd: 0, ddx: 0, ddy: 0, atkCd: 0, combo: 0, comboT: 0, stepT: 0 };
    this.cnt = { ac: 0, sc: 0, s2c: 0, s3c: 0, uc: 0, ic: 0 };
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
    this.hurtFlash = 0; this.flash = 0; this.hitstop = 0;
    this.bannerText = ''; this.bannerSub = ''; this.bannerT = 0;
    this.prompt = null;
    this.t = 0;
    this.alive = true;
    this.lastSnapAt = performance.now();
    this.statsKey = '';
    this.stats = classStats(character.cls || 'warrior');
    this.cls = character.cls || 'warrior';
    settings.onLeave = () => this.leave();
    settings.roomCode = room.code;
    buildHud(this.cls);
    document.getElementById('hud').classList.remove('hidden');

    if (isHost) {
      this.sim = new Sim({ onScene: () => this.onHostScene() });
      this.sim.addPlayer('host', character, user);
      this.sim.goLobby();
      room.handlers.data = (from, msg) => this.onHostData(from, msg);
      room.handlers.leave = (id) => this.onPlayerLeft(id);
      this.lastTick = performance.now();
      this.simTimer = makeTicker(16, () => this.hostTick());
      this.netTimer = makeTicker(50, () => this.hostBroadcast());
    } else {
      room.handlers.data = (msg) => this.onClientData(msg);
      room.handlers.close = () => this.leave('The host closed the room.');
      room.send({ t: 'hello', char: publicChar(character), user });
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
        const p = this.sim.addPlayer(from, msg.char || {}, msg.user);
        this.sim.placeNewPlayer(p);
        this.room.sendTo(from, { t: 'welcome', id: from });
        this.sendScene(from);
        toast(`${p.user} joined the party`);
        break;
      }
      case 'in': this.sim.applyInput(from, msg); break;
      case 'cosm': {
        const ok = this.sim.setCosmetic(from, msg.field, msg.value);
        this.room.sendTo(from, { t: ok ? 'cosmOk' : 'cosmNo', field: msg.field, value: msg.value });
        break;
      }
      case 'tree': this.sim.buyNode(from, msg.node); break;
      case 'pick': this.sim.pickBoon(from, msg.i); break;
    }
  }

  onPlayerLeft(id) {
    const p = this.sim.players.get(id);
    if (!p) return;
    this.sim.removePlayer(id);
    toast(`${p.user} left the party`);
  }

  // ======================================================= client side
  onClientData(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome': this.myId = msg.id; break;
      case 'scene':
        this.setWorld(World.fromMsg(msg), msg.sv);
        this.lp.x = msg.you.x;
        this.lp.y = msg.you.y;
        this.snap = null;
        break;
      case 's':
        this.lastSnapAt = performance.now();
        if (msg.sv !== this.sv) return;
        this.snap = msg;
        for (const f of msg.fx || []) this.handleFx(f);
        break;
      case 'cosmOk': this.saveCosmetic(msg.field, msg.value); break;
      case 'cosmNo': toast(msg.field === 'cloak' ? 'Someone in your party already wears that colour.' : 'Not available yet.'); audio.play('nope'); break;
      case 'full': this.leave('That room is full (4 players max).'); break;
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
    document.getElementById('help').classList.toggle('hidden', world.kind !== 'lobby' || !prefs.hint);
  }

  requestCosmetic(field, value) {
    audio.play('click');
    if (this.isHost) {
      if (this.sim.setCosmetic('host', field, value)) this.saveCosmetic(field, value);
      else { toast(field === 'cloak' ? 'Someone in your party already wears that colour.' : 'Not available yet.'); audio.play('nope'); }
    } else this.room.send({ t: 'cosm', field, value });
  }

  buyNode(node) {
    if (this.isHost) this.sim.buyNode('host', node);
    else this.room.send({ t: 'tree', node });
  }

  pickBoon(i) {
    audio.play('boon');
    if (this.isHost) this.sim.pickBoon('host', i);
    else this.room.send({ t: 'pick', i });
  }

  saveCosmetic(field, value) {
    this.char[field] = value;
    this.backend.saveChar(this.char).catch((e) => console.warn('save failed', e));
    if (field === 'cls') toast(`You are now a ${byId(CLASSES, value).name}.`);
  }

  myStats() { return this.stats; }

  keyLabel(action) {
    if (this.input.device === 'pad') return PAD_LABEL[action] || '?';
    if (action === 'strike') return prefs.keys.strike ? `LMB/${keyName(prefs.keys.strike)}` : 'LMB';
    if (action === 'skill2') return prefs.keys.skill2 ? `RMB/${keyName(prefs.keys.skill2)}` : 'RMB';
    return keyName(prefs.keys[action]);
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
    this.tree.close();
    settings.close();
    settings.roomCode = null;
    document.getElementById('boons').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    audio.setScene('menu');
    try { this.room.close(); } catch (e) { /* ignore */ }
    this.onLeave(msg);
  }

  frame() {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const realDt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    // hit-stop: freeze the animation for a few hundredths of a second when you land a hit
    const dt = this.hitstop > 0 ? 0 : realDt;
    this.hitstop -= realDt;
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

    const sk = JSON.stringify([me.k, me.tr, me.bn]);
    if (sk !== this.statsKey) {
      this.statsKey = sk;
      this.stats = classStats(me.k, me.tr, me.bn);
      if (me.k !== this.cls) { this.cls = me.k; buildHud(this.cls); }
    }
    audio.setScene(snap.st === 'rest' ? 'rest' : snap.sc === 'lobby' ? 'lobby' : snap.sc === 'arena' ? 'boss' : 'forest');
    audio.listener = { x: this.lp.x, y: this.lp.y };
    audio.update(realDt);

    this.updateLocal(realDt, me, snap);
    if (this.isHost) this.sendInput();
    this.updateViews(snap, realDt);
    this.updateParticles(dt, snap);
    this.updateCamera(realDt);
    this.updateInteract(me);
    this.wardrobe.refresh(snap);
    this.tree.refresh(me);
    this.boons.refresh(snap, me);
    if (this.bannerT > 0) this.bannerT -= realDt;
    if (this.flash > 0) this.flash -= realDt * 2;
    this.renderer.draw(this, snap, me);
    updateHud(this, snap, me);
  }

  uiOpen() { return this.wardrobe.open || this.tree.open || settings.open; }

  // ---------------------------------------------------- your character
  updateLocal(dt, me, snap) {
    const lp = this.lp, inp = this.input, S = this.stats, c = inp.counts;
    const pressed = (k) => c[k] > this.lastCounts[k];
    const blocked = this.uiOpen();
    const P = (k) => pressed(k) && !blocked;
    const atkPressed = P('atk'), s1 = P('s1'), s2 = P('s2'), s3 = P('s3'), dashPressed = P('dash'), ultPressed = P('ult');
    this.edges = { interact: pressed('interact') && !settings.open, esc: pressed('esc'), back: pressed('back'), tree: pressed('tree') };
    this.lastCounts = { ...c };

    if (this.edges.esc) {
      if (this.wardrobe.open || this.tree.open) { this.wardrobe.close(); this.tree.close(); }
      else settings.toggle(true);
    }
    if (this.edges.back) { if (settings.open) settings.close(); else { this.wardrobe.close(); this.tree.close(); } }
    if (this.edges.tree && !settings.open) this.tree.toggle();

    lp.dashCd -= dt; lp.atkCd -= dt; lp.comboT -= dt;
    const down = !!me.dn;
    const mv = blocked ? { x: 0, y: 0 } : inp.moveVector();
    lp.moving = !down && (mv.x !== 0 || mv.y !== 0);
    const Z = this.renderer.zoom;
    if (inp.device === 'pad') {
      if (inp.padAim) { lp.aim = Math.atan2(inp.padAim.y, inp.padAim.x); lp.aimD = 120 * Math.hypot(inp.padAim.x, inp.padAim.y); }
      else if (lp.moving) { lp.aim = Math.atan2(mv.y, mv.x); lp.aimD = 120; }
    } else {
      const wx = this.cam.x + inp.mouse.x / Z, wy = this.cam.y + inp.mouse.y / Z;
      lp.aim = Math.atan2(wy - (lp.y - 14), wx - lp.x);
      lp.aimD = Math.hypot(wy - (lp.y - 14), wx - lp.x);
    }
    if (down) { lp.dashT = 0; return; }

    const warrior = this.cls !== 'sorcerer';
    const guarding = warrior && (!!me.g || (inp.guardHeld() && !blocked && me.c2 <= 0));
    if (dashPressed && lp.dashCd <= 0 && !guarding) {
      const dx = lp.moving ? mv.x : Math.cos(lp.aim), dy = lp.moving ? mv.y : Math.sin(lp.aim);
      const l = Math.hypot(dx, dy) || 1;
      lp.ddx = dx / l; lp.ddy = dy / l;
      lp.dashT = WARRIOR.dashTime;
      lp.dashCd = S.dashCd;
      this.burst(lp.x, lp.y - 8, 8, { color: byId(FLAMES, me.f).mid, speed: 80, life: 0.4, glow: true });
      audio.play('dash');
    }
    let vx, vy;
    if (lp.dashT > 0) {
      lp.dashT -= dt;
      vx = lp.ddx * WARRIOR.dashSpeed;
      vy = lp.ddy * WARRIOR.dashSpeed;
      this.particles.push({ x: lp.x + (Math.random() - 0.5) * 8, y: lp.y - 12 + (Math.random() - 0.5) * 12, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 2, color: byId(FLAMES, me.f).mid, glow: true, shrink: true });
    } else {
      const sp = S.speed * (guarding ? WARRIOR.guardSlow : 1) * (this.world.kind === 'lobby' ? 1.15 : 1);
      vx = mv.x * sp;
      vy = mv.y * sp;
    }
    let pos = this.world.collide(lp.x + vx * dt, lp.y + vy * dt, PLAYER_RADIUS);
    for (const e of snap.es) {
      if (e.t !== 'treant') continue;
      const dx = pos.x - e.x, dy = pos.y - e.y, d = Math.hypot(dx, dy) || 1, min = e.r * 0.8 + PLAYER_RADIUS;
      if (d < min) pos = this.world.collide(e.x + (dx / d) * min, e.y + (dy / d) * min, PLAYER_RADIUS);
    }
    lp.x = pos.x;
    lp.y = pos.y;
    if (lp.moving) { lp.stepT -= dt; if (lp.stepT <= 0) { lp.stepT = 0.36; audio.play('step'); } }

    if (atkPressed) this.cnt.ac++;
    if (s1) this.cnt.sc++;
    if (s2) this.cnt.s2c++;
    if (s3) this.cnt.s3c++;
    if (ultPressed) this.cnt.uc++;
    if (this.edges.interact && this.world.kind !== 'lobby') this.cnt.ic++;
    // show your own swing straight away (the host decides if it hit)
    if ((atkPressed || (inp.attackHeld() && !blocked)) && lp.atkCd <= 0 && !guarding) {
      lp.atkCd = S.atkCd;
      if (warrior) {
        lp.combo = lp.comboT > 0 ? (lp.combo % 3) + 1 : 1;
        lp.comboT = 1.1;
        this.startSwing(this.myId, lp.aim, lp.combo === 3);
        audio.play(lp.combo === 3 ? 'heavy' : 'swing');
      } else {
        this.startStaff(this.myId, lp.aim);
        audio.play('staff');
      }
    }
  }

  sendInput() {
    if (!this.alive || this.sv < 0) return;
    const lp = this.lp;
    const blocked = this.uiOpen();
    const msg = {
      t: 'in', sv: this.sv,
      x: Math.round(lp.x * 10) / 10, y: Math.round(lp.y * 10) / 10,
      aim: Math.round(lp.aim * 1000) / 1000, ad: Math.round(lp.aimD),
      m: lp.moving ? 1 : 0,
      d: lp.dashT > WARRIOR.dashTime - WARRIOR.dashSafe ? 1 : 0, // only the start of a dash dodges
      ...this.cnt,
      ah: this.input.attackHeld() && !blocked ? 1 : 0,
      g: this.input.guardHeld() && !blocked ? 1 : 0,
    };
    if (this.isHost) this.sim.applyInput('host', msg);
    else this.room.send(msg);
  }

  // ---------------------------------------------------- views (smoothing)
  viewFor(id) {
    let v = this.views.get('p' + id);
    if (!v) { v = { x: this.lp.x, y: this.lp.y, swingT: -9, castT: -9, heavy: false, init: false }; this.views.set('p' + id, v); }
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
    const cast = (this.t - v.castT) / 0.3;
    return {
      look: { cloak: byId(CLOAKS, p.c).hex, hat: p.h },
      cls: p.k,
      aim: mine ? this.lp.aim : p.a,
      moving: mine ? this.lp.moving : !!p.m,
      swing: sw >= 0 && sw < 1 ? sw : -1,
      cast: cast >= 0 && cast < 1 ? cast : -1,
      heavy: v.heavy,
      down: !!p.dn,
      hurt: !!p.hu,
      dash: mine ? this.lp.dashT > 0 : !!p.d,
      guard: !!p.g,
    };
  }

  updateViews(snap, dt) {
    const k = 1 - Math.exp(-dt * 16);
    const seen = new Set();
    for (const p of snap.ps) {
      seen.add('p' + p.id);
      if (p.id === this.myId) { this.viewFor(p.id); continue; }
      const v = this.viewFor(p.id);
      if (!v.init || Math.hypot(p.x - v.x, p.y - v.y) > 240) { v.x = p.x; v.y = p.y; v.init = true; }
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
      v.moving = Math.hypot(v.x - ox, v.y - oy) / Math.max(dt, 0.001) > 12;
    }
    for (const key of this.views.keys()) if (!seen.has(key)) this.views.delete(key);
  }

  // ---------------------------------------------------- effects & sounds
  startSwing(id, aim, heavy) {
    const v = this.viewFor(id);
    v.swingT = this.t;
    v.heavy = heavy;
    this.effects.push({ k: 'arc', id, aim, heavy, t0: this.t, life: 0.24 });
  }

  startStaff(id, aim) {
    const v = this.viewFor(id);
    v.swingT = this.t;
    v.heavy = false;
    this.effects.push({ k: 'staff', id, aim, t0: this.t, life: 0.22 });
  }

  banner(text, secs, sub = '') { this.bannerText = text; this.bannerSub = sub; this.bannerT = secs; }

  addShake(v) { this.shake = Math.max(this.shake, v * prefs.shake); }

  burst(x, y, n, o) {
    if (prefs.particles === 'low') n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = o.speed * (0.3 + Math.random() * 0.7);
      const life = o.life * (0.6 + Math.random() * 0.4);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), life, max: life, size: o.size || 2, color: o.color, glow: !!o.glow, drag: 3, grav: o.grav || 0, shrink: true });
    }
  }

  spark(x, y, col, size) { this.effects.push({ k: 'spark', x, y, col, size, rot: Math.random() * 3, t0: this.t, life: 0.18 }); }

  handleFx(f) {
    const near = (x, y) => Math.hypot(x - this.lp.x, y - this.lp.y) < 500;
    const mine = f.id === this.myId;
    const at = { x: f.x, y: f.y };
    switch (f.k) {
      case 'sw':
        if (!mine) { this.startSwing(f.id, f.a, !!f.h); const v = this.viewFor(f.id); audio.play(f.h ? 'heavy' : 'swing', { x: v.x, y: v.y, vol: 0.7 }); }
        break;
      case 'staff':
        if (!mine) { this.startStaff(f.id, f.a); const v = this.viewFor(f.id); audio.play('staff', { x: v.x, y: v.y, vol: 0.7 }); }
        break;
      case 'hit': {
        const col = f.el === 'frost' ? '#bfeaff' : f.el === 'fire' ? '#ffb060' : '#ffe6b0';
        this.burst(f.x, f.y, f.big ? 12 : 7, { color: col, speed: f.big ? 170 : 120, life: 0.35, glow: true });
        this.spark(f.x, f.y, f.el === 'frost' ? '190,235,255' : '255,240,200', f.big ? 16 : 11);
        if (prefs.dmgNums) this.effects.push({ k: 'num', x: f.x, y: f.y - 8, dx: (f.kx || 0), text: String(f.d), t0: this.t, life: 0.85, big: !!f.big, color: f.big ? '#ffb347' : '#ffffff' });
        audio.play(f.big ? 'hitBig' : 'hit', at);
        if (f.by === this.myId) { this.hitstop = Math.max(this.hitstop, f.big ? 0.07 : 0.04); this.addShake(f.big ? 3 : 1.5); }
        break;
      }
      case 'die':
        this.burst(f.x, f.y - 10, 16, { color: f.el ? '#ff9a3c' : '#6f9a4a', speed: 160, life: 0.7 });
        this.burst(f.x, f.y - 10, 10, { color: '#ffb060', speed: 100, life: 0.9, glow: true, up: 30 });
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: f.t === 'alpha' ? 70 : 34, t0: this.t, life: 0.35, color: 'rgba(255,220,160,1)', light: 70 });
        audio.play('die', at);
        break;
      case 'hurt':
        this.burst(f.x, f.y - 14, 8, { color: '#ff5a3a', speed: 110, life: 0.4, glow: true });
        if (mine) { this.addShake(5); this.hurtFlash = 0.35; audio.play('hurt'); }
        break;
      case 'dodge':
        this.burst(f.x, f.y - 14, 6, { color: '#ffffff', speed: 90, life: 0.3, glow: true });
        if (mine) audio.play('dodge');
        break;
      case 'slam':
        this.effects.push({ k: 'ring', x: f.x, y: f.y, t0: this.t, life: 0.45, r: f.r || WARRIOR.quakeRadius, light: 160 });
        this.effects.push({ k: 'ring', x: f.x, y: f.y, t0: this.t + 0.06, life: 0.4, r: (f.r || 108) * 0.6, color: 'rgba(255,230,180,1)' });
        this.effects.push({ k: 'crack', x: f.x, y: f.y, r: f.r || 108, seed: Math.random() * 3, t0: this.t, life: 1.2 });
        this.burst(f.x, f.y - 4, 26, { color: '#ffb060', speed: 230, life: 0.6, glow: true });
        this.burst(f.x, f.y, 18, { color: '#6b4f33', speed: 140, life: 0.6, up: 60, grav: 300 });
        if (near(f.x, f.y)) this.addShake(7);
        audio.play('quake', at);
        break;
      case 'guardOn': audio.play('guardOn', this.viewPos(f.id)); break;
      case 'block':
        this.burst(f.x, f.y - 14, 12, { color: '#ffe0a0', speed: 170, life: 0.3, glow: true });
        this.spark(f.x, f.y - 14, '255,230,170', 14);
        audio.play(f.perfect ? 'perfect' : 'block', at);
        if (mine) this.addShake(2);
        if (f.perfect && mine) this.banner('Perfect block!', 0.9);
        break;
      case 'counter': {
        this.effects.push({ k: 'counter', id: f.id, aim: f.a, t0: this.t, life: 0.28 });
        const v = this.viewFor(f.id);
        this.effects.push({ k: 'ring', x: v.x, y: v.y - 10, r: 50, t0: this.t, life: 0.25, color: 'rgba(255,170,80,1)', light: 120 });
        audio.play('counter', this.viewPos(f.id));
        if (mine) this.addShake(3);
        break;
      }
      case 'pyre':
        this.effects.push({ k: 'pyre', id: f.id, aim: f.a, x: f.x, y: f.y, light: 220, t0: this.t, life: 0.6 });
        this.burst(f.x, f.y - 10, 60, { color: '#ffcf6a', speed: 280, life: 0.9, glow: true });
        if (near(f.x, f.y)) { this.addShake(10); this.flash = 1; }
        audio.play('pyre', at);
        if (mine) this.banner('PYRE CLEAVE', 1.2);
        break;
      case 'spell': {
        const v = this.viewFor(f.id);
        v.castT = this.t;
        const col = ELEMENTS[f.el].color;
        this.burst(v.x, v.y - 26, 10, { color: col, speed: 90, life: 0.4, glow: true });
        if (f.el === 'gale') { this.effects.push({ k: 'gust', id: f.id, aim: f.a, t0: this.t, life: 0.35 }); this.burst(v.x + Math.cos(f.a) * 30, v.y - 10 + Math.sin(f.a) * 30, 14, { color: '#d8ffe8', speed: 160, life: 0.4, glow: true }); }
        audio.play(f.el, this.viewPos(f.id));
        break;
      }
      case 'weave': {
        const v = this.viewFor(f.id);
        v.castT = this.t;
        this.effects.push({ k: 'ring', x: v.x, y: v.y - 14, r: 30, t0: this.t, life: 0.4, color: 'rgba(200,240,255,1)', light: 110, lcol: [180, 220, 255] });
        audio.play('weave', this.viewPos(f.id));
        if (mine) this.banner(f.n, 1, 'Spells woven!');
        break;
      }
      case 'boom':
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: f.r, t0: this.t, life: 0.35, color: 'rgba(255,170,80,1)', light: 140 });
        this.burst(f.x, f.y, 22, { color: '#ff9a3c', speed: 180, life: 0.5, glow: true });
        if (near(f.x, f.y)) this.addShake(3);
        audio.play('boom', at);
        break;
      case 'shatter':
        this.burst(f.x, f.y, 6, { color: '#d9f4ff', speed: 90, life: 0.3, glow: true });
        break;
      case 'steam':
        this.effects.push({ k: 'cloud', x: f.x, y: f.y, r: f.r, seed: Math.random() * 3, t0: this.t, life: 0.9 });
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: f.r, t0: this.t, life: 0.35, color: 'rgba(255,255,255,1)', light: 150, lcol: [220, 235, 255] });
        this.burst(f.x, f.y - 6, 30, { color: '#f0f6ff', speed: 160, life: 0.8, up: 20 });
        if (near(f.x, f.y)) this.addShake(5);
        audio.play('steam', at);
        break;
      case 'starfall':
        if (mine) this.banner('STARFALL', 1.2);
        audio.play('starfall', at);
        break;
      case 'meteor':
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: 40, t0: this.t, life: 0.35, color: 'rgba(255,210,140,1)', light: 120 });
        this.effects.push({ k: 'crack', x: f.x, y: f.y, r: 44, seed: Math.random() * 3, t0: this.t, life: 0.8 });
        this.burst(f.x, f.y - 4, 18, { color: '#ffcf6a', speed: 200, life: 0.6, glow: true });
        if (near(f.x, f.y)) this.addShake(4);
        audio.play('meteor', at);
        break;
      case 'nope':
        if (mine) {
          audio.play('nope');
          toast(f.what === 'ult' ? 'Wildfire isn\'t full yet. Defeat glowing elites and bosses, or light a Heartwood shrine.' : f.what === 'mana' ? 'Not enough mana.' : 'Your flame is too weak for Cinder Quake.');
        }
        break;
      case 'wfReady':
        if (mine) { audio.play('wfReady'); this.banner('Wildfire ready!', 1.6, `Press ${this.keyLabel('ult')} to unleash it`); }
        break;
      case 'pick':
        this.burst(f.x, f.y, f.kind === 'f' ? 16 : 5, { color: f.kind === 'f' ? '#fff3b0' : '#ffd080', speed: 70, life: 0.5, glow: true });
        if (mine) audio.play(f.kind === 'f' ? 'fuel' : 'ember');
        break;
      case 'down':
        this.burst(f.x, f.y - 16, 16, { color: '#888', speed: 70, life: 1, up: 30 });
        audio.play('down', at);
        if (!mine) toast(`${f.n}'s flame went out! Stand close to rekindle them.`);
        break;
      case 'revive':
        this.burst(f.x, f.y - 16, 26, { color: '#ffe0a0', speed: 160, life: 0.8, glow: true, up: 30 });
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: 40, t0: this.t, life: 0.5, color: 'rgba(255,230,170,1)', light: 160 });
        audio.play('revive', at);
        toast(mine ? 'You have been rekindled!' : `${f.n} has been rekindled!`);
        break;
      case 'lvl':
        audio.play('lvl');
        this.banner(`Level ${f.lvl}!`, 1.8, `+1 skill point for everyone · press ${this.keyLabel('tree')}`);
        break;
      case 'shrine':
        this.burst(f.x, f.y - 16, 30, { color: '#ffb060', speed: 140, life: 1, glow: true, up: 40 });
        audio.play('shrine', at);
        toast(`${f.n} lit a Heartwood shrine (+Wildfire)`);
        break;
      case 'gate':
        audio.play('gate');
        this.banner('The Heartwood Gate opens', 2.5, 'Everyone into the gate to move on');
        break;
      case 'howl': audio.play('howl', { x: f.x, y: f.y, range: f.far ? 1400 : 900 }); break;
      case 'growl': audio.play('growl', { x: f.x, y: f.y, big: f.big, range: 400 }); break;
      case 'roar': audio.play('roar'); this.addShake(8); this.banner('The Treant calls the pack!', 1.8); break;
      case 'rootsCall': audio.play('rootsCall'); break;
      case 'root': audio.play('root', at); this.burst(f.x, f.y - 6, 10, { color: '#6b4f33', speed: 120, life: 0.5 }); if (near(f.x, f.y)) this.addShake(3); break;
      case 'sweep': audio.play('sweep', at); this.addShake(4); break;
      case 'rest': audio.play('boon'); break;
      case 'boon': if (f.n !== this.user) toast(`${f.n} chose ${byId(BOONS, f.b).name}`); break;
      case 'victory': audio.play('victory'); break;
      case 'defeat': audio.play('defeat'); break;
      case 'msg': toast(f.text); break;
    }
  }

  viewPos(id) { const v = this.views.get('p' + id); return v ? { x: v.x, y: v.y } : {}; }

  updateParticles(dt, snap) {
    const { w: VW, h: VH } = this.renderer.viewSize();
    let ff = 0;
    for (const p of this.particles) if (p.ff) ff++;
    const want = prefs.particles === 'low' ? 6 : 22;
    while (ff < want) {
      const life = 4 + Math.random() * 5;
      this.particles.push({ x: this.cam.x + Math.random() * VW, y: this.cam.y + Math.random() * VH, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14, life, max: life, size: 1, color: '#d8ff8a', glow: true, ff: true });
      ff++;
    }
    const cf = this.world.campfire;
    if (cf && Math.random() < dt * 14) {
      this.particles.push({ x: cf.x + (Math.random() - 0.5) * 12, y: cf.y - 10, vx: (Math.random() - 0.5) * 14, vy: -30 - Math.random() * 40, life: 1.4, max: 1.4, size: 1, color: '#ffb060', glow: true, shrink: true });
    }
    for (const z of snap.zn || []) {
      if (Math.random() < dt * (z.k === 'storm' ? 30 : 6)) {
        const col = z.k === 'blizzard' ? '#e6f6ff' : '#ffcf6a';
        this.particles.push({ x: z.x + (Math.random() - 0.5) * z.r, y: z.y - 6, vx: 0, vy: z.k === 'blizzard' ? 10 : -50, life: 0.6, max: 0.6, size: 1, color: col, glow: true, shrink: true });
      }
    }
    for (const s of snap.sp || []) if (s.k === 'fire' && Math.random() < dt * 40) this.particles.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 20, vy: -10, life: 0.35, max: 0.35, size: 1.5, color: '#ffb060', glow: true, shrink: true });
    for (const p of this.particles) {
      p.life -= dt;
      if (p.drag) { p.vx *= Math.exp(-dt * p.drag); p.vy *= Math.exp(-dt * p.drag); }
      if (p.ff) { p.vx += (Math.random() - 0.5) * 24 * dt; p.vy += (Math.random() - 0.5) * 24 * dt; }
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
    this.effects = this.effects.filter((e) => this.t - e.t0 < e.life);
  }

  updateCamera(dt) {
    const { w: W, h: H } = this.renderer.viewSize();
    const pw = this.world.pw, ph = this.world.ph;
    let tx = this.lp.x - W / 2, ty = this.lp.y - 18 - H / 2;
    tx = pw < W ? (pw - W) / 2 : Math.max(0, Math.min(pw - W, tx));
    ty = ph < H ? (ph - H) / 2 : Math.max(0, Math.min(ph - H, ty));
    if (this.camSnap) { this.cam.x = tx; this.cam.y = ty; this.camSnap = false; }
    else {
      const k = 1 - Math.exp(-dt * 8);
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
    if (this.world.kind !== 'lobby') return;
    let best = null, bd = 56;
    for (const p of this.world.props) {
      if (p.type !== 'wardrobe' && p.type !== 'shrine') continue;
      const d = Math.hypot(p.x - this.lp.x, p.y - this.lp.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const key = this.keyLabel('interact');
    if (best.type === 'wardrobe') {
      this.prompt = { x: best.x, y: best.y - 56, text: `[${key}] Wardrobe`, sub: 'Change your cloak, hat and flame' };
      if (this.edges.interact) this.wardrobe.toggle();
    } else {
      const c = byId(CLASSES, best.cls);
      const text = !c.available ? `${c.name}: still dormant (coming soon)` : me.k === c.id ? `${c.name}: chosen` : `[${key}] Become a ${c.name}`;
      this.prompt = { x: best.x, y: best.y - 66, text, sub: c.blurb };
      if (this.edges.interact) {
        if (!c.available) { toast(`The ${c.name} shrine is still dormant. Coming soon!`); audio.play('nope'); }
        else if (me.k !== c.id) this.requestCosmetic('cls', c.id);
      }
    }
  }
}
