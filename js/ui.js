// =============================================================
//  UI panels: toasts, wardrobe, skill tree, boon picker,
//  settings and a yes/no dialog. (HTML in index.html.)
// =============================================================
import { CLOAKS, HATS, FLAMES, BOONS, TREES, CAP_REQUIREMENT, byId, canBuy, branchSpent } from './data.js';
import { drawPreview } from './render.js';
import { audio } from './audio.js';
import { prefs, savePrefs, KEY_ACTIONS, DEFAULT_KEYS, keyName } from './prefs.js';

const $ = (s) => document.querySelector(s);

export function toast(msg, ms = 3500) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast glass';
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), ms - 400);
  setTimeout(() => el.remove(), ms);
}

// A glass yes/no box. Resolves true / false.
export function confirmDialog(message, yes = 'Yes', no = 'Cancel') {
  return new Promise((resolve) => {
    const box = $('#confirm');
    box.querySelector('p').textContent = message;
    const y = box.querySelector('[data-yes]'), n = box.querySelector('[data-no]');
    y.textContent = yes; n.textContent = no;
    box.classList.remove('hidden');
    const done = (v) => { box.classList.add('hidden'); y.onclick = n.onclick = null; resolve(v); };
    y.onclick = () => done(true);
    n.onclick = () => done(false);
  });
}

// ---------------------------------------------------------- settings
export const settings = {
  open: false,
  onLeave: null,
  roomCode: null,
  tab: 'audio',
  show(inGame) {
    this.open = true;
    $('#settings').classList.remove('hidden');
    $('#btn-leave').classList.toggle('hidden', !inGame);
    $('#settings-room').classList.toggle('hidden', !this.roomCode);
    $('#settings-code').textContent = this.roomCode || '';
    for (const k of ['master', 'music', 'sfx', 'amb', 'ui']) {
      const el = $(`#vol-${k}`);
      el.value = Math.round(audio.vol[k] * 100);
      el.nextElementSibling.textContent = el.value + '%';
    }
    this.fill();
    this.setTab(this.tab);
    audio.play('open');
  },
  setTab(tab) {
    this.tab = tab;
    document.querySelectorAll('#settings .tab').forEach((b) => b.classList.toggle('selected', b.dataset.tab === tab));
    document.querySelectorAll('#settings .tabpage').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== tab));
  },
  // Video / Gameplay / Controls controls are built from the saved settings
  fill() {
    const v = $('#page-video');
    v.innerHTML = '';
    v.append(
      slider('Brightness', Math.round(prefs.brightness * 100), 50, 150, (x) => { prefs.brightness = x / 100; }),
      choice('Zoom', [['auto', 'Auto'], ['1', '1×'], ['2', '2×'], ['3', '3×'], ['4', '4×']], String(prefs.zoom), (x) => { prefs.zoom = x === 'auto' ? 'auto' : Number(x); }),
      slider('Screen shake', Math.round(prefs.shake * 100), 0, 100, (x) => { prefs.shake = x / 100; }),
      choice('Particles', [['high', 'Lots'], ['low', 'Fewer']], prefs.particles, (x) => { prefs.particles = x; }),
      button('Fullscreen', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }),
    );
    const g = $('#page-gameplay');
    g.innerHTML = '';
    g.append(
      toggle('Damage numbers', prefs.dmgNums, (x) => { prefs.dmgNums = x; }),
      toggle('Names above heads', prefs.names, (x) => { prefs.names = x; }),
      toggle('Controls hint at the campfire', prefs.hint, (x) => { prefs.hint = x; const h = $('#help'); if (h && !x) h.classList.add('hidden'); }),
      toggle('Colour-blind friendly warnings (blue instead of red)', prefs.cbSafe, (x) => { prefs.cbSafe = x; }),
    );
    const c = $('#page-controls');
    c.innerHTML = '';
    c.append(toggle('Tap to block instead of hold (Warrior)', prefs.guardToggle, (x) => { prefs.guardToggle = x; }));
    const list = document.createElement('div');
    list.className = 'binds';
    for (const a of KEY_ACTIONS) {
      const row = document.createElement('div');
      row.className = 'bind';
      const label = document.createElement('span');
      label.textContent = a.name;
      const b = document.createElement('button');
      b.className = 'gbtn small';
      b.textContent = keyName(prefs.keys[a.id]);
      b.onclick = () => {
        b.textContent = 'Press a key…';
        window.__rebinding = true;
        const onKey = (e) => {
          e.preventDefault();
          removeEventListener('keydown', onKey, true);
          setTimeout(() => { window.__rebinding = false; }, 0);
          if (e.code !== 'Escape') {
            if (e.code === 'Backspace' || e.code === 'Delete') prefs.keys[a.id] = a.id === 'strike' || a.id === 'skill2' ? '' : prefs.keys[a.id];
            else prefs.keys[a.id] = e.code;
            savePrefs();
          }
          b.textContent = keyName(prefs.keys[a.id]);
        };
        addEventListener('keydown', onKey, true);
      };
      row.append(label, b);
      list.appendChild(row);
    }
    c.appendChild(list);
    c.append(button('Reset keys to default', () => { prefs.keys = { ...DEFAULT_KEYS }; savePrefs(); this.fill(); }));
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Controller: left stick move · right stick aim · RT strike · LT block/Gale · X Quake/Fire · LB Frost · RB ultimate · A dash · Y interact · View skill tree · Start settings.';
    c.appendChild(note);
  },
  close() {
    if (!this.open) return;
    this.open = false;
    $('#settings').classList.add('hidden');
    audio.play('close');
  },
  toggle(inGame) { if (this.open) this.close(); else this.show(inGame); },
};
for (const k of ['master', 'music', 'sfx', 'amb', 'ui']) {
  const el = $(`#vol-${k}`);
  el.addEventListener('input', () => { audio.setVolume(k, el.value / 100); el.nextElementSibling.textContent = el.value + '%'; });
  el.addEventListener('change', () => audio.play(k === 'ui' ? 'click' : 'ember'));
}
$('#settings [data-close]').onclick = () => settings.close();
document.querySelectorAll('#settings .tab').forEach((b) => { b.onclick = () => settings.setTab(b.dataset.tab); });
$('#settings-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(settings.roomCode); toast('Room code copied. Paste it in Discord!'); }
  catch { toast('The room code is ' + settings.roomCode); }
};

