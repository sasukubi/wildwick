// =============================================================
//  Rendering: everything you see. All art is drawn with code
//  (no image files yet), so it can be swapped for pixel art later.
//  Draw order: ground -> objects sorted by depth -> tree canopy
//  -> darkness/light -> glowing things -> HUD.
// =============================================================
import { TILE, CLOAKS, FLAMES, CLASSES, WARRIOR, WOLF, FLAME_RULES, byId } from './data.js';
import { hash2 } from './rng.js';

const TAU = Math.PI * 2;
const SKIN = '#e9c4a0';
const HAIR = '#4a3326';
const FONT = 'Nunito, system-ui, sans-serif';
const TITLE = 'Cinzel, Georgia, serif';

// ---------------------------------------------------------- helpers
export function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
export function shade(hex, amt) {
  let [r, g, b] = hexRgb(hex);
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function hexA(hex, a) { return rgba(hexRgb(hex), a); }
function ellipse(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
function idSeed(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return (h >>> 0) % 1000; }

function text(ctx, s, x, y, { size = 14, font = FONT, weight = 700, color = '#fff', align = 'center', shadow = true, alpha = 1 } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = alpha;
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(s, x + 1, y + 2); }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------- characters
function drawSword(ctx, o) {
  const a = o.aim;
  const hx = Math.cos(a) * 11, hy = -18 + Math.sin(a) * 6;
  let ang;
  if (o.swing >= 0) {
    const span = o.heavy ? 1.6 : 1.25;
    ang = a - span + easeOut(o.swing) * span * 2;
  } else ang = a + 0.75 * (Math.cos(a) >= 0 ? 1 : -1);
  const len = o.heavy && o.swing >= 0 ? 30 : 25;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  ctx.fillStyle = '#4a3020'; ctx.fillRect(-5, -1.5, 6, 3);
  ctx.fillStyle = '#c9a74e'; ctx.fillRect(1, -5, 2.5, 10);
  ctx.fillStyle = '#d6dde6';
  ctx.beginPath();
  ctx.moveTo(3.5, -2.2); ctx.lineTo(len, -1.2); ctx.lineTo(len + 4, 0); ctx.lineTo(len, 1.2); ctx.lineTo(3.5, 2.2);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(5, -0.6); ctx.lineTo(len, -0.4); ctx.stroke();
  ctx.fillStyle = SKIN; circle(ctx, -1, 0, 3);
  ctx.restore();
}

function drawHat(ctx, hat, cloak, up) {
  switch (hat) {
    case 'hood':
      ctx.fillStyle = shade(cloak, -0.15);
      ctx.beginPath();
      if (up) ctx.arc(0, -35, 10, 0, TAU);
      else {
        ctx.arc(0, -35, 10.5, Math.PI * 0.92, Math.PI * 2.08);
        ctx.lineTo(8, -29);
        ctx.quadraticCurveTo(0, -44, -8, -29);
        ctx.closePath();
      }
      ctx.fill();
      break;
    case 'witch':
      ctx.fillStyle = '#2a2238'; ellipse(ctx, 0, -41, 14, 3.8);
      ctx.beginPath();
      ctx.moveTo(-7.5, -42); ctx.quadraticCurveTo(-2, -55, 7, -64); ctx.quadraticCurveTo(3, -52, 7.5, -42);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = cloak; ctx.fillRect(-7, -46, 14, 2.6);
      break;
    case 'antlers':
      ctx.strokeStyle = '#9a7650'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 4, -41); ctx.lineTo(s * 8, -50); ctx.lineTo(s * 13, -54);
        ctx.moveTo(s * 8, -50); ctx.lineTo(s * 7, -57);
        ctx.moveTo(s * 10.5, -52); ctx.lineTo(s * 14, -48);
        ctx.stroke();
      }
      break;
    case 'mushroom':
      ctx.fillStyle = '#e8d8c0'; ctx.fillRect(-10, -41, 20, 2.5);
      ctx.fillStyle = '#c4372d';
      ctx.beginPath(); ctx.ellipse(0, -40, 13, 9, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f4ece0';
      circle(ctx, -5, -45, 2.2); circle(ctx, 3, -47, 1.8); circle(ctx, 7.5, -42.5, 1.5); circle(ctx, -9.5, -42, 1.3);
      break;
    case 'circlet':
      ctx.strokeStyle = '#e8c45c'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.ellipse(0, -38, 8.6, 3, 0, 0, TAU); ctx.stroke();
      if (!up) { ctx.fillStyle = '#7fe8ff'; circle(ctx, 0, -35.2, 1.8); }
      break;
  }
}

// o: { cloak (hex), hat, aim, moving, swing (-1 or 0..1), heavy, down, hurt, dash, scale }
export function drawCharacter(ctx, x, y, o, t) {
  ctx.save();
  ctx.translate(x, y);
  if (o.scale) ctx.scale(o.scale, o.scale);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ellipse(ctx, 0, 0, 14, 5);
  const cloak = o.cloak;
  if (o.down) {
    ctx.fillStyle = shade(cloak, -0.35); ellipse(ctx, -2, -4, 17, 7);
    ctx.fillStyle = cloak; ellipse(ctx, -4, -6, 12, 5);
    ctx.fillStyle = SKIN; circle(ctx, 12, -6, 6);
    ctx.restore();
    return;
  }
  if (o.hurt && Math.floor(t * 30) % 2) ctx.globalAlpha = 0.55;
  if (o.dash) ctx.globalAlpha = 0.8;
  const walk = o.moving ? t * 13 : 0;
  const bob = o.moving ? Math.abs(Math.sin(walk)) * 2 : Math.sin(t * 2.2) * 0.6;
  const up = Math.sin(o.aim) < -0.4;
  const side = Math.cos(o.aim) >= 0 ? 1 : -1;

  // legs
  ctx.fillStyle = '#2b2220';
  const s1 = o.moving ? Math.sin(walk) * 3 : 0;
  rrect(ctx, -6, -9 + Math.max(0, s1), 5, 9 - Math.max(0, s1), 2); ctx.fill();
  rrect(ctx, 1, -9 + Math.max(0, -s1), 5, 9 - Math.max(0, -s1), 2); ctx.fill();

  ctx.translate(0, -bob);
  if (up) drawSword(ctx, o);

  // cloak / body
  const g = ctx.createLinearGradient(0, -30, 0, -6);
  g.addColorStop(0, shade(cloak, 0.12));
  g.addColorStop(1, shade(cloak, -0.32));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-8, -29); ctx.quadraticCurveTo(0, -32, 8, -29);
  ctx.lineTo(13, -9); ctx.quadraticCurveTo(0, -4, -13, -9);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = shade(cloak, -0.45); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(side * 2, -26); ctx.lineTo(side * 4, -9); ctx.stroke();
  ctx.fillStyle = '#3b2a1e'; ctx.fillRect(-9.5, -19, 19, 3);
  ctx.fillStyle = '#d9b35a'; ctx.fillRect(-1.5, -19, 3, 3);

  // head
  if (up) { ctx.fillStyle = HAIR; circle(ctx, 0, -35, 8.5); }
  else {
    ctx.fillStyle = SKIN; circle(ctx, 0, -35, 8);
    ctx.fillStyle = HAIR;
    ctx.beginPath(); ctx.arc(0, -36, 8.4, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    const ex = Math.cos(o.aim) * 2.5;
    ctx.fillStyle = '#1b1410';
    ctx.fillRect(ex - 3.5, -35, 2, 2.6);
    ctx.fillRect(ex + 1.5, -35, 2, 2.6);
  }
  drawHat(ctx, o.hat, cloak, up);
  if (!up) drawSword(ctx, o);
  ctx.restore();
}

// A teardrop flame. ratio 0..1 sets its size. This is your health.
export function drawFlame(ctx, x, y, ratio, pal, t, wild = false, seed = 0) {
  const base = wild ? 15 : 3.5 + 8.5 * ratio;
  const fl = 1 + Math.sin(t * 17 + seed) * 0.08 + Math.sin(t * 29 + seed * 2) * 0.05;
  const h = base * 2.1 * fl, w = base;
  const gr = ctx.createRadialGradient(x, y - h * 0.3, 0, x, y - h * 0.3, base * 3.2);
  gr.addColorStop(0, hexA(pal.mid, 0.5));
  gr.addColorStop(1, hexA(pal.mid, 0));
  ctx.fillStyle = gr;
  circle(ctx, x, y - h * 0.3, base * 3.2);
  const sway = Math.sin(t * 6 + seed) * w * 0.25;
  const layer = (sc, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - w * sc, y);
    ctx.quadraticCurveTo(x - w * sc * 1.05, y - h * sc * 0.6, x + sway * sc, y - h * sc);
    ctx.quadraticCurveTo(x + w * sc * 1.05, y - h * sc * 0.6, x + w * sc, y);
    ctx.arc(x, y, w * sc, 0, Math.PI);
    ctx.fill();
  };
  layer(1, pal.outer);
  layer(0.7, pal.mid);
  layer(0.4, pal.core);
}

