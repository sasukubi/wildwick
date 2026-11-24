// =============================================================
//  The simulation. ONLY the host runs this.
//  It decides enemies, damage, flame, EXP, Wildfire, pickups,
//  reviving, stages and bosses, then sends snapshots to everyone.
//  (Each player moves their own character; the host trusts that.)
//
//  Combat needs line of sight both ways: nobody can hit, notice
//  or attack through trees and rocks.
// =============================================================
import {
  WARRIOR, SORCERER, BOWMAN, ROGUE, WOLF, ELITE, ALPHA, TREANT, RULES, CLOAKS, HATS, FLAMES, CLASSES, BOONS,
  PLAYER_RADIUS, TILE, xpToNext, classStats, canBuy, weaveOf,
} from './data.js';
import { makeLobby, makeForest, makeArena } from './world.js';

const R = { float: (a, b) => a + Math.random() * (b - a) };
const STATE_CODE = { idle: 0, chase: 1, windup: 2, lunge: 3, recover: 4, sweep: 5, ret: 6 };
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
    this.zones = [];       // ground effects: pyre fire, firestorm, blizzard
    this.shots = [];       // fireballs, frost shards
    this.strikes = [];     // Starfall meteors on their way down
    this.decoys = [];      // Rogue afterimages that enemies chase
    this.flows = new Map();
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
  los(ax, ay, bx, by) { return this.world.lineOfSight(ax, ay - 8, bx, by - 8); }

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
    this.zones = [];
    this.shots = [];
    this.strikes = [];
    this.decoys = [];
    this.flows.clear();
    this.countdown = -1;
    this.stageTime = 0;
    this.gateOpen = false;
  }

  resetRunStats(p) {
    p.tree = {}; p.boons = []; p.pts = 0; p.wf = 0; p.choices = null; p.picked = false;
    this.recalc(p);
    p.hp = p.max;
    p.mana = p.stats.maxMana || 0;
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
    this.waveT = 32;
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
      const a = this.spawnAlpha(this.world.bossSpawn.x, this.world.bossSpawn.y, (1 + 0.3 * (np - 1)) * (1 + 0.25 * (n - 1)));
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
      if (fullHeal) { p.hp = p.max; p.mana = p.stats.maxMana || 0; }
      p.revive = 0; p.guard = false; p.glowT = 0;
      for (const k in p.cd) p.cd[k] = 0;
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
      x: 0, y: 0, aim: 0, aimD: 100, moving: false, dashing: false,
      hp: 100, max: 100, wf: 0, mana: 0,
      down: false, revive: 0, helper: null,
      cd: { atk: 0, s1: 0, s2: 0, s3: 0 },
      combo: 0, comboT: 0,
      guard: false, guardT: 0, guardHeat: 0, guardStart: 0, gHeld: false,
      lastEl: null, lastElT: -9,
      charge: 0, drawing: false, hawkT: 0, stabN: 0, ambushT: 0, tpLock: 0, vote: null,
      ac: null, sc: null, s2c: null, s3c: null, uc: null, ic: null, ah: false,
      want: { atk: 0, s1: 0, s2: 0, s3: 0, ult: 0, int: 0 },
      hurtT: 0, glowT: 0, lastSeen: performance.now(),
      tree: {}, boons: [], pts: 0, choices: null, picked: false, stats: null,
    };
    const cls = CLASSES.find((c) => c.id === ch.cls);
    if (cls && cls.available) p.cls = cls.id;
    this.recalc(p);
    p.hp = p.max;
    p.mana = p.stats.maxMana || 0;
    if (this.stage > 0) p.pts = this.lvl - 1;
    this.players.set(id, p);
    return p;
  }

  recalc(p) {
    const old = p.max || 100;
    p.stats = classStats(p.cls, p.tree, p.boons);
    p.max = p.stats.maxFlame;
    if (p.max > old && !p.down) p.hp += p.max - old;
    p.hp = Math.min(p.hp, p.max);
    if (p.stats.maxMana) p.mana = Math.min(p.mana ?? p.stats.maxMana, p.stats.maxMana);
  }

  removePlayer(id) { this.players.delete(id); this.flows.delete(id); }

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
      this.resetRunStats(p);
      return true;
    }
    return false;
  }

  buyNode(id, node) {
    const p = this.players.get(id);
    if (!p || !canBuy(p.cls, p.tree, p.pts, node)) return false;
    p.tree[node] = (p.tree[node] || 0) + 1;
    p.pts--;
    this.recalc(p);
    return true;
  }

  boonPool(p) { return BOONS.filter((b) => !b.cls || b.cls === p.cls).map((b) => b.id); }

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

  // between forests: 'go' (continue) or 'camp' (everyone returns to camp)
  vote(id, v) {
    const p = this.players.get(id);
    if (!p || this.state !== 'rest' || (v !== 'go' && v !== 'camp')) return;
    p.vote = v;
    this.emit({ k: 'vote', n: p.user, v });
  }

  applyInput(id, m) {
    const p = this.players.get(id);
    if (!p) return;
    p.lastSeen = performance.now();
    if (p.cls === 'rogue' && m.d && !p.dashing && !p.down && this.scene !== 'lobby') this.spawnDecoy(p);
    if (m.sv === this.sv && !p.down && p.tpLock <= 0 && Number.isFinite(m.x) && Number.isFinite(m.y)) {
      p.x = Math.max(0, Math.min(this.world.pw, m.x));
      p.y = Math.max(0, Math.min(this.world.ph, m.y));
    }
    if (Number.isFinite(m.aim)) p.aim = m.aim;
    if (Number.isFinite(m.ad)) p.aimD = Math.max(0, Math.min(400, m.ad));
    p.moving = !!m.m;
    p.dashing = !!m.d;
    p.ah = !!m.ah;
    p.gHeld = !!m.g;
    const edge = (key, want) => {
      if (m[key] === undefined) return;
      if (p[key] === null) p[key] = m[key];
      else if (m[key] > p[key]) { p.want[want] = 0.3; p[key] = m[key]; }
    };
    edge('ac', 'atk'); edge('sc', 's1'); edge('s2c', 's2'); edge('s3c', 's3'); edge('uc', 'ult'); edge('ic', 'int');
  }

  // ======================================================= update
  update(dt) {
    this.time += dt;
    const active = this.state === 'playing' || this.state === 'lobby';
    for (const p of this.players.values()) {
      for (const k in p.cd) p.cd[k] -= dt;
      for (const k in p.want) p.want[k] -= dt;
      p.comboT -= dt; p.hurtT -= dt; p.glowT -= dt; p.hawkT -= dt; p.ambushT -= dt; p.tpLock -= dt;
      if (p.stats.maxMana) p.mana = Math.min(p.stats.maxMana, p.mana + p.stats.manaRegen * dt);
      if (p.down || !active) { p.guard = false; p.drawing = false; p.charge = 0; continue; }
      if (p.stats.shroud && this.inSmoke(p.x, p.y)) p.hp = Math.min(p.max, p.hp + 3 * dt);
      if (p.cls === 'sorcerer') this.sorcererActions(p);
      else if (p.cls === 'bowman') this.bowmanActions(p, dt);
      else if (p.cls === 'rogue') this.rogueActions(p);
      else this.warriorActions(p, dt);
      if (p.want.ult > 0) { this.ultimate(p); p.want.ult = 0; }
      if (p.want.int > 0 && this.scene === 'forest') { this.useShrine(p); p.want.int = 0; }
    }
    this.updateRevives(dt);

    if (this.scene === 'lobby') this.updateLobby(dt);
    else if (this.state === 'playing') {
      this.stageTime += dt;
      this.runTime += dt;
      this.updateFlows();
      this.updateEnemies(dt);
      this.updateShots(dt);
      this.updateStrikes(dt);
      this.updateHazards(dt);
      this.updateZones(dt);
      this.updatePickups(dt);
      for (const d of this.decoys) d.t -= dt;
      this.decoys = this.decoys.filter((d) => d.t > 0);
      if (this.scene === 'forest') this.updateWaves(dt);
      this.checkEnd();
    } else if (this.state === 'rest') {
      this.stateTimer -= dt;
      const ps = [...this.players.values()];
      if (ps.some((p) => p.vote === 'camp')) {
        const who = ps.find((p) => p.vote === 'camp');
        this.emit({ k: 'msg', text: `${who.user} chose to return to camp.` });
        this.goLobby();
      } else if (ps.every((p) => p.picked && p.vote === 'go') || this.stateTimer <= 0) {
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
      p.helper = null;
      if (!p.down) continue;
      let helper = null;
      for (const o of this.players.values()) {
        if (o !== p && !o.down && Math.hypot(o.x - p.x, o.y - p.y) < RULES.reviveRange) helper = o;
      }
      if (helper && this.state === 'playing') {
        p.helper = helper.id;
        p.revive += dt / RULES.reviveTime;
        if (p.revive >= 1) {
          p.down = false;
          p.hp = RULES.reviveFlame;
          p.revive = 0;
          this.emit({ k: 'revive', id: p.id, by: helper.id, n: p.user, x: Math.round(p.x), y: Math.round(p.y) });
        }
      } else p.revive = Math.max(0, p.revive - dt * 0.5);
    }
  }

  // ======================================================= shared combat helpers
  power(p) { return (1 + (p.stats.furyMax || 0) * (1 - p.hp / p.max)) * p.stats.dmgMult; }

  // Hit every enemy in a cone in front of the player that they can actually see.
  hitArc(p, range, arc, dmg, kb, aim = p.aim, opts = {}) {
    if (this.scene === 'lobby') return 0;
    let hits = 0;
    const cx = p.x, cy = p.y - 8;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - cx, dy = e.y - 8 - cy;
      const d = Math.hypot(dx, dy);
      if (d > range + e.r) continue;
      if (d > e.r + 10 && Math.abs(angDiff(Math.atan2(dy, dx), aim)) > arc / 2) continue;
      if (!this.los(p.x, p.y, e.x, e.y)) continue;
      let hitDmg = dmg, el = opts.el;
      if (opts.backstab && this.isBehind(p, e)) { hitDmg *= 1 + opts.backstab; el = 'back'; if (p.stats.bleed) e.bleedT = 3; }
      this.damageEnemy(e, hitDmg, dx / (d || 1), dy / (d || 1), kb, p, false, el);
      if (opts.slow) { e.slowT = opts.slow; }
      hits++;
    }
    if (hits && p.stats.leech) p.hp = Math.min(p.max, p.hp + p.stats.leech * hits);
    return hits;
  }

  // Hit every enemy in a circle that the centre can see.
  hitCircle(p, x, y, r, dmg, kb, opts = {}) {
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > r + e.r) continue;
      if (!opts.fromSky && !this.world.lineOfSight(x, y - 4, e.x, e.y - 8)) continue;
      this.damageEnemy(e, dmg, dx / d, dy / d, e.type === 'treant' ? 0 : kb, p, false, opts.el);
      if (opts.stun && e.type !== 'treant') e.stun = Math.max(e.stun, opts.stun);
      if (opts.slow) e.slowT = Math.max(e.slowT, opts.slow);
      hits++;
    }
    if (hits && p && p.stats.leech) p.hp = Math.min(p.max, p.hp + p.stats.leech * hits);
    return hits;
  }

  // Is the player in the back half of this enemy?
  isBehind(p, e) {
    return Math.abs(angDiff(Math.atan2(p.y - e.y, p.x - e.x), e.face || 0)) > Math.PI / 2;
  }

  inSmoke(x, y) {
    for (const z of this.zones) if (z.kind === 'smoke' && Math.hypot(x - z.x, y - z.y) < z.r) return true;
    return false;
  }

  // a player or a Rogue decoy
  targetOf(id) {
    if (typeof id === 'string' && id.startsWith('decoy')) return this.decoys.find((d) => d.id === id) || null;
    return this.players.get(id) || null;
  }

  // The enemy closest to where the player is aiming (that they can see).
  aimedEnemy(p, range, maxAngle = 0.6) {
    let best = null, bs = 1e9;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > range) continue;
      const da = Math.abs(angDiff(Math.atan2(dy, dx), p.aim));
      if (da > maxAngle || !this.los(p.x, p.y, e.x, e.y)) continue;
      const score = da * 120 + d * 0.3;
      if (score < bs) { bs = score; best = e; }
    }
    return best;
  }

  // The furthest point along the aim (up to range) before a tree blocks it.
  aimPoint(p, range) {
    const d = Math.min(range, p.aimD);
    let x = p.x, y = p.y - 6;
    const ux = Math.cos(p.aim), uy = Math.sin(p.aim);
    for (let s = 0; s < d; s += 6) {
      const nx = p.x + ux * s, ny = p.y - 6 + uy * s;
      if (this.world.isSolid(Math.floor(nx / TILE), Math.floor(ny / TILE))) break;
      x = nx; y = ny;
    }
    return { x, y };
  }

  // ======================================================= Warrior
  warriorActions(p, dt) {
    this.updateGuard(p, dt);
    if (p.guard) return;
    if ((p.want.atk > 0 || p.ah) && p.cd.atk <= 0) { this.warriorStrike(p); p.want.atk = 0; }
    if ((p.want.s1 > 0 || p.want.s3 > 0) && p.cd.s1 <= 0) { this.quake(p); p.want.s1 = 0; p.want.s3 = 0; }
  }

  warriorStrike(p) {
    const S = p.stats;
    p.cd.atk = S.atkCd;
    p.combo = p.comboT > 0 ? (p.combo % 3) + 1 : 1;
    p.comboT = 1.1;
    const heavy = p.combo === 3;
    this.emit({ k: 'sw', id: p.id, a: r2(p.aim), h: heavy ? 1 : 0 });
    this.hitArc(p, WARRIOR.atkRange, WARRIOR.atkArc, WARRIOR.atkDmg * this.power(p) * (heavy ? S.heavyMult : 1), heavy ? 300 : 170);
  }

  quake(p) {
    const S = p.stats;
    const inStage = this.scene !== 'lobby';
    if (inStage && p.hp <= S.quakeCost) { p.cd.s1 = 0.3; this.emit({ k: 'nope', id: p.id, what: 'quake' }); return; }
    p.cd.s1 = S.quakeCd;
    if (inStage) p.hp -= S.quakeCost;
    this.emit({ k: 'slam', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r: Math.round(S.quakeRadius) });
    if (inStage) this.hitCircle(p, p.x, p.y, S.quakeRadius, S.quakeDmg * this.power(p), 380, { stun: 0.6 });
  }

  updateGuard(p, dt) {
    const W = WARRIOR;
    if (!p.guard) {
      if (p.gHeld && p.cd.s2 <= 0) {
        p.guard = true; p.guardT = 0; p.guardHeat = 0; p.guardStart = this.time;
        this.emit({ k: 'guardOn', id: p.id });
      }
      return;
    }
    p.guardT += dt;
    if (!p.gHeld || p.guardT >= W.guardMax) {
      p.guard = false;
      p.cd.s2 = p.stats.guardCd;
      const dmg = (W.counterBase + Math.min(W.heatCap, p.guardHeat) * W.counterPerHeat) * p.stats.counterMult * this.power(p);
      this.emit({ k: 'counter', id: p.id, a: r2(p.aim), pw: Math.min(1, p.guardHeat / 30) });
      this.hitArc(p, W.counterRange, W.counterArc, dmg, 280);
    }
  }

  // ======================================================= Sorcerer
  sorcererActions(p) {
    const S = SORCERER;
    if ((p.want.atk > 0 || p.ah) && p.cd.atk <= 0) {
      p.want.atk = 0;
      p.cd.atk = S.staffCd;
      this.emit({ k: 'staff', id: p.id, a: r2(p.aim) });
      this.hitArc(p, S.staffRange, S.staffArc, S.staffDmg * this.power(p), S.staffKb);
    }
    if (p.want.s1 > 0) { if (this.castSpell(p, 'fire')) p.want.s1 = 0; }
    if (p.want.s2 > 0) { if (this.castSpell(p, 'gale')) p.want.s2 = 0; }
    if (p.want.s3 > 0) { if (this.castSpell(p, 'frost')) p.want.s3 = 0; }
  }

  // Cast an element. If a different element was cast moments ago, the two fuse.
  castSpell(p, el) {
    const S = SORCERER, st = p.stats;
    const slot = el === 'fire' ? 's1' : el === 'gale' ? 's2' : 's3';
    if (p.cd[slot] > 0) return false;
    const fuse = p.lastEl && p.lastEl !== el && this.time - p.lastElT <= st.weaveWindow ? weaveOf(p.lastEl, el) : null;
    // weaving is strong, so it costs extra mana on top of the second spell
    const cost = S[el].cost + (fuse && this.scene !== 'lobby' ? st.weaveExtra : 0);
    if (p.mana < cost) { this.emit({ k: 'nope', id: p.id, what: 'mana', slot }); return true; }
    p.mana -= cost;
    p.cd[slot] = S[el].cd * st.spellCd;
    if (this.scene === 'lobby') { this.emit({ k: 'spell', id: p.id, el, a: r2(p.aim), x: Math.round(p.x), y: Math.round(p.y) }); return true; }
    if (fuse) {
      p.lastEl = null;
      p.cd.s1 = Math.max(p.cd.s1, 0.6); p.cd.s2 = Math.max(p.cd.s2, 0.6); p.cd.s3 = Math.max(p.cd.s3, 0.6);
      this.castWeave(p, fuse.id);
      this.emit({ k: 'weave', id: p.id, w: fuse.id, n: fuse.name });
      return true;
    }
    p.lastEl = el;
    p.lastElT = this.time;
    this.emit({ k: 'spell', id: p.id, el, a: r2(p.aim), x: Math.round(p.x), y: Math.round(p.y) });
    const pw = this.power(p);
    if (el === 'fire') {
      this.shots.push({ id: this.nextId++, kind: 'fire', owner: p.id, x: p.x + Math.cos(p.aim) * 10, y: p.y - 10 + Math.sin(p.aim) * 10,
        vx: Math.cos(p.aim) * S.fire.speed, vy: Math.sin(p.aim) * S.fire.speed, life: S.fire.range / S.fire.speed, dmg: S.fire.dmg * st.fireMult * pw, r: st.blastR });
    } else if (el === 'frost') {
      const n = st.shards;
      for (let i = 0; i < n; i++) {
        const a = p.aim + (i - (n - 1) / 2) * (S.frost.spread / Math.max(1, (n - 1) / 2));
        this.shots.push({ id: this.nextId++, kind: 'frost', owner: p.id, x: p.x + Math.cos(a) * 8, y: p.y - 10 + Math.sin(a) * 8,
          vx: Math.cos(a) * S.frost.speed, vy: Math.sin(a) * S.frost.speed, life: S.frost.range / S.frost.speed, dmg: S.frost.dmg * st.frostMult * pw, slow: st.slowT });
      }
    } else if (el === 'gale') {
      this.hitArc(p, S.gale.range, S.gale.arc, S.gale.dmg * st.galeMult * pw, S.gale.kb * st.galeMult);
    }
    return true;
  }

  castWeave(p, id) {
    const S = SORCERER, st = p.stats, pw = this.power(p);
    if (id === 'steam') {
      const pt = this.aimPoint(p, S.steam.range);
      this.emit({ k: 'steam', id: p.id, x: Math.round(pt.x), y: Math.round(pt.y), r: S.steam.r });
      this.hitCircle(p, pt.x, pt.y, S.steam.r, S.steam.dmg * st.fireMult * pw, 200, { stun: S.steam.stun, el: 'steam' });
    } else if (id === 'firestorm') {
      this.zones.push({ id: this.nextId++, kind: 'storm', owner: p.id, x: p.x + Math.cos(p.aim) * 20, y: p.y - 4 + Math.sin(p.aim) * 20,
        vx: Math.cos(p.aim) * S.firestorm.speed, vy: Math.sin(p.aim) * S.firestorm.speed, r: S.firestorm.r, t: st.stormT, max: st.stormT, dps: S.firestorm.dps * st.fireMult * pw });
    } else if (id === 'blizzard') {
      const pt = this.aimPoint(p, S.blizzard.range);
      this.zones.push({ id: this.nextId++, kind: 'blizzard', owner: p.id, x: pt.x, y: pt.y, vx: 0, vy: 0, r: st.blizzR, t: S.blizzard.t, max: S.blizzard.t, dps: S.blizzard.dps * st.frostMult * pw, slow: 0.5 });
    }
  }

  // ======================================================= Bowman
  bowmanActions(p, dt) {
    const B = BOWMAN, st = p.stats;
    if (p.want.s1 > 0 && p.cd.s1 <= 0) { p.want.s1 = 0; this.markTarget(p); }
    if (p.want.s2 > 0 && p.cd.s2 <= 0) { p.want.s2 = 0; this.rainOfArrows(p); }
    if (p.hawkT > 0) {
      // Hawk Eye: every shot is instantly full strength and seeks the nearest enemy
      p.drawing = false; p.charge = 0;
      if ((p.ah || p.want.atk > 0) && p.cd.atk <= 0) { p.want.atk = 0; this.fireArrow(p, 1, true); p.cd.atk = B.hawkRecover; }
      return;
    }
    if (p.cd.atk > 0) { if (!p.ah) p.drawing = false; return; }
    if (p.ah) {
      p.drawing = true;
      p.charge = Math.min(1, p.charge + dt / st.drawTime);
      p.want.atk = 0;
    } else if (p.drawing || p.want.atk > 0) {
      // let go: the longer you drew, the stronger the arrow (and the longer the wait)
      const c = Math.max(0.05, p.charge);
      this.fireArrow(p, c, false);
      p.cd.atk = (B.minRecover + (B.maxRecover - B.minRecover) * c) * st.recoverMult;
      p.drawing = false; p.charge = 0; p.want.atk = 0;
    }
  }

  fireArrow(p, c, homing) {
    const B = BOWMAN, st = p.stats;
    const full = c >= B.pierceAt;
    const dmg = (B.minDmg + (B.maxDmg - B.minDmg) * Math.pow(c, 1.3)) * st.arrowMult * this.power(p) * (full && st.deadeye ? 1.5 : 1);
    const speed = B.minSpeed + (B.maxSpeed - B.minSpeed) * c;
    const range = B.minRange + (B.maxRange - B.minRange) * c;
    this.emit({ k: 'shoot', id: p.id, c: r2(c), a: r2(p.aim) });
    if (this.scene === 'lobby') return;
    this.shots.push({ id: this.nextId++, kind: 'arrow', owner: p.id, x: p.x + Math.cos(p.aim) * 10, y: p.y - 12 + Math.sin(p.aim) * 10,
      vx: Math.cos(p.aim) * speed, vy: Math.sin(p.aim) * speed, life: range / speed, dmg, pierce: full, hit: new Set(), homing, power: c });
  }

  markTarget(p) {
    const st = p.stats;
    const e = this.aimedEnemy(p, BOWMAN.markRange, 0.7);
    if (!e) { p.cd.s1 = 0.4; this.emit({ k: 'nope', id: p.id, what: 'mark', slot: 's1' }); return; }
    for (const o of this.enemies) if (o.markBy === p.id) { o.markT = 0; o.markBy = null; }
    e.markT = st.markTime; e.markBonus = st.markBonus; e.markBy = p.id;
    p.cd.s1 = st.markCd;
    this.emit({ k: 'mark', id: p.id, x: Math.round(e.x), y: Math.round(e.y) });
  }

  rainOfArrows(p) {
    const st = p.stats;
    const c = this.aimPoint(p, BOWMAN.rainRange);
    p.cd.s2 = st.rainCd;
    this.emit({ k: 'rain', id: p.id, x: Math.round(c.x), y: Math.round(c.y), r: Math.round(st.rainR) });
    if (this.scene === 'lobby') return;
    this.zones.push({ id: this.nextId++, kind: 'rain', owner: p.id, x: c.x, y: c.y, vx: 0, vy: 0, r: st.rainR, t: BOWMAN.rainTime, max: BOWMAN.rainTime,
      dps: 0, tick: 0, every: BOWMAN.rainTime / st.rainArrows, dmg: BOWMAN.rainDmg * this.power(p) * st.arrowMult });
  }

  // ======================================================= Rogue
  rogueActions(p) {
    const G = ROGUE, st = p.stats;
    if (p.want.s1 > 0 && p.cd.s1 <= 0) { p.want.s1 = 0; this.shadowstep(p); }
    if (p.want.s2 > 0 && p.cd.s2 <= 0) { p.want.s2 = 0; this.smokeBomb(p); }
    if ((p.want.atk > 0 || p.ah) && p.cd.atk <= 0) {
      p.want.atk = 0;
      p.cd.atk = st.atkCd;
      p.stabN = (p.stabN % G.spinEvery) + 1;
      const amb = p.ambushT > 0 ? 1 + st.ambush : 1;
      p.ambushT = 0;
      if (p.stabN === G.spinEvery) {
        this.emit({ k: 'spin', id: p.id, r: Math.round(st.spinR) });
        this.hitArc(p, st.spinR, Math.PI * 2 + 0.1, G.spinDmg * st.spinMult * this.power(p) * amb, 260, p.aim, { backstab: st.backstab });
      } else {
        this.emit({ k: 'stab', id: p.id, a: r2(p.aim) });
        this.hitArc(p, G.stabRange, G.stabArc, G.stabDmg * st.stabMult * this.power(p) * amb, 160, p.aim, { backstab: st.backstab });
      }
    }
  }

  shadowstep(p) {
    const e = this.aimedEnemy(p, ROGUE.stepRange, 0.8);
    if (!e) { p.cd.s1 = 0.4; this.emit({ k: 'nope', id: p.id, what: 'step', slot: 's1' }); return; }
    const back = (e.face || 0) + Math.PI;
    let spot = null;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
      const x = e.x + Math.cos(back + off) * (e.r + 14), y = e.y + Math.sin(back + off) * (e.r + 14);
      if (!this.world.isSolid(Math.floor(x / TILE), Math.floor(y / TILE))) { spot = this.world.collide(x, y, PLAYER_RADIUS); break; }
    }
    if (!spot) { p.cd.s1 = 0.4; this.emit({ k: 'nope', id: p.id, what: 'step', slot: 's1' }); return; }
    const from = { x: Math.round(p.x), y: Math.round(p.y) };
    p.x = spot.x; p.y = spot.y;
    p.aim = Math.atan2(e.y - p.y, e.x - p.x);
    p.tpLock = 0.35;
    p.ambushT = 2;
    p.cd.s1 = p.stats.stepCd;
    this.emit({ k: 'tp', id: p.id, x: Math.round(p.x), y: Math.round(p.y), fx: from.x, fy: from.y, a: r2(p.aim) });
  }

  smokeBomb(p) {
    p.cd.s2 = p.stats.smokeCd;
    this.emit({ k: 'smoke', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r: Math.round(p.stats.smokeR) });
    if (this.scene === 'lobby') return;
    this.zones.push({ id: this.nextId++, kind: 'smoke', owner: p.id, x: p.x, y: p.y, vx: 0, vy: 0, r: p.stats.smokeR, t: p.stats.smokeTime, max: p.stats.smokeTime, dps: 0 });
  }

  spawnDecoy(p) {
    this.decoys.push({ id: 'decoy' + this.nextId++, owner: p.id, x: p.x, y: p.y, t: p.stats.decoyTime, down: false, phantom: p.stats.phantom, cloak: p.cloak });
  }

  popDecoy(d) {
    d.t = 0;
    this.emit({ k: 'decoyPop', x: Math.round(d.x), y: Math.round(d.y), boom: d.phantom ? 1 : 0 });
    if (d.phantom) this.hitCircle(this.players.get(d.owner) || null, d.x, d.y, 50, 25, 300);
  }

  // ======================================================= ultimates (Wildfire)
  ultimate(p) {
    if (p.wf < RULES.wildfireMax) { this.emit({ k: 'nope', id: p.id, what: 'ult' }); return; }
    if (this.scene === 'lobby') return;
    p.wf = 0;
    p.glowT = 2;
    if (p.cls === 'sorcerer') {
      const S = SORCERER.starfall;
      const c = this.aimPoint(p, S.range);
      this.emit({ k: 'starfall', id: p.id, x: Math.round(c.x), y: Math.round(c.y), r: S.r });
      // meteors lock on to the monsters inside the area (spread between them)
      const prey = this.enemies.filter((e) => !e.dead && Math.hypot(e.x - c.x, e.y - c.y) < S.r + e.r);
      for (let i = 0; i < p.stats.meteors; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * S.r;
        const tgt = prey.length ? prey[i % prey.length] : null;
        this.strikes.push({ id: this.nextId++, owner: p.id, tid: tgt ? tgt.id : null, cx: c.x, cy: c.y, area: S.r,
          x: tgt ? tgt.x : c.x + Math.cos(a) * d, y: tgt ? tgt.y : c.y + Math.sin(a) * d * 0.8,
          t: 0.6 + (i / p.stats.meteors) * S.t, dmg: S.dmg * this.power(p), r: S.hitR });
      }
      return;
    }
    if (p.cls === 'bowman') {
      p.hawkT = p.stats.hawkTime;
      p.cd.atk = 0;
      this.emit({ k: 'hawk', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
      return;
    }
    if (p.cls === 'rogue') {
      const G = ROGUE;
      const targets = this.enemies
        .filter((e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < G.cutsRange && this.los(p.x, p.y, e.x, e.y))
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
        .slice(0, p.stats.cutsTargets);
      const pts = targets.map((e) => [Math.round(e.x), Math.round(e.y - 8)]);
      this.emit({ k: 'cuts', id: p.id, x: Math.round(p.x), y: Math.round(p.y), pts });
      for (const e of targets) this.damageEnemy(e, G.cutsDmg * this.power(p) * (1 + p.stats.backstab), 0, 0, 0, p, false, 'back');
      return;
    }
    const W = WARRIOR;
    this.emit({ k: 'pyre', id: p.id, a: r2(p.aim), x: Math.round(p.x), y: Math.round(p.y) });
    this.hitArc(p, W.pyreRange, W.pyreArc, W.pyreDmg * this.power(p), 340);
    const life = W.pyreTrail * p.stats.trailMult;
    for (let i = 0; i <= 8; i++) {
      const a = p.aim - W.pyreArc / 2 + (W.pyreArc * i) / 8;
      for (const rr of [48, 92]) {
        const x = p.x + Math.cos(a) * rr, y = p.y - 6 + Math.sin(a) * rr;
        if (this.world.lineOfSight(p.x, p.y - 6, x, y)) this.zones.push({ id: this.nextId++, kind: 'pyre', owner: p.id, x: Math.round(x), y: Math.round(y), vx: 0, vy: 0, r: 22, t: life, max: life, dps: W.pyreTrailDps });
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
    if (p.dashing) { this.emit({ k: 'dodge', id: p.id, x: Math.round(p.x), y: Math.round(p.y) }); return false; }
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
      hit: false, homeX: pos.x, homeY: pos.y, wx: pos.x, wy: pos.y, target: null, unseen: 0,
      hurtT: 0, stun: 0, burnT: 0, slowT: 0, flank: Math.random() < 0.5 ? -1 : 1, dead: false, elite: false,
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
    e.dmg = ALPHA.dmg * (1 + 0.12 * (this.stage - 1));
    e.howlT = ALPHA.howlCd * 0.6;
    e.lungesLeft = 0;
    e.homeFlow = this.world.flowField(e.homeX, e.homeY);
    return e;
  }

  spawnTreant(x, y, hpScale) {
    const e = this.baseEnemy('treant', x, y, TREANT.r, TREANT.hp * hpScale);
    e.atkT = 2.5;
    e.phase = 0;
    e.sa = Math.PI / 2;
    return e;
  }

  damageEnemy(e, dmg, kx, ky, kb, src = null, silent = false, el = null) {
    if (e.dead) return;
    if (src && src.stats && src.stats.shatter && e.slowT > 0) dmg *= 1.3;
    if (e.markT > 0) {
      dmg *= 1 + (e.markBonus || BOWMAN.markBonus);
      const marker = this.players.get(e.markBy);
      if (!silent && marker && marker === src && marker.stats.predator) marker.hp = Math.min(marker.max, marker.hp + 2);
    }
    e.hp -= dmg;
    if (e.type !== 'treant') {
      const heavyFoe = e.type === 'alpha' ? 0.35 : 1;
      e.vx += kx * kb * heavyFoe;
      e.vy += ky * kb * heavyFoe;
    }
    if (!silent) {
      e.hurtT = 0.14;
      this.emit({ k: 'hit', x: Math.round(e.x), y: Math.round(e.y - e.r), d: Math.round(dmg), big: dmg >= 25 ? 1 : 0, by: src ? src.id : null, el, kx: r2(kx), ky: r2(ky) });
    }
    // getting hit (by someone it can see) makes it fight back
    if (src && src.id && (e.state === 'idle' || e.state === 'ret')) { e.state = 'chase'; e.target = src.id; e.unseen = 0; }
    if (kb >= 300 && e.state === 'windup' && e.type === 'wolf') { e.state = 'recover'; e.t = 0.5; }
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
      this.strikes = [];
      for (const o of this.enemies) if (o !== e) o.dead = true;
      this.emit({ k: 'victory', boss: 1 });
    }
    if (src && src.stats && src.stats.embersInDark && src.hp / src.max < 0.4) src.hp = Math.min(src.max, src.hp + 4);
  }

  // nearest living player (or Rogue decoy) this enemy can SEE. Smoke hides everyone.
  nearestVisible(e, maxD) {
    if (e.smoked) return null;
    let best = null, bd = maxD;
    for (const p of this.players.values()) {
      if (p.down || this.inSmoke(p.x, p.y)) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < bd && this.los(e.x, e.y, p.x, p.y)) { bd = d; best = p; }
    }
    for (const dc of this.decoys) {
      const d = Math.hypot(dc.x - e.x, dc.y - e.y) * 0.6; // decoys are extra tempting
      if (d < bd && this.los(e.x, e.y, dc.x, dc.y)) { bd = d; best = dc; }
    }
    return best;
  }

  canSee(e, t) { return !!t && !e.smoked && !this.inSmoke(t.x, t.y) && this.los(e.x, e.y, t.x, t.y); }

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
      if (o !== e && o.state === 'idle' && o.type === 'wolf' && Math.hypot(o.x - e.x, o.y - e.y) < 220 && this.los(o.x, o.y, e.x, e.y)) { o.state = 'chase'; o.target = targetId; o.unseen = 0; }
    }
  }

  // path maps towards each player, refreshed a few times a second
  updateFlows() {
    for (const p of this.players.values()) {
      const tile = Math.floor(p.x / TILE) + ',' + Math.floor(p.y / TILE);
      const f = this.flows.get(p.id);
      if (!f || (f.tile !== tile && this.time - f.t > 0.3)) this.flows.set(p.id, { tile, t: this.time, dist: this.world.flowField(p.x, p.y) });
    }
  }

  steerTo(e, tx, ty, flowDist) {
    if (this.world.lineOfSight(e.x, e.y, tx, ty)) {
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
      return [dx / d, dy / d];
    }
    return (flowDist && this.world.flowDir(flowDist, e.x, e.y)) || [0, 0];
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t -= dt; e.cd -= dt; e.hurtT -= dt; e.stun -= dt; e.burnT -= dt; e.slowT -= dt;
      e.markT = (e.markT || 0) - dt;
      if (e.bleedT > 0) { e.bleedT -= dt; this.damageEnemy(e, 8 * dt, 0, 0, 0, null, true); if (e.dead) continue; }
      e.smoked = this.inSmoke(e.x, e.y);
      if (e.type === 'treant') this.updateTreant(e, dt);
      else this.updateWolfLike(e, dt);
    }
  }

  updateWolfLike(e, dt) {
    const D = e.def;
    let tvx = 0, tvy = 0;
    const tgt = e.target ? this.targetOf(e.target) : null;
    const ok = tgt && !tgt.down && (tgt.t === undefined || tgt.t > 0);
    const slow = e.smoked ? 0.2 : e.slowT > 0 ? 0.5 : 1;
    const seeTgt = ok && this.canSee(e, tgt);
    if (e.type === 'alpha' && (e.state === 'chase' || e.state === 'windup')) {
      e.howlT -= dt;
      if (e.howlT <= 0 && seeTgt) {
        e.howlT = ALPHA.howlCd;
        for (let i = 0; i < 2; i++) {
          const w = this.spawnWolf(e.x + R.float(-30, 30), e.y + R.float(-30, 30), 1 + 0.3 * (this.players.size - 1), false);
          w.state = 'chase'; w.target = e.target;
        }
        this.emit({ k: 'howl', x: Math.round(e.x), y: Math.round(e.y) });
      }
    }
    if (e.stun <= 0) {
      switch (e.state) {
        case 'idle': {
          const best = this.nearestVisible(e, D.aggro);
          if (best) {
            e.target = best.id; e.state = 'chase'; e.unseen = 0;
            this.alertPack(e, best.id);
            this.emit({ k: e.type === 'alpha' ? 'howl' : 'growl', x: Math.round(e.x), y: Math.round(e.y) });
            break;
          }
          // wander around home on its own
          if (e.t <= 0 || Math.hypot(e.wx - e.x, e.wy - e.y) < 6) {
            e.t = R.float(2, 5);
            const pt = Math.random() < 0.25 ? { x: e.x, y: e.y } : this.world.randomOpenPoint(R, e.homeX, e.homeY, 20, D.wanderRadius, 8);
            if (pt) { e.wx = pt.x; e.wy = pt.y; }
          }
          const dx = e.wx - e.x, dy = e.wy - e.y, d = Math.hypot(dx, dy);
          if (d > 6) { tvx = (dx / d) * D.wanderSpeed; tvy = (dy / d) * D.wanderSpeed; }
          break;
        }
        case 'ret': {
          // the Alpha walks home and slowly (very slightly) heals
          e.hp = Math.min(e.max, e.hp + e.max * D.homeHeal * dt);
          const dx = e.homeX - e.x, dy = e.homeY - e.y, d = Math.hypot(dx, dy);
          if (d < 16) { e.state = 'idle'; e.target = null; break; }
          const [ux, uy] = this.steerTo(e, e.homeX, e.homeY, e.homeFlow);
          tvx = ux * D.chaseSpeed; tvy = uy * D.chaseSpeed;
          break;
        }
        case 'chase': {
          if (!ok) {
            const nb = this.nearestVisible(e, D.aggro * 1.5);
            if (nb) { e.target = nb.id; e.unseen = 0; }
            else this.giveUp(e);
            break;
          }
          e.unseen = seeTgt ? 0 : e.unseen + dt;
          if (e.unseen > D.giveUp) { this.giveUp(e); break; }
          if (D.leash && Math.hypot(tgt.x - e.homeX, tgt.y - e.homeY) > D.leash) { e.state = 'ret'; break; }
          const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
          if (seeTgt && d < D.lungeRange && e.cd <= 0) {
            e.state = 'windup'; e.t = D.windup; e.dx = dx / d; e.dy = dy / d;
            if (e.type === 'alpha') e.lungesLeft = ALPHA.lunges;
            this.emit({ k: 'growl', x: Math.round(e.x), y: Math.round(e.y), big: e.type === 'alpha' ? 1 : 0 });
            break;
          }
          let [ux, uy] = this.steerTo(e, tgt.x, tgt.y, this.flows.get(tgt.id)?.dist);
          if (seeTgt && d < 160) {
            const px = -uy * e.flank, py = ux * e.flank;
            const back = d < 60 && e.cd > 0 ? -0.6 : 0.75;
            ux = ux * back + px * 0.6;
            uy = uy * back + py * 0.6;
            const l = Math.hypot(ux, uy) || 1;
            ux /= l; uy /= l;
          }
          tvx = ux * D.chaseSpeed * e.spd * slow;
          tvy = uy * D.chaseSpeed * e.spd * slow;
          break;
        }
        case 'windup': {
          if (ok && e.t > 0.2 && seeTgt) {
            const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
            e.dx = dx / d; e.dy = dy / d;
          }
          if (e.t <= 0) { e.state = 'lunge'; e.t = D.lungeTime; e.hit = false; }
          break;
        }
        case 'lunge': {
          tvx = e.dx * D.lungeSpeed * e.spd * slow;
          tvy = e.dy * D.lungeSpeed * e.spd * slow;
          if (!e.hit) {
            for (const p of this.alivePlayers()) {
              if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + PLAYER_RADIUS + 4) {
                e.hit = true;
                this.hurtPlayer(p, e.dmg, e.x, e.y, true, e);
                break;
              }
            }
            for (const d of this.decoys) {
              if (!e.hit && d.t > 0 && Math.hypot(d.x - e.x, d.y - e.y) < e.r + PLAYER_RADIUS + 4) { e.hit = true; this.popDecoy(d); }
            }
          }
          if (e.t <= 0) {
            if (e.type === 'alpha' && --e.lungesLeft > 0) { e.state = 'windup'; e.t = 0.45; }
            else { e.state = 'recover'; e.t = D.recover; }
          }
          break;
        }
        case 'recover': {
          if (e.t <= 0) { e.state = 'chase'; e.cd = R.float(0.8, 1.6); }
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
    const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
    const pos = this.world.collide(nx, ny, e.r);
    if (e.state === 'lunge' && Math.hypot(pos.x - nx, pos.y - ny) > 2) { e.state = 'recover'; e.t = D.recover; } // bonked into a tree
    e.x = pos.x;
    e.y = pos.y;
    if (e.state === 'windup' || e.state === 'lunge') { e.fx = e.dx >= 0 ? 1 : -1; e.face = Math.atan2(e.dy, e.dx); }
    else {
      if (Math.abs(e.vx) > 5) e.fx = e.vx > 0 ? 1 : -1;
      // which way it's looking (for backstabs): at its target, otherwise where it walks
      const want = ok && seeTgt ? Math.atan2(tgt.y - e.y, tgt.x - e.x) : Math.hypot(e.vx, e.vy) > 8 ? Math.atan2(e.vy, e.vx) : e.face || 0;
      const turn = e.smoked ? 0.6 : 6; // smoke makes them turn very slowly
      e.face = (e.face || 0) + Math.max(-turn * 0.016, Math.min(turn * 0.016, angDiff(want, e.face || 0)));
    }
  }

  giveUp(e) {
    e.target = null;
    if (e.def && e.def.leash) { e.state = 'ret'; return; }
    e.state = 'idle';
    e.homeX = e.x; e.homeY = e.y;
    e.t = 0;
  }

  updateTreant(e, dt) {
    const T = TREANT;
    e.atkT -= dt;
    const alive = this.alivePlayers();
    const frac = e.hp / e.max;
    if ((e.phase === 0 && frac < 0.66) || (e.phase === 1 && frac < 0.33)) {
      e.phase++;
      const tgt0 = this.nearestAlive(e.x, e.y, 3000);
      const n = 3 + this.players.size;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = this.spawnWolf(e.x + Math.cos(a) * 90, e.y + 40 + Math.sin(a) * 60, 1 + 0.3 * (this.players.size - 1), i === 0);
        w.state = 'chase';
        w.target = tgt0 ? tgt0.id : null;
      }
      this.emit({ k: 'roar', x: Math.round(e.x), y: Math.round(e.y) });
    }
    // only fights people it can see; walks home (healing a tiny bit) if everyone is far away
    const seen = alive.filter((p) => !this.inSmoke(p.x, p.y) && this.los(e.x, e.y, p.x, p.y) && Math.hypot(p.x - e.homeX, p.y - e.homeY) < T.leash + 200);
    if (e.state === 'sweep') {
      e.t -= dt;
      if (e.t <= 0) {
        for (const p of alive) {
          const dx = p.x - e.x, dy = p.y - e.y;
          if (Math.hypot(dx, dy) < T.sweepRange + PLAYER_RADIUS && Math.abs(angDiff(Math.atan2(dy, dx), e.sa)) < T.sweepArc / 2 && this.los(e.x, e.y, p.x, p.y)) {
            this.hurtPlayer(p, T.sweepDmg, e.x, e.y, true, e);
          }
        }
        this.emit({ k: 'sweep', x: Math.round(e.x), y: Math.round(e.y), a: r2(e.sa) });
        e.state = 'idle';
        e.atkT = T.attackCd;
      }
      return;
    }
    if (!seen.length) {
      const dx = e.homeX - e.x, dy = e.homeY - e.y, d = Math.hypot(dx, dy);
      e.hp = Math.min(e.max, e.hp + e.max * T.homeHeal * dt);
      e.state = d > 10 ? 'ret' : 'idle';
      if (d > 10) {
        const pos = this.world.collide(e.x + (dx / d) * T.speed * dt, e.y + (dy / d) * T.speed * dt, e.r);
        e.x = pos.x; e.y = pos.y;
      }
      return;
    }
    e.state = 'idle';
    let tgt = seen[0], bd = 1e9;
    for (const p of seen) { const d = Math.hypot(p.x - e.x, p.y - e.y); if (d < bd) { bd = d; tgt = p; } }
    const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 100 && Math.hypot(e.x - e.homeX, e.y - e.homeY) < T.leash) {
      const pos = this.world.collide(e.x + (dx / d) * T.speed * dt, e.y + (dy / d) * T.speed * dt, e.r);
      e.x = pos.x; e.y = pos.y;
    }
    e.fx = dx >= 0 ? 1 : -1;
    e.face = Math.atan2(dy, dx);
    if (e.atkT > 0) return;
    if (d < T.sweepRange * 0.9 && Math.random() < 0.6) {
      e.state = 'sweep';
      e.t = T.sweepWindup;
      e.sa = Math.atan2(dy, dx);
      this.hazards.push({ id: this.nextId++, kind: 'cone', x: e.x, y: e.y, a: e.sa, arc: T.sweepArc, r: T.sweepRange, t: T.sweepWindup, life: T.sweepWindup, max: T.sweepWindup });
    } else {
      for (const p of seen) {
        this.hazards.push({ id: this.nextId++, kind: 'root', x: p.x + R.float(-14, 14), y: p.y + R.float(-14, 14), r: T.rootR, t: T.rootDelay, life: T.rootDelay + 0.4, max: T.rootDelay, dmg: T.rootDmg });
      }
      this.emit({ k: 'rootsCall', x: Math.round(e.x), y: Math.round(e.y) });
      e.atkT = T.attackCd;
    }
  }

  // ======================================================= projectiles, meteors, zones
  updateShots(dt) {
    for (const s of this.shots) {
      s.life -= dt;
      if (s.homing) {
        // Hawk Eye arrows curve towards the nearest enemy they can see
        let best = null, bd = 220;
        for (const e of this.enemies) {
          if (e.dead || s.hit.has(e.id)) continue;
          const d = Math.hypot(e.x - s.x, e.y - 8 - s.y);
          if (d < bd && this.world.lineOfSight(s.x, s.y, e.x, e.y - 8)) { bd = d; best = e; }
        }
        if (best) {
          const sp = Math.hypot(s.vx, s.vy), a = Math.atan2(s.vy, s.vx);
          const want = Math.atan2(best.y - 8 - s.y, best.x - s.x);
          const na = a + Math.max(-8 * dt, Math.min(8 * dt, angDiff(want, a)));
          s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
        }
      }
      const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
      const owner = this.players.get(s.owner) || null;
      let hit = this.world.isSolid(Math.floor(nx / TILE), Math.floor(ny / TILE));
      let target = null;
      if (!hit) for (const e of this.enemies) {
        if (!e.dead && !(s.hit && s.hit.has(e.id)) && Math.hypot(e.x - nx, e.y - 8 - ny) < e.r + 5) { target = e; hit = true; break; }
      }
      s.x = nx; s.y = ny;
      if (s.kind === 'arrow') {
        if (target) {
          const d = Math.hypot(s.vx, s.vy) || 1;
          s.hit.add(target.id);
          this.damageEnemy(target, s.dmg, s.vx / d, s.vy / d, 60 + 200 * s.power, owner, false, s.power >= BOWMAN.pierceAt ? 'pierce' : null);
          if (owner && owner.stats.leech) owner.hp = Math.min(owner.max, owner.hp + owner.stats.leech);
          if (s.pierce) continue; // full-strength arrows fly on through the whole line
          s.life = 0;
        } else if (hit || s.life <= 0) { s.life = 0; this.emit({ k: 'thunk', x: Math.round(s.x), y: Math.round(s.y) }); }
        continue;
      }
      if (hit || s.life <= 0) {
        s.life = 0;
        if (s.kind === 'fire') {
          this.emit({ k: 'boom', x: Math.round(s.x), y: Math.round(s.y), r: Math.round(s.r) });
          this.hitCircle(owner, s.x, s.y, s.r, s.dmg, 160, { el: 'fire' });
        } else if (target) {
          const d = Math.hypot(s.vx, s.vy) || 1;
          this.damageEnemy(target, s.dmg, s.vx / d, s.vy / d, 80, owner, false, 'frost');
          target.slowT = Math.max(target.slowT, s.slow);
        } else this.emit({ k: 'shatter', x: Math.round(s.x), y: Math.round(s.y) });
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  updateStrikes(dt) {
    for (const s of this.strikes) {
      s.t -= dt;
      if (s.tid) {
        // follow the monster it's locked on to (while it stays near the area)
        const e = this.enemies.find((o) => o.id === s.tid && !o.dead);
        if (e && Math.hypot(e.x - s.cx, e.y - s.cy) < s.area * 1.6) { s.x = e.x; s.y = e.y; }
        else {
          const next = this.enemies.find((o) => !o.dead && Math.hypot(o.x - s.cx, o.y - s.cy) < s.area);
          s.tid = next ? next.id : null;
        }
      }
      if (s.t <= 0 && !s.done) {
        s.done = true;
        this.emit({ k: 'meteor', x: Math.round(s.x), y: Math.round(s.y) });
        this.hitCircle(this.players.get(s.owner) || null, s.x, s.y, s.r, s.dmg, 200, { fromSky: true, el: 'fire' });
      }
    }
    this.strikes = this.strikes.filter((s) => !s.done);
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

  updateZones(dt) {
    for (const z of this.zones) {
      z.t -= dt;
      if (z.vx || z.vy) {
        const nx = z.x + z.vx * dt, ny = z.y + z.vy * dt;
        if (this.world.isSolid(Math.floor(nx / TILE), Math.floor(ny / TILE))) { z.vx *= -0.6; z.vy *= -0.6; }
        else { z.x = nx; z.y = ny; }
      }
      const owner = this.players.get(z.owner) || null;
      if (z.kind === 'smoke') continue; // smoke works through inSmoke()
      if (z.kind === 'rain') {
        z.tick -= dt;
        while (z.tick <= 0 && z.t > 0) {
          z.tick += z.every;
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * z.r;
          const x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d * 0.7;
          this.hitCircle(owner, x, y, 18, z.dmg, 60, { fromSky: true });
        }
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - z.x, e.y - z.y);
        if (d > z.r + e.r * 0.5) continue;
        if (z.kind === 'blizzard') e.slowT = Math.max(e.slowT, 0.3);
        else e.burnT = 0.2;
        if (z.kind === 'storm' && e.type !== 'treant' && d > 4) { e.vx += ((z.x - e.x) / d) * 200 * dt; e.vy += ((z.y - e.y) / d) * 200 * dt; }
        this.damageEnemy(e, z.dps * dt, 0, 0, 0, owner, true);
      }
    }
    this.zones = this.zones.filter((z) => z.t > 0);
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
    this.waveT = Math.max(18, 34 - this.stageTime / 12);
    if (this.enemies.length >= 22) return;
    const alive = this.alivePlayers();
    if (!alive.length) return;
    const p = alive[Math.floor(Math.random() * alive.length)];
    const pt = this.world.randomOpenPoint(R, p.x, p.y, 420, 660, 60);
    if (!pt) return;
    const n = 2 + Math.floor(this.stageTime / 110) + Math.floor((this.players.size - 1) / 2);
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
      this.strikes = [];
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
    this.zones = [];
    this.shots = [];
    this.strikes = [];
    this.pickups = [];
    for (const p of this.players.values()) {
      if (p.down) { p.down = false; p.hp = p.max * 0.5; }
      const pool = this.boonPool(p);
      p.choices = [];
      while (p.choices.length < 3 && pool.length) p.choices.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      p.picked = false;
      p.vote = null;
    }
    this.decoys = [];
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
        mn: Math.floor(p.mana || 0), mm: p.stats.maxMana || 0,
        dn: p.down ? 1 : 0, rv: r2(p.revive), rh: p.helper, hu: p.hurtT > 0 ? 1 : 0,
        g: p.guard ? 1 : 0, c1: Math.max(0, r1(p.cd.s1)), c2: Math.max(0, r1(p.cd.s2)), c3: Math.max(0, r1(p.cd.s3)),
        le: p.lastEl && this.time - p.lastElT <= p.stats.weaveWindow ? p.lastEl : null,
        lt: p.lastEl ? r2(Math.max(0, p.stats.weaveWindow - (this.time - p.lastElT))) : 0,
        pts: p.pts, tr: p.tree, bn: p.boons,
        bc: this.state === 'rest' && !p.picked ? p.choices : null,
        vt: p.vote, pk: p.picked ? 1 : 0,
        ch: p.drawing ? r2(p.charge) : 0, hk: Math.max(0, r1(p.hawkT)), ca: Math.max(0, r2(p.cd.atk)),
      })),
      dc: this.decoys.map((d) => ({ x: Math.round(d.x), y: Math.round(d.y), c: d.cloak, t: r1(d.t) })),
      es: this.enemies.map((e) => ({
        id: e.id, t: e.type, x: r1(e.x), y: r1(e.y), s: STATE_CODE[e.state], fx: e.fx, dx: r2(e.dx), dy: r2(e.dy),
        hp: Math.ceil(e.hp), mx: Math.ceil(e.max), hu: e.hurtT > 0 ? 1 : 0, b: e.burnT > 0 ? 1 : 0, sl: e.slowT > 0 ? 1 : 0,
        el: e.elite ? 1 : 0, sn: e.stun > 0 ? 1 : 0, mk: e.markT > 0 ? 1 : 0, fa: r2(e.face || 0), sm: e.smoked ? 1 : 0, bl: e.bleedT > 0 ? 1 : 0,
      })),
      pk: this.pickups.map((k) => ({ id: k.id, k: k.kind, x: Math.round(k.x), y: Math.round(k.y) })),
      hz: this.hazards.map((h) => ({ id: h.id, k: h.kind, x: Math.round(h.x), y: Math.round(h.y), r: h.r, a: h.a, arc: h.arc, p: r2(Math.max(0, 1 - h.t / h.max)), done: h.done ? 1 : 0 })),
      zn: this.zones.map((z) => ({ id: z.id, k: z.kind, x: Math.round(z.x), y: Math.round(z.y), r: Math.round(z.r), t: r1(z.t), mx: z.max })),
      sp: this.shots.map((s) => ({ id: s.id, k: s.kind, x: Math.round(s.x), y: Math.round(s.y), a: r2(Math.atan2(s.vy, s.vx)) })),
      sf: this.strikes.map((s) => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y), t: r2(s.t), r: s.r })),
    };
  }
}
