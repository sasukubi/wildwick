// =============================================================
//  Pixel art, painted by code (original art, no image files).
//  Every sprite is drawn pixel-by-pixel onto a small canvas once,
//  then reused. The game zooms these up with sharp pixels.
// =============================================================
import { hash2 } from './rng.js';

// ---------------------------------------------------------- palette
export const PAL = {
  g0: '#2f4319', g1: '#3e5622', g2: '#4b672a', g3: '#5d7d33', g4: '#76983f',
  d0: '#4f3a25', d1: '#6b4f33', d2: '#84643f', d3: '#9c7a52',
  l0: '#14260f', l1: '#1f3a17', l2: '#2c5220', l3: '#3f6e2b', l4: '#5b8f39', l5: '#7aae4a',
  p0: '#10251a', p1: '#1a3a28', p2: '#265236', p3: '#376c46',
  b0: '#2e1d13', b1: '#45301f', b2: '#5e432b', b3: '#77573a',
  r0: '#3c3f3b', r1: '#5a5e58', r2: '#7b8078', r3: '#9ea398', moss: '#5b7d31',
  o: '#1a120d', skin: '#e8b994', skin2: '#c48f6c', hair: '#4a3326', hair2: '#33231a',
  boot: '#2b2220', belt: '#3b2a1e', gold: '#d9b35a', pack: '#6b4a2f', pack2: '#4b3220', strap: '#3a2617',
  steel: '#c9d1da', steel2: '#8d97a3', steel3: '#eef3f8',
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}
function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); }
// pixel-perfect filled ellipse, row by row
function oval(g, cx, cy, rx, ry, col) {
  g.fillStyle = col;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}
function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; gg *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; gg += (255 - gg) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}
const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// ---------------------------------------------------------- ground tiles (32x32)
export function grassTile(v, lobby = false) {
  return cached('grass' + v + lobby, () => {
    const [c, g] = canvas(32, 32);
    px(g, 0, 0, 32, 32, lobby ? PAL.g2 : PAL.g1);
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash2(i, v * 7 + 1) * 32), y = Math.floor(hash2(v * 13 + 2, i) * 32);
      const r = hash2(i * 3, v);
      px(g, x, y, 1, 1, r < 0.4 ? PAL.g0 : r < 0.8 ? (lobby ? PAL.g3 : PAL.g2) : PAL.g3);
    }
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(hash2(i + 50, v) * 30), y = Math.floor(hash2(v, i + 50) * 28) + 2;
      px(g, x, y, 1, 2, PAL.g3);
      px(g, x + 1, y - 1, 1, 2, PAL.g4);
    }
    return c;
  });
}

// dirt path tile; mask bits say which neighbours are also path (1 up, 2 right, 4 down, 8 left)
export function dirtTile(mask, v) {
  return cached('dirt' + mask + '_' + v, () => {
    const [c, g] = canvas(32, 32);
    px(g, 0, 0, 32, 32, PAL.d1);
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(hash2(i, v + 9) * 32), y = Math.floor(hash2(v + 3, i) * 32);
      px(g, x, y, 1, 1, hash2(i, i + v) < 0.5 ? PAL.d0 : PAL.d2);
    }
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(hash2(i + 70, v) * 28) + 2, y = Math.floor(hash2(v, i + 70) * 28) + 2;
      px(g, x, y, 2, 1, PAL.d3);
      px(g, x, y + 1, 2, 1, PAL.d0);
    }
    // grassy edges where the path ends
    const edge = (side) => {
      for (let i = 0; i < 32; i++) {
        const depth = 3 + Math.floor(hash2(i + side * 40, v) * 4);
        for (let k = 0; k < depth; k++) {
          const col = k === depth - 1 ? PAL.g0 : PAL.g1;
          if (side === 0) px(g, i, k, 1, 1, col);
          if (side === 1) px(g, 31 - k, i, 1, 1, col);
          if (side === 2) px(g, i, 31 - k, 1, 1, col);
          if (side === 3) px(g, k, i, 1, 1, col);
        }
      }
    };
    if (!(mask & 1)) edge(0);
    if (!(mask & 2)) edge(1);
    if (!(mask & 4)) edge(2);
    if (!(mask & 8)) edge(3);
    return c;
  });
}

// ---------------------------------------------------------- decor (painted straight into the ground image)
const FLOWER = ['#a8d8ff', '#ffb3d1', '#ffe58a', '#e0c8ff'];
export function paintDecor(g, d) {
  const { x, y } = d;
  switch (d.k) {
    case 'tuft':
      px(g, x, y - 2, 1, 3, PAL.g3); px(g, x + 2, y - 3, 1, 4, PAL.g4); px(g, x + 4, y - 2, 1, 3, PAL.g3);
      if (d.v) px(g, x + 1, y - 1, 1, 2, PAL.g4);
      break;
    case 'flower':
      px(g, x, y - 1, 1, 1, FLOWER[d.c]); px(g, x - 1, y, 1, 1, FLOWER[d.c]); px(g, x + 1, y, 1, 1, FLOWER[d.c]); px(g, x, y + 1, 1, 1, FLOWER[d.c]);
      px(g, x, y, 1, 1, '#fff6c0');
      px(g, x + 3, y + 1, 1, 1, FLOWER[(d.c + 1) % 4]);
      break;
    case 'stone':
      px(g, x - 2, y - 1, 5, 3, PAL.r1); px(g, x - 1, y - 2, 3, 1, PAL.r2); px(g, x - 1, y - 1, 2, 1, PAL.r3); px(g, x - 2, y + 2, 5, 1, PAL.r0);
      break;
    case 'pebble':
      px(g, x, y, 2, 1, PAL.d3); px(g, x, y + 1, 2, 1, PAL.d0);
      break;
    case 'bush':
      oval(g, x, y - 3, 6, 4, PAL.l1); oval(g, x - 1, y - 4, 5, 3, PAL.l2); px(g, x - 3, y - 6, 2, 1, PAL.l4); px(g, x + 1, y - 5, 1, 1, PAL.l3);
      px(g, x - 5, y + 1, 11, 1, 'rgba(0,0,0,0.3)');
      break;
  }
}

// ---------------------------------------------------------- trees
// Returns { canopy, trunk } images. Canopy is drawn above characters.
export function treeSprite(kind, v) {
  return cached('tree' + kind + v, () => {
    if (kind === 'pine') {
      const [c, g] = canvas(40, 52);
      const tiers = [[20, 6, 7], [20, 14, 11], [20, 23, 15], [20, 32, 18]];
      for (const [cx, top, half] of tiers) {
        for (let y = 0; y < 11; y++) {
          const w = Math.round((half * (y + 1)) / 11);
          px(g, cx - w - 1, top + y, w * 2 + 3, 1, PAL.p0);
        }
      }
      for (const [cx, top, half] of tiers) {
        for (let y = 0; y < 10; y++) {
          const w = Math.round((half * (y + 1)) / 11);
          px(g, cx - w, top + y, w * 2 + 1, 1, PAL.p1);
          px(g, cx - w, top + y, Math.max(1, w), 1, PAL.p2);
          if (y > 2 && hash2(y, top + v) < 0.5) px(g, cx - w + 1, top + y, 2, 1, PAL.p3);
        }
      }
      px(g, 19, 2, 2, 4, PAL.p2);
      const [t, tg] = canvas(40, 52);
      px(tg, 17, 40, 6, 10, PAL.b1); px(tg, 17, 40, 2, 10, PAL.b2); px(tg, 15, 49, 10, 2, PAL.b0);
      return { canopy: c, trunk: t, ox: 20, oy: 46 };
    }
    if (kind === 'birch') {
      // pale trunk with dark marks, light airy leaves
      const [c, g] = canvas(44, 54);
      const cx = 22, cy = 19;
      oval(g, cx, cy + 1, 17, 16, PAL.l1);
      for (const [bx, by, rx, ry] of [[-7, -3, 9, 8], [7, -5, 9, 8], [0, -10, 9, 6], [-6, 7, 8, 6], [7, 6, 8, 6]]) {
        oval(g, cx + bx, cy + by, rx, ry, '#4f7a2e'); oval(g, cx + bx - 2, cy + by - 2, rx - 3, ry - 3, '#6f9a3a'); px(g, cx + bx - 4, cy + by - 4, 3, 1, '#a6c95a');
      }
      for (let i = 0; i < 20; i++) px(g, cx - 14 + Math.floor(hash2(i, v + 11) * 28), cy - 12 + Math.floor(hash2(v + 13, i) * 24), 1, 1, hash2(i, 3) < 0.5 ? '#c9e07a' : PAL.l2);
      const [t, tg] = canvas(44, 54);
      px(tg, 19, 32, 6, 18, PAL.o); px(tg, 20, 33, 4, 17, '#e8e4da'); px(tg, 20, 33, 1, 17, '#ffffff');
      for (let y = 35; y < 50; y += 4) px(tg, 20 + (y % 3), y, 3, 1, '#3b3a36');
      px(tg, 15, 49, 14, 2, 'rgba(0,0,0,0.35)');
      return { canopy: c, trunk: t, ox: 22, oy: 48 };
    }
    if (kind === 'autumn') {
      // a round tree turning orange and red
      const [c, g] = canvas(48, 52);
      const cx = 24, cy = 20;
      const pal = v === 0 ? ['#5a2a10', '#a04a1a', '#d0702a', '#f0a040'] : v === 1 ? ['#4a1a14', '#8a2a1a', '#c0402a', '#e87a4a'] : ['#5a4410', '#9a7a1a', '#c8a030', '#f0d060'];
      oval(g, cx, cy + 1, 20, 17, pal[0]);
      for (const [bx, by, rx, ry] of [[-9, -4, 10, 9], [8, -6, 11, 9], [0, -10, 12, 8], [-10, 6, 9, 7], [10, 6, 9, 7], [0, 5, 12, 9]]) {
        oval(g, cx + bx, cy + by, rx, ry, pal[1]); oval(g, cx + bx - 2, cy + by - 2, rx - 3, ry - 3, pal[2]); px(g, cx + bx - 5, cy + by - 4, 3, 1, pal[3]);
      }
      for (let i = 0; i < 26; i++) px(g, cx - 17 + Math.floor(hash2(i, v + 21) * 34), cy - 14 + Math.floor(hash2(v + 23, i) * 28), 1, 1, hash2(i, 9) < 0.5 ? pal[0] : pal[3]);
      const [t, tg] = canvas(48, 52);
      px(tg, 21, 34, 7, 15, PAL.b1); px(tg, 21, 34, 2, 15, PAL.b2); px(tg, 26, 34, 2, 15, PAL.b0);
      px(tg, 17, 49, 15, 2, 'rgba(0,0,0,0.35)');
      // a few fallen leaves at the base
      for (let i = 0; i < 5; i++) px(tg, 14 + Math.floor(hash2(i, v) * 20), 47 + Math.floor(hash2(v, i) * 4), 2, 1, pal[2]);
      return { canopy: c, trunk: t, ox: 24, oy: 46 };
    }
    if (kind === 'dead') {
      // a bare, twisted dead tree
      const [c, g] = canvas(44, 54);
      const branch = (x0, y0, x1, y1, w) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let i = 0; i <= n; i++) { const k = i / n; px(g, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, w, w, PAL.b0); } };
      branch(22, 40, 21, 14, 4); branch(21, 20, 10, 8, 2); branch(21, 18, 33, 6, 2); branch(14, 12, 9, 2, 1); branch(30, 9, 36, 3, 1); branch(21, 14, 23, 2, 2);
      px(g, 20, 15, 2, 20, PAL.b1);
      if (v === 1) { px(g, 9, 7, 3, 2, PAL.moss); px(g, 31, 6, 3, 2, PAL.moss); }
      const [t, tg] = canvas(44, 54);
      px(tg, 19, 36, 6, 14, PAL.b0); px(tg, 20, 36, 2, 14, PAL.b1); px(tg, 14, 49, 16, 2, 'rgba(0,0,0,0.35)');
      return { canopy: c, trunk: t, ox: 22, oy: 48 };
    }
    if (kind === 'bigpine') {
      // a tall, narrow fir
      const [c, g] = canvas(36, 64);
      const tiers = [[18, 2, 5], [18, 10, 8], [18, 19, 11], [18, 28, 13], [18, 37, 15]];
      for (const [cx, top, half] of tiers) for (let y = 0; y < 11; y++) { const w = Math.round((half * (y + 1)) / 11); px(g, cx - w - 1, top + y, w * 2 + 3, 1, PAL.p0); }
      for (const [cx, top, half] of tiers) for (let y = 0; y < 10; y++) {
        const w = Math.round((half * (y + 1)) / 11);
        px(g, cx - w, top + y, w * 2 + 1, 1, '#18352a'); px(g, cx - w, top + y, Math.max(1, w), 1, PAL.p1);
        if (y > 2 && hash2(y, top + v) < 0.45) px(g, cx - w + 1, top + y, 2, 1, PAL.p2);
      }
      const [t, tg] = canvas(36, 64);
      px(tg, 16, 48, 5, 12, PAL.b1); px(tg, 16, 48, 2, 12, PAL.b2); px(tg, 12, 59, 12, 2, 'rgba(0,0,0,0.35)');
      return { canopy: c, trunk: t, ox: 18, oy: 58 };
    }
    if (kind === 'mushtree') {
      // a giant glowing mushroom: a touch of magic in the forest
      const [c, g] = canvas(44, 52);
      const cap = v === 0 ? ['#3a1a4a', '#6a3a8a', '#9a6aca', '#d0a8ff'] : ['#1a3a4a', '#2a6a8a', '#4aa0c8', '#a8e8ff'];
      oval(g, 22, 18, 20, 11, PAL.o); oval(g, 22, 17, 19, 10, cap[1]); oval(g, 20, 14, 14, 6, cap[2]); px(g, 12, 11, 6, 2, cap[3]);
      px(g, 4, 22, 36, 3, cap[0]);
      for (let i = 0; i < 6; i++) oval(g, 8 + Math.floor(hash2(i, v + 2) * 28), 12 + Math.floor(hash2(v + 4, i) * 8), 1, 1, cap[3]);
      const [t, tg] = canvas(44, 52);
      px(tg, 17, 24, 10, 25, PAL.o); px(tg, 18, 25, 8, 24, '#e8dcc8'); px(tg, 18, 25, 2, 24, '#ffffff'); px(tg, 24, 25, 2, 24, '#c8b8a0');
      px(tg, 13, 48, 18, 2, 'rgba(0,0,0,0.35)');
      return { canopy: c, trunk: t, ox: 22, oy: 46 };
    }
    if (kind === 'shrub') {
      // a big leafy bush (still blocks the way, like a tree)
      const [c, g] = canvas(44, 40);
      oval(g, 22, 24, 19, 13, PAL.l0); oval(g, 22, 23, 18, 12, PAL.l1);
      for (const [bx, by] of [[-8, -2], [7, -3], [0, -6], [-9, 5], [9, 5]]) { oval(g, 22 + bx, 23 + by, 8, 6, PAL.l2); oval(g, 20 + bx, 21 + by, 4, 3, PAL.l3); }
      if (v === 2) for (let i = 0; i < 6; i++) px(g, 8 + Math.floor(hash2(i, 5) * 28), 14 + Math.floor(hash2(5, i) * 16), 2, 2, '#e8e0f0');
      const [t, tg] = canvas(44, 40);
      px(tg, 6, 36, 32, 2, 'rgba(0,0,0,0.35)');
      return { canopy: c, trunk: t, ox: 22, oy: 36 };
    }
    // round oak
    const [c, g] = canvas(48, 52);
    const cx = 24, cy = 20;
    oval(g, cx, cy + 1, 21, 18, PAL.l0);
    oval(g, cx, cy, 20, 17, PAL.l1);
    const blobs = [[-9, -4, 10, 9], [8, -6, 11, 9], [0, -10, 12, 8], [-11, 6, 9, 7], [10, 6, 9, 7], [0, 5, 12, 9]];
    for (const [bx, by, rx, ry] of blobs) {
      oval(g, cx + bx, cy + by + 1, rx, ry, PAL.l1);
      oval(g, cx + bx - 1, cy + by, rx - 2, ry - 2, PAL.l2);
      oval(g, cx + bx - 3, cy + by - 2, Math.max(2, rx - 6), Math.max(2, ry - 5), PAL.l3);
      px(g, cx + bx - 5, cy + by - 4, 3, 1, PAL.l4);
    }
    for (let i = 0; i < 30; i++) {
      const x = cx - 17 + Math.floor(hash2(i, v + 3) * 34), y = cy - 14 + Math.floor(hash2(v + 5, i) * 28);
      if (hash2(x, y) < 0.5) px(g, x, y, 1, 1, PAL.l0); else px(g, x, y, 1, 1, PAL.l4);
    }
    if (v === 2) for (let i = 0; i < 5; i++) px(g, cx - 12 + Math.floor(hash2(i, 99) * 24), cy - 8 + Math.floor(hash2(99, i) * 18), 2, 2, '#d8504a');
    const [t, tg] = canvas(48, 52);
    px(tg, 21, 34, 7, 15, PAL.b1); px(tg, 21, 34, 2, 15, PAL.b2); px(tg, 26, 34, 2, 15, PAL.b0);
    px(tg, 18, 47, 3, 3, PAL.b1); px(tg, 28, 47, 3, 3, PAL.b1); px(tg, 17, 49, 15, 2, 'rgba(0,0,0,0.35)');
    return { canopy: c, trunk: t, ox: 24, oy: 46 };
  });
}

