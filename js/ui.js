// =============================================================
//  UI panels: toasts, wardrobe, skill tree, boon picker,
//  settings and a yes/no dialog. (HTML in index.html.)
// =============================================================
import { CLOAKS, HATS, FLAMES, BOONS, TREES, CLASSES, CAP_REQUIREMENT, byId, canBuy, branchSpent } from './data.js';
import { drawPreview } from './render.js';
import { audio } from './audio.js';
import { prefs, savePrefs, KEY_ACTIONS, DEFAULT_KEYS, keyName, getRoomPref } from './prefs.js';
import { KITS } from './hud.js';

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
    const kbHead = document.createElement('h3'); kbHead.textContent = 'Keyboard & mouse';
    c.append(kbHead, list);
    c.append(button('Reset keys to default', () => { prefs.keys = { ...DEFAULT_KEYS }; savePrefs(); this.fill(); }));
    // controller buttons get their own section
    const padHead = document.createElement('h3'); padHead.textContent = 'Controller';
    const pad = document.createElement('div');
    pad.className = 'binds';
    for (const [btn, what] of [['Left stick', 'Move'], ['Right stick', 'Aim'], ['RT', 'Attack'], ['LT', 'Skill 2 (Guard / Gale / Rain / Shadowstep)'], ['X', 'Skill 1 (Quake / Fire / Mark / Smoke)'], ['LB', 'Skill 3 (Frost)'], ['RB', 'Wildfire ultimate'], ['A', 'Dash'], ['Y', 'Interact'], ['View', 'Skill tree'], ['Start', 'Pause'], ['B', 'Back / close']]) {
      const r = document.createElement('div');
      r.className = 'bind';
      const l = document.createElement('span'); l.textContent = what;
      const k = document.createElement('kbd'); k.textContent = btn;
      r.append(l, k);
      pad.appendChild(r);
    }
    c.append(padHead, pad);
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
    $('#vote-go').onclick = () => game.vote('go');
    $('#vote-camp').onclick = async () => {
      if (await confirmDialog('Return to camp? This ends the run for the whole party.', 'Return to camp')) game.vote('camp');
    };
  }
  refresh(snap, me) {
    const resting = snap.st === 'rest';
    this.el.classList.toggle('hidden', !resting);
    if (!resting) { this.lastKey = ''; return; }
    const nextIsBoss = snap.stg >= 3;
    const ready = snap.ps.filter((p) => p.vt === 'go').length;
    $('#boons-wait').textContent = `${ready}/${snap.ps.length} ready to continue · carrying on automatically in ${snap.stt}s`;
    $('#boons-pts').textContent = me.pts ? `You have ${me.pts} skill point${me.pts > 1 ? 's' : ''} to spend.` : '';
    // after picking a boon: continue into the next forest (or the boss), or head back to camp
    const showVote = !me.bc;
    $('#vote-row').classList.toggle('hidden', !showVote);
    $('#vote-go').textContent = me.vt === 'go' ? 'Waiting for the party…' : nextIsBoss ? 'Face the Elder Treant' : 'Continue into the forest';
    $('#vote-go').disabled = me.vt === 'go';
    const key = JSON.stringify(me.bc);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const cards = $('#boon-cards');
    cards.innerHTML = '';
    $('#boons-title').textContent = me.bc ? 'Choose a boon' : nextIsBoss ? 'The heart of the wood awaits' : 'Continue?';
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

// ---------------------------------------------------------- controls screen (H) and class tips
// Only your class's skills are listed, with the same icons as your skill buttons.
const SKILL_TEXT = {
  warrior: { atk: 'Sword combo. Every 3rd swing is heavy (and slower to recover).', guard: 'Hold to block hits from the front, let go to counter-slash.', quake: 'Burn some flame to slam the ground around you.', dash: 'Dash. The start of a dash dodges attacks.', ult: 'Pyre Cleave: a giant flaming sweep that leaves fire behind (needs full Wildfire).' },
  sorcerer: { atk: 'Staff swing: weak, but pushes enemies away.', gale: 'Gale: a blast of wind that knocks enemies back.', fire: 'Fire: an exploding fireball.', frost: 'Frost: slowing ice shards.', dash: 'Dash.', ult: 'Starfall: meteors hunt the monsters where you aim (needs full Wildfire).' },
  bowman: { atk: 'Hold to draw, let go to shoot. Longer draw = stronger, piercing arrow, but a longer wait. Right-click cancels a draw.', mark: 'Mark the enemy you aim at: the whole party deals +20% damage to it.', rain: 'Rain of Arrows where you aim.', dash: 'Dash.', ult: 'Hawk Eye: every shot is full strength and seeks enemies (needs full Wildfire).' },
  rogue: { atk: 'Quick stabs. Every 4th is a spin that hits all around you.', smoke: 'Smoke Bomb: enemies inside crawl and can\'t see anyone. You move faster in it.', step: 'Shadowstep: teleport behind the enemy you aim at.', dash: 'Dash. Leaves a decoy that enemies chase.', ult: 'Thousand Cuts: slash up to 6 nearby enemies (needs full Wildfire).' },
};
export const CLASS_TRICK = {
  warrior: 'Dark Fury: the lower your flame, the harder you hit.',
  sorcerer: 'Weaving: cast two different spells quickly and they fuse. Fire + Frost = Steam Burst, Fire + Gale = Firestorm, Frost + Gale = Blizzard. Fusing costs extra mana.',
  bowman: 'Draw longer for stronger shots. You walk slower while drawing.',
  rogue: 'Backstab: hits from behind deal double damage. A red dagger shows over enemies you are behind.',
};
const PAD = { strike: 'RT', skill2: 'LT', skill1: 'X', skill3: 'LB', ult: 'RB', dash: 'A', interact: 'Y', tree: 'View', controls: '—', pause: 'Start' };

function fillGuide(box, game, cls) {
  const kit = KITS[cls] || KITS.warrior;
  const text = SKILL_TEXT[cls] || SKILL_TEXT.warrior;
  box.querySelector('.guide-title').textContent = byId(CLASSES, cls).name;
  box.querySelector('.guide-trick').textContent = CLASS_TRICK[cls] || '';
  const list = box.querySelector('.guide-moves');
  list.innerHTML = '';
  const kb = (key) => (key === 'strike' ? (prefs.keys.strike ? `LMB / ${keyName(prefs.keys.strike)}` : 'LMB') : key === 'skill2' ? (prefs.keys.skill2 ? `RMB / ${keyName(prefs.keys.skill2)}` : 'RMB') : keyName(prefs.keys[key]));
  const rows = [...kit.map((k) => ({ icon: k.icon, key: k.key, text: text[k.id] || k.name })),
    { icon: '✋', key: 'interact', text: 'Interact' }, { icon: '🌳', key: 'tree', text: 'Skill tree' }, { icon: '❔', key: 'controls', text: 'Show / hide this screen' }];
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'move';
    row.innerHTML = '<span class="mico"></span><span class="keys"><kbd class="k1"></kbd><kbd class="k2 pad"></kbd></span><span class="mtext"></span>';
    row.querySelector('.mico').textContent = r.icon;
    row.querySelector('.k1').textContent = kb(r.key);
    row.querySelector('.k2').textContent = PAD[r.key] || '—';
    row.querySelector('.mtext').textContent = r.text;
    list.appendChild(row);
  }
}