// Character portrait for menus and the wardrobe.
export function drawPreview(canvas, ch, t = 1) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = canvas.height / 80;
  const x = canvas.width / 2 - 4 * s, y = canvas.height - 8 * s;
  const glow = ctx.createRadialGradient(x, y - 30 * s, 0, x, y - 30 * s, 45 * s);
  const pal = byId(FLAMES, ch.flame);
  glow.addColorStop(0, rgba(pal.light, 0.25));
  glow.addColorStop(1, rgba(pal.light, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawCharacter(ctx, x, y, { cloak: byId(CLOAKS, ch.cloak).hex, hat: ch.hat, aim: 0.5, moving: false, swing: -1, scale: s }, t);
  drawFlame(ctx, x + 16 * s, y - 38 * s, 1, pal, t, false, 3);
}

// ---------------------------------------------------------- enemies & props
function drawWolf(ctx, x, y, e, v, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ellipse(ctx, 0, 1, 20, 6);
  const wind = e.s === 2, lunge = e.s === 3;
  if (wind) ctx.translate(Math.sin(t * 70) * 1.5, 2);
  ctx.scale(e.fx || 1, 1);
  const run = v.moving ? t * 16 : 0;
  ctx.fillStyle = '#231a17';
  for (const [lx, ph] of [[-12, 0], [-7, Math.PI], [7, Math.PI * 0.5], [12, Math.PI * 1.5]]) {
    const s = v.moving ? Math.sin(run + ph) * 3 : 0;
    ctx.fillRect(lx - 1.6 + s, -10, 3.2, 10);
  }
  ctx.strokeStyle = '#2e2420'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-17, -16); ctx.quadraticCurveTo(-26, -18 + Math.sin(t * 6) * 2, -29, -26); ctx.stroke();
  const bw = lunge ? 23 : 19, bh = wind ? 8.5 : 9.5;
  const g = ctx.createLinearGradient(0, -24, 0, -6);
  g.addColorStop(0, '#4a3b34'); g.addColorStop(1, '#2a201c');
  ctx.fillStyle = g; ellipse(ctx, 0, -15, bw, bh);
  ctx.fillStyle = '#5f8f3e';
  for (let i = -3; i <= 3; i++) {
    const bx = i * 5;
    ctx.beginPath(); ctx.moveTo(bx - 2.5, -22); ctx.lineTo(bx + 1.5, -29 - (i & 1) * 3); ctx.lineTo(bx + 2.5, -22); ctx.fill();
  }
  ctx.fillStyle = '#3d302b'; ellipse(ctx, 18, -21, 9, 7.5);
  ctx.fillStyle = '#332824'; ellipse(ctx, 26, -18.5, 6.5, 4);
  ctx.fillStyle = '#2a201c';
  ctx.beginPath(); ctx.moveTo(12, -25); ctx.lineTo(14, -34); ctx.lineTo(18, -27); ctx.fill();
  ctx.beginPath(); ctx.moveTo(17, -27); ctx.lineTo(21, -35); ctx.lineTo(23, -25); ctx.fill();
  ctx.fillStyle = '#111'; circle(ctx, 32, -19, 1.6);
  if (e.hu || e.b) {
    ctx.globalAlpha = e.hu ? 0.6 : 0.35;
    ctx.fillStyle = e.hu ? '#ffffff' : '#ff8a30';
    ellipse(ctx, 0, -15, bw, bh);
    ellipse(ctx, 18, -21, 9, 7.5);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawProp(ctx, p, t) {
  if (p.type === 'campfire') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      ctx.fillStyle = i % 2 ? '#5f6469' : '#70767c';
      ellipse(ctx, p.x + Math.cos(a) * 25, p.y + Math.sin(a) * 12, 7, 4.5);
    }
    ctx.save(); ctx.translate(p.x, p.y - 3);
    ctx.fillStyle = '#4a2f1c';
    ctx.rotate(0.4); ctx.fillRect(-18, -3.5, 36, 7);
    ctx.rotate(-0.8); ctx.fillRect(-18, -3.5, 36, 7);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,120,40,0.5)'; ellipse(ctx, p.x, p.y - 3, 14, 6);
  } else if (p.type === 'wardrobe') {
    const x = p.x - 18, y = p.y - 54;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(ctx, p.x, p.y, 22, 6);
    const g = ctx.createLinearGradient(x, 0, x + 36, 0);
    g.addColorStop(0, '#7a5434'); g.addColorStop(1, '#4b3220');
    ctx.fillStyle = g; rrect(ctx, x, y, 36, 54, 3); ctx.fill();
    ctx.fillStyle = '#3a2617'; rrect(ctx, x - 3, y - 6, 42, 8, 3); ctx.fill();
    ctx.strokeStyle = '#2e1e12'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p.x, y + 4); ctx.lineTo(p.x, y + 50); ctx.stroke();
    ctx.strokeRect(x + 4, y + 6, 12, 42); ctx.strokeRect(x + 20, y + 6, 12, 42);
    ctx.fillStyle = '#e0b85a'; circle(ctx, p.x - 3, y + 28, 1.6); circle(ctx, p.x + 3, y + 28, 1.6);
    ctx.fillStyle = '#7b4fb0'; ctx.fillRect(p.x + 1, y + 46, 9, 6);
  } else if (p.type === 'shrine') {
    const c = byId(CLASSES, p.cls);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(ctx, p.x, p.y, 15, 5);
    const g = ctx.createLinearGradient(p.x - 10, 0, p.x + 10, 0);
    g.addColorStop(0, '#7a828c'); g.addColorStop(1, '#4d535b');
    ctx.fillStyle = g; rrect(ctx, p.x - 9, p.y - 30, 18, 30, 2); ctx.fill();
    ctx.fillStyle = '#5d646d'; rrect(ctx, p.x - 12, p.y - 34, 24, 6, 2); ctx.fill();
    text(ctx, c.name[0], p.x, p.y - 15, { size: 13, font: TITLE, color: c.available ? shade(c.color, 0.3) : 'rgba(20,20,25,0.6)', shadow: false });
    if (!c.available) {
      ctx.strokeStyle = 'rgba(30,30,35,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - 26); ctx.lineTo(p.x - 1, p.y - 18); ctx.lineTo(p.x - 4, p.y - 8); ctx.stroke();
    }
  }
}

