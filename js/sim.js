// =============================================================
//  The simulation. ONLY the host runs this.
//  It decides enemies, damage, flame, EXP, Wildfire, pickups,
//  reviving, stages and bosses, then sends snapshots to everyone.
//  (Each player moves their own character; the host trusts that.)
// =============================================================
import {
  WARRIOR, WOLF, ELITE, ALPHA, TREANT, RULES, CLOAKS, HATS, FLAMES, CLASSES, BOONS,
  PLAYER_RADIUS, xpToNext, warriorStats, canBuy,
} from './data.js';
import { makeLobby, makeForest, makeArena } from './world.js';

const R = { float: (a, b) => a + Math.random() * (b - a) };
const STATE_CODE = { idle: 0, chase: 1, windup: 2, lunge: 3, recover: 4, sweep: 5 };
const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const valid = (list, id, fallback) => (list.some((x) => x.id === id) ? id : fallback);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

export class Sim {
  constructor(hooks) {
    this.hooks = hooks;
    this.players = new Map();
    this.enemies = [];
    this.pickups = [];
    this.hazards = [];
    this.fires = [];
    this.nextId = 1;
    this.sv = 0;
    this.fxLocal = [];
    this.fxNet = [];
    this.scene = 'lobby';
    this.state = 'lobby';
    this.stage = 0;
    this.world = null;
    this.countdown = -1;
    this.stateTimer = 0;
    this.stageTime = 0;
    this.runTime = 0;
    this.waveT = 30;
    this.xp = 0;
    this.lvl = 1;
    this.gateOpen = false;
    this.shrineUsed = [];
    this.time = 0;
  }

  emit(f) { this.fxLocal.push(f); this.fxNet.push(f); }
  alivePlayers() { return [...this.players.values()].filter((p) => !p.down); }

  // ======================================================= scenes
  goLobby() {
    this.scene = 'lobby';
    this.state = 'lobby';
    this.stage = 0;
    this.xp = 0;
    this.lvl = 1;
    this.world = makeLobby();
    this.clearStage();
    this.sv++;
    for (const p of this.players.values()) this.resetRunStats(p);
    this.placeAll(true);
    this.hooks.onScene();
  }

  clearStage() {
    this.enemies = [];
    this.pickups = [];
    this.hazards = [];
    this.fires = [];
    this.countdown = -1;
    this.stageTime = 0;
    this.gateOpen = false;
  }

  resetRunStats(p) {
    p.tree = {}; p.boons = []; p.pts = 0; p.wf = 0; p.choices = null; p.picked = false;
    this.recalc(p);
    p.hp = p.max;
  }

  startRun() {
    this.xp = 0;
    this.lvl = 1;
    this.runTime = 0;
    for (const p of this.players.values()) this.resetRunStats(p);
    this.startStage(1);
  }

  startStage(n) {
    const seed = (Math.random() * 2147483647) | 0;
    this.stage = n;
    this.world = n <= RULES.forestStages ? makeForest(seed) : makeArena(seed);
    this.scene = this.world.kind;
    this.state = 'playing';
    this.clearStage();
    this.waveT = 28;
    this.shrineUsed = this.world.shrines.map(() => false);
    this.sv++;
    this.placeAll(n === 1);
    const np = this.players.size;
    if (this.scene === 'forest') {
      const hpScale = (1 + 0.3 * (np - 1)) * (1 + 0.25 * (n - 1));
      for (const s of this.world.wolfSpawns) this.spawnWolf(s.x, s.y, hpScale, Math.random() < ELITE.chance);
      for (let i = 0; i < (np - 1) * 3 && this.world.wolfSpawns.length; i++) {
        const s = this.world.wolfSpawns[Math.floor(Math.random() * this.world.wolfSpawns.length)];
        this.spawnWolf(s.x + R.float(-16, 16), s.y + R.float(-16, 16), hpScale, false);
      }
      const a = this.spawnAlpha(this.world.bossSpawn.x, this.world.bossSpawn.y, (1 + 0.35 * (np - 1)) * (1 + 0.3 * (n - 1)));
      a.guardian = true;
    } else {
      this.spawnTreant(this.world.bossSpawn.x, this.world.bossSpawn.y, 1 + 0.5 * (np - 1));
    }
    this.hooks.onScene();
    if (this.scene === 'forest') this.emit({ k: 'msg', text: `Thornwood ${['I', 'II', 'III'][n - 1]}: defeat the Alpha to open the Heartwood Gate.` });
    else this.emit({ k: 'msg', text: 'The Elder Treant awakens…' });
  }

  placeAll(fullHeal) {
    const n = Math.max(1, this.players.size);
    let i = 0;
    for (const p of this.players.values()) {
      const a = (i++ * Math.PI * 2) / n;
      const pos = this.world.collide(this.world.spawn.x + Math.cos(a) * 32, this.world.spawn.y + Math.sin(a) * 32, PLAYER_RADIUS);
      p.x = pos.x; p.y = pos.y;
      if (p.down) { p.down = false; p.hp = p.max * 0.5; }
      if (fullHeal) p.hp = p.max;
      p.revive = 0; p.atkCd = 0; p.quakeCd = 0; p.guardCd = 0; p.guard = false; p.glowT = 0;
    }
  }

