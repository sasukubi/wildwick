// =============================================================
//  World: the tile map (trees vs open ground), collision, and
//  the generators for the campfire lobby, forest stages and the
//  boss arena.
// =============================================================
import { TILE, CLASSES, RULES } from './data.js';
import { RNG, hash2 } from './rng.js';

export class World {
  constructor(w, h, kind, seed = 0) {
    this.w = w;
    this.h = h;
    this.kind = kind;          // 'lobby', 'forest' or 'arena'
    this.seed = seed;
    this.solid = new Uint8Array(w * h).fill(1); // 1 = tree, 0 = open
    this.path = new Uint8Array(w * h);          // 1 = dirt path (looks only)
    this.rocks = new Uint8Array(w * h);         // 1 = this solid tile is a rock, not a tree
    this.props = [];
    this.decor = [];
    this.glows = [];
    this.shrines = [];         // Heartwood shrines {x, y}
    this.spawn = { x: 0, y: 0 };
    this.exit = null;          // the Heartwood Gate {x, y, r}
    this.bossSpawn = null;
    this.readyZone = null;
    this.campfire = null;
    this.clearings = [];
    this.wolfSpawns = [];
  }

  get pw() { return this.w * TILE; }
  get ph() { return this.h * TILE; }
  idx(tx, ty) { return ty * this.w + tx; }

  isSolid(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.solid[ty * this.w + tx] === 1;
  }
  isPath(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.path[ty * this.w + tx] === 1 && this.solid[ty * this.w + tx] === 0;
  }

  setOpen(tx, ty) {
    if (tx < 1 || ty < 1 || tx >= this.w - 1 || ty >= this.h - 1) return;
    this.solid[ty * this.w + tx] = 0;
  }