export function boulderSprite(v) {
  return cached('boulder' + v, () => {
    const [c, g] = canvas(36, 32);
    oval(g, 18, 27, 15, 4, 'rgba(0,0,0,0.35)');
    oval(g, 18, 18, 15, 11, PAL.r0);
    oval(g, 17, 17, 14, 10, PAL.r1);
    oval(g, 14, 14, 9, 6, PAL.r2);
    px(g, 10, 11, 5, 2, PAL.r3);
    oval(g, 18, 9, 9, 3, PAL.moss);
    px(g, 13, 8, 4, 1, '#7ea044');
    if (v) { px(g, 22, 18, 1, 6, PAL.r0); px(g, 23, 21, 2, 1, PAL.r0); }
    return c;
  });
}

// ---------------------------------------------------------- characters (24 x 36, feet at y=35)
// 8 facing directions. Left-facing ones are the right-facing ones mirrored.
export const CHAR_W = 24, CHAR_H = 36, CHAR_FOOT = 35;
// where the backpack torch's flame sits, relative to the feet
export const TORCH = {
  down: [-7, -32], downright: [-6, -32], right: [-7, -32], upright: [-3, -32], up: [4, -32],
  downleft: [6, -32], left: [7, -32], upleft: [3, -32],
};
export const BASE_DIR = { down: 'down', downright: 'downright', right: 'right', upright: 'upright', up: 'up', downleft: 'downright', left: 'right', upleft: 'upright' };

function paintHead(g, dir, hat, cloak) {
  const hx = dir === 'right' ? 13 : dir === 'downright' ? 12 : 12, hy = 14;
  const front = dir === 'down' || dir === 'downright';
  oval(g, hx, hy, 5, 5, PAL.o);
  if (dir === 'up' || dir === 'upright') {
    oval(g, hx, hy, 4, 4, PAL.hair);
    px(g, hx - 2, hy - 3, 3, 1, PAL.hair2);
    if (dir === 'upright') { px(g, hx + 3, hy, 2, 3, PAL.skin); px(g, hx + 4, hy + 1, 1, 1, PAL.skin2); }
  } else {
    oval(g, hx, hy, 4, 4, PAL.skin);
    px(g, hx - 4, hy + 2, 1, 2, PAL.skin2);
    px(g, hx - 4, hy - 4, 9, 3, PAL.hair);
    px(g, hx - 4, hy - 1, 1, 2, PAL.hair);
    if (dir === 'down') { px(g, hx + 4, hy - 1, 1, 2, PAL.hair); px(g, hx - 2, hy + 1, 1, 2, PAL.o); px(g, hx + 2, hy + 1, 1, 2, PAL.o); }
    else if (dir === 'downright') { px(g, hx - 4, hy - 1, 2, 3, PAL.hair); px(g, hx, hy + 1, 1, 2, PAL.o); px(g, hx + 3, hy + 1, 1, 2, PAL.o); px(g, hx + 4, hy + 2, 1, 1, PAL.skin2); }
    else { px(g, hx - 4, hy - 1, 3, 4, PAL.hair); px(g, hx + 2, hy + 1, 1, 2, PAL.o); px(g, hx + 5, hy + 2, 1, 1, PAL.skin2); }
  }
  const dk = shadeHex(cloak, -0.3);
  const hatDir = front ? (dir === 'down' ? 'down' : 'right') : dir === 'right' ? 'right' : 'up';
  switch (hat) {
    case 'hood':
      if (hatDir === 'up') { oval(g, hx, hy - 1, 6, 6, PAL.o); oval(g, hx, hy - 1, 5, 5, dk); if (dir === 'upright') px(g, hx + 4, hy, 1, 3, PAL.skin); }
      else {
        px(g, hx - 6, hy - 6, 13, 4, PAL.o); px(g, hx - 5, hy - 6, 11, 3, dk);
        px(g, hx - 6, hy - 3, 2, 7, PAL.o); px(g, hx - 5, hy - 3, 1, 6, dk);
        if (hatDir === 'down') { px(g, hx + 5, hy - 3, 2, 7, PAL.o); px(g, hx + 5, hy - 3, 1, 6, dk); }
        px(g, hx - 4, hy - 7, 9, 1, PAL.o);
      }
      break;
    case 'witch':
      px(g, hx - 8, hy - 5, 17, 2, PAL.o); px(g, hx - 7, hy - 5, 15, 1, '#3a2e52');
      for (let i = 0; i < 9; i++) { const w = 4 - Math.floor(i / 2.5); px(g, hx - w + Math.floor(i / 3), hy - 6 - i, w * 2 + 1, 1, i === 0 ? cloak : '#2a2238'); }
      px(g, hx + 3, hy - 15, 2, 1, '#2a2238');
      break;
    case 'antlers':
      for (const s of [-1, 1]) {
        px(g, hx + s * 3, hy - 6, 1, 2, '#9a7650'); px(g, hx + s * 4, hy - 8, 1, 2, '#9a7650'); px(g, hx + s * 5, hy - 10, 1, 2, '#b08a5e');
        px(g, hx + s * 6, hy - 9, 1, 1, '#b08a5e'); px(g, hx + s * 3, hy - 9, 1, 2, '#9a7650'); px(g, hx + s * 7, hy - 11, 1, 1, '#b08a5e');
      }
      break;
    case 'mushroom':
      px(g, hx - 7, hy - 4, 15, 1, '#e8d8c0');
      oval(g, hx, hy - 6, 7, 3, '#7e1f18'); oval(g, hx, hy - 7, 6, 3, '#c4372d');
      px(g, hx - 3, hy - 9, 2, 2, '#f4ece0'); px(g, hx + 2, hy - 8, 2, 1, '#f4ece0'); px(g, hx - 5, hy - 6, 1, 1, '#f4ece0');
      break;
    case 'circlet':
      px(g, hx - 4, hy - 3, 9, 1, '#e8c45c');
      if (front || dir === 'right') px(g, hx + (dir === 'down' ? 0 : 2), hy - 3, 1, 1, '#7fe8ff');
      break;
  }
}

// backpack + the torch pole; the flame itself is drawn live (it's your health)
function paintPack(g, dir, behind) {
  const pole = (x) => { px(g, x, 4, 1, 17, PAL.b2); px(g, x - 1, 3, 3, 2, PAL.steel2); px(g, x - 1, 2, 3, 1, PAL.o); };
  if (dir === 'up') { if (!behind) return; px(g, 6, 20, 12, 11, PAL.o); px(g, 7, 21, 10, 9, PAL.pack); px(g, 7, 21, 10, 3, PAL.pack2); px(g, 11, 24, 2, 2, PAL.gold); pole(16); }
  else if (dir === 'upright') { if (!behind) return; px(g, 4, 20, 11, 11, PAL.o); px(g, 5, 21, 9, 9, PAL.pack); px(g, 5, 21, 9, 3, PAL.pack2); px(g, 8, 24, 2, 2, PAL.gold); pole(9); }
  else if (dir === 'right') { if (behind) return; px(g, 3, 20, 6, 11, PAL.o); px(g, 4, 21, 4, 9, PAL.pack); px(g, 4, 21, 4, 2, PAL.pack2); pole(5); }
  else if (dir === 'downright') { if (behind) return; px(g, 3, 21, 4, 9, PAL.o); px(g, 4, 22, 2, 7, PAL.pack); pole(6); }
  else { if (behind) return; pole(5); }
}

function paintBody(g, dir, cloak, frame, cls) {
  const C = cloak, Cd = shadeHex(cloak, -0.35), Cl = shadeHex(cloak, 0.18);
  const robe = cls === 'sorcerer' || cls === 'cleric' || cls === 'warlock' || cls === 'druid';
  const s = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  if (dir === 'right') { px(g, 9 + s * 2, 30, 4, 5, PAL.boot); px(g, 13 - s * 2, 30, 4, 5, PAL.boot); }
  else {
    px(g, 8, 30 - Math.max(0, s), 3, 5 + Math.max(0, s), PAL.boot);
    px(g, 13, 30 - Math.max(0, -s), 3, 5 + Math.max(0, -s), PAL.boot);
  }
  const cx = 12, bottom = robe ? 33 : 31;
  for (let y = 19; y <= bottom; y++) {
    const half = (dir === 'right' ? 4 : 5) + Math.floor((y - 19) / (robe ? 3.5 : 4));
    px(g, cx - half - 1, y, half * 2 + 3, 1, PAL.o);
    px(g, cx - half, y, half * 2 + 1, 1, C);
    px(g, cx - half, y, 2, 1, Cl);
    px(g, cx + half - 1, y, 2, 1, Cd);
  }
  px(g, cx - 7, bottom, 15, 1, Cd);
  if (robe) {
    // sorcerer: long robe with a gold-trimmed hem, a sash and wide sleeves
    for (let x = cx - 7; x <= cx + 7; x += 3) px(g, x, bottom - 1, 1, 1, PAL.gold);
    px(g, cx - 5, 24, 11, 2, shadeHex(cloak, -0.5));
    if (dir !== 'up' && dir !== 'upright') px(g, cx - 1, 20, 3, 4, shadeHex(cloak, 0.35));
  } else {
    px(g, cx - 5, 25, 11, 2, PAL.belt);
    if (dir !== 'up' && dir !== 'upright') px(g, dir === 'right' ? cx + 1 : cx - 1, 25, 2, 2, PAL.gold);
  }
  const sleeve = robe ? Cd : null;
  if (dir === 'down') {
    if (sleeve) { px(g, 3, 22, 3, 3, sleeve); px(g, 18, 22, 3, 3, sleeve); }
    px(g, 4, 25, 2, 2, PAL.skin); px(g, 18, 25, 2, 2, PAL.skin); px(g, 8, 20, 1, 4, PAL.strap); px(g, 15, 20, 1, 4, PAL.strap);
  } else if (dir === 'downright') {
    if (sleeve) px(g, 16, 22, 3, 3, sleeve);
    px(g, 17, 25, 2, 2, PAL.skin); px(g, 9, 20, 1, 4, PAL.strap);
  } else if (dir === 'right') {
    if (sleeve) px(g, 14, 22, 3, 3, sleeve);
    px(g, 15, 25, 2, 2, PAL.skin);
  } else if (dir === 'upright') px(g, 17, 24, 2, 2, PAL.skin);
}

