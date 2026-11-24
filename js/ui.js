// =============================================================
//  Small UI helpers: toasts and the lobby wardrobe panel.
// =============================================================
import { CLOAKS, HATS, FLAMES, byId } from './data.js';
import { drawPreview } from './render.js';

export function toast(msg, ms = 3500) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms - 400);
  setTimeout(() => el.remove(), ms);
}

export class Wardrobe {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('wardrobe');
    this.open = false;
    this.lastKey = '';
    this.el.querySelector('[data-close]').onclick = () => this.close();
  }
  toggle() { if (this.open) this.close(); else this.show(); }
  show() {
    if (!this.game.alive) return;
    this.open = true; this.lastKey = ''; this.el.classList.remove('hidden'); }
  close() { this.open = false; this.el.classList.add('hidden'); }

  // Rebuild the buttons whenever your look or the party's colours change.
  refresh(snap) {
    if (!this.open) return;
    const me = snap.ps.find((p) => p.id === this.game.myId);
    if (!me) return;
    const others = snap.ps.filter((p) => p.id !== me.id);
    const key = JSON.stringify([me.c, me.h, me.f, others.map((o) => o.c + o.n)]);
    if (key === this.lastKey) return;
    this.lastKey = key;

    drawPreview(this.el.querySelector('#wardrobe-preview'), { cloak: me.c, hat: me.h, flame: me.f });

    const cloaks = this.el.querySelector('#w-cloaks');
    cloaks.innerHTML = '';
    for (const c of CLOAKS) {
      const owner = others.find((o) => o.c === c.id);
      const b = document.createElement('button');
      b.className = 'swatch' + (me.c === c.id ? ' selected' : '') + (owner ? ' taken' : '');
      b.style.background = c.hex;
      b.title = owner ? `${c.name}, worn by ${owner.n}` : c.name;
      b.disabled = !!owner;
      b.onclick = () => this.game.requestCosmetic('cloak', c.id);
      cloaks.appendChild(b);
    }

    const hats = this.el.querySelector('#w-hats');
    hats.innerHTML = '';
    for (const h of HATS) {
      const b = document.createElement('button');
      b.className = 'hat-btn' + (me.h === h.id ? ' selected' : '');
      const cv = document.createElement('canvas');
      cv.width = 54; cv.height = 60;
      drawPreview(cv, { cloak: me.c, hat: h.id, flame: me.f });
      b.appendChild(cv);
      const label = document.createElement('span');
      label.textContent = h.name;
      b.appendChild(label);
      b.onclick = () => this.game.requestCosmetic('hat', h.id);
      hats.appendChild(b);
    }

    const flames = this.el.querySelector('#w-flames');
    flames.innerHTML = '';
    for (const f of FLAMES) {
      const b = document.createElement('button');
      b.className = 'swatch flame' + (me.f === f.id ? ' selected' : '');
      b.style.background = `radial-gradient(circle at 50% 60%, ${f.core}, ${f.mid} 45%, ${f.outer})`;
      b.title = f.name;
      b.onclick = () => this.game.requestCosmetic('flame', f.id);
      flames.appendChild(b);
    }
    this.el.querySelector('#w-summary').textContent =
      `${byId(CLOAKS, me.c).name} cloak · ${byId(HATS, me.h).name} · ${byId(FLAMES, me.f).name} flame`;
  }
}
