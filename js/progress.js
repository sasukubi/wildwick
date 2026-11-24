// =============================================================
//  Permanent progress: each class has its own level (up to 30),
//  skill tree, prestiges and rebirths, saved on your character.
//  Also: coins + the camp shop, forest events, fish, run modes.
// =============================================================

export const MAX_LEVEL = 30;
// EXP needed to go from `lv` to `lv + 1`. Slow on purpose: mastering a class takes a while.
export function xpNeed(lv) { return 250 + 50 * lv; }

// Only these accounts can open the developer console (usernames are unique online).
export const DEV_USERS = ['jack', 'kubi'];
export const isDev = (user) => DEV_USERS.includes(String(user || '').toLowerCase());

// ---- Prestige ----------------------------------------------
// At level 30 you can prestige: back to level 1 with an empty tree,
// and one of your 4 abilities gets permanently stronger.
export const PRESTIGE = { power: 0.1, cd: 0.94 }; // per pick: +10% damage/healing, 6% shorter cooldown
// Every 5th prestige is a Rebirth: also pick one thing about your Wildfire ultimate.
export const REBIRTH_EVERY = 5;
export const REBIRTHS = [
  { id: 'power', name: 'Blazing', desc: 'Your Wildfire Ability deals 15% more damage and healing.' },
  { id: 'reach', name: 'Surging', desc: 'Your Wildfire Ability is 15% bigger and lasts 15% longer.' },
  { id: 'charge', name: 'Sparking', desc: 'Your Wildfire fills 15% faster.' },
];

// The 4 abilities you can improve when you prestige (classes without a Q skill get their dash instead).
export const SLOTS = {
  warrior: [['atk', 'Strike', 'strike'], ['s2', 'Iron Guard', 'skill2'], ['s1', 'Shockwave', 'skill1'], ['s3', 'Battle Cry', 'skill3']],
  sorcerer: [['atk', 'Shove', 'strike'], ['s2', 'Gale', 'skill2'], ['s1', 'Fireball', 'skill1'], ['s3', 'Frostbite', 'skill3']],
  bowman: [['atk', 'Shoot', 'strike'], ['s2', 'Barrage', 'skill2'], ['s1', 'Mark', 'skill1'], ['dash', 'Roll', 'dash']],
  rogue: [['atk', 'Stab', 'strike'], ['s2', 'Shadowstep', 'skill2'], ['s1', 'Smoke Bomb', 'skill1'], ['dash', 'Shadow Clone', 'dash']],
  cleric: [['atk', 'Swing', 'strike'], ['s2', 'Judgement', 'skill2'], ['s1', 'Kindle', 'skill1'], ['s3', 'Sanctified Ground', 'skill3']],
  warlock: [['atk', 'Bolt', 'strike'], ['s2', 'Swarm', 'skill2'], ['s1', 'Dead Man\'s Reach', 'skill1'], ['s3', 'Soul Siphon', 'skill3']],
};
const SLOT_IDS = ['atk', 's1', 's2', 's3', 'dash'];

const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(+v || 0)));

export function emptyProgress() {
  return { lv: 1, xp: 0, tree: {}, np: 0, pres: { atk: 0, s1: 0, s2: 0, s3: 0, dash: 0 }, reb: { power: 0, reach: 0, charge: 0 } };
}

// make sure a saved progress object is sensible (never trust old or broken saves)
export function cleanProgress(raw) {
  const p = emptyProgress();
  if (!raw || typeof raw !== 'object') return p;
  p.lv = int(raw.lv, 1, MAX_LEVEL);
  p.xp = Math.max(0, +raw.xp || 0);
  p.np = int(raw.np, 0, 9999);
  if (raw.tree && typeof raw.tree === 'object') for (const k in raw.tree) { const v = int(raw.tree[k], 0, 9); if (v) p.tree[k] = v; }
  if (raw.pres) for (const k of SLOT_IDS) p.pres[k] = int(raw.pres[k], 0, 9999);
  if (raw.reb) for (const r of REBIRTHS) p.reb[r.id] = int(raw.reb[r.id], 0, 9999);
  return p;
}