  // Push a circle (x, y, radius r) out of trees and props. Returns the fixed position.
  collide(x, y, r) {
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
      const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.isSolid(tx, ty)) continue;
          const rx = tx * TILE, ry = ty * TILE;
          const cx = Math.max(rx, Math.min(x, rx + TILE));
          const cy = Math.max(ry, Math.min(y, ry + TILE));
          const dx = x - cx, dy = y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            x += (dx / d) * (r - d);
            y += (dy / d) * (r - d);
          } else {
            const l = x - rx, rr = rx + TILE - x, t = y - ry, b = ry + TILE - y;
            const m = Math.min(l, rr, t, b);
            if (m === l) x = rx - r;
            else if (m === rr) x = rx + TILE + r;
            else if (m === t) y = ry - r;
            else y = ry + TILE + r;
          }
          moved = true;
        }
      }
      for (const p of this.props) {
        if (!p.solidR) continue;
        const dx = x - p.x, dy = y - p.y;
        const min = r + p.solidR;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.001;
          x = p.x + (dx / d) * min;
          y = p.y + (dy / d) * min;
          moved = true;
        }
      }
      if (!moved) break;
    }
    x = Math.max(r, Math.min(this.pw - r, x));
    y = Math.max(r, Math.min(this.ph - r, y));
    return { x, y };
  }

  // Can you see (and hit) from one point to another without a tree or rock in the way?
  lineOfSight(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isSolid(Math.floor((x0 + (x1 - x0) * t) / TILE), Math.floor((y0 + (y1 - y0) * t) / TILE))) return false;
    }
    return true;
  }

  // Distance map (in tiles) from a point to everywhere, walking around trees.
  // Enemies follow it downhill to find their way to you.
  flowField(x, y) {
    const w = this.w, h = this.h;
    const dist = new Int16Array(w * h).fill(-1);
    const sx = Math.floor(x / TILE), sy = Math.floor(y / TILE);
    if (this.isSolid(sx, sy)) return dist;
    const q = new Int32Array(w * h);
    let head = 0, tail = 0;
    dist[sy * w + sx] = 0;
    q[tail++] = sy * w + sx;
    while (head < tail) {
      const i = q[head++], cx = i % w, cy = (i / w) | 0, nd = dist[i] + 1;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox, ny = cy + oy;
        if (this.isSolid(nx, ny)) continue;
        if (ox && oy && (this.isSolid(cx + ox, cy) || this.isSolid(cx, cy + oy))) continue; // no corner cutting
        const j = ny * w + nx;
        if (dist[j] !== -1) continue;
        dist[j] = nd;
        q[tail++] = j;
      }
    }
    return dist;
  }

  // Which way to step from (x, y) to go downhill on a flow field.
  flowDir(dist, x, y) {
    const w = this.w, cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    const here = dist[cy * w + cx];
    let best = null, bd = here < 0 ? 1e9 : here;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = cx + ox, ny = cy + oy;
      if (this.isSolid(nx, ny)) continue;
      if (ox && oy && (this.isSolid(cx + ox, cy) || this.isSolid(cx, cy + oy))) continue;
      const v = dist[ny * w + nx];
      if (v >= 0 && v < bd) { bd = v; best = [nx, ny]; }
    }
    if (!best) return null;
    const tx = (best[0] + 0.5) * TILE - x, ty = (best[1] + 0.5) * TILE - y, l = Math.hypot(tx, ty) || 1;
    return [tx / l, ty / l];
  }

  randomOpenPoint(rng, cx, cy, minD, maxD, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const a = rng.float(0, Math.PI * 2);
      const d = rng.float(minD, maxD);
      const tx = Math.floor((cx + Math.cos(a) * d) / TILE);
      const ty = Math.floor((cy + Math.sin(a) * d) / TILE);
      if (this.isSolid(tx, ty) || this.isSolid(tx + 1, ty) || this.isSolid(tx - 1, ty) ||
          this.isSolid(tx, ty + 1) || this.isSolid(tx, ty - 1)) continue;
      return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    }
    return null;
  }

  // The host sends the exact grid to everyone so all maps match perfectly.
  toMsg() {
    return {
      kind: this.kind, seed: this.seed,
      grid: Array.from(this.solid).join(''), path: Array.from(this.path).join(''), rocks: Array.from(this.rocks).join(''),
      exit: this.exit, spawn: this.spawn, shrines: this.shrines, bossSpawn: this.bossSpawn,
    };
  }

  static fromMsg(m) {
    const w = m.kind === 'lobby' ? makeLobby() : m.kind === 'arena' ? makeArena(m.seed) : makeForest(m.seed);
    for (let i = 0; i < w.solid.length; i++) {
      w.solid[i] = m.grid.charCodeAt(i) === 49 ? 1 : 0;
      if (m.path) w.path[i] = m.path.charCodeAt(i) === 49 ? 1 : 0;
      if (m.rocks) w.rocks[i] = m.rocks.charCodeAt(i) === 49 ? 1 : 0;
    }
    w.exit = m.exit || null;
    if (m.spawn) w.spawn = m.spawn;
    w.shrines = m.shrines || [];
    w.bossSpawn = m.bossSpawn || null;
    return w;
  }
}

// Grass tufts, flowers, stones, bushes and glowing mushrooms.
function decorate(world, rng) {
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      if (world.isSolid(tx, ty)) continue;
      const x = Math.round((tx + rng.float(0.1, 0.9)) * TILE);
      const y = Math.round((ty + rng.float(0.15, 0.95)) * TILE);
      const r = rng.next();
      const onPath = world.isPath(tx, ty);
      if (!onPath) {
        if (r < 0.3) world.decor.push({ k: 'tuft', x, y, v: rng.int(0, 2) });
        else if (r < 0.37) world.decor.push({ k: 'flower', x, y, c: rng.int(0, 3) });
        else if (r < 0.39) world.decor.push({ k: 'stone', x, y, v: rng.int(0, 1) });
        else if (r < 0.41) world.decor.push({ k: 'bush', x, y });
      } else if (r < 0.08) world.decor.push({ k: 'pebble', x, y });
      const nearWall = world.isSolid(tx - 1, ty) || world.isSolid(tx + 1, ty) ||
                       world.isSolid(tx, ty - 1) || world.isSolid(tx, ty + 1);
      if (nearWall && rng.chance(0.06)) {
        world.glows.push({
          x: Math.round((tx + 0.5) * TILE + rng.float(-8, 8)),
          y: Math.round((ty + 0.6) * TILE + rng.float(-6, 6)),
          c: rng.chance(0.6) ? [90, 220, 255] : [180, 130, 255],
          ph: rng.float(0, 6.28),
        });
      }
    }
  }
}

