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
  const robe = cls === 'sorcerer';
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
