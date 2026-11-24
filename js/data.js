// =============================================================
//  Wildwick game data
//  All the numbers and lists that define the game live here.
//  Change these to tune how the game feels.
//  (Distances are in "art pixels": one map tile is 32 of them.)
// =============================================================

export const TILE = 32;
export const MAX_PLAYERS = 4;
export const PLAYER_RADIUS = 9;

// Cloak colours. No two players in a party can wear the same one.
export const CLOAKS = [
  { id: 'ember', name: 'Ember', hex: '#c4533a' },
  { id: 'moss',  name: 'Moss',  hex: '#4d8a3c' },
  { id: 'tide',  name: 'Tide',  hex: '#2f6fa8' },
  { id: 'dusk',  name: 'Dusk',  hex: '#7b4fb0' },
  { id: 'gold',  name: 'Gold',  hex: '#c99a2e' },
  { id: 'rose',  name: 'Rose',  hex: '#c45a92' },
  { id: 'ash',   name: 'Ash',   hex: '#7d838c' },
  { id: 'frost', name: 'Frost', hex: '#5fbfc6' },
];

export const HATS = [
  { id: 'none',     name: 'None' },
  { id: 'hood',     name: 'Hood' },
  { id: 'witch',    name: 'Witch Hat' },
  { id: 'antlers',  name: 'Antlers' },
  { id: 'mushroom', name: 'Mushroom Cap' },
  { id: 'circlet',  name: 'Circlet' },
];

// Flame colours: your flame is your health bar AND your light.
export const FLAMES = [
  { id: 'amber',   name: 'Amber',      core: '#fff4c8', mid: '#ffb13b', outer: '#ff5a1a', light: [255, 170, 90] },
  { id: 'azure',   name: 'Azure',      core: '#eafcff', mid: '#5cc8ff', outer: '#2a6dff', light: [120, 185, 255] },
  { id: 'verdant', name: 'Verdant',    core: '#f2ffe0', mid: '#8dff6a', outer: '#2fbf4a', light: [140, 255, 150] },
  { id: 'violet',  name: 'Violet',     core: '#fbeaff', mid: '#d07bff', outer: '#7a2fff', light: [205, 140, 255] },
  { id: 'pale',    name: 'Ghostlight', core: '#ffffff', mid: '#d9f2ef', outer: '#8fb8b4', light: [215, 240, 235] },
];

export const CLASSES = [
  { id: 'warrior',  name: 'Warrior',  available: true,  color: '#ff8a4c', blurb: 'Fights harder the dimmer their flame burns.' },
  { id: 'warlock',  name: 'Warlock',  available: false, color: '#9b6bff', blurb: 'Commands a shadow familiar that feeds on darkness.' },
  { id: 'bowman',   name: 'Bowman',   available: false, color: '#8fd36b', blurb: 'Charged shots that pierce whole packs.' },
  { id: 'rogue',    name: 'Rogue',    available: false, color: '#d0d4e0', blurb: 'Dashes leave afterimages that draw enemies away.' },
  { id: 'sorcerer', name: 'Sorcerer', available: false, color: '#58b8ff', blurb: 'Weaves two spells together into one.' },
  { id: 'cleric',   name: 'Cleric',   available: false, color: '#ffe08a', blurb: 'Gives away their own flame to heal allies.' },
];

// ---- Warrior ------------------------------------------------
export const WARRIOR = {
  speed: 150,
  maxFlame: 100,
  atkCd: 0.42, atkRange: 58, atkArc: 2.0, atkDmg: 14, heavyMult: 1.7,
  dashSpeed: 520, dashTime: 0.17, dashCd: 1.1,
  // Cinder Quake: burn some of your own flame to slam the ground
  quakeCd: 9, quakeCost: 10, quakeRadius: 108, quakeDmg: 30,
  // Smoulder Guard: hold to block hits from the front, release to counter-slash
  guardMax: 2.5, guardCd: 4, guardArc: 2.1, guardSlow: 0.4,
  counterBase: 15, counterPerHeat: 2.0, counterRange: 74, counterArc: 2.8, perfectWindow: 0.25,
  // Pyre Cleave (Wildfire ultimate)
  pyreDmg: 80, pyreRange: 125, pyreArc: 3.8, pyreTrail: 4, pyreTrailDps: 30,
  furyMax: 0.8,      // Dark Fury: up to +80% damage at almost no flame
};

