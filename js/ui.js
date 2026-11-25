// =============================================================
//  UI panels: toasts, wardrobe, skill tree, boon picker,
//  settings and a yes/no dialog. (HTML in index.html.)
// =============================================================
import { CLOAKS, HATS, FLAMES, BOONS, TREES, CLASSES, CAP_REQUIREMENT, byId, canBuy, branchSpent } from './data.js';
import { drawPreview } from './render.js';
import { audio } from './audio.js';
import { prefs, savePrefs, KEY_ACTIONS, DEFAULT_KEYS, keyName, getRoomPref, ABILITY_KEYS, keysFor, activeKeys } from './prefs.js';
import { KITS, iconCanvas } from './hud.js';
import { skillIconName, PINGS, EMOJIS, pingSprite, emojiSprite } from './sprites.js';
import { MAX_LEVEL, SLOTS, REBIRTHS, REBIRTH_EVERY, PRESTIGE, SHOP, MODES, FISH, RARITY, todayKey } from './progress.js';

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
    // one rebindable key: read() gives the current key, write(code) saves a new one
    const bindRow = (labelText, read, write, clearable) => {
      const row = document.createElement('div');
      row.className = 'bind';
      const label = document.createElement('span');
      label.textContent = labelText;
      const b = document.createElement('button');
      b.className = 'gbtn small';
      b.textContent = keyName(read());
      b.onclick = () => {
        b.textContent = 'Press a key…';
        window.__rebinding = true;
        const onKey = (e) => {
          e.preventDefault();
          removeEventListener('keydown', onKey, true);
          setTimeout(() => { window.__rebinding = false; }, 0);
          if (e.code !== 'Escape') {
            if (e.code === 'Backspace' || e.code === 'Delete') { if (clearable) write(''); }
            else write(e.code);
            savePrefs();
          }
          b.textContent = keyName(read());
        };
        addEventListener('keydown', onKey, true);
      };
      row.append(label, b);
      return row;
    };
    // general controls (the same for every class)
    const genHead = document.createElement('h3'); genHead.textContent = 'General controls';
    const gen = document.createElement('div');
    gen.className = 'binds';
    for (const a of KEY_ACTIONS) {
      if (ABILITY_KEYS.includes(a.id)) continue;
      gen.appendChild(bindRow(a.name, () => prefs.keys[a.id], (code) => { prefs.keys[a.id] = code; }, false));
    }
    c.append(genHead, gen);
    // abilities: pick a class from the dropdown, then change that class's keys
    const abHead = document.createElement('h3'); abHead.textContent = 'Ability keys';
    const pick = document.createElement('select');
    pick.className = 'clspick';
    for (const cl of CLASSES.filter((x) => x.available)) { const o = document.createElement('option'); o.value = cl.id; o.textContent = cl.name; pick.appendChild(o); }
    this.keyCls = this.keyCls || (pause.game && pause.game.cls) || 'warrior';
    pick.value = this.keyCls;
    const ab = document.createElement('div');
    ab.className = 'binds';
    const fillAbilities = () => {
      const cls = pick.value;
      this.keyCls = cls;
      ab.innerHTML = '';
      const kit = KITS[cls] || KITS.warrior;
      for (const id of ABILITY_KEYS) {
        const k = kit.find((x) => x.key === id);
        if (!k) continue; // e.g. no Q skill
        const name = k.name.replace(/\s*\(.*\)$/, '');
        const extra = id === 'strike' ? ' (also left click)' : id === 'skill2' ? ' (also right click)' : '';
        ab.appendChild(bindRow(name + extra, () => keysFor(cls)[id], (code) => { prefs.classKeys[cls] = { ...(prefs.classKeys[cls] || {}), [id]: code }; }, id === 'strike' || id === 'skill2'));
      }
    };
    pick.onchange = fillAbilities;
    fillAbilities();
    c.append(abHead, row('Class', pick), ab);
    c.append(button('Reset keys to default', () => { prefs.keys = { ...DEFAULT_KEYS }; prefs.classKeys = {}; savePrefs(); this.fill(); }));
    // controller buttons get their own section
    const padHead = document.createElement('h3'); padHead.textContent = 'Controller';
    const pad = document.createElement('div');
    pad.className = 'binds';
    for (const [btn, what] of [['Left stick', 'Move'], ['Right stick', 'Aim'], ['RT', 'Attack'], ['LT', 'Skill 2 (Guard / Gale / Rain / Shadowstep)'], ['X', 'Skill 1 (Quake / Fireball / Mark / Smoke)'], ['LB', 'Skill 3 (Frostbite)'], ['RB', 'Wildfire Ability'], ['A', 'Dash'], ['Y', 'Interact'], ['View', 'Skill tree'], ['Start', 'Pause'], ['B', 'Back / close']]) {
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
// Tab shows it (just to look). At the Skilltree in camp you can spend points,
// use Reclaim Seeds, and prestige once the class is level 30.
export class TreePanel {
  constructor(game) {
    this.game = game;
    this.el = $('#tree');
    this.open = false;
    this.edit = false;
    this.lastKey = '';
    this.pick = null;   // prestige: which ability
    this.reb = null;    // rebirth: which ultimate upgrade
    this.el.querySelector('[data-close]').onclick = () => this.close();
  }
  toggle() { if (this.open) this.close(); else this.show(); }
  show() { this.open = true; this.lastKey = ''; this.el.classList.remove('hidden'); audio.play('open'); }
  close() { if (!this.open) return; this.open = false; this.pick = null; this.reb = null; this.el.classList.add('hidden'); audio.play('close'); }

  refresh(me) {
    if (!this.open || !me.lv) return;
    const tree = me.tr || {};
    const edit = this.edit;
    const seeds = (me.it && me.it.seed) || 0;
    const key = JSON.stringify([me.k, tree, me.pts, me.lv, Math.floor((me.xp || 0) / 5), me.np, me.pr, me.rb, seeds, edit, this.pick, this.reb]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const cname = byId(CLASSES, me.k).name;
    const mastered = me.lv >= MAX_LEVEL;
    $('#tree-title').textContent = `${cname} · level ${me.lv}${mastered ? ' · mastered' : ''}${me.np ? ` · ignition ${me.np}` : ''}`;
    $('#tree-pts').textContent = me.pts === 1 ? '1 point' : `${me.pts} points`;
    $('#tree-xp-fill').style.width = (mastered ? 100 : (me.xp / me.nx) * 100) + '%';
    $('#tree-xp-text').textContent = mastered ? 'Mastered!' : `${me.xp} / ${me.nx} exp to level ${me.lv + 1}`;
    $('#tree-note').textContent = edit
      ? `You're at the Skilltree: click an upgrade to spend a point.${seeds ? ` Right-click an upgrade to take a point back with a Reclaim Seed (you have ${seeds}).` : ''}`
      : 'Just looking. Every level gives 1 point (up to level 30). Spend them at the Skilltree in camp. Your tree is saved for this class.';
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
        const ok = edit && canBuy(me.k, tree, me.pts, n.id);
        b.className = 'node gbtn' + (rank ? ' owned' : '') + (ok ? ' can' : '') + (n.cap ? ' cap' : '') + (edit ? '' : ' view');
        const dots = Array.from({ length: n.max }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
        b.innerHTML = `<strong></strong><span class="dots">${dots}</span><small></small>`;
        b.querySelector('strong').textContent = n.name;
        b.querySelector('small').textContent = n.cap && spent < CAP_REQUIREMENT ? `Unlocks after ${CAP_REQUIREMENT} points in ${br.name}. ${n.desc}` : n.desc;
        b.onclick = () => { if (ok) { this.game.buyNode(n.id); } else audio.play('nope'); };
        b.oncontextmenu = (e) => { e.preventDefault(); if (edit && seeds > 0 && rank > 0) this.game.act('reclaimNode', n.id); else audio.play('nope'); };
        col.appendChild(b);
      }
      cols.appendChild(col);
    }
    this.fillPrestige(me, edit, mastered);
  }

  fillPrestige(me, edit, mastered) {
    const box = $('#tree-prestige');
    box.innerHTML = '';
    const slots = SLOTS[me.k] || SLOTS.warrior;
    const have = slots.filter(([id]) => me.pr && me.pr[id]).map(([id, name]) => `${name} +${Math.round(me.pr[id] * PRESTIGE.power * 100)}%`);
    const rebs = REBIRTHS.filter((r) => me.rb && me.rb[r.id]).map((r) => `${r.name} ×${me.rb[r.id]}`);
    if (have.length || rebs.length) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = `Ignition upgrades: ${have.join(' · ') || 'none'}${rebs.length ? ` · Wildfire Ability: ${rebs.join(' · ')}` : ''}`;
      box.appendChild(p);
    }
    if (!mastered) return;
    if (!edit) { const p = document.createElement('p'); p.className = 'note gold'; p.textContent = 'This class is mastered! Visit the Skilltree in camp to ignite it.'; box.appendChild(p); return; }
    const rebirth = (me.np + 1) % REBIRTH_EVERY === 0;
    const h = document.createElement('h3');
    h.textContent = rebirth ? `Ignition ${me.np + 1}: a Rebirth!` : `Ignition ${me.np + 1}`;
    box.appendChild(h);
    const info = document.createElement('p');
    info.className = 'note';
    info.textContent = `Go back to level 1 with an empty tree, and make one ability permanently stronger (+${Math.round(PRESTIGE.power * 100)}% damage or healing, ${Math.round((1 - PRESTIGE.cd) * 100)}% faster recharge).${rebirth ? ' As a Rebirth, you also improve your Wildfire Ability.' : ''}`;
    box.appendChild(info);
    const row = document.createElement('div');
    row.className = 'prow-btns';
    for (const [id, name] of slots) {
      const btn = document.createElement('button');
      btn.className = 'gbtn small' + (this.pick === id ? ' primary' : '');
      btn.textContent = `${name}${me.pr && me.pr[id] ? ` (${me.pr[id]})` : ''}`;
      btn.onclick = () => { this.pick = id; this.lastKey = ''; audio.play('click'); };
      row.appendChild(btn);
    }
    box.appendChild(row);
    if (rebirth) {
      const r2 = document.createElement('div');
      r2.className = 'prow-btns';
      for (const r of REBIRTHS) {
        const btn = document.createElement('button');
        btn.className = 'gbtn small' + (this.reb === r.id ? ' primary' : '');
        btn.textContent = r.name;
        btn.title = r.desc;
        btn.onclick = () => { this.reb = r.id; this.lastKey = ''; audio.play('click'); };
        r2.appendChild(btn);
      }
      box.appendChild(r2);
      if (this.reb) { const d = document.createElement('p'); d.className = 'note'; d.textContent = byId(REBIRTHS, this.reb).desc; box.appendChild(d); }
    }
    const go = document.createElement('button');
    go.className = 'gbtn primary';
    go.textContent = 'Ignite now';
    go.disabled = !this.pick || (rebirth && !this.reb);
    go.onclick = async () => {
      const name = slots.find(([id]) => id === this.pick)[1];
      if (!(await confirmDialog(`Ignite your ${byId(CLASSES, me.k).name}? You go back to level 1 with an empty skill tree, and ${name} becomes permanently stronger.`, 'Ignite'))) return;
      this.game.act('prestige', this.pick, this.reb);
      this.pick = null; this.reb = null; this.lastKey = '';
    };
    box.appendChild(go);
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
      const endless = game.lastSnap && game.lastSnap.md === 'endless';
      if (await confirmDialog(endless ? 'Save the endless run and return to camp? The host can continue from the next forest at the Waystone.' : 'Return to camp? This ends the run for the whole party.', endless ? 'Save and return' : 'Return to camp')) game.vote('camp');
    };
  }
  refresh(snap, me) {
    const resting = snap.st === 'rest';
    this.el.classList.toggle('hidden', !resting);
    if (!resting) { this.lastKey = ''; return; }
    const endless = snap.md === 'endless';
    const nextIsBoss = endless ? (snap.stg + 1) % 3 === 0 : snap.stg >= 3;
    $('#vote-camp').textContent = endless ? 'Save and return to camp' : 'Return to camp';
    const ready = snap.ps.filter((p) => p.vt === 'go').length;
    $('#boons-wait').textContent = `${ready}/${snap.ps.length} ready to continue · carrying on automatically in ${snap.stt}s`;
    $('#boons-pts').textContent = me.pts ? `You have ${me.pts} skill point${me.pts > 1 ? 's' : ''} saved for the Skilltree in camp.` : '';
    // after picking a boon: continue into the next forest (or the boss), or head back to camp
    const showVote = !me.bc;
    $('#vote-row').classList.toggle('hidden', !showVote);
    $('#vote-go').textContent = me.vt === 'go' ? 'Waiting for the party…' : nextIsBoss ? 'Face the Creaking Oak' : 'Continue into the forest';
    $('#vote-go').disabled = me.vt === 'go';
    const key = JSON.stringify(me.bc);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const cards = $('#boon-cards');
    cards.innerHTML = '';
    $('#boons-title').textContent = me.bc ? 'Choose a favor' : nextIsBoss ? 'The heart of the woods awaits' : 'Continue?';
    if (!me.bc) return;
    me.bc.forEach((id, i) => {
      const b = byId(BOONS, id);
      const el = document.createElement('button');
      el.className = 'boon gbtn';
      el.innerHTML = `<span class="icon"></span><strong></strong><small></small>`;
      el.querySelector('.icon').appendChild(iconCanvas('boon_' + b.id, 36));
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
  warrior: { atk: 'Strike: sword combo. Every 3rd swing is heavy (and slower to recover). Never uses Fury.', guard: 'Iron Guard: hold to block hits from the front (blocking builds Fury), let go for Retaliation.', quake: 'Shockwave: slam the ground around you to stun enemies.', cry: 'Battle Cry: for 5 seconds, every enemy near you (even ones that arrive later) turns on you.', dash: 'Bash: dash and shove enemies you hit, breaking their attack. The start of it dodges attacks.', ult: 'Bladestorm: spin a giant sword for 4 seconds, cutting everything around you, moving twice as fast (no Bash while spinning). Needs full Wildfire.' },
  sorcerer: { atk: 'Shove: a weak staff swing that pushes enemies away.', gale: 'Gale: a blast of wind that knocks enemies back.', fire: 'Fireball: an exploding fireball.', frost: 'Frostbite: slowing ice shards.', dash: 'Gust: dash and leave a faint trail that speeds up allies who walk through it.', ult: 'Starfall: meteors hunt the monsters where you aim (needs full Wildfire).' },
  bowman: { atk: 'Hold to draw, let go to shoot. Longer draw = stronger, piercing arrow, but a longer wait. Right-click cancels a draw.', mark: 'Mark the enemy you aim at: the whole party deals +20% damage to it.', rain: 'Barrage where you aim.', farrow: 'Fire Arrow: a burning arrow that pierces through every enemy and leaves a short trail of fire on the ground.', dash: 'Roll. You take 50% less damage while rolling, and it flicks a small arrow at the nearest enemy.', ult: 'Deadeye: every shot is full strength and seeks enemies (needs full Wildfire).' },
  rogue: { atk: 'Quick stabs. Every 4th is a spin that hits all around you.', twin: 'Twin Fang: a heavy hit with both daggers. Hits harder than a stab, but has a cooldown.', smoke: 'Smoke Bomb: enemies inside crawl and can\'t see anyone. You move faster in it.', step: 'Shadowstep: teleport behind the enemy you aim at.', dash: 'Shadow Clone: dash and leave a clone behind that nearby enemies turn on for a moment.', ult: 'Thousand Cuts: slash up to 6 nearby enemies (needs full Wildfire).' },
  cleric: { atk: 'Swing. Every hit builds Grace.', mend: 'Kindle: heal the ally you aim at (or whoever needs it most, or yourself). Costs Grace.', judge: 'Judgement: slam your mace to stun enemies in front of you.', ground: 'Sanctified Ground: a ring of light that heals allies and slows enemies. Costs Grace.', dash: 'Guiding Light: dash and leave a spark that heals allies you pass.', ult: 'Daybreak: heal everyone near you and rekindle fallen allies, who are safe for 3 seconds (needs full Wildfire).' },
  druid: { atk: 'Thorn Shot: fire a thorn. Every hit fills your nature gauge.', entangle: 'Entangle: vines burst up where you aim and hold enemies in place.', bear: 'Bear Form: when your nature gauge is full, become a great bear until it drains. Press again to turn back early.', rejuv: 'Rejuvenate: a gentle heal over 5 seconds for you and allies close by.', dash: 'Dash. In bear form it is a Charge instead.', ult: 'Wrath of the Grove: for 3 seconds the trees around you lash every enemy nearby (needs full Wildfire).' },
  bear: { atk: 'Maul: heavy claw swipes.', stomp: 'Stomp: slam the ground to stun enemies around you.', human: 'Human Form: turn back early. Your gauge stays where it is.', roar: 'Roar: every enemy nearby turns on you for 4 seconds.', dash: 'Charge: knock enemies aside and stun the first one you hit.' },
  warlock: { atk: 'Bolt. Every 3rd bolt curses: cursed enemies take extra damage.', hands: 'Dead Man\'s Reach: shadow hands burst up where you aim, holding enemies in place.', imps: 'Swarm: 3 imps chase and bite for 8 seconds. Their bites give you souls.', siphon: 'Soul Siphon: drain the enemy you aim at, refilling your souls.', dash: 'Phase Shift: a quick blink you cannot be hit during.', ult: 'Eclipse: a huge, tough familiar draws every enemy to it (needs full Wildfire).' },
};
export const CLASS_TRICK = {
  warrior: 'Fury: getting hit (or blocking) fills your Fury gauge. Your abilities (not Strike) use some of it for extra damage. Bloodlust: the fuller your Fury, the harder and faster you swing.',
  sorcerer: 'Spellweaving: cast two different spells quickly and they fuse. Fireball + Frostbite = Thermal Shock, Fireball + Gale = Firestorm, Frostbite + Gale = Blizzard. Fusing costs extra mana.',
  bowman: 'Draw longer for stronger shots. You walk slower while drawing.',
  rogue: 'Backstab: hits from behind deal double damage. A red dagger shows over enemies you are behind.',
  cleric: 'Grace: hit enemies to build it, spend it to heal. Heals past full flame become a shield. Grace fades when you stop fighting, but never below half.',
  warlock: 'Curses and summons: your imps and hands do the dirty work while you keep your distance. Imp bites refill your souls.',
  druid: 'Nature gauge: your Thorn Shots and Entangle fill it. When it is full, press E to become a tough bear (more flame, takes less damage). The gauge only drains while you are a bear.',
};
const PAD = { strike: 'RT', skill2: 'LT', skill1: 'X', skill3: 'LB', ult: 'RB', dash: 'A', interact: 'Y', tree: 'View', controls: '—', pause: 'Start' };

function fillGuide(box, game, cls) {
  const kit = KITS[cls] || KITS.warrior;
  const text = SKILL_TEXT[cls] || SKILL_TEXT.warrior;
  box.querySelector('.guide-title').textContent = byId(CLASSES, cls).name;
  box.querySelector('.guide-trick').textContent = CLASS_TRICK[cls] || '';
  const list = box.querySelector('.guide-moves');
  list.innerHTML = '';
  const K = keysFor(cls);
  const kb = (key) => (key === 'strike' ? (K.strike ? `LMB / ${keyName(K.strike)}` : 'LMB') : key === 'skill2' ? (K.skill2 ? `RMB / ${keyName(K.skill2)}` : 'RMB') : keyName(K[key]));
  const skillName = (k) => k.name.replace(/\s*\(.*\)$/, '');
  const strip = (k, t) => (t || '').replace(new RegExp('^' + skillName(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.?:?\\s*', 'i'), '');
  const bearRows = cls === 'druid' ? KITS.bear.filter((k) => k.id !== 'ult').map((k) => ({ icon: skillIconName('bear', k.id), key: k.key, name: 'Bear: ' + skillName(k), text: strip(k, SKILL_TEXT.bear[k.id]) })) : [];
  const rows = [...kit.map((k) => ({ icon: skillIconName(cls, k.id), key: k.key, name: skillName(k), text: strip(k, text[k.id]) })), ...bearRows,
    { icon: 'interact', key: 'interact', name: 'Interact', text: '' }, { icon: 'tree', key: 'tree', name: 'Skill tree', text: '' }, { icon: 'help', key: 'controls', name: 'Controls', text: 'show / hide this screen' }];
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'move';
    row.innerHTML = '<span class="mico"></span><span class="keys"><kbd class="k1"></kbd><kbd class="k2 pad"></kbd></span><span class="mtext"></span>';
    row.querySelector('.mico').appendChild(iconCanvas(r.icon, 24));
    row.querySelector('.k1').textContent = kb(r.key);
    row.querySelector('.k2').textContent = PAD[r.key] || '—';
    const mt = row.querySelector('.mtext');
    mt.innerHTML = '<b></b> <span></span>';
    mt.querySelector('b').textContent = r.name;
    mt.querySelector('span').textContent = r.text;
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
    row.querySelector('span').textContent = byId(CLASSES, p.k).name;
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
  $('#pause-logout').classList.toggle('hidden', !(g.isHost && !g.waitSim));
};
$('#pause-logout').onclick = async () => { const g = pause.game; if (await confirmDialog('Log out of Wildwick?', 'Log out')) { pause.close(); g.hooks.logout(); } };
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
  $('#camp-logout').classList.toggle('hidden', !host);
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
$('#camp-logout').onclick = async () => { const g = campPanel.game; if (await confirmDialog('Log out of Wildwick?', 'Log out')) { campPanel.close(); g.hooks.logout(); } };
// paste a room code someone sent you
$('#camp-paste').onclick = async () => {
  try {
    const t = (await navigator.clipboard.readText()).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!t) throw new Error('empty');
    $('#camp-join-code').value = t.slice(-5);
  } catch { $('#camp-error').textContent = 'Could not read your clipboard. Click the box and press Ctrl+V instead.'; $('#camp-join-code').focus(); }
};

// ---------------------------------------------------------- signpost: change character / log out
export const signPanel = makePanel('#sign');
$('#sign-chars').onclick = () => { const g = signPanel.game; signPanel.close(); g.hooks.toChars(); };
$('#sign-logout').onclick = async () => { const g = signPanel.game; if (await confirmDialog('Log out of Wildwick?', 'Log out')) { signPanel.close(); g.hooks.logout(); } };
$('#sign [data-close]').onclick = () => signPanel.close();

// ---------------------------------------------------------- stats board
export const boardPanel = makePanel('#board');
// everyone currently in the camp, best players first
boardPanel.fill = function (game) {
  const snap = game.lastSnap;
  const people = (snap ? snap.ps : []).map((p) => ({ name: p.u, cls: p.k, c: p.cloak || p.c, st: p.cs || (p.id === game.myId ? game.char.stats : null) || { runs: 0, kills: 0, bosses: 0, best: 0 } }));
  people.sort((a, b) => b.st.bosses - a.st.bosses || b.st.best - a.st.best || b.st.kills - a.st.kills);
  const bestText = (b) => (b >= 4 ? 'Beat the Oak' : b > 0 ? `Thornwood ${['I', 'II', 'III'][b - 1]}` : '—');
  $('#board-name').textContent = 'Everyone in this camp';
  const box = $('#board-rows');
  box.innerHTML = '<div class="lrow head"><span>Player</span><span>Runs</span><span>Kills</span><span>Oaks</span><span>Best run</span></div>';
  for (const p of people) {
    const row = document.createElement('div');
    row.className = 'lrow';
    for (const v of [`${p.name} (${byId(CLASSES, p.cls).name})`, p.st.runs, p.st.kills, p.st.bosses, bestText(p.st.best)]) { const s = document.createElement('span'); s.textContent = v; row.appendChild(s); }
    box.appendChild(row);
  }
};
$('#board [data-close]').onclick = () => boardPanel.close();

// ---------------------------------------------------------- reaction wheel (mouse 3) and emote wheel (C)
export const EMOTES = [
  { id: 'wave', name: 'Wave' }, { id: 'bow', name: 'Bow' }, { id: 'cheer', name: 'Cheer' }, { id: 'dance', name: 'Dance' },
  { id: 'sit', name: 'Sit' }, { id: 'nap', name: 'Nap' }, { id: 'flourish', name: 'Show off' },
];
const EMOJI_NAMES = { laugh: 'Haha', wow: 'Wow', heart: 'Love', thumbs: 'Nice', angry: 'Grr', fire: 'Lit', sad: 'Aww', cool: 'Cool' };

export const wheel = {
  open: false,
  kind: null,      // 'react' or 'emote'
  page: 0,         // reaction wheel: 0 = map pings, 1 = emoji
  cx: 0, cy: 0,
  hover: -1,
  items: [],
  show(kind, x, y) {
    this.kind = kind;
    this.open = true;
    this.cx = x; this.cy = y;
    if (kind === 'react') { try { this.page = +localStorage.getItem('wildwick.reactPage') || 0; } catch { this.page = 0; } }
    this.build();
    const el = $('#wheel');
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.classList.remove('hidden');
    audio.play('hover');
  },
  flip(dir) {
    if (this.kind !== 'react') return;
    this.page = (this.page + (dir > 0 ? 1 : 1)) % 2;
    try { localStorage.setItem('wildwick.reactPage', this.page); } catch { /* ignore */ }
    this.build();
    audio.play('click');
  },
  build() {
    const el = $('#wheel');
    el.innerHTML = '';
    if (this.kind === 'emote') this.items = EMOTES.map((e) => ({ v: e.id, label: e.name }));
    else if (this.page === 0) this.items = PINGS.map((p) => ({ v: p.id, label: p.label, sprite: pingSprite(p.id) }));
    else this.items = EMOJIS.map((e) => ({ v: e, label: EMOJI_NAMES[e], sprite: emojiSprite(e) }));
    const n = this.items.length, R = 86;
    this.items.forEach((it, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const b = document.createElement('div');
      b.className = 'wslot glass';
      b.style.left = Math.cos(a) * R + 'px';
      b.style.top = Math.sin(a) * R + 'px';
      if (it.sprite) { const c = document.createElement('canvas'); c.width = it.sprite.width; c.height = it.sprite.height; c.getContext('2d').drawImage(it.sprite, 0, 0); c.className = 'picon'; c.style.width = it.sprite.width * 2.4 + 'px'; c.style.height = it.sprite.height * 2.4 + 'px'; b.appendChild(c); }
      const s = document.createElement('span'); s.textContent = it.label; b.appendChild(s);
      el.appendChild(b);
    });
    const mid = document.createElement('div');
    mid.className = 'wmid';
    mid.textContent = this.kind === 'emote' ? 'Emotes' : this.page === 0 ? 'Pings · scroll for emoji' : 'Emoji · scroll for pings';
    el.appendChild(mid);
    this.hover = -1;
  },
  update(mx, my) {
    if (!this.open) return;
    const dx = mx - this.cx, dy = my - this.cy;
    const n = this.items.length;
    let h = -1;
    if (Math.hypot(dx, dy) > 28) {
      const a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2 + Math.PI / n) % (Math.PI * 2);
      h = Math.floor(a / ((Math.PI * 2) / n)) % n;
    }
    if (h !== this.hover) {
      this.hover = h;
      [...$('#wheel').querySelectorAll('.wslot')].forEach((el, i) => el.classList.toggle('on', i === h));
      if (h >= 0) audio.play('hover');
    }
  },
  close() {
    this.open = false;
    $('#wheel').classList.add('hidden');
    const pick = this.hover >= 0 ? this.items[this.hover] : null;
    return pick ? { kind: this.kind, page: this.page, v: pick.v } : null;
  },
};

// ---------------------------------------------------------- the merchant (camp shop)
export const shopPanel = makePanel('#shop');
shopPanel.fill = function () { this.lastKey = ''; };
shopPanel.update = function (game, me) {
  const key = JSON.stringify([me.co, me.it]);
  if (key === this.lastKey) return;
  this.lastKey = key;
  $('#shop-coins').textContent = `${me.co || 0} coins`;
  const box = $('#shop-rows');
  box.innerHTML = '';
  for (const it of SHOP) {
    const row = document.createElement('div');
    row.className = 'shoprow';
    const have = (me.it && me.it[it.id]) || 0;
    row.innerHTML = '<div><b></b><small></small></div><span class="muted"></span><button class="gbtn small primary"></button>';
    row.querySelector('b').textContent = it.name + (it.key ? ` [${keyName(it.key)}]` : '');
    row.querySelector('small').textContent = it.desc;
    row.querySelector('span').textContent = `${have}/${it.max}`;
    const btn = row.querySelector('button');
    btn.textContent = `${it.price} coins`;
    btn.disabled = (me.co || 0) < it.price || have >= it.max;
    btn.onclick = () => game.act('buyItem', it.id);
    box.appendChild(row);
  }
  // spare fish (you always keep one of each for your journal)
  const fish = (game.char && game.char.fish) || {};
  const spare = FISH.filter((f) => RARITY[f.r] && (fish[f.id] || 0) > 1);
  const head = document.createElement('h3');
  head.textContent = 'Sell fish';
  box.appendChild(head);
  if (!spare.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No spare fish. You keep one of each kind for your journal.'; box.appendChild(p); }
  let all = 0;
  for (const f of spare) {
    const n = fish[f.id] - 1, price = RARITY[f.r].price;
    all += n * price;
    const row = document.createElement('div');
    row.className = 'shoprow fishsell';
    row.innerHTML = '<div><b></b><small></small></div><span class="muted"></span><button class="gbtn small"></button>';
    row.querySelector('b').textContent = f.name;
    row.querySelector('b').style.color = RARITY[f.r].col;
    row.querySelector('small').textContent = `${RARITY[f.r].name} · ${price} coins each`;
    row.querySelector('span').textContent = `×${n} spare`;
    const btn = row.querySelector('button');
    btn.textContent = `Sell 1 (+${price})`;
    btn.onclick = () => { if ((fish[f.id] || 0) > 1 && game.act('sellFish', price) !== false) { fish[f.id]--; game.saveFish(); this.lastKey = ''; } };
    box.appendChild(row);
  }
  if (spare.length > 1) {
    const b = button(`Sell all spare fish (+${all} coins)`, () => {
      if (game.act('sellFish', all) === false) return;
      for (const f of spare) fish[f.id] = 1;
      game.saveFish(); this.lastKey = '';
    });
    box.appendChild(b);
  }
};
shopPanel.update0 = shopPanel.update;
shopPanel.update = function (game, me) {
  const fk = JSON.stringify((game.char && game.char.fish) || {});
  if (fk !== this.fishKey) { this.fishKey = fk; this.lastKey = ''; }
  this.update0(game, me);
};

// ---------------------------------------------------------- the fish journal (a book)
export const fishbookPanel = makePanel('#fishbook');
fishbookPanel.fill = function (game) {
  const fish = (game.char && game.char.fish) || {};
  const real = FISH.filter((f) => RARITY[f.r]);
  const caught = real.filter((f) => fish[f.id] > 0).length;
  $('#fishbook-count').textContent = `${caught} / ${real.length} kinds`;
  const pages = $('#fishbook-pages');
  pages.innerHTML = '';
  const left = document.createElement('div'), right = document.createElement('div');
  left.className = right.className = 'fpage';
  for (const [rid, page] of [['common', left], ['rare', left], ['epic', right], ['legendary', right]]) {
    const R = RARITY[rid];
    const h = document.createElement('h3');
    h.textContent = R.name;
    page.appendChild(h);
    for (const f of real.filter((x) => x.r === rid)) {
      const n = fish[f.id] || 0;
      const row = document.createElement('div');
      row.className = 'fish' + (n ? '' : ' unknown');
      row.appendChild(fishCanvas(n ? f.col : '#6a5a44'));
      const d = document.createElement('div');
      d.innerHTML = '<b></b> <span class="tag"></span><small></small>';
      d.querySelector('b').textContent = n ? f.name : '???';
      d.querySelector('.tag').textContent = n ? `×${n}` : '';
      d.querySelector('.tag').style.color = R.col;
      d.querySelector('small').textContent = n ? f.desc : 'Not caught yet.';
      row.appendChild(d);
      page.appendChild(row);
    }
  }
  pages.append(left, right);
};
$('#fishbook [data-close]').onclick = () => fishbookPanel.close();
// a little pixel fish (or its silhouette)
export function fishCanvas(col) {
  const c = document.createElement('canvas');
  c.width = 20; c.height = 10;
  const g = c.getContext('2d');
  const P = (x, y, w, h, k) => { g.fillStyle = k; g.fillRect(x, y, w, h); };
  // facing right: a forked tail on the left, a rounded body, an eye near the nose
  const O = '#2a1e14';
  const body = [[6, 4, 2], [7, 3, 4], [8, 2, 6], [9, 2, 6], [10, 2, 6], [11, 2, 6], [12, 2, 6], [13, 2, 6], [14, 3, 4], [15, 3, 4], [16, 4, 2]];
  for (const [x, y, h] of body) { P(x, y - 1, 1, h + 2, O); }
  P(17, 4, 1, 2, O);
  for (const [x, y, h] of body) P(x, y, 1, h, col);
  P(1, 1, 2, 2, O); P(1, 7, 2, 2, O); P(3, 2, 2, 2, O); P(3, 6, 2, 2, O); P(5, 3, 1, 4, O);
  P(2, 2, 1, 1, col); P(2, 7, 1, 1, col); P(4, 3, 1, 1, col); P(4, 6, 1, 1, col); P(5, 4, 1, 2, col);
  P(8, 2, 6, 1, 'rgba(255,255,255,0.4)'); P(9, 7, 5, 1, 'rgba(0,0,0,0.25)');
  P(14, 4, 1, 1, '#111'); P(10, 1, 3, 1, O);
  return c;
}
// a little pixel book for the journal button
export function bookCanvas() {
  const c = document.createElement('canvas');
  c.width = 20; c.height = 20;
  const g = c.getContext('2d');
  const P = (x, y, w, h, k) => { g.fillStyle = k; g.fillRect(x, y, w, h); };
  P(2, 3, 16, 14, '#2a1e14'); P(3, 4, 14, 12, '#7a3a22'); P(3, 4, 2, 12, '#5a2a18');
  P(5, 15, 12, 2, '#f3e8c8'); P(5, 16, 12, 1, '#c9b88e');
  P(8, 7, 6, 3, '#e8c45c'); P(7, 8, 1, 1, '#e8c45c'); P(14, 7, 1, 1, '#e8c45c'); P(14, 9, 1, 1, '#e8c45c'); P(9, 8, 1, 1, '#2a1e14');
  P(4, 3, 12, 1, '#9a5a32');
  return c;
}
$('#shop [data-close]').onclick = () => shopPanel.close();

// ---------------------------------------------------------- leaderboard
export const lboardPanel = makePanel('#lboard');
lboardPanel.tab = 'daily';
lboardPanel.fill = function (game) { this.load(game); };
lboardPanel.load = async function (game) {
  const box = $('#lboard-rows');
  document.querySelectorAll('#lboard .tab').forEach((t) => t.classList.toggle('primary', t.dataset.lb === this.tab));
  $('#lboard-sub').textContent = this.tab === 'daily' ? `Today's daily run (${todayKey()}) · most forests, then fastest` : 'Endless · the deepest runs ever';
  box.innerHTML = '<p class="muted">Loading…</p>';
  if (!game.backend.topRuns) { box.innerHTML = '<p class="muted">The leaderboard needs online accounts.</p>'; return; }
  try {
    const rows = await game.backend.topRuns(this.tab, this.tab === 'daily' ? todayKey() : null);
    if (!this.open) return;
    box.innerHTML = '<div class="lrow lb head"><span>#</span><span>Party</span><span>Forests</span><span>Time</span></div>';
    if (!rows.length) box.innerHTML += `<p class="muted">No runs yet. Be the first!</p>`;
    rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'lrow lb';
      const t = `${Math.floor(r.time_s / 60)}:${String(r.time_s % 60).padStart(2, '0')}`;
      for (const v of [i + 1, (r.party || [r.username]).join(' + '), r.won ? `${r.forests} ✓` : r.forests, t]) { const s = document.createElement('span'); s.textContent = v; row.appendChild(s); }
      box.appendChild(row);
    });
  } catch (err) { box.innerHTML = ''; const p = document.createElement('p'); p.className = 'error'; p.textContent = 'Could not load the leaderboard: ' + err.message; box.appendChild(p); }
};
document.querySelectorAll('#lboard .tab').forEach((t) => { t.onclick = () => { lboardPanel.tab = t.dataset.lb; lboardPanel.load(lboardPanel.game); }; });
$('#lboard [data-close]').onclick = () => lboardPanel.close();

// ---------------------------------------------------------- the path stone: what kind of run is next (host)
export const modePanel = makePanel('#modes');
modePanel.fill = function (game) {
  const box = $('#mode-rows');
  box.innerHTML = '';
  const snap = game.lastSnap;
  const pick = (mode, resume) => { game.sim.setMode('host', mode, resume); this.close(); };
  for (const m of MODES) {
    const row = document.createElement('div');
    row.className = 'moderow' + (snap && snap.md === m.id ? ' on' : '');
    row.innerHTML = '<div><b></b><small></small></div>';
    row.querySelector('b').textContent = m.name;
    row.querySelector('small').textContent = m.desc;
    const btn = document.createElement('button');
    btn.className = 'gbtn small primary';
    btn.textContent = m.id === 'endless' ? 'New run' : 'Choose';
    btn.onclick = () => pick(m.id, null);
    row.appendChild(btn);
    if (m.id === 'endless' && game.char.endless && game.char.endless.forest > 1) {
      const c = document.createElement('button');
      c.className = 'gbtn small';
      c.textContent = `Continue (forest ${game.char.endless.forest})`;
      c.onclick = () => pick('endless', game.char.endless);
      row.appendChild(c);
    }
    box.appendChild(row);
  }
};
$('#modes [data-close]').onclick = () => modePanel.close();

// ---------------------------------------------------------- chat (T)
export const chat = {
  game: null, typing: false, lines: [],
  attach(game) { this.game = game; this.lines = []; this.render(); },
  open() {
    if (this.typing) return;
    this.typing = true;
    const inp = $('#chat-input');
    $('#chat').classList.add('typing');
    inp.value = '';
    setTimeout(() => inp.focus(), 0);
    if (this.game) this.game.input.keys.clear();
    this.render();
  },
  close() { this.typing = false; $('#chat').classList.remove('typing'); $('#chat-input').blur(); this.render(); },
  send() {
    const t = $('#chat-input').value.trim();
    $('#chat-input').value = '';
    if (t && this.game) this.game.act('chat', t.slice(0, 80));
    this.close();
  },
  add(name, text, mine) { this.lines.push({ name, text, mine, at: Date.now() }); this.lines = this.lines.slice(-7); this.render(); },
  render() {
    const box = $('#chat-lines');
    box.innerHTML = '';
    for (const l of this.lines) {
      const d = document.createElement('div');
      d.className = 'cline' + (Date.now() - l.at > 12000 ? ' old' : '');
      d.innerHTML = '<b></b> <span></span>';
      d.querySelector('b').textContent = l.name + ':';
      d.querySelector('span').textContent = l.text;
      box.appendChild(d);
    }
  },
};
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); chat.send(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chat.close(); }
});
setInterval(() => { if (!chat.typing && chat.lines.length) chat.render(); }, 2000);