// small details that tell the classes apart
function paintClassExtras(g, dir, cls, cloak) {
  const front = dir === 'down' || dir === 'downright';
  if (cls === 'bowman') {
    // quiver strap across the chest, and arrows poking out of the quiver
    if (front) for (let i = 0; i < 8; i++) px(g, 7 + i, 20 + i, 1, 1, PAL.strap);
    if (dir === 'up' || dir === 'upright') { px(g, 15, 14, 3, 8, PAL.b1); px(g, 15, 12, 1, 3, '#e8e0c8'); px(g, 17, 11, 1, 4, '#e8e0c8'); px(g, 15, 11, 1, 1, '#c4533a'); px(g, 17, 10, 1, 1, '#c4533a'); }
    else if (dir === 'right') { px(g, 6, 15, 3, 7, PAL.b1); px(g, 6, 13, 1, 3, '#e8e0c8'); px(g, 8, 12, 1, 4, '#e8e0c8'); }
    px(g, dir === 'right' ? 15 : 17, 23, 2, 2, PAL.b2); // leather bracer
  } else if (cls === 'rogue') {
    // dark scarf over the lower face, and dagger sheaths on the belt
    const hx = dir === 'right' ? 13 : 12;
    if (front) { px(g, hx - 4, 16, 9, 3, '#2a2530'); px(g, hx - 3, 16, 7, 1, '#3d3647'); }
    else if (dir === 'right') { px(g, hx - 1, 16, 6, 3, '#2a2530'); }
    px(g, 6, 25, 2, 4, '#2a2530'); px(g, 16, 25, 2, 4, '#2a2530');
    if (dir === 'up' || dir === 'upright') px(g, 8, 18, 8, 2, '#2a2530'); // scarf tail
  } else if (cls === 'cleric') {
    // pale tabard with brass trim down the front, and a brass clasp
    if (front) {
      const cx = dir === 'down' ? 12 : 13;
      px(g, cx - 2, 20, 5, 13, PAL.o); px(g, cx - 1, 20, 3, 13, '#efe6d2'); px(g, cx - 1, 20, 1, 13, '#fffaf0');
      px(g, cx - 1, 25, 3, 1, '#c9a24a'); px(g, cx, 22, 1, 2, '#c9a24a'); px(g, cx - 1, 23, 3, 1, '#c9a24a'); // a little sun sign
      px(g, cx - 2, 32, 5, 1, '#c9a24a');
    } else if (dir === 'right') { px(g, 13, 20, 3, 13, '#efe6d2'); px(g, 13, 25, 3, 1, '#c9a24a'); }
    else { px(g, 7, 19, 10, 2, '#efe6d2'); px(g, 7, 21, 10, 1, '#c9a24a'); } // mantle seen from behind
  } else if (cls === 'druid') {
    // a leafy green mantle, a vine belt with an acorn, and little antlers on the hood
    const L = '#3f7a2e', L2 = '#6fb04a', L3 = '#9be36a';
    if (front || dir === 'right') {
      px(g, 5, 19, 15, 3, PAL.o); px(g, 6, 19, 13, 2, L); px(g, 6, 21, 13, 1, '#2f5a22');
      for (let x = 6; x < 19; x += 3) px(g, x, 19, 1, 1, L3);
      px(g, 7, 25, 11, 1, '#5a8a3a'); px(g, 15, 26, 2, 2, '#9a6a3a'); px(g, 15, 25, 2, 1, '#5a3a22');
    } else { px(g, 5, 18, 15, 6, PAL.o); px(g, 6, 18, 13, 5, L); px(g, 7, 19, 3, 2, L2); px(g, 13, 20, 3, 2, L2); }
    // hood rim + antlers
    const hx = dir === 'right' ? 13 : 12, hy = 14;
    px(g, hx - 5, hy - 6, 11, 2, PAL.o); px(g, hx - 4, hy - 6, 9, 1, L);
    for (const s of [-1, 1]) {
      if (dir === 'right' && s < 0) continue;
      px(g, hx + s * 3, hy - 8, 1, 2, '#b08a5e'); px(g, hx + s * 4, hy - 10, 1, 2, '#c49a6a'); px(g, hx + s * 5, hy - 11, 1, 1, '#c49a6a');
      px(g, hx + s * 2, hy - 10, 1, 1, '#c49a6a'); px(g, hx + s * 6, hy - 9, 1, 1, '#b08a5e');
    }
  } else if (cls === 'warlock') {
    // a deep-purple mantle over the shoulders and a bone charm hanging from the belt
    const M = '#2a1a40', M2 = '#3d2760';
    if (front || dir === 'right') {
      px(g, 5, 19, 15, 3, PAL.o); px(g, 6, 19, 13, 2, M2); px(g, 6, 21, 13, 1, M);
      const bx = dir === 'right' ? 15 : 15;
      px(g, bx, 26, 1, 3, '#8a7a6a'); px(g, bx - 1, 29, 3, 3, PAL.o); px(g, bx, 29, 1, 2, '#e8e0c8'); px(g, bx - 1, 29, 1, 1, '#e8e0c8'); px(g, bx + 1, 29, 1, 1, '#e8e0c8');
    } else { px(g, 5, 18, 15, 5, PAL.o); px(g, 6, 18, 13, 4, M2); px(g, 6, 21, 13, 1, M); }
  }
}

// frame: 0 idle, 1 and 2 walking
export function charSprite(look, dir, frame, cls = 'warrior') {
  const base = BASE_DIR[dir] || 'down';
  const key = `ch|${look.cloak}|${look.hat}|${base}|${frame}|${cls}`;
  const img = cached(key, () => {
    const [c, g] = canvas(CHAR_W, CHAR_H);
    px(g, 6, 34, 12, 2, 'rgba(0,0,0,0.3)');
    paintPack(g, base, false);
    paintBody(g, base, look.cloak, frame, cls);
    paintPack(g, base, true);
    paintHead(g, base, look.hat, look.cloak);
    paintClassExtras(g, base, cls, look.cloak);
    return c;
  });
  return { img, flip: dir === 'left' || dir === 'downleft' || dir === 'upleft' };
}

export function downSprite(look) {
  return cached(`down|${look.cloak}`, () => {
    const [c, g] = canvas(32, 16);
    oval(g, 16, 11, 13, 4, PAL.o); oval(g, 15, 10, 12, 3, look.cloak);
    oval(g, 26, 9, 4, 4, PAL.o); oval(g, 26, 9, 3, 3, PAL.skin);
    px(g, 4, 6, 6, 5, PAL.pack); px(g, 2, 3, 6, 1, PAL.b2);
    return c;
  });
}

// sorcerer's staff, pointing right, grip at x=0
export function staffSprite() {
  return cached('staff', () => {
    const [c, g] = canvas(30, 9);
    px(g, 0, 3, 23, 3, PAL.o); px(g, 1, 4, 22, 1, PAL.b3);
    px(g, 21, 1, 3, 7, PAL.o); px(g, 22, 2, 1, 5, PAL.b2);
    oval(g, 26, 4, 3, 3, PAL.o); oval(g, 26, 4, 2, 2, '#7fe0ff'); px(g, 25, 3, 1, 1, '#ffffff');
    return c;
  });
}

// bow, drawn pointing right (the string is drawn live so it can be pulled back)
export function bowSprite() {
  return cached('bow', () => {
    const [c, g] = canvas(9, 27);
    for (let y = 0; y < 27; y++) {
      const x = Math.round(5 * Math.sin((y / 26) * Math.PI));
      px(g, x, y, 2, 1, PAL.o);
      px(g, x + 1, y, 1, 1, y > 11 && y < 15 ? '#3b2a1e' : PAL.b3);
    }
    return c;
  });
}

// cleric's brass mace, pointing right, grip at x=0
export function maceSprite() {
  return cached('mace', () => {
    const [c, g] = canvas(20, 9);
    px(g, 0, 3, 13, 3, PAL.o); px(g, 1, 4, 12, 1, '#6b4426');
    px(g, 4, 3, 1, 3, PAL.gold);
    oval(g, 15, 4, 4, 4, PAL.o); oval(g, 15, 4, 3, 3, '#c9a24a'); px(g, 14, 2, 2, 2, '#f4dc8a');
    px(g, 15, 0, 1, 1, PAL.o); px(g, 15, 8, 1, 1, PAL.o); px(g, 19, 4, 1, 1, PAL.o);
    return c;
  });
}

// druid's staff: gnarled wood with a sprouting top, pointing right, grip at x=0
export function druidStaffSprite() {
  return cached('dstaff', () => {
    const [c, g] = canvas(30, 11);
    px(g, 0, 4, 23, 3, PAL.o); px(g, 1, 5, 22, 1, '#7a5432'); px(g, 6, 4, 2, 1, '#5a3a22'); px(g, 14, 6, 2, 1, '#5a3a22');
    px(g, 22, 2, 3, 7, PAL.o); px(g, 23, 3, 1, 5, '#7a5432');
    oval(g, 26, 3, 3, 2, PAL.o); oval(g, 26, 3, 2, 1, '#6fb04a'); oval(g, 27, 7, 2, 2, PAL.o); oval(g, 27, 7, 1, 1, '#9be36a');
    px(g, 28, 5, 1, 1, '#d8ffb0');
    return c;
  });
}

// the Druid's bear form, facing right. frame 0 idle, 1 and 2 walking
export function bearSprite(frame) {
  return cached('bear' + frame, () => {
    const [c, g] = canvas(44, 32);
    oval(g, 21, 29, 16, 3, 'rgba(0,0,0,0.3)');
    const B = '#6b4426', B2 = '#8a5a32', B1 = '#4a2e18';
    // legs (they swap when walking)
    const lg = frame === 1 ? [2, -1, -1, 2] : frame === 2 ? [-1, 2, 2, -1] : [0, 0, 0, 0];
    [[9, lg[0]], [15, lg[1]], [25, lg[2]], [31, lg[3]]].forEach(([x, o], i) => {
      px(g, x - 1, 19, 7, 10 + Math.max(0, o), PAL.o); px(g, x, 19, 5, 9 + Math.max(0, o), i % 2 ? B1 : B);
      px(g, x, 27 + Math.max(0, o), 5, 1, '#2a1a10');
    });
    // body
    oval(g, 20, 15, 15, 9, PAL.o); oval(g, 20, 15, 14, 8, B); oval(g, 18, 12, 10, 4, B2); oval(g, 20, 20, 12, 3, B1);
    // moss on its back
    for (const [x, w] of [[10, 5], [15, 7], [22, 6], [27, 4]]) { px(g, x, 6, w, 2, '#3f7a2e'); px(g, x + 1, 5, w - 2, 1, '#6fb04a'); }
    px(g, 17, 4, 1, 1, '#9be36a'); px(g, 24, 4, 1, 1, '#9be36a');
    // head
    oval(g, 34, 12, 7, 6, PAL.o); oval(g, 34, 12, 6, 5, B); oval(g, 33, 10, 4, 2, B2);
    px(g, 29, 5, 4, 4, PAL.o); px(g, 30, 6, 2, 2, B2); px(g, 35, 5, 4, 4, PAL.o); px(g, 36, 6, 2, 2, B2);
    // snout + nose
    px(g, 38, 12, 5, 5, PAL.o); px(g, 38, 13, 4, 3, '#a07850'); px(g, 41, 12, 2, 2, '#1a1010');
    // glowing green eye
    px(g, 35, 10, 2, 2, '#5fff6a'); px(g, 36, 10, 1, 1, '#e0ffe0');
    // a few leaves tangled in the fur
    px(g, 12, 13, 2, 1, '#6fb04a'); px(g, 25, 16, 2, 1, '#6fb04a');
    return c;
  });
}

// warlock's off-hand: a little bone charm on a cord
export function charmSprite() {
  return cached('charm', () => {
    const [c, g] = canvas(7, 11);
    px(g, 3, 0, 1, 4, '#8a7a6a');
    px(g, 1, 4, 5, 6, PAL.o); px(g, 2, 5, 3, 4, '#e8e0c8'); px(g, 2, 6, 1, 1, PAL.o); px(g, 4, 6, 1, 1, PAL.o); px(g, 3, 8, 1, 1, '#8a7a6a');
    return c;
  });
}

