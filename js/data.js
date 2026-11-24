// =============================================================
//  Wildwick game data
//  All the numbers and lists that define the game live here.
//  Change these to tune how the game feels.
// =============================================================

export const TILE = 40;          // size of one map tile in pixels
export const MAX_PLAYERS = 4;
export const PLAYER_RADIUS = 12;

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
  speed: 185,          // pixels per second
  maxFlame: 100,
  atkCd: 0.42,         // seconds between sword swings
  atkRange: 72,
  atkArc: 2.0,         // radians (~115 degrees)
  atkDmg: 14,
  heavyMult: 1.7,      // every 3rd swing is a heavy hit
  dashSpeed: 640,
  dashTime: 0.17,
  dashCd: 1.1,
  skillCd: 9,          // Cinder Quake cooldown
  skillCost: 10,       // flame burned to cast Cinder Quake
  skillRadius: 135,
  skillDmg: 30,
  furyMax: 0.8,        // Dark Fury: up to +80% damage at almost no flame
};

// ---- Thorn-wolf ---------------------------------------------
export const WOLF = {
  r: 15,
  hp: 42,
  aggro: 380,          // how close you must be before it notices you
  chaseSpeed: 172,
  lungeRange: 130,
  windup: 0.5,         // the warning before a lunge
  lungeTime: 0.28,
  lungeSpeed: 520,
  recover: 0.65,
  dmg: 12,
};

// ---- Flame rules (health, healing, Wildfire, reviving) ------
export const FLAME_RULES = {
  emberHeal: 12,             // flame restored by one ember
  heatPerOverheal: 3,        // overhealing builds heat; 100 heat = Wildfire
  wildfireTime: 2,           // seconds
  wildfireRadius: 150,
  wildfireDps: 70,
  wildfireDamageTaken: 0.5,  // you take half damage while in Wildfire
  reviveTime: 3,
  reviveFlame: 35,
  reviveRange: 60,
};

export function byId(list, id) {
  return list.find((x) => x.id === id) || list[0];
}