// ---------------------------------------------------------- world image (drawn once per scene)
function buildWorldGfx(world) {
  const W = world.pw, H = world.ph, T = TILE;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const lobby = world.kind === 'lobby';
  const ground = mk(), g = ground.getContext('2d');
  g.fillStyle = lobby ? '#1f3026' : '#16241d';
  g.fillRect(0, 0, W, H);
  const blotches = Math.floor((W * H) / 9000);
  for (let i = 0; i < blotches; i++) {
    const x = hash2(i, 1) * W, y = hash2(i, 2) * H, r = 30 + hash2(i, 3) * 90;
    const col = hash2(i, 4) < 0.5 ? 'rgba(70,110,75,0.12)' : 'rgba(8,16,20,0.2)';
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (lobby && world.campfire) {
    const { x, y } = world.campfire;
    const gr = g.createRadialGradient(x, y, 0, x, y, 4.5 * T);
    gr.addColorStop(0, 'rgba(120,85,50,0.45)'); gr.addColorStop(1, 'rgba(120,85,50,0)');
    g.fillStyle = gr; g.fillRect(x - 5 * T, y - 5 * T, 10 * T, 10 * T);
    const z = world.readyZone;
    g.fillStyle = 'rgba(105,80,52,0.28)';
    g.fillRect(z.x + z.w * 0.18, z.y, z.w * 0.64, y - z.y - 2 * T);
  }
  const FLOWER = ['#a8d8ff', '#ffb3d1', '#ffe58a', '#d7b3ff'];
  for (const d of world.decor) {
    if (d.k === 'grass') {
      g.strokeStyle = 'rgba(80,130,80,0.55)'; g.lineWidth = 1.2;
      g.beginPath();
      for (const dx of [-3, 0, 3]) { g.moveTo(d.x + dx, d.y); g.lineTo(d.x + dx * 1.6, d.y - 6 * d.s); }
      g.stroke();
    } else if (d.k === 'flower') {
      g.fillStyle = FLOWER[d.c]; circle(g, d.x, d.y, 2);
      g.fillStyle = '#fff6c0'; circle(g, d.x, d.y, 0.8);
    } else if (d.k === 'stone') {
      g.fillStyle = '#4c5258'; ellipse(g, d.x, d.y, 5 * d.s, 3.4 * d.s);
      g.fillStyle = '#6a7178'; ellipse(g, d.x - 1, d.y - 1, 3 * d.s, 1.8 * d.s);
    }
  }
  for (const m of world.glows) {
    g.fillStyle = '#d8d2c0'; g.fillRect(m.x - 1, m.y - 4, 2, 5);
  }
  // trunks for trees that face an open tile below them
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      if (!world.isSolid(tx, ty) || world.isSolid(tx, ty + 1)) continue;
      const cx = (tx + 0.5) * T;
      g.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(g, cx, (ty + 1.05) * T, T * 0.55, T * 0.2);
      g.fillStyle = '#3a2a20'; rrect(g, cx - 5, (ty + 0.55) * T, 10, T * 0.58, 3); g.fill();
      g.fillStyle = '#2c1f17';
      g.beginPath(); g.moveTo(cx - 5, (ty + 1.1) * T); g.lineTo(cx - 10, (ty + 1.15) * T); g.lineTo(cx - 4, (ty + 0.95) * T); g.fill();
      g.beginPath(); g.moveTo(cx + 5, (ty + 1.1) * T); g.lineTo(cx + 10, (ty + 1.15) * T); g.lineTo(cx + 4, (ty + 0.95) * T); g.fill();
    }
  }

  // canopy: drawn on top of characters, so the trees hide what's behind them
  const canopy = mk(), c = canopy.getContext('2d');
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      if (!world.isSolid(tx, ty)) continue;
      let deep = true;
      for (let oy = -1; oy <= 1 && deep; oy++) for (let ox = -1; ox <= 1; ox++) if (!world.isSolid(tx + ox, ty + oy)) { deep = false; break; }
      const hx = hash2(tx, ty), hy = hash2(ty + 31, tx + 17);
      const cx = (tx + 0.5 + (hx - 0.5) * 0.3) * T;
      const cy = (ty + 0.15 + (hy - 0.5) * 0.3) * T;
      if (deep) {
        c.fillStyle = hx < 0.5 ? '#0b1611' : '#0d1a14';
        circle(c, cx, cy, T * 0.95);
        continue;
      }
      const R = T * (0.74 + hx * 0.16);
      c.fillStyle = 'rgba(0,0,0,0.35)'; circle(c, cx + 3, cy + 6, R);
      c.fillStyle = hy < 0.5 ? '#18321f' : '#163024'; circle(c, cx, cy, R);
      c.fillStyle = '#21452b'; circle(c, cx - R * 0.18, cy - R * 0.2, R * 0.72);
      c.fillStyle = '#2e5c38'; circle(c, cx - R * 0.3, cy - R * 0.35, R * 0.42);
      c.fillStyle = '#3d7448';
      for (let k = 0; k < 4; k++) circle(c, cx + (hash2(tx * 9 + k, ty) - 0.5) * R * 1.3, cy + (hash2(tx, ty * 9 + k) - 0.5) * R * 1.1, 2.2);
      if (hash2(tx * 7, ty * 3) < 0.12) {
        c.fillStyle = '#9fe8ff';
        for (let k = 0; k < 3; k++) circle(c, cx + (hash2(k, tx) - 0.5) * R, cy + (hash2(ty, k) - 0.5) * R, 1.6);
      }
    }
  }
  return { ground, canopy };
}

