// =============================================================
//  Menus: log in / sign up -> pick a character -> host or join.
// =============================================================
import { createBackend, MAX_CHARACTERS } from './accounts.js';
import { hostRoom, joinRoom } from './net.js';
import { Game } from './game.js';
import { CLASSES, CLOAKS, byId } from './data.js';
import { drawPreview } from './render.js';
import { toast, settings, pause } from './ui.js';
import { getRoomPref, setRoomPref } from './prefs.js';
import { audio } from './audio.js';

const $ = (s) => document.querySelector(s);
const backend = createBackend();
let current = null;
let game = null;

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  document.body.classList.toggle('in-game', id === null);
}

async function busy(btn, fn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';
  try { await fn(); } finally { btn.disabled = false; btn.textContent = label; }
}

// sound needs a first click or key press before browsers allow it
const unlock = () => audio.unlock();
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
// UI sounds for every button
document.addEventListener('click', (e) => { if (e.target.closest('button')) audio.play('click'); });
document.addEventListener('pointerover', (e) => {
  const b = e.target.closest('button');
  if (b && !b.disabled && b !== document.lastHover) { document.lastHover = b; audio.play('hover'); }
});
// Esc opens settings from the menus too
addEventListener('keydown', (e) => { if (e.code === 'Escape' && !game) settings.toggle(false); });
$('#menu-gear').addEventListener('click', () => settings.toggle(false));
$('#btn-gear').addEventListener('click', () => { if (game) pause.toggle(game); else settings.toggle(false); });

// ---------------------------------------------------- login
$('#backend-note').textContent = backend.note;

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  busy($('#btn-login'), async () => {
    $('#login-error').textContent = '';
    try {
      await backend.logIn($('#username').value.trim(), $('#password').value);
      $('#password').value = '';
      await enterAccount();
    } catch (err) { $('#login-error').textContent = err.message; }
  });
});

$('#btn-signup').addEventListener('click', () => {
  busy($('#btn-signup'), async () => {
    $('#login-error').textContent = '';
    try {
      await backend.signUp($('#username').value.trim(), $('#password').value);
      $('#password').value = '';
      await enterAccount();
    } catch (err) { $('#login-error').textContent = err.message; }
  });
});

// ---------------------------------------------------- characters
// One character per account: you play as your account. If you made several
// characters before, the one you played most recently is kept.
async function enterAccount() {
  show(null);
  let chars = [], c = null;
  try {
    chars = await backend.listChars();
    c = chars.slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0];
    if (chars.length && !chars.some((x) => x.lastPlayed)) c = chars[chars.length - 1];
    if (!c) {
      const cloak = CLOAKS[Math.floor(Math.random() * CLOAKS.length)].id;
      c = await backend.createChar({ name: backend.username, cloak, hat: 'hood', flame: 'amber', cls: 'warrior' });
    }
  } catch (err) {
    // couldn't load or save your character: back to the login screen with the reason (instead of a blank screen)
    show('screen-login');
    $('#login-error').textContent = `Couldn't load your character: ${err.message}`;
    return;
  }
  c.name = backend.username;
  c.lastPlayed = Date.now();
  backend.saveChar(c).catch(() => {});
  startOwnCamp(c);
}

async function showChars() {
  show('screen-chars');
  audio.setScene('menu');
  $('#who').textContent = backend.username;
  $('#chars-error').textContent = '';
  let chars = [];
  try { chars = await backend.listChars(); } catch (err) { $('#chars-error').textContent = err.message; }
  const list = $('#char-list');
  list.innerHTML = '';
  if (!chars.length) list.innerHTML = '<p class="muted">No characters yet. Name your first wanderer below.</p>';
  for (const c of chars) {
    const card = document.createElement('div');
    card.className = 'char-card glass';
    const cv = document.createElement('canvas');
    cv.width = 88; cv.height = 96;
    drawPreview(cv, c);
    card.appendChild(cv);
    const info = document.createElement('div');
    info.className = 'char-info';
    info.innerHTML = '<strong></strong><span class="muted"></span>';
    info.querySelector('strong').textContent = c.name;
    info.querySelector('span').textContent = byId(CLASSES, c.cls).name;
    card.appendChild(info);
    const play = document.createElement('button');
    play.className = 'gbtn primary';
    play.textContent = 'Play';
    play.onclick = () => startOwnCamp(c);
    const del = document.createElement('button');
    del.className = 'gbtn small';
    del.textContent = 'Delete';
    del.onclick = async () => {
      const { confirmDialog } = await import('./ui.js');
      if (!(await confirmDialog(`Delete ${c.name}? This can't be undone.`, 'Delete'))) return;
      try { await backend.deleteChar(c.id); } catch (err) { $('#chars-error').textContent = err.message; }
      showChars();
    };
    const btns = document.createElement('div');
    btns.className = 'char-btns';
    btns.append(play, del);
    card.appendChild(btns);
    list.appendChild(card);
  }
  $('#create-form').classList.toggle('hidden', chars.length >= MAX_CHARACTERS);
}

$('#create-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#new-name').value.trim().replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N} '_-]{1,16}$/u.test(name)) { $('#chars-error').textContent = 'Names are 1–16 letters, numbers or spaces.'; return; }
  busy($('#btn-create'), async () => {
    try {
      const cloak = CLOAKS[Math.floor(Math.random() * CLOAKS.length)].id;
      await backend.createChar({ name, cloak, hat: 'hood', flame: 'amber', cls: 'warrior' });
      $('#new-name').value = '';
      await showChars();
    } catch (err) { $('#chars-error').textContent = err.message; }
  });
});