  placeNewPlayer(p) {
    const alive = [...this.players.values()].filter((o) => o !== p && !o.down);
    const base = this.scene !== 'lobby' && alive.length ? alive[0] : this.world.spawn;
    const pos = this.world.collide(base.x + R.float(-30, 30), base.y + R.float(-30, 30), PLAYER_RADIUS);
    p.x = pos.x;
    p.y = pos.y;
  }

  // ======================================================= players
  addPlayer(id, ch, user) {
    const p = {
      id,
      user: String(user || ch.name || 'Wanderer').slice(0, 16),
      name: String(ch.name || 'Wanderer').slice(0, 16),
      cloak: this.freeCloak(ch.cloak),
      hat: valid(HATS, ch.hat, 'none'),
      flame: valid(FLAMES, ch.flame, 'amber'),
      cls: 'warrior',
      x: 0, y: 0, aim: 0, moving: false, dashing: false,
      hp: WARRIOR.maxFlame, max: WARRIOR.maxFlame, wf: 0,
      down: false, revive: 0,
      atkCd: 0, quakeCd: 0, guardCd: 0, combo: 0, comboT: 0,
      guard: false, guardT: 0, guardHeat: 0, guardStart: 0, gHeld: false,
      ac: null, sc: null, uc: null, ic: null, ah: false,
      wantAtk: 0, wantSkill: 0, wantUlt: 0, wantInt: 0,
      hurtT: 0, glowT: 0, lastSeen: performance.now(),
      tree: {}, boons: [], pts: 0, choices: null, picked: false, stats: null,
    };
    const cls = CLASSES.find((c) => c.id === ch.cls);
    if (cls && cls.available) p.cls = cls.id;
    this.recalc(p);
    p.hp = p.max;
    // joining mid-run: catch up on skill points
    if (this.stage > 0) p.pts = this.lvl - 1;
    this.players.set(id, p);
    return p;
  }

  recalc(p) {
    const old = p.max || WARRIOR.maxFlame;
    p.stats = warriorStats(p.tree, p.boons);
    p.max = p.stats.maxFlame;
    if (p.max > old && !p.down) p.hp += p.max - old;
    p.hp = Math.min(p.hp, p.max);
  }

  removePlayer(id) { this.players.delete(id); }

  freeCloak(pref) {
    const taken = new Set([...this.players.values()].map((p) => p.cloak));
    if (CLOAKS.some((c) => c.id === pref) && !taken.has(pref)) return pref;
    return (CLOAKS.find((c) => !taken.has(c.id)) || CLOAKS[0]).id;
  }

  setCosmetic(id, field, value) {
    const p = this.players.get(id);
    if (!p) return false;
    if (field === 'cloak') {
      if (!CLOAKS.some((c) => c.id === value)) return false;
      for (const o of this.players.values()) if (o !== p && o.cloak === value) return false;
      p.cloak = value;
      return true;
    }
    if (field === 'hat') { if (!HATS.some((h) => h.id === value)) return false; p.hat = value; return true; }
    if (field === 'flame') { if (!FLAMES.some((f) => f.id === value)) return false; p.flame = value; return true; }
    if (field === 'cls') {
      const c = CLASSES.find((c) => c.id === value);
      if (!c || !c.available || this.scene !== 'lobby') return false;
      p.cls = value;
      return true;
    }
    return false;
  }

  buyNode(id, node) {
    const p = this.players.get(id);
    if (!p || !canBuy(p.tree, p.pts, node)) return false;
    p.tree[node] = (p.tree[node] || 0) + 1;
    p.pts--;
    this.recalc(p);
    return true;
  }

  pickBoon(id, i) {
    const p = this.players.get(id);
    if (!p || this.state !== 'rest' || p.picked || !p.choices || !p.choices[i]) return false;
    const b = p.choices[i];
    p.boons.push(b);
    if (b === 'kindle') p.wf = Math.min(RULES.wildfireMax, p.wf + 30);
    p.picked = true;
    this.recalc(p);
    this.emit({ k: 'boon', n: p.user, b });
    return true;
  }

  applyInput(id, m) {
    const p = this.players.get(id);
    if (!p) return;
    p.lastSeen = performance.now();
    if (m.sv === this.sv && !p.down && Number.isFinite(m.x) && Number.isFinite(m.y)) {
      p.x = Math.max(0, Math.min(this.world.pw, m.x));
      p.y = Math.max(0, Math.min(this.world.ph, m.y));
    }
    if (Number.isFinite(m.aim)) p.aim = m.aim;
    p.moving = !!m.m;
    p.dashing = !!m.d;
    p.ah = !!m.ah;
    p.gHeld = !!m.g;
    const edge = (key, want) => {
      if (p[key] === null) p[key] = m[key];
      else if (m[key] > p[key]) { p[want] = 0.3; p[key] = m[key]; }
    };
    edge('ac', 'wantAtk');
    edge('sc', 'wantSkill');
    edge('uc', 'wantUlt');
    edge('ic', 'wantInt');
  }