// ---------------------------------------------------------- developer console (` key, Jack and kubi only)
export const devConsole = {
  game: null, open: false,
  attach(game) { this.game = game; },
  toggle() { if (this.open) this.close(); else this.show(); },
  show() {
    this.open = true;
    $('#dev').classList.remove('hidden');
    setTimeout(() => $('#dev-input').focus(), 0);
    if (this.game) this.game.input.keys.clear();
    if (!$('#dev-log').childElementCount) this.log('developer console · type help');
  },
  close() { if (!this.open) return; this.open = false; $('#dev').classList.add('hidden'); $('#dev-input').blur(); },
  log(text) {
    const d = document.createElement('div');
    d.textContent = text;
    const box = $('#dev-log');
    box.appendChild(d);
    while (box.childElementCount > 60) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
  },
};
$('#dev-input').addEventListener('keydown', (e) => {
  if (e.code === 'Backquote' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); devConsole.close(); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const line = $('#dev-input').value.trim();
  $('#dev-input').value = '';
  if (!line || !devConsole.game) return;
  devConsole.log('> ' + line);
  devConsole.game.act('devCmd', line);
});

// ---------------------------------------------------------- click outside a menu to close it
document.addEventListener('pointerdown', (e) => {
  const g = pause.game;
  if (!g || !g.alive) return;
  if (e.target.closest('.panel, #btn-fishbook, #chat, #dev, #confirm, #toasts, #wheel, #menu-gear, #btn-gear, .skill, #boons, #tips')) return;
  g.wardrobe.close(); g.tree.close(); g.controls.close();
  campPanel.close(); signPanel.close(); boardPanel.close();
  shopPanel.close(); lboardPanel.close(); modePanel.close(); fishbookPanel.close();
  settings.close(); pause.close();
});
