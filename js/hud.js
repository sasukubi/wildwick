// =============================================================
//  The in-game HUD (HTML, glass style). Updated every frame, but
//  only touches the page when a value actually changes.
// =============================================================
import { CLOAKS, FLAMES, WARRIOR, RULES, byId } from './data.js';

const $ = (s) => document.querySelector(s);
const last = new Map();
function set(el, prop, value) {
  const k = el.id + prop;
  if (last.get(k) === value) return;
  last.set(k, value);
  if (prop === 'text') el.textContent = value;
  else if (prop === 'hide') el.classList.toggle('hidden', value);
  else if (prop.startsWith('--')) el.style.setProperty(prop, value);
  else el.style[prop] = value;
}

const SKILLS = [
  { id: 'atk', name: 'Strike', kb: 'LMB', pad: 'RT', icon: '⚔' },
  { id: 'guard', name: 'Smoulder Guard', kb: 'RMB', pad: 'LT', icon: '🛡' },
  { id: 'quake', name: 'Cinder Quake', kb: 'E', pad: 'X', icon: '💥' },
  { id: 'dash', name: 'Dash', kb: 'Space', pad: 'A', icon: '»' },
  { id: 'ult', name: 'Pyre Cleave', kb: 'R', pad: 'RB', icon: '🔥' },
];

export function buildHud() {
  const box = $('#skills');
  box.innerHTML = '';
  for (const s of SKILLS) {
    const el = document.createElement('div');
    el.className = 'skill glass' + (s.id === 'ult' ? ' ult' : '');
    el.id = 'sk-' + s.id;
    el.title = s.name;
    el.innerHTML = `<span class="ico"></span><span class="key"></span>`;
    el.querySelector('.ico').textContent = s.icon;
    box.appendChild(el);
  }
  last.clear();
}

export function updateHud(game, snap, me) {
  const pad = game.input.device === 'pad';
  const stats = game.myStats();
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
    c.querySelector('small').textContent = p.dn ? 'Flame out!' : p.n;
    c.classList.toggle('down', !!p.dn);
    const fill = c.querySelector('.mini i');
    fill.style.width = (p.hp / p.mx) * 100 + '%';
    fill.style.background = byId(FLAMES, p.f).mid;
  }

  // stage pill
  const mm = String(Math.floor(snap.tm / 60)).padStart(2, '0'), ss = String(snap.tm % 60).padStart(2, '0');
  let name = '', sub = '';
  if (snap.sc === 'lobby') {
    const z = game.world.readyZone;
    const ready = snap.ps.filter((p) => p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h).length;
    name = 'The Campfire';
    sub = `Everyone onto the glowing path to begin · ${ready}/${snap.ps.length}`;
  } else if (snap.st === 'rest') { name = 'A quiet moment'; sub = 'Pick a boon, spend skill points'; }
  else if (snap.sc === 'forest') {
    name = `Thornwood ${['I', 'II', 'III'][snap.stg - 1] || ''} · ${mm}:${ss}`;
    sub = snap.go ? 'The gate is open: everyone into the Heartwood Gate' : 'Find and defeat the Alpha Thornwolf';
  } else { name = `The Heart of the Wood · ${mm}:${ss}`; sub = 'Defeat the Elder Treant'; }
  set($('#stage-name'), 'text', name);
  set($('#stage-sub'), 'text', sub);

  // boss bar
  set($('#bossbar'), 'hide', !snap.bb);
  if (snap.bb) {
    set($('#boss-name'), 'text', snap.bb.n);
    set($('#boss-fill'), 'width', (snap.bb.hp / snap.bb.mx) * 100 + '%');
  }

  // flame
  const ratio = me.hp / me.mx;
  const pal = byId(FLAMES, me.f);
  set($('#flame-fill'), 'width', ratio * 100 + '%');
  set($('#flame-fill'), 'background', `linear-gradient(90deg, ${pal.outer}, ${pal.mid} 60%, ${pal.core})`);
  set($('#flame-text'), 'text', me.dn ? 'Flame out' : `Flame ${me.hp} / ${me.mx}`);
  // wildfire
  const wf = me.wf / RULES.wildfireMax;
  set($('#wild-fill'), 'width', wf * 100 + '%');
  set($('#bars'), '--ready', wf >= 1 ? '1' : '0');
  $('#bars').classList.toggle('ready', wf >= 1);
  set($('#wild-text'), 'text', wf >= 1 ? `Wildfire ready! [${pad ? 'RB' : 'R'}]` : `Wildfire ${me.wf}%`);
  // exp
  set($('#lvl'), 'text', `Lv ${snap.lvl}`);
  set($('#xp-fill'), 'width', (snap.xp / snap.nx) * 100 + '%');
  set($('#pts'), 'hide', !me.pts);
  set($('#pts'), 'text', `+${me.pts} skill point${me.pts > 1 ? 's' : ''} [${pad ? 'View' : 'T'}]`);
  const fury = Math.round(stats.furyMax * (1 - ratio) * 100);
  set($('#fury'), 'text', snap.sc !== 'lobby' && !me.dn && fury >= 5 ? `Dark Fury +${fury}% damage` : '');
  set($('#hud'), '--lowflame', ratio < 0.35 && snap.sc !== 'lobby' ? '1' : '0');

  // skills (cooldown sweep)
  const cds = {
    atk: Math.max(0, game.lp.atkCd) / stats.atkCd,
    guard: me.g ? 0 : me.gc / WARRIOR.guardCd,
    quake: me.qc / stats.quakeCd,
    dash: Math.max(0, game.lp.dashCd) / stats.dashCd,
    ult: 1 - wf,
  };
  for (const s of SKILLS) {
    const el = document.getElementById('sk-' + s.id);
    set(el, '--cd', Math.max(0, Math.min(1, cds[s.id])).toFixed(2));
    const key = el.querySelector('.key');
    const k = pad ? s.pad : s.kb;
    if (key.textContent !== k) key.textContent = k;
    el.classList.toggle('active', s.id === 'guard' && !!me.g);
    el.classList.toggle('ready', s.id === 'ult' && wf >= 1);
  }

  // centre banner
  let big = '', small = '';
  if (snap.cd > 0) { big = `Into the Wilds in ${snap.cd}`; small = 'Stay on the path…'; }
  else if (snap.st === 'victory') { big = 'The Heart of the Wood is free'; small = `You defeated the Elder Treant! Back to camp in ${snap.stt}…`; }
  else if (snap.st === 'defeat') { big = 'All flames went out'; small = `The forest grows dark. Back to camp in ${snap.stt}…`; }
  else if (me.dn && snap.st === 'playing') { big = 'Your flame went out'; small = 'An ally can rekindle you by standing close.'; }
  else if (game.bannerT > 0) { big = game.bannerText; small = game.bannerSub || ''; }
  set($('#banner'), 'hide', !big);
  set($('#banner-big'), 'text', big);
  set($('#banner-sub'), 'text', small);
  $('#banner').classList.toggle('bad', snap.st === 'defeat' || (!!me.dn && snap.st === 'playing'));
}