export class ControlsPanel {
  constructor(game) {
    this.game = game;
    this.el = $('#controls');
    this.open = false;
    this.el.querySelector('[data-close]').onclick = () => this.close();
  }
  toggle(cls) { if (this.open) this.close(); else this.show(cls); }
  show(cls) { this.open = true; fillGuide(this.el, this.game, cls); this.el.classList.remove('hidden'); audio.play('open'); }
  close() { if (!this.open) return; this.open = false; this.el.classList.add('hidden'); audio.play('close'); }
}

// the first time you pick a class, a little card explains it
export function showClassTips(cls, game = null) {
  const key = 'wildwick.tips.' + cls;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* ignore */ }
  const box = $('#tips');
  fillGuide(box, game, cls);
  box.classList.remove('hidden');
  audio.play('open');
  box.querySelector('[data-close]').onclick = () => { box.classList.add('hidden'); audio.play('close'); };
}

// ---------------------------------------------------------- simple panel helper
function makePanel(sel) {
  return {
    open: false,
    game: null,
    el: null,
    toggle(game) { if (this.open) this.close(); else this.show(game); },
    show(game) {
      this.el = this.el || $(sel);
      this.game = game;
      this.open = true;
      this.fill(game);
      this.el.classList.remove('hidden');
      audio.play('open');
    },
    close() { if (!this.open) return; this.open = false; (this.el || $(sel)).classList.add('hidden'); audio.play('close'); },
    fill() {},
  };
}

