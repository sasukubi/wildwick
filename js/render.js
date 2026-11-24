// =============================================================
//  Rendering: the world in crisp pixel art, zoomed up.
//  Draw order: ground -> objects sorted by depth -> tree canopy
//  -> darkness/light -> glowing things -> names & numbers.
//  (The HUD is HTML, see hud.js.)
// =============================================================
import { TILE, CLOAKS, FLAMES, CLASSES, WARRIOR, SORCERER, WOLF, byId } from './data.js';
import { hash2 } from './rng.js';
import { prefs } from './prefs.js';
import {
  grassTile, dirtTile, paintDecor, treeSprite, boulderSprite, charSprite, downSprite, swordSprite, staffSprite, whiteOf,
  wolfSprite, wolfEye, treantSprite, TREANT_EYES, propSprite, TORCH, CHAR_W,
  bowSprite, daggerSprite, archwaySprite, ARCH_LANTERNS, lanternSprite, emojiSprite, pingSprite, PINGS,
} from './sprites.js';

// a stable pseudo-random number for jagged shapes
function jag(i, seed) { const h = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return h - Math.floor(h); }

// a ragged, organic outline around (x, y) for attack warnings
function jaggedBlob(ctx, x, y, r, ry, seed, grow = 1, spikes = 18) {
  ctx.beginPath();
  for (let i = 0; i <= spikes; i++) {
    const a = (i / spikes) * TAU;
    const k = (0.72 + 0.4 * jag(i % spikes, seed)) * grow;
    ctx.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * ry * k);
  }
  ctx.closePath();
}

const TAU = Math.PI * 2;
const FONT = "'Pixelify Sans', system-ui, sans-serif";
const TITLE = "'Pixelify Sans', system-ui, sans-serif";

export function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function hexA(hex, a) { return rgba(hexRgb(hex), a); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); ctx.fill(); }
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
function idSeed(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return (h >>> 0) % 1000; }
// warning colour for enemy attacks (blue/white when colour-blind friendly mode is on)
const warn = (a) => (prefs.cbSafe ? `rgba(90,170,255,${a})` : `rgba(255,70,50,${a})`);

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

// 8 directions
const DIRS = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];
export function facing(aim) {
  const i = Math.round(((aim % TAU) + TAU) % TAU / (Math.PI / 4)) % 8;
  return DIRS[i];
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
const HAND = {
  down: [7, -10], downright: [6, -10], right: [5, -10], upright: [-2, -11],
  up: [-6, -11], upleft: [2, -11], left: [-5, -10], downleft: [-6, -10],
};
// o: { look:{cloak,hat}, cls, aim, moving, swing, heavy, down, hurt, dash, guard, cast }
export function drawCharacter(ctx, x, y, o, t) {
  x = Math.round(x); y = Math.round(y);
  const em = o.emote, et = o.emoteT || 0;
  if (o.down || em === 'nap') {
    ctx.drawImage(downSprite(o.look), x - 16, y - 12);
    if (em === 'nap' && !o.down) {
      // little Z's drifting up
      ctx.fillStyle = '#dfe8ff';
      for (let i = 0; i < 3; i++) {
        const k = (et * 0.6 + i / 3) % 1;
        const zx = Math.round(x + 10 + k * 8), zy = Math.round(y - 14 - k * 16), zs = 2 + i;
        ctx.globalAlpha = 1 - k;
        ctx.fillRect(zx, zy, zs, 1); ctx.fillRect(zx + zs - 1, zy + 1, 1, 1); ctx.fillRect(zx, zy + 2, 1, 1); ctx.fillRect(zx, zy + 3, zs, 1);
      }
      ctx.globalAlpha = 1;
    }
    return;
  }
  // body movement for the other emotes
  if (em) {
    if (em === 'cheer' && et < 1.8) y -= Math.round(Math.abs(Math.sin(et * 9)) * 5);
    if (em === 'dance') { y -= Math.round(Math.abs(Math.sin(et * 8)) * 3); x += Math.round(Math.sin(et * 4) * 3); o = { ...o, aim: Math.floor(et / 0.4) % 2 ? Math.PI : 0, moving: true }; }
    if (em === 'flourish' && et < 2) o = { ...o, swing: -1, cast: -1, spinWeapon: et * 11 };
  }
  ctx.save();
  if (em === 'bow' && et < 1.4) { ctx.translate(x, y); ctx.rotate(Math.sin(Math.min(1, et / 0.5) * Math.PI / 2) * 0.35 * (et > 0.9 ? Math.max(0, (1.4 - et) / 0.5) : 1) * (Math.cos(o.aim) >= 0 ? 1 : -1)); ctx.translate(-x, -y); }
  if (em === 'sit') { ctx.translate(x, y); ctx.scale(1, 0.78); ctx.translate(-x, -y); }
  if (o.hurt && Math.floor(t * 30) % 2) ctx.globalAlpha = 0.5;
  if (o.dash) ctx.globalAlpha = 0.75;
  const dir = facing(o.aim);
  const frame = o.moving ? [1, 0, 2, 0][Math.floor(t * 7) % 4] : 0;
  const { img, flip } = charSprite(o.look, dir, frame, o.cls);
  const bob = o.moving && frame !== 0 ? -1 : 0;
  const hand = HAND[dir];
  const sorc = o.cls === 'sorcerer';
  const weapon = () => {
    if (em === 'sit') return; // weapon put away while sitting
    if (o.spinWeapon !== undefined) {
      // showing off: the weapon twirls around the hand
      const img = o.cls === 'bowman' ? bowSprite() : o.cls === 'rogue' ? daggerSprite() : o.cls === 'sorcerer' ? staffSprite() : swordSprite(true);
      ctx.save(); ctx.translate(x + hand[0], y + hand[1] - 6); ctx.rotate(o.spinWeapon); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
      return;
    }
    if ((em === 'cheer' && et < 1.8) || (em === 'wave' && et < 1.6)) {
      // arm raised: weapon held up high (cheer) or a waving hand (wave)
      if (em === 'wave') { ctx.fillStyle = '#e8b994'; ctx.fillRect(Math.round(x + 7 + Math.sin(et * 14) * 2), y - 30, 3, 3); return; }
      const img = o.cls === 'bowman' ? bowSprite() : o.cls === 'rogue' ? daggerSprite() : o.cls === 'sorcerer' ? staffSprite() : swordSprite(false);
      ctx.save(); ctx.translate(x + 6, y - 24); ctx.rotate(-Math.PI / 2); ctx.drawImage(img, -2, -img.height / 2); ctx.restore();
      return;
    }
    if (o.cls === 'bowman') {
      // the bow points where you aim; the string pulls back as you draw
      ctx.save();
      ctx.translate(x + hand[0] * 0.6 + Math.cos(o.aim) * 4, y + hand[1] + bob + Math.sin(o.aim) * 3);
      ctx.rotate(o.aim);
      const pull = (o.charge || 0) * 7;
      ctx.drawImage(bowSprite(), -2, -13);
      ctx.strokeStyle = 'rgba(240,235,220,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-1, -13); ctx.lineTo(-1 - pull, 0); ctx.lineTo(-1, 13); ctx.stroke();
      if (o.charge > 0) { ctx.fillStyle = '#e8e0c8'; ctx.fillRect(-1 - pull, -0.5, 14, 1); ctx.fillStyle = '#c9d1da'; ctx.fillRect(12 - pull, -1, 3, 2); }
      ctx.restore();
      return;
    }
    if (o.cls === 'rogue') {
      const dg = daggerSprite();
      let ang = o.aim, reach = 4;
      if (o.spin >= 0) ang = o.aim + o.spin * TAU;
      else if (o.swing >= 0) reach = 4 + Math.sin(o.swing * Math.PI) * 10; // a forward thrust
      else ang = o.aim + 0.9 * (Math.cos(o.aim) >= 0 ? 1 : -1);
      ctx.save();
      ctx.translate(x + hand[0] + Math.cos(ang) * (reach - 4), y + hand[1] + bob + Math.sin(ang) * (reach - 4) * 0.7);
      ctx.rotate(ang);
      ctx.drawImage(dg, -2, -2.5);
      ctx.restore();
      ctx.save();
      ctx.translate(x - hand[0] * 0.7, y + hand[1] + bob + 1);
      ctx.rotate(ang + Math.PI * 0.15);
      ctx.drawImage(dg, -2, -2.5);
      ctx.restore();
      return;
    }
    const sw = sorc ? staffSprite() : swordSprite(o.heavy && o.swing >= 0);
    let ang;
    if (o.guard) ang = o.aim - (Math.PI / 2) * (Math.cos(o.aim) >= 0 ? 1 : -1);
    else if (o.swing >= 0) { const span = sorc ? 1.0 : o.heavy ? 1.6 : 1.25; ang = o.aim - span + easeOut(o.swing) * span * 2; }
    else if (o.cast >= 0) ang = -Math.PI / 2 + (Math.cos(o.aim) >= 0 ? 0.3 : -0.3); // staff raised to cast
    else ang = sorc ? -Math.PI / 2 + 0.35 * (Math.cos(o.aim) >= 0 ? 1 : -1) : o.aim + 0.8 * (Math.cos(o.aim) >= 0 ? 1 : -1);
    const gx = o.guard ? Math.cos(o.aim) * 7 : 0, gy = o.guard ? Math.sin(o.aim) * 5 : 0;
    ctx.save();
    ctx.translate(x + hand[0] + gx, y + hand[1] + bob + gy);
    ctx.rotate(ang);
    ctx.drawImage(sw, sorc ? -6 : -3, sorc ? -4.5 : -3.5);
    ctx.restore();
  };
  const behind = dir === 'up' || dir === 'upleft' || dir === 'upright';
  if (behind) weapon();
  if (flip) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -CHAR_W / 2, y - 35 + bob);
    ctx.restore();
  } else ctx.drawImage(img, x - CHAR_W / 2, y - 35 + bob);
  if (!behind) weapon();
  ctx.restore();
}

