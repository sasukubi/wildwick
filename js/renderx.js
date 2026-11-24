// =============================================================
//  Drawing for the v1.2 additions: camp stations (Skilltree,
//  merchant, leaderboard, path stone, pond, duel ring), the new
//  enemies, webs, the Treant's closing ring, coins, fishing,
//  chat bubbles, duel bars and the Shadowstep aim ring.
//  All original pixel art, drawn by code.
// =============================================================
import { byId } from './data.js';
import { MODES } from './progress.js';
import { whiteOf } from './sprites.js';

const TAU = Math.PI * 2;
const cache = new Map();
function sprite(key, w, h, draw) {
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    draw(g);
    cache.set(key, c);
  }
  return c;
}
const px = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
function oval(g, cx, cy, rx, ry, col) {
  g.fillStyle = col;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
    g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}
const OUT = '#1a120c';

let SNAP = null; // the current snapshot, for props that change with it
export function setSnap(s) { SNAP = s; }

// ---------------------------------------------------- props
function skilltreeSprite() {
  return sprite('skilltree', 84, 104, (g) => {
    oval(g, 42, 98, 30, 5, 'rgba(0,0,0,0.35)');
    // roots and a thick, twisting trunk
    for (const [x, w] of [[22, 10], [52, 12]]) { px(g, x, 88, w, 8, OUT); px(g, x + 1, 89, w - 2, 6, '#5a3d26'); }
    px(g, 31, 46, 22, 50, OUT); px(g, 32, 47, 20, 48, '#6b4a2e'); px(g, 32, 47, 6, 48, '#80583a'); px(g, 46, 47, 6, 48, '#4e3420');
    for (let y = 52; y < 92; y += 7) px(g, 36 + ((y * 7) % 9), y, 3, 2, '#4e3420');
    // a hollow glowing with old light
    oval(g, 42, 70, 5, 7, OUT); oval(g, 42, 70, 4, 6, '#1d2c20');
    // the canopy: big round clumps of leaves, lit gold-green
    const clumps = [[42, 30, 26, 20], [20, 40, 15, 12], [64, 40, 15, 12], [30, 18, 14, 11], [56, 18, 14, 11], [42, 10, 13, 9]];
    for (const [x, y, rx, ry] of clumps) oval(g, x, y, rx + 1, ry + 1, OUT);
    for (const [x, y, rx, ry] of clumps) oval(g, x, y, rx, ry, '#3d6a34');
    for (const [x, y, rx, ry] of clumps) oval(g, x - 3, y - 3, rx - 5, ry - 5, '#5a8c3e');
    for (const [x, y, rx, ry] of clumps) oval(g, x - 5, y - 5, Math.max(2, rx - 11), Math.max(2, ry - 10), '#86b452');
    for (let i = 0; i < 26; i++) px(g, 14 + ((i * 37) % 56), 6 + ((i * 23) % 44), 2, 2, i % 3 ? '#e8d870' : '#c8f08a');
  });
}
function shopSprite() {
  return sprite('shop', 64, 64, (g) => {
    oval(g, 32, 60, 28, 4, 'rgba(0,0,0,0.35)');
    // posts and the striped awning
    px(g, 6, 18, 4, 42, OUT); px(g, 7, 19, 2, 40, '#7a5434'); px(g, 54, 18, 4, 42, OUT); px(g, 55, 19, 2, 40, '#7a5434');
    px(g, 2, 10, 60, 12, OUT);
    for (let i = 0; i < 7; i++) px(g, 3 + i * 8.4, 11, 9, 10, i % 2 ? '#e8c45c' : '#7b4fb0');
    for (let i = 0; i < 7; i++) oval(g, 7 + i * 8.4, 22, 4, 2, i % 2 ? '#e8c45c' : '#7b4fb0');
    // the merchant: a small fox in a hood
    oval(g, 32, 34, 8, 8, OUT); oval(g, 32, 34, 7, 7, '#d0702a'); oval(g, 32, 37, 4, 3, '#f0e8dc');
    px(g, 25, 25, 4, 5, '#d0702a'); px(g, 35, 25, 4, 5, '#d0702a'); px(g, 29, 32, 2, 2, OUT); px(g, 34, 32, 2, 2, OUT);
    px(g, 22, 28, 20, 4, '#4a3a68');
    // the counter with potions
    px(g, 4, 42, 56, 16, OUT); px(g, 5, 43, 54, 14, '#8a5a3a'); px(g, 5, 43, 54, 3, '#a3704a');
    for (const [x, c] of [[12, '#ff7a4a'], [20, '#ffd36a'], [44, '#7fe08a'], [52, '#9fd8ff']]) { px(g, x, 34, 5, 8, OUT); px(g, x + 1, 36, 3, 5, c); px(g, x + 1, 33, 3, 2, '#d8c8a8'); }
    px(g, 27, 40, 10, 3, '#ffe066'); px(g, 29, 38, 6, 2, '#fff3a0');
  });
}
function pathstoneSprite() {
  return sprite('pathstone', 26, 40, (g) => {
    oval(g, 13, 36, 11, 3, 'rgba(0,0,0,0.35)');
    for (let y = 0; y < 32; y++) { const w = Math.round(7 + Math.sin(y / 9) * 2 + (y > 24 ? (y - 24) * 0.4 : 0)); px(g, 13 - w - 1, 4 + y, w * 2 + 2, 1, OUT); px(g, 13 - w, 4 + y, w * 2, 1, y % 5 ? '#7d8288' : '#6a6f75'); }
    px(g, 8, 6, 4, 26, '#9aa0a6');
    px(g, 6, 30, 5, 3, '#4f7a3a'); px(g, 16, 31, 4, 2, '#4f7a3a');
  });
}
function wispSprite(f) {
  return sprite('wisp' + f, 14, 14, (g) => {
    oval(g, 7, 7, 4, 4, 'rgba(160,255,230,0.5)');
    oval(g, 7, 7, 2, 2, f ? '#ffffff' : '#d8fff4');
    px(g, 6, 6, 2, 2, '#ffffff');
  });
}
function mossbackSprite(f) {
  return sprite('moss' + f, 34, 24, (g) => {
    oval(g, 17, 21, 14, 3, 'rgba(0,0,0,0.35)');
    // little legs
    for (let i = 0; i < 3; i++) { const dy = f ? (i % 2 ? 1 : -1) : 0; px(g, 9 + i * 7, 17 + dy, 2, 4, OUT); }
    // shell
    oval(g, 16, 12, 13, 9, OUT); oval(g, 16, 12, 12, 8, '#3b4a2c'); oval(g, 15, 10, 10, 5, '#4f6236');
    px(g, 16, 4, 1, 16, '#2a3420');
    for (const [x, y] of [[9, 7], [20, 6], [12, 13], [22, 12], [17, 9]]) { px(g, x, y, 3, 2, '#7fae4a'); px(g, x + 1, y - 1, 1, 1, '#a6d06a'); }
    // head at the front (right)
    oval(g, 29, 14, 4, 4, OUT); oval(g, 29, 14, 3, 3, '#2e2418'); px(g, 30, 12, 2, 1, '#ffb84a');
  });
}
function shamanSprite(f) {
  return sprite('shaman' + f, 26, 34, (g) => {
    oval(g, 12, 31, 8, 2, 'rgba(0,0,0,0.35)');
    // bark cloak
    for (let y = 0; y < 20; y++) { const w = 4 + Math.round(y * 0.35); px(g, 12 - w - 1, 11 + y, w * 2 + 2, 1, OUT); px(g, 12 - w, 11 + y, w * 2, 1, y % 4 ? '#5a3d26' : '#4a3020'); }
    // antlered skull mask
    oval(g, 12, 8, 5, 5, OUT); oval(g, 12, 8, 4, 4, '#e8dcc0'); px(g, 10, 8, 2, 2, OUT); px(g, 13, 8, 2, 2, OUT);
    px(g, 5, 0, 2, 6, '#c8b090'); px(g, 3, 1, 2, 2, '#c8b090'); px(g, 17, 0, 2, 6, '#c8b090'); px(g, 19, 1, 2, 2, '#c8b090');
    // staff with a green glow
    px(g, 21, 6, 2, 26, OUT); px(g, 21, 7, 1, 24, '#8a6a4a');
    oval(g, 22, 5, 3, 3, f ? '#c8ff9a' : '#7fe08a');
  });
}
function widowSprite(f) {
  return sprite('widow' + f, 56, 40, (g) => {
    oval(g, 28, 36, 22, 4, 'rgba(0,0,0,0.35)');
    // eight bramble legs
    g.strokeStyle = OUT; g.lineWidth = 3;
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const k = f && i % 2 ? 2 : 0;
      g.beginPath(); g.moveTo(28 + s * 6, 22); g.lineTo(28 + s * (14 + i * 3), 12 + i * 4 - k); g.lineTo(28 + s * (20 + i * 3), 26 + i * 3 + k); g.stroke();
    }
    g.strokeStyle = '#5a3d26'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const k = f && i % 2 ? 2 : 0;
      g.beginPath(); g.moveTo(28 + s * 6, 22); g.lineTo(28 + s * (14 + i * 3), 12 + i * 4 - k); g.lineTo(28 + s * (20 + i * 3), 26 + i * 3 + k); g.stroke();
    }
    // body: abdomen with a red thorn mark, and a head with many eyes
    oval(g, 28, 18, 11, 9, OUT); oval(g, 28, 18, 10, 8, '#2a1e22'); oval(g, 26, 15, 6, 4, '#3d2c30');
    px(g, 27, 16, 3, 6, '#c4333a'); px(g, 25, 18, 7, 2, '#c4333a');
    oval(g, 28, 28, 6, 5, OUT); oval(g, 28, 28, 5, 4, '#1e1418');
    for (const [x, y] of [[25, 27], [27, 26], [29, 26], [31, 27], [26, 29], [30, 29]]) px(g, x, y, 1, 1, '#ff5a4a');
    // thorns on the back
    for (const [x, y] of [[22, 12], [33, 11], [28, 9], [20, 18], [36, 17]]) px(g, x, y, 2, 2, '#6b8a3a');
  });
}

