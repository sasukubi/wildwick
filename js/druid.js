// =============================================================
//  The Druid (host side). Human form casts thorns, vines and a gentle
//  heal; hits fill the nature gauge. When it's full, E turns you into
//  a great bear until the gauge drains (it only drains in bear form).
//  Also the Archer's Fire Arrow and the Rogue's Twin Fang.
// =============================================================
import { DRUID, BOWMAN, ROGUE, PLAYER_RADIUS, PACE } from './data.js';

const r2 = (v) => Math.round(v * 100) / 100;
const R = (v) => Math.round(v);

const D = {
  // run fn with an ability "slot" set, so prestige bonuses apply to it
  slotDo(p, slot, fn) {
    const prev = p._slot; p._slot = slot;
    try { return fn(); } finally { p._slot = prev; }
  },

  gainNature(p, v) {
    if (!p || p.cls !== 'druid' || p.bear || !(v > 0)) return;
    const before = p.mana || 0;
    p.mana = Math.min(100, before + v * (p.stats.natureGain || 1));
    p.lastFight = this.time;
    if (before < 99.5 && p.mana >= 99.5) this.emit({ k: 'natureFull', id: p.id, x: R(p.x), y: R(p.y) });
  },

  druidActions(p) {
    // E: turn into the bear (needs a full gauge), or back again
    if (p.want.s1 > 0) {
      p.want.s1 = 0;
      if (p.bear) this.bearOff(p);
      else if ((p.mana || 0) >= 99.5) this.bearOn(p);
      else this.emit({ k: 'nope', id: p.id, what: 'bear', slot: 's1' });
    }
    if (p.bear) {
      if ((p.want.atk > 0 || p.ah) && p.cd.atk <= 0) { p.want.atk = 0; this.slotDo(p, 's1', () => this.maul(p)); }
      if (p.want.s2 > 0 && p.cd.b2 <= 0) { p.want.s2 = 0; this.slotDo(p, 's1', () => this.stomp(p)); }
      if (p.want.s3 > 0 && p.cd.b3 <= 0) { p.want.s3 = 0; this.roar(p); }
      return;
    }
    if ((p.want.atk > 0 || p.ah) && p.cd.atk <= 0) { p.want.atk = 0; this.slotDo(p, 'atk', () => this.thornShot(p)); }
    if (p.want.s2 > 0 && p.cd.s2 <= 0) { p.want.s2 = 0; this.slotDo(p, 's2', () => this.entangle(p)); }
    if (p.want.s3 > 0 && p.cd.s3 <= 0) { p.want.s3 = 0; this.slotDo(p, 's3', () => this.rejuvenate(p)); }
  },

  thornShot(p) {
    const T = DRUID.thorn, st = p.stats, sp = T.speed * PACE;
    p.cd.atk = st.atkCd;
    p.thornN = (p.thornN || 0) + 1;
    const angs = st.splinter && p.thornN % 4 === 0 ? [-0.2, 0, 0.2] : [0];
    for (const da of angs) {
      const a = p.aim + da;
      this.shots.push({ id: this.nextId++, kind: 'thorn', owner: p.id, x: p.x + Math.cos(a) * 10, y: p.y - 12 + Math.sin(a) * 10,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: T.range / sp, dmg: T.dmg * st.thornMult * this.power(p), hit: new Set() });
    }
    this.emit({ k: 'thornShot', id: p.id, a: r2(p.aim) });
  },

  entangle(p) {
    const E = DRUID.entangle, st = p.stats;
    const c = this.aimPoint(p, E.range);
    p.cd.s2 = st.entangleCd;
    const life = E.delay + st.entangleRoot;
    this.zones.push({ id: this.nextId++, kind: 'vines', owner: p.id, x: c.x, y: c.y, vx: 0, vy: 0, r: st.entangleR, t: life, max: life, dps: 0,
      delay: E.delay, dmg: E.dmg * st.entangleMult * this.power(p), root: st.entangleRoot });
    this.emit({ k: 'entangle', id: p.id, x: R(c.x), y: R(c.y), r: R(st.entangleR) });
  },
  // (called from updateZones) the vines burst up and grab everything inside
  vinesUp(z, owner) {
    z.done = true;
    this.emit({ k: 'vinesUp', x: R(z.x), y: R(z.y), r: R(z.r) });
    const n = this.hitCircle(owner, z.x, z.y, z.r, z.dmg, 0, { stun: z.root });
    if (owner) this.gainNature(owner, Math.min(DRUID.gauge.vineCap, n * DRUID.gauge.perVine));
  },

  rejuvenate(p) {
    const J = DRUID.rejuv, st = p.stats;
    p.cd.s3 = st.rejuvCd;
    const hps = J.hps * st.rejuvMult * (st.slot ? st.slot.s3 : 1);
    for (const o of this.players.values()) {
      if (o.down || Math.hypot(o.x - p.x, o.y - p.y) > J.r) continue;
      o.rejuT = this.time + J.time; o.rejuHps = hps;
      if (st.lifebloom) o.sh = Math.max(o.sh || 0, 10);
    }
    this.emit({ k: 'rejuv', id: p.id, x: R(p.x), y: R(p.y), r: J.r });
  },

  // ---------------------------------------------------- bear form
  bearOn(p) {
    const ratio = p.hp / p.max;
    p.bear = true;
    p.max = Math.round(p.stats.maxFlame * DRUID.bear.hp);
    p.hp = Math.max(1, ratio * p.max);
    p.cd.atk = Math.max(p.cd.atk, 0.25);
    p.emote = null;
    this.emit({ k: 'bearOn', id: p.id, x: R(p.x), y: R(p.y) });
  },
  bearOff(p) {
    if (!p.bear) return;
    const ratio = p.hp / p.max;
    p.bear = false;
    p.max = p.stats.maxFlame;
    p.hp = p.down ? 0 : Math.max(1, ratio * p.max);
    p.cd.atk = Math.max(p.cd.atk, 0.25);
    this.emit({ k: 'bearOff', id: p.id, x: R(p.x), y: R(p.y) });
  },

  maul(p) {
    const M = DRUID.maul, st = p.stats;
    p.cd.atk = M.cd;
    this.emit({ k: 'maul', id: p.id, a: r2(p.aim) });
    this.hitArc(p, M.range, M.arc, M.dmg * st.clawMult * this.power(p), M.kb);
    p.lastFight = this.time;
  },
  stomp(p) {
    const S = DRUID.stomp, st = p.stats;
    p.cd.b2 = st.stompCd;
    this.emit({ k: 'stomp', id: p.id, x: R(p.x), y: R(p.y), r: S.r });
    this.hitCircle(p, p.x, p.y - 4, S.r, S.dmg * st.clawMult * this.power(p), 200, { stun: S.stun });
    p.lastFight = this.time;
  },
  roar(p) {
    const O = DRUID.roar;
    p.cd.b3 = p.stats.roarCd;
    const until = this.time + O.time;
    let n = 0;
    for (const e of this.enemies) {
      if (e.dead || e.type === 'dummy' || e.type === 'duelist' || e.type === 'treant') continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) > O.r) continue;
      e.target = p.id; e.unseen = 0; e.tauntT = until;
      if (e.state === 'idle' || e.state === 'ret') e.state = 'chase';
      n++;
    }
    this.emit({ k: 'roarB', id: p.id, x: R(p.x), y: R(p.y), r: O.r, n });
  },
  // the bear's dash is a Charge: knocks enemies aside and stuns the first one
  chargeHits(p) {
    const C = DRUID.charge;
    for (const e of this.enemies) {
      if (e.dead || p.chargeSet.has(e.id)) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > e.r + PLAYER_RADIUS + 12) continue;
      p.chargeSet.add(e.id);
      const first = !p.chargeHit;
      p.chargeHit = true;
      this.slotDo(p, 's1', () => this.damageEnemy(e, C.dmg * p.stats.clawMult * this.power(p), dx / d, dy / d, e.type === 'treant' ? 0 : C.kb, p));
      if ((first || p.stats.greatBear) && e.type !== 'treant') {
        e.stun = Math.max(e.stun || 0, C.stun);
        if (e.state === 'windup' || e.state === 'lunge') { e.state = 'recover'; e.t = C.stun; e.hit = true; e.lungesLeft = 0; }
      }
      this.emit({ k: 'shove', id: p.id, x: R(e.x), y: R(e.y) });
    }
  },

  // Wrath of the Grove (Wildfire): the trees around you lash out again and again
  groveWrath(p) {
    p.grove = { t: DRUID.grove.time, tick: 0 };
    this.emit({ k: 'grove', id: p.id, x: R(p.x), y: R(p.y), r: R(DRUID.grove.r * Math.sqrt(p.stats.ultSize)) });
  },

  // every tick, for every player
  druidTick(p, dt) {
    if (p.rejuT > this.time && !p.down) p.hp = Math.min(p.max, p.hp + p.rejuHps * dt);
    if (p.rollGuardT) p.rollGuardT -= dt;
    if (p.cls !== 'druid') { if (p.bear) this.bearOff(p); p.grove = null; return; }
    if (p.down) { if (p.bear) this.bearOff(p); p.grove = null; return; }
    if (p.bear) {
      p.mana = Math.max(0, (p.mana || 0) - (100 / p.stats.bearTime) * dt);
      if (p.mana <= 0) this.bearOff(p);
    }
    if (p.chargeT > 0) { p.chargeT -= dt; this.chargeHits(p); }
    const G = p.grove;
    if (G) {
      G.t -= dt; G.tick -= dt;
      if (G.tick <= 0) {
        G.tick = DRUID.grove.every;
        const r = DRUID.grove.r * Math.sqrt(p.stats.ultSize), pts = [];
        this.slotDo(p, 'ult', () => {
          for (const e of this.enemies) {
            if (e.dead || Math.hypot(e.x - p.x, e.y - p.y) > r + e.r || !this.los(p.x, p.y, e.x, e.y)) continue;
            this.damageEnemy(e, DRUID.grove.dmg * this.power(p), 0, 0, 0, p, false, 'nature');
            if (pts.length < 16) pts.push([R(e.x), R(e.y)]);
          }
        });
        if (pts.length) this.emit({ k: 'lash', id: p.id, pts });
        p.lastFight = this.time;
      }
      if (G.t <= 0) p.grove = null;
    }
  },

  druidDash(p) {
    if (!p.bear) return;
    p.chargeT = 0.28; p.chargeSet = new Set(); p.chargeHit = false;
  },

  // ---------------------------------------------------- Archer: Fire Arrow (Q)
  fireArrowSkill(p) {
    const F = BOWMAN.fireArrow, st = p.stats, sp = F.speed * PACE;
    p.cd.s3 = st.fireArrowCd;
    this.emit({ k: 'fireArrow', id: p.id, a: r2(p.aim) });
    this.shots.push({ id: this.nextId++, kind: 'farrow', owner: p.id, x: p.x + Math.cos(p.aim) * 10, y: p.y - 12 + Math.sin(p.aim) * 10,
      vx: Math.cos(p.aim) * sp, vy: Math.sin(p.aim) * sp, life: F.range / sp, dmg: F.dmg * st.arrowMult * this.power(p), hit: new Set(), gone: 0,
      trailDps: F.trailDps * st.arrowMult * this.power(p) });
  },
  // (called from updateShots) fire arrows pierce everything and drop fire as they fly
  fireArrowStep(s, target, hit, owner, dt) {
    const F = BOWMAN.fireArrow;
    s.gone += Math.hypot(s.vx, s.vy) * dt;
    if (s.gone >= F.every || !s.lastFire) {
      s.gone = 0; s.lastFire = 1;
      this.zones.push({ id: this.nextId++, kind: 'pyre', owner: s.owner, x: s.x, y: s.y + 10, vx: 0, vy: 0, r: F.trailR, t: F.trailTime, max: F.trailTime, dps: s.trailDps });
    }
    if (target) {
      const d = Math.hypot(s.vx, s.vy) || 1;
      s.hit.add(target.id);
      this.damageEnemy(target, s.dmg, s.vx / d, s.vy / d, 120, owner, false, 'fire');
      target.burnT = 1;
    } else if (hit || s.life <= 0) { s.life = 0; this.emit({ k: 'thunk', x: R(s.x), y: R(s.y) }); }
  },

  // ---------------------------------------------------- Rogue: Twin Fang (right click)
  rogueHeavy(p) {
    const H = ROGUE.heavy, st = p.stats;
    p.cd.s2 = st.heavyCd;
    p.cd.atk = Math.max(p.cd.atk, H.recover);
    const tgt = this.rogueTarget(p);
    if (tgt) this.rogueHop(p, tgt);
    const aim = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.aim;
    const amb = p.ambushT > 0 ? 1 + st.ambush : 1;
    p.ambushT = 0;
    this.emit({ k: 'twin', id: p.id, a: r2(aim) });
    this.hitArc(p, H.range, H.arc, H.dmg * st.stabMult * this.power(p) * amb, H.kb, aim, { backstab: st.backstab });
  },
};

export function installDruid(Sim) { Object.assign(Sim.prototype, D); }