// ---------------------------------------------------------- renderer
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.gfx = null;
  }

  setWorld(world) { this.gfx = buildWorldGfx(world); }

  resize() {
    const w = innerWidth, h = innerHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    if (this.light.width !== w || this.light.height !== h) { this.light.width = w; this.light.height = h; }
  }

  blit(img, ox, oy, W, H) {
    const sx = Math.max(0, ox), sy = Math.max(0, oy);
    const sw = Math.min(img.width - sx, W - (sx - ox)), sh = Math.min(img.height - sy, H - (sy - oy));
    if (sw > 0 && sh > 0) this.ctx.drawImage(img, sx, sy, sw, sh, sx - ox, sy - oy, sw, sh);
  }

  drawLoading(msg, t) {
    this.resize();
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070b0a'; ctx.fillRect(0, 0, W, H);
    drawFlame(ctx, W / 2, H / 2 - 10, 0.8, FLAMES[0], t);
    text(ctx, msg, W / 2, H / 2 + 40, { size: 18, color: '#e9efe6' });
  }

  draw(game, snap, me) {
    this.resize();
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, t = game.t, world = game.world;
    const ox = Math.round(game.cam.x + game.shakeX), oy = Math.round(game.cam.y + game.shakeY);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#060a09';
    ctx.fillRect(0, 0, W, H);
    this.blit(this.gfx.ground, ox, oy, W, H);

    const vx0 = ox - 120, vy0 = oy - 120, vx1 = ox + W + 120, vy1 = oy + H + 120;
    const vis = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;

    ctx.save();
    ctx.translate(-ox, -oy);
    if (world.readyZone) this.drawReadyZone(ctx, world.readyZone, t);
    if (world.exit) this.drawGateBase(ctx, world.exit, t);
    const list = [];
    for (const p of world.props) if (vis(p.x, p.y)) list.push({ y: p.y, d: () => drawProp(ctx, p, t) });
    for (const k of snap.pk) if (vis(k.x, k.y)) list.push({ y: k.y, d: () => { ctx.fillStyle = '#ff9a3c'; circle(ctx, k.x, k.y - 6 + Math.sin(t * 5 + k.id) * 2, 4); } });
    for (const e of snap.es) {
      const v = game.views.get('e' + e.id);
      if (v && vis(v.x, v.y)) list.push({ y: v.y, d: () => drawWolf(ctx, v.x, v.y, e, v, t) });
    }
    for (const p of snap.ps) {
      const v = game.playerView(p);
      if (vis(v.x, v.y)) list.push({ y: v.y, d: () => drawCharacter(ctx, v.x, v.y, game.charOpts(p, v), t) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.d();
    this.drawParticles(ctx, game.particles, false);
    ctx.restore();

    this.blit(this.gfx.canopy, ox, oy, W, H);
    this.drawLighting(game, snap, ox, oy, W, H, t);

    ctx.save();
    ctx.translate(-ox, -oy);
    this.drawPostLight(ctx, game, snap, me, t, vis);
    ctx.restore();

    this.drawHUD(ctx, game, snap, me, W, H, t);
  }

  // ---------------------------------------------------------- lighting
  collectLights(game, snap, t) {
    const L = [], world = game.world;
    for (const p of snap.ps) {
      const v = game.playerView(p);
      if (p.dn) { L.push({ x: v.x, y: v.y - 10, r: 70, col: [255, 90, 50], i: 0.7 }); continue; }
      const pal = byId(FLAMES, p.f);
      const ratio = p.hp / p.mx;
      const fl = 1 + Math.sin(t * 9 + v.x * 0.01) * 0.02 + Math.sin(t * 23) * 0.015;
      const r = (p.w > 0 ? 560 : 95 + 340 * Math.pow(ratio, 0.85)) * fl;
      L.push({ x: v.x + 8, y: v.y - 30, r, col: pal.light, i: 1 });
    }
    if (world.campfire) L.push({ x: world.campfire.x, y: world.campfire.y - 10, r: 420 + Math.sin(t * 7) * 12 + Math.sin(t * 13) * 8, col: [255, 150, 70], i: 1 });
    for (const g of world.glows) L.push({ x: g.x, y: g.y, r: 65, col: g.c, i: 0.55 });
    for (const k of snap.pk) L.push({ x: k.x, y: k.y, r: 60, col: [255, 160, 70], i: 0.8 });
    if (world.exit) L.push({ x: world.exit.x, y: world.exit.y, r: 260 + Math.sin(t * 2) * 10, col: [160, 255, 170], i: 0.9 });
    if (world.readyZone) { const z = world.readyZone; L.push({ x: z.x + z.w / 2, y: z.y + z.h / 2, r: 150, col: [120, 200, 255], i: 0.8 }); }
    for (const p of world.props) {
      if (p.type !== 'shrine') continue;
      const c = byId(CLASSES, p.cls);
      L.push({ x: p.x, y: p.y - 34, r: c.available ? 110 : 45, col: hexRgb(c.color), i: c.available ? 0.9 : 0.5 });
    }
    for (const e of game.effects) {
      if (e.k !== 'ring') continue;
      const a = 1 - (t - e.t0) / e.life;
      if (a > 0) L.push({ x: e.x, y: e.y, r: e.r * 1.6, col: [255, 170, 80], i: a });
    }
    return L;
  }

  drawLighting(game, snap, ox, oy, W, H, t) {
    const l = this.lctx, ctx = this.ctx;
    const dark = game.world.kind === 'lobby' ? 0.74 : 0.955;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, W, H);
    l.fillStyle = `rgba(3,5,14,${dark})`;
    l.fillRect(0, 0, W, H);
    l.globalCompositeOperation = 'destination-out';
    const lights = this.collectLights(game, snap, t).filter((L) => {
      const x = L.x - ox, y = L.y - oy;
      return x > -L.r && y > -L.r && x < W + L.r && y < H + L.r;
    });
    for (const L of lights) {
      const x = L.x - ox, y = L.y - oy, s = L.i;
      const g = l.createRadialGradient(x, y, L.r * 0.05, x, y, L.r);
      g.addColorStop(0, `rgba(0,0,0,${s})`);
      g.addColorStop(0.45, `rgba(0,0,0,${s * 0.8})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g;
      l.fillRect(x - L.r, y - L.r, L.r * 2, L.r * 2);
    }
    ctx.drawImage(this.light, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const x = L.x - ox, y = L.y - oy;
      const g = ctx.createRadialGradient(x, y, 0, x, y, L.r * 0.8);
      g.addColorStop(0, rgba(L.col, 0.16 * L.i));
      g.addColorStop(1, rgba(L.col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - L.r, y - L.r, L.r * 2, L.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------- ground markings
  drawReadyZone(ctx, z, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(120,200,255,0.10)';
    rrect(ctx, z.x + 6, z.y + 6, z.w - 12, z.h - 12, 10); ctx.fill();
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -t * 20;
    ctx.strokeStyle = 'rgba(150,220,255,0.55)'; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawGateBase(ctx, ex, t) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(170,255,170,${0.35 - i * 0.1})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(ex.x, ex.y, ex.r - i * 18, (ex.r - i * 18) * 0.55, 0, 0, TAU); ctx.stroke();
    }
    for (const s of [-1, 1]) {
      const px = ex.x + s * ex.r * 0.95;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(ctx, px, ex.y, 13, 4);
      ctx.fillStyle = '#4f5a55'; rrect(ctx, px - 8, ex.y - 54, 16, 54, 3); ctx.fill();
      ctx.fillStyle = '#3d6b4a'; rrect(ctx, px - 9, ex.y - 58, 18, 8, 3); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------- particles & glow
  drawParticles(ctx, parts, glow) {
    if (glow) ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      if (!!p.glow !== glow) continue;
      let a = p.life / p.max;
      if (p.ff) a = Math.sin(a * Math.PI) * (0.5 + 0.5 * Math.sin(p.life * 6 + p.x));
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = p.color;
      circle(ctx, p.x, p.y, p.size * (p.shrink ? a : 1) + 0.3);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawPostLight(ctx, game, snap, me, t, vis) {
    const world = game.world;
    // mushrooms
    for (const g of world.glows) {
      if (!vis(g.x, g.y)) continue;
      const a = 0.6 + Math.sin(t * 2 + g.ph) * 0.25;
      ctx.fillStyle = rgba(g.c, a);
      ellipse(ctx, g.x, g.y - 4, 4.5, 2.6);
      ctx.fillStyle = rgba([255, 255, 255], a * 0.6);
      circle(ctx, g.x - 1, g.y - 5, 1);
    }
    // campfire flames
    if (world.campfire && vis(world.campfire.x, world.campfire.y)) {
      const { x, y } = world.campfire;
      drawFlame(ctx, x - 7, y - 4, 0.9, FLAMES[0], t, false, 1);
      drawFlame(ctx, x + 7, y - 3, 0.8, FLAMES[0], t * 1.1, false, 2);
      drawFlame(ctx, x, y - 2, 1.4, FLAMES[0], t * 0.9, false, 3);
    }
    // shrine crystals + labels
    for (const p of world.props) {
      if (p.type !== 'shrine' || !vis(p.x, p.y)) continue;
      const c = byId(CLASSES, p.cls);
      const bob = Math.sin(t * 2 + p.x) * 2;
      ctx.fillStyle = c.available ? c.color : 'rgba(90,95,110,0.8)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 52 + bob); ctx.lineTo(p.x + 6, p.y - 43 + bob); ctx.lineTo(p.x, p.y - 36 + bob); ctx.lineTo(p.x - 6, p.y - 43 + bob);
      ctx.fill();
      const near = Math.hypot(p.x - game.lp.x, p.y - game.lp.y) < 170;
      if (near) text(ctx, c.name, p.x, p.y - 64, { size: 12, font: TITLE, color: c.available ? '#fff' : '#9aa3ad' });
      if (me.k === c.id) text(ctx, '✦', p.x, p.y - 76 + bob, { size: 12, color: c.color });
    }
    // ready path label
    if (world.readyZone) {
      const z = world.readyZone;
      text(ctx, 'INTO THE WILDS', z.x + z.w / 2, z.y + z.h + 14, { size: 13, font: TITLE, color: '#bfe8ff' });
    }
    // gate swirl
    if (world.exit && vis(world.exit.x, world.exit.y)) {
      const ex = world.exit;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const a = t * 1.3 + (i / 16) * TAU;
        const rr = ex.r * (0.6 + 0.15 * Math.sin(t * 3 + i));
        ctx.fillStyle = `rgba(190,255,170,${0.5 + 0.3 * Math.sin(t * 4 + i)})`;
        circle(ctx, ex.x + Math.cos(a) * rr, ex.y + Math.sin(a) * rr * 0.55 - 10, 2.5);
      }
      ctx.globalCompositeOperation = 'source-over';
      text(ctx, 'Heartwood Gate', ex.x, ex.y - 78, { size: 14, font: TITLE, color: '#d6ffc8' });
    }
    // embers
    ctx.globalCompositeOperation = 'lighter';
    for (const k of snap.pk) {
      if (!vis(k.x, k.y)) continue;
      const y = k.y - 6 + Math.sin(t * 5 + k.id) * 2;
      const g = ctx.createRadialGradient(k.x, y, 0, k.x, y, 14);
      g.addColorStop(0, 'rgba(255,220,140,0.9)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; circle(ctx, k.x, y, 14);
    }
    ctx.globalCompositeOperation = 'source-over';
    // wolves: lunge warnings, glowing eyes, health bars
    for (const e of snap.es) {
      const v = game.views.get('e' + e.id);
      if (!v || !vis(v.x, v.y)) continue;
      if (e.s === 2) {
        ctx.save();
        ctx.translate(v.x, v.y - 8);
        ctx.rotate(Math.atan2(e.dy, e.dx));
        const g = ctx.createLinearGradient(0, 0, WOLF.lungeRange + 30, 0);
        g.addColorStop(0, 'rgba(255,70,50,0.35)'); g.addColorStop(1, 'rgba(255,70,50,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, -11, WOLF.lungeRange + 30, 22);
        ctx.restore();
      }
      const ey = v.y - 23 + (e.s === 2 ? 2 : 0);
      const ex = v.x + e.fx * 22;
      const col = e.s === 2 ? '255,220,90' : '255,60,45';
      const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 8);
      g.addColorStop(0, `rgba(${col},0.6)`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; circle(ctx, ex, ey, 8);
      ctx.fillStyle = `rgb(${col})`;
      circle(ctx, ex, ey, 1.5);
      circle(ctx, ex - e.fx * 4, ey - 1, 1.4);
      if (e.hp < e.mx) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(v.x - 16, v.y - 46, 32, 5);
        ctx.fillStyle = '#d9473a'; ctx.fillRect(v.x - 15, v.y - 45, 30 * Math.max(0, e.hp / e.mx), 3);
      }
    }
    // players: flames, Wildfire, names, rekindling
    for (const p of snap.ps) {
      const v = game.playerView(p);
      if (!vis(v.x, v.y)) continue;
      const pal = byId(FLAMES, p.f);
      const seed = idSeed(p.id);
      if (p.dn) {
        drawFlame(ctx, v.x + 10, v.y - 6, 0.05 + Math.abs(Math.sin(t * 3 + seed)) * 0.1, { core: '#ffe0c0', mid: '#ff6a3a', outer: '#a02010' }, t, false, seed);
        if (p.rv > 0) {
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(v.x, v.y - 10, 24, 0, TAU); ctx.stroke();
          ctx.strokeStyle = pal.mid; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(v.x, v.y - 10, 24, -Math.PI / 2, -Math.PI / 2 + TAU * p.rv); ctx.stroke();
        }
        text(ctx, p.id === game.myId ? 'Waiting to be rekindled…' : 'Stand close to rekindle', v.x, v.y - 44, { size: 11, color: '#ffb59a' });
      } else {
        if (p.w > 0) {
          const g = ctx.createRadialGradient(v.x, v.y - 14, 10, v.x, v.y - 14, FLAME_RULES.wildfireRadius);
          g.addColorStop(0, rgba(pal.light, 0.35)); g.addColorStop(1, rgba(pal.light, 0));
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = g; circle(ctx, v.x, v.y - 14, FLAME_RULES.wildfireRadius);
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = rgba(pal.light, 0.7); ctx.lineWidth = 2;
          ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 60;
          ctx.beginPath(); ctx.ellipse(v.x, v.y, FLAME_RULES.wildfireRadius, FLAME_RULES.wildfireRadius * 0.6, 0, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
        }
        const bob = Math.sin(t * 3 + seed) * 2;
        drawFlame(ctx, v.x + 16, v.y - 38 + bob, p.hp / p.mx, pal, t, p.w > 0, seed);
      }
      if (p.id !== game.myId) text(ctx, p.n, v.x, v.y - (p.h === 'witch' ? 78 : 62), { size: 12, color: shade(byId(CLOAKS, p.c).hex, 0.35) });
    }
    this.drawParticles(ctx, game.particles, true);
    // effects: sword arcs, quake rings, damage numbers
    for (const e of game.effects) {
      const p = (t - e.t0) / e.life;
      if (p < 0 || p > 1) continue;
      if (e.k === 'arc') {
        const v = game.viewFor(e.id);
        const span = e.heavy ? 1.6 : 1.25;
        const a0 = e.aim - span;
        const cur = a0 + span * 2 * easeOut(Math.min(1, p * 1.6));
        ctx.strokeStyle = e.heavy ? `rgba(255,190,110,${(1 - p) * 0.9})` : `rgba(255,240,215,${(1 - p) * 0.8})`;
        ctx.lineWidth = e.heavy ? 7 : 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(v.x, v.y - 16, e.heavy ? 54 : 46, Math.max(a0, cur - 1.4), cur); ctx.stroke();
      } else if (e.k === 'ring') {
        const r = e.r * easeOut(p);
        ctx.strokeStyle = e.color || `rgba(255,180,90,${1 - p})`;
        ctx.globalAlpha = 1 - p;
        ctx.lineWidth = 6 * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, r, r * 0.65, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.k === 'num') {
        text(ctx, e.text, e.x, e.y - p * 30, { size: e.big ? 18 : 14, weight: 800, color: e.color, alpha: 1 - p * p });
      }
    }
    // interaction prompt
    if (game.prompt) {
      const pr = game.prompt;
      ctx.font = `700 13px ${FONT}`;
      const w = Math.max(ctx.measureText(pr.text).width, pr.sub ? ctx.measureText(pr.sub).width * 0.85 : 0) + 24;
      const h = pr.sub ? 42 : 26;
      ctx.fillStyle = 'rgba(10,16,14,0.85)';
      rrect(ctx, pr.x - w / 2, pr.y - h, w, h, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(230,194,122,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      text(ctx, pr.text, pr.x, pr.y - h + 13, { size: 13, color: '#ffe6b0', shadow: false });
      if (pr.sub) text(ctx, pr.sub, pr.x, pr.y - 12, { size: 11, weight: 600, color: '#b9c9bd', shadow: false });
    }
  }

  // ---------------------------------------------------------- HUD
  drawHUD(ctx, game, snap, me, W, H, t) {
    const pal = byId(FLAMES, me.f);
    const ratio = me.hp / me.mx;
    const forest = snap.sc === 'forest';
    const pad = game.input.device === 'pad';

    if (forest && !me.dn && ratio < 0.35) {
      const a = ((0.35 - ratio) / 0.35) * (0.55 + Math.sin(t * 5) * 0.15);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(60,0,0,0)'); g.addColorStop(1, `rgba(70,0,10,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (game.hurtFlash > 0) { ctx.fillStyle = `rgba(255,40,30,${game.hurtFlash * 0.45})`; ctx.fillRect(0, 0, W, H); }

    // party list (top-left)
    let y = 16;
    for (const p of snap.ps) {
      const ppal = byId(FLAMES, p.f);
      ctx.fillStyle = 'rgba(8,14,12,0.7)';
      rrect(ctx, 16, y, 200, 38, 8); ctx.fill();
      ctx.fillStyle = byId(CLOAKS, p.c).hex; circle(ctx, 32, y + 19, 7);
      text(ctx, p.n + (p.id === game.myId ? ' (you)' : ''), 46, y + 12, { size: 12, align: 'left', color: '#e9efe6', shadow: false });
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; rrect(ctx, 46, y + 23, 158, 7, 3); ctx.fill();
      if (p.dn) text(ctx, 'FLAME OUT', 125, y + 27, { size: 10, color: '#ff7a6a', shadow: false });
      else { ctx.fillStyle = ppal.mid; rrect(ctx, 46, y + 23, 158 * (p.hp / p.mx), 7, 3); ctx.fill(); }
      y += 44;
    }

    // top centre: where you are
    if (forest) {
      const mm = String(Math.floor(snap.tm / 60)).padStart(2, '0'), ss = String(snap.tm % 60).padStart(2, '0');
      text(ctx, 'THE THORNWOOD', W / 2, 24, { size: 18, font: TITLE, color: '#d6ffc8' });
      text(ctx, `${mm}:${ss}  ·  Find the Heartwood Gate`, W / 2, 48, { size: 13, color: '#b9c9bd' });
    } else {
      const z = game.world.readyZone;
      const ready = snap.ps.filter((p) => p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h).length;
      text(ctx, 'THE CAMPFIRE', W / 2, 24, { size: 18, font: TITLE, color: '#ffd9a0' });
      text(ctx, `Everyone stand on the glowing path to begin  (${ready}/${snap.ps.length} ready)`, W / 2, 48, { size: 13, color: '#b9c9bd' });
    }

    // arrow towards the gate when it's off screen
    if (forest && game.world.exit) {
      const ex = game.world.exit;
      const sx = ex.x - game.cam.x, sy = ex.y - game.cam.y;
      if (sx < 0 || sy < 0 || sx > W || sy > H) {
        const cx = W / 2, cy = H / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const m = 46;
        const k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
        const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
        ctx.fillStyle = `rgba(190,255,170,${0.55 + Math.sin(t * 3) * 0.2})`;
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.fill();
        ctx.restore();
      }
    }

    // flame bar (bottom centre) = your health
    const bw = Math.min(360, W - 140), bx = W / 2 - bw / 2, by = H - 62;
    ctx.fillStyle = 'rgba(14,10,8,0.85)'; rrect(ctx, bx - 4, by - 4, bw + 8, 26, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(230,194,122,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    if (ratio > 0) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, pal.outer); g.addColorStop(0.6, pal.mid); g.addColorStop(1, pal.core);
      ctx.fillStyle = g; rrect(ctx, bx, by, bw * ratio, 18, 6); ctx.fill();
    }
    text(ctx, me.dn ? 'FLAME OUT' : `FLAME  ${me.hp} / ${me.mx}`, W / 2, by + 9, { size: 12, weight: 800 });
    drawFlame(ctx, bx - 22, by + 16, Math.max(0.15, ratio), pal, t, me.w > 0, 7);

    // heat bar: overhealing fills it; full = Wildfire
    const hy = by + 26;
    ctx.fillStyle = 'rgba(14,10,8,0.85)'; rrect(ctx, bx, hy, bw, 7, 3); ctx.fill();
    if (me.w > 0) {
      ctx.fillStyle = `rgba(255,240,170,${0.7 + Math.sin(t * 30) * 0.3})`;
      rrect(ctx, bx, hy, bw * (me.w / FLAME_RULES.wildfireTime), 7, 3); ctx.fill();
      text(ctx, 'WILDFIRE!', W / 2, by - 18, { size: 20, font: TITLE, weight: 800, color: '#fff0a0' });
    } else if (me.ht > 0) {
      ctx.fillStyle = '#ffe9a0'; rrect(ctx, bx, hy, bw * (me.ht / 100), 7, 3); ctx.fill();
    }
    text(ctx, 'heat', bx + bw + 6, hy + 4, { size: 10, align: 'left', color: '#c9b88a', shadow: false });

    // Dark Fury (Warrior passive)
    const fury = Math.round(WARRIOR.furyMax * (1 - ratio) * 100);
    if (forest && !me.dn && fury >= 5 && me.w <= 0) text(ctx, `Dark Fury +${fury}% damage`, bx, by - 14, { size: 12, align: 'left', color: '#ff8a5c' });

    // skill slots
    const slots = [
      { key: pad ? 'RT' : 'LMB', name: 'Strike', cd: Math.max(0, game.lp.atkCd) / WARRIOR.atkCd, icon: 'sword' },
      { key: pad ? 'A' : 'SPACE', name: 'Dash', cd: Math.max(0, game.lp.dashCd) / WARRIOR.dashCd, icon: 'dash' },
      { key: pad ? 'X' : 'E', name: 'Cinder Quake', cd: me.sk / WARRIOR.skillCd, icon: 'quake', note: forest ? `-${WARRIOR.skillCost} flame` : '' },
    ];
    const sz = 46, gap = 10;
    let sx = bx + bw + 40, sy = by - 24;
    if (sx + slots.length * (sz + gap) > W - 10) { sx = W / 2 - (slots.length * (sz + gap) - gap) / 2; sy = by - 96; }
    for (const s of slots) {
      ctx.fillStyle = 'rgba(10,16,14,0.85)'; rrect(ctx, sx, sy, sz, sz, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(230,194,122,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      this.drawIcon(ctx, s.icon, sx + sz / 2, sy + sz / 2);
      if (s.cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.moveTo(sx + sz / 2, sy + sz / 2);
        ctx.arc(sx + sz / 2, sy + sz / 2, sz * 0.72, -Math.PI / 2, -Math.PI / 2 + TAU * s.cd);
        ctx.closePath();
        ctx.save(); rrect(ctx, sx, sy, sz, sz, 8); ctx.clip();
        ctx.beginPath(); ctx.moveTo(sx + sz / 2, sy + sz / 2);
        ctx.arc(sx + sz / 2, sy + sz / 2, sz * 0.72, -Math.PI / 2, -Math.PI / 2 + TAU * s.cd);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      text(ctx, s.key, sx + sz / 2, sy + sz + 9, { size: 10, color: '#ffe6b0' });
      if (s.note) text(ctx, s.note, sx + sz / 2, sy - 8, { size: 9, color: '#ff9a7a' });
      sx += sz + gap;
    }

    // big centre messages
    let big = null, sub = null;
    if (snap.cd > 0) { big = `Into the Wilds in ${snap.cd}`; sub = 'Stay on the path…'; }
    else if (snap.st === 'victory') { big = 'THE GATE OPENS'; sub = `Stage cleared! Back to camp in ${snap.stt}…`; }
    else if (snap.st === 'defeat') { big = 'ALL FLAMES WENT OUT'; sub = `The forest grows dark. Back to camp in ${snap.stt}…`; }
    else if (me.dn) { big = 'Your flame went out'; sub = 'An ally can rekindle you by standing close.'; }
    else if (game.bannerT > 0) { big = game.bannerText; }
    if (big) {
      text(ctx, big, W / 2, H * 0.32, { size: 36, font: TITLE, weight: 800, color: snap.st === 'defeat' || me.dn ? '#ff9a7a' : '#ffe6b0' });
      if (sub) text(ctx, sub, W / 2, H * 0.32 + 36, { size: 15, color: '#d8e2da' });
    }
  }

  drawIcon(ctx, icon, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#ffe6b0';
    ctx.fillStyle = '#ffe6b0';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    if (icon === 'sword') {
      ctx.rotate(-0.8);
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-6, 6); ctx.stroke();
    } else if (icon === 'dash') {
      for (const o of [-6, 4]) { ctx.beginPath(); ctx.moveTo(o - 4, -8); ctx.lineTo(o + 4, 0); ctx.lineTo(o - 4, 8); ctx.stroke(); }
    } else if (icon === 'quake') {
      ctx.beginPath(); ctx.ellipse(0, 4, 13, 6, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(-4, -2); ctx.lineTo(2, -2); ctx.lineTo(-2, 6); ctx.stroke();
    }
    ctx.restore();
  }
}