export function drawNewProp(ctx, p, t) {
  switch (p.type) {
    case 'skilltree': {
      const img = skilltreeSprite();
      const sway = Math.round(Math.sin(t * 0.8) * 1);
      ctx.drawImage(img, p.x - 42 + sway, p.y - 98);
      // glowing runes on the trunk and drifting motes
      const a = 0.45 + Math.sin(t * 2) * 0.25;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(160,255,170,${a})`;
      for (const [x, y] of [[-6, -40], [3, -32], [-3, -22], [5, -16], [-2, -48]]) ctx.fillRect(p.x + x, p.y + y, 2, 4);
      for (let i = 0; i < 6; i++) {
        const k = (t * 0.25 + i / 6) % 1;
        ctx.fillStyle = `rgba(230,255,150,${(1 - k) * 0.8})`;
        ctx.fillRect(Math.round(p.x - 30 + ((i * 17) % 60) + Math.sin(t + i) * 4), Math.round(p.y - 40 - k * 50), 2, 2);
      }
      ctx.restore();
      return true;
    }
    case 'shop': ctx.drawImage(shopSprite(), p.x - 32, p.y - 58); return true;
    case 'lboard': {
      // a board with a golden banner on top
      ctx.drawImage(sprite('lboard', 40, 50, (g) => {
        oval(g, 20, 47, 14, 3, 'rgba(0,0,0,0.3)');
        px(g, 6, 22, 3, 26, OUT); px(g, 31, 22, 3, 26, OUT); px(g, 7, 23, 1, 24, '#7a5434'); px(g, 32, 23, 1, 24, '#7a5434');
        px(g, 2, 8, 36, 24, OUT); px(g, 3, 9, 34, 22, '#8a5a3a'); px(g, 3, 9, 34, 2, '#a3704a');
        for (let i = 0; i < 4; i++) { px(g, 7, 13 + i * 4, 3, 2, ['#ffd36a', '#d8d8e0', '#d08a4a', '#efe4c8'][i]); px(g, 12, 13 + i * 4, 20 - i * 3, 2, '#efe4c8'); }
        px(g, 10, 0, 20, 9, OUT); px(g, 11, 1, 18, 7, '#e8c45c'); px(g, 17, 2, 6, 5, '#fff3a0'); px(g, 19, 3, 2, 3, '#c49a3a');
      }), p.x - 20, p.y - 48);
      return true;
    }
    case 'pathstone': {
      ctx.drawImage(pathstoneSprite(), p.x - 13, p.y - 38);
      const m = SNAP && SNAP.md;
      const col = m === 'endless' ? [190, 140, 255] : m === 'daily' ? [255, 215, 110] : [150, 255, 170];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${col},${0.6 + Math.sin(t * 3) * 0.3})`;
      ctx.fillRect(p.x - 1, p.y - 30, 2, 10); ctx.fillRect(p.x - 4, p.y - 26, 8, 2); ctx.fillRect(p.x - 3, p.y - 20, 6, 2);
      ctx.restore();
      return true;
    }
  }
  return false;
}

