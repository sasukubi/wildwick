// =============================================================
//  The in-game HUD (HTML, glass style). Updated every frame, but
//  only touches the page when a value actually changes.
// =============================================================
import { CLOAKS, FLAMES, SORCERER, CLERIC, WARLOCK, CLASSES, ELEMENTS, RULES, byId } from './data.js';
import { MAX_LEVEL, SHOP, MODES, EVENTS } from './progress.js';
import { iconSprite, skillIconName } from './sprites.js';

// a crisp, scaled-up copy of a pixel-art icon
export function iconCanvas(name, size = 28) {
  const src = iconSprite(name);
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  c.getContext('2d').drawImage(src, 0, 0);
  c.className = 'picon';
  c.style.width = c.style.height = size + 'px';
  return c;
}

const $ = (s) => document.querySelector(s);
const last = new Map();
function set(el, prop, value) {
  if (!el) return;
  const k = (el.id || el.className) + prop;
  if (last.get(k) === value) return;
  last.set(k, value);
  if (prop === 'text') el.textContent = value;
  else if (prop === 'hide') el.classList.toggle('hidden', value);
  else if (prop.startsWith('--')) el.style.setProperty(prop, value);
  else el.style[prop] = value;
}

export const KITS = {
  warrior: [
    { id: 'atk', name: 'Strike', key: 'strike', icon: '⚔' },
    { id: 'guard', name: 'Smoulder Guard (hold)', key: 'skill2', icon: '🛡' },
    { id: 'quake', name: 'Cinder Quake', key: 'skill1', icon: '💥' },
    { id: 'dash', name: 'Dash (shoves enemies)', key: 'dash', icon: '»' },
    { id: 'ult', name: 'Pyre Cleave (Wildfire)', key: 'ult', icon: '🔥' },
  ],
  sorcerer: [
    { id: 'atk', name: 'Staff (pushes back)', key: 'strike', icon: '🪄' },
    { id: 'gale', name: 'Gale', key: 'skill2', icon: '🌀', el: 'gale' },
    { id: 'fire', name: 'Fire', key: 'skill1', icon: '🔥', el: 'fire' },
    { id: 'frost', name: 'Frost', key: 'skill3', icon: '❄', el: 'frost' },
    { id: 'dash', name: 'Dash (leaves a speed trail)', key: 'dash', icon: '»' },
    { id: 'ult', name: 'Starfall (Wildfire)', key: 'ult', icon: '☄' },
  ],
  bowman: [
    { id: 'atk', name: 'Hold to draw, let go to shoot', key: 'strike', icon: '🏹' },
    { id: 'mark', name: 'Mark', key: 'skill1', icon: '🎯' },
    { id: 'rain', name: 'Rain of Arrows', key: 'skill2', icon: '🌧' },
    { id: 'dash', name: 'Roll (flicks an arrow)', key: 'dash', icon: '»' },
    { id: 'ult', name: 'Hawk Eye (Wildfire)', key: 'ult', icon: '🦅' },
  ],
  rogue: [
    { id: 'atk', name: 'Stab (every 4th spins)', key: 'strike', icon: '🗡' },
    { id: 'smoke', name: 'Smoke Bomb', key: 'skill1', icon: '💨' },
    { id: 'step', name: 'Shadowstep', key: 'skill2', icon: '👣' },
    { id: 'dash', name: 'Dash (leaves a clone)', key: 'dash', icon: '»' },
    { id: 'ult', name: 'Thousand Cuts (Wildfire)', key: 'ult', icon: '✴' },
  ],
  cleric: [
    { id: 'atk', name: 'Mace (builds Grace)', key: 'strike', icon: '' },
    { id: 'judge', name: 'Judgement', key: 'skill2', icon: '' },
    { id: 'mend', name: 'Mending Light', key: 'skill1', icon: '' },
    { id: 'ground', name: 'Sanctified Ground', key: 'skill3', icon: '' },
    { id: 'dash', name: 'Blessed Step', key: 'dash', icon: '' },
    { id: 'ult', name: 'Dawn (Wildfire)', key: 'ult', icon: '' },
  ],
  warlock: [
    { id: 'atk', name: 'Shadow bolt (every 3rd curses)', key: 'strike', icon: '' },
    { id: 'imps', name: 'Summon Imps', key: 'skill2', icon: '' },
    { id: 'hands', name: 'Grasping Hands', key: 'skill1', icon: '' },
    { id: 'siphon', name: 'Soul Siphon', key: 'skill3', icon: '' },
    { id: 'dash', name: 'Shadow Slip', key: 'dash', icon: '' },
    { id: 'ult', name: 'Eclipse (Wildfire)', key: 'ult', icon: '' },
  ],
};
const USES_BAR = { sorcerer: 'mana', warlock: 'shadow', cleric: 'grace' };
const RING = 2 * Math.PI * 23;
const readyAt = new Map();

