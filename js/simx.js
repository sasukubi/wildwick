// =============================================================
//  More of the simulation (host only), added to the Sim class:
//  permanent class progress, prestige, coins + items, run modes
//  (casual / daily / endless), forest events, new enemies,
//  combos, shared Wildfire, duels, chat and the dev console.
// =============================================================
import {
  WOLF, ELITE, ALPHA, TREANT, RULES, CLASSES, TREES, PLAYER_RADIUS, PACE, TOUGH, WARRIOR,
  canBuy, treeNode, branchSpent, CAP_REQUIREMENT,
} from './data.js';
import { makeForest, makeArena } from './world.js';
import {
  MAX_LEVEL, xpNeed, isDev, emptyProgress, cleanAllProgress, pointsLeft, REBIRTHS, REBIRTH_EVERY, SLOTS,
  SHOP, cleanItems, COIN_DROPS, EVENTS, todayKey, hashStr,
} from './progress.js';

const R = { float: (a, b) => a + Math.random() * (b - a) };
const r2 = (v) => Math.round(v * 100) / 100;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// ---- New enemies --------------------------------------------
// Wisps: tiny lights that dive at your flame and burst, dimming your light for a moment.
export const WISP = {
  r: 6, hp: 12, aggro: 300, chaseSpeed: 150 * PACE, lungeRange: 80, windup: 0.35, lungeTime: 0.28 / PACE, lungeSpeed: 360 * PACE,
  recover: 0.5, dmg: 5 * TOUGH.dmg, xp: 2, wanderRadius: 120, wanderSpeed: 50 * PACE, giveUp: 4,
};
// Mossbacks: slow armoured beetles. From the front they barely take damage; hit them from behind.
export const MOSSBACK = {
  r: 14, hp: Math.round(150 * TOUGH.enemyHp), aggro: 220, chaseSpeed: 62 * PACE, lungeRange: 90, windup: 0.9, lungeTime: 0.45 / PACE, lungeSpeed: 300 * PACE,
  recover: 1.3, dmg: 18 * TOUGH.dmg, xp: 14, wanderRadius: 100, wanderSpeed: 22 * PACE, giveUp: 6, front: 0.2,
};
// Shamans: stay behind the pack, heal and shield wolves, and call thorn snares under you.
export const SHAMAN = {
  r: 11, hp: Math.round(70 * TOUGH.enemyHp), aggro: 280, speed: 80 * PACE, keep: 170, healCd: 5, healR: 170, heal: 0.2,
  snareCd: 3.2, snareR: 24, snareDmg: 9 * TOUGH.dmg, xp: 16,
};
// The Bramble Widow: a mini boss that can guard the gate instead of the Alpha. Webs root you in place.
export const WIDOW = {
  name: 'Bramble Widow', r: 18, hp: Math.round(300 * TOUGH.enemyHp), aggro: 300, chaseSpeed: 96 * PACE, lungeRange: 130, windup: 0.75,
  lungeTime: 0.34 / PACE, lungeSpeed: 380 * PACE, recover: 1.2, dmg: 15 * TOUGH.dmg, xp: 90, fuel: 60,
  wanderRadius: 90, wanderSpeed: 30 * PACE, giveUp: 6, leash: 380, homeHeal: 0.005,
  webCd: 5.5, webR: 30, webDelay: 0.9, webRoot: 1.3, webDmg: 6,
};

// which ability each piece of code belongs to (for prestige bonuses)
const WRAP = {
  warriorActions: 'atk', quake: 's1', updateGuard: 's2', dashShove: 'dash',
  sorcererActions: 'atk', bowmanActions: 'atk', markTarget: 's1', rainOfArrows: 's2', rollShot: 'dash',
  rogueActions: 'atk', smokeBomb: 's1', shadowstep: 's2', spawnDecoy: 'dash',
  clericActions: 'atk', mendingLight: 's1', judgement: 's2', sanctify: 's3', blessedStep: 'dash',
  warlockActions: 'atk', graspingHands: 's1', summonImps: 's2', soulSiphon: 's3', updateSiphon: 's3',
  ultimate: 'ult', dawn: 'ult', eclipse: 'ult', battleCry: 's3',
};