// flat things drawn on the ground, under everyone
export function drawGroundProps(ctx, world, snap, t, vis) {
  for (const p of world.props) {
    if (!vis(p.x, p.y, 120)) continue;
    if (p.type === 'pond') {
      const rx = 36, ry = 24;
      ctx.fillStyle = '#2d3a22'; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx + 4, ry + 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#13283a'; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1d3d55'; ctx.beginPath(); ctx.ellipse(p.x - 4, p.y - 3, rx - 8, ry - 7, 0, 0, TAU); ctx.fill();
      // gentle ripples
      ctx.strokeStyle = 'rgba(170,220,255,0.25)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.3 + i / 3) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(p.x + [-10, 8, 2][i], p.y + [2, -6, 8][i], 3 + k * 12, 1.5 + k * 6, 0, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // lily pads and reeds
      for (const [x, y] of [[-20, 8], [16, 10], [22, -8]]) { ctx.fillStyle = '#3f7a3a'; ctx.beginPath(); ctx.ellipse(p.x + x, p.y + y, 4, 2.5, 0, 0.4, TAU); ctx.fill(); }
      ctx.fillStyle = '#ff9ad0'; ctx.fillRect(p.x + 15, p.y + 9, 2, 2);
      for (const [x, y, h] of [[-36, -6, 12], [-33, -2, 9], [33, 4, 11], [36, 0, 8], [-30, 14, 7]]) { ctx.fillStyle = '#4f7a3a'; ctx.fillRect(p.x + x, p.y + y - h, 1, h); ctx.fillStyle = '#6b4a2e'; ctx.fillRect(p.x + x, p.y + y - h, 1, 3); }
    } else if (p.type === 'duelring') {
      ctx.fillStyle = 'rgba(120,90,60,0.28)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(230,200,140,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU, x = Math.round(p.x + Math.cos(a) * p.r), y = Math.round(p.y + Math.sin(a) * p.r);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 4, y, 9, 3);
        ctx.fillStyle = OUT; ctx.fillRect(x - 4, y - 9, 8, 10);
        ctx.fillStyle = i % 2 ? '#8a8f95' : '#7a7f85'; ctx.fillRect(x - 3, y - 8, 6, 8);
        ctx.fillStyle = '#a6acb2'; ctx.fillRect(x - 3, y - 8, 2, 7);
      }
      // two crossed swords in the middle
      ctx.strokeStyle = 'rgba(230,220,200,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x - 8, p.y - 6); ctx.lineTo(p.x + 8, p.y + 6); ctx.moveTo(p.x + 8, p.y - 6); ctx.lineTo(p.x - 8, p.y + 6); ctx.stroke();
    }
  }
  // the Treant's ring of thorns closing in
  if (snap.rg) {
    const g = snap.rg;
    ctx.save();
    ctx.fillStyle = 'rgba(90,10,10,0.35)';
    ctx.beginPath(); ctx.rect(g.x - 3000, g.y - 3000, 6000, 6000); ctx.arc(g.x, g.y, g.r, 0, TAU, true); ctx.fill();
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU, j = Math.sin(i * 12.9) * 4;
      const x = g.x + Math.cos(a) * (g.r + j), y = g.y + Math.sin(a) * (g.r + j);
      ctx.fillStyle = OUT; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 10, 6, 12);
      ctx.fillStyle = i % 2 ? '#5a3d26' : '#6b4a2e'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 9, 4, 10);
      ctx.fillStyle = '#8a4a2a'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 12, 2, 3);
    }
    ctx.restore();
  }
}

