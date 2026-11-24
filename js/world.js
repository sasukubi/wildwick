// =============================================================
//  World: the tile map (trees vs open ground), collision, and
//  the generators for the campfire lobby and the forest stage.
// =============================================================
import { TILE, CLASSES } from './data.js';
import { RNG, hash2 } from './rng.js';

export class World {
  constructor(w, h, kind, seed = 0) {
    this.w = w;
    this.h = h;
    this.kind = kind;          // 'lobby' or 'forest'
    this.seed = seed;
    this.solid = new Uint8Array(w * h).fill(1); // 1 = tree, 0 = open
    this.props = [];           // round solid objects (campfire, wardrobe, shrines)
    this.decor = [];           // ground details, drawn once
    this.glows = [];           // glowing mushrooms
    this.spawn = { x: 0, y: 0 };
    this.exit = null;          // the Heartwood Gate {x, y, r}
    this.readyZone = null;     // lobby: stand here to start a run
    this.campfire = null;
    this.clearings = [];
    this.wolfSpawns = [];
  }

  get pw() { return this.w * TILE; }
  get ph() { return this.h * TILE; }

  isSolid(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.solid[ty * this.w + tx] === 1;
  }

  setOpen(tx, ty) {
    if (tx < 1 || ty < 1 || tx >= this.w - 1 || ty >= this.h - 1) return;
    this.solid[ty * this.w + tx] = 0;
  }

  solidAt(px, py) { return this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE)); }

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
            // centre is inside the tile: push out the shortest way
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

  // Find a random open spot between minD and maxD away from (cx, cy).
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

  // The host sends the exact tree grid to everyone so all maps match perfectly.
  toMsg() {
    return { kind: this.kind, seed: this.seed, grid: Array.from(this.solid).join(''), exit: this.exit, spawn: this.spawn };
  }

  static fromMsg(m) {
    const w = m.kind === 'lobby' ? makeLobby() : makeForest(m.seed);
    for (let i = 0; i < w.solid.length; i++) w.solid[i] = m.grid.charCodeAt(i) === 49 ? 1 : 0;
    if (m.exit) w.exit = m.exit;
    if (m.spawn) w.spawn = m.spawn;
    return w;
  }
}

// Grass, flowers, stones and glowing mushrooms.
function decorate(world, rng) {
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      if (world.isSolid(tx, ty)) continue;
      const x = (tx + rng.float(0.1, 0.9)) * TILE;
      const y = (ty + rng.float(0.1, 0.9)) * TILE;
      const r = rng.next();
      if (r < 0.28) world.decor.push({ k: 'grass', x, y, s: rng.float(0.7, 1.3) });
      else if (r < 0.34) world.decor.push({ k: 'flower', x, y, c: rng.int(0, 3) });
      else if (r < 0.36) world.decor.push({ k: 'stone', x, y, s: rng.float(0.6, 1.2) });
      const nearWall = world.isSolid(tx - 1, ty) || world.isSolid(tx + 1, ty) ||
                       world.isSolid(tx, ty - 1) || world.isSolid(tx, ty + 1);
      if (nearWall && rng.chance(0.07)) {
        world.glows.push({
          x: (tx + 0.5) * TILE + rng.float(-10, 10),
          y: (ty + 0.5) * TILE + rng.float(-10, 10),
          c: rng.chance(0.6) ? [90, 220, 255] : [180, 130, 255],
          ph: rng.float(0, 6.28),
        });
      }
    }
  }
}

