// =============================================================
//  Game: runs on every player's computer.
//  - Moves YOUR character (so it feels instant).
//  - On the host: also runs the Sim and sends snapshots.
//  - On friends' computers: shows the host's snapshots smoothly.
// =============================================================
import { VERSION, WARRIOR, SORCERER, BOWMAN, ROGUE, CLERIC, WARLOCK, CLOAKS, FLAMES, CLASSES, BOONS, ELEMENTS, PLAYER_RADIUS, MAX_PLAYERS, classStats, byId } from './data.js';
import { World } from './world.js';
import { Sim } from './sim.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { toast, Wardrobe, TreePanel, BoonPanel, ControlsPanel, settings, pause, showClassTips, campPanel, signPanel, boardPanel, wheel } from './ui.js';
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
  return { name: c.name, cloak: c.cloak, hat: c.hat, flame: c.flame, cls: c.cls, stats: c.stats || null };
}

export class Game {
  // room is null for your own solo camp (until you open it to friends)
  constructor({ canvas, room, isHost, character, user, backend, onLeave, hooks = {} }) {
    this.hooks = hooks;
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
    this.controls = new ControlsPanel(this);
    this.myId = isHost ? 'host' : null;
    this.lp = { x: 0, y: 0, aim: 0, aimD: 100, moving: false, dashT: 0, dashCd: 0, ddx: 0, ddy: 0, atkCd: 0, combo: 0, comboT: 0, stepT: 0, charge: 0, drawing: false, stabN: 0 };
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
    settings.roomCode = room ? room.code : null;
    pause.game = this;
    buildHud(this.cls);
    document.getElementById('hud').classList.remove('hidden');

    if (isHost) {
      this.sim = new Sim({ onScene: () => this.onHostScene(), onJoinedFromWait: (p) => this.welcome(p) });
      this.sim.addPlayer('host', character, user);
      this.sim.goLobby();
      this.lastTick = performance.now();
      this.simTimer = makeTicker(16, () => this.hostTick());
      if (room) this.attachRoom(room);
    } else {
      room.handlers.data = (msg) => this.onClientData(msg);
      room.handlers.close = () => this.leave('The host closed the room.');
      room.send({ t: 'hello', char: publicChar(character), user, v: VERSION });
      this.inputTimer = makeTicker(33, () => this.sendInput());
      this.watchdog = setInterval(() => {
        if (performance.now() - this.lastSnapAt > 10000) this.leave('Lost connection to the host.');
      }, 1000);
    }
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(() => this.frame());
  }

  // ======================================================= host side
  // Open your camp to friends without reloading anything.
  attachRoom(room) {
    this.room = room;
    room.handlers.data = (from, msg) => this.onHostData(from, msg);
    room.handlers.leave = (id) => this.onPlayerLeft(id);
    this.netTimer = makeTicker(50, () => this.hostBroadcast());
    settings.roomCode = room.code;
    document.getElementById('room-code').textContent = room.code;
  }

  // Stop hosting: friends are sent home, you keep playing solo.
  closeRoom() {
    if (!this.isHost || !this.room) return;
    this.room.broadcast({ t: 'closed' });
    const r = this.room;
    setTimeout(() => { try { r.close(); } catch (e) { /* ignore */ } }, 300);
    if (this.netTimer) this.netTimer.stop();
    this.netTimer = null;
    this.room = null;
    settings.roomCode = null;
    for (const id of [...this.sim.players.keys()]) if (id !== 'host') this.sim.removePlayer(id);
    this.sim.waiting.clear();
    toast('Your camp is closed to friends.');
  }

  kick(id) {
    if (!this.isHost || !this.room || id === 'host') return;
    this.room.sendTo(id, { t: 'kicked' });
    setTimeout(() => this.room && this.room.kick(id), 200);
    this.onPlayerLeft(id);
  }

  isSolo() {
    if (this.waitSim) return true;
    return this.isHost && this.sim.players.size === 1;
  }