export function cleanAllProgress(raw) {
  const out = {};
  if (raw && typeof raw === 'object') for (const k in raw) if (SLOTS[k]) out[k] = cleanProgress(raw[k]);
  return out;
}

export const spentPoints = (tree) => Object.values(tree || {}).reduce((s, v) => s + v, 0);
export const pointsLeft = (prog) => Math.max(0, prog.lv - 1 - spentPoints(prog.tree));

// ---- Coins and the camp shop --------------------------------
export const SHOP = [
  { id: 'tonic', name: 'Flame Tonic', price: 15, max: 5, key: 'Digit1', desc: 'Drink to restore 40% of your flame.' },
  { id: 'draught', name: 'Ember Draught', price: 35, max: 3, key: 'Digit2', desc: 'Drink for +35 Wildfire.' },
  { id: 'brew', name: 'Swiftroot Brew', price: 12, max: 5, key: 'Digit3', desc: 'Drink to move 20% faster for 12 seconds.' },
  { id: 'charm', name: 'Phoenix Feather', price: 60, max: 2, key: '', desc: 'If you burn out, it relights you once at 40% (used up automatically).' },
  { id: 'seed', name: 'Reclaim Seed', price: 25, max: 9, key: '', desc: 'Take back 1 spent skill point at the Skilltree, to spend somewhere else.' },
];
export function cleanItems(raw) {
  const out = {};
  for (const it of SHOP) out[it.id] = int(raw && raw[it.id], 0, it.max);
  return out;
}

// coins dropped by each kind of enemy (on average)
export const COIN_DROPS = { wolf: [0.6, 1], wisp: [0.25, 1], mossback: [1, 3], shaman: [1, 3], alpha: [1, 12], widow: [1, 12], treant: [1, 30] };

// ---- Forest events: a random twist for a forest ---------------
export const EVENTS = [
  { id: 'fog', name: 'Fog', desc: "Everyone's light is smaller." },
  { id: 'emberstorm', name: 'Wildfire Surge', desc: 'Wildfire drops are doubled.' },
  { id: 'bloodmoon', name: 'Blood Moon', desc: 'Enemies are faster, but give 30% more EXP.' },
  { id: 'goldrush', name: 'Gold Rush', desc: 'Enemies drop twice the coins.' },
  { id: 'fireflies', name: 'Firefly Forest', desc: 'Brighter light, and embers heal 50% more.' },
  { id: 'swarm', name: 'Wisp Swarm', desc: 'Swarms of wisps fill the forest.' },
  { id: 'restless', name: 'Restless Pack', desc: 'Fewer wolves, but far more elites.' },
];

// ---- Fishing (camp pond) ------------------------------------
export const FISH = [
  { id: 'minnow', name: 'Moss Minnow', w: 40, col: '#9fc25a' },
  { id: 'perch', name: 'Bark Perch', w: 26, col: '#c49a6a' },
  { id: 'trout', name: 'Dusk Trout', w: 16, col: '#c486ff' },
  { id: 'ember', name: 'Emberfin', w: 9, col: '#ff8a3c' },
  { id: 'eel', name: 'Lantern Eel', w: 6, col: '#9fe8ff' },
  { id: 'koi', name: 'Starlit Koi', w: 2.5, col: '#fff3c4' },
  { id: 'boot', name: 'An old boot', w: 6, col: '#7a5a3a' },
];
export function rollFish() {
  const total = FISH.reduce((s, f) => s + f.w, 0);
  let r = Math.random() * total;
  for (const f of FISH) { r -= f.w; if (r <= 0) return f; }
  return FISH[0];
}

// ---- Run modes ----------------------------------------------
export const MODES = [
  { id: 'casual', name: 'Casual run', desc: 'A brand-new forest every time: 3 forests and the Creaking Oak.' },
  { id: 'daily', name: 'Daily run', desc: "Today's forest, the same for everyone. Your best time goes on the leaderboard." },
  { id: 'endless', name: 'Endless', desc: 'Forest after forest, harder every time, a boss every 3rd. Save at camp between forests.' },
];
export function todayKey() { return new Date().toISOString().slice(0, 10); } // e.g. 2026-11-24 (UTC)
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