  // ======================================================= update
  update(dt) {
    this.time += dt;
    const active = this.state === 'playing' || this.state === 'lobby';
    for (const p of this.players.values()) {
      p.atkCd -= dt; p.quakeCd -= dt; p.guardCd -= dt; p.comboT -= dt; p.hurtT -= dt; p.glowT -= dt;
      p.wantAtk -= dt; p.wantSkill -= dt; p.wantUlt -= dt; p.wantInt -= dt;
      if (p.down || !active) { p.guard = false; continue; }
      this.updateGuard(p, dt);
      if (!p.guard) {
        if ((p.wantAtk > 0 || p.ah) && p.atkCd <= 0) { this.attack(p); p.wantAtk = 0; }
        if (p.wantSkill > 0 && p.quakeCd <= 0) { this.quake(p); p.wantSkill = 0; }
        if (p.wantUlt > 0) { this.ultimate(p); p.wantUlt = 0; }
      }
      if (p.wantInt > 0 && this.scene === 'forest') { this.useShrine(p); p.wantInt = 0; }
    }
    this.updateRevives(dt);

    if (this.scene === 'lobby') this.updateLobby(dt);
    else if (this.state === 'playing') {
      this.stageTime += dt;
      this.runTime += dt;
      this.updateEnemies(dt);
      this.updateHazards(dt);
      this.updateFires(dt);
      this.updatePickups(dt);
      if (this.scene === 'forest') this.updateWaves(dt);
      this.checkEnd();
    } else if (this.state === 'rest') {
      this.stateTimer -= dt;
      const ps = [...this.players.values()];
      if (ps.every((p) => p.picked) || this.stateTimer <= 0) {
        for (const p of ps) if (!p.picked) this.pickBoon(p.id, 0);
        this.startStage(this.stage + 1);
      }
    } else {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.goLobby();
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  updateLobby(dt) {
    const z = this.world.readyZone;
    const ps = [...this.players.values()];
    const allIn = ps.length > 0 && ps.every((p) => p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h);
    if (allIn) {
      if (this.countdown < 0) this.countdown = 3;
      this.countdown -= dt;
      if (this.countdown <= 0) { this.countdown = -1; this.startRun(); }
    } else this.countdown = -1;
  }

  updateRevives(dt) {
    for (const p of this.players.values()) {
      if (!p.down) continue;
      let helped = false;
      for (const o of this.players.values()) {
        if (o !== p && !o.down && Math.hypot(o.x - p.x, o.y - p.y) < RULES.reviveRange) helped = true;
      }
      if (helped && this.state === 'playing') {
        p.revive += dt / RULES.reviveTime;
        if (p.revive >= 1) {
          p.down = false;
          p.hp = RULES.reviveFlame;
          p.revive = 0;
          this.emit({ k: 'revive', id: p.id, n: p.user, x: Math.round(p.x), y: Math.round(p.y) });
        }
      } else p.revive = Math.max(0, p.revive - dt * 0.5);
    }
  }

  // ======================================================= Warrior
  fury(p) { return 1 + p.stats.furyMax * (1 - p.hp / p.max); }
  power(p) { return this.fury(p) * p.stats.dmgMult; }

  hitArc(p, range, arc, dmg, kb, aim = p.aim) {
    let hits = 0;
    if (this.scene === 'lobby') return 0;
    const cx = p.x, cy = p.y - 8;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - cx, dy = e.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > range + e.r) continue;
      if (d > e.r + 10 && Math.abs(angDiff(Math.atan2(dy, dx), aim)) > arc / 2) continue;
      this.damageEnemy(e, dmg, dx / (d || 1), dy / (d || 1), kb, p);
      hits++;
    }
    if (hits && p.stats.leech) p.hp = Math.min(p.max, p.hp + p.stats.leech * hits);
    return hits;
  }

  attack(p) {
    const S = p.stats;
    p.atkCd = S.atkCd;
    p.combo = p.comboT > 0 ? (p.combo % 3) + 1 : 1;
    p.comboT = 1.0;
    const heavy = p.combo === 3;
    this.emit({ k: 'sw', id: p.id, a: r2(p.aim), h: heavy ? 1 : 0 });
    this.hitArc(p, WARRIOR.atkRange, WARRIOR.atkArc, WARRIOR.atkDmg * this.power(p) * (heavy ? S.heavyMult : 1), heavy ? 340 : 190);
  }

