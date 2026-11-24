// =============================================================
//  Rendering: the world in crisp pixel art, zoomed up.
//  Draw order: ground -> objects sorted by depth -> tree canopy
//  -> darkness/light -> glowing things -> names & numbers.
//  (The HUD is HTML, see hud.js.)
// =============================================================
import { TILE, CLOAKS, FLAMES, CLASSES, WARRIOR, WOLF, TREANT, byId } from './data.js';
import { hash2 } from './rng.js';
import {
  grassTile, dirtTile, paintDecor, treeSprite, boulderSprite, charSprite, downSprite, swordSprite,
  wolfSprite, wolfEye, treantSprite, TREANT_EYES, propSprite, TORCH, CHAR_W,
} from './sprites.js';

const TAU = Math.PI * 2;
const FONT = 'Nunito, system-ui, sans-serif';
const TITLE = 'Cinzel, Georgia, serif';

export function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function hexA(hex, a) { return rgba(hexRgb(hex), a); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
function idSeed(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return (h >>> 0) % 1000; }

function text(ctx, s, x, y, { size = 13, font = FONT, weight = 800, color = '#fff', align = 'center', alpha = 1 } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.globalAlpha = 1;
}

export function facing(aim) {
  const c = Math.cos(aim), s = Math.sin(aim);
  if (Math.abs(c) > 0.62) return c >= 0 ? 'right' : 'left';
  return s < 0 ? 'up' : 'down';
}

// A teardrop flame. ratio 0..1 sets its size. This is your health.
export function drawFlame(ctx, x, y, ratio, pal, t, wild = false, seed = 0, scale = 1) {
  const base = (wild ? 9 : 2.2 + 4.8 * ratio) * scale;
  const fl = 1 + Math.sin(t * 17 + seed) * 0.08 + Math.sin(t * 29 + seed * 2) * 0.05;
  const h = base * 2.1 * fl, w = base;
  const gr = ctx.createRadialGradient(x, y - h * 0.3, 0, x, y - h * 0.3, base * 3);
  gr.addColorStop(0, hexA(pal.mid, 0.5));
  gr.addColorStop(1, hexA(pal.mid, 0));
  ctx.fillStyle = gr;
  circle(ctx, x, y - h * 0.3, base * 3);
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

// ---------------------------------------------------------- characters
// o: { look:{cloak,hat}, aim, moving, swing, heavy, down, hurt, dash, guard }
export function drawCharacter(ctx, x, y, o, t) {
  x = Math.round(x); y = Math.round(y);
  if (o.down) { ctx.drawImage(downSprite(o.look), x - 16, y - 12); return; }
  ctx.save();
  if (o.hurt && Math.floor(t * 30) % 2) ctx.globalAlpha = 0.5;
  if (o.dash) ctx.globalAlpha = 0.75;
  const dir = facing(o.aim);
  const frame = o.moving ? 1 + (Math.floor(t * 8) % 2) : 0;
  const { img, flip } = charSprite(o.look, dir, frame);
  const bob = o.moving && frame === 1 ? -1 : 0;
  const hand = { down: [7, -10], up: [-6, -11], right: [5, -10], left: [-5, -10] }[dir];
  const sword = () => {
    const sw = swordSprite(o.heavy && o.swing >= 0);
    let ang;
    if (o.guard) ang = o.aim - Math.PI / 2 * (Math.cos(o.aim) >= 0 ? 1 : -1);
    else if (o.swing >= 0) { const span = o.heavy ? 1.6 : 1.25; ang = o.aim - span + easeOut(o.swing) * span * 2; }
    else ang = o.aim + 0.8 * (Math.cos(o.aim) >= 0 ? 1 : -1);
    const gx = o.guard ? Math.cos(o.aim) * 7 : 0, gy = o.guard ? Math.sin(o.aim) * 5 : 0;
    ctx.save();
    ctx.translate(x + hand[0] + gx, y + hand[1] + bob + gy);
    ctx.rotate(ang);
    ctx.drawImage(sw, -3, -3.5);
    ctx.restore();
  };
  if (dir === 'up') sword();
  if (flip) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -CHAR_W / 2, y - 35 + bob);
    ctx.restore();
  } else ctx.drawImage(img, x - CHAR_W / 2, y - 35 + bob);
  if (dir !== 'up') sword();
  ctx.restore();
}