// ---- The campfire lobby ------------------------------------
export function makeLobby() {
  const w = 32, h = 26;
  const world = new World(w, h, 'lobby', 0);
  const cx = 16, cy = 14, R = 9.3;
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const d = Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy);
      if (d < R + (hash2(tx, ty) - 0.5) * 1.4) world.setOpen(tx, ty);
    }
  }
  // the glowing path north, into the wilds
  for (let ty = 1; ty <= cy; ty++) for (let tx = cx - 2; tx < cx + 2; tx++) world.setOpen(tx, ty);

  const T = TILE, fx = cx * T, fy = cy * T;
  world.campfire = { x: fx, y: fy };
  world.props.push({ type: 'campfire', x: fx, y: fy, solidR: 24 });
  world.props.push({ type: 'wardrobe', x: fx - 6.6 * T, y: fy + 0.4 * T, solidR: 20 });
  CLASSES.forEach((c, i) => {
    const a = -1.05 + i * (2.1 / (CLASSES.length - 1));
    world.props.push({ type: 'shrine', cls: c.id, x: fx + Math.cos(a) * 6.6 * T, y: fy + Math.sin(a) * 6.6 * T, solidR: 13 });
  });
  world.readyZone = { x: (cx - 2) * T, y: 1 * T, w: 4 * T, h: 3 * T };
  world.spawn = { x: fx, y: fy + 3 * T };
  decorate(world, new RNG(7));
  return world;
}

// ---- A forest stage ----------------------------------------
export function makeForest(seed) {
  const rng = new RNG(seed);
  const w = 84, h = 64;
  const world = new World(w, h, 'forest', seed);

  // 1. scatter round clearings
  const cl = [];
  for (let i = 0; i < 400 && cl.length < 11; i++) {
    const r = rng.float(3.8, 7);
    const x = rng.float(r + 4, w - r - 4), y = rng.float(r + 4, h - r - 4);
    if (cl.every((c) => Math.hypot(c.x - x, c.y - y) > c.r + r + 3)) cl.push({ x, y, r });
  }
  cl.sort((a, b) => a.x - b.x);
  cl[0].r = Math.max(cl[0].r, 5.5);
  cl[cl.length - 1].r = Math.max(cl[cl.length - 1].r, 5.5);

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

  // 2. join the clearings with winding paths (a tree of shortest links, plus a couple of loops)
  const carvePath = (a, b) => {
    let x = a.x, y = a.y;
    for (let i = 0; i < 3000 && Math.hypot(b.x - x, b.y - y) > 1; i++) {
      const ang = Math.atan2(b.y - y, b.x - x) + rng.float(-0.8, 0.8);
      x += Math.cos(ang) * 0.5;
      y += Math.sin(ang) * 0.5;
      carveDisc(x, y, rng.float(1.3, 1.9));
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
    if (a !== b && Math.hypot(cl[a].x - cl[b].x, cl[a].y - cl[b].y) < 26) carvePath(cl[a], cl[b]);
  }

  // 3. lone trees inside clearings for cover
  const S = cl[0], E = cl[cl.length - 1];
  for (let ty = 2; ty < h - 2; ty++) {
    for (let tx = 2; tx < w - 2; tx++) {
      if (world.isSolid(tx, ty)) continue;
      if (Math.hypot(tx + 0.5 - S.x, ty + 0.5 - S.y) < 3.5 || Math.hypot(tx + 0.5 - E.x, ty + 0.5 - E.y) < 3.5) continue;
      if (!rng.chance(0.035)) continue;
      let open = true;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && world.isSolid(tx + ox, ty + oy)) open = false;
      if (open) world.solid[ty * w + tx] = 1;
    }
  }

  world.clearings = cl;
  world.spawn = { x: S.x * TILE, y: S.y * TILE };
  world.exit = { x: Math.round(E.x * TILE), y: Math.round(E.y * TILE), r: 75 };
  carveDisc(S.x, S.y, 2.5);
  carveDisc(E.x, E.y, 2.5);

  // 4. wolf packs in every clearing except the start
  for (let i = 1; i < cl.length; i++) {
    const c = cl[i];
    const n = rng.int(2, 3) + (i === cl.length - 1 ? 1 : 0);
    for (let j = 0; j < n; j++) {
      const p = world.randomOpenPoint(rng, c.x * TILE, c.y * TILE, 0, (c.r - 1) * TILE);
      if (p) world.wolfSpawns.push(p);
    }
  }

  decorate(world, rng);
  return world;
}