  hostTick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (pause.open && this.isSolo()) return; // playing alone: the pause menu really pauses
    this.sim.update(dt);
    if (!this.room) return;
    for (const p of [...this.sim.players.values()]) {
      if (p.id !== 'host' && now - p.lastSeen > 10000) { this.room.kick(p.id); this.onPlayerLeft(p.id); }
    }
  }

  welcome(p) {
    if (!this.room) return;
    this.room.sendTo(p.id, { t: 'welcome', id: p.id, v: VERSION });
    this.sendScene(p.id);
    toast(`${p.user} joined the party`);
  }

  hostBroadcast() {
    if (!this.room) return;
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
    if (this.room) for (const p of this.sim.players.values()) if (p.id !== 'host') this.sendScene(p.id);
  }

  sendScene(id) {
    const p = this.sim.players.get(id);
    if (!p || !this.room) return;
    this.room.sendTo(id, { t: 'scene', sv: this.sim.sv, ...this.sim.world.toMsg(), you: { x: p.x, y: p.y } });
  }

  onHostData(from, msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'hello': {
        if (this.sim.players.has(from)) return;
        // friends must be on the same version as the host
        if (msg.v !== VERSION) {
          this.room.sendTo(from, { t: 'version', v: VERSION });
          setTimeout(() => this.room.kick(from), 400);
          toast(`${msg.user || 'Someone'} tried to join on ${msg.v ? 'version ' + msg.v : 'an older version'}. You're on ${VERSION}.`);
          return;
        }
        if (this.sim.players.size >= MAX_PLAYERS) {
          this.room.sendTo(from, { t: 'full' });
          setTimeout(() => this.room.kick(from), 300);
          return;
        }
        if (this.sim.scene !== 'lobby') {
          // the party is out in the forest: wait at camp until they're back
          if (this.sim.waiting.size + this.sim.players.size >= MAX_PLAYERS) { this.room.sendTo(from, { t: 'full' }); setTimeout(() => this.room.kick(from), 300); return; }
          this.sim.waiting.set(from, { ch: msg.char || {}, user: msg.user });
          this.room.sendTo(from, { t: 'wait', id: from });
          toast(`${msg.user || 'Someone'} is waiting at camp for you`);
          return;
        }
        const p = this.sim.addPlayer(from, msg.char || {}, msg.user);
        this.sim.placeNewPlayer(p);
        this.welcome(p);
        break;
      }
      case 'campVote': this.sim.voteCamp(from, !!msg.yes); break;
      case 'react': this.sim.react(from, msg.r, msg.v, msg.x, msg.y); break;
      case 'emote': this.sim.emote(from, msg.v); break;
      case 'in': this.sim.applyInput(from, msg); break;
      case 'cosm': {
        const ok = this.sim.setCosmetic(from, msg.field, msg.value);
        this.room.sendTo(from, { t: ok ? 'cosmOk' : 'cosmNo', field: msg.field, value: msg.value });
        break;
      }
      case 'tree': this.sim.buyNode(from, msg.node); break;
      case 'pick': this.sim.pickBoon(from, msg.i); break;
      case 'vote': this.sim.vote(from, msg.v); break;
    }
  }

  onPlayerLeft(id) {
    if (this.sim.waiting.has(id)) { this.sim.waiting.delete(id); return; }
    const p = this.sim.players.get(id);
    if (!p) return;
    this.sim.removePlayer(id);
    toast(`${p.user} left the party`);
  }

  // ======================================================= client side
  onClientData(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        if (msg.v !== VERSION) { this.leave(`Your friend is on ${msg.v ? 'version ' + msg.v : 'an older version'}, you're on ${VERSION}. Both of you need the same version: refresh the page (Ctrl+F5) or update the app.`); break; }
        this.myId = msg.id;
        break;
      case 'version':
        this.leave(`Your friend is on version ${msg.v}, you're on ${VERSION}. Both of you need the same version: refresh the page (Ctrl+F5) or update the app.`);
        break;
      case 'wait': this.startWaiting(msg.id); break;
      case 'closed': this.leave('Your friend closed their camp.'); break;
      case 'kicked': this.leave('You were removed from the camp.'); break;
      case 'scene':
        if (this.waitSim) { this.waitSim = null; toast('The party is back. Welcome to the camp!'); }
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
    // every new area fades in out of the darkness (with its name for forests and the boss)
    if (this.world && world !== this.world) this.fadeIn = { t0: this.t, kind: world.kind };
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
    document.getElementById('help-key').textContent = keyName(prefs.keys.controls);
    this.controls.close();
  }

  requestCosmetic(field, value) {
    audio.play('click');
    if (this.waitSim) { if (this.waitSim.setCosmetic(this.myId, field, value)) this.saveCosmetic(field, value); return; }
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

  // While the party is out in the forest, a late joiner waits in a practice camp of their own.
  startWaiting(id) {
    this.myId = id;
    this.waitSim = new Sim({ onScene: () => { this.setWorld(this.waitSim.world, -7); } });
    this.waitSim.noRun = true;
    this.waitSim.addPlayer(id, this.char, this.user);
    this.waitSim.goLobby();
    const me = this.waitSim.players.get(id);
    this.lp.x = me.x; this.lp.y = me.y;
    this.banner('The party is out in the forest', 4, 'You can wait here at camp. They\'ll be back soon.');
  }

  voteCamp(yes) {
    if (this.isHost) this.sim.voteCamp('host', yes);
    else this.room.send({ t: 'campVote', yes });
  }

  // between forests: 'go' to continue, 'camp' to head back
  vote(v) {
    if (this.isHost) this.sim.vote('host', v);
    else this.room.send({ t: 'vote', v });
  }

  saveCosmetic(field, value) {
    this.char[field] = value;
    this.backend.saveChar(this.char).catch((e) => console.warn('save failed', e));
    if (field === 'cls') { toast(`You are now a ${byId(CLASSES, value).name}.`); showClassTips(value, this); }
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
    this.controls.close();
    settings.close();
    pause.close();
    campPanel.close(); signPanel.close(); boardPanel.close();
    settings.roomCode = null;
    document.getElementById('boons').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    audio.setScene('menu');
    try { if (this.room) this.room.close(); } catch (e) { /* ignore */ }
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
    if (this.waitSim) {
      // waiting at camp for the party: run a little practice camp locally
      if (!(pause.open)) this.waitSim.update(realDt);
      snap = this.waitSim.snapshot();
      for (const f of this.waitSim.fxLocal) this.handleFx(f);
      this.waitSim.fxLocal = [];
    } else if (this.isHost) {
      snap = this.sim.snapshot();
      for (const f of this.sim.fxLocal) this.handleFx(f);
      this.sim.fxLocal = [];
    } else snap = this.snap;
    this.lastSnap = snap;

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
    // camp music speeds up (up to +25%) the closer you get to the "Into the Wilds" archway
    const rz = this.world.readyZone;
    if (rz) {
      const d = Math.hypot(this.lp.x - (rz.x + rz.w / 2), this.lp.y - (rz.y + rz.h / 2));
      const want = 1 + 0.25 * Math.max(0, Math.min(1, 1 - (d - 40) / 520));
      audio.tempo = (audio.tempo || 1) + (want - (audio.tempo || 1)) * Math.min(1, realDt * 1.5);
    } else audio.tempo = 1;
    audio.update(realDt);

    this.updateLocal(realDt, me, snap);
    if (this.isHost || this.waitSim) this.sendInput();
    pause.refresh(snap, me);
    this.updateViews(snap, realDt);
    this.updateParticles(dt, snap);
    this.updateCamera(realDt);
    this.updateInteract(me);
    this.updateWheels(me);
    this.wardrobe.refresh(snap);
    this.tree.refresh(me);
    this.boons.refresh(snap, me);
    if (this.bannerT > 0) this.bannerT -= realDt;
    if (this.flash > 0) this.flash -= realDt * 2;
    this.renderer.draw(this, snap, me);
    updateHud(this, snap, me);
  }

  // Only the pause menu (Esc) stops you moving; skill tree, wardrobe and controls don't.
  uiOpen() { return this.wardrobe.open || this.tree.open || settings.open || pause.open || campPanel.open || signPanel.open || boardPanel.open; }
  moveBlocked() { return settings.open || pause.open; }

  // ---------------------------------------------------- your character
  updateLocal(dt, me, snap) {
    const lp = this.lp, inp = this.input, S = this.stats, c = inp.counts;
    const pressed = (k) => c[k] > this.lastCounts[k];
    const blocked = this.uiOpen();
    const P = (k) => pressed(k) && !blocked;
    const atkPressed = P('atk'), s1 = P('s1'), s2 = P('s2'), s3 = P('s3'), dashPressed = pressed('dash') && !this.moveBlocked(), ultPressed = P('ult');
    this.edges = { interact: pressed('interact') && !this.moveBlocked(), esc: pressed('esc'), back: pressed('back'), tree: pressed('tree'), controls: pressed('controls') };
    this.lastCounts = { ...c };

    // Esc: close whatever is open, otherwise open the pause screen
    const anyPanel = this.wardrobe.open || this.tree.open || this.controls.open || campPanel.open || signPanel.open || boardPanel.open;
    if (this.edges.esc) {
      if (settings.open) settings.close();
      else if (anyPanel) { this.wardrobe.close(); this.tree.close(); this.controls.close(); campPanel.close(); signPanel.close(); boardPanel.close(); }
      else pause.toggle();
    }
    if (this.edges.back) {
      if (settings.open) settings.close();
      else if (pause.open) pause.close();
      else { this.wardrobe.close(); this.tree.close(); this.controls.close(); campPanel.close(); signPanel.close(); boardPanel.close(); }
    }
    if (this.edges.tree && !settings.open && !pause.open) this.tree.toggle();
    if (this.edges.controls && !settings.open && !pause.open) this.controls.toggle(me.k);

    lp.dashCd -= dt; lp.atkCd -= dt; lp.comboT -= dt;
    const down = !!me.dn;
    const mv = this.moveBlocked() ? { x: 0, y: 0 } : inp.moveVector();
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
    if (down) { lp.dashT = 0; lp.drawing = false; lp.charge = 0; return; }

    const cls = this.cls;
    const held = inp.attackHeld() && !blocked;
    const guarding = cls === 'warrior' && (!!me.g || (inp.guardHeld() && !blocked && me.c2 <= 0));
    // Bowman: hold to draw (walk slower), let go to shoot
    if (cls === 'bowman') {
      if (me.hk > 0) { lp.drawing = false; lp.charge = 0; }
      else if (held && lp.atkCd <= 0) { lp.drawing = true; lp.charge = Math.min(1, lp.charge + dt / S.drawTime); }
      else if (lp.drawing && !held) {
        const ch = Math.max(0.05, lp.charge);
        lp.atkCd = (BOWMAN.minRecover + (BOWMAN.maxRecover - BOWMAN.minRecover) * ch) * S.recoverMult;
        this.startShot(this.myId, lp.aim, ch);
        lp.drawing = false; lp.charge = 0;
      }
    }

    if (dashPressed && lp.dashCd <= 0 && !guarding) {
      const dx = lp.moving ? mv.x : Math.cos(lp.aim), dy = lp.moving ? mv.y : Math.sin(lp.aim);
      const l = Math.hypot(dx, dy) || 1;
      lp.ddx = dx / l; lp.ddy = dy / l;
      lp.dashMax = cls === 'warlock' ? WARLOCK.slipTime : WARRIOR.dashTime;
      lp.dashT = lp.dashMax;
      lp.dashCd = S.dashCd;
      const dcol = cls === 'rogue' || cls === 'warlock' ? '#b08cff' : cls === 'cleric' ? '#ffe9a8' : byId(FLAMES, me.f).mid;
      this.burst(lp.x, lp.y - 8, cls === 'warlock' ? 16 : 8, { color: dcol, speed: 80, life: 0.4, glow: true });
      audio.play(cls === 'warlock' ? 'slip' : cls === 'cleric' ? 'blessStep' : 'dash');
    }
    let vx, vy;
    if (lp.dashT > 0) {
      lp.dashT -= dt;
      const dsp = cls === 'warlock' ? WARLOCK.slipSpeed : WARRIOR.dashSpeed;
      vx = lp.ddx * dsp;
      lp.vx = lp.ddx * S.speed; lp.vy = lp.ddy * S.speed; // carry some speed out of the dash
      vy = lp.ddy * dsp;
      const pcol = cls === 'rogue' ? '#b08cff' : cls === 'warlock' ? (Math.random() < 0.5 ? '#3a2458' : '#9b6bff') : cls === 'cleric' ? '#fff1b8' : byId(FLAMES, me.f).mid;
      this.particles.push({ x: lp.x + (Math.random() - 0.5) * 8, y: lp.y - 12 + (Math.random() - 0.5) * 12, vx: 0, vy: 0, life: cls === 'cleric' ? 0.8 : 0.3, max: cls === 'cleric' ? 0.8 : 0.3, size: 2, color: pcol, glow: cls !== 'warlock', shrink: true });
    } else {
      let sp = S.speed * (this.world.kind === 'lobby' ? 1.15 : 1);
      if (guarding) sp *= WARRIOR.guardSlow;
      if (cls === 'bowman' && lp.drawing) sp *= S.drawSlow;
      if (cls === 'rogue' && (snap.zn || []).some((z) => z.k === 'smoke' && Math.hypot(lp.x - z.x, lp.y - z.y) < z.r)) sp *= ROGUE.smokeSpeed;
      // walking through a friend's Sorcerer trail gives a small burst of speed
      if ((snap.zn || []).some((z) => z.k === 'haste' && z.o !== this.myId && Math.hypot(lp.x - z.x, lp.y - z.y) < z.r + 6)) {
        if (!(lp.hasteT > 0)) audio.play('haste');
        lp.hasteT = 0.8;
      }
      lp.hasteT = (lp.hasteT || 0) - dt;
      if (lp.hasteT > 0) {
        sp *= 1 + SORCERER.trailHaste;
        if (lp.moving && Math.random() < 0.35) this.particles.push({ x: lp.x + (Math.random() - 0.5) * 10, y: lp.y - 4, vx: 0, vy: -20, life: 0.4, max: 0.4, size: 1, color: '#bff5ff', glow: true, shrink: true });
      }
      // a bit of momentum: you speed up, slow down and turn smoothly instead of instantly
      const accel = mv.x || mv.y ? 15 : 18; // snappy, with just a touch of momentum
      const k = 1 - Math.exp(-dt * accel);
      lp.vx = (lp.vx || 0) + (mv.x * sp - (lp.vx || 0)) * k;
      lp.vy = (lp.vy || 0) + (mv.y * sp - (lp.vy || 0)) * k;
      vx = lp.vx;
      vy = lp.vy;
    }
    let pos = this.world.collide(lp.x + vx * dt, lp.y + vy * dt, PLAYER_RADIUS);
    for (const e of snap.es) {
      if (e.t !== 'treant') continue;
      const dx = pos.x - e.x, dy = pos.y - e.y, d = Math.hypot(dx, dy) || 1, min = e.r * 0.8 + PLAYER_RADIUS;
      if (d < min) pos = this.world.collide(e.x + (dx / d) * min, e.y + (dy / d) * min, PLAYER_RADIUS);
    }
    lp.x = pos.x;
    lp.y = pos.y;
    if (lp.moving || (inp.attackHeld() && !blocked)) lp.emote = null;
    if (lp.moving) { lp.stepT -= dt; if (lp.stepT <= 0) { lp.stepT = 0.36; audio.play('step'); } }

    if (atkPressed) this.cnt.ac++;
    if (s1) this.cnt.sc++;
    if (s2) this.cnt.s2c++;
    if (s3) this.cnt.s3c++;
    if (ultPressed) this.cnt.uc++;
    if (this.edges.interact) this.cnt.ic++;
    // Bowman: right-click while drawing cancels the shot
    if (cls === 'bowman' && s2 && lp.drawing) { lp.drawing = false; lp.charge = 0; lp.atkCd = 0.15; audio.play('cancel'); }
    // show your own attack straight away (the host decides if it hit)
    if (cls !== 'bowman' && (atkPressed || held) && lp.atkCd <= 0 && !guarding) {
      lp.atkCd = S.atkCd;
      if (cls === 'warrior') {
        lp.combo = lp.comboT > 0 ? (lp.combo % 3) + 1 : 1;
        lp.comboT = 1.1;
        this.startSwing(this.myId, lp.aim, lp.combo === 3);
        if (lp.combo === 3) lp.atkCd += WARRIOR.heavyRecover;
        audio.play(lp.combo === 3 ? 'heavy' : 'swing');
      } else if (cls === 'rogue') {
        lp.stabN = (lp.stabN % ROGUE.spinEvery) + 1;
        if (lp.stabN === ROGUE.spinEvery) { this.startSpin(this.myId, S.spinR); audio.play('spin'); }
        else { this.startStab(this.myId, lp.aim); audio.play('stab'); }
      } else if (cls === 'cleric') {
        this.startSwing(this.myId, lp.aim, false);
        audio.play('mace');
      } else if (cls === 'warlock') {
        this.startBolt(this.myId, lp.aim);
      } else {
        this.startStaff(this.myId, lp.aim);
        audio.play('staff');
      }
    }
    // Cleric: a faint glow briefly shows who Mending Light will go to
    if (cls === 'cleric') {
      const tid = this.mendTargetId(snap, me);
      if (!this.mendAim || this.mendAim.id !== tid) this.mendAim = { id: tid, t0: this.t };
    }
    if (cls === 'bowman' && me.hk > 0 && (atkPressed || held) && lp.atkCd <= 0) { lp.atkCd = BOWMAN.hawkRecover; this.startShot(this.myId, lp.aim, 1); }
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
      d: this.cls === 'warlock' ? (lp.dashT > 0 ? 1 : 0) : lp.dashT > WARRIOR.dashTime - WARRIOR.dashSafe ? 1 : 0, // only the start of a dash dodges (all of a Shadow Slip)
      ...this.cnt,
      ah: this.input.attackHeld() && !blocked ? 1 : 0,
      g: this.input.guardHeld() && !blocked ? 1 : 0,
    };
    if (this.waitSim) { this.waitSim.applyInput(this.myId, msg); this.room.send({ t: 'ping' }); return; }
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
    const spin = (this.t - (v.spinT ?? -9)) / 0.3;
    return {
      look: { cloak: byId(CLOAKS, p.c).hex, hat: p.h },
      cls: p.k,
      charge: mine ? this.lp.charge : p.ch,
      spin: spin >= 0 && spin < 1 ? spin : -1,
      aim: mine ? this.lp.aim : p.a,
      moving: mine ? this.lp.moving : !!p.m,
      swing: sw >= 0 && sw < 1 ? sw : -1,
      cast: cast >= 0 && cast < 1 ? cast : -1,
      heavy: v.heavy,
      down: !!p.dn,
      hurt: !!p.hu,
      dash: mine ? this.lp.dashT > 0 : !!p.d,
      guard: !!p.g,
      emote: mine ? this.lp.emote : p.em,
      emoteT: mine ? this.t - this.lp.emoteAt : p.ea,
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

  startStab(id, aim) {
    const v = this.viewFor(id);
    v.swingT = this.t;
    this.effects.push({ k: 'stab', id, aim, t0: this.t, life: 0.2 });
  }

  startSpin(id, r) {
    const v = this.viewFor(id);
    v.spinT = this.t;
    this.effects.push({ k: 'spin', id, aim: 0, r, t0: this.t, life: 0.3 });
  }

  startBolt(id, aim) {
    const v = this.viewFor(id);
    v.castT = this.t;
    audio.play('bolt', this.viewPos(id));
    this.burst(v.x + Math.cos(aim) * 12, v.y - 16 + Math.sin(aim) * 12, 5, { color: '#b08cff', speed: 60, life: 0.3, glow: true });
  }

  // same rule as the host: the ally you aim at, otherwise whoever nearby has the least flame (maybe you)
  mendTargetId(snap, me) {
    let best = null, ba = CLERIC.mendAim;
    for (const p of snap.ps) {
      if (p.id === this.myId || p.dn) continue;
      const v = this.playerView(p);
      const dx = v.x - this.lp.x, dy = v.y - this.lp.y;
      if (Math.hypot(dx, dy) > CLERIC.mendRange) continue;
      let da = Math.atan2(dy, dx) - this.lp.aim;
      while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < ba) { ba = Math.abs(da); best = p.id; }
    }
    if (best) return best;
    let low = this.myId, lr = me.hp / me.mx;
    for (const p of snap.ps) {
      if (p.id === this.myId || p.dn) continue;
      const v = this.playerView(p);
      if (Math.hypot(v.x - this.lp.x, v.y - this.lp.y) > CLERIC.mendRange) continue;
      if (p.hp / p.mx < lr) { lr = p.hp / p.mx; low = p.id; }
    }
    return low;
  }

  startShot(id, aim, c) {
    const v = this.viewFor(id);
    audio.play(c >= 0.95 ? 'bowFull' : 'bow', this.viewPos(id));
    if (c >= 0.95) this.burst(v.x + Math.cos(aim) * 14, v.y - 14 + Math.sin(aim) * 14, 8, { color: '#fff3c0', speed: 90, life: 0.3, glow: true });
  }

  // a skill button flashes red when you can't use it (no mana, no target...)
  deny(slot) {
    audio.play('fizzle');
    const map = { s1: ['sk-quake', 'sk-fire', 'sk-mark', 'sk-smoke', 'sk-mend', 'sk-hands'], s2: ['sk-gale', 'sk-rain', 'sk-step', 'sk-judge', 'sk-imps'], s3: ['sk-frost', 'sk-ground', 'sk-siphon'], ult: ['sk-ult'] };
    for (const id of map[slot] || []) {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('denied'); void el.offsetWidth; el.classList.add('denied'); }
    }
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
        const col = f.el === 'frost' ? '#bfeaff' : f.el === 'fire' ? '#ffb060' : f.el === 'back' ? '#ff6a7a' : f.el === 'shadow' || f.el === 'imp' ? '#b08cff' : f.el === 'holy' ? '#fff1b8' : '#ffe6b0';
        if (f.el === 'back') { f.big = 1; if (f.by === this.myId) audio.play('backstab', at); }
        this.burst(f.x, f.y, f.big ? 12 : 7, { color: col, speed: f.big ? 170 : 120, life: 0.35, glow: true });
        this.spark(f.x, f.y, f.el === 'frost' ? '190,235,255' : '255,240,200', f.big ? 16 : 11);
        if (prefs.dmgNums) this.effects.push({ k: 'num', x: f.x, y: f.y - 8, dx: (f.kx || 0), text: String(f.d), t0: this.t, life: 0.85, big: !!f.big, color: f.el === 'back' ? '#ff7a8a' : f.big ? '#ffb347' : '#ffffff' });
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
        // no pop-up text: the button gleams red and makes a fizzle sound
        if (mine) this.deny(f.what === 'ult' ? 'ult' : f.slot || 's1');
        break;
      case 'shoot':
        if (!mine) this.startShot(f.id, f.a, f.c);
        break;
      case 'thunk': this.burst(f.x, f.y, 3, { color: '#b89a6a', speed: 40, life: 0.3 }); audio.play('thunk', at); break;
      case 'mark': audio.play('mark', at); this.effects.push({ k: 'ring', x: f.x, y: f.y - 10, r: 22, t0: this.t, life: 0.4, color: 'rgba(255,210,100,1)' }); break;
      case 'rain': audio.play('rain', at); break;
      case 'hawk':
        audio.play('hawk', at);
        this.burst(f.x, f.y - 16, 24, { color: '#ffe6a0', speed: 120, life: 0.6, glow: true });
        if (mine) this.banner('HAWK EYE', 1.2, 'Every shot is full strength and seeks enemies');
        break;
      case 'stab':
        if (!mine) { this.startStab(f.id, f.a); audio.play('stab', this.viewPos(f.id)); }
        break;
      case 'spin':
        if (!mine) { this.startSpin(f.id, f.r); audio.play('spin', this.viewPos(f.id)); }
        break;
      case 'tp':
        if (f.hop) {
          // the Rogue's quick hop in towards a target
          this.burst(f.fx, f.fy - 4, 6, { color: '#8a6a5a', speed: 60, life: 0.3 });
          this.effects.push({ k: 'blink', x: f.fx, y: f.fy - 12, x2: f.x, y2: f.y - 12, t0: this.t, life: 0.15 });
          if (mine) { this.lp.x = f.x; this.lp.y = f.y; this.lp.vx = 0; this.lp.vy = 0; }
          break;
        }
        this.effects.push({ k: 'blink', x: f.fx, y: f.fy - 12, x2: f.x, y2: f.y - 12, t0: this.t, life: 0.35 });
        this.burst(f.fx, f.fy - 12, 12, { color: '#8a6cc8', speed: 70, life: 0.5 });
        this.burst(f.x, f.y - 12, 12, { color: '#b08cff', speed: 90, life: 0.5, glow: true });
        audio.play('step2', at);
        if (mine) { this.lp.x = f.x; this.lp.y = f.y; this.lp.aim = f.a; this.viewFor(f.id).init = false; }
        break;
      case 'smoke':
        audio.play('smoke', at);
        this.burst(f.x, f.y - 8, 26, { color: '#b9bccb', speed: 90, life: 1, up: 10 });
        break;
      case 'decoyPop':
        this.burst(f.x, f.y - 12, f.boom ? 24 : 10, { color: f.boom ? '#ff9a6a' : '#b08cff', speed: f.boom ? 160 : 80, life: 0.5, glow: true });
        audio.play(f.boom ? 'boom' : 'pop', at);
        break;
      case 'cuts': {
        audio.play('cuts', at);
        let px = f.x, py = f.y - 12;
        f.pts.forEach(([x, y], i) => {
          this.effects.push({ k: 'blink', x: px, y: py, x2: x, y2: y, t0: this.t + i * 0.06, life: 0.3 });
          this.effects.push({ k: 'slash', x, y, t0: this.t + i * 0.06, life: 0.3 });
          px = x; py = y;
        });
        if (f.pts.length) this.effects.push({ k: 'blink', x: px, y: py, x2: f.x, y2: f.y - 12, t0: this.t + f.pts.length * 0.06, life: 0.3 });
        if (mine) { this.banner('THOUSAND CUTS', 1.2); this.addShake(6); }
        break;
      }
      case 'react':
        if (f.r === 'ping') { this.effects.push({ k: 'ping', v: f.v, x: f.x, y: f.y, t0: this.t, life: 4 }); audio.play('ping', at); }
        else { this.effects.push({ k: 'emoji', id: f.id, v: f.v, t0: this.t, life: 2.4 }); audio.play('pop', this.viewPos(f.id)); }
        break;
      case 'practiceHit':
        this.burst(f.x, f.y - 14, 8, { color: '#ffb0a0', speed: 90, life: 0.3, glow: true });
        if (mine) { this.addShake(3); this.hurtFlash = 0.2; audio.play('hurt'); this.banner('Hit!', 0.5, 'Block (or dodge) the dummy\'s swing'); }
        break;
      case 'thwack': audio.play('thwack', at); break;
      case 'cancelDraw': if (!mine) audio.play('cancel', this.viewPos(f.id)); break;
      case 'runEnd':
        if (mine) {
          // update this character's stats board
          const st = this.char.stats || { runs: 0, kills: 0, bosses: 0, best: 0 };
          st.runs++; st.kills += f.kills; if (f.won) st.bosses++; st.best = Math.max(st.best, f.won ? 4 : f.stage);
          this.char.stats = st;
          this.backend.saveChar(this.char).catch(() => {});
        }
        break;
      case 'vote':
        if (f.v === 'camp') toast(`${f.n} wants to return to camp`);
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
        this.banner(`Level ${f.lvl}!`, 1.8, '+1 skill point for everyone · spend it at the end of the round');
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
      case 'rest':
        // walking into the light at the Heartwood Gate
        audio.play('gate');
        this.lightFlash = { t0: this.t };
        for (const p of (this.lastSnap ? this.lastSnap.ps : [])) { const v = this.playerView(p); this.burst(v.x, v.y - 14, 26, { color: '#fff0c0', speed: 70, life: 1.2, glow: true, up: 50 }); }
        break;
      case 'boon': if (f.n !== this.user) toast(`${f.n} chose ${byId(BOONS, f.b).name}`); break;
      case 'victory': audio.play('victory'); break;
      case 'defeat': audio.play('defeat'); break;
      // ---- Cleric
      case 'heal': {
        const v = this.viewFor(f.id);
        this.burst(v.x, v.y - 14, 10, { color: '#fff1b8', speed: 50, life: 0.8, glow: true, up: 40 });
        if (prefs.dmgNums && f.v >= 1) this.effects.push({ k: 'num', x: v.x, y: v.y - 30, dx: 0, text: '+' + f.v, t0: this.t, life: 0.9, big: false, color: '#9ff0a0' });
        if (f.id === this.myId && f.by !== this.myId) audio.play('healed');
        break;
      }
      case 'mend': {
        const v = this.viewFor(f.id), tv = this.viewFor(f.tid);
        v.castT = this.t;
        this.effects.push({ k: 'beam', x: v.x, y: v.y - 20, x2: tv.x, y2: tv.y - 14, t0: this.t, life: 0.35, col: [255, 236, 160] });
        this.effects.push({ k: 'ring', x: tv.x, y: tv.y, r: 26, t0: this.t, life: 0.5, color: 'rgba(255,236,160,1)', light: 110, lcol: [255, 230, 160] });
        audio.play('mend', { x: v.x, y: v.y });
        break;
      }
      case 'judge': {
        this.effects.push({ k: 'judge', id: f.id, aim: f.a, t0: this.t, life: 0.4 });
        const v = this.viewFor(f.id);
        this.burst(v.x + Math.cos(f.a) * 40, v.y - 8 + Math.sin(f.a) * 40, 22, { color: '#fff1b8', speed: 170, life: 0.5, glow: true });
        if (near(f.x, f.y)) this.addShake(5);
        audio.play('judge', at);
        break;
      }
      case 'sanct':
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: f.r, t0: this.t, life: 0.5, color: 'rgba(255,236,160,1)', light: 150, lcol: [255, 230, 160] });
        this.burst(f.x, f.y - 6, 20, { color: '#fff1b8', speed: 90, life: 0.8, glow: true, up: 30 });
        audio.play('sanct', at);
        break;
      case 'dawn':
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: f.r, t0: this.t, life: 0.9, color: 'rgba(255,240,190,1)', light: 300, lcol: [255, 240, 190] });
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: f.r * 0.6, t0: this.t + 0.1, life: 0.7, color: 'rgba(255,255,255,1)' });
        this.burst(f.x, f.y - 20, 60, { color: '#fff4c8', speed: 260, life: 1.1, glow: true, up: 30 });
        if (near(f.x, f.y)) this.flash = 0.8;
        audio.play('dawn', at);
        if (mine) this.banner('DAWN', 1.2, 'Light heals and rekindles your party');
        break;
      case 'shieldHit':
        this.burst(f.x, f.y - 14, 8, { color: '#dff4ff', speed: 110, life: 0.3, glow: true });
        audio.play('shieldHit', at);
        break;
      // ---- Warlock
      case 'bolt':
        if (!mine) this.startBolt(f.id, f.a);
        if (f.c) { const v = this.viewFor(f.id); this.burst(v.x, v.y - 18, 8, { color: '#7a4fd0', speed: 70, life: 0.5, glow: true }); }
        break;
      case 'boltFizz': this.burst(f.x, f.y, 5, { color: '#9b6bff', speed: 50, life: 0.35, glow: true }); break;
      case 'handsCast': {
        const v = this.viewFor(f.id); v.castT = this.t;
        audio.play('handsCast', at);
        break;
      }
      case 'hands':
        this.effects.push({ k: 'hands', x: f.x, y: f.y, r: f.r, seed: Math.random() * 9, t0: this.t, life: 1.2 });
        this.burst(f.x, f.y - 4, 26, { color: '#3a2458', speed: 140, life: 0.6, up: 40, grav: 200 });
        this.burst(f.x, f.y - 8, 14, { color: '#b08cff', speed: 110, life: 0.6, glow: true });
        if (near(f.x, f.y)) this.addShake(4);
        audio.play('hands', at);
        break;
      case 'imps':
        for (const [x, y] of f.pts) this.burst(x, y - 6, 10, { color: '#7a4fd0', speed: 70, life: 0.5, glow: true, up: 20 });
        audio.play('imps', this.viewPos(f.id));
        break;
      case 'siphon': audio.play('siphon', this.viewPos(f.id)); break;
      case 'eclipse':
        this.eclipseT = this.t;
        this.burst(f.x, f.y - 20, 50, { color: '#3a2458', speed: 200, life: 1, up: 30 });
        this.burst(f.x, f.y - 20, 30, { color: '#b08cff', speed: 160, life: 0.9, glow: true });
        if (near(f.x, f.y)) this.addShake(8);
        audio.play('eclipse', at);
        if (mine) this.banner('ECLIPSE', 1.2, 'Your familiar draws every enemy to it');
        break;
      case 'famSwipe': audio.play('famSwipe', at); this.burst(f.x, f.y - 14, 10, { color: '#7a4fd0', speed: 120, life: 0.4, glow: true }); break;
      case 'famHit': this.burst(f.x, f.y - 20, 6, { color: '#2a1a40', speed: 80, life: 0.4 }); audio.play('hit', { ...at, vol: 0.6 }); break;
      case 'famDie':
        this.burst(f.x, f.y - 20, 40, { color: '#3a2458', speed: 180, life: 1, up: 20 });
        audio.play('famDie', at);
        break;
      case 'plague': this.effects.push({ k: 'beam', x: f.x, y: f.y - 10, x2: f.x2, y2: f.y2 - 10, t0: this.t, life: 0.4, col: [176, 140, 255] }); break;
      case 'shove':
        this.burst(f.x, f.y - 6, 10, { color: '#c9b08a', speed: 120, life: 0.4 });
        this.spark(f.x, f.y - 12, '255,230,190', 12);
        audio.play('shove', at);
        if (mine) this.addShake(2);
        break;
      case 'rollShot': audio.play('bow', this.viewPos(f.id)); break;
      case 'decoy':
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: 30, t0: this.t, life: 0.4, color: 'rgba(180,140,255,1)' });
        audio.play('pop', at);
        break;
      case 'fountain':
        this.burst(f.x, f.y - 22, 30, { color: '#ffcf6a', speed: 120, life: 0.9, glow: true, up: 50 });
        audio.play('fuel', at);
        break;
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
  // ---------------------------------------------------- reaction wheel (mouse 3) + emote wheel (C)
  updateWheels(me) {
    const inp = this.input;
    const blocked = settings.open || pause.open;
    const reactHeld = inp.mouse.middle && !blocked;
    const emoteHeld = inp.keys.has('KeyC') && !blocked;
    if (!wheel.open) {
      if (reactHeld) wheel.show('react', inp.mouse.x, inp.mouse.y);
      else if (emoteHeld) wheel.show('emote', inp.mouse.x, inp.mouse.y);
      inp.wheelOpen = wheel.open;
      inp.scroll = 0;
      return;
    }
    if (inp.scroll) { wheel.flip(inp.scroll); inp.scroll = 0; }
    wheel.update(inp.mouse.x, inp.mouse.y);
    const stillHeld = wheel.kind === 'react' ? inp.mouse.middle : inp.keys.has('KeyC');
    if (stillHeld) return;
    const pick = wheel.close();
    inp.wheelOpen = false;
    if (!pick) return;
    if (pick.kind === 'emote') {
      this.lp.emote = pick.v; this.lp.emoteAt = this.t;
      this.sendEmote(pick.v);
    } else {
      // pings go where the wheel was opened (where you were pointing)
      const Z = this.renderer.zoom;
      const x = this.cam.x + wheel.cx / Z, y = this.cam.y + wheel.cy / Z;
      this.sendReact(pick.page === 0 ? 'ping' : 'emoji', pick.v, pick.page === 0 ? x : this.lp.x, pick.page === 0 ? y : this.lp.y);
    }
  }

  sendReact(r, v, x, y) {
    if (this.waitSim) { this.waitSim.react(this.myId, r, v, x, y); return; }
    if (this.isHost) this.sim.react('host', r, v, x, y);
    else this.room.send({ t: 'react', r, v, x: Math.round(x), y: Math.round(y) });
  }

  sendEmote(v) {
    if (this.waitSim) { this.waitSim.emote(this.myId, v); return; }
    if (this.isHost) this.sim.emote('host', v);
    else this.room.send({ t: 'emote', v });
  }

  updateInteract(me) {
    this.prompt = null;
    if (this.world.kind !== 'lobby') return;
    const STATIONS = ['wardrobe', 'shrine', 'campfire', 'signpost', 'board', 'resetpost', 'fountain'];
    let best = null, bd = 58;
    for (const p of this.world.props) {
      if (!STATIONS.includes(p.type)) continue;
      const d = Math.hypot(p.x - this.lp.x, p.y - this.lp.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const key = this.keyLabel('interact');
    const go = this.edges.interact;
    switch (best.type) {
      case 'wardrobe':
        this.prompt = { x: best.x, y: best.y - 56, text: `[${key}] Wardrobe`, sub: 'Change your cloak, hat and flame' };
        if (go) this.wardrobe.toggle();
        break;
      case 'campfire': {
        const sub = this.waitSim ? 'Waiting for the party to come back' : !this.isHost ? "You are in a friend's camp" : this.room ? `Your camp is open · code ${this.room.code}` : 'Host your camp or join a friend';
        this.prompt = { x: best.x, y: best.y - 40, text: `[${key}] Campfire`, sub };
        if (go) campPanel.toggle(this);
        break;
      }
      case 'signpost':
        this.prompt = { x: best.x, y: best.y - 46, text: `[${key}] Signpost`, sub: 'Change character or log out' };
        if (go) signPanel.toggle(this);
        break;
      case 'board':
        this.prompt = { x: best.x, y: best.y - 50, text: `[${key}] Stats board`, sub: `${this.char.name}'s journey so far` };
        if (go) boardPanel.toggle(this);
        break;
      case 'fountain':
        this.prompt = { x: best.x, y: best.y - 52, text: `[${key}] Wildfire Fountain`, sub: me.wf >= 100 ? `Wildfire full · press ${this.keyLabel('ult')} to try your ultimate` : 'Fill your Wildfire to practise your ultimate' };
        break;
      case 'resetpost':
        this.prompt = { x: best.x, y: best.y - 40, text: `[${key}] Reset the dummies`, sub: 'Clears their damage-per-second' };
        break;
      default: {
        const c = byId(CLASSES, best.cls);
        const text = !c.available ? `${c.name}: still dormant (coming soon)` : me.k === c.id ? `${c.name}: chosen` : `[${key}] Become a ${c.name}`;
        this.prompt = { x: best.x, y: best.y - 66, text, sub: c.blurb };
        if (go) {
          if (!c.available) { toast(`The ${c.name} shrine is still dormant. Coming soon!`); audio.play('nope'); }
          else if (me.k !== c.id) this.requestCosmetic('cls', c.id);
        }
      }
    }
  }
}