$('#btn-logout').addEventListener('click', async () => {
  await backend.logOut();
  show('screen-login');
});

// ---------------------------------------------------- your campfire is the main screen
// Pick a character -> you land in your own camp (solo). The campfire lets you
// open your camp to friends (seamlessly) or join a friend's camp.
function campHooks() {
  return {
    host: async (code, use, typed) => {
      setRoomPref({ use, custom: typed });
      const room = await hostRoom(code);
      setRoomPref({ last: room.code });
      if (game) game.attachRoom(room);
      toast(`Your camp is open! Room code: ${room.code}`);
      if (room.codeChanged) toast(`${code} was still in use, so your code this time is ${room.code}.`);
    },
    join: async (code) => {
      const room = await joinRoom(code); // connect first, so a bad code keeps you in your camp
      startGame(room, false);
    },
    logout: async () => { const g = game; game = null; if (g) { g.onLeave = () => {}; g.leave(''); } await backend.logOut(); show('screen-login'); },
  };
}

function startOwnCamp(c, msg) {
  current = c;
  startGame(null, true);
  if (msg) toast(msg);
}

function startGame(room, isHost) {
  const old = game;
  if (old) { old.onLeave = () => {}; old.leave(''); }
  show(null);
  settings.close();
  $('#room-code').textContent = room ? room.code : '';
  game = new Game({
    canvas: $('#game'),
    room,
    isHost,
    character: current,
    user: backend.username,
    backend,
    hooks: campHooks(),
    // leaving a friend's camp (or them closing it) puts you back in your own camp
    onLeave: (msg) => {
      game = null;
      $('#help').classList.add('hidden');
      startOwnCamp(current, msg);
    },
  });
}

$('#btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#room-code').textContent); toast('Room code copied. Paste it in Discord!'); }
  catch { toast('Could not copy. The code is ' + $('#room-code').textContent); }
});

// the main theme keeps playing on the menus (the game drives music once you're in camp)
audio.setScene('menu');
setInterval(() => { if (!game) audio.update(0.05); }, 50);

// handy for testing in the browser console: wildwick.game
window.wildwick = { get game() { return game; } };

// ---------------------------------------------------- the Pixel Campfire logo (+ browser tab icon)
const FLAME_MAP = [
  '.....O......', '....OO......', '....OMO.....', '...OMMO..O..', '...OMMMO.OO.', '..OMMYMMOMO.',
  '..OMMYYMMMO.', '.OMMYYYMMMMO', '.OMYYWYYMMMO', '.OMYWWWYYMMO', '.OMYWWWWYMMO', '.OMMYWWYYMMO',
  '..OMYYYYYMO.', '...OMMMMMO..', '..BBOOOOOBB.', '.bbBBBBBBbb.', '..bb....bb..',
];
const FLAME_COL = { O: '#d8401f', M: '#ff8a2b', Y: '#ffc94d', W: '#fff3c4', B: '#7a4a26', b: '#4a2c16' };
function flameRects(px, ox, oy) {
  let r = '';
  FLAME_MAP.forEach((row, y) => [...row].forEach((ch, x) => {
    if (FLAME_COL[ch]) r += `<rect x="${ox + x * px}" y="${oy + y * px}" width="${px}" height="${px}" fill="${FLAME_COL[ch]}"/>`;
  }));
  return r;
}
$('#logo').innerHTML = `
  <svg viewBox="0 0 660 220" shape-rendering="crispEdges">
    <defs><radialGradient id="lgWarm" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffb347" stop-opacity="0.55"/><stop offset="1" stop-color="#ff7a2b" stop-opacity="0"/></radialGradient></defs>
    <circle cx="88" cy="110" r="95" fill="url(#lgWarm)" shape-rendering="auto"/>
    ${flameRects(9, 34, 28)}
    <rect x="150" y="30" width="6" height="6" fill="#ffc94d"/><rect x="24" y="60" width="6" height="6" fill="#ffc94d"/><rect x="160" y="90" width="6" height="6" fill="#ffc94d"/>
    <text x="172" y="138" font-family="'Alegreya Sans SC'" font-weight="700" font-size="92" fill="#6b230c">wildwick</text>
    <text x="166" y="132" font-family="'Alegreya Sans SC'" font-weight="700" font-size="92" fill="#ffcf5a" stroke="#2a1608" stroke-width="4" paint-order="stroke">wildwick</text>
    <text x="170" y="180" font-family="'Alegreya Sans SC'" font-weight="700" font-size="20" letter-spacing="3" fill="#9fc25a">keep your flame alive</text>
  </svg>`;
$('#favicon').href = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 17" shape-rendering="crispEdges">${flameRects(1, 0, 0)}</svg>`);

// fireflies behind the menus
const ff = $('#fireflies');
for (let i = 0; i < 26; i++) {
  const s = document.createElement('span');
  s.style.left = Math.random() * 100 + '%';
  s.style.top = Math.random() * 100 + '%';
  s.style.animationDelay = -Math.random() * 12 + 's';
  s.style.animationDuration = 8 + Math.random() * 8 + 's';
  ff.appendChild(s);
}

(async () => {
  try {
    if (await backend.restore()) { await enterAccount(); return; }
  } catch (err) { $('#login-error').textContent = err.message; }
  show('screen-login');
})();