// a Warlock imp (facing right). frame 0/1 flaps its little wings
export function impSprite(frame) {
  return cached('imp' + frame, () => {
    const [c, g] = canvas(14, 13);
    px(g, 4, 11, 6, 1, 'rgba(0,0,0,0.3)');
    const wy = frame ? 2 : 4;
    px(g, 0, wy, 4, 3, PAL.o); px(g, 1, wy + 1, 2, 1, '#5a3a8a'); px(g, 10, wy, 4, 3, PAL.o); px(g, 11, wy + 1, 2, 1, '#5a3a8a');
    oval(g, 7, 6, 4, 4, PAL.o); oval(g, 7, 6, 3, 3, '#3d2760'); px(g, 5, 4, 2, 2, '#5a3a8a');
    px(g, 4, 1, 1, 2, PAL.o); px(g, 10, 1, 1, 2, PAL.o); // horns
    px(g, 7, 5, 1, 1, '#ff7ad0'); px(g, 9, 5, 1, 1, '#ff7ad0'); // eyes
    px(g, 5, 10, 1, 2, PAL.o); px(g, 8, 10, 1, 2, PAL.o);
    px(g, 1, 8, 3, 1, PAL.o); px(g, 0, 7, 1, 1, PAL.o); // tail
    return c;
  });
}

// rogue's dagger, pointing right, grip at x=0
export function daggerSprite() {
  return cached('dagger', () => {
    const [c, g] = canvas(16, 5);
    px(g, 0, 1, 4, 3, PAL.o); px(g, 0, 2, 4, 1, '#3b2a1e');
    px(g, 4, 0, 1, 5, PAL.gold);
    px(g, 5, 1, 9, 3, PAL.o); px(g, 5, 2, 9, 1, PAL.steel); px(g, 5, 1, 8, 1, PAL.steel3);
    px(g, 14, 2, 2, 1, PAL.o);
    return c;
  });
}

// the ancient tree archway that leads out of camp into the wilds
export function archwaySprite() {
  return cached('archway', () => {
    const [c, g] = canvas(176, 132);
    // trunks
    for (const [bx, dir] of [[26, 1], [150, -1]]) {
      for (let y = 30; y < 126; y++) {
        const twist = Math.round(Math.sin(y / 9) * 3) * dir;
        const w = 12 + Math.floor((y - 30) / 12);
        px(g, bx - w / 2 + twist - 1, y, w + 2, 1, PAL.b0);
        px(g, bx - w / 2 + twist, y, w, 1, PAL.b1);
        px(g, bx - w / 2 + twist, y, 3, 1, PAL.b2);
        if (hash2(y, bx) < 0.25) px(g, bx - 2 + twist, y, 1, 3, PAL.b0);
      }
      // roots
      for (const k of [-1, 1]) for (let i = 0; i < 14; i++) px(g, bx + k * (8 + i), 124 - Math.floor(i / 3), 3, 2, i < 8 ? PAL.b1 : PAL.b0);
      for (let y = 40; y < 120; y += 7) px(g, bx - 4 + Math.round(Math.sin(y) * 3), y, 3, 2, PAL.moss);
    }
    // arching branches
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, x = 26 + (150 - 26) * t, y = 40 - Math.sin(t * Math.PI) * 26;
      px(g, x - 2, y - 2, 6, 6, PAL.b0); px(g, x - 1, y - 1, 4, 3, PAL.b2);
    }
    // leaves on top
    for (let i = 0; i < 22; i++) {
      const t = i / 21, x = 18 + 140 * t, y = 30 - Math.sin(t * Math.PI) * 24;
      oval(g, x, y, 12, 9, PAL.l0); oval(g, x - 1, y - 1, 10, 7, PAL.l2); oval(g, x - 3, y - 3, 5, 3, PAL.l3);
      if (i % 3 === 0) px(g, x - 2, y - 6, 2, 1, PAL.l5);
    }
    // lantern hooks
    for (const lx of [52, 76, 100, 124]) { const y = 40 - Math.sin(((lx - 26) / 124) * Math.PI) * 26; px(g, lx, y + 2, 1, 10, PAL.o); }
    return c;
  });
}
// where the 4 lanterns hang on the archway (relative to the sprite's top-left)
export const ARCH_LANTERNS = [52, 76, 100, 124].map((lx) => [lx, 40 - Math.sin(((lx - 26) / 124) * Math.PI) * 26 + 14]);

export function lanternSprite(lit) {
  return cached('lantern' + lit, () => {
    const [c, g] = canvas(7, 9);
    px(g, 1, 0, 5, 1, PAL.o); px(g, 0, 1, 7, 7, PAL.o); px(g, 1, 2, 5, 5, lit ? '#ffd36a' : '#3b3326');
    px(g, 3, 2, 1, 5, PAL.o); px(g, 1, 4, 5, 1, PAL.o); px(g, 1, 8, 5, 1, PAL.o);
    return c;
  });
}

// a plain white copy of a sprite, for the "you got hit" flash
export function whiteOf(img) {
  if (!img.__white) {
    const [c, g] = canvas(img.width, img.height);
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, img.width, img.height);
    img.__white = c;
  }
  return img.__white;
}

// sword pointing to the right, grip at x=0..5
export function swordSprite(big = false) {
  return cached('sword' + big, () => {
    const L = big ? 26 : 22;
    const [c, g] = canvas(L + 2, 7);
    px(g, 0, 2, 5, 3, PAL.o); px(g, 0, 3, 5, 1, '#6b4426');
    px(g, 5, 0, 2, 7, PAL.o); px(g, 5, 1, 2, 5, PAL.gold);
    px(g, 7, 1, L - 8, 5, PAL.o);
    px(g, 7, 2, L - 8, 3, PAL.steel);
    px(g, 7, 2, L - 9, 1, PAL.steel3);
    px(g, 7, 4, L - 8, 1, PAL.steel2);
    px(g, L - 1, 2, 2, 3, PAL.o); px(g, L - 1, 3, 1, 1, PAL.steel);
    return c;
  });
}

// ---------------------------------------------------------- wolves (facing right)
// frame: 0 idle, 1 & 2 run, 3 crouch (windup), 4 stretch (lunge)
export function wolfSprite(frame, variant = 'wolf') {
  return cached(`wolf|${frame}|${variant}`, () => {
    const big = variant === 'alpha';
    const S = big ? 1.5 : 1;
    const W = Math.round(44 * S), H = Math.round(28 * S);
    const [c, g] = canvas(W, H);
    const pal = variant === 'elite'
      ? { f0: '#2b1610', f1: '#55301f', f2: '#7a4a2c', t0: '#c2561c', t1: '#ffb347' }
      : variant === 'alpha'
        ? { f0: '#140f10', f1: '#2b2224', f2: '#433537', t0: '#4f7a2e', t1: '#9fd35a' }
        : { f0: '#1e1714', f1: '#3d302b', f2: '#57463d', t0: '#4d7a30', t1: '#86b85a' };
    const q = (x, y, w, h, col) => px(g, x * S, y * S, Math.max(1, Math.round(w * S)), Math.max(1, Math.round(h * S)), col);
    const O = (cx, cy, rx, ry, col) => oval(g, cx * S, cy * S, Math.round(rx * S), Math.round(ry * S), col);
    q(6, 25, 28, 2, 'rgba(0,0,0,0.3)');
    const crouch = frame === 3 ? 2 : 0;
    const stretch = frame === 4 ? 3 : 0;
    // legs
    const legs = frame === 1 ? [-2, 2, 2, -2] : frame === 2 ? [2, -2, -2, 2] : frame === 4 ? [-4, -3, 4, 4] : [0, 0, 0, 0];
    [[9, 0], [13, 1], [24, 2], [28, 3]].forEach(([lx, i]) => { q(lx + legs[i], 18 + crouch, 3, 8 - crouch, pal.f0); q(lx + legs[i], 24, 3, 2, pal.f0); });
    // tail
    q(2 - stretch, 12 + crouch, 6, 3, pal.f0); q(0 - stretch, 9 + crouch, 4, 3, pal.f1);
    // body
    O(17, 15 + crouch, 12 + stretch, 6, pal.f0);
    O(17, 14 + crouch, 11 + stretch, 5, pal.f1);
    O(15, 12 + crouch, 8, 2, pal.f2);
    // thorns along the back
    for (let i = 0; i < 6; i++) {
      const tx = 8 + i * 3.5, ty = 8 + crouch;
      q(tx, ty, 2, 2, pal.t0); q(tx + 1, ty - 2 - (i % 2), 1, 2, pal.t1);
    }
    // head
    const hx = 30 + stretch, hy = 11 + crouch * 1.5;
    O(hx, hy, 6, 5, pal.f0);
    O(hx, hy - 1, 5, 4, pal.f1);
    q(hx + 3, hy, 6, 3, pal.f0); q(hx + 3, hy, 5, 2, pal.f1);
    q(hx + 8, hy, 1, 1, '#0a0606');
    q(hx - 4, hy - 7, 2, 3, pal.f0); q(hx - 1, hy - 7, 2, 3, pal.f0); q(hx - 4, hy - 6, 1, 1, pal.f2);
    if (frame === 3 || frame === 4) q(hx + 4, hy + 2, 4, 1, '#e8e0d0');
    if (variant === 'elite') for (let i = 0; i < 6; i++) q(10 + hash2(i, 3) * 16, 12 + hash2(3, i) * 6, 1, 1, '#ffcf6a');
    if (big) { q(20, 6, 8, 3, pal.f2); q(22, 4, 2, 3, pal.t1); }
    return c;
  });
}
// where the eyes are on the wolf sprite (relative to sprite's left/top), for glowing them later
export function wolfEye(frame, variant) {
  const S = variant === 'alpha' ? 1.5 : 1;
  const crouch = frame === 3 ? 2 : 0, stretch = frame === 4 ? 3 : 0;
  return [(31 + stretch) * S, (9 + crouch * 1.5) * S];
}

// ---------------------------------------------------------- Elder Treant
export function treantSprite(pose) {
  return cached('treant' + pose, () => {
    const [c, g] = canvas(112, 124);
    oval(g, 56, 116, 44, 7, 'rgba(0,0,0,0.35)');
    // roots
    for (const [x, w] of [[20, 14], [36, 10], [70, 10], [82, 16]]) { px(g, x, 108, w, 8, PAL.b0); px(g, x + 2, 108, w - 4, 4, PAL.b1); }
    // trunk body
    for (let y = 40; y < 114; y++) {
      const half = 20 + Math.floor(Math.abs(y - 80) / 10);
      px(g, 56 - half - 2, y, half * 2 + 4, 1, PAL.b0);
      px(g, 56 - half, y, half * 2, 1, PAL.b1);
      px(g, 56 - half, y, 5, 1, PAL.b2);
      if (hash2(y, 7) < 0.35) px(g, 56 - half + 8 + Math.floor(hash2(y, 3) * (half * 2 - 16)), y, 1, 3, PAL.b0);
    }
    // face
    px(g, 40, 64, 10, 7, '#0b0604'); px(g, 62, 64, 10, 7, '#0b0604');
    px(g, 44, 82, 24, 5, '#0b0604'); px(g, 48, 87, 4, 3, '#0b0604'); px(g, 58, 87, 4, 3, '#0b0604');
    px(g, 38, 60, 14, 2, PAL.b3); px(g, 60, 60, 14, 2, PAL.b3);
    // arms
    const armY = pose === 1 ? 44 : 60;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 26; i++) {
        const x = 56 + s * (26 + i), y = armY + (pose === 1 ? -i * 0.6 : i * 0.5);
        px(g, x - 3, y, 7, 7, PAL.b0); px(g, x - 2, y + 1, 5, 4, PAL.b1);
      }
      const tx = 56 + s * 52, ty = armY + (pose === 1 ? -16 : 13);
      oval(g, tx, ty, 9, 7, PAL.l1); oval(g, tx - 1, ty - 1, 7, 5, PAL.l2); px(g, tx - 4, ty - 4, 3, 1, PAL.l4);
    }
    // crown of leaves
    oval(g, 56, 30, 46, 26, PAL.l0);
    oval(g, 56, 28, 44, 24, PAL.l1);
    for (const [bx, by, rx, ry] of [[-24, 2, 18, 13], [22, 0, 20, 14], [0, -10, 22, 13], [-6, 10, 18, 10], [30, 12, 12, 8]]) {
      oval(g, 56 + bx, 28 + by, rx, ry, PAL.l2); oval(g, 54 + bx, 26 + by, rx - 5, ry - 4, PAL.l3); px(g, 48 + bx, 20 + by, 5, 1, PAL.l4);
    }
    for (let i = 0; i < 40; i++) px(g, 16 + hash2(i, 41) * 80, 8 + hash2(41, i) * 40, 1, 1, hash2(i, i) < 0.5 ? PAL.l0 : PAL.l5);
    for (let i = 0; i < 8; i++) px(g, 20 + hash2(i, 77) * 72, 20 + hash2(77, i) * 26, 2, 2, '#9fe8ff');
    // moss
    px(g, 38, 42, 36, 3, PAL.moss);
    return c;
  });
}
export const TREANT_EYES = [[45, 67], [67, 67]]; // relative to sprite top-left