function markPathDisc(world, x, y, r) {
  for (let ty = Math.floor(y - r); ty <= Math.ceil(y + r); ty++)
    for (let tx = Math.floor(x - r); tx <= Math.ceil(x + r); tx++)
      if (tx >= 0 && ty >= 0 && tx < world.w && ty < world.h && Math.hypot(tx + 0.5 - x, ty + 0.5 - y) <= r)
        world.path[world.idx(tx, ty)] = 1;
}

// ---- The campfire lobby ------------------------------------
export function makeLobby() {
  const w = 32, h = 26;
  const world = new World(w, h, 'lobby', 0);
  const cx = 16, cy = 14, R = 9.3;
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++)
      if (Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) < R + (hash2(tx, ty) - 0.5) * 1.4) world.setOpen(tx, ty);
  for (let ty = 1; ty <= cy; ty++) for (let tx = cx - 2; tx < cx + 2; tx++) world.setOpen(tx, ty);
  for (let ty = 1; ty <= cy - 2; ty++) markPathDisc(world, cx, ty + 0.5, 1.3);
  markPathDisc(world, cx, cy, 3.7);

  const T = TILE, fx = cx * T, fy = cy * T;
  world.campfire = { x: fx, y: fy };
  world.props.push({ type: 'campfire', x: fx, y: fy, solidR: 18 });
  world.props.push({ type: 'wardrobe', x: fx - 6.6 * T, y: fy + 0.4 * T, solidR: 15 });
  CLASSES.forEach((c, i) => {
    const a = -1.05 + i * (2.1 / (CLASSES.length - 1));
    world.props.push({ type: 'shrine', cls: c.id, x: Math.round(fx + Math.cos(a) * 6.6 * T), y: Math.round(fy + Math.sin(a) * 6.6 * T), solidR: 10 });
  });
  world.readyZone = { x: (cx - 2) * T, y: 1 * T, w: 4 * T, h: 3 * T };
  world.spawn = { x: fx, y: fy + 3 * T };
  decorate(world, new RNG(7));
  return world;
}