// small builders for settings rows
function row(labelText, control, extra) {
  const r = document.createElement('div');
  r.className = 'slider';
  const l = document.createElement('label');
  l.textContent = labelText;
  r.append(l, control);
  if (extra) r.append(extra);
  return r;
}
function slider(labelText, value, min, max, onChange) {
  const i = document.createElement('input');
  i.type = 'range'; i.min = min; i.max = max; i.value = value;
  const s = document.createElement('span');
  s.textContent = value + '%';
  i.oninput = () => { s.textContent = i.value + '%'; onChange(Number(i.value)); savePrefs(); };
  return row(labelText, i, s);
}
function choice(labelText, options, value, onChange) {
  const box = document.createElement('div');
  box.className = 'choices';
  for (const [v, name] of options) {
    const b = document.createElement('button');
    b.className = 'gbtn small' + (v === value ? ' selected' : '');
    b.textContent = name;
    b.onclick = () => { box.querySelectorAll('button').forEach((x) => x.classList.remove('selected')); b.classList.add('selected'); onChange(v); savePrefs(); };
    box.appendChild(b);
  }
  return row(labelText, box);
}
function toggle(labelText, value, onChange) {
  const r = document.createElement('label');
  r.className = 'toggle';
  const i = document.createElement('input');
  i.type = 'checkbox'; i.checked = value;
  i.onchange = () => { onChange(i.checked); savePrefs(); };
  const s = document.createElement('span');
  s.textContent = labelText;
  r.append(i, s);
  return r;
}
function button(text, onClick) {
  const b = document.createElement('button');
  b.className = 'gbtn small block-ish';
  b.textContent = text;
  b.onclick = onClick;
  return b;
}
$('#btn-leave').onclick = async () => {
  if (await confirmDialog('Leave the game? If you are the host, this closes the room for everyone.', 'Leave')) {
    settings.close();
    if (settings.onLeave) settings.onLeave();
  }
};

// ---------------------------------------------------------- wardrobe
export class Wardrobe {
  constructor(game) {
    this.game = game;
    this.el = $('#wardrobe');
    this.open = false;
    this.lastKey = '';
    this.el.querySelector('[data-close]').onclick = () => this.close();
  }
  toggle() { if (this.open) this.close(); else this.show(); }
  show() {
    if (!this.game.alive) return;
    this.open = true;
    this.lastKey = '';
    this.el.classList.remove('hidden');
    audio.play('open');
  }
  close() { if (!this.open) return; this.open = false; this.el.classList.add('hidden'); audio.play('close'); }