// ---------------------------------------------------------- pause screen (Esc)
export const pause = makePanel('#pause');
pause.lastKey = '';
pause.show = function (game) {
  this.el = this.el || $('#pause');
  this.game = game || this.game;
  this.open = true;
  this.lastKey = '';
  this.el.classList.remove('hidden');
  audio.play('open');
};
pause.toggle = function (game) { if (this.open) this.close(); else this.show(game); };
pause.refresh = function (snap, me) {
  if (!this.open || !snap) return;
  const g = this.game;
  const code = g.room ? g.room.code : null;
  const key = JSON.stringify([code, snap.ps.map((p) => p.id + p.u + p.k), snap.sc, snap.st, snap.cv, g.isHost, !!g.waitSim]);
  if (key === this.lastKey) return;
  this.lastKey = key;
  $('#pause-solo').classList.toggle('hidden', !g.isSolo());
  $('#pause-room').classList.toggle('hidden', !code);
  $('#pause-code').textContent = code || '';
  // party
  const list = $('#pause-party');
  list.innerHTML = '';
  for (const p of snap.ps) {
    const row = document.createElement('div');
    row.className = 'prow';
    row.innerHTML = '<i class="dot"></i><b></b><span class="muted"></span>';
    row.querySelector('.dot').style.background = byId(CLOAKS, p.c).hex;
    row.querySelector('b').textContent = p.u + (p.id === g.myId ? ' (you)' : '') + (p.id === 'host' ? ' · host' : '');
    row.querySelector('span').textContent = `${p.n} · ${byId(CLASSES, p.k).name}`;
    if (g.isHost && g.room && p.id !== 'host') {
      const k = document.createElement('button');
      k.className = 'gbtn small';
      k.textContent = 'Kick';
      k.onclick = async () => { if (await confirmDialog(`Remove ${p.u} from your camp?`, 'Kick')) g.kick(p.id); };
      row.appendChild(k);
    }
    list.appendChild(row);
  }
  // vote to return to camp (only while out on a run)
  const vote = $('#pause-vote');
  vote.innerHTML = '';
  if (snap.sc !== 'lobby' && snap.st === 'playing' && !g.waitSim) {
    if (!snap.cv) {
      const b = document.createElement('button');
      b.className = 'gbtn';
      b.textContent = snap.ps.length > 1 ? 'Vote to return to camp' : 'Return to camp';
      b.onclick = () => g.voteCamp(true);
      vote.appendChild(b);
    } else {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = `Return to camp? ${snap.cv.n}/${snap.cv.of} agreed · ${snap.cv.t}s left`;
      vote.appendChild(p);
      if (!snap.cv.ids.includes(g.myId)) {
        const y = document.createElement('button'); y.className = 'gbtn primary small'; y.textContent = 'Yes, go back'; y.onclick = () => g.voteCamp(true);
        const n = document.createElement('button'); n.className = 'gbtn small'; n.textContent = 'No, keep going'; n.onclick = () => g.voteCamp(false);
        vote.append(y, n);
      }
    }
  }
  // leaving
  const leave = $('#pause-leave');
  if (!g.isHost) { leave.textContent = 'Leave to my camp'; leave.classList.remove('hidden'); leave.onclick = () => { pause.close(); g.leave(''); }; }
  else if (g.room) { leave.textContent = 'Close my camp to friends'; leave.classList.remove('hidden'); leave.onclick = async () => { if (await confirmDialog('Close your camp? Friends will be sent back to their own camps.', 'Close camp')) { g.closeRoom(); pause.lastKey = ''; } }; }
  else leave.classList.add('hidden');
};
// buttons that never change
document.addEventListener('DOMContentLoaded', () => {});
$('#pause-resume').onclick = () => pause.close();
$('#pause-settings').onclick = () => settings.show(true);
$('#pause-controls').onclick = () => { pause.close(); pause.game && pause.game.controls.show(pause.game.cls); };
$('#pause-copy').onclick = async () => {
  const code = $('#pause-code').textContent;
  try { await navigator.clipboard.writeText(code); toast('Room code copied. Paste it in Discord!'); } catch { toast('The room code is ' + code); }
};