export function buildHud(cls = 'warrior') {
  const box = $('#skills');
  box.innerHTML = '';
  for (const s of KITS[cls] || KITS.warrior) {
    const el = document.createElement('div');
    el.className = 'skill glass' + (s.id === 'ult' ? ' ult' : '');
    el.id = 'sk-' + s.id;
    el.title = s.name;
    el.innerHTML = `<svg class="ring" viewBox="0 0 52 52"><circle class="track" cx="26" cy="26" r="23"/><circle class="prog" cx="26" cy="26" r="23" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg><span class="ico"></span><span class="cdnum"></span><span class="key"></span>`;
    el.querySelector('.ico').appendChild(iconCanvas(skillIconName(cls, s.id), s.id === 'ult' ? 32 : 28));
    if (s.el) el.style.setProperty('--el', ELEMENTS[s.el].color);
    box.appendChild(el);
  }
  const row = $('#mana-row');
  row.classList.toggle('hidden', !USES_BAR[cls]);
  row.classList.toggle('grace', cls === 'cleric');
  row.classList.toggle('shadow', cls === 'warlock');
  last.clear();
  readyAt.clear();
}

export function updateHud(game, snap, me) {
  const stats = game.myStats();
  const sorc = me.k === 'sorcerer';
  const bar = USES_BAR[me.k];
  // party
  const party = $('#party');
  const pk = snap.ps.map((p) => p.id).join(',');
  if (party.dataset.k !== pk) {
    party.dataset.k = pk;
    party.innerHTML = '';
    for (const p of snap.ps) {
      const c = document.createElement('div');
      c.className = 'pcard glass';
      c.id = 'pc-' + p.id.replace(/[^a-z0-9]/gi, '');
      c.innerHTML = '<i class="dot"></i><div><b></b><small></small><div class="mini"><i></i></div></div>';
      party.appendChild(c);
    }
  }
  for (const p of snap.ps) {
    const c = document.getElementById('pc-' + p.id.replace(/[^a-z0-9]/gi, ''));
    if (!c) continue;
    c.querySelector('.dot').style.background = byId(CLOAKS, p.c).hex;
    c.querySelector('b').textContent = p.u + (p.id === game.myId ? ' (you)' : '');
    c.querySelector('small').textContent = p.dn ? (p.rv > 0 ? 'Being rekindled…' : 'Flame out!') : byId(CLASSES, p.k).name + (p.sh > 0 ? ' · shielded' : '');
    c.classList.toggle('down', !!p.dn);
    const fill = c.querySelector('.mini i');
    fill.style.width = (p.hp / p.mx) * 100 + '%';
    fill.style.background = byId(FLAMES, p.f).mid;
  }

  // room code: only shown at the campfire (also in the Esc menu)
  set($('#room-pill'), 'hide', snap.sc !== 'lobby' || !game.room);

  // stage pill
  const mm = String(Math.floor(snap.tm / 60)).padStart(2, '0'), ss = String(snap.tm % 60).padStart(2, '0');
  let name = '', sub = '';
  if (snap.sc === 'lobby') {
    const z = game.world.readyZone;
    const ready = snap.ps.filter((p) => p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h).length;
    const m = byId(MODES, snap.md || 'casual');
    name = 'The Campfire';
    sub = `${m.name}${snap.rs ? ` from forest ${snap.rs}` : ''} · everyone walk under the archway · ${ready}/${snap.ps.length}`;
  } else if (snap.st === 'rest') { name = 'A quiet moment'; sub = 'Pick a boon, spend skill points'; }
  else if (snap.sc === 'forest') {
    const ev = snap.ev ? byId(EVENTS, snap.ev).name + ' · ' : '';
    name = `${stageName(snap)} · ${mm}:${ss}`;
    sub = ev + (snap.go ? 'The gate is open: everyone into the Heartwood Gate' : 'Find and defeat the gate guardian');
  } else { name = `The Heart of the Wood · ${mm}:${ss}`; sub = snap.md === 'endless' ? `Endless · stage ${snap.stg} · defeat the Elder Treant` : 'Defeat the Elder Treant'; }
  set($('#stage-name'), 'text', name);
  set($('#stage-sub'), 'text', sub);

  set($('#bossbar'), 'hide', !snap.bb);
  if (snap.bb) {
    set($('#boss-name'), 'text', snap.bb.n);
    set($('#boss-fill'), 'width', (snap.bb.hp / snap.bb.mx) * 100 + '%');
  }

  // bars
  const ratio = me.hp / me.mx;
  const pal = byId(FLAMES, me.f);
  set($('#flame-fill'), 'width', ratio * 100 + '%');
  set($('#flame-fill'), 'background', `linear-gradient(90deg, ${pal.outer}, ${pal.mid} 60%, ${pal.core})`);
  set($('#flame-shield'), 'width', Math.min(100, ((me.sh || 0) / me.mx) * 100) + '%');
  set($('#flame-text'), 'text', me.dn ? 'Flame out' : me.sh > 0 ? `Flame ${me.hp} / ${me.mx}  +${me.sh} shield` : `Flame ${me.hp} / ${me.mx}`);
  if (bar) {
    set($('#mana-fill'), 'width', (me.mn / me.mm) * 100 + '%');
    set($('#mana-text'), 'text', `${bar === 'grace' ? 'Grace' : 'Mana'} ${me.mn} / ${me.mm}`);
  }
  const wf = me.wf / RULES.wildfireMax;
  set($('#wild-fill'), 'width', wf * 100 + '%');
  $('#bars').classList.toggle('ready', wf >= 1);
  set($('#wild-text'), 'text', wf >= 1 ? `Wildfire ready! [${game.keyLabel('ult')}]` : `Wildfire ${me.wf}%`);
  const mastered = me.lv >= MAX_LEVEL;
  set($('#lvl'), 'text', mastered ? `Lv ${me.lv} ✦` : `Lv ${me.lv}`);
  set($('#xp-fill'), 'width', (mastered ? 100 : (me.xp / me.nx) * 100) + '%');
  set($('#pts'), 'hide', !me.pts && !mastered);
  set($('#pts'), 'text', mastered && !me.pts ? 'mastered · prestige at the Skilltree' : `+${me.pts} skill point${me.pts > 1 ? 's' : ''} · spend at the Skilltree`);
  // potions (1, 2, 3) and coins
  const ik = JSON.stringify([me.it, me.co]);
  const ib = $('#items');
  if (ib.dataset.k !== ik) {
    ib.dataset.k = ik;
    ib.innerHTML = '';
    for (const it of SHOP.filter((s) => s.key)) {
      const n = (me.it && me.it[it.id]) || 0;
      const s = document.createElement('span');
      s.className = 'it' + (n ? '' : ' none');
      s.title = it.desc;
      s.innerHTML = '<kbd></kbd><span></span>';
      s.querySelector('kbd').textContent = it.key.slice(5);
      s.querySelector('span').textContent = `${it.name.split(' ')[1] || it.name} ×${n}`;
      ib.appendChild(s);
    }
    if (me.it && me.it.charm) { const s = document.createElement('span'); s.className = 'it'; s.textContent = `feather ×${me.it.charm}`; s.title = 'Phoenix Feather: relights you once'; ib.appendChild(s); }
    const c = document.createElement('span'); c.className = 'co'; c.textContent = `${me.co || 0} coins`; ib.appendChild(c);
  }
  const fury = Math.round((stats.furyMax || 0) * (1 - ratio) * 100);
  const tough = Math.round(30 * (1 - ratio));
  set($('#fury'), 'text', me.k === 'warrior' && snap.sc !== 'lobby' && !me.dn && fury >= 5 ? `Dark Fury +${fury}% damage · ${tough}% less damage taken` : '');

  // weaving: show which element is "primed" and how long you have to fuse it
  const weave = $('#weave');
  set(weave, 'hide', !(sorc && me.le));
  if (sorc && me.le) {
    const E = ELEMENTS[me.le];
    set(weave, 'text', `${E.icon} ${E.name} primed: cast another element to weave!`);
    set(weave, '--w', String(Math.max(0, me.lt / stats.weaveWindow)));
  }

  // skills: a clean ring fills up as each one recharges
  const kit = KITS[me.k] || KITS.warrior;
  for (const s of kit) {
    const el = document.getElementById('sk-' + s.id);
    if (!el) continue;
    let rem = 0, total = 1, noMana = false;
    if (s.id === 'atk') { rem = Math.max(0, game.lp.atkCd); total = me.k === 'bowman' ? 0.9 * stats.recoverMult : stats.atkCd; }
    else if (s.id === 'mark') { rem = me.c1; total = stats.markCd; }
    else if (s.id === 'rain') { rem = me.c2; total = stats.rainCd; }
    else if (s.id === 'step') { rem = me.c2; total = stats.stepCd; }
    else if (s.id === 'smoke') { rem = me.c1; total = stats.smokeCd; }
    else if (s.id === 'dash') { rem = Math.max(0, game.lp.dashCd); total = stats.dashCd; }
    else if (s.id === 'guard') { rem = me.g ? 0 : me.c2; total = stats.guardCd; }
    else if (s.id === 'quake') { rem = me.c1; total = stats.quakeCd; }
    else if (s.id === 'fire') { rem = me.c1; total = SORCERER.fire.cd * stats.spellCd; noMana = me.mn < SORCERER.fire.cost; }
    else if (s.id === 'gale') { rem = me.c2; total = SORCERER.gale.cd * stats.spellCd; noMana = me.mn < SORCERER.gale.cost; }
    else if (s.id === 'frost') { rem = me.c3; total = SORCERER.frost.cd * stats.spellCd; noMana = me.mn < SORCERER.frost.cost; }
    else if (s.id === 'mend') { rem = me.c1; total = stats.mendCd; noMana = me.mn < stats.mendCost; }
    else if (s.id === 'judge') { rem = me.c2; total = stats.judgeCd; }
    else if (s.id === 'ground') { rem = me.c3; total = stats.groundCd; noMana = me.mn < CLERIC.groundCost; }
    else if (s.id === 'hands') { rem = me.c1; total = WARLOCK.hands.cd * stats.spellCd; noMana = me.mn < WARLOCK.hands.cost; }
    else if (s.id === 'imps') { rem = me.c2; total = WARLOCK.imps.cd * stats.spellCd; noMana = me.mn < WARLOCK.imps.cost; }
    else if (s.id === 'siphon') { rem = me.si ? 0 : me.c3; total = WARLOCK.siphon.cd * stats.spellCd; }
    else if (s.id === 'ult') { rem = 1 - wf; total = 1; }
    const frac = Math.max(0, Math.min(1, rem / total));
    const prog = el.querySelector('.prog');
    const off = (RING * frac).toFixed(1);
    if (prog.getAttribute('stroke-dashoffset') !== off) prog.setAttribute('stroke-dashoffset', off);
    el.classList.toggle('cooling', frac > 0);
    el.classList.toggle('nomana', noMana);
    const num = s.id !== 'ult' && rem >= 0.95 ? String(Math.ceil(rem)) : '';
    const n = el.querySelector('.cdnum');
    if (n.textContent !== num) n.textContent = num;
    const key = el.querySelector('.key');
    const k = game.keyLabel(s.key);
    if (key.textContent !== k) key.textContent = k;
    el.classList.toggle('active', (s.id === 'guard' && !!me.g) || (s.id === 'siphon' && !!me.si));
    el.classList.toggle('ready', s.id === 'ult' && wf >= 1);
    el.classList.toggle('primed', !!s.el && me.le === s.el);
    // little flash the moment a skill comes back
    const was = readyAt.get(s.id);
    if (frac === 0 && was === false) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    readyAt.set(s.id, frac === 0);
  }

  let big = '', small = '';
  if (snap.cd > 0) { big = `Into the Wilds in ${snap.cd}`; small = 'Stay on the path…'; }
  else if (snap.st === 'victory') { big = 'The Heart of the Wood is free'; small = `You defeated the Elder Treant! Back to camp in ${snap.stt}…`; }
  else if (snap.st === 'defeat') { big = 'All flames went out'; small = `The forest grows dark. Back to camp in ${snap.stt}…`; }
  else if (me.dn && snap.st === 'playing') { big = 'Your flame went out'; small = me.rv > 0 ? 'A friend is rekindling you…' : 'An ally can rekindle you by standing close.'; }
  else if (game.bannerT > 0) { big = game.bannerText; small = game.bannerSub || ''; }
  set($('#banner'), 'hide', !big);
  set($('#banner-big'), 'text', big);
  set($('#banner-sub'), 'text', small);
  $('#banner').classList.toggle('bad', snap.st === 'defeat' || (!!me.dn && snap.st === 'playing'));
}

// e.g. Thornwood II, or Thornwood 7 in endless
export function stageName(snap) {
  if (snap.sc === 'arena') return 'The Heart of the Wood';
  return `Thornwood ${snap.md === 'endless' ? snap.stg : ['I', 'II', 'III'][snap.stg - 1] || snap.stg}`;
}