export function propLights(world, t, L) {
  for (const p of world.props) {
    if (p.type === 'skilltree') L.push({ x: p.x, y: p.y - 50, r: 200 + Math.sin(t * 2) * 12, col: [190, 255, 150], i: 0.9 });
    else if (p.type === 'shop') L.push({ x: p.x, y: p.y - 30, r: 130, col: [255, 200, 120], i: 0.85 });
    else if (p.type === 'pathstone') L.push({ x: p.x, y: p.y - 24, r: 90 + Math.sin(t * 3) * 8, col: [200, 220, 255], i: 0.7 });
    else if (p.type === 'pond') L.push({ x: p.x, y: p.y, r: 90, col: [140, 200, 255], i: 0.45 });
    else if (p.type === 'lboard') L.push({ x: p.x, y: p.y - 24, r: 100, col: [255, 210, 120], i: 0.7 });
    else if (p.type === 'duelring') L.push({ x: p.x, y: p.y, r: 120, col: [255, 200, 140], i: 0.5 });
  }
}

// ---------------------------------------------------- enemies
export const NEW_ENEMIES = new Set(['wisp', 'mossback', 'shaman', 'widow', 'duelist']);
export function drawNewEnemy(ctx, e, v, t) {
  const x = Math.round(v.x), y = Math.round(v.y);
  let img, ox, oy;
  if (e.t === 'duelist') return true; // the invisible stand-in for a duelling player
  if (e.t === 'wisp') {
    const hover = Math.round(Math.sin(t * 8 + e.id) * 2) - 12;
    img = wispSprite(e.s === 2 ? 1 : 0);
    ox = -7; oy = hover - 7;
    // a short glowing tail
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i <= 3; i++) { ctx.fillStyle = `rgba(150,255,220,${0.3 / i})`; ctx.fillRect(x - e.fx * i * 3 - 1, y + hover - 1, 2, 2); }
    ctx.restore();
  } else if (e.t === 'mossback') { img = mossbackSprite(v.moving ? Math.floor(t * 6) % 2 : 0); ox = -17; oy = -21; }
  else if (e.t === 'shaman') { img = shamanSprite(e.s === 2 ? 1 : 0); ox = -12; oy = -32; }
  else if (e.t === 'widow') { img = widowSprite(v.moving || e.s === 3 ? Math.floor(t * 8) % 2 : 0); ox = -28; oy = -36; }
  else return false;
  const shake = e.s === 2 ? Math.round(Math.sin(t * 60)) : 0;
  ctx.save();
  ctx.translate(x, y);
  if (e.fx < 0) ctx.scale(-1, 1);
  ctx.drawImage(img, ox + shake, oy);
  if (e.hu) { ctx.globalAlpha = 0.8; ctx.drawImage(whiteOf(img), ox + shake, oy); }
  else if (e.sl) { ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#8fd8ff'; ctx.fillRect(ox, oy, img.width, img.height); }
  ctx.restore();
  if (e.sn) {
    ctx.fillStyle = '#fff6b0';
    for (let i = 0; i < 3; i++) { const a = t * 5 + (i * TAU) / 3; ctx.fillRect(Math.round(x + Math.cos(a) * 9), Math.round(y + oy - 4 + Math.sin(a) * 3), 2, 2); }
  }
  return true;
}
export function enemyLights(e, v, L) {
  if (e.t === 'wisp') L.push({ x: v.x, y: v.y - 12, r: 42, col: [150, 255, 220], i: 0.8 });
  else if (e.t === 'shaman') L.push({ x: v.x + 10, y: v.y - 28, r: 50, col: [140, 255, 140], i: 0.6 });
}