  quake(p) {
    const S = p.stats;
    const inStage = this.scene !== 'lobby';
    if (inStage && p.hp <= S.quakeCost) { p.quakeCd = 0.3; this.emit({ k: 'nope', id: p.id, what: 'quake' }); return; }
    p.quakeCd = S.quakeCd;
    if (inStage) p.hp -= S.quakeCost;
    this.emit({ k: 'slam', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r: Math.round(S.quakeRadius) });
    if (!inStage) return;
    const dmg = S.quakeDmg * this.power(p);
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < S.quakeRadius + e.r) { this.damageEnemy(e, dmg, dx / d, dy / d, e.type === 'treant' ? 0 : 420, p); if (e.type !== 'treant') e.stun = 0.6; hits++; }
    }
    if (hits && S.leech) p.hp = Math.min(p.max, p.hp + S.leech * hits);
  }

  // Smoulder Guard: hold to block from the front, let go to counter-slash.
  updateGuard(p, dt) {
    const W = WARRIOR;
    if (!p.guard) {
      if (p.gHeld && p.guardCd <= 0) {
        p.guard = true; p.guardT = 0; p.guardHeat = 0; p.guardStart = this.time;
        this.emit({ k: 'guardOn', id: p.id });
      }
      return;
    }
    p.guardT += dt;
    if (!p.gHeld || p.guardT >= W.guardMax) {
      p.guard = false;
      p.guardCd = W.guardCd;
      const dmg = (W.counterBase + p.guardHeat * W.counterPerHeat) * p.stats.counterMult * this.power(p);
      this.emit({ k: 'counter', id: p.id, a: r2(p.aim), pw: Math.min(1, p.guardHeat / 30) });
      this.hitArc(p, W.counterRange, W.counterArc, dmg, 300);
    }
  }

  ultimate(p) {
    if (p.wf < RULES.wildfireMax) { this.emit({ k: 'nope', id: p.id, what: 'ult' }); return; }
    if (this.scene === 'lobby') return;
    const W = WARRIOR;
    p.wf = 0;
    p.glowT = 2;
    this.emit({ k: 'pyre', id: p.id, a: r2(p.aim), x: Math.round(p.x), y: Math.round(p.y) });
    this.hitArc(p, W.pyreRange, W.pyreArc, W.pyreDmg * this.power(p), 380);
    const life = W.pyreTrail * p.stats.trailMult;
    for (let i = 0; i <= 8; i++) {
      const a = p.aim - W.pyreArc / 2 + (W.pyreArc * i) / 8;
      for (const rr of [48, 92]) {
        const pos = { x: p.x + Math.cos(a) * rr, y: p.y - 6 + Math.sin(a) * rr };
        const tx = Math.floor(pos.x / 32), ty = Math.floor(pos.y / 32);
        if (!this.world.isSolid(tx, ty)) this.fires.push({ x: Math.round(pos.x), y: Math.round(pos.y), t: life, owner: p.id });
      }
    }
  }

  gainWildfire(p, v) {
    const before = p.wf;
    p.wf = Math.min(RULES.wildfireMax, p.wf + v * p.stats.wfGain);
    if (before < RULES.wildfireMax && p.wf >= RULES.wildfireMax) this.emit({ k: 'wfReady', id: p.id });
  }

  useShrine(p) {
    this.world.shrines.forEach((s, i) => {
      if (this.shrineUsed[i] || Math.hypot(s.x - p.x, s.y - p.y) > 48) return;
      this.shrineUsed[i] = true;
      this.gainWildfire(p, RULES.shrineFuel);
      this.emit({ k: 'shrine', id: p.id, n: p.user, x: s.x, y: s.y });
    });
  }

  // ======================================================= flame
  hurtPlayer(p, dmg, sx, sy, blockable = true, attacker = null) {
    if (p.down || this.state !== 'playing') return false;
    if (p.dashing) return false; // dashing dodges everything
    if (blockable && p.guard) {
      const a = Math.atan2(sy - p.y, sx - p.x);
      if (Math.abs(angDiff(a, p.aim)) < p.stats.guardArc / 2) {
        p.guardHeat += dmg * p.stats.heatMult;
        const perfect = p.stats.unbroken && this.time - p.guardStart < WARRIOR.perfectWindow;
        if (perfect && attacker && attacker.type !== 'treant') attacker.stun = 1.2;
        this.emit({ k: 'block', id: p.id, x: Math.round(p.x), y: Math.round(p.y), perfect: perfect ? 1 : 0 });
        return false;
      }
    }
    dmg *= p.stats.dmgTaken;
    p.hp -= dmg;
    p.hurtT = 0.3;
    this.emit({ k: 'hurt', id: p.id, x: Math.round(p.x), y: Math.round(p.y), d: Math.round(dmg) });
    if (p.hp <= 0) {
      p.hp = 0;
      p.down = true;
      p.revive = 0;
      p.guard = false;
      this.emit({ k: 'down', id: p.id, n: p.user, x: Math.round(p.x), y: Math.round(p.y) });
    }
    return true;
  }

  grantXp(v) {
    let scholar = 0;
    for (const p of this.players.values()) scholar += p.boons.filter((b) => b === 'scholar').length;
    this.xp += v * (1 + 0.25 * scholar);
    while (this.xp >= xpToNext(this.lvl)) {
      this.xp -= xpToNext(this.lvl);
      this.lvl++;
      for (const p of this.players.values()) p.pts++;
      this.emit({ k: 'lvl', lvl: this.lvl });
    }
  }

  // ======================================================= enemies
  baseEnemy(type, x, y, r, hp) {
    const pos = this.world.collide(x, y, r);
    const e = {
      id: this.nextId++, type, x: pos.x, y: pos.y, vx: 0, vy: 0, r, hp, max: hp,
      state: 'idle', t: R.float(0, 2), cd: 0, fx: Math.random() < 0.5 ? -1 : 1, dx: 1, dy: 0,
      hit: false, homeX: pos.x, homeY: pos.y, wx: pos.x, wy: pos.y, target: null,
      hurtT: 0, stun: 0, burnT: 0, flank: Math.random() < 0.5 ? -1 : 1, dead: false, elite: false,
    };
    this.enemies.push(e);
    return e;
  }

  spawnWolf(x, y, hpScale, elite) {
    const dmgScale = 1 + 0.15 * (this.stage - 1);
    const e = this.baseEnemy('wolf', x, y, WOLF.r, WOLF.hp * hpScale * (elite ? ELITE.hpMult : 1) * (1 + this.stageTime / 300));
    e.def = WOLF;
    e.elite = !!elite;
    e.spd = elite ? ELITE.speedMult : 1;
    e.dmg = WOLF.dmg * dmgScale * (elite ? ELITE.dmgMult : 1);
    return e;
  }

  spawnAlpha(x, y, hpScale) {
    const e = this.baseEnemy('alpha', x, y, ALPHA.r, ALPHA.hp * hpScale);
    e.def = ALPHA;
    e.spd = 1;
    e.dmg = ALPHA.dmg * (1 + 0.15 * (this.stage - 1));
    e.howlT = ALPHA.howlCd * 0.5;
    e.lungesLeft = 0;
    return e;
  }

  spawnTreant(x, y, hpScale) {
    const e = this.baseEnemy('treant', x, y, TREANT.r, TREANT.hp * hpScale);
    e.atkT = 2.5;
    e.phase = 0;
    e.sa = Math.PI / 2;
    return e;
  }

  damageEnemy(e, dmg, kx, ky, kb, src = null, silent = false) {
    if (e.dead) return;
    e.hp -= dmg;
    if (e.type !== 'treant') {
      const heavyFoe = e.type === 'alpha' ? 0.35 : 1;
      e.vx += kx * kb * heavyFoe;
      e.vy += ky * kb * heavyFoe;
    }
    if (!silent) {
      e.hurtT = 0.12;
      this.emit({ k: 'hit', x: Math.round(e.x), y: Math.round(e.y - e.r), d: Math.round(dmg), big: dmg >= 25 ? 1 : 0 });
      if (e.state === 'idle' && src) { e.state = 'chase'; e.target = src.id; }
    }
    if (kb >= 340 && e.state === 'windup' && e.type === 'wolf') { e.state = 'recover'; e.t = 0.5; }
    if (e.hp <= 0) this.killEnemy(e, src);
  }

  killEnemy(e, src) {
    e.dead = true;
    this.emit({ k: 'die', t: e.type, x: Math.round(e.x), y: Math.round(e.y), el: e.elite ? 1 : 0 });
    const drop = (kind, v) => this.pickups.push({ id: this.nextId++, kind, v, x: e.x, y: e.y, vx: R.float(-100, 100), vy: R.float(-100, 100), life: 30 });
    if (e.type === 'wolf') {
      this.grantXp(e.elite ? ELITE.xp : WOLF.xp);
      if (Math.random() < RULES.emberChance) drop('e', 1);
      if (e.elite) drop('f', ELITE.fuel);
    } else if (e.type === 'alpha') {
      this.grantXp(ALPHA.xp);
      for (let i = 0; i < 4; i++) drop('e', 1);
      drop('f', ALPHA.fuel);
      if (e.guardian) { this.gateOpen = true; this.emit({ k: 'gate', x: this.world.exit.x, y: this.world.exit.y }); }
    } else if (e.type === 'treant') {
      this.state = 'victory';
      this.stateTimer = 9;
      this.hazards = [];
      for (const o of this.enemies) if (o !== e) o.dead = true;
      this.emit({ k: 'victory', boss: 1 });
    }
    if (src && src.stats && src.stats.embersInDark && src.hp / src.max < 0.4) src.hp = Math.min(src.max, src.hp + 4);
  }

  nearestAlive(x, y, maxD) {
    let best = null, bd = maxD;
    for (const p of this.players.values()) {
      if (p.down) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  alertPack(e, targetId) {
    for (const o of this.enemies) {
      if (o !== e && o.state === 'idle' && o.type === 'wolf' && Math.hypot(o.x - e.x, o.y - e.y) < 240) { o.state = 'chase'; o.target = targetId; }
    }
  }

  updateEnemies(dt) {
    const alive = this.alivePlayers();
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t -= dt; e.cd -= dt; e.hurtT -= dt; e.stun -= dt; e.burnT -= dt;
      if (e.type === 'treant') { this.updateTreant(e, dt, alive); continue; }
      this.updateWolfLike(e, dt, alive);
    }
  }

  updateWolfLike(e, dt, alive) {
    const D = e.def;
    let tvx = 0, tvy = 0;
    const tgt = e.target ? this.players.get(e.target) : null;
    const ok = tgt && !tgt.down;
    if (e.type === 'alpha' && e.state !== 'idle') {
      e.howlT -= dt;
      if (e.howlT <= 0) {
        e.howlT = ALPHA.howlCd;
        for (let i = 0; i < 2; i++) {
          const w = this.spawnWolf(e.x + R.float(-40, 40), e.y + R.float(-40, 40), 1 + 0.3 * (this.players.size - 1), false);
          w.state = 'chase'; w.target = e.target;
        }
        this.emit({ k: 'howl', x: Math.round(e.x), y: Math.round(e.y) });
      }
    }
    if (e.stun <= 0) {
      switch (e.state) {
        case 'idle': {
          const best = this.nearestAlive(e.x, e.y, D.aggro);
          if (best) { e.target = best.id; e.state = 'chase'; this.alertPack(e, best.id); if (e.type === 'alpha') this.emit({ k: 'howl', x: Math.round(e.x), y: Math.round(e.y) }); break; }
          if (e.t <= 0) {
            e.t = R.float(2, 4);
            const a = R.float(0, 6.28), r = R.float(0, 70);
            e.wx = e.homeX + Math.cos(a) * r;
            e.wy = e.homeY + Math.sin(a) * r;
          }
          const dx = e.wx - e.x, dy = e.wy - e.y, d = Math.hypot(dx, dy);
          if (d > 6) { tvx = (dx / d) * 45; tvy = (dy / d) * 45; }
          break;
        }
        case 'chase': {
          if (!ok) {
            const nb = this.nearestAlive(e.x, e.y, D.aggro * 1.5);
            e.target = nb ? nb.id : null;
            if (!nb) { e.state = 'idle'; e.homeX = e.x; e.homeY = e.y; }
            break;
          }
          const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
          if (d > D.aggro * 2.2 && e.type === 'wolf') { e.state = 'idle'; e.target = null; e.homeX = e.x; e.homeY = e.y; break; }
          if (d < D.lungeRange && e.cd <= 0) {
            e.state = 'windup'; e.t = D.windup; e.dx = dx / d; e.dy = dy / d;
            if (e.type === 'alpha') e.lungesLeft = ALPHA.lunges;
            this.emit({ k: 'growl', x: Math.round(e.x), y: Math.round(e.y), big: e.type === 'alpha' ? 1 : 0 });
            break;
          }
          let ux = dx / d, uy = dy / d;
          if (d < 180) {
            const px = -uy * e.flank, py = ux * e.flank;
            const back = d < 64 && e.cd > 0 ? -0.6 : 0.75;
            ux = ux * back + px * 0.6;
            uy = uy * back + py * 0.6;
            const l = Math.hypot(ux, uy) || 1;
            ux /= l; uy /= l;
          }
          tvx = ux * D.chaseSpeed * e.spd;
          tvy = uy * D.chaseSpeed * e.spd;
          break;
        }
        case 'windup': {
          if (ok && e.t > 0.15) {
            const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
            e.dx = dx / d; e.dy = dy / d;
          }
          if (e.t <= 0) { e.state = 'lunge'; e.t = D.lungeTime; e.hit = false; }
          break;
        }
        case 'lunge': {
          tvx = e.dx * D.lungeSpeed * e.spd;
          tvy = e.dy * D.lungeSpeed * e.spd;
          if (!e.hit) {
            for (const p of alive) {
              if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + PLAYER_RADIUS + 4) {
                e.hit = true;
                this.hurtPlayer(p, e.dmg, e.x, e.y, true, e);
                break;
              }
            }
          }
          if (e.t <= 0) {
            if (e.type === 'alpha' && --e.lungesLeft > 0) { e.state = 'windup'; e.t = 0.25; }
            else { e.state = 'recover'; e.t = D.recover; }
          }
          break;
        }
        case 'recover': {
          if (e.t <= 0) { e.state = 'chase'; e.cd = R.float(0.6, 1.4); }
          break;
        }
      }
    }

    if (e.state === 'lunge' && e.stun <= 0) { e.vx = tvx; e.vy = tvy; }
    else {
      const k = 1 - Math.exp(-dt * 7);
      e.vx += (tvx - e.vx) * k;
      e.vy += (tvy - e.vy) * k;
    }
    for (const o of this.enemies) {
      if (o === e || o.dead || o.type === 'treant') continue;
      const min = e.r + o.r;
      const dx = e.x - o.x, dy = e.y - o.y, d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2);
        e.x += (dx / d) * (min - d) * 0.5;
        e.y += (dy / d) * (min - d) * 0.5;
      }
    }
    const pos = this.world.collide(e.x + e.vx * dt, e.y + e.vy * dt, e.r);
    e.x = pos.x;
    e.y = pos.y;
    if (e.state === 'windup' || e.state === 'lunge') e.fx = e.dx >= 0 ? 1 : -1;
    else if (Math.abs(e.vx) > 5) e.fx = e.vx > 0 ? 1 : -1;
  }

  updateTreant(e, dt, alive) {
    const T = TREANT;
    e.atkT -= dt;
    const tgt = this.nearestAlive(e.x, e.y, 3000);
    // calls for help when badly hurt
    const frac = e.hp / e.max;
    if ((e.phase === 0 && frac < 0.66) || (e.phase === 1 && frac < 0.33)) {
      e.phase++;
      const n = 3 + this.players.size;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = this.spawnWolf(e.x + Math.cos(a) * 90, e.y + 40 + Math.sin(a) * 60, 1 + 0.3 * (this.players.size - 1), i === 0);
        w.state = 'chase';
        w.target = tgt ? tgt.id : null;
      }
      this.emit({ k: 'roar', x: Math.round(e.x), y: Math.round(e.y) });
    }
    if (!tgt) return;
    if (e.state === 'sweep') {
      e.t -= dt;
      if (e.t <= 0) {
        for (const p of alive) {
          const dx = p.x - e.x, dy = p.y - e.y;
          if (Math.hypot(dx, dy) < T.sweepRange + PLAYER_RADIUS && Math.abs(angDiff(Math.atan2(dy, dx), e.sa)) < T.sweepArc / 2) {
            this.hurtPlayer(p, T.sweepDmg, e.x, e.y, true, e);
          }
        }
        this.emit({ k: 'sweep', x: Math.round(e.x), y: Math.round(e.y), a: r2(e.sa) });
        e.state = 'idle';
        e.atkT = T.attackCd;
      }
      return;
    }
    const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 100) {
      const pos = this.world.collide(e.x + (dx / d) * T.speed * dt, e.y + (dy / d) * T.speed * dt, e.r);
      e.x = pos.x; e.y = pos.y;
    }
    e.fx = dx >= 0 ? 1 : -1;
    if (e.atkT > 0) return;
    if (d < T.sweepRange * 0.9 && Math.random() < 0.6) {
      e.state = 'sweep';
      e.t = T.sweepWindup;
      e.sa = Math.atan2(dy, dx);
      this.hazards.push({ id: this.nextId++, kind: 'cone', x: e.x, y: e.y, a: e.sa, arc: T.sweepArc, r: T.sweepRange, t: T.sweepWindup, life: T.sweepWindup, max: T.sweepWindup });
    } else {
      for (const p of alive) {
        this.hazards.push({ id: this.nextId++, kind: 'root', x: p.x + R.float(-14, 14), y: p.y + R.float(-14, 14), r: T.rootR, t: T.rootDelay, life: T.rootDelay + 0.4, max: T.rootDelay, dmg: T.rootDmg });
      }
      this.emit({ k: 'rootsCall', x: Math.round(e.x), y: Math.round(e.y) });
      e.atkT = T.attackCd;
    }
  }

  updateHazards(dt) {
    for (const h of this.hazards) {
      h.t -= dt;
      h.life -= dt;
      if (h.kind === 'root' && h.t <= 0 && !h.done) {
        h.done = true;
        for (const p of this.alivePlayers()) {
          if (Math.hypot(p.x - h.x, p.y - h.y) < h.r + PLAYER_RADIUS) this.hurtPlayer(p, h.dmg, h.x, h.y, false);
        }
        this.emit({ k: 'root', x: Math.round(h.x), y: Math.round(h.y) });
      }
    }
    this.hazards = this.hazards.filter((h) => h.life > 0);
  }

  updateFires(dt) {
    for (const f of this.fires) {
      f.t -= dt;
      for (const e of this.enemies) {
        if (!e.dead && Math.hypot(e.x - f.x, e.y - f.y) < 22 + e.r * 0.5) {
          e.burnT = 0.2;
          this.damageEnemy(e, WARRIOR.pyreTrailDps * dt, 0, 0, 0, this.players.get(f.owner) || null, true);
        }
      }
    }
    this.fires = this.fires.filter((f) => f.t > 0);
  }

  updatePickups(dt) {
    for (const k of this.pickups) {
      k.life -= dt;
      k.vx *= Math.exp(-dt * 4);
      k.vy *= Math.exp(-dt * 4);
      const p = this.nearestAlive(k.x, k.y, 96);
      if (p) {
        const dx = p.x - k.x, dy = p.y - 8 - k.y, d = Math.hypot(dx, dy) || 1;
        const pull = 720 * (1 - d / 104);
        k.vx += (dx / d) * pull * dt * 2;
        k.vy += (dy / d) * pull * dt * 2;
        if (d < 18) {
          if (k.kind === 'f') this.gainWildfire(p, k.v);
          else p.hp = Math.min(p.max, p.hp + p.stats.emberHeal);
          k.life = 0;
          this.emit({ k: 'pick', id: p.id, kind: k.kind, x: Math.round(k.x), y: Math.round(k.y) });
        }
      }
      const pos = this.world.collide(k.x + k.vx * dt, k.y + k.vy * dt, 3);
      k.x = pos.x;
      k.y = pos.y;
    }
    this.pickups = this.pickups.filter((k) => k.life > 0);
  }

  updateWaves(dt) {
    this.waveT -= dt;
    if (this.waveT > 0) return;
    this.waveT = Math.max(16, 30 - this.stageTime / 12);
    if (this.enemies.length >= 24) return;
    const alive = this.alivePlayers();
    if (!alive.length) return;
    const p = alive[Math.floor(Math.random() * alive.length)];
    const pt = this.world.randomOpenPoint(R, p.x, p.y, 420, 660, 60);
    if (!pt) return;
    const n = 2 + Math.floor(this.stageTime / 100) + Math.floor((this.players.size - 1) / 2);
    const hpScale = (1 + 0.3 * (this.players.size - 1)) * (1 + 0.25 * (this.stage - 1));
    for (let i = 0; i < n; i++) {
      const e = this.spawnWolf(pt.x + R.float(-20, 20), pt.y + R.float(-20, 20), hpScale, Math.random() < ELITE.chance * 0.6);
      e.state = 'chase';
      e.target = p.id;
    }
    this.emit({ k: 'howl', x: pt.x, y: pt.y, far: 1 });
  }

  checkEnd() {
    const ps = [...this.players.values()];
    if (!ps.length) return;
    if (ps.every((p) => p.down)) {
      this.state = 'defeat';
      this.stateTimer = 6;
      this.hazards = [];
      this.emit({ k: 'defeat' });
      return;
    }
    if (this.scene === 'forest' && this.gateOpen) {
      const ex = this.world.exit;
      const alive = ps.filter((p) => !p.down);
      if (alive.every((p) => Math.hypot(p.x - ex.x, p.y - ex.y) < ex.r)) this.startRest();
    }
  }

  startRest() {
    this.state = 'rest';
    this.stateTimer = RULES.restTime;
    this.enemies = [];
    this.hazards = [];
    this.fires = [];
    this.pickups = [];
    for (const p of this.players.values()) {
      if (p.down) { p.down = false; p.hp = p.max * 0.5; }
      const pool = BOONS.map((b) => b.id);
      p.choices = [];
      while (p.choices.length < 3) {
        const b = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        p.choices.push(b);
      }
      p.picked = false;
    }
    this.emit({ k: 'rest' });
  }

  // ======================================================= snapshot
  snapshot() {
    let bb = null;
    for (const e of this.enemies) {
      if (e.type === 'treant' || (e.type === 'alpha' && e.state !== 'idle')) bb = { n: e.type === 'treant' ? TREANT.name : ALPHA.name, hp: Math.ceil(e.hp), mx: Math.ceil(e.max) };
    }
    return {
      t: 's',
      sv: this.sv,
      sc: this.scene,
      st: this.state,
      stg: this.stage,
      tm: Math.floor(this.runTime),
      cd: this.countdown > 0 ? Math.ceil(this.countdown) : 0,
      stt: Math.max(0, Math.ceil(this.stateTimer)),
      lvl: this.lvl,
      xp: Math.floor(this.xp),
      nx: xpToNext(this.lvl),
      go: this.gateOpen ? 1 : 0,
      sh: this.shrineUsed.map((u) => (u ? 1 : 0)),
      bb,
      ps: [...this.players.values()].map((p) => ({
        id: p.id, u: p.user, n: p.name, c: p.cloak, h: p.hat, f: p.flame, k: p.cls,
        x: r1(p.x), y: r1(p.y), a: r2(p.aim), m: p.moving ? 1 : 0, d: p.dashing ? 1 : 0,
        hp: Math.ceil(p.hp), mx: p.max, wf: Math.floor(p.wf), gl: p.glowT > 0 ? 1 : 0,
        dn: p.down ? 1 : 0, rv: r2(p.revive), hu: p.hurtT > 0 ? 1 : 0,
        g: p.guard ? 1 : 0, gc: Math.max(0, r1(p.guardCd)), qc: Math.max(0, r1(p.quakeCd)),
        pts: p.pts, tr: p.tree, bn: p.boons,
        bc: this.state === 'rest' && !p.picked ? p.choices : null,
      })),
      es: this.enemies.map((e) => ({
        id: e.id, t: e.type, x: r1(e.x), y: r1(e.y), s: STATE_CODE[e.state], fx: e.fx, dx: r2(e.dx), dy: r2(e.dy),
        hp: Math.ceil(e.hp), mx: Math.ceil(e.max), hu: e.hurtT > 0 ? 1 : 0, b: e.burnT > 0 ? 1 : 0,
        el: e.elite ? 1 : 0, sn: e.stun > 0 ? 1 : 0, sa: e.type === 'treant' ? r2(e.sa) : undefined,
      })),
      pk: this.pickups.map((k) => ({ id: k.id, k: k.kind, x: Math.round(k.x), y: Math.round(k.y) })),
      hz: this.hazards.map((h) => ({ id: h.id, k: h.kind, x: Math.round(h.x), y: Math.round(h.y), r: h.r, a: h.a, arc: h.arc, p: r2(Math.max(0, 1 - h.t / h.max)), done: h.done ? 1 : 0 })),
      fi: this.fires.map((f) => [f.x, f.y, r1(f.t)]),
    };
  }
}