// ---------------------------------------------------------- props
export function propSprite(kind, extra = 0) {
  return cached('prop' + kind + extra, () => {
    if (kind === 'campfire') {
      const [c, g] = canvas(40, 24);
      oval(g, 20, 16, 17, 6, 'rgba(0,0,0,0.3)');
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const x = 20 + Math.cos(a) * 15, y = 14 + Math.sin(a) * 6;
        oval(g, x, y, 3, 2, PAL.r0); px(g, x - 2, y - 2, 3, 1, i % 2 ? PAL.r2 : PAL.r3);
      }
      px(g, 9, 12, 22, 3, PAL.b0); px(g, 10, 12, 20, 2, PAL.b2);
      px(g, 16, 8, 3, 10, PAL.b0); px(g, 16, 8, 2, 9, PAL.b1);
      oval(g, 20, 14, 6, 2, '#ff7a2a');
      return c;
    }
    if (kind === 'wardrobe') {
      const [c, g] = canvas(30, 46);
      px(g, 2, 42, 26, 3, 'rgba(0,0,0,0.3)');
      px(g, 2, 4, 26, 40, PAL.o); px(g, 3, 5, 24, 38, PAL.b2); px(g, 3, 5, 3, 38, PAL.b3); px(g, 24, 5, 3, 38, PAL.b1);
      px(g, 0, 1, 30, 5, PAL.o); px(g, 1, 2, 28, 3, PAL.b1);
      px(g, 14, 6, 2, 36, PAL.o);
      px(g, 6, 9, 6, 30, PAL.b1); px(g, 18, 9, 6, 30, PAL.b1);
      px(g, 12, 23, 1, 2, PAL.gold); px(g, 17, 23, 1, 2, PAL.gold);
      px(g, 16, 39, 7, 4, '#7b4fb0');
      return c;
    }
    if (kind === 'shrine') {
      const [c, g] = canvas(20, 34);
      px(g, 2, 30, 16, 3, 'rgba(0,0,0,0.3)');
      px(g, 3, 8, 14, 24, PAL.o); px(g, 4, 9, 12, 22, PAL.r1); px(g, 4, 9, 3, 22, PAL.r2); px(g, 13, 9, 3, 22, PAL.r0);
      px(g, 1, 5, 18, 4, PAL.o); px(g, 2, 6, 16, 2, PAL.r2);
      px(g, 8, 15, 4, 1, extra ? '#ffd59a' : PAL.r0); px(g, 9, 14, 2, 8, extra ? '#ffd59a' : PAL.r0); px(g, 7, 19, 6, 1, extra ? '#ffd59a' : PAL.r0);
      px(g, 4, 26, 4, 2, PAL.moss);
      return c;
    }
    if (kind === 'heartwood') {
      const [c, g] = canvas(28, 34);
      px(g, 3, 30, 22, 3, 'rgba(0,0,0,0.3)');
      oval(g, 14, 20, 11, 12, PAL.o); oval(g, 14, 20, 10, 11, PAL.r1); oval(g, 12, 17, 6, 6, PAL.r2);
      oval(g, 14, 9, 9, 3, PAL.moss);
      const hc = extra ? '#5a4a3a' : '#ff9a4c';
      px(g, 10, 18, 3, 3, hc); px(g, 15, 18, 3, 3, hc); px(g, 11, 21, 6, 2, hc); px(g, 12, 23, 4, 1, hc); px(g, 13, 24, 2, 1, hc);
      return c;
    }
    if (kind === 'pillar') {
      const [c, g] = canvas(18, 54);
      px(g, 1, 50, 16, 3, 'rgba(0,0,0,0.3)');
      px(g, 3, 6, 12, 46, PAL.o); px(g, 4, 7, 10, 44, PAL.r1); px(g, 4, 7, 3, 44, PAL.r2); px(g, 11, 7, 3, 44, PAL.r0);
      px(g, 1, 2, 16, 5, PAL.o); px(g, 2, 3, 14, 3, PAL.r2);
      for (let y = 8; y < 50; y += 3) px(g, 5 + Math.floor(hash2(y, 5) * 6), y, 2, 2, PAL.l3);
      return c;
    }
    if (kind === 'fence') {
      const [c, g] = canvas(16, 20);
      px(g, 6, 2, 4, 17, PAL.o); px(g, 7, 3, 2, 15, PAL.b2); px(g, 7, 3, 1, 15, PAL.b3);
      px(g, 0, 7, 16, 3, PAL.o); px(g, 0, 8, 16, 1, PAL.b2);
      px(g, 0, 13, 16, 3, PAL.o); px(g, 0, 14, 16, 1, PAL.b1);
      px(g, 4, 18, 8, 2, 'rgba(0,0,0,0.3)');
      return c;
    }
    if (kind === 'tent') {
      const [c, g] = canvas(76, 58);
      oval(g, 38, 54, 34, 4, 'rgba(0,0,0,0.3)');
      for (let y = 0; y < 44; y++) {
        const half = Math.round(4 + y * 0.78);
        px(g, 38 - half - 1, 8 + y, half * 2 + 2, 1, PAL.o);
        px(g, 38 - half, 8 + y, half, 1, '#8a5a3a');
        px(g, 38, 8 + y, half, 1, '#a3704a');
        if (y % 6 === 0) px(g, 38 - half, 8 + y, half * 2, 1, '#7a4a2e');
      }
      // open flap showing the dark inside
      for (let y = 18; y < 52; y++) { const w = Math.round((y - 18) * 0.42); px(g, 38 - w, y, w * 2, 1, '#2a1a12'); }
      px(g, 36, 0, 4, 10, PAL.b1); px(g, 30, 2, 16, 2, '#c4533a'); px(g, 32, 4, 12, 2, '#e8c45c');
      return c;
    }
    if (kind === 'signpost') {
      const [c, g] = canvas(30, 44);
      px(g, 8, 40, 14, 3, 'rgba(0,0,0,0.3)');
      px(g, 13, 6, 4, 36, PAL.o); px(g, 14, 7, 2, 34, PAL.b2);
      px(g, 2, 8, 24, 9, PAL.o); px(g, 3, 9, 22, 7, PAL.b3); px(g, 26, 10, 3, 5, PAL.o);
      px(g, 4, 20, 22, 8, PAL.o); px(g, 5, 21, 20, 6, PAL.b2); px(g, 1, 22, 3, 4, PAL.o);
      for (let x = 6; x < 22; x += 3) { px(g, x, 11, 2, 1, PAL.b0); px(g, x + 1, 23, 2, 1, PAL.b0); }
      return c;
    }
    if (kind === 'board') {
      const [c, g] = canvas(40, 46);
      px(g, 6, 42, 28, 3, 'rgba(0,0,0,0.3)');
      px(g, 6, 18, 3, 26, PAL.o); px(g, 31, 18, 3, 26, PAL.o); px(g, 7, 19, 1, 24, PAL.b2); px(g, 32, 19, 1, 24, PAL.b2);
      px(g, 2, 4, 36, 24, PAL.o); px(g, 3, 5, 34, 22, PAL.b2); px(g, 3, 5, 34, 2, PAL.b3);
      px(g, 7, 9, 10, 8, '#efe4c8'); px(g, 20, 10, 12, 6, '#e8dcc0'); px(g, 10, 19, 14, 6, '#efe4c8');
      for (let i = 0; i < 3; i++) px(g, 8, 11 + i * 2, 8, 1, '#8a7a60');
      px(g, 11, 8, 2, 2, '#c4533a'); px(g, 25, 9, 2, 2, '#c4533a'); px(g, 16, 18, 2, 2, '#c4533a');
      return c;
    }
    if (kind === 'fountain') {
      // a mossy stone fountain; the Wildfire in it is drawn live
      const [c, g] = canvas(40, 38);
      oval(g, 20, 32, 18, 5, 'rgba(0,0,0,0.3)');
      oval(g, 20, 28, 18, 7, PAL.o); oval(g, 20, 27, 17, 6, PAL.r1); oval(g, 20, 26, 15, 4, PAL.r0); oval(g, 20, 26, 13, 3, '#5a2a10');
      px(g, 4, 27, 32, 4, PAL.r1); px(g, 3, 27, 1, 4, PAL.o); px(g, 36, 27, 1, 4, PAL.o); px(g, 4, 31, 32, 1, PAL.o);
      for (let x = 6; x < 35; x += 5) px(g, x, 28, 2, 2, PAL.r2);
      px(g, 17, 10, 6, 16, PAL.o); px(g, 18, 10, 4, 16, PAL.r2); px(g, 18, 10, 1, 16, PAL.r3);
      oval(g, 20, 10, 7, 3, PAL.o); oval(g, 20, 9, 6, 2, PAL.r2); oval(g, 20, 9, 4, 1, '#5a2a10');
      px(g, 8, 29, 3, 2, PAL.moss); px(g, 28, 29, 4, 2, PAL.moss); px(g, 18, 20, 2, 3, PAL.moss);
      return c;
    }
    if (kind === 'resetpost') {
      const [c, g] = canvas(16, 30);
      px(g, 3, 27, 10, 2, 'rgba(0,0,0,0.3)');
      px(g, 6, 8, 4, 20, PAL.o); px(g, 7, 9, 2, 18, PAL.b2);
      oval(g, 8, 6, 5, 5, PAL.o); oval(g, 8, 6, 4, 4, '#d8b35a'); px(g, 7, 4, 2, 2, '#fff3c0');
      return c;
    }
    if (kind === 'log') {
      const [c, g] = canvas(40, 16);
      oval(g, 20, 12, 18, 3, 'rgba(0,0,0,0.3)');
      px(g, 3, 4, 34, 8, PAL.o); px(g, 4, 5, 32, 6, PAL.b2); px(g, 4, 5, 32, 2, PAL.b3);
      oval(g, 36, 8, 3, 4, PAL.o); oval(g, 36, 8, 2, 3, '#c49a6a');
      return c;
    }
    if (kind === 'dummy') {
      // straw training dummy on a post; extra: 0 plain, 1 hitter (club), 2 facer (painted face)
      const [c, g] = canvas(30, 40);
      px(g, 8, 37, 14, 2, 'rgba(0,0,0,0.3)');
      px(g, 14, 22, 3, 16, PAL.o); px(g, 15, 23, 1, 14, PAL.b2);
      oval(g, 15, 18, 8, 7, PAL.o); oval(g, 15, 18, 7, 6, '#d8b86a'); px(g, 10, 15, 3, 1, '#f0d890'); px(g, 18, 20, 3, 1, '#b8984a');
      px(g, 4, 16, 22, 3, PAL.o); px(g, 5, 17, 20, 1, '#c8a85a');
      oval(g, 15, 8, 5, 5, PAL.o); oval(g, 15, 8, 4, 4, '#e0c070');
      px(g, 11, 13, 9, 2, '#8a4a2a');
      if (extra === 1) { px(g, 24, 6, 3, 14, PAL.o); px(g, 25, 7, 1, 12, PAL.b3); oval(g, 25, 5, 3, 3, PAL.o); oval(g, 25, 5, 2, 2, PAL.b2); }
      if (extra === 2) { px(g, 13, 7, 1, 2, PAL.o); px(g, 17, 7, 1, 2, PAL.o); px(g, 13, 10, 5, 1, PAL.o); }
      return c;
    }
    if (kind === 'fox') {
      // a sleeping fox curled up by the fire (extra = breathing frame)
      const [c, g] = canvas(28, 16);
      oval(g, 14, 13, 12, 2, 'rgba(0,0,0,0.3)');
      oval(g, 14, 9 - extra, 11, 5 + extra, PAL.o); oval(g, 14, 9 - extra, 10, 4 + extra, '#d0702a');
      oval(g, 8, 10, 6, 3, '#e08a3a'); oval(g, 22, 10, 5, 3, '#f0e8dc');
      oval(g, 5, 8, 4, 3, PAL.o); oval(g, 5, 8, 3, 2, '#d0702a'); px(g, 3, 5, 2, 2, '#d0702a'); px(g, 6, 5, 2, 2, '#d0702a');
      px(g, 4, 8, 2, 1, PAL.o);
      return c;
    }
    if (kind === 'owl') {
      // an owl on a branch (extra = 1 when blinking)
      const [c, g] = canvas(24, 24);
      px(g, 0, 18, 24, 3, PAL.o); px(g, 1, 19, 22, 1, PAL.b2);
      oval(g, 12, 11, 6, 7, PAL.o); oval(g, 12, 11, 5, 6, '#8a6a4a'); oval(g, 12, 13, 3, 4, '#c8b090');
      px(g, 7, 3, 2, 3, PAL.o); px(g, 15, 3, 2, 3, PAL.o);
      if (extra) { px(g, 9, 9, 2, 1, PAL.o); px(g, 13, 9, 2, 1, PAL.o); }
      else { oval(g, 10, 9, 2, 2, '#ffd36a'); oval(g, 14, 9, 2, 2, '#ffd36a'); px(g, 10, 9, 1, 1, PAL.o); px(g, 14, 9, 1, 1, PAL.o); }
      px(g, 12, 11, 1, 2, '#d8a040');
      return c;
    }
    if (kind === 'roots') {
      const [c, g] = canvas(40, 30);
      for (let i = 0; i < 5; i++) {
        const x = 6 + i * 7, h = 12 + (i % 2) * 8;
        for (let y = 0; y < h; y++) { const w = Math.max(1, Math.round((h - y) / 4)); px(g, x - w, 28 - y, w * 2 + 1, 1, y < 2 ? PAL.b0 : PAL.b1); }
        px(g, x - 1, 28 - h, 1, 2, PAL.b3);
      }
      return c;
    }
    return canvas(1, 1)[0];
  });
}

