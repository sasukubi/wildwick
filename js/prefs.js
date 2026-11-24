// =============================================================
//  Player settings (video, controls, gameplay), saved in this browser.
//  Volume lives in audio.js.
// =============================================================

export const DEFAULT_KEYS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  dash: 'Space', skill1: 'KeyE', skill3: 'KeyQ', ult: 'KeyR',
  interact: 'KeyF', tree: 'Tab', controls: 'KeyH', strike: '', skill2: '',
  chat: 'KeyT', photo: 'KeyP',
};

export const KEY_ACTIONS = [
  { id: 'up', name: 'Move up' }, { id: 'down', name: 'Move down' },
  { id: 'left', name: 'Move left' }, { id: 'right', name: 'Move right' },
  { id: 'dash', name: 'Dash' },
  { id: 'strike', name: 'Attack (also left click)' },
  { id: 'skill2', name: 'Skill 2: Guard / Gale / Rain / Shadowstep / Judgement / Imps (also right click)' },
  { id: 'skill1', name: 'Skill 1: Quake / Fireball / Mark / Smoke Bomb / Kindle / Hands' },
  { id: 'skill3', name: 'Skill 3: Battle Cry / Frostbite / Sanctified Ground / Soul Siphon' },
  { id: 'ult', name: 'Wildfire Ability' },
  { id: 'interact', name: 'Interact' },
  { id: 'tree', name: 'Skill tree (view)' },
  { id: 'chat', name: 'Chat' },
  { id: 'photo', name: 'Photo mode' },
  { id: 'controls', name: 'Show controls' },
];

// Room code: reuse your last one (so friends can rejoin) or set your own.
export function getRoomPref() {
  try { return JSON.parse(localStorage.getItem('wildwick.room') || '{}'); } catch { return {}; }
}
export function setRoomPref(v) {
  try { localStorage.setItem('wildwick.room', JSON.stringify({ ...getRoomPref(), ...v })); } catch { /* ignore */ }
}

const DEFAULTS = {
  brightness: 1,        // 0.5 .. 1.5
  zoom: 'auto',         // 'auto' | 1 | 2 | 3 | 4
  shake: 1,             // 0 .. 1
  particles: 'high',    // 'low' | 'high'
  dmgNums: true,
  names: true,
  hint: true,
  cbSafe: false,        // colour-blind friendly warnings
  guardToggle: false,   // tap to raise / lower block instead of holding
  keys: { ...DEFAULT_KEYS },
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem('wildwick.prefs') || '{}');
    const keys = { ...DEFAULT_KEYS, ...(saved.keys || {}) };
    if (keys.tree === 'KeyT' && keys.chat === 'KeyT') keys.tree = 'Tab'; // T is chat now; the skill tree moved to Tab
    return { ...DEFAULTS, ...saved, keys };
  } catch { return { ...DEFAULTS, keys: { ...DEFAULT_KEYS } }; }
}

export const prefs = load();

export function savePrefs() {
  try { localStorage.setItem('wildwick.prefs', JSON.stringify(prefs)); } catch { /* ignore */ }
}

export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return '↑↓←→'['UpDownLeftRight'.indexOf(code.slice(5)) / 2 | 0] || code;
  return { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', Tab: 'Tab', AltLeft: 'Alt' }[code] || code;
}
