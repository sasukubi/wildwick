// =============================================================
//  Menus: log in / sign up -> pick a character -> host or join.
// =============================================================
import { createBackend, MAX_CHARACTERS } from './accounts.js';
import { hostRoom, joinRoom } from './net.js';
import { Game } from './game.js';
import { CLASSES, CLOAKS, byId } from './data.js';
import { drawPreview } from './render.js';
import { toast, settings } from './ui.js';
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
$('#btn-gear').addEventListener('click', () => settings.toggle(!!game));

// ---------------------------------------------------- login
$('#backend-note').textContent = backend.note;

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  busy($('#btn-login'), async () => {
    $('#login-error').textContent = '';
    try {
      await backend.logIn($('#username').value.trim(), $('#password').value);
      $('#password').value = '';
      await showChars();
    } catch (err) { $('#login-error').textContent = err.message; }
  });
});

$('#btn-signup').addEventListener('click', () => {
  busy($('#btn-signup'), async () => {
    $('#login-error').textContent = '';
    try {
      await backend.signUp($('#username').value.trim(), $('#password').value);
      $('#password').value = '';
      await showChars();
    } catch (err) { $('#login-error').textContent = err.message; }
  });
});

// ---------------------------------------------------- characters
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
    play.onclick = () => showMenu(c);
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

// ---------------------------------------------------- host / join
function showMenu(c) {
  current = c;
  show('screen-menu');
  drawPreview($('#menu-preview'), c);
  $('#menu-name').textContent = c.name;
  $('#menu-class').textContent = `${byId(CLASSES, c.cls).name} · played by ${backend.username}`;
  $('#menu-error').textContent = '';
}

$('#btn-host').addEventListener('click', () => {
  busy($('#btn-host'), async () => {
    $('#menu-error').textContent = '';
    try { startGame(await hostRoom(), true); } catch (err) { $('#menu-error').textContent = err.message; }
  });
});

$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#join-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { $('#menu-error').textContent = 'Room codes are 5 characters.'; return; }
  busy($('#btn-join'), async () => {
    $('#menu-error').textContent = '';
    try { startGame(await joinRoom(code), false); } catch (err) { $('#menu-error').textContent = err.message; }
  });
});

$('#btn-back').addEventListener('click', () => showChars());

function startGame(room, isHost) {
  show(null);
  settings.close();
  $('#room-code').textContent = room.code;
  game = new Game({
    canvas: $('#game'),
    room,
    isHost,
    character: current,
    user: backend.username,
    backend,
    onLeave: (msg) => {
      game = null;
      $('#help').classList.add('hidden');
      showMenu(current);
      if (msg) $('#menu-error').textContent = msg;
    },
  });
}

$('#btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#room-code').textContent); toast('Room code copied. Paste it in Discord!'); }
  catch { toast('Could not copy. The code is ' + $('#room-code').textContent); }
});

// handy for testing in the browser console: wildwick.game
window.wildwick = { get game() { return game; } };

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
    if (await backend.restore()) { await showChars(); return; }
  } catch (err) { $('#login-error').textContent = err.message; }
  show('screen-login');
})();