// ---------------------------------------------------- webs (Bramble Widow)
export function drawWeb(ctx, h, t) {
  if (!h.done) {
    ctx.strokeStyle = `rgba(235,240,245,${0.25 + h.p * 0.5})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r * (0.4 + h.p * 0.6), 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(235,240,245,${0.08 + h.p * 0.15})`; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
    return;
  }
  ctx.strokeStyle = 'rgba(235,240,245,0.7)'; ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r * 0.7); ctx.stroke(); }
  for (const k of [0.35, 0.65, 0.95]) { ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * k, h.r * k * 0.7, 0, 0, TAU); ctx.stroke(); }
}

// ---------------------------------------------------- coins
export function drawCoin(ctx, k, y, t) {
  ctx.fillStyle = 'rgba(255,220,90,0.35)'; ctx.fillRect(k.x - 2, y - 2, 4, 4);
  ctx.fillStyle = '#ffe066'; ctx.fillRect(k.x - 1, y - 1, 2, 2);
  if (Math.sin(t * 6 + k.id) > 0.85) { ctx.fillStyle = '#ffffff'; ctx.fillRect(k.x, y - 3, 1, 1); ctx.fillRect(k.x + 2, y - 1, 1, 1); }
}

// ---------------------------------------------------- world-space extras (after characters)
export function drawWorldExtras(ctx, game, snap, me, t) {
  // fishing: your line and bobber, or other players' rods
  for (const p of snap.ps) {
    const fishing = p.id === game.myId ? !!game.fishing : p.em === 'fish';
    if (!fishing) continue;
    const v = game.playerView(p);
    const F = p.id === game.myId ? game.fishing : null;
    const dir = F ? (F.bx >= v.x ? 1 : -1) : 1;
    const hx = v.x + dir * 6, hy = v.y - 16, tx = v.x + dir * 20, ty = v.y - 36;
    ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    if (F) {
      const dip = F.st === 'bite' ? 3 + Math.sin(t * 30) * 1.5 : Math.sin(t * 3) * 0.8;
      ctx.strokeStyle = 'rgba(230,230,230,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo((tx + F.bx) / 2, Math.max(ty, F.by) + 4, F.bx, F.by + dip); ctx.stroke();
      ctx.fillStyle = '#ff5a4a'; ctx.fillRect(Math.round(F.bx) - 1, Math.round(F.by + dip) - 2, 3, 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(F.bx) - 1, Math.round(F.by + dip), 3, 1);
    }
  }
  // Bladestorm: the Warrior's sword grows huge and sweeps round. Its tip traces exactly how far the storm hits.
  for (const p of snap.ps) {
    if (!p.bs) continue;
    const v = game.playerView(p);
    const R = p.br || 62, cx = v.x, cy = v.y - 4, a = t * 12;
    ctx.save();
    // faint edge of the danger circle
    ctx.strokeStyle = 'rgba(150,15,30,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    // crimson trail with a smoky dark edge
    for (let i = 14; i >= 1; i--) {
      const b = a - i * 0.11, k = 1 - i / 15;
      ctx.strokeStyle = `rgba(25,4,8,${0.25 * k})`; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(b) * (R - 6), cy + Math.sin(b) * (R - 6)); ctx.lineTo(cx + Math.cos(b) * R, cy + Math.sin(b) * R); ctx.stroke();
      ctx.strokeStyle = `rgba(170,18,32,${0.5 * k})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(b) * 14, cy + Math.sin(b) * 14); ctx.lineTo(cx + Math.cos(b) * (R - 3), cy + Math.sin(b) * (R - 3)); ctx.stroke();
    }
    // the giant blade
    ctx.translate(cx, cy); ctx.rotate(a);
    ctx.fillStyle = '#1a0a0c';
    ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(R - 10, -4); ctx.lineTo(R, 0); ctx.lineTo(R - 10, 4); ctx.lineTo(12, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9d1da';
    ctx.beginPath(); ctx.moveTo(13, -3.5); ctx.lineTo(R - 11, -3); ctx.lineTo(R - 2, 0); ctx.lineTo(R - 11, 3); ctx.lineTo(13, 3.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#eef3f8'; ctx.fillRect(13, -3, R - 26, 1.5);
    ctx.fillStyle = '#8a1020'; ctx.fillRect(16, -0.5, R - 34, 1);     // a dark-red fuller down the blade
    ctx.fillStyle = '#1a0a0c'; ctx.fillRect(8, -8, 4, 16);             // crossguard
    ctx.fillStyle = '#6a0f18'; ctx.fillRect(9, -7, 2, 14);
    ctx.fillStyle = '#3a1a10'; ctx.fillRect(0, -2, 9, 4);              // grip
    ctx.restore();
  }
  // Battle Cry: a subtle red pulse around the Warrior while it lasts
  for (const p of snap.ps) {
    if (!p.cr) continue;
    const v = game.playerView(p);
    const k = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(v.x, v.y - 14, 2, v.x, v.y - 14, 26 + k * 4);
    g.addColorStop(0, `rgba(200,20,35,${0.18 + 0.12 * k})`); g.addColorStop(1, 'rgba(120,0,10,0)');
    ctx.fillStyle = g; ctx.fillRect(v.x - 32, v.y - 46, 64, 64);
    ctx.restore();
  }
  // Shadowstep: a brief, faint purple ring under who you'd jump behind
  if (game.stepAim) {
    const v = game.views.get('e' + game.stepAim.id);
    const k = (game.t - game.stepAim.t0) / 0.8;
    if (v && k < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(190,140,255,${0.4 * (1 - k)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(v.x, v.y, 16 + k * 4, 9 + k * 2, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------- screen text extras
export function drawScreenExtras(ctx, game, snap, me, toS, vis, t, text) {
  // the path you'll take next, under the archway's name
  const z = game.world.readyZone;
  if (z && snap.md) { const [x, y] = toS(z.x + z.w / 2, z.y + 4); const m = byId(MODES, snap.md); text(ctx, snap.rs ? `${m.name} · forest ${snap.rs}` : m.name, x, y + 18, { size: 12, color: '#c9d6cd' }); }
  // duel health over both duellists
  const D = snap.du;
  if (D) {
    for (const [id, hp] of [[D.a, D.ha], [D.b, D.hb]]) {
      const p = snap.ps.find((q) => q.id === id);
      if (!p) continue;
      const v = game.playerView(p);
      const [x, y] = toS(v.x, v.y - 58);
      const w = 44;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(Math.round(x - w / 2 - 1), Math.round(y - 1), w + 2, 7);
      ctx.fillStyle = '#ff6a4a'; ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w * (hp / D.mx)), 5);
      text(ctx, D.on ? 'duel' : `duel in ${D.t}`, x, y - 8, { size: 10, color: '#ffd0b0' });
    }
  }
  // chat bubbles over heads (5 seconds)
  for (const p of snap.ps) {
    const b = game.bubbles.get(p.id);
    if (!b) continue;
    const v = game.playerView(p);
    if (!vis(v.x, v.y)) continue;
    const age = game.t - b.t0;
    const a = age > 4.5 ? Math.max(0, (5 - age) * 2) : 1;
    const lines = wrap(b.text.toLowerCase(), 26).slice(0, 3);
    const [x, y0] = toS(v.x, v.y - (D && (D.a === p.id || D.b === p.id) ? 74 : 62));
    ctx.font = '700 13px \'Alegreya Sans SC\', system-ui, sans-serif';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, h = lines.length * 15 + 8;
    const y = y0 - h;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(12,16,14,0.72)';
    ctx.beginPath(); ctx.roundRect(Math.round(x - w / 2), Math.round(y), Math.round(w), h, 8); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 5, y + h); ctx.lineTo(x + 5, y + h); ctx.lineTo(x, y + h + 6); ctx.fill();
    ctx.globalAlpha = 1;
    lines.forEach((l, i) => text(ctx, l, x, y + 11 + i * 15, { size: 13, weight: 700, color: '#f4f1ea', alpha: a }));
  }
}
function wrap(s, n) {
  const out = [];
  let line = '';
  for (const w of s.split(' ')) {
    if ((line + ' ' + w).trim().length > n && line) { out.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}