// ---------------------------------------------------------- skill icons (16 x 16 pixel art)
const ICON = {
  sword(g) {
    for (let i = 0; i < 9; i++) { px(g, 4 + i, 11 - i, 2, 2, PAL.o); px(g, 5 + i, 11 - i, 1, 1, PAL.steel3); }
    px(g, 3, 9, 5, 2, PAL.gold); px(g, 4, 8, 2, 5, PAL.gold); px(g, 1, 13, 3, 2, '#6b4426');
  },
  flamesword(g) {
    ICON.sword(g);
    for (const [x, y] of [[9, 2], [12, 4], [7, 4], [11, 1]]) { px(g, x, y, 2, 2, '#ff7a2a'); px(g, x, y, 1, 1, '#ffe08a'); }
  },
  shield(g) {
    px(g, 3, 2, 10, 2, PAL.o); px(g, 2, 3, 12, 6, PAL.o); px(g, 3, 9, 10, 2, PAL.o); px(g, 5, 11, 6, 2, PAL.o); px(g, 7, 13, 2, 1, PAL.o);
    px(g, 3, 3, 10, 6, '#c0543a'); px(g, 4, 9, 8, 2, '#c0543a'); px(g, 6, 11, 4, 2, '#c0543a');
    px(g, 7, 3, 2, 10, '#e8c45c'); px(g, 3, 6, 10, 2, '#e8c45c'); px(g, 4, 4, 2, 1, '#ff9a7a');
  },
  quake(g) {
    px(g, 1, 11, 14, 3, '#6b4f33'); px(g, 1, 11, 14, 1, '#9c7a52');
    px(g, 7, 9, 2, 4, PAL.o); px(g, 5, 12, 2, 2, PAL.o); px(g, 9, 12, 3, 1, PAL.o);
    for (const [x, y] of [[3, 6], [11, 5], [7, 3], [13, 8], [2, 9]]) px(g, x, y, 2, 2, '#ffb060');
  },
  dash(g) {
    px(g, 6, 5, 6, 6, PAL.o); px(g, 7, 6, 4, 4, '#8a6a4a'); px(g, 9, 9, 5, 3, PAL.o); px(g, 10, 10, 3, 1, '#5e432b');
    for (let i = 0; i < 3; i++) px(g, 1, 4 + i * 3, 4 - i, 1, '#d8f0ff');
  },
  staff(g) {
    for (let i = 0; i < 10; i++) px(g, 3 + i, 13 - i, 1, 1, PAL.b3);
    px(g, 11, 1, 4, 4, PAL.o); px(g, 12, 2, 2, 2, '#7fe0ff'); px(g, 12, 2, 1, 1, '#ffffff');
  },
  fire(g) {
    px(g, 5, 4, 6, 9, '#c4371a'); px(g, 4, 7, 8, 5, '#c4371a'); px(g, 7, 2, 2, 3, '#c4371a');
    px(g, 6, 6, 4, 6, '#ff8a2a'); px(g, 7, 8, 2, 3, '#ffe08a'); px(g, 3, 12, 10, 2, PAL.o);
  },
  frost(g) {
    for (let i = 0; i < 13; i++) { px(g, 7, 1 + i, 2, 1, '#bfeaff'); px(g, 1 + i, 7, 1, 2, '#bfeaff'); }
    for (let i = 0; i < 9; i++) { px(g, 3 + i, 3 + i, 1, 1, '#8fd8ff'); px(g, 12 - i, 3 + i, 1, 1, '#8fd8ff'); }
    px(g, 7, 7, 2, 2, '#ffffff');
  },
  gale(g) {
    const ring = (r, col) => { for (let a = 0; a < 5.5; a += 0.25) px(g, 8 + Math.cos(a) * r, 8 + Math.sin(a) * r * 0.8, 1, 1, col); };
    ring(6, '#bff5d2'); ring(4, '#8fdcb0'); ring(2, '#e8fff0');
  },
  starfall(g) {
    for (let i = 0; i < 7; i++) px(g, 1 + i, 1 + i, 2, 1, '#ffd36a');
    oval(g, 10, 10, 4, 4, PAL.o); oval(g, 10, 10, 3, 3, '#ff8a2a'); px(g, 9, 9, 2, 2, '#fff3c0');
  },
  bow(g) {
    for (let y = 1; y < 15; y++) { const x = 4 + Math.round(5 * Math.sin(((y - 1) / 13) * Math.PI)); px(g, x, y, 2, 1, PAL.b3); }
    px(g, 4, 1, 1, 14, '#e8e0c8'); px(g, 2, 7, 12, 1, '#d8c39a'); px(g, 13, 6, 2, 3, PAL.steel3);
  },
  mark(g) {
    oval(g, 8, 8, 6, 6, '#c4372d'); oval(g, 8, 8, 4, 4, '#f4ece0'); oval(g, 8, 8, 2, 2, '#c4372d');
    px(g, 7, 0, 2, 3, '#ffd36a'); px(g, 7, 13, 2, 3, '#ffd36a'); px(g, 0, 7, 3, 2, '#ffd36a'); px(g, 13, 7, 3, 2, '#ffd36a');
  },
  rain(g) {
    for (const x of [2, 6, 10, 13]) { const y = (x * 3) % 5; px(g, x, y, 1, 7, '#d8c39a'); px(g, x - 1, y + 7, 3, 2, PAL.steel3); }
    px(g, 0, 14, 16, 2, '#6b4f33');
  },
  hawk(g) {
    px(g, 1, 6, 6, 3, '#8a6a4a'); px(g, 9, 6, 6, 3, '#8a6a4a'); px(g, 0, 7, 2, 1, '#5e432b'); px(g, 14, 7, 2, 1, '#5e432b');
    oval(g, 8, 7, 3, 3, '#a07a50'); px(g, 7, 6, 1, 1, '#ffd36a'); px(g, 9, 6, 1, 1, '#ffd36a'); px(g, 8, 8, 1, 2, '#e8c45c');
    px(g, 7, 10, 2, 4, '#8a6a4a');
  },
  dagger(g) {
    for (let i = 0; i < 7; i++) { px(g, 6 + i, 9 - i, 2, 2, PAL.o); px(g, 7 + i, 9 - i, 1, 1, PAL.steel3); }
    px(g, 4, 9, 4, 2, PAL.gold); px(g, 2, 11, 3, 3, '#3b2a1e');
    for (let i = 0; i < 5; i++) px(g, 9 - i, 13 - i, 1, 1, 'rgba(255,120,140,0.9)');
  },
  smoke(g) {
    oval(g, 6, 10, 5, 4, '#7a7f8c'); oval(g, 10, 8, 5, 5, '#9aa0ad'); oval(g, 8, 5, 4, 3, '#b9bfcb'); px(g, 7, 4, 2, 1, '#e0e4ec');
  },
  step(g) {
    px(g, 2, 9, 3, 4, '#b08cff'); px(g, 3, 8, 2, 1, '#b08cff'); px(g, 7, 4, 3, 4, '#d0b8ff'); px(g, 8, 3, 2, 1, '#d0b8ff');
    for (let i = 0; i < 4; i++) px(g, 11 + (i % 2), 2 + i * 3, 2, 2, 'rgba(180,140,255,0.8)');
  },
  cuts(g) {
    for (let i = 0; i < 12; i++) { px(g, 2 + i, 2 + i, 1, 1, '#ff8a9a'); px(g, 13 - i, 2 + i, 1, 1, '#ff8a9a'); px(g, 2 + i, 8, 1, 1, '#ffd0d8'); }
  },
  mace(g) {
    for (let i = 0; i < 8; i++) { px(g, 2 + i, 13 - i, 2, 2, PAL.o); px(g, 3 + i, 13 - i, 1, 1, '#8a5a36'); }
    oval(g, 11, 4, 4, 4, PAL.o); oval(g, 11, 4, 3, 3, '#c9a24a'); px(g, 10, 2, 2, 2, '#f4dc8a');
    px(g, 11, 0, 1, 1, PAL.o); px(g, 15, 4, 1, 1, PAL.o); px(g, 7, 4, 1, 1, PAL.o);
  },
  mend(g) {
    oval(g, 8, 8, 7, 7, 'rgba(255,236,160,0.35)');
    px(g, 6, 3, 4, 10, PAL.o); px(g, 3, 6, 10, 4, PAL.o); px(g, 7, 4, 2, 8, '#9ff0a0'); px(g, 4, 7, 8, 2, '#9ff0a0'); px(g, 7, 7, 2, 2, '#ffffff');
  },
  judge(g) {
    px(g, 1, 13, 14, 2, '#6b4f33');
    for (let i = 0; i < 6; i++) px(g, 7, 1 + i * 2, 2, 2, i % 2 ? '#fff1b8' : '#ffd36a');
    for (const [x, y] of [[3, 9], [12, 9], [5, 11], [10, 11]]) px(g, x, y, 2, 2, '#fff1b8');
  },
  ground(g) {
    oval(g, 8, 11, 7, 4, PAL.o); oval(g, 8, 11, 6, 3, '#c9a24a'); oval(g, 8, 11, 4, 2, '#fff1b8');
    for (const [x, y] of [[4, 5], [8, 2], [12, 5], [6, 8], [10, 8]]) px(g, x, y, 1, 2, '#fff1b8');
  },
  dawn(g) {
    px(g, 0, 11, 16, 5, '#5a4a3a');
    oval(g, 8, 11, 5, 5, '#ffd36a'); oval(g, 8, 11, 3, 3, '#fff4c8'); px(g, 0, 11, 16, 5, '#5a4a3a');
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; px(g, 8 + Math.cos(a) * 7, 10 + Math.sin(a) * 7, 1, 1, '#ffd36a'); }
  },
  bolt(g) {
    for (let i = 0; i < 6; i++) px(g, 1 + i, 9 - i * 0.5, 2, 1, 'rgba(176,140,255,0.6)');
    oval(g, 10, 6, 4, 4, '#2a1a40'); oval(g, 10, 6, 3, 3, '#7a4fd0'); px(g, 9, 5, 2, 2, '#e0d0ff');
  },
  hands(g) {
    px(g, 0, 13, 16, 3, '#2a1a40');
    for (const [x, h] of [[2, 6], [6, 9], [10, 7], [13, 5]]) {
      px(g, x, 13 - h, 2, h, '#5a3a8a'); px(g, x - 1, 13 - h, 1, 2, '#5a3a8a'); px(g, x + 2, 13 - h, 1, 2, '#5a3a8a'); px(g, x, 13 - h, 1, 1, '#b08cff');
    }
  },
  imps(g) {
    for (const [ox, oy] of [[0, 6], [7, 2]]) {
      oval(g, ox + 4, oy + 4, 3, 3, PAL.o); oval(g, ox + 4, oy + 4, 2, 2, '#5a3a8a');
      px(g, ox + 2, oy, 1, 2, PAL.o); px(g, ox + 6, oy, 1, 2, PAL.o); px(g, ox + 3, oy + 3, 1, 1, '#ff7ad0'); px(g, ox + 5, oy + 3, 1, 1, '#ff7ad0');
      px(g, ox, oy + 3, 1, 2, '#3d2760'); px(g, ox + 8, oy + 3, 1, 2, '#3d2760');
    }
  },
  siphon(g) {
    for (let x = 1; x < 15; x++) px(g, x, 8 + Math.round(Math.sin(x * 0.9) * 2), 1, 1, x % 2 ? '#b08cff' : '#7fd0c0');
    oval(g, 2, 8, 2, 2, '#7fd0c0'); oval(g, 13, 8, 2, 2, '#e0d0ff');
  },
  eclipse(g) {
    oval(g, 8, 8, 7, 7, '#ffd36a'); oval(g, 9, 7, 6, 6, '#1a1028'); px(g, 6, 6, 1, 1, '#ff7ad0'); px(g, 9, 6, 1, 1, '#ff7ad0');
  },
  interact(g) {
    px(g, 5, 4, 2, 7, '#e8b994'); px(g, 7, 3, 2, 8, '#e8b994'); px(g, 9, 4, 2, 7, '#e8b994'); px(g, 11, 6, 2, 5, '#e8b994'); px(g, 4, 9, 9, 5, '#e8b994');
    px(g, 3, 8, 2, 3, '#e8b994'); px(g, 4, 13, 9, 1, '#c48f6c');
  },
  tree(g) {
    oval(g, 8, 6, 6, 5, PAL.l1); oval(g, 7, 5, 4, 3, PAL.l3); px(g, 7, 10, 2, 5, PAL.b2);
  },
  // ---- v1.3 skill icons ----
  warcry(g) {
    // a shouting face with sound waves
    oval(g, 6, 8, 5, 5, PAL.o); oval(g, 6, 8, 4, 4, PAL.skin); px(g, 4, 6, 2, 1, PAL.o); px(g, 7, 6, 2, 1, PAL.o);
    oval(g, 6, 10, 2, 2, PAL.o); px(g, 5, 10, 2, 1, '#c4372d'); px(g, 3, 3, 7, 2, '#8a5a3a');
    for (const [x, h] of [[11, 4], [13, 6], [15, 8]]) { px(g, x, 8 - h / 2, 1, h, '#ffb080'); }
  },
  bash(g) {
    // a shoulder charge: shield front with speed lines
    px(g, 7, 3, 7, 10, PAL.o); px(g, 8, 4, 5, 8, '#c0543a'); px(g, 10, 4, 1, 8, '#e8c45c'); px(g, 8, 7, 5, 1, '#e8c45c');
    for (let i = 0; i < 3; i++) px(g, 1, 4 + i * 3, 5 - i, 1, '#d8f0ff');
    px(g, 14, 6, 2, 1, '#ffe08a'); px(g, 14, 9, 2, 1, '#ffe08a');
  },
  bladestorm(g) {
    // three blades whirling around a centre
    oval(g, 8, 8, 2, 2, PAL.o); px(g, 7, 7, 2, 2, '#ffb060');
    for (const [x, y, dx, dy] of [[8, 1, 1, 1], [14, 10, -1, 0], [2, 11, 1, -1]]) {
      for (let i = 0; i < 5; i++) { px(g, x + dx * i - (dy ? 0 : i), y + (dy ? i : 0) * 1, 2, 2, PAL.o); px(g, x + dx * i - (dy ? 0 : i), y + (dy ? i : 0), 1, 1, PAL.steel3); }
    }
    for (const [x, y] of [[3, 3], [12, 3], [12, 13], [3, 13]]) px(g, x, y, 1, 1, '#ff9a4a');
  },
  shove(g) {
    // a staff with a push wave
    for (let i = 0; i < 9; i++) px(g, 2 + i, 13 - i, 2, 2, PAL.o);
    for (let i = 0; i < 9; i++) px(g, 3 + i, 13 - i, 1, 1, '#a3704a');
    oval(g, 12, 3, 2, 2, '#9fd8ff');
    for (const r of [3, 5]) { px(g, 13, 8 - r, 1, r * 2, '#d8f0ff'); }
    px(g, 15, 6, 1, 4, '#d8f0ff');
  },
  gust(g) {
    // a swirl of wind
    px(g, 2, 5, 9, 1, '#d8f0ff'); px(g, 10, 3, 2, 2, '#d8f0ff'); px(g, 11, 5, 1, 1, '#d8f0ff');
    px(g, 1, 8, 12, 1, '#bfe8ff'); px(g, 12, 9, 2, 2, '#bfe8ff'); px(g, 11, 11, 1, 1, '#bfe8ff');
    px(g, 3, 11, 6, 1, '#9fd0ff'); px(g, 8, 12, 2, 1, '#9fd0ff');
    for (const [x, y] of [[13, 2], [4, 14], [14, 13]]) px(g, x, y, 1, 1, '#fff6c0');
  },
  deadeye(g) {
    // an eye inside a crosshair
    px(g, 7, 0, 2, 4, '#ff6a4a'); px(g, 7, 12, 2, 4, '#ff6a4a'); px(g, 0, 7, 4, 2, '#ff6a4a'); px(g, 12, 7, 4, 2, '#ff6a4a');
    oval(g, 8, 8, 5, 3, PAL.o); oval(g, 8, 8, 4, 2, '#f4f1ea'); oval(g, 8, 8, 2, 2, '#3a7ad0'); px(g, 8, 8, 1, 1, PAL.o); px(g, 7, 7, 1, 1, '#ffffff');
  },
  clone(g) {
    // you, and a see-through copy of you behind
    for (const [x, col, out] of [[3, '#6a58a8', '#3a2c60'], [8, '#8a6a4a', PAL.o]]) {
      oval(g, x + 3, 4, 2, 2, out); oval(g, x + 3, 4, 1, 1, col === '#8a6a4a' ? PAL.skin : '#a898e8');
      px(g, x + 1, 6, 5, 7, out); px(g, x + 2, 7, 3, 5, col); px(g, x + 1, 13, 2, 2, out); px(g, x + 4, 13, 2, 2, out);
    }
  },
  kindle(g) {
    // a hand lighting a small flame
    px(g, 3, 11, 10, 3, PAL.o); px(g, 4, 11, 8, 2, PAL.skin); px(g, 3, 9, 2, 3, PAL.o); px(g, 11, 9, 2, 3, PAL.o);
    oval(g, 8, 7, 3, 4, '#ff8a2a'); oval(g, 8, 8, 2, 2, '#ffe08a'); px(g, 8, 1, 1, 3, '#ff8a2a'); px(g, 7, 9, 2, 1, '#ffffff');
    px(g, 3, 3, 1, 1, '#9ff0a0'); px(g, 13, 4, 1, 1, '#9ff0a0');
  },
  guiding(g) {
    // a lantern with a trail of light
    px(g, 9, 1, 1, 3, PAL.o); px(g, 7, 3, 5, 2, PAL.o); px(g, 7, 5, 5, 7, PAL.o); px(g, 8, 6, 3, 5, '#ffe9a8'); px(g, 9, 7, 1, 3, '#ffffff'); px(g, 7, 12, 5, 1, PAL.o);
    for (let i = 0; i < 4; i++) px(g, 1 + i, 12 - i, 1, 1, '#fff1b8');
    px(g, 2, 7, 1, 1, '#fff1b8'); px(g, 4, 4, 1, 1, '#fff1b8');
  },
  // ---- favor icons ----
  boon_sharp(g) { // flint stone with a spark
    oval(g, 7, 10, 5, 4, PAL.o); oval(g, 7, 10, 4, 3, '#6a6f75'); px(g, 5, 8, 3, 2, '#9aa0a6'); px(g, 4, 11, 2, 1, '#4a4f55');
    for (const [x, y] of [[12, 3], [10, 2], [13, 5], [11, 5]]) px(g, x, y, 1, 1, '#ffd36a'); px(g, 12, 4, 1, 1, '#ffffff');
  },
  boon_wick(g) { // a lit candle
    px(g, 5, 7, 6, 8, PAL.o); px(g, 6, 8, 4, 6, '#efe4c8'); px(g, 6, 8, 1, 6, '#ffffff'); px(g, 4, 14, 8, 2, PAL.o);
    px(g, 8, 5, 1, 3, PAL.o); oval(g, 8, 3, 2, 3, '#ff8a2a'); px(g, 8, 3, 1, 2, '#ffe08a');
  },
  boon_swift(g) { // a charm on a cord
    for (let i = 0; i < 5; i++) { px(g, 3 + i, 1 + i, 1, 1, '#8a6a4a'); px(g, 12 - i, 1 + i, 1, 1, '#8a6a4a'); }
    oval(g, 8, 10, 4, 4, PAL.o); oval(g, 8, 10, 3, 3, '#5fbfc6'); oval(g, 8, 10, 1, 1, '#f4f1ea'); px(g, 8, 10, 1, 1, PAL.o);
    px(g, 13, 11, 2, 1, '#d8f0ff'); px(g, 1, 11, 2, 1, '#d8f0ff');
  },
  boon_dash(g) { // an owl's feather
    for (let i = 0; i < 12; i++) px(g, 3 + i, 13 - i, 1, 1, PAL.o);
    for (let i = 1; i < 10; i++) { px(g, 4 + i, 13 - i - 2, 2, 2, i % 3 ? '#c8b090' : '#8a6a4a'); px(g, 3 + i, 13 - i, 2, 2, i % 2 ? '#e8dcc0' : '#c8b090'); }
  },
  boon_kindle(g) { // a bundle of firewood
    for (const y of [9, 12]) { px(g, 1, y, 14, 3, PAL.o); px(g, 2, y + 1, 12, 1, '#8a5a3a'); px(g, 13, y, 2, 3, '#c49a6a'); }
    px(g, 6, 8, 2, 8, '#5a3d26');
    oval(g, 8, 5, 2, 3, '#ff8a2a'); px(g, 8, 5, 1, 2, '#ffe08a');
  },
  boon_leech(g) { // a small vial with something red
    px(g, 6, 1, 4, 2, '#8a6a4a'); px(g, 6, 3, 4, 3, PAL.o); px(g, 7, 3, 2, 3, '#d8e8f0');
    oval(g, 8, 10, 5, 5, PAL.o); oval(g, 8, 10, 4, 4, '#d8e8f0'); oval(g, 8, 11, 4, 3, '#c4333a'); px(g, 6, 8, 1, 2, '#ffffff');
  },
  boon_thorn(g) { // a bark shield
    px(g, 3, 2, 10, 2, PAL.o); px(g, 2, 3, 12, 7, PAL.o); px(g, 3, 10, 10, 2, PAL.o); px(g, 5, 12, 6, 2, PAL.o); px(g, 7, 14, 2, 1, PAL.o);
    px(g, 3, 3, 10, 7, '#6b4a2e'); px(g, 4, 10, 8, 2, '#6b4a2e'); px(g, 6, 12, 4, 2, '#6b4a2e');
    for (const x of [5, 8, 11]) px(g, x, 3, 1, 9, '#4e3420'); px(g, 4, 5, 2, 2, PAL.moss); px(g, 9, 9, 2, 1, PAL.moss);
  },
  boon_scholar(g) { // a rolled scroll
    px(g, 2, 3, 12, 10, PAL.o); px(g, 3, 4, 10, 8, '#efe4c8');
    for (let i = 0; i < 3; i++) px(g, 5, 6 + i * 2, 6 - (i % 2) * 2, 1, '#8a7a60');
    oval(g, 2, 8, 2, 5, PAL.o); oval(g, 2, 8, 1, 4, '#d8c8a8'); oval(g, 14, 8, 2, 5, PAL.o); oval(g, 14, 8, 1, 4, '#d8c8a8');
    px(g, 10, 10, 2, 2, '#c4333a');
  },
  boon_spring(g) { // a blue crystal
    px(g, 7, 1, 2, 2, PAL.o); px(g, 5, 3, 6, 9, PAL.o); px(g, 7, 12, 2, 3, PAL.o);
    px(g, 6, 3, 4, 9, '#5fb8ff'); px(g, 6, 3, 2, 9, '#9fe0ff'); px(g, 7, 12, 2, 2, '#3a7ad0'); px(g, 7, 4, 1, 3, '#ffffff');
  },
  boon_wellw(g) { // a skull
    oval(g, 8, 7, 5, 5, PAL.o); oval(g, 8, 7, 4, 4, '#e8dcc0'); px(g, 5, 11, 6, 3, PAL.o); px(g, 6, 11, 4, 2, '#e8dcc0');
    px(g, 5, 6, 2, 2, '#3a1a50'); px(g, 9, 6, 2, 2, '#3a1a50'); px(g, 5, 6, 1, 1, '#b08cff'); px(g, 9, 6, 1, 1, '#b08cff'); px(g, 7, 9, 2, 1, PAL.o);
    px(g, 7, 12, 1, 1, PAL.o); px(g, 9, 12, 1, 1, PAL.o);
  },
  boon_psalm(g) { // a torn page
    px(g, 3, 2, 10, 12, PAL.o); px(g, 4, 3, 8, 10, '#efe4c8');
    for (let i = 0; i < 4; i++) px(g, 5, 5 + i * 2, 6 - (i % 2) * 2, 1, '#8a7a60');
    px(g, 10, 12, 2, 1, '#efe4c8'); px(g, 11, 13, 1, 1, PAL.o); px(g, 9, 13, 1, 1, '#efe4c8'); px(g, 12, 10, 1, 2, PAL.o);
    px(g, 4, 3, 2, 2, '#d9b35a');
  },
  boon_ember(g) { // a little pouch of embers
    oval(g, 8, 10, 5, 5, PAL.o); oval(g, 8, 10, 4, 4, '#8a5a3a'); px(g, 6, 4, 4, 2, PAL.o); px(g, 7, 5, 2, 1, '#a3704a');
    for (const [x, y] of [[6, 9], [9, 11], [8, 8]]) px(g, x, y, 2, 2, '#ff8a2a');
    px(g, 10, 2, 1, 1, '#ffd36a'); px(g, 5, 1, 1, 1, '#ffd36a');
  },
  boon_focus(g) { // a smooth focus stone with a glowing rune
    oval(g, 8, 9, 6, 5, PAL.o); oval(g, 8, 9, 5, 4, '#7d8288'); oval(g, 7, 8, 3, 2, '#9aa0a6');
    px(g, 8, 6, 1, 6, '#7fe0ff'); px(g, 6, 8, 5, 1, '#7fe0ff');
  },
  thorn(g) {
    px(g, 2, 7, 10, 2, '#5a3a22'); px(g, 3, 7, 8, 1, '#8a6a3a');
    px(g, 11, 6, 3, 4, '#9be36a'); px(g, 14, 7, 1, 2, '#d8ffb0');
    px(g, 5, 5, 1, 2, '#6fb04a'); px(g, 8, 9, 1, 2, '#6fb04a'); px(g, 2, 6, 1, 1, '#6fb04a');
  },
  entangle(g) {
    oval(g, 8, 12, 7, 3, '#2a4a1e');
    for (const [x, h] of [[3, 8], [6, 11], [10, 10], [13, 7]]) { px(g, x, 13 - h, 2, h, '#3f7a2e'); px(g, x + 1, 13 - h, 1, h, '#6fb04a'); px(g, x - 1, 14 - h, 1, 1, '#9be36a'); }
    px(g, 6, 6, 4, 1, '#6fb04a'); px(g, 8, 9, 4, 1, '#6fb04a');
  },
  bearform(g) {
    oval(g, 8, 9, 6, 5, '#2a1a10'); oval(g, 8, 9, 5, 4, '#6b4426');
    px(g, 2, 3, 4, 4, '#2a1a10'); px(g, 3, 4, 2, 2, '#8a5a32'); px(g, 10, 3, 4, 4, '#2a1a10'); px(g, 11, 4, 2, 2, '#8a5a32');
    px(g, 6, 11, 4, 3, '#a07850'); px(g, 7, 11, 2, 1, '#1a1010');
    px(g, 5, 8, 2, 1, '#5fff6a'); px(g, 9, 8, 2, 1, '#5fff6a');
  },
  human(g) {
    oval(g, 8, 8, 5, 5, '#2a1e14'); oval(g, 8, 8, 4, 4, '#e8b994');
    px(g, 4, 3, 9, 3, '#3f7a2e'); px(g, 3, 1, 1, 3, '#c49a6a'); px(g, 12, 1, 1, 3, '#c49a6a'); px(g, 2, 0, 1, 2, '#c49a6a'); px(g, 13, 0, 1, 2, '#c49a6a');
    px(g, 6, 8, 1, 1, '#2a1e14'); px(g, 9, 8, 1, 1, '#2a1e14'); px(g, 4, 13, 8, 3, '#3f7a2e');
  },
  rejuv(g) {
    px(g, 7, 3, 2, 11, '#3f7a2e');
    oval(g, 5, 6, 3, 2, '#6fb04a'); oval(g, 11, 9, 3, 2, '#6fb04a'); oval(g, 5, 11, 2, 1, '#9be36a');
    px(g, 3, 1, 1, 1, '#d8ffb0'); px(g, 12, 2, 1, 1, '#d8ffb0'); px(g, 13, 13, 1, 1, '#d8ffb0'); px(g, 2, 13, 1, 1, '#d8ffb0');
    px(g, 6, 0, 4, 1, '#ffe0a0');
  },
  maul(g) {
    for (let i = 0; i < 3; i++) for (let k = 0; k < 10; k++) px(g, 3 + i * 4 + Math.round(k * 0.3), 2 + k, 2, 1, i === 1 ? '#ffffff' : '#d8d0c0');
    px(g, 1, 12, 14, 3, '#6b4426'); px(g, 2, 12, 12, 1, '#8a5a32');
  },
  stomp(g) {
    oval(g, 8, 12, 7, 3, '#5a3a22'); px(g, 5, 4, 6, 7, '#2a1a10'); px(g, 6, 5, 4, 5, '#6b4426');
    px(g, 5, 10, 1, 2, '#e8e0c8'); px(g, 7, 10, 1, 2, '#e8e0c8'); px(g, 9, 10, 1, 2, '#e8e0c8');
    px(g, 0, 11, 2, 1, '#ffe0a0'); px(g, 14, 11, 2, 1, '#ffe0a0'); px(g, 1, 8, 1, 2, '#ffe0a0'); px(g, 14, 8, 1, 2, '#ffe0a0');
  },
  roar(g) {
    oval(g, 6, 8, 5, 5, '#2a1a10'); oval(g, 6, 8, 4, 4, '#6b4426'); px(g, 7, 9, 4, 3, '#2a1010'); px(g, 8, 9, 1, 1, '#ffffff');
    for (const r of [2, 4]) { px(g, 11 + r, 8 - r, 1, r * 2 + 1, '#5fff6a'); }
  },
  charge(g) {
    oval(g, 10, 9, 5, 4, '#2a1a10'); oval(g, 10, 9, 4, 3, '#6b4426'); px(g, 14, 8, 2, 2, '#a07850');
    px(g, 0, 5, 5, 1, '#d8d0c0'); px(g, 1, 9, 4, 1, '#d8d0c0'); px(g, 0, 12, 5, 1, '#d8d0c0');
  },
  grove(g) {
    for (const [x, h] of [[2, 12], [7, 15], [12, 11]]) { px(g, x, 16 - h, 3, h, '#4a2e18'); px(g, x + 1, 16 - h, 1, h, '#7a5432'); oval(g, x + 1, 16 - h, 3, 2, '#3f7a2e'); }
    px(g, 5, 7, 2, 1, '#9be36a'); px(g, 10, 4, 2, 1, '#9be36a'); px(g, 0, 15, 16, 1, '#2a4a1e');
  },
  farrow(g) {
    px(g, 2, 12, 9, 1, '#d8c39a'); for (let k = 0; k < 9; k++) px(g, 2 + k, 13 - k, 1, 1, '#d8c39a');
    px(g, 10, 3, 3, 3, '#e9eef3'); px(g, 1, 12, 2, 2, '#c4533a');
    px(g, 11, 1, 2, 2, '#ffd36a'); px(g, 13, 3, 2, 2, '#ff8a3c'); px(g, 9, 6, 2, 2, '#ff8a3c'); px(g, 6, 9, 2, 2, '#ff5a1a'); px(g, 3, 11, 2, 2, '#c4371a');
  },
  twin(g) {
    for (const s of [0, 1]) { const o = s * 6; for (let k = 0; k < 8; k++) px(g, 3 + o + Math.round(k * 0.2), 2 + k, 2, 1, '#d8dde6'); px(g, 2 + o, 10, 4, 1, '#3b2a1e'); px(g, 3 + o, 11, 2, 3, '#5a3a22'); }
    px(g, 7, 1, 2, 1, '#ffffff');
  },
  boon_acorn(g) {
    oval(g, 8, 10, 4, 5, '#2a1e14'); oval(g, 8, 10, 3, 4, '#9a6a3a'); px(g, 6, 8, 2, 3, '#c49a6a');
    px(g, 3, 4, 10, 3, '#2a1e14'); px(g, 4, 5, 8, 2, '#6b4426'); px(g, 5, 5, 2, 1, '#8a5a32'); px(g, 8, 2, 1, 2, '#4a2e18');
  },
  help(g) {
    oval(g, 8, 8, 7, 7, '#2a4a6a'); px(g, 6, 4, 4, 2, '#ffffff'); px(g, 9, 6, 2, 2, '#ffffff'); px(g, 7, 8, 2, 2, '#ffffff'); px(g, 7, 11, 2, 2, '#ffffff');
  },
};
// which picture each skill uses
const SKILL_ICON = {
  warrior: { atk: 'sword', guard: 'shield', quake: 'quake', cry: 'warcry', dash: 'bash', ult: 'bladestorm' },
  sorcerer: { atk: 'shove', gale: 'gale', fire: 'fire', frost: 'frost', dash: 'gust', ult: 'starfall' },
  bowman: { atk: 'bow', mark: 'mark', rain: 'rain', farrow: 'farrow', dash: 'dash', ult: 'deadeye' },
  rogue: { atk: 'dagger', twin: 'twin', smoke: 'smoke', step: 'step', dash: 'clone', ult: 'cuts' },
  druid: { atk: 'thorn', entangle: 'entangle', bear: 'bearform', rejuv: 'rejuv', dash: 'dash', ult: 'grove' },
  bear: { atk: 'maul', stomp: 'stomp', human: 'human', roar: 'roar', dash: 'charge', ult: 'grove' },
  cleric: { atk: 'mace', mend: 'kindle', judge: 'judge', ground: 'ground', dash: 'guiding', ult: 'dawn' },
  warlock: { atk: 'bolt', hands: 'hands', imps: 'imps', siphon: 'siphon', dash: 'dash', ult: 'eclipse' },
};
export function iconSprite(name) {
  return cached('icon' + name, () => {
    const [c, g] = canvas(16, 16);
    (ICON[name] || ICON.help)(g);
    return c;
  });
}
export function skillIconName(cls, id) { return (SKILL_ICON[cls] || SKILL_ICON.warrior)[id] || id; }