// ---- A forest stage ----------------------------------------
export function makeForest(seed) {
  const rng = new RNG(seed);
  const w = 64, h = 48;
  const world = new World(w, h, 'forest', seed);

  const cl = [];
  for (let i = 0; i < 400 && cl.length < 9; i++) {
    const r = rng.float(3.6, 6.2);
    const x = rng.float(r + 3, w - r - 3), y = rng.float(r + 3, h - r - 3);
    if (cl.every((c) => Math.hypot(c.x - x, c.y - y) > c.r + r + 3)) cl.push({ x, y, r });
  }
  cl.sort((a, b) => a.x - b.x);
  cl[0].r = Math.max(cl[0].r, 5);
  cl[cl.length - 1].r = Math.max(cl[cl.length - 1].r, 6);

  const carveDisc = (x, y, r) => {
    for (let ty = Math.floor(y - r); ty <= Math.ceil(y + r); ty++)
      for (let tx = Math.floor(x - r); tx <= Math.ceil(x + r); tx++)
        if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) <= r) world.setOpen(tx, ty);
  };
  for (const c of cl) {
    for (let ty = Math.floor(c.y - c.r - 2); ty <= Math.ceil(c.y + c.r + 2); ty++)
      for (let tx = Math.floor(c.x - c.r - 2); tx <= Math.ceil(c.x + c.r + 2); tx++) {
        const d = Math.hypot(tx + 0.5 - c.x, ty + 0.5 - c.y);
        if (d < c.r + (hash2(tx * 3 + (seed % 101), ty * 5) - 0.5) * 1.8) world.setOpen(tx, ty);
      }
  }

  const carvePath = (a, b) => {
    let x = a.x, y = a.y;
    for (let i = 0; i < 3000 && Math.hypot(b.x - x, b.y - y) > 1; i++) {
      const ang = Math.atan2(b.y - y, b.x - x) + rng.float(-0.8, 0.8);
      x += Math.cos(ang) * 0.5;
      y += Math.sin(ang) * 0.5;
      carveDisc(x, y, rng.float(1.3, 1.9));
      markPathDisc(world, x, y, 0.75);
    }
  };
  const linked = [0];
  const rest = cl.map((_, i) => i).slice(1);
  while (rest.length) {
    let best = null;
    for (const a of linked) for (const b of rest) {
      const d = Math.hypot(cl[a].x - cl[b].x, cl[a].y - cl[b].y);
      if (!best || d < best.d) best = { a, b, d };
    }
    carvePath(cl[best.a], cl[best.b]);
    linked.push(best.b);
    rest.splice(rest.indexOf(best.b), 1);
  }
  for (let k = 0; k < 2; k++) {
    const a = rng.int(0, cl.length - 1), b = rng.int(0, cl.length - 1);
    if (a !== b && Math.hypot(cl[a].x - cl[b].x, cl[a].y - cl[b].y) < 22) carvePath(cl[a], cl[b]);
  }

  // lone trees and boulders inside clearings for cover
  const S = cl[0], E = cl[cl.length - 1];
  for (let ty = 2; ty < h - 2; ty++) {
    for (let tx = 2; tx < w - 2; tx++) {
      if (world.isSolid(tx, ty) || world.path[world.idx(tx, ty)]) continue;
      if (Math.hypot(tx + 0.5 - S.x, ty + 0.5 - S.y) < 3.5 || Math.hypot(tx + 0.5 - E.x, ty + 0.5 - E.y) < 4.5) continue;
      if (!rng.chance(0.035)) continue;
      let open = true;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && world.isSolid(tx + ox, ty + oy)) open = false;
      if (open) { world.solid[world.idx(tx, ty)] = 1; if (rng.chance(0.4)) world.rocks[world.idx(tx, ty)] = 1; }
    }
  }

  world.clearings = cl;
  world.spawn = { x: Math.round(S.x * TILE), y: Math.round(S.y * TILE) };
  world.exit = { x: Math.round(E.x * TILE), y: Math.round((E.y - 1.5) * TILE), r: 60 };
  carveDisc(S.x, S.y, 2.5);
  carveDisc(E.x, E.y, 3);
  world.bossSpawn = { x: Math.round(E.x * TILE), y: Math.round((E.y + 1) * TILE) };
  markPathDisc(world, E.x, E.y - 1.5, 2.2);

  // Heartwood shrine in a middle clearing (sometimes)
  if (cl.length > 3 && rng.chance(RULES.shrineChance)) {
    const c = cl[rng.int(1, cl.length - 2)];
    world.shrines.push({ x: Math.round(c.x * TILE), y: Math.round(c.y * TILE) });
    carveDisc(c.x, c.y, 1.6);
  }

  for (let i = 1; i < cl.length; i++) {
    const c = cl[i];
    const n = i === cl.length - 1 ? 2 : rng.int(2, 3);
    for (let j = 0; j < n; j++) {
      const p = world.randomOpenPoint(rng, c.x * TILE, c.y * TILE, 0, (c.r - 1) * TILE);
      if (p) world.wolfSpawns.push(p);
    }
  }

  decorate(world, rng);
  return world;
}

// ---- The boss arena ----------------------------------------
export function makeArena(seed) {
  const rng = new RNG(seed);
  const w = 40, h = 36;
  const world = new World(w, h, 'arena', seed);
  const cx = 20, cy = 18, R = 14;
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++)
      if (Math.hypot(tx + 0.5 - cx, (ty + 0.5 - cy) * 1.1) < R + (hash2(tx + seed % 50, ty) - 0.5) * 1.5) world.setOpen(tx, ty);
  // a few boulders to hide behind
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.float(-0.3, 0.3);
    const tx = Math.round(cx + Math.cos(a) * 8), ty = Math.round(cy + Math.sin(a) * 7);
    world.solid[world.idx(tx, ty)] = 1;
    world.rocks[world.idx(tx, ty)] = 1;
  }
  markPathDisc(world, cx, cy - 4, 4);
  for (let ty = cy; ty < cy + 12; ty++) markPathDisc(world, cx, ty + 0.5, 1);
  world.spawn = { x: cx * TILE, y: (cy + 10) * TILE };
  world.bossSpawn = { x: cx * TILE, y: (cy - 5) * TILE };
  decorate(world, rng);
  return world;
}