  refresh(snap) {
    if (!this.open) return;
    const me = snap.ps.find((p) => p.id === this.game.myId);
    if (!me) return;
    const others = snap.ps.filter((p) => p.id !== me.id);
    const key = JSON.stringify([me.c, me.h, me.f, others.map((o) => o.c + o.u)]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    drawPreview($('#wardrobe-preview'), { cloak: me.c, hat: me.h, flame: me.f });
    const cloaks = $('#w-cloaks');
    cloaks.innerHTML = '';
    for (const c of CLOAKS) {
      const owner = others.find((o) => o.c === c.id);
      const b = document.createElement('button');
      b.className = 'swatch' + (me.c === c.id ? ' selected' : '') + (owner ? ' taken' : '');
      b.style.background = c.hex;
      b.title = owner ? `${c.name}, worn by ${owner.u}` : c.name;
      b.disabled = !!owner;
      b.onclick = () => this.game.requestCosmetic('cloak', c.id);
      cloaks.appendChild(b);
    }
    const hats = $('#w-hats');
    hats.innerHTML = '';
    for (const h of HATS) {
      const b = document.createElement('button');
      b.className = 'hat-btn gbtn' + (me.h === h.id ? ' selected' : '');
      const cv = document.createElement('canvas');
      cv.width = 48; cv.height = 52;
      drawPreview(cv, { cloak: me.c, hat: h.id, flame: me.f });
      b.appendChild(cv);
      const label = document.createElement('span');
      label.textContent = h.name;
      b.appendChild(label);
      b.onclick = () => this.game.requestCosmetic('hat', h.id);
      hats.appendChild(b);
    }
    const flames = $('#w-flames');
    flames.innerHTML = '';
    for (const f of FLAMES) {
      const b = document.createElement('button');
      b.className = 'swatch flame' + (me.f === f.id ? ' selected' : '');
      b.style.background = `radial-gradient(circle at 50% 60%, ${f.core}, ${f.mid} 45%, ${f.outer})`;
      b.title = f.name;
      b.onclick = () => this.game.requestCosmetic('flame', f.id);
      flames.appendChild(b);
    }
    $('#w-summary').textContent = `${byId(CLOAKS, me.c).name} cloak · ${byId(HATS, me.h).name} · ${byId(FLAMES, me.f).name} flame`;
  }
}

// ---------------------------------------------------------- skill tree
export class TreePanel {
  constructor(game) {
    this.game = game;
    this.el = $('#tree');
    this.open = false;
    this.lastKey = '';
    this.el.querySelector('[data-close]').onclick = () => this.close();
  }
  toggle() { if (this.open) this.close(); else this.show(); }
  show() { this.open = true; this.lastKey = ''; this.el.classList.remove('hidden'); audio.play('open'); }
  close() { if (!this.open) return; this.open = false; this.el.classList.add('hidden'); audio.play('close'); }

  refresh(me) {
    if (!this.open) return;
    const tree = me.tr || {};
    const key = JSON.stringify([me.k, tree, me.pts]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    $('#tree-title').textContent = me.k === 'sorcerer' ? 'Sorcerer skills' : 'Warrior skills';
    $('#tree-pts').textContent = me.pts === 1 ? '1 point to spend' : `${me.pts} points to spend`;
    const cols = $('#tree-cols');
    cols.innerHTML = '';
    for (const br of TREES[me.k] || TREES.warrior) {
      const col = document.createElement('div');
      col.className = 'tree-col';
      col.style.setProperty('--c', br.color);
      const spent = branchSpent(tree, br);
      col.innerHTML = `<h3></h3><p class="muted small"></p>`;
      col.querySelector('h3').textContent = br.name;
      col.querySelector('p').textContent = br.blurb;
      for (const n of br.nodes) {
        const rank = tree[n.id] || 0;
        const b = document.createElement('button');
        const ok = canBuy(me.k, tree, me.pts, n.id);
        b.className = 'node gbtn' + (rank ? ' owned' : '') + (ok ? ' can' : '') + (n.cap ? ' cap' : '');
        b.disabled = !ok;
        const dots = Array.from({ length: n.max }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
        b.innerHTML = `<strong></strong><span class="dots">${dots}</span><small></small>`;
        b.querySelector('strong').textContent = n.name;
        b.querySelector('small').textContent = n.cap && spent < CAP_REQUIREMENT ? `Unlocks after ${CAP_REQUIREMENT} points in ${br.name}. ${n.desc}` : n.desc;
        b.onclick = () => { this.game.buyNode(n.id); audio.play('boon'); };
        col.appendChild(b);
      }
      cols.appendChild(col);
    }
  }
}

// ---------------------------------------------------------- boon picker (between stages)
export class BoonPanel {
  constructor(game) {
    this.game = game;
    this.el = $('#boons');
    this.lastKey = '';
    this.el.querySelector('[data-tree]').onclick = () => game.tree.toggle();
  }
  refresh(snap, me) {
    const resting = snap.st === 'rest';
    this.el.classList.toggle('hidden', !resting);
    if (!resting) { this.lastKey = ''; return; }
    const picked = snap.ps.filter((p) => !p.bc).length;
    $('#boons-wait').textContent = `${picked}/${snap.ps.length} ready · next forest in ${snap.stt}s`;
    $('#boons-pts').textContent = me.pts ? `You have ${me.pts} skill point${me.pts > 1 ? 's' : ''} to spend.` : '';
    const key = JSON.stringify(me.bc);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const cards = $('#boon-cards');
    cards.innerHTML = '';
    $('#boons-title').textContent = me.bc ? 'Choose a boon' : 'Boon chosen. Waiting for the party…';
    if (!me.bc) return;
    me.bc.forEach((id, i) => {
      const b = byId(BOONS, id);
      const el = document.createElement('button');
      el.className = 'boon gbtn';
      el.innerHTML = `<span class="icon"></span><strong></strong><small></small>`;
      el.querySelector('.icon').textContent = b.icon;
      el.querySelector('strong').textContent = b.name;
      el.querySelector('small').textContent = b.desc;
      el.onclick = () => this.game.pickBoon(i);
      cards.appendChild(el);
    });
  }
}