export function torchPoint(x, y, aim, moving, t) {
  const a = TORCH[facing(aim)];
  const frame = moving ? [1, 0, 2, 0][Math.floor(t * 7) % 4] : 0;
  return [x + a[0], y + a[1] + (moving && frame !== 0 ? -1 : 0)];
}

// tip of the sorcerer's staff (for spell sparkles)
function staffTip(x, y, o) {
  const hand = HAND[facing(o.aim)];
  let ang = o.cast >= 0 ? -Math.PI / 2 + (Math.cos(o.aim) >= 0 ? 0.3 : -0.3) : -Math.PI / 2 + 0.35 * (Math.cos(o.aim) >= 0 ? 1 : -1);
  if (o.swing >= 0) ang = o.aim - 1 + easeOut(o.swing) * 2;
  return [x + hand[0] + Math.cos(ang) * 20, y + hand[1] + Math.sin(ang) * 20];
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
  const aim = 0.75;
  drawCharacter(ctx, fx, fy, { look: { cloak: byId(CLOAKS, ch.cloak).hex, hat: ch.hat }, cls: ch.cls, aim, moving: false, swing: -1, cast: -1 }, t);
  const [tx, ty] = torchPoint(Math.round(fx), Math.round(fy), aim, false, t);
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
  // lots of different trees: oaks, pines, birches, autumn trees, tall firs, shrubs, dead trees and the odd giant mushroom
  const KINDS = [['oak', 0.34], ['pine', 0.2], ['birch', 0.11], ['autumn', 0.1], ['bigpine', 0.08], ['shrub', 0.08], ['dead', 0.05], ['mushtree', 0.04]];
  const kindOf = (tx, ty) => {
    let r = hash2(tx * 5 + 1, ty * 3 + 2);
    for (const [k, w] of KINDS) { if (r < w) return k; r -= w; }
    return 'oak';
  };
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      if (!world.isSolid(tx, ty)) continue;
      if (world.rocks[world.idx(tx, ty)]) { g.drawImage(boulderSprite(Math.floor(hash2(tx, ty) * 2)), tx * T - 2, ty * T - 2); continue; }
      if (world.isSolid(tx, ty + 1)) continue;
      const s = treeSprite(kindOf(tx, ty), Math.floor(hash2(ty, tx) * 3));
      g.drawImage(s.trunk, tx * T + 16 - s.ox, ty * T + 30 - s.oy);
    }
  }
  const [canopy, c] = mk();
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      if (!world.isSolid(tx, ty) || world.rocks[world.idx(tx, ty)]) continue;
      // deep inside the forest only thick trees, so the wall of trees stays solid-looking
      let deep = true;
      for (let oy = -1; oy <= 1 && deep; oy++) for (let ox = -1; ox <= 1; ox++) if (!world.isSolid(tx + ox, ty + oy)) { deep = false; break; }
      const kind = deep ? (hash2(tx, ty * 7) < 0.6 ? 'oak' : 'pine') : kindOf(tx, ty);
      const s = treeSprite(kind, Math.floor(hash2(ty, tx) * 3));
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
    this.zoom = prefs.zoom === 'auto' ? Math.max(1, Math.round(h / 480)) : Number(prefs.zoom);
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

    if (world.readyZone) this.drawReadyZone(ctx, world.readyZone, t);
    if (world.exit) this.drawGateGround(ctx, world.exit, snap.go, t);
    for (const h of snap.hz) if (vis(h.x, h.y, 200)) this.drawHazard(ctx, h, t);
    for (const z of snap.zn || []) if (vis(z.x, z.y, 120)) this.drawZoneGround(ctx, z, t);
    for (const s of snap.sf || []) if (vis(s.x, s.y)) this.drawStrikeGround(ctx, s, t);
    for (const e of game.effects) if (e.k === 'crack') this.drawCrack(ctx, e, t);
    // Rogue: a red glimmer on the ground behind nearby enemies shows where to stand for a backstab
    if (me.k === 'rogue' && !me.dn) {
      for (const e of snap.es) {
        const v = game.views.get('e' + e.id);
        if (!v || Math.hypot(v.x - game.lp.x, v.y - game.lp.y) > 170) continue;
        const r = (e.t === 'treant' ? 40 : e.t === 'alpha' ? 18 : 11) + 12;
        const back = e.fa + Math.PI;
        let d = Math.atan2(game.lp.y - v.y, game.lp.x - v.x) - e.fa;
        while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        const inSpot = Math.abs(d) > Math.PI / 2;
        const a = (inSpot ? 0.55 : 0.28) + Math.sin(t * 6 + e.id) * 0.08;
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.scale(1, 0.6);
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(255,60,70,${a})`;
        ctx.lineWidth = inSpot ? 5 : 3;
        ctx.beginPath(); ctx.arc(0, 0, r, back - 1.2, back + 1.2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,170,170,${a * 0.8})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, r + 4, back - 0.9, back + 0.9); ctx.stroke();
        ctx.restore();
      }
    }

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
    // Rogue decoys: a flickering see-through copy
    for (const d of snap.dc || []) {
      if (!vis(d.x, d.y)) continue;
      list.push({ y: d.y, d: () => {
        ctx.save();
        ctx.globalAlpha = 0.45 + Math.sin(t * 20) * 0.1;
        drawCharacter(ctx, d.x, d.y, { look: { cloak: byId(CLOAKS, d.c).hex, hat: 'hood' }, cls: 'rogue', aim: 1.5, moving: false, swing: -1, cast: -1, spin: -1 }, t);
        ctx.restore();
      } });
    }
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.d();
    this.drawParticles(ctx, game.particles, false);
    this.blit(this.gfx.canopy, ox, oy, vw, vh);
    if (world.readyZone) this.drawArch(ctx, world.readyZone, snap, t);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawLighting(game, snap, toS, W, H, t);

    ctx.setTransform(Z, 0, 0, Z, -ox * Z, -oy * Z);
    this.drawPostLight(ctx, game, snap, me, t, vis);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawScreenText(ctx, game, snap, me, toS, vis, t);
    this.drawScreenFx(ctx, game, snap, me, W, H, t);
  }

  // ---------------------------------------------------------- objects
  drawProp(ctx, p) {
    if (p.type === 'campfire') ctx.drawImage(propSprite('campfire'), p.x - 20, p.y - 16);
    else if (p.type === 'wardrobe') ctx.drawImage(propSprite('wardrobe'), p.x - 15, p.y - 44);
    else if (p.type === 'shrine') {
      // a banner in the class colour behind each shrine
      const c = byId(CLASSES, p.cls);
      ctx.fillStyle = '#3b2a1e'; ctx.fillRect(p.x + 9, p.y - 44, 2, 44);
      ctx.fillStyle = c.available ? c.color : '#5a5e66';
      ctx.beginPath(); ctx.moveTo(p.x + 11, p.y - 43); ctx.lineTo(p.x + 22, p.y - 41); ctx.lineTo(p.x + 19, p.y - 35); ctx.lineTo(p.x + 22, p.y - 29); ctx.lineTo(p.x + 11, p.y - 30); ctx.fill();
      ctx.drawImage(propSprite('shrine', c.available ? 1 : 0), p.x - 10, p.y - 32);
    }
    else if (p.type === 'fence') ctx.drawImage(propSprite('fence'), p.x - 8, p.y - 18);
    else if (p.type === 'tent') ctx.drawImage(propSprite('tent'), p.x - 38, p.y - 52);
    else if (p.type === 'signpost') ctx.drawImage(propSprite('signpost'), p.x - 15, p.y - 42);
    else if (p.type === 'board') ctx.drawImage(propSprite('board'), p.x - 20, p.y - 44);
    else if (p.type === 'resetpost') ctx.drawImage(propSprite('resetpost'), p.x - 8, p.y - 28);
    else if (p.type === 'log') ctx.drawImage(propSprite('log'), p.x - 20, p.y - 12);
    else if (p.type === 'sign') ctx.drawImage(propSprite('signpost'), p.x - 15, p.y - 42);
    else if (p.type === 'fox') ctx.drawImage(propSprite('fox', Math.floor(performance.now() / 900) % 2), p.x - 14, p.y - 14);
    else if (p.type === 'owl') ctx.drawImage(propSprite('owl', performance.now() % 4000 < 160 ? 1 : 0), p.x - 12, p.y - 20);
  }

  drawEnemy(ctx, e, v, t) {
    const x = Math.round(v.x), y = Math.round(v.y);
    if (e.t === 'dummy') {
      const img = propSprite('dummy', e.kd === 'hitter' ? 1 : e.kd === 'facer' ? 2 : 0);
      const wob = e.hu ? Math.round(Math.sin(t * 60) * 2) : 0;
      ctx.save();
      ctx.translate(x, y);
      if (e.fx < 0) ctx.scale(-1, 1);
      if (e.kd === 'hitter' && e.s === 2) ctx.rotate(-0.08); // winding up
      ctx.drawImage(img, -15 + wob, -38);
      if (e.hu) { ctx.globalAlpha = 0.7; ctx.drawImage(whiteOf(img), -15 + wob, -38); }
      ctx.restore();
      return;
    }
    if (e.t === 'treant') {
      const img = treantSprite(e.s === 5 ? 1 : 0);
      const sway = Math.round(Math.sin(t * 1.5) * 1.5);
      ctx.drawImage(img, x - 56 + sway, y - 116);
      if (e.hu) { ctx.globalAlpha = 0.55; ctx.drawImage(whiteOf(img), x - 56 + sway, y - 116); ctx.globalAlpha = 1; }
      return;
    }
    const variant = e.t === 'alpha' ? 'alpha' : e.el ? 'elite' : 'wolf';
    const frame = e.s === 2 ? 3 : e.s === 3 ? 4 : v.moving ? 1 + (Math.floor(t * 8) % 2) : 0;
    const img = wolfSprite(frame, variant);
    const S = variant === 'alpha' ? 1.5 : 1;
    const top = y - img.height + Math.round(3 * S);
    const shake = e.s === 2 ? Math.round(Math.sin(t * 60)) : 0;
    // squash when hit
    const squash = e.hu ? 0.85 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(e.fx < 0 ? -1 : 1, 1);
    ctx.scale(1 / squash, squash);
    ctx.drawImage(img, -img.width / 2 + shake, top - y);
    if (e.hu) { ctx.globalAlpha = 0.85; ctx.drawImage(whiteOf(img), -img.width / 2 + shake, top - y); }
    else if (e.sl) { ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#8fd8ff'; ctx.fillRect(-img.width / 2, top - y, img.width, img.height); }
    ctx.restore();
    if (e.sn) {
      ctx.fillStyle = '#fff6b0';
      for (let i = 0; i < 3; i++) { const a = t * 5 + (i * TAU) / 3; ctx.fillRect(Math.round(x + Math.cos(a) * 9), Math.round(top - 4 + Math.sin(a) * 3), 2, 2); }
    }
  }

  eyePos(e, v) {
    if (e.t === 'dummy') return [];
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
    const seed = h.id % 97;
    if (h.k === 'root') {
      if (h.done) { ctx.drawImage(propSprite('roots'), h.x - 20, h.y - 28); return; }
      // the ground splits open: a ragged dark patch with cracks spreading out
      ctx.fillStyle = prefs.cbSafe ? `rgba(40,70,120,${0.25 + h.p * 0.35})` : `rgba(60,22,12,${0.25 + h.p * 0.4})`;
      jaggedBlob(ctx, h.x, h.y, h.r, h.r * 0.7, seed, 0.5 + h.p * 0.5);
      ctx.fill();
      ctx.strokeStyle = warn(0.35 + h.p * 0.55);
      ctx.lineWidth = 1;
      jaggedBlob(ctx, h.x, h.y, h.r, h.r * 0.7, seed + 3, 1);
      ctx.stroke();
      ctx.strokeStyle = prefs.cbSafe ? `rgba(160,200,255,${0.5 + h.p * 0.5})` : `rgba(255,140,80,${0.4 + h.p * 0.6})`;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + jag(i, seed) * 0.8, len = h.r * (0.4 + 0.6 * jag(i + 9, seed)) * h.p;
        ctx.beginPath(); ctx.moveTo(h.x, h.y);
        ctx.lineTo(h.x + Math.cos(a + 0.25) * len * 0.5, h.y + Math.sin(a + 0.25) * len * 0.35);
        ctx.lineTo(h.x + Math.cos(a) * len, h.y + Math.sin(a) * len * 0.7);
        ctx.stroke();
      }
      if (h.p > 0.6) { ctx.fillStyle = 'rgba(90,60,40,0.8)'; for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(h.x - 10 + jag(i, Math.floor(t * 20)) * 20), Math.round(h.y - 4 - jag(i + 4, Math.floor(t * 20)) * 6), 1, 1); }
    } else if (h.k === 'cone') {
      // a ragged shadow of the sweeping branch
      const steps = 22;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      for (let i = 0; i <= steps; i++) {
        const a = h.a - h.arc / 2 + (h.arc * i) / steps;
        const rr = h.r * (0.82 + 0.22 * jag(i, seed)) * (0.6 + 0.4 * h.p);
        ctx.lineTo(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(h.x, h.y, 10, h.x, h.y, h.r);
      g.addColorStop(0, warn(0.05)); g.addColorStop(1, warn(0.15 + h.p * 0.35));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = warn(0.3 + h.p * 0.5); ctx.lineWidth = 1; ctx.stroke();
      // twig-like streaks inside
      ctx.strokeStyle = warn(0.2 + h.p * 0.3);
      for (let i = 0; i < 6; i++) {
        const a = h.a - h.arc / 2 + h.arc * jag(i, seed + 5), r0 = h.r * 0.3, r1 = h.r * (0.6 + 0.3 * jag(i + 2, seed));
        ctx.beginPath(); ctx.moveTo(h.x + Math.cos(a) * r0, h.y + Math.sin(a) * r0);
        ctx.lineTo(h.x + Math.cos(a + 0.06) * (r0 + r1) / 2, h.y + Math.sin(a + 0.06) * (r0 + r1) / 2);
        ctx.lineTo(h.x + Math.cos(a - 0.03) * r1, h.y + Math.sin(a - 0.03) * r1); ctx.stroke();
      }
    }
  }

  drawZoneGround(ctx, z, t) {
    const fade = Math.min(1, z.t / 0.5);
    if (z.k === 'rain') {
      ctx.fillStyle = `rgba(30,20,10,${0.25 * fade})`;
      jaggedBlob(ctx, z.x, z.y, z.r, z.r * 0.7, z.id % 50, 1, 20); ctx.fill();
      return;
    }
    if (z.k === 'pyre') { ctx.fillStyle = `rgba(40,15,5,${0.45 * fade})`; ctx.fillRect(z.x - 9, z.y - 3, 18, 6); }
    else if (z.k === 'blizzard') {
      ctx.fillStyle = `rgba(170,220,255,${0.18 * fade})`;
      ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(220,245,255,${0.5 * fade})`; ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]); ctx.lineDashOffset = t * 12;
      ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    } else if (z.k === 'storm') { ctx.fillStyle = `rgba(60,20,5,${0.4 * fade})`; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.5, 0, 0, TAU); ctx.fill(); }
  }

  drawStrikeGround(ctx, s, t) {
    const p = Math.max(0, Math.min(1, 1 - s.t / 0.6));
    if (s.t > 0.6) return;
    ctx.fillStyle = `rgba(255,180,90,${0.1 + p * 0.25})`;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,220,150,${0.4 + p * 0.5})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * p, s.r * 0.6 * p, 0, 0, TAU); ctx.stroke();
  }

  drawCrack(ctx, e, t) {
    const p = (t - e.t0) / e.life;
    if (p < 0 || p > 1) return;
    ctx.strokeStyle = `rgba(30,18,8,${0.7 * (1 - p)})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + e.seed;
      ctx.beginPath(); ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(a) * e.r * 0.45, e.y + Math.sin(a) * e.r * 0.3 + 3);
      ctx.lineTo(e.x + Math.cos(a + 0.2) * e.r * 0.8, e.y + Math.sin(a + 0.2) * e.r * 0.55);
      ctx.stroke();
    }
  }

  // under the archway: a soft glow on the path and some old stepping stones
  drawReadyZone(ctx, z, t) {
    const cx = z.x + z.w / 2, cy = z.y + z.h * 0.6;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, z.w * 0.6);
    g.addColorStop(0, 'rgba(255,210,140,0.14)'); g.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = g; ctx.fillRect(z.x - 20, z.y - 10, z.w + 40, z.h + 20);
    for (let i = 0; i < 6; i++) {
      const sx = Math.round(cx - 10 + jag(i, 4) * 20), sy = Math.round(z.y + 14 + i * 16);
      ctx.fillStyle = '#5a5e58'; ctx.fillRect(sx - 4, sy, 9, 4);
      ctx.fillStyle = '#7b8078'; ctx.fillRect(sx - 3, sy, 7, 1);
    }
  }

  // the archway is drawn after the players, so you walk under it
  drawArch(ctx, z, snap, t) {
    const img = archwaySprite();
    const ax = Math.round(z.x + z.w / 2 - img.width / 2), ay = Math.round(z.y + z.h - img.height + 18);
    ctx.drawImage(img, ax, ay);
    const ready = snap.ps.filter((p) => p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h).length;
    ARCH_LANTERNS.forEach(([lx, ly], i) => {
      const lit = i < Math.ceil((ready / Math.max(1, snap.ps.length)) * 4 - 0.001) || snap.cd > 0;
      ctx.drawImage(lanternSprite(lit), Math.round(ax + lx - 3 + Math.sin(t * 2 + i) * 0.8), Math.round(ay + ly));
    });
    this.archLights = ARCH_LANTERNS.map(([lx, ly], i) => ({ x: ax + lx, y: ay + ly + 5, lit: i < Math.ceil((ready / Math.max(1, snap.ps.length)) * 4 - 0.001) || snap.cd > 0 }));
  }

  drawGateGround(ctx, ex, open, t) {
    ctx.save();
    ctx.strokeStyle = open ? 'rgba(170,255,170,0.45)' : 'rgba(200,80,60,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(ex.x, ex.y, ex.r, ex.r * 0.55, 0, 0, TAU); ctx.stroke();
    if (!open) {
      for (let i = 0; i < 12; i++) {
        const x = ex.x - 40 + i * 7;
        const yy = ex.y - 30 + Math.round(Math.sin(i * 1.7) * 4);
        ctx.fillStyle = i % 2 ? '#5a3a22' : '#3b2a1a';
        ctx.fillRect(x, yy, 7, 2);
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
      if (p.dn) { L.push({ x: v.x, y: v.y - 6, r: 55 + 80 * p.rv, col: [255, 90, 50], i: 0.7 }); continue; }
      const pal = byId(FLAMES, p.f);
      const ratio = p.hp / p.mx;
      const fl = 1 + Math.sin(t * 9 + v.x * 0.01) * 0.02 + Math.sin(t * 23) * 0.015;
      const r = (p.gl ? 420 : 75 + 260 * Math.pow(ratio, 0.85)) * fl;
      L.push({ x: v.x, y: v.y - 24, r, col: pal.light, i: 1 });
    }
    if (world.campfire) L.push({ x: world.campfire.x, y: world.campfire.y - 8, r: 250 + Math.sin(t * 7) * 10 + Math.sin(t * 13) * 6, col: [255, 150, 70], i: 1 });
    for (const g of world.glows) L.push({ x: g.x, y: g.y, r: 52, col: g.c, i: 0.55 });
    for (const k of snap.pk) L.push({ x: k.x, y: k.y, r: k.k === 'f' ? 80 : 48, col: k.k === 'f' ? [255, 230, 140] : [255, 160, 70], i: 0.85 });
    for (const z of snap.zn || []) L.push({ x: z.x, y: z.y - 6, r: z.k === 'blizzard' ? z.r * 1.3 : z.k === 'storm' ? 110 : 60, col: z.k === 'blizzard' ? [150, 210, 255] : [255, 140, 50], i: 0.8 });
    for (const s of snap.sp || []) L.push({ x: s.x, y: s.y, r: s.k === 'fire' ? 90 : 50, col: s.k === 'fire' ? [255, 150, 60] : [150, 220, 255], i: 0.9 });
    for (const s of snap.sf || []) if (s.t < 0.6) L.push({ x: s.x, y: s.y, r: 70, col: [255, 190, 110], i: 0.6 });
    for (const e of snap.es) {
      const v = game.views.get('e' + e.id);
      if (!v) continue;
      if (e.el || e.b) L.push({ x: v.x, y: v.y - 10, r: 48, col: [255, 140, 60], i: 0.5 });
    }
    if (world.exit) L.push({ x: world.exit.x, y: world.exit.y - 20, r: snap.go ? 220 : 120, col: snap.go ? [160, 255, 170] : [255, 100, 80], i: 0.85 });
    world.shrines.forEach((s, i) => { if (!snap.sh[i]) L.push({ x: s.x, y: s.y - 16, r: 110, col: [255, 170, 90], i: 0.85 }); });
    if (world.readyZone && this.archLights) for (const a of this.archLights) L.push({ x: a.x, y: a.y, r: a.lit ? 90 : 26, col: [255, 200, 120], i: a.lit ? 0.9 : 0.4 });
    for (const p of snap.ps) if (p.hk > 0) { const v = game.playerView(p); L.push({ x: v.x, y: v.y - 16, r: 140, col: [255, 220, 140], i: 0.7 }); }
    // camp lanterns: each area of the camp has its own warm light
    for (const p of world.props) {
      if (p.type === 'tent' || p.type === 'board' || p.type === 'sign' || p.type === 'resetpost') L.push({ x: p.x, y: p.y - 20, r: p.type === 'sign' ? 120 : 110, col: [255, 190, 110], i: 0.75 });
    }
    for (const p of world.props) {
      if (p.type !== 'shrine') continue;
      const c = byId(CLASSES, p.cls);
      L.push({ x: p.x, y: p.y - 30, r: c.available ? 90 : 36, col: hexRgb(c.color), i: c.available ? 0.9 : 0.5 });
    }
    for (const e of game.effects) {
      if (!e.light) continue;
      const a = 1 - (t - e.t0) / e.life;
      if (a > 0) L.push({ x: e.x, y: e.y, r: e.light, col: e.lcol || [255, 170, 80], i: a });
    }
    return L;
  }

  drawLighting(game, snap, toS, W, H, t) {
    const l = this.lctx, ctx = this.ctx, Z = this.zoom;
    const base = game.world.kind === 'lobby' ? 0.72 : game.world.kind === 'arena' ? 0.9 : 0.95;
    const dark = Math.max(0.2, Math.min(0.99, base * (1.5 - prefs.brightness * 0.5)));
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
    if (this.archLights && world.readyZone) {
      for (const a of this.archLights) if (a.lit) drawFlame(ctx, a.x, a.y + 2, 0.25, FLAMES[0], t, false, a.x, 0.8);
      if (snap.cd > 0) {
        // mist rolls in under the archway as the run is about to start
        const z = world.readyZone;
        for (let i = 0; i < 12; i++) {
          ctx.fillStyle = `rgba(210,225,220,${0.12 + 0.05 * Math.sin(t * 2 + i)})`;
          circle(ctx, z.x + jag(i, 3) * z.w + Math.sin(t * 0.8 + i) * 8, z.y + 20 + jag(i, 8) * z.h, 16 + jag(i, 11) * 12);
        }
      }
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
    world.shrines.forEach((s, i) => {
      if (snap.sh[i] || !vis(s.x, s.y)) return;
      ctx.fillStyle = `rgba(255,170,90,${0.6 + Math.sin(t * 3) * 0.3})`;
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
    // ground spells
    for (const z of snap.zn || []) {
      if (!vis(z.x, z.y, 120)) continue;
      const fade = Math.min(1, z.t / 0.5);
      if (z.k === 'pyre') drawFlame(ctx, z.x, z.y, Math.min(1, z.t / 2), FLAMES[0], t * 1.3, false, z.x + z.y, 1.1);
      else if (z.k === 'storm') {
        for (let i = 0; i < 4; i++) {
          const a = t * 8 + i * 1.6, rr = 6 + i * 4;
          drawFlame(ctx, z.x + Math.cos(a) * rr, z.y - 4 - i * 7 + Math.sin(a) * rr * 0.4, 0.8 * fade, FLAMES[0], t + i, false, i, 1.1 - i * 0.15);
        }
      } else if (z.k === 'blizzard') {
        ctx.fillStyle = `rgba(235,248,255,${0.85 * fade})`;
        for (let i = 0; i < 26; i++) {
          const sx = z.x + (hash2(i, z.id) - 0.5) * z.r * 2, sy = z.y - z.r * 0.6 + ((t * 40 + hash2(z.id, i) * 200) % (z.r * 1.2));
          if (Math.hypot((sx - z.x) / z.r, (sy - z.y) / (z.r * 0.7)) < 1) ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        }
      } else if (z.k === 'rain') {
        // arrows streaking down into the circle
        ctx.strokeStyle = `rgba(240,230,200,${0.9 * fade})`; ctx.lineWidth = 1;
        for (let i = 0; i < 10; i++) {
          const k = (t * 3 + jag(i, z.id)) % 1;
          const ax = z.x + (jag(i + 20, z.id) - 0.5) * z.r * 1.6, ay = z.y + (jag(i + 40, z.id) - 0.5) * z.r;
          const top = ay - 70 * (1 - k);
          ctx.beginPath(); ctx.moveTo(ax - 6 * (1 - k), top - 10); ctx.lineTo(ax - 6 * (1 - k) + 2, top); ctx.stroke();
        }
      } else if (z.k === 'smoke') {
        // thick grey clouds (drawn over everything inside)
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU + t * 0.25 + jag(i, z.id), rr = z.r * (0.25 + 0.6 * jag(i + 7, z.id));
          const cx = z.x + Math.cos(a) * rr, cy = z.y - 8 + Math.sin(a) * rr * 0.6;
          const s = 14 + 10 * jag(i + 3, z.id);
          ctx.fillStyle = `rgba(${150 + i * 4},${150 + i * 4},${165 + i * 3},${0.55 * fade})`;
          circle(ctx, cx, cy, s);
        }
      }
    }
    // projectiles and falling meteors
    for (const s of snap.sp || []) {
      if (!vis(s.x, s.y)) continue;
      if (s.k === 'fire') {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 10);
        g.addColorStop(0, 'rgba(255,245,200,1)'); g.addColorStop(0.4, 'rgba(255,150,50,0.9)'); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g; circle(ctx, s.x, s.y, 10);
      } else if (s.k === 'arrow') {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
        ctx.strokeStyle = 'rgba(255,230,170,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-6, 0); ctx.stroke();
        ctx.fillStyle = '#d8c39a'; ctx.fillRect(-8, -0.5, 11, 1);
        ctx.fillStyle = '#e9eef3'; ctx.fillRect(3, -1, 3, 2);
        ctx.fillStyle = '#c4533a'; ctx.fillRect(-9, -1.5, 2, 1); ctx.fillRect(-9, 0.5, 2, 1);
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
        ctx.fillStyle = '#d9f4ff'; ctx.fillRect(-5, -1, 9, 2); ctx.fillStyle = '#8fd8ff'; ctx.fillRect(-7, -1, 3, 2);
        ctx.restore();
      }
    }
    for (const s of snap.sf || []) {
      if (s.t > 0.6 || !vis(s.x, s.y)) continue;
      const h = s.t * 260;
      const g = ctx.createLinearGradient(s.x - h * 0.4, s.y - h, s.x, s.y);
      g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(1, 'rgba(255,240,200,0.95)');
      ctx.strokeStyle = g; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x - h * 0.4, s.y - h); ctx.lineTo(s.x, s.y - 4); ctx.stroke();
      ctx.fillStyle = '#fff3c0'; circle(ctx, s.x, s.y - 4, 3);
    }
    ctx.globalCompositeOperation = 'source-over';
    // enemies: lunge warnings, glowing eyes
    for (const e of snap.es) {
      const v = game.views.get('e' + e.id);
      if (!v || !vis(v.x, v.y, 150)) continue;
      if (e.t === 'dummy' && e.s === 2) {
        // the practice dummy's club swing: a ragged arc in front of it
        ctx.fillStyle = warn(0.3);
        ctx.beginPath(); ctx.moveTo(v.x, v.y - 6);
        for (let i = 0; i <= 10; i++) { const a = e.fa - 1.1 + (2.2 * i) / 10, rr = 58 * (0.85 + 0.2 * jag(i, e.id)); ctx.lineTo(v.x + Math.cos(a) * rr, v.y - 6 + Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
      }
      if (e.s === 2 && e.t !== 'treant' && e.t !== 'dummy') {
        // three ragged claw-streaks showing where it's about to pounce
        const range = e.t === 'alpha' ? 140 : WOLF.lungeRange;
        ctx.save();
        ctx.translate(v.x, v.y - 4);
        ctx.rotate(Math.atan2(e.dy, e.dx));
        const g = ctx.createLinearGradient(0, 0, range + 20, 0);
        g.addColorStop(0, warn(0.55)); g.addColorStop(1, warn(0));
        ctx.fillStyle = g;
        for (const off of [-6, 0, 6]) {
          ctx.beginPath();
          ctx.moveTo(4, off);
          const n = 8;
          for (let i = 1; i <= n; i++) ctx.lineTo(4 + ((range + 16) * i) / n, off + (jag(i + off, e.id) - 0.5) * 4 - (off * i) / n * 0.3);
          for (let i = n; i >= 0; i--) ctx.lineTo(4 + ((range + 16) * i) / n, off + (jag(i + off + 30, e.id) - 0.5) * 4 + 2.2 * (1 - i / n));
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      // Bowman's mark: a beam of light from the sky, a spinning target and a bobbing arrow, easy for everyone to spot
      if (e.mk) {
        const r = e.t === 'treant' ? 40 : e.t === 'alpha' ? 22 : 15, py = v.y - (e.t === 'treant' ? 50 : 10);
        const top = v.y - (e.t === 'treant' ? 140 : e.t === 'alpha' ? 70 : 52);
        ctx.globalCompositeOperation = 'lighter';
        const beam = ctx.createLinearGradient(0, top - 90, 0, v.y);
        beam.addColorStop(0, 'rgba(255,210,100,0)'); beam.addColorStop(1, `rgba(255,210,100,${0.28 + Math.sin(t * 6) * 0.08})`);
        ctx.fillStyle = beam; ctx.fillRect(v.x - 7, top - 90, 14, v.y - top + 90);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(255,215,110,${0.85 + Math.sin(t * 8) * 0.15})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(v.x, v.y, r + 4, (r + 4) * 0.55, 0, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(v.x, py, r, 0, TAU); ctx.stroke();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + t * 2; ctx.beginPath(); ctx.moveTo(v.x + Math.cos(a) * (r - 4), py + Math.sin(a) * (r - 4)); ctx.lineTo(v.x + Math.cos(a) * (r + 5), py + Math.sin(a) * (r + 5)); ctx.stroke(); }
        const ay = top + Math.sin(t * 5) * 3;
        ctx.fillStyle = '#ffd36a'; ctx.strokeStyle = '#3b2a1e'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(v.x, ay + 7); ctx.lineTo(v.x - 6, ay); ctx.lineTo(v.x - 2, ay); ctx.lineTo(v.x - 2, ay - 6); ctx.lineTo(v.x + 2, ay - 6); ctx.lineTo(v.x + 2, ay); ctx.lineTo(v.x + 6, ay); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // Rogue only: a dagger over enemies you're behind (your stab will be a backstab)
      if (me.k === 'rogue' && !me.dn && Math.hypot(v.x - game.lp.x, v.y - game.lp.y) < 150) {
        let d = Math.atan2(game.lp.y - v.y, game.lp.x - v.x) - e.fa;
        while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        if (Math.abs(d) > Math.PI / 2) {
          const top = v.y - (e.t === 'treant' ? 125 : e.t === 'alpha' ? 48 : 34) + Math.sin(t * 6) * 1.5;
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(v.x, top, 0, v.x, top, 10);
          g.addColorStop(0, 'rgba(255,90,90,0.8)'); g.addColorStop(1, 'rgba(255,90,90,0)');
          ctx.fillStyle = g; circle(ctx, v.x, top, 10);
          ctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.translate(v.x, top); ctx.rotate(Math.PI / 2); ctx.drawImage(daggerSprite(), -8, -2.5); ctx.restore();
        }
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
    // players: torch flames, guard shield, torch-to-torch rekindling
    for (const p of snap.ps) {
      const v = game.playerView(p);
      if (!vis(v.x, v.y)) continue;
      const pal = byId(FLAMES, p.f);
      const seed = idSeed(p.id);
      const o = game.charOpts(p, v);
      if (p.dn) {
        const ex = v.x - 12, ey = v.y - 6;
        drawFlame(ctx, ex, ey, 0.05 + p.rv * 0.6 + Math.abs(Math.sin(t * 3 + seed)) * 0.08, p.rv > 0 ? pal : { core: '#ffe0c0', mid: '#ff6a3a', outer: '#a02010' }, t, false, seed);
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
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,190,110,${0.6 + Math.sin(t * 20) * 0.2})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(v.x, v.y - 14, 20, o.aim - 1.05, o.aim + 1.05); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,240,200,0.8)';
        ctx.beginPath(); ctx.arc(v.x, v.y - 14, 22, o.aim - 0.9, o.aim + 0.9); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      if (p.k === 'bowman') {
        // draw-strength ring around the bowman, bright when fully drawn
        const ch = p.id === game.myId ? game.lp.charge : p.ch;
        if (ch > 0) {
          const full = ch >= 0.95;
          ctx.strokeStyle = full ? `rgba(255,240,170,${0.8 + Math.sin(t * 25) * 0.2})` : 'rgba(255,220,150,0.7)';
          ctx.lineWidth = full ? 2 : 1.5;
          ctx.beginPath(); ctx.arc(v.x, v.y - 14, 16, -Math.PI / 2, -Math.PI / 2 + TAU * ch); ctx.stroke();
        }
        if (p.hk > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(255,220,140,${0.4 + Math.sin(t * 10) * 0.2})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(v.x, v.y - 14, 22 + Math.sin(t * 6) * 2, 0, TAU); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (p.k === 'sorcerer') {
        const [sx, sy] = staffTip(v.x, v.y, o);
        const col = p.le === 'fire' ? '255,150,60' : p.le === 'frost' ? '150,220,255' : p.le === 'gale' ? '190,245,210' : '127,224,255';
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.le ? 9 : 5);
        g.addColorStop(0, `rgba(${col},0.95)`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; circle(ctx, sx, sy, p.le ? 9 : 5); ctx.globalCompositeOperation = 'source-over';
      }
      const [tx, ty] = torchPoint(v.x, v.y, o.aim, o.moving, t);
      drawFlame(ctx, tx, ty, p.hp / p.mx, pal, t, !!p.gl, seed);
      // reviving someone: hold your torch out, flame flows to theirs
      const patient = snap.ps.find((q) => q.dn && q.rh === p.id);
      if (patient) {
        const pv = game.playerView(patient);
        const x1 = pv.x - 12, y1 = pv.y - 8;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) {
          const k = ((t * 1.6 + i / 10) % 1);
          const bx = tx + (x1 - tx) * k, by = ty + (y1 - ty) * k - Math.sin(k * Math.PI) * 16 + Math.sin(t * 9 + i) * 2;
          ctx.fillStyle = hexA(i % 3 ? pal.mid : pal.core, 0.9 * Math.sin(k * Math.PI));
          ctx.fillRect(Math.round(bx), Math.round(by), 2, 2);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    this.drawParticles(ctx, game.particles, true);
    // attack & ability effects
    for (const e of game.effects) {
      const p = (t - e.t0) / e.life;
      if (p < 0 || p > 1) continue;
      if (e.k === 'arc' || e.k === 'counter' || e.k === 'staff' || e.k === 'stab' || e.k === 'spin') {
        const v = game.viewFor(e.id);
        const span = e.k === 'spin' ? Math.PI : e.k === 'stab' ? 0.45 : e.k === 'counter' ? 1.4 : e.k === 'staff' ? 0.95 : e.heavy ? 1.6 : 1.25;
        const R = e.k === 'spin' ? (e.r || 50) : e.k === 'stab' ? 40 : e.k === 'counter' ? 54 : e.k === 'staff' ? 34 : e.heavy ? 46 : 40;
        const a0 = e.aim - span, a1 = a0 + span * 2 * easeOut(Math.min(1, p * 1.7));
        const tail = Math.max(a0, a1 - 1.6);
        const col = e.k === 'spin' || e.k === 'stab' ? [255, 150, 170] : e.k === 'counter' ? [255, 150, 60] : e.k === 'staff' ? [140, 230, 255] : e.heavy ? [255, 190, 100] : [255, 245, 225];
        ctx.globalCompositeOperation = 'lighter';
        // filled crescent: thick at the blade, thin at the tail
        const steps = 14;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) { const a = tail + (a1 - tail) * (i / steps); ctx.lineTo(v.x + Math.cos(a) * R, v.y - 12 + Math.sin(a) * R); }
        for (let i = steps; i >= 0; i--) { const a = tail + (a1 - tail) * (i / steps); const th = (e.heavy || e.k === 'counter' ? 12 : 8) * (i / steps); ctx.lineTo(v.x + Math.cos(a) * (R - th), v.y - 12 + Math.sin(a) * (R - th)); }
        ctx.closePath();
        ctx.fillStyle = rgba(col, 0.75 * (1 - p));
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
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
        ctx.lineWidth = 4 * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, r, r * 0.65, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.k === 'spark') {
        // 4-point star burst where a hit lands
        const s = e.size * (0.5 + easeOut(p));
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${e.col},${1 - p})`;
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rot);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, rr = i % 2 ? s * 0.25 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      } else if (e.k === 'cloud') {
        ctx.fillStyle = `rgba(235,240,245,${0.5 * (1 - p)})`;
        for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + e.seed; circle(ctx, e.x + Math.cos(a) * e.r * 0.6 * easeOut(p), e.y - 6 + Math.sin(a) * e.r * 0.35 * easeOut(p), 10 + 10 * p); }
      } else if (e.k === 'ping') {
        // a map ping: a pin dropping in with a pulsing ring
        const pin = PINGS.find((q) => q.id === e.v) || PINGS[0];
        const drop = Math.max(0, 1 - (t - e.t0) / 0.2) * 20;
        ctx.strokeStyle = pin.col; ctx.globalAlpha = Math.min(1, (1 - p) * 3);
        for (let i = 0; i < 2; i++) { const k = ((t - e.t0) * 1.2 + i * 0.5) % 1; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(e.x, e.y, 6 + k * 22, (6 + k * 22) * 0.5, 0, 0, TAU); ctx.stroke(); }
        ctx.drawImage(pingSprite(e.v), Math.round(e.x - 6), Math.round(e.y - 16 - drop));
        ctx.globalAlpha = 1;
      } else if (e.k === 'emoji') {
        const v = game.viewFor(e.id);
        const k = (t - e.t0) / e.life;
        const pop = k < 0.12 ? 0.6 + k * 3.3 : 1;
        const img = emojiSprite(e.v);
        ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        ctx.save(); ctx.translate(Math.round(v.x), Math.round(v.y - 50 - k * 10)); ctx.scale(pop, pop); ctx.drawImage(img, -6, -6); ctx.restore();
        ctx.globalAlpha = 1;
      } else if (e.k === 'blink') {
        // Shadowstep / Thousand Cuts: a smoky purple streak between two points
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(180,140,255,${0.8 * (1 - p)})`; ctx.lineWidth = 3 * (1 - p) + 1;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (e.k === 'slash') {
        // a quick X-shaped cut
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,120,140,${1 - p})`; ctx.lineWidth = 2;
        const s = 10 + p * 6;
        ctx.beginPath(); ctx.moveTo(e.x - s, e.y - s); ctx.lineTo(e.x + s, e.y + s); ctx.moveTo(e.x + s, e.y - s); ctx.lineTo(e.x - s, e.y + s); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (e.k === 'gust') {
        const v = game.viewFor(e.id);
        ctx.strokeStyle = `rgba(200,250,220,${0.8 * (1 - p)})`; ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
          const a = e.aim + i * 0.3, r0 = 12 + p * 70;
          ctx.beginPath(); ctx.arc(v.x, v.y - 12, r0, a - 0.15, a + 0.15); ctx.stroke();
        }
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
    if (world.readyZone) { const z = world.readyZone; const [x, y] = toS(z.x + z.w / 2, z.y + 4); text(ctx, 'Into the Wilds', x, y, { size: 15, font: TITLE, color: '#ffe2b0' }); }
    if (world.exit && vis(world.exit.x, world.exit.y, 100)) { const [x, y] = toS(world.exit.x, world.exit.y - 64); text(ctx, snap.go ? 'Heartwood Gate (open)' : 'Heartwood Gate (sealed)', x, y, { size: 13, font: TITLE, color: snap.go ? '#d6ffc8' : '#ffb0a0' }); }
    world.shrines.forEach((s, i) => {
      if (snap.sh[i] || Math.hypot(s.x - game.lp.x, s.y - game.lp.y) > 60) return;
      const [x, y] = toS(s.x, s.y - 40);
      text(ctx, `[${game.keyLabel('interact')}] Light the Heartwood (+Wildfire)`, x, y, { size: 12, color: '#ffd59a' });
    });
    // practice dummies: damage-per-second readout
    for (const e of snap.es) {
      if (e.t !== 'dummy') continue;
      const v = game.views.get('e' + e.id);
      if (!v || !vis(v.x, v.y)) continue;
      const [x, y] = toS(v.x, v.y - 46);
      text(ctx, `${e.dps || 0} dmg/sec`, x, y, { size: 12, color: e.dps ? '#ffe6b0' : '#9aa3ad' });
      if (e.kd !== 'plain') { const [x2, y2] = toS(v.x, v.y + 10); text(ctx, e.kd === 'hitter' ? 'swings back' : 'always faces you', x2, y2, { size: 10, weight: 600, color: '#c9d6cd' }); }
    }
    for (const p of world.props) {
      if (p.type !== 'sign' || !vis(p.x, p.y)) continue;
      const [x, y] = toS(p.x, p.y - 48);
      text(ctx, p.text, x, y, { size: 13, font: TITLE, color: '#ffe2b0' });
    }
    for (const e of snap.es) {
      const v = game.views.get('e' + e.id);
      if (!v || e.t === 'treant' || e.t === 'dummy' || e.hp >= e.mx || !vis(v.x, v.y)) continue;
      const S = e.t === 'alpha' ? 1.5 : 1;
      const [x, y] = toS(v.x, v.y - 30 * S);
      const w = 30 * S * Z / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
      ctx.fillStyle = e.el ? '#ff9a3c' : '#d9473a'; ctx.fillRect(x - w / 2, y, w * Math.max(0, e.hp / e.mx), 3);
    }
    for (const p of snap.ps) {
      const v = game.playerView(p);
      if (!vis(v.x, v.y)) continue;
      if (p.id !== game.myId && !p.dn) {
        const [x, y] = toS(v.x, v.y - (p.h === 'witch' || p.h === 'antlers' ? 50 : 44));
        if (prefs.names) text(ctx, p.u, x, y, { size: 12, color: '#f4f1ea' });
        // their flame (health) bar, so you can see who needs help
        const w = 34, by = y + 9, ratio = Math.max(0, p.hp / p.mx);
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(Math.round(x - w / 2 - 1), Math.round(by - 1), w + 2, 6);
        ctx.fillStyle = ratio < 0.35 ? '#ff5a3a' : byId(FLAMES, p.f).mid;
        ctx.fillRect(Math.round(x - w / 2), Math.round(by), Math.round(w * ratio), 4);
      }
      if (p.dn) {
        const [x, y] = toS(v.x, v.y - 30);
        text(ctx, p.rv > 0 ? 'Rekindling…' : p.id === game.myId ? 'Waiting to be rekindled…' : 'Stand close to rekindle', x, y, { size: 11, color: p.rv > 0 ? '#ffe0a0' : '#ffb59a' });
      }
    }
    for (const e of game.effects) {
      if (e.k !== 'num' || !prefs.dmgNums) continue;
      const p = (t - e.t0) / e.life;
      if (p < 0 || p > 1) continue;
      const [x, y] = toS(e.x + e.dx * p * 10, e.y - p * 18);
      const pop = p < 0.15 ? 1 + (0.15 - p) * 4 : 1;
      text(ctx, e.text, x, y, { size: Math.round((e.big ? 18 : 14) * pop), color: e.color, alpha: 1 - p * p });
    }
    for (const e of game.effects) {
      if (e.k !== 'ping') continue;
      const p = (t - e.t0) / e.life;
      const pin = PINGS.find((q) => q.id === e.v) || PINGS[0];
      const [x, y] = toS(e.x, e.y - 24);
      text(ctx, pin.label, x, y, { size: 13, color: pin.col, alpha: Math.min(1, (1 - p) * 3) });
    }
    if (game.prompt) {
      const pr = game.prompt;
      const [x, y] = toS(pr.x, pr.y);
      text(ctx, pr.text, x, y - 14, { size: 13, color: '#ffe6b0' });
      if (pr.sub) text(ctx, pr.sub, x, y + 4, { size: 11, weight: 700, color: '#c9d6cd' });
    }
  }

  drawScreenFx(ctx, game, snap, me, W, H, t) {
    // stage transitions: a warm flash as you step through the gate...
    if (game.lightFlash) {
      const p = (t - game.lightFlash.t0) / 1.6;
      if (p >= 1) game.lightFlash = null;
      else {
        const a = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, `rgba(255,248,220,${a})`); g.addColorStop(1, `rgba(255,200,120,${a * 0.85})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }
    // ...and every new area fades in out of the darkness, with its name
    if (game.fadeIn) {
      const p = (t - game.fadeIn.t0) / 2.6;
      if (p >= 1) game.fadeIn = null;
      else {
        const dark = p < 0.25 ? 1 : Math.max(0, 1 - (p - 0.25) / 0.6);
        ctx.fillStyle = `rgba(4,6,10,${dark})`; ctx.fillRect(0, 0, W, H);
        const name = game.fadeIn.kind === 'lobby' ? 'The Campfire' : game.fadeIn.kind === 'arena' ? 'The Heart of the Wood' : `Thornwood ${['I', 'II', 'III'][(snap.stg || 1) - 1] || ''}`;
        const sub = game.fadeIn.kind === 'lobby' ? 'Home again' : game.fadeIn.kind === 'arena' ? 'The Elder Treant stirs' : snap.stg === 1 ? 'Keep your flame alive' : 'Deeper into the wilds';
        const ta = p < 0.15 ? p / 0.15 : p > 0.7 ? Math.max(0, 1 - (p - 0.7) / 0.3) : 1;
        text(ctx, name, W / 2, H * 0.42, { size: 40, font: TITLE, color: '#ffe6b0', alpha: ta });
        text(ctx, sub, W / 2, H * 0.42 + 38, { size: 17, color: '#d8e2da', alpha: ta * 0.9 });
      }
    }
    const ratio = me.hp / me.mx;
    if (snap.sc !== 'lobby' && !me.dn && ratio < 0.35) {
      const a = ((0.35 - ratio) / 0.35) * (0.55 + Math.sin(t * 5) * 0.15);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(60,0,0,0)'); g.addColorStop(1, `rgba(70,0,10,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (game.hurtFlash > 0) { ctx.fillStyle = `rgba(255,40,30,${game.hurtFlash * 0.4})`; ctx.fillRect(0, 0, W, H); }
    if (game.flash > 0) { ctx.fillStyle = `rgba(255,200,120,${game.flash * 0.35})`; ctx.fillRect(0, 0, W, H); }
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