// ---------------------------------------------------------- emoji reactions + map pings (12 x 12)
export const EMOJIS = ['laugh', 'wow', 'heart', 'thumbs', 'angry', 'fire', 'sad', 'cool'];
export const PINGS = [
  { id: 'here', label: 'Over here!', col: '#7fd0ff' },
  { id: 'danger', label: 'Danger!', col: '#ff6a5a' },
  { id: 'go', label: 'Go!', col: '#8fe07a' },
  { id: 'help', label: 'Help!', col: '#ffd36a' },
  { id: 'wait', label: 'Wait', col: '#e0e0e8' },
  { id: 'attack', label: 'Attack this!', col: '#ff9a4c' },
];
function face(g, col) { oval(g, 6, 6, 5, 5, PAL.o); oval(g, 6, 6, 4, 4, col); }
const EMO = {
  laugh(g) { face(g, '#ffd36a'); px(g, 3, 4, 2, 1, PAL.o); px(g, 7, 4, 2, 1, PAL.o); px(g, 3, 7, 6, 2, PAL.o); px(g, 4, 8, 4, 1, '#c4372d'); px(g, 1, 4, 1, 2, '#7fd0ff'); },
  wow(g) { face(g, '#ffd36a'); px(g, 3, 3, 2, 2, PAL.o); px(g, 7, 3, 2, 2, PAL.o); oval(g, 6, 8, 1, 1, PAL.o); },
  heart(g) { px(g, 2, 3, 3, 3, '#e0405a'); px(g, 7, 3, 3, 3, '#e0405a'); px(g, 1, 4, 10, 3, '#e0405a'); px(g, 2, 7, 8, 1, '#e0405a'); px(g, 3, 8, 6, 1, '#e0405a'); px(g, 4, 9, 4, 1, '#e0405a'); px(g, 5, 10, 2, 1, '#e0405a'); px(g, 3, 4, 1, 1, '#ffb0c0'); },
  thumbs(g) { px(g, 3, 5, 6, 6, '#e8b994'); px(g, 5, 1, 3, 5, '#e8b994'); px(g, 2, 5, 1, 6, PAL.o); px(g, 3, 11, 6, 1, PAL.o); px(g, 9, 5, 1, 6, PAL.o); px(g, 1, 6, 2, 5, '#2f6fa8'); },
  angry(g) { face(g, '#ff7a5a'); px(g, 3, 3, 2, 1, PAL.o); px(g, 7, 3, 2, 1, PAL.o); px(g, 3, 4, 2, 1, PAL.o); px(g, 7, 4, 2, 1, PAL.o); px(g, 4, 8, 4, 1, PAL.o); },
  fire(g) { px(g, 3, 4, 6, 7, '#c4371a'); px(g, 5, 1, 2, 4, '#c4371a'); px(g, 4, 6, 4, 4, '#ff8a2a'); px(g, 5, 8, 2, 2, '#ffe08a'); },
  sad(g) { face(g, '#ffd36a'); px(g, 3, 4, 2, 1, PAL.o); px(g, 7, 4, 2, 1, PAL.o); px(g, 4, 8, 4, 1, PAL.o); px(g, 3, 9, 1, 1, PAL.o); px(g, 8, 9, 1, 1, PAL.o); px(g, 3, 5, 1, 2, '#5cc8ff'); },
  cool(g) { face(g, '#ffd36a'); px(g, 2, 4, 8, 2, PAL.o); px(g, 3, 4, 2, 1, '#2a6dff'); px(g, 7, 4, 2, 1, '#2a6dff'); px(g, 4, 8, 4, 1, PAL.o); px(g, 7, 7, 1, 1, PAL.o); },
};
export function emojiSprite(name) {
  return cached('emo' + name, () => { const [c, g] = canvas(12, 12); (EMO[name] || EMO.wow)(g); return c; });
}
export function pingSprite(id) {
  return cached('ping' + id, () => {
    const p = PINGS.find((x) => x.id === id) || PINGS[0];
    const [c, g] = canvas(12, 16);
    oval(g, 6, 6, 5, 5, PAL.o); oval(g, 6, 6, 4, 4, p.col);
    px(g, 5, 11, 2, 4, PAL.o); px(g, 5, 11, 1, 3, p.col);
    if (id === 'danger' || id === 'help') { px(g, 5, 3, 2, 4, PAL.o); px(g, 5, 8, 2, 1, PAL.o); }
    else if (id === 'go') { px(g, 4, 3, 1, 6, PAL.o); px(g, 5, 4, 2, 4, PAL.o); px(g, 7, 5, 1, 2, PAL.o); }
    else if (id === 'wait') { px(g, 4, 3, 1, 6, PAL.o); px(g, 7, 3, 1, 6, PAL.o); }
    else if (id === 'attack') { px(g, 3, 3, 1, 1, PAL.o); px(g, 4, 4, 1, 1, PAL.o); px(g, 5, 5, 2, 2, PAL.o); px(g, 7, 7, 1, 1, PAL.o); px(g, 8, 8, 1, 1, PAL.o); px(g, 8, 3, 1, 1, PAL.o); px(g, 3, 8, 1, 1, PAL.o); }
    else { px(g, 5, 3, 2, 2, PAL.o); px(g, 5, 6, 2, 3, PAL.o); }
    return c;
  });
}