// ---- Enemies ------------------------------------------------
export const WOLF = {
  r: 11, hp: 42, aggro: 300, chaseSpeed: 138,
  lungeRange: 104, windup: 0.5, lungeTime: 0.28, lungeSpeed: 420, recover: 0.65,
  dmg: 12, xp: 6,
};
// Ember-touched elites: rare, tougher, and they drop Wildfire.
export const ELITE = { chance: 0.12, hpMult: 2.6, speedMult: 1.15, dmgMult: 1.3, xp: 25, fuel: 35 };
// Mini boss guarding each forest's gate.
export const ALPHA = {
  name: 'Alpha Thornwolf', r: 18, hp: 420, aggro: 360, chaseSpeed: 128,
  lungeRange: 150, windup: 0.65, lunges: 3, lungeTime: 0.3, lungeSpeed: 470, recover: 1.1,
  dmg: 18, howlCd: 12, xp: 90, fuel: 60,
};
// Final boss.
export const TREANT = {
  name: 'The Elder Treant', r: 40, hp: 1800, speed: 26, attackCd: 2.3,
  rootDelay: 1.0, rootR: 38, rootDmg: 20,
  sweepRange: 160, sweepArc: 2.1, sweepWindup: 0.8, sweepDmg: 26,
  fuel: 100,
};

// ---- Flame, Wildfire, reviving, runs ------------------------
export const RULES = {
  emberHeal: 12,          // flame restored by one ember
  emberChance: 0.45,      // chance a normal enemy drops an ember
  wildfireMax: 100,
  shrineFuel: 50,         // Heartwood shrines
  shrineChance: 0.6,      // chance a forest has a shrine
  reviveTime: 3, reviveFlame: 35, reviveRange: 48,
  forestStages: 3,        // then the final boss
  restTime: 45,           // seconds to pick a boon between stages
};

export function xpToNext(level) { return 30 + level * 25; }

// ---- Warrior skill tree -------------------------------------
// Each level gives everyone 1 point. Spend them here (T / Tab).
// The last upgrade in each group unlocks after 5 points in that group.
export const WARRIOR_TREE = [
  {
    id: 'fury', name: 'Fury', color: '#ff7a4c', blurb: 'Hit harder the lower your flame.',
    nodes: [
      { id: 'darkfury', name: 'Deeper Dark', max: 3, desc: 'Dark Fury can reach +25% more damage.' },
      { id: 'swift', name: 'Swift Blade', max: 3, desc: 'Swing your sword 8% faster.' },
      { id: 'third', name: 'Crushing Third', max: 2, desc: 'Every 3rd hit deals +40% more.' },
      { id: 'embers', name: 'Embers in the Dark', max: 1, cap: true, desc: 'Kills while under 40% flame restore 4 flame.' },
    ],
  },
  {
    id: 'bulwark', name: 'Bulwark', color: '#7fb6ff', blurb: 'Block, counter and outlast.',
    nodes: [
      { id: 'guard', name: 'Tempered Guard', max: 3, desc: 'Wider block, and blocked hits store 25% more heat.' },
      { id: 'wick', name: 'Thick Wick', max: 3, desc: '+15 max flame.' },
      { id: 'riposte', name: 'Riposte', max: 2, desc: 'Counter-slash deals +30% damage.' },
      { id: 'unbroken', name: 'Unbroken', max: 1, cap: true, desc: 'Blocking right as a hit lands stuns the attacker.' },
    ],
  },
  {
    id: 'cinder', name: 'Cinder', color: '#ffc24c', blurb: 'Bigger quakes, longer fires.',
    nodes: [
      { id: 'wide', name: 'Wide Quake', max: 3, desc: 'Cinder Quake reaches 15% further.' },
      { id: 'sear', name: 'Searing Quake', max: 3, desc: 'Cinder Quake deals +20% damage.' },
      { id: 'lean', name: 'Lean Burn', max: 2, desc: 'Cinder Quake costs 3 less flame.' },
      { id: 'pyrelord', name: 'Pyre Lord', max: 1, cap: true, desc: 'Pyre Cleave fire lasts twice as long, and you gain Wildfire 25% faster.' },
    ],
  },
];
export const CAP_REQUIREMENT = 5;