const X = {
  // =================================================== progress
  initProgress(p, ch) {
    p.prog = cleanAllProgress(ch.prog);
    p.coins = Math.max(0, Math.floor(+ch.coins || 0));
    p.items = cleanItems(ch.items);
    this.loadClass(p);
  },
  loadClass(p) {
    if (!p.prog[p.cls]) p.prog[p.cls] = emptyProgress();
    p.cp = p.prog[p.cls];
    p.tree = p.cp.tree;
  },
  nearProp(p, type, r) {
    if (this.scene !== 'lobby') return false;
    const o = this.world.props.find((q) => q.type === type);
    return !!o && Math.hypot(o.x - p.x, o.y - p.y) < r;
  },

  // EXP goes to every player's own class level
  grantXp(v) {
    let scholar = 0;
    for (const p of this.players.values()) scholar += p.boons.filter((b) => b === 'scholar').length;
    const gain = v * TOUGH.xp * (1 + 0.25 * scholar) * (this.event === 'bloodmoon' ? 1.3 : 1);
    for (const p of this.players.values()) this.addXp(p, gain);
  },
  addXp(p, gain) {
    const c = p.cp;
    if (c.lv >= MAX_LEVEL) { c.xp = 0; return; }
    c.xp += gain;
    while (c.lv < MAX_LEVEL && c.xp >= xpNeed(c.lv)) {
      c.xp -= xpNeed(c.lv);
      c.lv++;
      this.emit({ k: 'lvl', id: p.id, lvl: c.lv, n: p.user });
    }
    if (c.lv >= MAX_LEVEL) c.xp = 0;
  },

  // skill points can only be spent at the Skilltree in camp
  buyNode(id, node) {
    const p = this.players.get(id);
    if (!p || !this.nearProp(p, 'skilltree', 120) || !canBuy(p.cls, p.tree, pointsLeft(p.cp), node)) return false;
    p.tree[node] = (p.tree[node] || 0) + 1;
    this.recalc(p);
    this.emit({ k: 'treeBuy', id: p.id });
    return true;
  },
  // a Reclaim Seed takes back one spent point
  reclaimNode(id, node) {
    const p = this.players.get(id);
    if (!p || !this.nearProp(p, 'skilltree', 120) || !(p.items.seed > 0) || !(p.tree[node] > 0)) return false;
    const f = treeNode(p.cls, node);
    if (!f) return false;
    // can't pull a point out from under a capstone you still have
    const cap = f.branch.nodes.find((n) => n.cap);
    if (!f.node.cap && cap && p.tree[cap.id] && branchSpent(p.tree, f.branch) - 1 - p.tree[cap.id] < CAP_REQUIREMENT) return false;
    p.tree[node]--;
    if (!p.tree[node]) delete p.tree[node];
    p.items.seed--;
    this.recalc(p);
    this.emit({ k: 'reclaim', id: p.id });
    return true;
  },
  // level 30: start over at level 1 with an empty tree, keeping a permanent upgrade
  prestige(id, slot, reb) {
    const p = this.players.get(id);
    if (!p || !this.nearProp(p, 'skilltree', 120) || p.cp.lv < MAX_LEVEL) return false;
    if (!SLOTS[p.cls].some((s) => s[0] === slot)) return false;
    const c = p.cp;
    const rebirth = (c.np + 1) % REBIRTH_EVERY === 0;
    if (rebirth && !REBIRTHS.some((r) => r.id === reb)) return false;
    c.np++;
    c.pres[slot] = (c.pres[slot] || 0) + 1;
    if (rebirth) c.reb[reb] = (c.reb[reb] || 0) + 1;
    c.lv = 1; c.xp = 0; c.tree = {};
    this.loadClass(p);
    this.recalc(p);
    p.hp = p.max;
    this.emit({ k: 'prestige', id: p.id, n: p.user, np: c.np, rebirth: rebirth ? 1 : 0, x: Math.round(p.x), y: Math.round(p.y) });
    return true;
  },

  // =================================================== coins, shop, items
  dropCoins(e) {
    const d = COIN_DROPS[e.type];
    if (!d || e.type === 'dummy') return;
    let n = d[1] * (e.elite ? 4 : 1);
    if (Math.random() > d[0]) return;
    if (this.event === 'goldrush') n *= 2;
    // big piles split into a few specks
    const specks = Math.min(6, Math.max(1, Math.ceil(n / 4)));
    for (let i = 0; i < specks; i++) {
      const v = Math.round(n / specks) || 1;
      this.pickups.push({ id: this.nextId++, kind: 'c', v, x: e.x, y: e.y, vx: R.float(-90, 90), vy: R.float(-90, 90), life: 30 });
    }
  },
  buyItem(id, item) {
    const p = this.players.get(id);
    const it = SHOP.find((s) => s.id === item);
    if (!p || !it || !this.nearProp(p, 'shop', 110)) return false;
    if (p.coins < it.price) { this.emit({ k: 'nope', id: p.id, what: 'coins' }); return false; }
    if ((p.items[item] || 0) >= it.max) { this.emit({ k: 'nope', id: p.id, what: 'full' }); return false; }
    p.coins -= it.price;
    p.items[item] = (p.items[item] || 0) + 1;
    this.emit({ k: 'bought', id: p.id, item });
    return true;
  },
  useItem(id, item) {
    const p = this.players.get(id);
    if (!p || p.down || !(p.items[item] > 0) || this.state === 'rest') return;
    if (!['tonic', 'draught', 'brew'].includes(item)) return;
    if (p.useT > this.time) return;
    p.useT = this.time + 0.5;
    if (item === 'tonic') { if (p.hp >= p.max) { this.emit({ k: 'nope', id: p.id, what: 'fullhp' }); return; } p.hp = Math.min(p.max, p.hp + p.max * 0.4); }
    else if (item === 'draught') { if (p.wf >= RULES.wildfireMax) { this.emit({ k: 'nope', id: p.id, what: 'fullwf' }); return; } this.gainWildfire(p, 35 / (p.stats.wfGain || 1)); }
    else if (item === 'brew') p.brewT = 12;
    p.items[item]--;
    this.emit({ k: 'drink', id: p.id, item, x: Math.round(p.x), y: Math.round(p.y) });
  },

  // =================================================== run modes
  setMode(id, mode, resume) {
    if (id !== 'host' || this.scene !== 'lobby' || this.countdown > 0) return;
    if (!['casual', 'daily', 'endless'].includes(mode)) return;
    this.mode = mode;
    this.resume = mode === 'endless' && resume && +resume.forest > 1 ? resume : null;
    this.emit({ k: 'mode', mode, rs: this.resume ? this.resume.forest : 0 });
  },
  isArenaStage(n) { return this.mode === 'endless' ? n % 3 === 0 : n > RULES.forestStages; },

  startRun() {
    this.runTime = 0;
    this.day = todayKey();
    this.ring = null;
    for (const p of this.players.values()) this.resetRunStats(p);
    let first = 1;
    const rs = this.mode === 'endless' ? this.resume : null;
    if (rs) {
      first = Math.max(1, Math.floor(+rs.forest || 1));
      this.runTime = +rs.time || 0;
      for (const p of this.players.values()) {
        const b = rs.boons && rs.boons[p.user.toLowerCase()];
        if (Array.isArray(b)) { p.boons = b.filter((x) => typeof x === 'string').slice(0, 40); this.recalc(p); p.hp = p.max; }
      }
    }
    this.resume = null;
    this.startStage(first);
  },

  startStage(n) {
    const daily = this.mode === 'daily';
    const seed = daily ? hashStr(this.day + ':' + n) & 0x7fffffff : (Math.random() * 2147483647) | 0;
    const rnd = (k) => (daily ? (hashStr(seed + ':' + k) % 10000) / 10000 : Math.random());
    const arena = this.isArenaStage(n);
    this.stage = n;
    this.world = arena ? makeArena(seed) : makeForest(seed);
    this.scene = this.world.kind;
    this.state = 'playing';
    this.clearStage();
    this.ring = null;
    this.waveT = 32;
    this.shrineUsed = this.world.shrines.map(() => false);
    this.sv++;
    this.placeAll(n === 1);
    // forest events: a random twist (more likely the deeper you go)
    this.event = null;
    if (!arena && rnd('ev') < (n === 1 ? 0.3 : 0.6)) this.event = EVENTS[Math.floor(rnd('which') * EVENTS.length)].id;
    const np = this.players.size;
    const tier = n - 1;
    if (this.scene === 'forest') {
      const hpScale = (1 + 0.3 * (np - 1)) * (1 + 0.25 * tier);
      const restless = this.event === 'restless';
      const eliteChance = ELITE.chance * (restless ? 2.5 : 1) + Math.min(0.15, 0.01 * Math.max(0, tier - 3));
      for (const s of this.world.wolfSpawns) {
        if (restless && Math.random() < 0.25) continue;
        this.spawnWolf(s.x, s.y, hpScale, Math.random() < eliteChance);
      }
      const extra = (np - 1) * 3 + Math.max(0, tier - 2) * 2;
      for (let i = 0; i < extra && this.world.wolfSpawns.length; i++) {
        const s = this.world.wolfSpawns[Math.floor(Math.random() * this.world.wolfSpawns.length)];
        this.spawnWolf(s.x + R.float(-16, 16), s.y + R.float(-16, 16), hpScale, false);
      }
      this.spawnExtras(n, hpScale);
      // the gate guardian: an Alpha Thornwolf or (from the 2nd forest on) sometimes a Bramble Widow
      const g = n >= 2 && rnd('guard') < 0.45
        ? this.spawnWidow(this.world.bossSpawn.x, this.world.bossSpawn.y, hpScale)
        : this.spawnAlpha(this.world.bossSpawn.x, this.world.bossSpawn.y, hpScale);
      g.guardian = true;
    } else {
      const bossN = this.mode === 'endless' ? n / 3 : 1;
      this.spawnTreant(this.world.bossSpawn.x, this.world.bossSpawn.y, (1 + 0.5 * (np - 1)) * (1 + 0.45 * (bossN - 1)));
    }
    this.hooks.onScene();
    const name = this.stageName(n);
    if (this.scene === 'forest') {
      const g = this.enemies.find((e) => e.guardian);
      this.emit({ k: 'msg', text: `${name}: defeat the ${g && g.type === 'widow' ? 'Bramble Widow' : 'Alpha'} to open the Heartwood Gate.` });
      if (this.event) this.emit({ k: 'event', ev: this.event });
    } else this.emit({ k: 'msg', text: 'The Creaking Oak awakens…' });
  },
  stageName(n) {
    if (this.isArenaStage(n)) return 'The Heart of the Woods';
    return `Thornwood ${this.mode === 'endless' ? n : ['I', 'II', 'III'][n - 1] || n}`;
  },

  // wisps, mossbacks and shamans, more of them the deeper you go
  spawnExtras(n, hpScale) {
    const spots = this.world.wolfSpawns;
    if (!spots.length) return;
    const pick = () => spots[Math.floor(Math.random() * spots.length)];
    const swarms = 1 + (n >= 3 ? 1 : 0) + (this.event === 'swarm' ? 3 : 0);
    for (let i = 0; i < swarms; i++) { const s = pick(); this.spawnWisps(s.x + R.float(-40, 40), s.y + R.float(-40, 40), 5, hpScale); }
    const moss = n >= 2 ? Math.min(4, 1 + Math.floor(n / 3)) : 0;
    for (let i = 0; i < moss; i++) { const s = pick(); this.spawnMossback(s.x + R.float(-30, 30), s.y + R.float(-30, 30), hpScale); }
    const sham = n >= 2 ? Math.min(3, 1 + Math.floor((n - 2) / 3)) : 0;
    for (let i = 0; i < sham; i++) { const s = pick(); this.spawnShaman(s.x + R.float(-24, 24), s.y + R.float(-24, 24), hpScale); }
  },

  spawnWisps(x, y, n, hpScale) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const e = this.baseEnemy('wisp', x + R.float(-18, 18), y + R.float(-18, 18), WISP.r, WISP.hp * hpScale);
      e.def = WISP; e.spd = (this.event === 'bloodmoon' ? 1.15 : 1) * R.float(0.9, 1.1); e.dmg = WISP.dmg * (1 + 0.1 * (this.stage - 1));
      out.push(e);
    }
    return out;
  },
  spawnMossback(x, y, hpScale) {
    const e = this.baseEnemy('mossback', x, y, MOSSBACK.r, MOSSBACK.hp * hpScale);
    e.def = MOSSBACK; e.spd = this.event === 'bloodmoon' ? 1.15 : 1; e.dmg = MOSSBACK.dmg * (1 + 0.15 * (this.stage - 1));
    return e;
  },
  spawnShaman(x, y, hpScale) {
    const e = this.baseEnemy('shaman', x, y, SHAMAN.r, SHAMAN.hp * hpScale);
    e.def = { ...SHAMAN, giveUp: 6, wanderRadius: 60, wanderSpeed: 20 };
    e.healT = R.float(1, 3); e.snareT = R.float(1, 3); e.spd = 1;
    return e;
  },
  spawnWidow(x, y, hpScale) {
    const e = this.baseEnemy('widow', x, y, WIDOW.r, WIDOW.hp * hpScale);
    e.def = WIDOW; e.spd = 1; e.dmg = WIDOW.dmg * (1 + 0.12 * (this.stage - 1));
    e.webT = 3; e.lungesLeft = 0;
    e.homeFlow = this.world.flowField(e.homeX, e.homeY);
    return e;
  },

  // shamans keep their distance, mend the pack and snare you
  updateShaman(e, dt) {
    const S = SHAMAN;
    e.healT -= dt; e.snareT -= dt;
    const tgt = this.nearestVisible(e, S.aggro);
    if (e.stun > 0) return;
    let tvx = 0, tvy = 0;
    if (tgt) {
      e.state = 'chase'; e.target = tgt.id;
      const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
      const want = d < S.keep - 20 ? -1 : d > S.keep + 50 ? 1 : 0; // back off or close in
      tvx = (dx / d) * S.speed * want * (e.smoked ? 0.2 : e.slowT > 0 ? 0.5 : 1);
      tvy = (dy / d) * S.speed * want * (e.smoked ? 0.2 : e.slowT > 0 ? 0.5 : 1);
      e.face = Math.atan2(dy, dx); e.fx = dx >= 0 ? 1 : -1;
      if (e.snareT <= 0 && d < S.aggro) {
        e.snareT = S.snareCd;
        e.state = 'windup';
        this.hazards.push({ id: this.nextId++, kind: 'root', x: tgt.x + R.float(-8, 8), y: tgt.y + R.float(-8, 8), r: S.snareR, t: 1.0, life: 1.4, max: 1.0, dmg: S.snareDmg * (1 + 0.12 * (this.stage - 1)) });
        this.emit({ k: 'snare', x: Math.round(e.x), y: Math.round(e.y) });
      }
    } else if (e.state !== 'idle') { e.state = 'idle'; e.target = null; }
    if (e.healT <= 0) {
      e.healT = S.healCd;
      const pts = [];
      for (const o of this.enemies) {
        if (o === e || o.dead || o.type === 'treant' || o.type === 'shaman' || o.hp >= o.max) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) > S.healR || !this.los(e.x, e.y, o.x, o.y)) continue;
        o.hp = Math.min(o.max, o.hp + o.max * S.heal);
        pts.push([Math.round(o.x), Math.round(o.y)]);
      }
      if (pts.length) this.emit({ k: 'shamanHeal', x: Math.round(e.x), y: Math.round(e.y), pts });
    }
    const k = 1 - Math.exp(-dt * 6);
    e.vx += (tvx - e.vx) * k; e.vy += (tvy - e.vy) * k;
    const pos = this.world.collide(e.x + e.vx * dt, e.y + e.vy * dt, e.r);
    e.x = pos.x; e.y = pos.y;
  },

  // the Widow spits webs at where you're standing
  updateWidow(e, dt) {
    e.webT -= dt;
    if (e.webT > 0 || e.stun > 0 || e.state !== 'chase') return;
    const tgt = e.target ? this.targetOf(e.target) : null;
    if (!tgt || tgt.down || !this.canSee(e, tgt)) return;
    e.webT = WIDOW.webCd;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, d = i === 0 ? 0 : R.float(30, 60);
      this.hazards.push({ id: this.nextId++, kind: 'web', x: tgt.x + Math.cos(a) * d, y: tgt.y + Math.sin(a) * d, r: WIDOW.webR, t: WIDOW.webDelay, life: WIDOW.webDelay + 0.5, max: WIDOW.webDelay, dmg: WIDOW.webDmg });
    }
    this.emit({ k: 'webSpit', x: Math.round(e.x), y: Math.round(e.y) });
  },

  // =================================================== the Treant's last stand (phase 3)
  treantUproot(e) {
    e.uproot = true;
    this.ring = { x: e.homeX, y: e.homeY + 40, r: 560, min: 210, tick: 0 };
    this.emit({ k: 'uproot', x: Math.round(e.x), y: Math.round(e.y) });
  },
  updateRing(dt) {
    const g = this.ring;
    if (!g) return;
    g.r = Math.max(g.min, g.r - 14 * dt);
    g.tick -= dt;
    if (g.tick > 0) return;
    g.tick = 0.5;
    for (const p of this.alivePlayers()) if (Math.hypot(p.x - g.x, p.y - g.y) > g.r) this.hurtPlayer(p, 5 * (1 + 0.15 * (this.stage - 1)), g.x, g.y, false);
  },

  // =================================================== combos between friends
  comboFx(e, name) {
    if (e.comboT > this.time) return;
    e.comboT = this.time + 0.4;
    this.emit({ k: 'combo', n: name, x: Math.round(e.x), y: Math.round(e.y - e.r - 14) });
  },
  // returns the extra damage multiplier for a hit
  comboMult(e, src) {
    if (!src || !src.cls || e.type === 'dummy' || e.type === 'duelist') return 1;
    // Shatter: a Warrior's quake or a Cleric's Judgement on something a friend chilled
    if (e.slowT > 0 && e.chillBy && e.chillBy !== src.id && ((src.cls === 'warrior' && src._slot === 's1') || (src.cls === 'cleric' && src._slot === 's2'))) {
      this.comboFx(e, 'Shatter!'); return 1.5;
    }
    // Crush: a Warrior's sword on something a friend's Grasping Hands is holding
    if (e.stun > 0 && e.rootBy && e.rootBy !== src.id && src.cls === 'warrior' && src._slot === 'atk') { this.comboFx(e, 'Crush!'); return 1.5; }
    return 1;
  },

  // =================================================== shared Wildfire
  checkSurge(p) {
    const L = this.lastUlt;
    this.lastUlt = { id: p.id, t: this.time, x: p.x, y: p.y };
    if (!L || L.id === p.id || this.time - L.t > 2.5 || !this.players.has(L.id)) return;
    this.lastUlt = null;
    const o = this.players.get(L.id);
    const x = (p.x + o.x) / 2, y = (p.y + o.y) / 2;
    this.emit({ k: 'surge', x: Math.round(x), y: Math.round(y), a: p.user, b: o.user });
    const prev = p._slot; p._slot = 'ult';
    this.hitCircle(p, x, y, 170, 90 * ((this.power(p) + this.power(o)) / 2), 320, { fromSky: true, el: 'fire' });
    p._slot = prev;
    for (const q of this.players.values()) if (!q.down) this.heal(q, q.max * 0.25, null, true);
  },

  // =================================================== per-tick extras
  tickPlayer(p, dt) {
    p.brewT = (p.brewT || 0) - dt; p.boostT = (p.boostT || 0) - dt; p.dimT = (p.dimT || 0) - dt; p.rootT = (p.rootT || 0) - dt;
    if (p.cuts) this.updateCuts(p, dt);
    if (p.cls === 'warrior') this.warriorTick(p, dt);
  },

  // =================================================== Warrior: Fury, Bladestorm, Aftershock
  gainFury(p, v) {
    if (p.cls !== 'warrior' || !(v > 0)) return;
    const before = p.mana || 0;
    p.mana = Math.min(100, before + v);
    // Unquenchable: filling the gauge makes your flame unbreakable for a moment
    if (before < 99.5 && p.mana >= 99.5 && p.stats.unquench && !(p.unqCd > this.time)) {
      p.unqT = this.time + 2; p.unqCd = this.time + 20;
      this.emit({ k: 'unquench', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
    }
  },
  // abilities use a chunk of Fury for extra damage (never required)
  useFury(p, frac) {
    if (p.cls !== 'warrior') return 1;
    const used = Math.min(p.mana || 0, 100 * frac);
    p.mana = (p.mana || 0) - used;
    p.lastFight = this.time;
    if (used >= 5) this.emit({ k: 'furyUse', id: p.id, v: Math.round(used) });
    return 1 + (used / 100) * p.stats.furyBonus;
  },
  warriorTick(p, dt) {
    // Fury fades a little at a time once the fighting stops
    if (this.time - (p.lastFight || -99) > WARRIOR.fury.fadeAfter) p.mana = Math.max(0, (p.mana || 0) - WARRIOR.fury.fade * dt);
    if (p.down) { p.storm = null; p.after = null; p.cryT = 0; return; }
    if (p.cryT > this.time && !(p.cryTick > this.time)) { p.cryTick = this.time + 0.25; this.cryPull(p); }
    if (p.after && this.time >= p.after.t) {
      const a = p.after; p.after = null;
      this.emit({ k: 'slam', id: p.id, x: Math.round(a.x), y: Math.round(a.y), r: Math.round(a.r), after: 1 });
      this.hitCircle(p, a.x, a.y, a.r, a.dmg, 220, { stun: 0.3 });
    }
    const S = p.storm;
    if (!S) return;
    S.t -= dt; S.tick -= dt;
    if (S.tick <= 0) {
      S.tick = WARRIOR.storm.every;
      const prev = p._slot; p._slot = 'ult';
      this.hitCircle(p, p.x, p.y - 4, WARRIOR.storm.r * Math.sqrt(p.stats.ultSize), WARRIOR.storm.dmg * this.power(p) * S.fb, WARRIOR.storm.kb);
      p._slot = prev;
      p.lastFight = this.time;
    }
    if (S.t <= 0) p.storm = null;
  },
  // Battle Cry: every enemy in range turns on the Warrior and won't switch for a few seconds
  battleCry(p) {
    const C = WARRIOR.cry;
    p.cd.s3 = p.stats.cryCd;
    p.cryT = this.time + C.time * (p.stats.slot ? p.stats.slot.s3 : 1);
    const n = this.cryPull(p);
    this.emit({ k: 'cry', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r: C.r, n });
  },
  // pull every enemy in range onto the Warrior until the cry ends
  cryPull(p) {
    let n = 0;
    for (const e of this.enemies) {
      if (e.dead || e.type === 'dummy' || e.type === 'duelist' || e.type === 'treant') continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) > WARRIOR.cry.r) continue;
      if (e.target !== p.id || !(e.tauntT >= p.cryT)) n++;
      e.target = p.id; e.unseen = 0; e.tauntT = p.cryT;
      if (e.state === 'idle' || e.state === 'ret') e.state = 'chase';
    }
    return n;
  },

  // Aggro: if another player steps in between (much closer than the enemy's target),
  // or the target can't be seen while someone else can, the enemy switches to them.
  maybeRetarget(e, tgt, seeTgt) {
    if (e.tauntT > this.time || !tgt || !this.players.has(e.target)) return; // taunts and decoys keep their hold
    if (e.rtAt > this.time) return;
    e.rtAt = this.time + 0.3;
    const dT = Math.hypot(tgt.x - e.x, tgt.y - e.y);
    let best = null, bd = 1e9;
    for (const o of this.players.values()) {
      if (o === tgt || o.down || !this.canSee(e, o)) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      const between = d < dT * 0.6 && d < 140;
      if ((between || (!seeTgt && d < e.def.aggro)) && d < bd) { bd = d; best = o; }
    }
    if (best) { e.target = best.id; e.unseen = 0; }
  },

  // Sword Master: the heavy 3rd Strike throws a slicing wave
  swordWave(p) {
    const W = WARRIOR, sp = W.waveSpeed * PACE;
    this.shots.push({ id: this.nextId++, kind: 'wave', owner: p.id, x: p.x + Math.cos(p.aim) * 14, y: p.y - 10 + Math.sin(p.aim) * 14,
      vx: Math.cos(p.aim) * sp, vy: Math.sin(p.aim) * sp, life: W.waveRange / sp, dmg: W.waveDmg * this.power(p), hit: new Set() });
  },
  tickWorld(dt) {
    if (this.scene === 'lobby') this.updateDuel(dt);
    else if (this.state === 'playing') this.updateRing(dt);
  },

  // =================================================== Thousand Cuts, played out so you can see it
  startCuts(p) {
    const range = 260 * p.stats.ultSize;
    const targets = this.enemies
      .filter((e) => !e.dead && e.owner !== p.id && Math.hypot(e.x - p.x, e.y - p.y) < range && this.los(p.x, p.y, e.x, e.y))
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
      .slice(0, p.stats.cutsTargets);
    if (!targets.length) { p.wf = RULES.wildfireMax; this.emit({ k: 'nope', id: p.id, what: 'cuts' }); return; }
    p.cuts = { ids: targets.map((e) => e.id), i: 0, t: 0.15, hx: p.x, hy: p.y };
    p.invT = 0.25 * targets.length + 0.6;
    p.tpLock = 0.4;
    this.emit({ k: 'cuts', id: p.id, x: Math.round(p.x), y: Math.round(p.y), n: targets.length });
  },
  updateCuts(p, dt) {
    const c = p.cuts;
    c.t -= dt;
    p.tpLock = 0.3;
    if (c.t > 0) return;
    if (c.i < c.ids.length) {
      const e = this.enemies.find((o) => o.id === c.ids[c.i]);
      c.i++;
      c.t = 0.25;
      if (!e || e.dead) { c.t = 0.02; return; }
      // blink to its back and strike as you land
      const back = (e.face || 0) + Math.PI;
      const spot = this.world.collide(e.x + Math.cos(back) * (e.r + 12), e.y + Math.sin(back) * (e.r + 12), PLAYER_RADIUS);
      const from = { x: Math.round(p.x), y: Math.round(p.y) };
      p.x = spot.x; p.y = spot.y;
      p.aim = Math.atan2(e.y - p.y, e.x - p.x);
      this.emit({ k: 'tp', id: p.id, x: Math.round(p.x), y: Math.round(p.y), fx: from.x, fy: from.y, a: r2(p.aim), cut: 1 });
      const prev = p._slot; p._slot = 'ult';
      this.damageEnemy(e, 60 * this.power(p) * (1 + p.stats.backstab), Math.cos(p.aim), Math.sin(p.aim), 120, p, false, 'back');
      p._slot = prev;
      return;
    }
    // done: back to where you started
    const from = { x: Math.round(p.x), y: Math.round(p.y) };
    const home = this.world.collide(c.hx, c.hy, PLAYER_RADIUS);
    p.x = home.x; p.y = home.y;
    p.cuts = null;
    p.invT = Math.max(p.invT, 0.3);
    this.emit({ k: 'tp', id: p.id, x: Math.round(p.x), y: Math.round(p.y), fx: from.x, fy: from.y, a: r2(p.aim), cut: 2 });
  },

  // =================================================== duels in camp
  duelInteract(p) {
    const ring = this.world.props.find((o) => o.type === 'duelring');
    if (!ring || this.duel) return;
    if (Math.hypot(p.x - ring.x, p.y - ring.y) > ring.r) return;
    p.duelReady = !p.duelReady;
    this.emit({ k: 'duelReady', id: p.id, n: p.user, on: p.duelReady ? 1 : 0 });
    const ready = [...this.players.values()].filter((o) => o.duelReady && Math.hypot(o.x - ring.x, o.y - ring.y) <= ring.r);
    if (ready.length >= 2) {
      const [a, b] = ready;
      for (const o of this.players.values()) o.duelReady = false;
      const hp = 150;
      const mk = (o) => {
        const e = this.baseEnemy('duelist', o.x, o.y, PLAYER_RADIUS + 2, hp);
        e.owner = o.id; e.def = WOLF; e.face = 0;
        return e;
      };
      this.duel = { a: a.id, b: b.id, t: 3, on: false, ea: mk(a), eb: mk(b), x: ring.x, y: ring.y, r: ring.r };
      this.emit({ k: 'duelStart', a: a.user, b: b.user });
    }
  },
  updateDuel(dt) {
    const D = this.duel;
    if (!D) return;
    const a = this.players.get(D.a), b = this.players.get(D.b);
    const out = (o) => !o || Math.hypot(o.x - D.x, o.y - D.y) > D.r + 50;
    if (out(a) || out(b)) { this.endDuel(out(a) ? D.b : D.a, true); return; }
    for (const [o, e] of [[a, D.ea], [b, D.eb]]) { e.x = o.x; e.y = o.y; e.vx = 0; e.vy = 0; e.face = o.aim; e.stun = 0; e.slowT = 0; }
    if (!D.on) { D.t -= dt; if (D.t <= 0) { D.on = true; this.emit({ k: 'duelGo' }); } }
  },
  duelHit(e, dmg, src) {
    const D = this.duel;
    if (!D || !D.on || !src || src.id === e.owner || (src.id !== D.a && src.id !== D.b)) return;
    e.hp -= dmg;
    e.hurtT = 0.14;
    this.emit({ k: 'hit', x: Math.round(e.x), y: Math.round(e.y - 22), d: Math.round(dmg), big: dmg >= 25 ? 1 : 0, by: src.id, el: null, kx: 0, ky: 0 });
    if (e.hp <= 0) this.endDuel(e.owner === D.a ? D.b : D.a, false);
  },
  endDuel(winner, forfeit) {
    const D = this.duel;
    if (!D) return;
    D.ea.dead = true; D.eb.dead = true;
    this.duel = null;
    const w = this.players.get(winner), l = this.players.get(winner === D.a ? D.b : D.a);
    this.emit({ k: 'duelEnd', w: w ? w.user : '?', l: l ? l.user : '?', forfeit: forfeit ? 1 : 0, wid: winner });
  },

  // =================================================== chat
  chat(id, text) {
    const p = this.players.get(id);
    if (!p) return;
    const t = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
    if (!t) return;
    p.chatLog = (p.chatLog || []).filter((x) => this.time - x < 8);
    if (p.chatLog.length >= 4) return; // slow down: at most 4 messages every 8 seconds
    p.chatLog.push(this.time);
    this.emit({ k: 'chat', id, n: p.user, text: t });
  },

  // =================================================== developer console (Jack and kubi only)
  devCmd(id, line) {
    const p = this.players.get(id);
    if (!p || !isDev(p.user)) return;
    const [cmd, a1, a2] = String(line || '').trim().toLowerCase().split(/\s+/);
    const say = (text) => this.emit({ k: 'dev', id, text });
    const num = (v, d) => (Number.isFinite(+v) ? +v : d);
    const c = p.cp;
    switch (cmd) {
      case 'level': case 'lvl': c.lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(num(a1, 1)))); c.xp = 0; this.recalc(p); say(`level ${c.lv}`); break;
      case 'xp': this.addXp(p, num(a1, 100)); say(`+${num(a1, 100)} exp → level ${c.lv}`); break;
      case 'max': case 'master': c.lv = MAX_LEVEL; c.xp = 0; say('level 30 (mastered). Visit the Skilltree to ignite.'); break;
      case 'prestiges': c.np = Math.max(0, Math.floor(num(a1, 0))); say(`ignition count set to ${c.np}`); break;
      case 'resetclass': p.prog[p.cls] = emptyProgress(); this.loadClass(p); this.recalc(p); say('this class was reset to level 1'); break;
      case 'coins': p.coins = Math.max(0, p.coins + Math.floor(num(a1, 100))); say(`coins: ${p.coins}`); break;
      case 'item': { const it = SHOP.find((s) => s.id === a1); if (!it) { say('items: ' + SHOP.map((s) => s.id).join(', ')); break; } p.items[a1] = Math.min(it.max, (p.items[a1] || 0) + Math.floor(num(a2, 1))); say(`${a1}: ${p.items[a1]}`); break; }
      case 'wf': case 'wildfire': p.wf = RULES.wildfireMax; say('wildfire full'); break;
      case 'heal': p.hp = p.max; p.down = false; say('healed'); break;
      case 'god': p.god = !p.god; say(p.god ? 'god mode on' : 'god mode off'); break;
      case 'kill': for (const e of this.enemies) if (!e.dead && e.type !== 'dummy' && e.type !== 'duelist') this.killEnemy(e, p); say('killed every enemy'); break;
      case 'gate': this.gateOpen = true; say('gate opened'); break;
      case 'next': if (this.scene !== 'lobby' && this.state === 'playing') { this.startRest(); say('skipped to the rest stop'); } break;
      case 'forest': if (this.scene !== 'lobby') { this.startStage(Math.max(1, Math.floor(num(a1, this.stage + 1)))); say(`jumped to stage ${this.stage}`); } else say('start a run first'); break;
      case 'event': if (EVENTS.some((e) => e.id === a1) || a1 === 'none') { this.event = a1 === 'none' ? null : a1; say(`event: ${a1}`); } else say('events: ' + EVENTS.map((e) => e.id).join(', ') + ', none'); break;
      case 'spawn': {
        const n = Math.min(20, Math.floor(num(a2, 1))), x = p.x + Math.cos(p.aim) * 120, y = p.y + Math.sin(p.aim) * 120;
        const f = { wolf: () => this.spawnWolf(x, y, 1, false), elite: () => this.spawnWolf(x, y, 1, true), wisp: () => this.spawnWisps(x, y, 1, 1)[0], mossback: () => this.spawnMossback(x, y, 1), shaman: () => this.spawnShaman(x, y, 1), widow: () => this.spawnWidow(x, y, 1), alpha: () => this.spawnAlpha(x, y, 1) }[a1];
        if (!f) { say('spawn: wolf, elite, wisp, mossback, shaman, widow, alpha'); break; }
        if (this.scene === 'lobby') { say('spawning only works out in the forest'); break; }
        for (let i = 0; i < n; i++) f();
        say(`spawned ${n} ${a1}`); break;
      }
      default: say('commands: level N · xp N · max · prestiges N · resetclass · coins N · item NAME N · wf · heal · god · kill · gate · next · forest N · event NAME · spawn TYPE N');
    }
  },

  // extra player fields in the snapshot
  playerSnap(p) {
    const c = p.cp;
    return {
      lv: c.lv, xp: Math.floor(c.xp), nx: c.lv >= MAX_LEVEL ? 0 : xpNeed(c.lv), pts: pointsLeft(c), np: c.np, pr: c.pres, rb: c.reb,
      co: p.coins, it: p.items, bt: p.brewT > 0 ? 1 : 0, bo: p.boostT > 0 ? 1 : 0, dm: p.dimT > 0 ? 1 : 0, rt: p.rootT > 0 ? 1 : 0,
      dr: p.duelReady ? 1 : 0, ct: p.cuts ? 1 : 0, bs: p.storm ? 1 : 0, br: p.storm ? Math.round(WARRIOR.storm.r * Math.sqrt(p.stats.ultSize)) : 0, cr: p.cryT > this.time ? 1 : 0, uq: p.unqT > this.time ? 1 : 0,
    };
  },
  worldSnap() {
    const D = this.duel;
    return {
      md: this.mode || 'casual', ev: this.event || null, rs: this.resume ? this.resume.forest : 0,
      rg: this.ring ? { x: Math.round(this.ring.x), y: Math.round(this.ring.y), r: Math.round(this.ring.r) } : null,
      du: D ? { a: D.a, b: D.b, ha: Math.max(0, Math.ceil(D.ea.hp)), hb: Math.max(0, Math.ceil(D.eb.hp)), mx: D.ea.max, on: D.on ? 1 : 0, t: Math.ceil(D.t) } : null,
    };
  },

  // tell everyone how a run ended (for the leaderboard and endless saves)
  runOver(won, why, cleared = won ? this.stage : this.stage - 1) {
    this.emit({
      k: 'runOver', mode: this.mode || 'casual', day: this.day || todayKey(), cleared: Math.max(0, cleared), won: won ? 1 : 0, why,
      time: Math.floor(this.runTime), party: [...this.players.values()].map((p) => p.user), cls: [...this.players.values()].map((p) => p.cls),
    });
  },
  endlessSave() {
    const boons = {};
    for (const p of this.players.values()) boons[p.user.toLowerCase()] = p.boons.slice();
    this.emit({ k: 'endlessSave', save: { forest: this.stage + 1, cleared: this.stage, time: Math.floor(this.runTime), boons, day: todayKey() } });
  },
};

export function installExtras(Sim) {
  Object.assign(Sim.prototype, X);
  // run each ability with its "slot" set, so prestige bonuses apply to the right one
  for (const [name, slot] of Object.entries(WRAP)) {
    const fn = Sim.prototype[name];
    if (!fn) throw new Error('missing ' + name);
    Sim.prototype[name] = function (p, ...rest) {
      const prev = p._slot; p._slot = slot;
      try { return fn.call(this, p, ...rest); } finally { p._slot = prev; }
    };
  }
  const cast = Sim.prototype.castSpell;
  Sim.prototype.castSpell = function (p, el, ...rest) {
    const prev = p._slot; p._slot = el === 'fire' ? 's1' : el === 'gale' ? 's2' : 's3';
    try { return cast.call(this, p, el, ...rest); } finally { p._slot = prev; }
  };
}

