// =============================================================
//  The simulation. ONLY the host runs this.
//  It decides enemies, damage, flame, pickups, reviving and
//  scene changes, then sends snapshots to everyone else.
//  (Each player moves their own character; the host trusts that.)
// =============================================================
import { WARRIOR, WOLF, FLAME_RULES, CLOAKS, HATS, FLAMES, CLASSES, PLAYER_RADIUS } from './data.js';
import { makeLobby, makeForest } from './world.js';

const R = { float: (a, b) => a + Math.random() * (b - a) };
const STATE_CODE = { idle: 0, chase: 1, windup: 2, lunge: 3, recover: 4 };
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
    this.nextId = 1;
    this.sv = 0;               // "scene version": goes up every scene change
    this.fxLocal = [];         // effects for the host's own screen
    this.fxNet = [];           // effects to send to the others
    this.scene = 'lobby';
    this.state = 'lobby';
    this.world = null;
    this.countdown = -1;
    this.stateTimer = 0;
    this.stageTime = 0;
    this.waveT = 30;
  }

  emit(f) { this.fxLocal.push(f); this.fxNet.push(f); }

  // ---------------------------------------------------------- scenes
  goLobby() {
    this.scene = 'lobby';
    this.state = 'lobby';
    this.world = makeLobby();
    this.enemies = [];
    this.pickups = [];
    this.countdown = -1;
    this.stageTime = 0;
    this.sv++;
    this.resetPlayers();
    this.hooks.onScene();
  }

  startStage() {
    const seed = (Math.random() * 2147483647) | 0;
    this.scene = 'forest';
    this.state = 'playing';
    this.world = makeForest(seed);
    this.enemies = [];
    this.pickups = [];
    this.countdown = -1;
    this.stageTime = 0;
    this.waveT = 30;
    this.sv++;
    this.resetPlayers();
    const n = this.players.size;
    const hpScale = 1 + 0.3 * (n - 1);
    for (const s of this.world.wolfSpawns) this.spawnWolf(s.x, s.y, hpScale);
    for (let i = 0; i < (n - 1) * 3 && this.world.wolfSpawns.length; i++) {
      const s = this.world.wolfSpawns[Math.floor(Math.random() * this.world.wolfSpawns.length)];
      this.spawnWolf(s.x + R.float(-20, 20), s.y + R.float(-20, 20), hpScale);
    }
    this.hooks.onScene();
    this.emit({ k: 'msg', text: 'Find the Heartwood Gate before your flames go out.' });
  }

  resetPlayers() {
    const n = Math.max(1, this.players.size);
    let i = 0;
    for (const p of this.players.values()) {
      const a = (i++ * Math.PI * 2) / n;
      const pos = this.world.collide(this.world.spawn.x + Math.cos(a) * 40, this.world.spawn.y + Math.sin(a) * 40, PLAYER_RADIUS);
      Object.assign(p, pos, { hp: p.max, down: false, heat: 0, wildT: 0, revive: 0, atkCd: 0, skillCd: 0 });
    }
  }

  placeNewPlayer(p) {
    const alive = [...this.players.values()].filter((o) => o !== p && !o.down);
    const base = this.scene === 'forest' && alive.length ? alive[0] : this.world.spawn;
    const pos = this.world.collide(base.x + R.float(-40, 40), base.y + R.float(-40, 40), PLAYER_RADIUS);
    p.x = pos.x;
    p.y = pos.y;
  }

  // ---------------------------------------------------------- players
  addPlayer(id, ch) {
    const p = {
      id,
      name: String(ch.name || 'Wanderer').slice(0, 16),
      cloak: this.freeCloak(ch.cloak),
      hat: valid(HATS, ch.hat, 'none'),
      flame: valid(FLAMES, ch.flame, 'amber'),
      cls: 'warrior',
      x: 0, y: 0, aim: 0, moving: false, dashing: false,
      hp: WARRIOR.maxFlame, max: WARRIOR.maxFlame,
      heat: 0, wildT: 0, down: false, revive: 0,
      atkCd: 0, skillCd: 0, combo: 0, comboT: 0,
      ac: null, sc: null, ah: false, wantAtk: 0, wantSkill: 0,
      hurtT: 0, lastSeen: performance.now(),
    };
    const cls = CLASSES.find((c) => c.id === ch.cls);
    if (cls && cls.available) p.cls = cls.id;
    this.players.set(id, p);
    return p;
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
    if (p.ac === null) p.ac = m.ac;
    else if (m.ac > p.ac) { p.wantAtk = 0.3; p.ac = m.ac; }
    if (p.sc === null) p.sc = m.sc;
    else if (m.sc > p.sc) { p.wantSkill = 0.3; p.sc = m.sc; }
  }

  // ---------------------------------------------------------- main update
  update(dt) {
    for (const p of this.players.values()) {
      p.atkCd -= dt; p.skillCd -= dt; p.comboT -= dt; p.hurtT -= dt;
      p.wantAtk -= dt; p.wantSkill -= dt;
      if (!p.down && this.state !== 'defeat') {
        if ((p.wantAtk > 0 || p.ah) && p.atkCd <= 0) { this.attack(p); p.wantAtk = 0; }
        if (p.wantSkill > 0 && p.skillCd <= 0) { this.skill(p); p.wantSkill = 0; }
      }
      if (p.wildT > 0) {
        p.wildT -= dt;
        for (const e of this.enemies) {
          if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < FLAME_RULES.wildfireRadius) {
            e.burnT = 0.2;
            this.damageEnemy(e, FLAME_RULES.wildfireDps * dt, 0, 0, 0, true);
          }
        }
      }
    }
    this.updateRevives(dt);

    if (this.scene === 'lobby') this.updateLobby(dt);
    else if (this.state === 'playing') {
      this.stageTime += dt;
      this.updateEnemies(dt);
      this.updatePickups(dt);
      this.updateWaves(dt);
      this.checkEnd();
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
      if (this.countdown <= 0) { this.countdown = -1; this.startStage(); }
    } else this.countdown = -1;
  }

  updateRevives(dt) {
    for (const p of this.players.values()) {
      if (!p.down) continue;
      let helped = false;
      for (const o of this.players.values()) {
        if (o !== p && !o.down && Math.hypot(o.x - p.x, o.y - p.y) < FLAME_RULES.reviveRange) helped = true;
      }
      if (helped && this.state === 'playing') {
        p.revive += dt / FLAME_RULES.reviveTime;
        if (p.revive >= 1) {
          p.down = false;
          p.hp = FLAME_RULES.reviveFlame;
          p.revive = 0;
          this.emit({ k: 'revive', id: p.id, n: p.name, x: Math.round(p.x), y: Math.round(p.y) });
        }
      } else p.revive = Math.max(0, p.revive - dt * 0.5);
    }
  }

  // ---------------------------------------------------------- warrior
  fury(p) { return 1 + WARRIOR.furyMax * (1 - p.hp / p.max); }

  attack(p) {
    const W = WARRIOR;
    p.atkCd = W.atkCd;
    p.combo = p.comboT > 0 ? (p.combo % 3) + 1 : 1;
    p.comboT = 1.0;
    const heavy = p.combo === 3;
    this.emit({ k: 'sw', id: p.id, a: r2(p.aim), h: heavy ? 1 : 0 });
    if (this.scene !== 'forest') return;
    const mult = this.fury(p) * (heavy ? W.heavyMult : 1);
    const cx = p.x, cy = p.y - 10;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - cx, dy = e.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > W.atkRange + WOLF.r) continue;
      if (d > 18 && Math.abs(angDiff(Math.atan2(dy, dx), p.aim)) > W.atkArc / 2) continue;
      this.damageEnemy(e, W.atkDmg * mult, dx / (d || 1), dy / (d || 1), heavy ? 420 : 230);
    }
  }

  // Cinder Quake: burn some of your own flame to slam the ground.
  skill(p) {
    const W = WARRIOR;
    const inForest = this.scene === 'forest';
    if (inForest && p.hp <= W.skillCost) { p.skillCd = 0.3; this.emit({ k: 'nope', id: p.id }); return; }
    p.skillCd = W.skillCd;
    if (inForest) p.hp -= W.skillCost;
    this.emit({ k: 'slam', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
    if (!inForest) return;
    const mult = this.fury(p);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < W.skillRadius + WOLF.r) {
        this.damageEnemy(e, W.skillDmg * mult, dx / d, dy / d, 520);
        e.stun = 0.6;
      }
    }
  }

  // ---------------------------------------------------------- flame
  heal(p, amt) {
    const used = Math.min(p.max - p.hp, amt);
    p.hp += used;
    const over = amt - used;
    if (over > 0 && p.wildT <= 0) {
      p.heat = Math.min(100, p.heat + over * FLAME_RULES.heatPerOverheal);
      if (p.heat >= 100) {
        p.heat = 0;
        p.wildT = FLAME_RULES.wildfireTime;
        this.emit({ k: 'wild', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
      }
    }
  }

  hurtPlayer(p, dmg) {
    if (p.down || this.state !== 'playing') return;
    if (p.wildT > 0) dmg *= FLAME_RULES.wildfireDamageTaken;
    p.hp -= dmg;
    p.hurtT = 0.3;
    this.emit({ k: 'hurt', id: p.id, x: Math.round(p.x), y: Math.round(p.y), d: Math.round(dmg) });
    if (p.hp <= 0) {
      p.hp = 0;
      p.down = true;
      p.revive = 0;
      p.heat = 0;
      p.wildT = 0;
      this.emit({ k: 'down', id: p.id, n: p.name, x: Math.round(p.x), y: Math.round(p.y) });
    }
  }

  // ---------------------------------------------------------- enemies
  spawnWolf(x, y, hpScale) {
    const hp = WOLF.hp * hpScale * (1 + this.stageTime / 300);
    const pos = this.world.collide(x, y, WOLF.r);
    this.enemies.push({
      id: this.nextId++, type: 'wolf', x: pos.x, y: pos.y, vx: 0, vy: 0, hp, max: hp,
      state: 'idle', t: R.float(0, 2), cd: 0, fx: Math.random() < 0.5 ? -1 : 1, dx: 1, dy: 0,
      hit: false, homeX: pos.x, homeY: pos.y, wx: pos.x, wy: pos.y, target: null,
      hurtT: 0, stun: 0, burnT: 0, flank: Math.random() < 0.5 ? -1 : 1, dead: false,
    });
    return this.enemies[this.enemies.length - 1];
  }

  damageEnemy(e, dmg, kx, ky, kb, silent = false) {
    if (e.dead) return;
    e.hp -= dmg;
    e.vx += kx * kb;
    e.vy += ky * kb;
    if (!silent) {
      e.hurtT = 0.12;
      this.emit({ k: 'hit', x: Math.round(e.x), y: Math.round(e.y), d: Math.round(dmg), big: dmg >= 20 ? 1 : 0 });
      if (e.state !== 'lunge' && !e.target) { e.state = 'chase'; }
    }
    if (kb >= 400 && e.state === 'windup') { e.state = 'recover'; e.t = 0.5; }
    if (e.hp <= 0) {
      e.dead = true;
      this.emit({ k: 'die', x: Math.round(e.x), y: Math.round(e.y) });
      const n = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        this.pickups.push({ id: this.nextId++, x: e.x, y: e.y, vx: R.float(-120, 120), vy: R.float(-120, 120), life: 30 });
      }
    }
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
      if (o !== e && o.state === 'idle' && Math.hypot(o.x - e.x, o.y - e.y) < 300) { o.state = 'chase'; o.target = targetId; }
    }
  }

  updateEnemies(dt) {
    const alive = [...this.players.values()].filter((p) => !p.down);
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t -= dt; e.cd -= dt; e.hurtT -= dt; e.stun -= dt; e.burnT -= dt;
      let tvx = 0, tvy = 0;
      const tgt = e.target ? this.players.get(e.target) : null;
      const ok = tgt && !tgt.down;

      if (e.stun <= 0) {
        switch (e.state) {
          case 'idle': {
            const best = this.nearestAlive(e.x, e.y, WOLF.aggro);
            if (best) { e.target = best.id; e.state = 'chase'; this.alertPack(e, best.id); break; }
            if (e.t <= 0) {
              e.t = R.float(2, 4);
              const a = R.float(0, 6.28), r = R.float(0, 90);
              e.wx = e.homeX + Math.cos(a) * r;
              e.wy = e.homeY + Math.sin(a) * r;
            }
            const dx = e.wx - e.x, dy = e.wy - e.y, d = Math.hypot(dx, dy);
            if (d > 8) { tvx = (dx / d) * 55; tvy = (dy / d) * 55; }
            break;
          }
          case 'chase': {
            if (!ok) {
              const nb = this.nearestAlive(e.x, e.y, WOLF.aggro * 1.5);
              e.target = nb ? nb.id : null;
              if (!nb) { e.state = 'idle'; e.homeX = e.x; e.homeY = e.y; }
              break;
            }
            const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
            if (d > WOLF.aggro * 2.2) { e.state = 'idle'; e.target = null; e.homeX = e.x; e.homeY = e.y; break; }
            if (d < WOLF.lungeRange && e.cd <= 0) { e.state = 'windup'; e.t = WOLF.windup; e.dx = dx / d; e.dy = dy / d; break; }
            let ux = dx / d, uy = dy / d;
            if (d < 220) {
              // circle around the target like a pack
              const px = -uy * e.flank, py = ux * e.flank;
              const back = d < 80 && e.cd > 0 ? -0.6 : 0.75;
              ux = ux * back + px * 0.6;
              uy = uy * back + py * 0.6;
              const l = Math.hypot(ux, uy) || 1;
              ux /= l; uy /= l;
            }
            tvx = ux * WOLF.chaseSpeed;
            tvy = uy * WOLF.chaseSpeed;
            break;
          }
          case 'windup': {
            if (ok && e.t > 0.15) {
              const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
              e.dx = dx / d; e.dy = dy / d;
            }
            if (e.t <= 0) { e.state = 'lunge'; e.t = WOLF.lungeTime; e.hit = false; }
            break;
          }
          case 'lunge': {
            tvx = e.dx * WOLF.lungeSpeed;
            tvy = e.dy * WOLF.lungeSpeed;
            if (!e.hit) {
              for (const p of alive) {
                if (p.dashing) continue; // dashing dodges the bite
                if (Math.hypot(p.x - e.x, p.y - e.y) < WOLF.r + PLAYER_RADIUS + 4) {
                  this.hurtPlayer(p, WOLF.dmg);
                  e.hit = true;
                  break;
                }
              }
            }
            if (e.t <= 0) { e.state = 'recover'; e.t = WOLF.recover; }
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
      // don't stack on top of each other
      for (const o of this.enemies) {
        if (o === e || o.dead) continue;
        const dx = e.x - o.x, dy = e.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 < 900 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          e.x += (dx / d) * (30 - d) * 0.5;
          e.y += (dy / d) * (30 - d) * 0.5;
        }
      }
      const pos = this.world.collide(e.x + e.vx * dt, e.y + e.vy * dt, WOLF.r);
      e.x = pos.x;
      e.y = pos.y;
      if (e.state === 'windup' || e.state === 'lunge') e.fx = e.dx >= 0 ? 1 : -1;
      else if (Math.abs(e.vx) > 5) e.fx = e.vx > 0 ? 1 : -1;
    }
  }

  updatePickups(dt) {
    for (const k of this.pickups) {
      k.life -= dt;
      k.vx *= Math.exp(-dt * 4);
      k.vy *= Math.exp(-dt * 4);
      const p = this.nearestAlive(k.x, k.y, 120);
      if (p) {
        const dx = p.x - k.x, dy = p.y - 10 - k.y, d = Math.hypot(dx, dy) || 1;
        const pull = 900 * (1 - d / 130);
        k.vx += (dx / d) * pull * dt * 2;
        k.vy += (dy / d) * pull * dt * 2;
        if (d < 24) {
          this.heal(p, FLAME_RULES.emberHeal);
          k.life = 0;
          this.emit({ k: 'pick', id: p.id, x: Math.round(k.x), y: Math.round(k.y) });
        }
      }
      const pos = this.world.collide(k.x + k.vx * dt, k.y + k.vy * dt, 4);
      k.x = pos.x;
      k.y = pos.y;
    }
    this.pickups = this.pickups.filter((k) => k.life > 0);
  }

  // Every so often a new pack comes howling out of the dark.
  updateWaves(dt) {
    this.waveT -= dt;
    if (this.waveT > 0) return;
    this.waveT = Math.max(14, 30 - this.stageTime / 12);
    if (this.enemies.length >= 26) return;
    const alive = [...this.players.values()].filter((p) => !p.down);
    if (!alive.length) return;
    const p = alive[Math.floor(Math.random() * alive.length)];
    const pt = this.world.randomOpenPoint(R, p.x, p.y, 520, 820, 60);
    if (!pt) return;
    const n = 2 + Math.floor(this.stageTime / 90) + Math.floor((this.players.size - 1) / 2);
    for (let i = 0; i < n; i++) {
      const e = this.spawnWolf(pt.x + R.float(-25, 25), pt.y + R.float(-25, 25), 1 + 0.3 * (this.players.size - 1));
      e.state = 'chase';
      e.target = p.id;
    }
    this.emit({ k: 'msg', text: 'Howling echoes through the trees…' });
  }

  checkEnd() {
    const ps = [...this.players.values()];
    if (!ps.length) return;
    if (ps.every((p) => p.down)) {
      this.state = 'defeat';
      this.stateTimer = 5;
      this.emit({ k: 'defeat' });
      return;
    }
    const ex = this.world.exit;
    const alive = ps.filter((p) => !p.down);
    if (alive.every((p) => Math.hypot(p.x - ex.x, p.y - ex.y) < ex.r)) {
      this.state = 'victory';
      this.stateTimer = 6;
      this.emit({ k: 'victory' });
    }
  }

  // ---------------------------------------------------------- snapshot
  snapshot() {
    return {
      t: 's',
      sv: this.sv,
      sc: this.scene,
      st: this.state,
      tm: Math.floor(this.stageTime),
      cd: this.countdown > 0 ? Math.ceil(this.countdown) : 0,
      stt: Math.max(0, Math.ceil(this.stateTimer)),
      ps: [...this.players.values()].map((p) => ({
        id: p.id, n: p.name, c: p.cloak, h: p.hat, f: p.flame, k: p.cls,
        x: r1(p.x), y: r1(p.y), a: r2(p.aim), m: p.moving ? 1 : 0, d: p.dashing ? 1 : 0,
        hp: Math.ceil(p.hp), mx: p.max, ht: Math.round(p.heat), w: r2(Math.max(0, p.wildT)),
        dn: p.down ? 1 : 0, rv: r2(p.revive), sk: Math.max(0, r1(p.skillCd)), hu: p.hurtT > 0 ? 1 : 0,
      })),
      es: this.enemies.map((e) => ({
        id: e.id, x: r1(e.x), y: r1(e.y), s: STATE_CODE[e.state], fx: e.fx, dx: r2(e.dx), dy: r2(e.dy),
        hp: Math.ceil(e.hp), mx: Math.ceil(e.max), hu: e.hurtT > 0 ? 1 : 0, b: e.burnT > 0 ? 1 : 0,
      })),
      pk: this.pickups.map((k) => ({ id: k.id, x: Math.round(k.x), y: Math.round(k.y) })),
    };
  }
}