export function torchPoint(x, y, aim, moving, t) {
  const dir = facing(aim);
  const a = TORCH[dir];
  const bob = moving && Math.floor(t * 8) % 2 === 0 ? -1 : 0;
  return [x + a[0], y + a[1] + bob];
}

// Character portrait for menus and the wardrobe.
export function drawPreview(canvas, ch, t = 1) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = Math.max(1, Math.floor(canvas.height / 44));
  const pal = byId(FLAMES, ch.flame);
  const glow = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.45, 0, canvas.width / 2, canvas.height * 0.45, canvas.height * 0.55);
  glow.addColorStop(0, rgba(pal.light, 0.22));
  glow.addColorStop(1, rgba(pal.light, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  const fx = canvas.width / 2 / s, fy = (canvas.height - 3 * s) / s;
  ctx.scale(s, s);
  drawCharacter(ctx, fx, fy, { look: { cloak: byId(CLOAKS, ch.cloak).hex, hat: ch.hat }, aim: 1.2, moving: false, swing: -1 }, t);
  const [tx, ty] = torchPoint(Math.round(fx), Math.round(fy), 1.2, false, t);
  drawFlame(ctx, tx, ty, 1, pal, t, false, 3);
  ctx.restore();
}

// ---------------------------------------------------------- world image (drawn once per scene)
function buildWorldGfx(world) {
  const W = world.pw, H = world.ph, T = TILE;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
  const lobby = world.kind === 'lobby';
  const [ground, g] = mk();
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      if (world.isPath(tx, ty)) {
        const mask = (world.isPath(tx, ty - 1) ? 1 : 0) | (world.isPath(tx + 1, ty) ? 2 : 0) | (world.isPath(tx, ty + 1) ? 4 : 0) | (world.isPath(tx - 1, ty) ? 8 : 0);
        g.drawImage(dirtTile(mask, Math.floor(hash2(tx, ty) * 3)), tx * T, ty * T);
      } else g.drawImage(grassTile(Math.floor(hash2(tx + 7, ty * 3) * 6), lobby), tx * T, ty * T);
    }
  }
  for (const d of world.decor) paintDecor(g, d);
  for (const m of world.glows) { g.fillStyle = '#d8d2c0'; g.fillRect(m.x, m.y - 3, 1, 4); }
  const kindOf = (tx, ty) => (hash2(tx * 5 + 1, ty * 3 + 2) < 0.28 ? 'pine' : 'oak');
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      if (!world.isSolid(tx, ty)) continue;
      if (world.rocks[world.idx(tx, ty)]) { g.drawImage(boulderSprite(Math.floor(hash2(tx, ty) * 2)), tx * T - 2, ty * T - 2); continue; }
      if (world.isSolid(tx, ty + 1)) continue;
      const s = treeSprite(kindOf(tx, ty), Math.floor(hash2(ty, tx) * 3));
      g.drawImage(s.trunk, tx * T + 16 - s.ox, ty * T + 30 - s.oy);
    }
  }
  // canopy: drawn on top of characters, so the trees hide what's behind them
  const [canopy, c] = mk();
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      if (!world.isSolid(tx, ty) || world.rocks[world.idx(tx, ty)]) continue;
      const s = treeSprite(kindOf(tx, ty), Math.floor(hash2(ty, tx) * 3));
      const jx = Math.round((hash2(tx, ty + 9) - 0.5) * 8), jy = Math.round((hash2(tx + 9, ty) - 0.5) * 6);
      c.drawImage(s.canopy, tx * T + 16 - s.ox + jx, ty * T + 30 - s.oy + jy);
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
    this.zoom = 2;
  }

  setWorld(world) { this.gfx = buildWorldGfx(world); }

  resize() {
    const w = innerWidth, h = innerHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    if (this.light.width !== w || this.light.height !== h) { this.light.width = w; this.light.height = h; }
    this.zoom = Math.max(1, Math.round(h / 480));
  }

  viewSize() { this.resize(); return { w: this.canvas.width / this.zoom, h: this.canvas.height / this.zoom }; }

  blit(img, ox, oy, vw, vh) {
    const sx = Math.max(0, Math.floor(ox)), sy = Math.max(0, Math.floor(oy));
    const sw = Math.min(img.width - sx, Math.ceil(vw) + 2), sh = Math.min(img.height - sy, Math.ceil(vh) + 2);
    if (sw > 0 && sh > 0) this.ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
  }

  drawLoading(msg, t) {
    this.resize();
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070b0a';
    ctx.fillRect(0, 0, W, H);
    drawFlame(ctx, W / 2, H / 2 - 10, 0.8, FLAMES[0], t, false, 0, 2.5);
    text(ctx, msg, W / 2, H / 2 + 40, { size: 18, color: '#e9efe6' });
  }

  draw(game, snap, me) {
    this.resize();
    const ctx = this.ctx, Z = this.zoom, W = this.canvas.width, H = this.canvas.height;
    const t = game.t, world = game.world;
    const vw = W / Z, vh = H / Z;
    const ox = Math.round((game.cam.x + game.shakeX) * Z) / Z, oy = Math.round((game.cam.y + game.shakeY) * Z) / Z;
    this.ox = ox; this.oy = oy;
    const toS = (x, y) => [(x - ox) * Z, (y - oy) * Z];
    const vis = (x, y, m = 80) => x > ox - m && x < ox + vw + m && y > oy - m && y < oy + vh + m;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0a1008';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(Z, 0, 0, Z, -ox * Z, -oy * Z);
    ctx.imageSmoothingEnabled = false;
    this.blit(this.gfx.ground, ox, oy, vw, vh);

    // ground markings
    if (world.readyZone) this.drawReadyZone(ctx, world.readyZone, t);
    if (world.exit) this.drawGateGround(ctx, world.exit, snap.go, t);
    for (const h of snap.hz) if (vis(h.x, h.y, 200)) this.drawHazard(ctx, h, t);
    for (const f of snap.fi) if (vis(f[0], f[1])) { ctx.fillStyle = 'rgba(40,15,5,0.45)'; ctx.fillRect(f[0] - 9, f[1] - 3, 18, 6); }

    // everything that stands up, sorted by depth
    const list = [];
    for (const p of world.props) if (vis(p.x, p.y)) list.push({ y: p.y, d: () => this.drawProp(ctx, p) });
    world.shrines.forEach((s, i) => { if (vis(s.x, s.y)) list.push({ y: s.y, d: () => ctx.drawImage(propSprite('heartwood', snap.sh[i] ? 1 : 0), s.x - 14, s.y - 31) }); });
    if (world.exit) for (const sx of [-48, 48]) list.push({ y: world.exit.y, d: () => ctx.drawImage(propSprite('pillar'), world.exit.x + sx - 9, world.exit.y - 52) });
    for (const e of snap.es) {
      const v = game.views.get('e' + e.id);
      if (v && vis(v.x, v.y, 150)) list.push({ y: v.y, d: () => this.drawEnemy(ctx, e, v, t) });
    }
    for (const p of snap.ps) {
      const v = game.playerView(p);
      if (vis(v.x, v.y)) list.push({ y: v.y, d: () => drawCharacter(ctx, v.x, v.y, game.charOpts(p, v), t) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.d();
    this.drawParticles(ctx, game.particles, false);
    this.blit(this.gfx.canopy, ox, oy, vw, vh);

    // darkness + light
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawLighting(game, snap, toS, W, H, t);

    // glowing things
    ctx.setTransform(Z, 0, 0, Z, -ox * Z, -oy * Z);
    this.drawPostLight(ctx, game, snap, me, t, vis);

    // names, numbers, prompts (screen space for crisp text)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawScreenText(ctx, game, snap, me, toS, vis, t);
    this.drawScreenFx(ctx, game, snap, me, W, H, t);
  }

  // ---------------------------------------------------------- objects
  drawProp(ctx, p) {
    if (p.type === 'campfire') ctx.drawImage(propSprite('campfire'), p.x - 20, p.y - 16);
    else if (p.type === 'wardrobe') ctx.drawImage(propSprite('wardrobe'), p.x - 15, p.y - 44);
    else if (p.type === 'shrine') ctx.drawImage(propSprite('shrine', byId(CLASSES, p.cls).available ? 1 : 0), p.x - 10, p.y - 32);
  }

  drawEnemy(ctx, e, v, t) {
    const x = Math.round(v.x), y = Math.round(v.y);
    if (e.t === 'treant') {
      const img = treantSprite(e.s === 5 ? 1 : 0);
      const sway = Math.round(Math.sin(t * 1.5) * 1.5);
      ctx.drawImage(img, x - 56 + sway, y - 116);
      if (e.hu) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; ctx.fillRect(x - 30, y - 70, 60, 60); ctx.globalAlpha = 1; }
      return;
    }
    const variant = e.t === 'alpha' ? 'alpha' : e.el ? 'elite' : 'wolf';
    const frame = e.s === 2 ? 3 : e.s === 3 ? 4 : v.moving ? 1 + (Math.floor(t * 10) % 2) : 0;
    const img = wolfSprite(frame, variant);
    const S = variant === 'alpha' ? 1.5 : 1;
    const top = y - img.height + Math.round(3 * S);
    const shake = e.s === 2 ? Math.round(Math.sin(t * 70)) : 0;
    ctx.save();
    if (e.fx < 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(img, -img.width / 2 + shake, top); }
    else ctx.drawImage(img, x - img.width / 2 + shake, top);
    ctx.restore();
    if (e.hu || e.b) {
      ctx.globalAlpha = e.hu ? 0.5 : 0.3;
      ctx.fillStyle = e.hu ? '#fff' : '#ff8a30';
      ctx.fillRect(x - 12 * S, y - 18 * S, 24 * S, 12 * S);
      ctx.globalAlpha = 1;
    }
  }

  eyePos(e, v) {
    if (e.t === 'treant') return TREANT_EYES.map(([ex, ey]) => [v.x - 56 + ex, v.y - 116 + ey]);
    const variant = e.t === 'alpha' ? 'alpha' : e.el ? 'elite' : 'wolf';
    const frame = e.s === 2 ? 3 : e.s === 3 ? 4 : 0;
    const img = wolfSprite(frame, variant);
    const S = variant === 'alpha' ? 1.5 : 1;
    const [ex, ey] = wolfEye(frame, variant);
    const top = v.y - img.height + 3 * S;
    const x = e.fx < 0 ? v.x + img.width / 2 - ex : v.x - img.width / 2 + ex;
    return [[x, top + ey]];
  }

  drawHazard(ctx, h, t) {
    if (h.k === 'root') {
      if (h.done) { ctx.drawImage(propSprite('roots'), h.x - 20, h.y - 28); return; }
      ctx.fillStyle = `rgba(200,40,30,${0.12 + h.p * 0.3})`;
      ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,90,60,${0.5 + h.p * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * h.p, h.r * 0.7 * h.p, 0, 0, TAU); ctx.stroke();
    } else if (h.k === 'cone') {
      ctx.fillStyle = `rgba(220,40,30,${0.1 + h.p * 0.3})`;
      ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.arc(h.x, h.y, h.r, h.a - h.arc / 2, h.a + h.arc / 2); ctx.closePath(); ctx.fill();
    }
  }

  drawReadyZone(ctx, z, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(120,200,255,0.10)';
    ctx.fillRect(z.x + 6, z.y + 6, z.w - 12, z.h - 12);
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -t * 10;
    ctx.strokeStyle = 'rgba(150,220,255,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(z.x + 6.5, z.y + 6.5, z.w - 13, z.h - 13);
    ctx.restore();
  }

  drawGateGround(ctx, ex, open, t) {
    ctx.save();
    ctx.strokeStyle = open ? 'rgba(170,255,170,0.45)' : 'rgba(200,80,60,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(ex.x, ex.y, ex.r, ex.r * 0.55, 0, 0, TAU); ctx.stroke();
    if (!open) {
      ctx.fillStyle = '#3b2a1a';
      for (let i = 0; i < 12; i++) {
        const x = ex.x - 40 + i * 7;
        const yy = ex.y - 30 + Math.round(Math.sin(i * 1.7) * 4);
        ctx.fillRect(x, yy, 7, 2);
        ctx.fillStyle = i % 2 ? '#5a3a22' : '#3b2a1a';
        ctx.fillRect(x + 3, yy - 2, 1, 2);
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------- lighting
  collectLights(game, snap, t) {
    const L = [], world = game.world;
    for (const p of snap.ps) {
      const v = game.playerView(p);
      if (p.dn) { L.push({ x: v.x, y: v.y - 6, r: 55, col: [255, 90, 50], i: 0.7 }); continue; }
      const pal = byId(FLAMES, p.f);
      const ratio = p.hp / p.mx;
      const fl = 1 + Math.sin(t * 9 + v.x * 0.01) * 0.02 + Math.sin(t * 23) * 0.015;
      const r = (p.gl ? 420 : 75 + 260 * Math.pow(ratio, 0.85)) * fl;
      L.push({ x: v.x, y: v.y - 24, r, col: pal.light, i: 1 });
    }
    if (world.campfire) L.push({ x: world.campfire.x, y: world.campfire.y - 8, r: 250 + Math.sin(t * 7) * 10 + Math.sin(t * 13) * 6, col: [255, 150, 70], i: 1 });
    for (const g of world.glows) L.push({ x: g.x, y: g.y, r: 52, col: g.c, i: 0.55 });
    for (const k of snap.pk) L.push({ x: k.x, y: k.y, r: k.k === 'f' ? 80 : 48, col: k.k === 'f' ? [255, 230, 140] : [255, 160, 70], i: 0.85 });
    for (const f of snap.fi) L.push({ x: f[0], y: f[1] - 6, r: 60, col: [255, 140, 50], i: 0.8 });
    for (const e of snap.es) {
      const v = game.views.get('e' + e.id);
      if (!v) continue;
      if (e.el) L.push({ x: v.x, y: v.y - 10, r: 50, col: [255, 140, 60], i: 0.5 });
      if (e.b) L.push({ x: v.x, y: v.y - 10, r: 46, col: [255, 140, 60], i: 0.5 });
    }
    if (world.exit) L.push({ x: world.exit.x, y: world.exit.y - 20, r: snap.go ? 220 : 120, col: snap.go ? [160, 255, 170] : [255, 100, 80], i: 0.85 });
    world.shrines.forEach((s, i) => { if (!snap.sh[i]) L.push({ x: s.x, y: s.y - 16, r: 110, col: [255, 170, 90], i: 0.85 }); });
    if (world.readyZone) { const z = world.readyZone; L.push({ x: z.x + z.w / 2, y: z.y + z.h / 2, r: 120, col: [120, 200, 255], i: 0.8 }); }
    for (const p of world.props) {
      if (p.type !== 'shrine') continue;
      const c = byId(CLASSES, p.cls);
      L.push({ x: p.x, y: p.y - 30, r: c.available ? 90 : 36, col: hexRgb(c.color), i: c.available ? 0.9 : 0.5 });
    }
    for (const e of game.effects) {
      if (e.k !== 'ring' && e.k !== 'pyre') continue;
      const a = 1 - (t - e.t0) / e.life;
      if (a > 0) L.push({ x: e.x, y: e.y, r: (e.r || 120) * 1.6, col: [255, 170, 80], i: a });
    }
    return L;
  }

  drawLighting(game, snap, toS, W, H, t) {
    const l = this.lctx, ctx = this.ctx, Z = this.zoom;
    const dark = game.world.kind === 'lobby' ? 0.72 : game.world.kind === 'arena' ? 0.9 : 0.95;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, W, H);
    l.fillStyle = `rgba(3,5,14,${dark})`;
    l.fillRect(0, 0, W, H);
    l.globalCompositeOperation = 'destination-out';
    const lights = [];
    for (const L of this.collectLights(game, snap, t)) {
      const [x, y] = toS(L.x, L.y), r = L.r * Z;
      if (x > -r && y > -r && x < W + r && y < H + r) lights.push({ x, y, r, col: L.col, i: L.i });
    }
    for (const L of lights) {
      const g = l.createRadialGradient(L.x, L.y, L.r * 0.05, L.x, L.y, L.r);
      g.addColorStop(0, `rgba(0,0,0,${L.i})`);
      g.addColorStop(0.45, `rgba(0,0,0,${L.i * 0.8})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g;
      l.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    ctx.drawImage(this.light, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 0.8);
      g.addColorStop(0, rgba(L.col, 0.16 * L.i));
      g.addColorStop(1, rgba(L.col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawParticles(ctx, parts, glow) {
    if (glow) ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      if (!!p.glow !== glow) continue;
      let a = p.life / p.max;
      if (p.ff) a = Math.sin(a * Math.PI) * (0.5 + 0.5 * Math.sin(p.life * 6 + p.x));
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size * (p.shrink ? a : 1) + 0.3));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------- after the darkness
  drawPostLight(ctx, game, snap, me, t, vis) {
    const world = game.world;
    for (const g of world.glows) {
      if (!vis(g.x, g.y)) continue;
      const a = 0.6 + Math.sin(t * 2 + g.ph) * 0.25;
      ctx.fillStyle = rgba(g.c, a);
      ctx.fillRect(g.x - 2, g.y - 5, 5, 2);
      ctx.fillRect(g.x - 1, g.y - 6, 3, 1);
    }
    if (world.campfire && vis(world.campfire.x, world.campfire.y)) {
      const { x, y } = world.campfire;
      drawFlame(ctx, x - 5, y - 4, 0.9, FLAMES[0], t, false, 1);
      drawFlame(ctx, x + 5, y - 3, 0.8, FLAMES[0], t * 1.1, false, 2);
      drawFlame(ctx, x, y - 2, 1.5, FLAMES[0], t * 0.9, false, 3);
    }
    for (const p of world.props) {
      if (p.type !== 'shrine' || !vis(p.x, p.y)) continue;
      const c = byId(CLASSES, p.cls);
      const bob = Math.round(Math.sin(t * 2 + p.x) * 1.5);
      ctx.fillStyle = c.available ? c.color : 'rgba(90,95,110,0.8)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 46 + bob); ctx.lineTo(p.x + 5, p.y - 39 + bob); ctx.lineTo(p.x, p.y - 33 + bob); ctx.lineTo(p.x - 5, p.y - 39 + bob);
      ctx.fill();
    }
    // the gate
    if (world.exit && snap.go && vis(world.exit.x, world.exit.y, 120)) {
      const ex = world.exit;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const a = t * 1.3 + (i / 16) * TAU;
        const rr = ex.r * (0.6 + 0.15 * Math.sin(t * 3 + i));
        ctx.fillStyle = `rgba(190,255,170,${0.5 + 0.3 * Math.sin(t * 4 + i)})`;
        ctx.fillRect(Math.round(ex.x + Math.cos(a) * rr), Math.round(ex.y + Math.sin(a) * rr * 0.55 - 8), 2, 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // Heartwood shrines
    world.shrines.forEach((s, i) => {
      if (snap.sh[i] || !vis(s.x, s.y)) return;
      const a = 0.6 + Math.sin(t * 3) * 0.3;
      ctx.fillStyle = `rgba(255,170,90,${a})`;
      ctx.fillRect(s.x - 4, s.y - 13, 9, 5);
    });
    // pickups
    ctx.globalCompositeOperation = 'lighter';
    for (const k of snap.pk) {
      if (!vis(k.x, k.y)) continue;
      const y = k.y - 5 + Math.round(Math.sin(t * 5 + k.id) * 2);
      const big = k.k === 'f';
      const g = ctx.createRadialGradient(k.x, y, 0, k.x, y, big ? 14 : 9);
      g.addColorStop(0, big ? 'rgba(255,250,200,0.95)' : 'rgba(255,220,140,0.9)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; circle(ctx, k.x, y, big ? 14 : 9);
      ctx.fillStyle = big ? '#fffbe0' : '#ffb347';
      ctx.fillRect(k.x - (big ? 2 : 1), y - (big ? 2 : 1), big ? 4 : 2, big ? 4 : 2);
    }
    for (const f of snap.fi) if (vis(f[0], f[1])) drawFlame(ctx, f[0], f[1], Math.min(1, f[2] / 2), FLAMES[0], t * 1.3, false, f[0] + f[1], 1.1);
    ctx.globalCompositeOperation = 'source-over';
    // enemies: lunge warnings, glowing eyes
    for (const e of snap.es) {
      const v = game.views.get('e' + e.id);
      if (!v || !vis(v.x, v.y, 150)) continue;
      if (e.s === 2 && e.t !== 'treant') {
        const range = e.t === 'alpha' ? 150 : WOLF.lungeRange;
        ctx.save();
        ctx.translate(v.x, v.y - 6);
        ctx.rotate(Math.atan2(e.dy, e.dx));
        const g = ctx.createLinearGradient(0, 0, range + 24, 0);
        g.addColorStop(0, 'rgba(255,70,50,0.4)'); g.addColorStop(1, 'rgba(255,70,50,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, -8, range + 24, 16);
        ctx.restore();
      }
      const col = e.s === 2 || e.s === 5 ? '255,220,90' : e.el ? '255,170,60' : '255,60,45';
      for (const [ex, ey] of this.eyePos(e, v)) {
        const r = e.t === 'treant' ? 9 : 5;
        const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
        g.addColorStop(0, `rgba(${col},0.7)`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; circle(ctx, ex, ey, r);
        ctx.fillStyle = `rgb(${col})`;
        ctx.fillRect(Math.round(ex) - (e.t === 'treant' ? 2 : 0), Math.round(ey) - (e.t === 'treant' ? 1 : 0), e.t === 'treant' ? 4 : 1, e.t === 'treant' ? 3 : 1);
      }
      if (e.el) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,140,50,${0.4 + Math.sin(t * 6 + e.id) * 0.2})`;
        for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(v.x - 10 + hash2(i, Math.floor(t * 6) + e.id) * 20), Math.round(v.y - 22 + hash2(Math.floor(t * 6), i) * 14), 1, 1);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // players: torch flames, guard shield, rekindle rings
    for (const p of snap.ps) {
      const v = game.playerView(p);
      if (!vis(v.x, v.y)) continue;
      const pal = byId(FLAMES, p.f);
      const seed = idSeed(p.id);
      const o = game.charOpts(p, v);
      if (p.dn) {
        drawFlame(ctx, v.x - 12, v.y - 6, 0.05 + Math.abs(Math.sin(t * 3 + seed)) * 0.1, { core: '#ffe0c0', mid: '#ff6a3a', outer: '#a02010' }, t, false, seed);
        if (p.rv > 0) {
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(v.x, v.y - 8, 18, 0, TAU); ctx.stroke();
          ctx.strokeStyle = pal.mid; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(v.x, v.y - 8, 18, -Math.PI / 2, -Math.PI / 2 + TAU * p.rv); ctx.stroke();
        }
        continue;
      }
      if (p.gl) {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(v.x, v.y - 12, 6, v.x, v.y - 12, 70);
        g.addColorStop(0, rgba(pal.light, 0.35)); g.addColorStop(1, rgba(pal.light, 0));
        ctx.fillStyle = g; circle(ctx, v.x, v.y - 12, 70);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (o.guard) {
        const a = o.aim;
        ctx.strokeStyle = `rgba(255,190,110,${0.6 + Math.sin(t * 20) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(v.x, v.y - 14, 20, a - 1.05, a + 1.05); ctx.stroke();
      }
      const [tx, ty] = torchPoint(v.x, v.y, o.aim, o.moving, t);
      drawFlame(ctx, tx, ty, p.hp / p.mx, pal, t, !!p.gl, seed);
    }
    this.drawParticles(ctx, game.particles, true);
    // effects
    for (const e of game.effects) {
      const p = (t - e.t0) / e.life;
      if (p < 0 || p > 1) continue;
      if (e.k === 'arc' || e.k === 'counter') {
        const v = game.viewFor(e.id);
        const span = e.k === 'counter' ? 1.4 : e.heavy ? 1.6 : 1.25;
        const a0 = e.aim - span;
        const cur = a0 + span * 2 * easeOut(Math.min(1, p * 1.6));
        ctx.strokeStyle = e.k === 'counter' ? `rgba(255,160,70,${(1 - p) * 0.95})` : e.heavy ? `rgba(255,190,110,${(1 - p) * 0.9})` : `rgba(255,240,215,${(1 - p) * 0.8})`;
        ctx.lineWidth = e.k === 'counter' ? 5 : e.heavy ? 4 : 3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(v.x, v.y - 12, e.k === 'counter' ? 54 : e.heavy ? 44 : 38, Math.max(a0, cur - 1.4), cur); ctx.stroke();
      } else if (e.k === 'pyre') {
        const v = game.viewFor(e.id);
        const r = WARRIOR.pyreRange * easeOut(Math.min(1, p * 2));
        const g = ctx.createRadialGradient(v.x, v.y - 10, r * 0.3, v.x, v.y - 10, r);
        g.addColorStop(0, `rgba(255,230,150,${(1 - p) * 0.8})`); g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(v.x, v.y - 10); ctx.arc(v.x, v.y - 10, r, e.aim - WARRIOR.pyreArc / 2, e.aim + WARRIOR.pyreArc / 2); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (e.k === 'ring') {
        const r = e.r * easeOut(p);
        ctx.strokeStyle = e.color || 'rgba(255,180,90,1)';
        ctx.globalAlpha = 1 - p;
        ctx.lineWidth = 3 * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, r, r * 0.65, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------------------------------------------------------- screen-space text
  drawScreenText(ctx, game, snap, me, toS, vis, t) {
    const world = game.world;
    const Z = this.zoom;
    for (const p of world.props) {
      if (p.type !== 'shrine' || !vis(p.x, p.y)) continue;
      const c = byId(CLASSES, p.cls);
      if (Math.hypot(p.x - game.lp.x, p.y - game.lp.y) < 140) { const [x, y] = toS(p.x, p.y - 54); text(ctx, c.name, x, y, { size: 13, font: TITLE, color: c.available ? '#fff' : '#9aa3ad' }); }
    }
    if (world.readyZone) { const z = world.readyZone; const [x, y] = toS(z.x + z.w / 2, z.y + z.h + 10); text(ctx, 'INTO THE WILDS', x, y, { size: 13, font: TITLE, color: '#bfe8ff' }); }
    if (world.exit && vis(world.exit.x, world.exit.y, 100)) { const [x, y] = toS(world.exit.x, world.exit.y - 64); text(ctx, snap.go ? 'Heartwood Gate (open)' : 'Heartwood Gate (sealed)', x, y, { size: 13, font: TITLE, color: snap.go ? '#d6ffc8' : '#ffb0a0' }); }
    world.shrines.forEach((s, i) => {
      if (snap.sh[i] || Math.hypot(s.x - game.lp.x, s.y - game.lp.y) > 60) return;
      const [x, y] = toS(s.x, s.y - 40);
      text(ctx, `[${game.input.device === 'pad' ? 'Y' : 'F'}] Light the Heartwood (+Wildfire)`, x, y, { size: 12, color: '#ffd59a' });
    });
    for (const e of snap.es) {
      const v = game.views.get('e' + e.id);
      if (!v || e.t === 'treant' || e.hp >= e.mx || !vis(v.x, v.y)) continue;
      const S = e.t === 'alpha' ? 1.5 : 1;
      const [x, y] = toS(v.x, v.y - 30 * S);
      const w = 30 * S * Z / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
      ctx.fillStyle = e.el ? '#ff9a3c' : '#d9473a'; ctx.fillRect(x - w / 2, y, w * Math.max(0, e.hp / e.mx), 3);
    }
    for (const p of snap.ps) {
      const v = game.playerView(p);
      if (!vis(v.x, v.y)) continue;
      if (p.id !== game.myId) {
        const [x, y] = toS(v.x, v.y - (p.h === 'witch' || p.h === 'antlers' ? 50 : 44));
        text(ctx, p.u, x, y, { size: 12, color: '#f4f1ea' });
      }
      if (p.dn) { const [x, y] = toS(v.x, v.y - 30); text(ctx, p.id === game.myId ? 'Waiting to be rekindled…' : 'Stand close to rekindle', x, y, { size: 11, color: '#ffb59a' }); }
    }
    for (const e of game.effects) {
      if (e.k !== 'num') continue;
      const p = (t - e.t0) / e.life;
      if (p < 0 || p > 1) continue;
      const [x, y] = toS(e.x, e.y - p * 18);
      text(ctx, e.text, x, y, { size: e.big ? 18 : 14, color: e.color, alpha: 1 - p * p });
    }
    if (game.prompt) {
      const pr = game.prompt;
      const [x, y] = toS(pr.x, pr.y);
      text(ctx, pr.text, x, y - 14, { size: 13, color: '#ffe6b0' });
      if (pr.sub) text(ctx, pr.sub, x, y + 4, { size: 11, weight: 700, color: '#c9d6cd' });
    }
  }

  drawScreenFx(ctx, game, snap, me, W, H, t) {
    const ratio = me.hp / me.mx;
    if (snap.sc !== 'lobby' && !me.dn && ratio < 0.35) {
      const a = ((0.35 - ratio) / 0.35) * (0.55 + Math.sin(t * 5) * 0.15);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(60,0,0,0)'); g.addColorStop(1, `rgba(70,0,10,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (game.hurtFlash > 0) { ctx.fillStyle = `rgba(255,40,30,${game.hurtFlash * 0.4})`; ctx.fillRect(0, 0, W, H); }
    // arrow towards the gate once it's open
    const ex = game.world.exit;
    if (ex && snap.go) {
      const Z = this.zoom;
      const sx = (ex.x - this.ox) * Z, sy = (ex.y - this.oy) * Z;
      if (sx < 0 || sy < 0 || sx > W || sy > H) {
        const a = Math.atan2(sy - H / 2, sx - W / 2), m = 60;
        const k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
        ctx.save(); ctx.translate(W / 2 + Math.cos(a) * k, H / 2 + Math.sin(a) * k); ctx.rotate(a);
        ctx.fillStyle = `rgba(190,255,170,${0.6 + Math.sin(t * 3) * 0.2})`;
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.fill();
        ctx.restore();
      }
    }
  }
}