// ---------------------------------------------------------- the campfire: host or join
export const campPanel = makePanel('#camp');
campPanel.fill = function (game) {
  const host = game.isHost && !game.waitSim;
  $('#camp-solo').classList.toggle('hidden', !(host && !game.room));
  $('#camp-open').classList.toggle('hidden', !(host && game.room));
  $('#camp-guest').classList.toggle('hidden', host);
  $('#camp-error').textContent = '';
  if (host && game.room) $('#camp-code').textContent = game.room.code;
  if (!host) $('#camp-guest-text').textContent = game.waitSim ? 'The party is out in the forest. You\'re waiting at their camp until they return.' : 'You\'re at a friend\'s camp.';
  const r = getRoomPref();
  $('#camp-host-code').value = r.custom || r.last || '';
  $('#camp-use-code').checked = r.use !== false && !!(r.custom || r.last);
};
$('#camp-host-code').addEventListener('input', () => { const el = $('#camp-host-code'); el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); if (el.value) $('#camp-use-code').checked = true; });
$('#camp-join-code').addEventListener('input', () => { const el = $('#camp-join-code'); el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
async function busyBtn(btn, fn) {
  const label = btn.textContent; btn.disabled = true; btn.textContent = '…';
  try { await fn(); } catch (err) { $('#camp-error').textContent = err.message; } finally { btn.disabled = false; btn.textContent = label; }
}
$('#camp-host').onclick = () => busyBtn($('#camp-host'), async () => {
  const g = campPanel.game;
  const code = $('#camp-host-code').value;
  await g.hooks.host($('#camp-use-code').checked && code.length === 5 ? code : null, $('#camp-use-code').checked, code);
  campPanel.fill(g);
});
$('#camp-join').onclick = () => busyBtn($('#camp-join'), async () => {
  const code = $('#camp-join-code').value;
  if (code.length !== 5) throw new Error('Room codes are 5 letters or numbers.');
  await campPanel.game.hooks.join(code);
});
$('#camp-close').onclick = async () => { if (await confirmDialog('Close your camp? Friends will be sent back to their own camps.', 'Close camp')) { campPanel.game.closeRoom(); campPanel.fill(campPanel.game); } };
$('#camp-copy').onclick = async () => { const c = $('#camp-code').textContent; try { await navigator.clipboard.writeText(c); toast('Room code copied. Paste it in Discord!'); } catch { toast('The room code is ' + c); } };
$('#camp-leave').onclick = () => { const g = campPanel.game; campPanel.close(); g.leave(''); };
$('#camp [data-close]').onclick = () => campPanel.close();

// ---------------------------------------------------------- signpost: change character / log out
export const signPanel = makePanel('#sign');
$('#sign-chars').onclick = () => { const g = signPanel.game; signPanel.close(); g.hooks.toChars(); };
$('#sign-logout').onclick = async () => { const g = signPanel.game; if (await confirmDialog('Log out of Wildwick?', 'Log out')) { signPanel.close(); g.hooks.logout(); } };
$('#sign [data-close]').onclick = () => signPanel.close();

// ---------------------------------------------------------- stats board
export const boardPanel = makePanel('#board');
boardPanel.fill = function (game) {
  const st = game.char.stats || { runs: 0, kills: 0, bosses: 0, best: 0 };
  const best = st.best >= 4 ? 'Defeated the Elder Treant' : st.best > 0 ? `Reached Thornwood ${['I', 'II', 'III'][st.best - 1]}` : 'No runs yet';
  $('#board-name').textContent = `${game.char.name} the ${byId(CLASSES, game.char.cls).name}`;
  $('#board-rows').innerHTML = '';
  for (const [k, v] of [['Runs', st.runs], ['Monsters defeated', st.kills], ['Elder Treants felled', st.bosses], ['Best run', best]]) {
    const row = document.createElement('div');
    row.className = 'brow';
    row.innerHTML = '<span></span><b></b>';
    row.querySelector('span').textContent = k;
    row.querySelector('b').textContent = v;
    $('#board-rows').appendChild(row);
  }
};
$('#board [data-close]').onclick = () => boardPanel.close();