export function treeNode(id) {
  for (const b of WARRIOR_TREE) for (const n of b.nodes) if (n.id === id) return { branch: b, node: n };
  return null;
}
export function branchSpent(tree, branch) {
  return branch.nodes.reduce((s, n) => s + (tree[n.id] || 0), 0);
}
export function canBuy(tree, pts, id) {
  const f = treeNode(id);
  if (!f || pts <= 0) return false;
  if ((tree[id] || 0) >= f.node.max) return false;
  if (f.node.cap && branchSpent(tree, f.branch) < CAP_REQUIREMENT) return false;
  return true;
}

// ---- Boons: pick 1 of 3 between stages ----------------------
export const BOONS = [
  { id: 'sharp',   name: 'Whetstone',      icon: '⚔', desc: '+12% damage' },
  { id: 'wick',    name: 'Spare Wick',     icon: '🕯', desc: '+15 max flame' },
  { id: 'swift',   name: 'Fleetfoot Moss', icon: '🍃', desc: '+10% move speed' },
  { id: 'ember',   name: 'Ember Pouch',    icon: '🔥', desc: 'Embers heal 50% more' },
  { id: 'dash',    name: 'Feather Cloak',  icon: '🪶', desc: 'Dash recharges 25% faster' },
  { id: 'quake',   name: 'Rumbling Stone', icon: '🪨', desc: 'Cinder Quake recharges 20% faster' },
  { id: 'kindle',  name: 'Kindling',       icon: '✨', desc: '+30 Wildfire now, +15% Wildfire gain' },
  { id: 'leech',   name: 'Hungry Flame',   icon: '🩸', desc: 'Every hit restores 1 flame' },
  { id: 'thorn',   name: 'Thornhide',      icon: '🌿', desc: 'Take 12% less damage' },
  { id: 'scholar', name: "Owl's Wisdom",   icon: '🦉', desc: '+25% EXP for the whole party' },
];

// Works out a Warrior's real numbers from their skill tree and boons.
export function warriorStats(tree = {}, boons = []) {
  const r = (id) => tree[id] || 0;
  const b = (id) => boons.filter((x) => x === id).length;
  const W = WARRIOR;
  return {
    maxFlame: W.maxFlame + 15 * r('wick') + 15 * b('wick'),
    speed: W.speed * (1 + 0.1 * b('swift')),
    dmgMult: 1 + 0.12 * b('sharp'),
    atkCd: W.atkCd * Math.pow(0.92, r('swift')),
    heavyMult: W.heavyMult + 0.4 * r('third'),
    furyMax: W.furyMax + 0.25 * r('darkfury'),
    dashCd: W.dashCd * Math.pow(0.75, b('dash')),
    quakeCd: W.quakeCd * Math.pow(0.8, b('quake')),
    quakeRadius: W.quakeRadius * (1 + 0.15 * r('wide')),
    quakeDmg: W.quakeDmg * (1 + 0.2 * r('sear')),
    quakeCost: Math.max(0, W.quakeCost - 3 * r('lean')),
    guardArc: W.guardArc + 0.25 * r('guard'),
    heatMult: 1 + 0.25 * r('guard'),
    counterMult: 1 + 0.3 * r('riposte'),
    emberHeal: RULES.emberHeal * (1 + 0.5 * b('ember')),
    wfGain: (1 + 0.15 * b('kindle')) * (r('pyrelord') ? 1.25 : 1),
    trailMult: r('pyrelord') ? 2 : 1,
    leech: b('leech'),
    dmgTaken: Math.pow(0.88, b('thorn')),
    embersInDark: r('embers') > 0,
    unbroken: r('unbroken') > 0,
  };
}

export function byId(list, id) {
  return list.find((x) => x.id === id) || list[0];
}
