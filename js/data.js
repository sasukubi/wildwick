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
  { id: 'bowman',   name: 'Bowman',   available: true,  color: '#8fd36b', blurb: 'Draw longer for stronger, piercing shots.' },
  { id: 'rogue',    name: 'Rogue',    available: true,  color: '#d0d4e0', blurb: 'Strikes from behind; dashes leave decoys.' },
  { id: 'sorcerer', name: 'Sorcerer', available: true,  color: '#58b8ff', blurb: 'Weaves two spells together into one.' },
  { id: 'cleric',   name: 'Cleric',   available: false, color: '#ffe08a', blurb: 'Gives away their own flame to heal allies.' },
];

// ---- Warrior ------------------------------------------------
export const WARRIOR = {
  speed: 120,
  maxFlame: 100,
  atkCd: 0.5, atkRange: 58, atkArc: 2.0, atkDmg: 15, heavyMult: 1.7, heavyRecover: 0.35, // extra wait after the heavy 3rd hit
  dashSpeed: 420, dashTime: 0.2, dashCd: 1.3, dashSafe: 0.12, // only the first part of a dash dodges
  // Cinder Quake: burn some of your own flame to slam the ground
  quakeCd: 9, quakeCost: 10, quakeRadius: 108, quakeDmg: 30,
  // Smoulder Guard: hold to block hits from the front, release to counter-slash
  guardMax: 2.5, guardCd: 4, guardArc: 2.1, guardSlow: 0.4,
  counterBase: 15, counterPerHeat: 2.0, heatCap: 30, // blocking a whole pack can't make one giant hit counterRange: 74, counterArc: 2.8, perfectWindow: 0.25,
  // Pyre Cleave (Wildfire ultimate)
  pyreDmg: 80, pyreRange: 125, pyreArc: 3.8, pyreTrail: 4, pyreTrailDps: 30,
  furyMax: 0.8,      // Dark Fury: up to +80% damage at almost no flame
  lowGuard: 0.3,     // ...and up to 30% less damage taken at almost no flame
};

// ---- Sorcerer -----------------------------------------------
export const SORCERER = {
  speed: 118,
  maxFlame: 85,
  staffCd: 0.55, staffRange: 46, staffArc: 1.9, staffDmg: 7, staffKb: 320, // weak but pushes enemies away
  mana: 100, manaRegen: 10,
  fire:  { cost: 22, cd: 0.9, speed: 250, dmg: 24, r: 34, range: 260 },
  frost: { cost: 18, cd: 0.6, dmg: 10, shards: 3, spread: 0.32, speed: 300, range: 160, slow: 0.5, slowT: 2 },
  gale:  { cost: 0, cd: 0.7, range: 92, arc: 1.7, kb: 440, dmg: 6 },  // free: your always-available push
  weaveWindow: 1.6, weaveExtra: 20, // fusing costs 20 extra mana on top of the second spell
  steam:     { r: 70, dmg: 34, stun: 1.3, range: 150 },
  firestorm: { r: 30, dps: 42, t: 3, speed: 90 },
  blizzard:  { r: 92, dps: 12, t: 4, slow: 0.45, range: 160 },
  starfall:  { r: 120, meteors: 12, t: 3, dmg: 34, hitR: 36, range: 220 },
};
export const ELEMENTS = {
  fire:  { name: 'Fire',  color: '#ff8a3c', icon: '🔥' },
  frost: { name: 'Frost', color: '#8fd8ff', icon: '❄' },
  gale:  { name: 'Gale',  color: '#bff5d2', icon: '🌀' },
};
export const WEAVES = {
  'fire+frost': { id: 'steam', name: 'Steam Burst' },
  'fire+gale':  { id: 'firestorm', name: 'Firestorm' },
  'frost+gale': { id: 'blizzard', name: 'Blizzard' },
};
export function weaveOf(a, b) { return WEAVES[[a, b].sort().join('+')] || null; }

// ---- Bowman -------------------------------------------------
// Hold to draw: a quick tap is a weak arrow, a full draw hits hard and pierces.
// The stronger the shot, the longer you wait before the next one.
export const BOWMAN = {
  speed: 118, maxFlame: 90,
  drawTime: 1.0, drawSlow: 0.5,          // walk at half speed while drawing
  minDmg: 7, maxDmg: 44,
  minSpeed: 300, maxSpeed: 560,
  minRange: 220, maxRange: 380,
  minRecover: 0.22, maxRecover: 0.9,     // wait after a weak / full shot
  pierceAt: 0.95,                         // draw needed to pierce
  markCd: 6, markTime: 6, markBonus: 0.2, markRange: 320,
  rainCd: 12, rainR: 70, rainTime: 2, rainArrows: 10, rainDmg: 13, rainRange: 240,
  hawkTime: 6, hawkRecover: 0.32,         // Hawk Eye (Wildfire ultimate)
};

// ---- Rogue --------------------------------------------------
export const ROGUE = {
  speed: 128, maxFlame: 90,
  stabCd: 0.33, stabRange: 40, stabArc: 1.3, stabDmg: 9,   // fast, light stabs (about 3 a second)
  spinEvery: 4, spinR: 50, spinDmg: 10,                     // every 4th stab spins
  backstab: 1.0,                                            // +100% from the back half
  dashCd: 0.9,                                              // Rogue dashes recharge faster
  execute: 0.1,                                             // +10% damage to enemies under half health
  hopRange: 95,                                             // stabs hop toward enemies this far away
  decoyTime: 2.5,
  stepCd: 7, stepRange: 220,                                // Shadowstep
  smokeCd: 14, smokeR: 72, smokeTime: 5, smokeSpeed: 1.4,   // Smoke Bomb
  cutsTargets: 6, cutsRange: 230, cutsDmg: 42,              // Thousand Cuts (ultimate)
};

// ---- Enemies ------------------------------------------------
export const WOLF = {
  r: 11, hp: 42, aggro: 260, chaseSpeed: 110,
  lungeRange: 96, windup: 0.6, lungeTime: 0.3, lungeSpeed: 340, recover: 0.8,
  dmg: 12, xp: 6,
  wanderRadius: 150, wanderSpeed: 38,
  giveUp: 5,           // seconds without seeing you before it loses interest
};
// Ember-touched elites: rare, tougher, and they drop Wildfire.
export const ELITE = { chance: 0.12, hpMult: 2.6, speedMult: 1.12, dmgMult: 1.3, xp: 25, fuel: 35 };
// Mini boss guarding each forest's gate.
export const ALPHA = {
  name: 'Alpha Thornwolf', r: 18, hp: 300, aggro: 300, chaseSpeed: 100,
  lungeRange: 140, windup: 0.85, lunges: 2, lungeTime: 0.32, lungeSpeed: 380, recover: 1.4,
  dmg: 15, howlCd: 18, xp: 90, fuel: 60,
  wanderRadius: 90, wanderSpeed: 30, giveUp: 6,
  leash: 380,          // runs back home if you drag it further than this
  homeHeal: 0.005,     // heals 0.5% of its health per second while going home (tiny)
};
// Final boss.
export const TREANT = {
  name: 'The Elder Treant', r: 40, hp: 1800, speed: 20, attackCd: 2.8,
  rootDelay: 1.2, rootR: 38, rootDmg: 20,
  sweepRange: 160, sweepArc: 2.1, sweepWindup: 1.0, sweepDmg: 26,
  fuel: 100, leash: 260, homeHeal: 0.005,
};

// ---- Flame, Wildfire, reviving, runs ------------------------
export const RULES = {
  emberHeal: 12,
  emberChance: 0.45,
  wildfireMax: 100,
  shrineFuel: 50,
  shrineChance: 0.6,
  reviveTime: 3, reviveFlame: 35, reviveRange: 48,
  forestStages: 3,
  restTime: 90,           // if nobody decides, the party carries on after this long
};

export function xpToNext(level) { return 30 + level * 25; }

// ---- Skill trees --------------------------------------------
// Each level gives everyone 1 point. Spend them with T / Tab.
// The last upgrade in each group unlocks after 5 points in that group.
export const CAP_REQUIREMENT = 5;
export const TREES = {
  warrior: [
    { id: 'fury', name: 'Fury', color: '#ff7a4c', blurb: 'Hit harder the lower your flame.', nodes: [
      { id: 'darkfury', name: 'Deeper Dark', max: 3, desc: 'Dark Fury can reach +25% more damage.' },
      { id: 'swift', name: 'Swift Blade', max: 3, desc: 'Swing your sword 8% faster.' },
      { id: 'third', name: 'Crushing Third', max: 2, desc: 'Every 3rd hit deals +40% more.' },
      { id: 'embers', name: 'Embers in the Dark', max: 1, cap: true, desc: 'Kills while under 40% flame restore 4 flame.' },
    ] },
    { id: 'bulwark', name: 'Bulwark', color: '#7fb6ff', blurb: 'Block, counter and outlast.', nodes: [
      { id: 'guard', name: 'Tempered Guard', max: 3, desc: 'Wider block, and blocked hits store 25% more heat.' },
      { id: 'wick', name: 'Thick Wick', max: 3, desc: '+15 max flame.' },
      { id: 'riposte', name: 'Riposte', max: 2, desc: 'Counter-slash deals +30% damage.' },
      { id: 'unbroken', name: 'Unbroken', max: 1, cap: true, desc: 'Blocking right as a hit lands stuns the attacker.' },
    ] },
    { id: 'cinder', name: 'Cinder', color: '#ffc24c', blurb: 'Bigger quakes, longer fires.', nodes: [
      { id: 'wide', name: 'Wide Quake', max: 3, desc: 'Cinder Quake reaches 15% further.' },
      { id: 'sear', name: 'Searing Quake', max: 3, desc: 'Cinder Quake deals +20% damage.' },
      { id: 'lean', name: 'Lean Burn', max: 2, desc: 'Cinder Quake costs 3 less flame.' },
      { id: 'pyrelord', name: 'Pyre Lord', max: 1, cap: true, desc: 'Pyre Cleave fire lasts twice as long, and you gain Wildfire 25% faster.' },
    ] },
  ],
  sorcerer: [
    { id: 'pyro', name: 'Pyromancy', color: '#ff8a4c', blurb: 'Bigger, hotter fire.', nodes: [
      { id: 'searing', name: 'Searing Flames', max: 3, desc: 'Fire spells deal +20% damage.' },
      { id: 'blast', name: 'Wide Blast', max: 2, desc: 'Fireball explosions are 25% bigger.' },
      { id: 'raging', name: 'Raging Storm', max: 2, desc: 'Firestorm lasts 1 second longer.' },
      { id: 'cataclysm', name: 'Cataclysm', max: 1, cap: true, desc: 'Starfall drops 50% more meteors.' },
    ] },
    { id: 'rime', name: 'Rime', color: '#8fd8ff', blurb: 'Slow them down, then shatter them.', nodes: [
      { id: 'shard', name: 'Extra Shard', max: 2, desc: 'Frost fires 1 more shard.' },
      { id: 'chill', name: 'Deep Chill', max: 3, desc: 'Slows last 30% longer and Frost deals +15% damage.' },
      { id: 'whiteout', name: 'Whiteout', max: 2, desc: 'Blizzard is 25% bigger.' },
      { id: 'shatter', name: 'Shatter', max: 1, cap: true, desc: 'Slowed enemies take 30% more damage from you.' },
    ] },
    { id: 'tempest', name: 'Tempest', color: '#bff5d2', blurb: 'Wind, mana and faster weaving.', nodes: [
      { id: 'gust', name: 'Gale Force', max: 3, desc: 'Gale pushes 25% harder and deals more damage.' },
      { id: 'well', name: 'Deep Well', max: 3, desc: '+20 max mana.' },
      { id: 'quickweave', name: 'Quick Weave', max: 2, desc: '+0.5s to weave, and fusing costs 6 less mana.' },
      { id: 'eye', name: 'Eye of the Storm', max: 1, cap: true, desc: 'Fusing costs no extra mana.' },
    ] },
  ],
  bowman: [
    { id: 'marksman', name: 'Marksman', color: '#ffd36a', blurb: 'Bigger, faster shots.', nodes: [
      { id: 'steady', name: 'Steady Draw', max: 3, desc: 'Draw your bow 12% faster.' },
      { id: 'broadhead', name: 'Broadhead', max: 3, desc: 'Arrows deal +15% damage.' },
      { id: 'nock', name: 'Quick Nock', max: 2, desc: 'Wait 15% less between shots.' },
      { id: 'deadeye', name: 'Deadeye', max: 1, cap: true, desc: 'Fully drawn shots deal +50% damage.' },
    ] },
    { id: 'hunter', name: 'Hunter', color: '#ff8a7a', blurb: 'Mark prey for the whole party.', nodes: [
      { id: 'prey', name: 'Hunter\'s Mark', max: 3, desc: 'Marked enemies take +6% more damage.' },
      { id: 'linger', name: 'Lingering Mark', max: 2, desc: 'Mark lasts 2 seconds longer.' },
      { id: 'tracker', name: 'Tracker', max: 2, desc: 'Mark recharges 20% faster.' },
      { id: 'predator', name: 'Predator', max: 1, cap: true, desc: 'Hitting your marked enemy restores 2 flame.' },
    ] },
    { id: 'ranger', name: 'Ranger', color: '#8fd36b', blurb: 'Rain, roam and Hawk Eye.', nodes: [
      { id: 'downpour', name: 'Downpour', max: 3, desc: 'Rain of Arrows drops 25% more arrows.' },
      { id: 'widerain', name: 'Wide Rain', max: 2, desc: 'Rain of Arrows covers 20% more ground.' },
      { id: 'fleet', name: 'Light Draw', max: 3, desc: 'Walk 15% faster while drawing.' },
      { id: 'keen', name: 'Keen Hawk', max: 1, cap: true, desc: 'Hawk Eye lasts 3 seconds longer.' },
    ] },
  ],
  rogue: [
    { id: 'shadow', name: 'Shadow', color: '#b08cff', blurb: 'Shadowstep and smoke.', nodes: [
      { id: 'swiftstep', name: 'Swift Step', max: 3, desc: 'Shadowstep recharges 15% faster.' },
      { id: 'ambush', name: 'Ambush', max: 2, desc: 'Your first stab after Shadowstep deals +40%.' },
      { id: 'thick', name: 'Thick Smoke', max: 2, desc: 'Smoke Bomb lasts 1.5s longer and is bigger.' },
      { id: 'shroud', name: 'Shroud', max: 1, cap: true, desc: 'Standing in your smoke restores 3 flame a second.' },
    ] },
    { id: 'blade', name: 'Blade', color: '#ff8a8a', blurb: 'Hit harder from behind.', nodes: [
      { id: 'edge', name: 'Keen Edge', max: 3, desc: 'Stabs deal +12% damage.' },
      { id: 'assassin', name: 'Assassin', max: 3, desc: 'Backstabs deal +25% more.' },
      { id: 'whirl', name: 'Whirl', max: 2, desc: 'Your combo spin deals +30% and reaches further.' },
      { id: 'bleed', name: 'Deep Cuts', max: 1, cap: true, desc: 'Backstabs make enemies bleed for 3 seconds.' },
    ] },
    { id: 'trick', name: 'Trickster', color: '#9fe8d0', blurb: 'Decoys, dashes and the ultimate.', nodes: [
      { id: 'mirror', name: 'Mirror Image', max: 2, desc: 'Your dash decoy lasts 1 second longer.' },
      { id: 'lightfeet', name: 'Light Feet', max: 3, desc: 'Dash recharges 12% faster.' },
      { id: 'flurry', name: 'Flurry', max: 2, desc: 'Thousand Cuts hits 2 more enemies.' },
      { id: 'phantom', name: 'Phantom', max: 1, cap: true, desc: 'Decoys explode when they are bitten.' },
    ] },
  ],
};
export const WARRIOR_TREE = TREES.warrior;

export function treeNode(cls, id) {
  for (const b of TREES[cls] || []) for (const n of b.nodes) if (n.id === id) return { branch: b, node: n };
  return null;
}
export function branchSpent(tree, branch) {
  return branch.nodes.reduce((s, n) => s + (tree[n.id] || 0), 0);
}
export function canBuy(cls, tree, pts, id) {
  const f = treeNode(cls, id);
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
  { id: 'focus',   name: 'Focus Stone',    icon: '🪨', desc: 'Skills recharge 15% faster' },
  { id: 'kindle',  name: 'Kindling',       icon: '✨', desc: '+30 Wildfire now, +15% Wildfire gain' },
  { id: 'leech',   name: 'Hungry Flame',   icon: '🩸', desc: 'Every hit restores 1 flame' },
  { id: 'thorn',   name: 'Thornhide',      icon: '🌿', desc: 'Take 12% less damage' },
  { id: 'scholar', name: "Owl's Wisdom",   icon: '🦉', desc: '+25% EXP for the whole party' },
  { id: 'spring',  name: 'Mana Spring',    icon: '💧', desc: '+40% mana regeneration', cls: 'sorcerer' },
];

// Works out a player's real numbers from their class, skill tree and boons.
export function classStats(cls, tree = {}, boons = []) {
  const r = (id) => tree[id] || 0;
  const b = (id) => boons.filter((x) => x === id).length;
  const focus = Math.pow(0.85, b('focus'));
  const base = {
    cls,
    dmgMult: 1 + 0.12 * b('sharp'),
    emberHeal: RULES.emberHeal * (1 + 0.5 * b('ember')),
    leech: b('leech'),
    dmgTaken: Math.pow(0.88, b('thorn')),
    dashCd: WARRIOR.dashCd * Math.pow(0.75, b('dash')),
    wfGain: 1 + 0.15 * b('kindle'),
  };
  if (cls === 'sorcerer') {
    const S = SORCERER;
    return {
      ...base,
      maxFlame: S.maxFlame + 15 * b('wick'),
      speed: S.speed * (1 + 0.1 * b('swift')),
      atkCd: S.staffCd,
      maxMana: S.mana + 20 * r('well'),
      manaRegen: S.manaRegen * (1 + 0.4 * b('spring')),
      spellCd: focus,
      fireMult: 1 + 0.2 * r('searing'),
      blastR: S.fire.r * (1 + 0.25 * r('blast')),
      stormT: S.firestorm.t + r('raging'),
      meteors: Math.round(S.starfall.meteors * (r('cataclysm') ? 1.5 : 1)),
      shards: S.frost.shards + r('shard'),
      slowT: S.frost.slowT * (1 + 0.3 * r('chill')),
      frostMult: 1 + 0.15 * r('chill'),
      blizzR: S.blizzard.r * (1 + 0.25 * r('whiteout')),
      shatter: r('shatter') > 0,
      galeMult: 1 + 0.25 * r('gust'),
      weaveWindow: S.weaveWindow + 0.5 * r('quickweave'),
      weaveExtra: r('eye') ? 0 : S.weaveExtra - 6 * r('quickweave'),
      furyMax: 0,
    };
  }
  if (cls === 'bowman') {
    const B = BOWMAN;
    return {
      ...base,
      maxFlame: B.maxFlame + 15 * b('wick'),
      speed: B.speed * (1 + 0.1 * b('swift')),
      atkCd: B.minRecover,
      drawTime: B.drawTime * Math.pow(0.88, r('steady')),
      drawSlow: Math.min(1, B.drawSlow + 0.15 * r('fleet')),
      arrowMult: 1 + 0.15 * r('broadhead'),
      recoverMult: Math.pow(0.85, r('nock')),
      deadeye: r('deadeye') > 0,
      markBonus: B.markBonus + 0.06 * r('prey'),
      markTime: B.markTime + 2 * r('linger'),
      markCd: B.markCd * Math.pow(0.8, r('tracker')) * focus,
      predator: r('predator') > 0,
      rainArrows: Math.round(B.rainArrows * (1 + 0.25 * r('downpour'))),
      rainR: B.rainR * (1 + 0.2 * r('widerain')),
      rainCd: B.rainCd * focus,
      hawkTime: B.hawkTime + (r('keen') ? 3 : 0),
      furyMax: 0,
    };
  }
  if (cls === 'rogue') {
    const G = ROGUE;
    return {
      ...base,
      maxFlame: G.maxFlame + 15 * b('wick'),
      speed: G.speed * (1 + 0.1 * b('swift')),
      atkCd: G.stabCd,
      dashCd: G.dashCd * Math.pow(0.75, b('dash')) * Math.pow(0.88, r('lightfeet')),
      stabMult: 1 + 0.12 * r('edge'),
      backstab: G.backstab + 0.25 * r('assassin'),
      spinMult: 1 + 0.3 * r('whirl'),
      spinR: G.spinR * (1 + 0.15 * r('whirl')),
      bleed: r('bleed') > 0,
      stepCd: G.stepCd * Math.pow(0.85, r('swiftstep')) * focus,
      ambush: 0.4 * r('ambush'),
      smokeCd: G.smokeCd * focus,
      smokeTime: G.smokeTime + 1.5 * r('thick'),
      smokeR: G.smokeR * (1 + 0.15 * r('thick')),
      shroud: r('shroud') > 0,
      decoyTime: G.decoyTime + r('mirror'),
      phantom: r('phantom') > 0,
      cutsTargets: G.cutsTargets + 2 * r('flurry'),
      furyMax: 0,
    };
  }
  const W = WARRIOR;
  return {
    ...base,
    maxFlame: W.maxFlame + 15 * r('wick') + 15 * b('wick'),
    speed: W.speed * (1 + 0.1 * b('swift')),
    atkCd: W.atkCd * Math.pow(0.92, r('swift')),
    heavyMult: W.heavyMult + 0.4 * r('third'),
    furyMax: W.furyMax + 0.25 * r('darkfury'),
    quakeCd: W.quakeCd * focus,
    guardCd: W.guardCd * focus,
    quakeRadius: W.quakeRadius * (1 + 0.15 * r('wide')),
    quakeDmg: W.quakeDmg * (1 + 0.2 * r('sear')),
    quakeCost: Math.max(0, W.quakeCost - 3 * r('lean')),
    guardArc: W.guardArc + 0.25 * r('guard'),
    heatMult: 1 + 0.25 * r('guard'),
    counterMult: 1 + 0.3 * r('riposte'),
    wfGain: base.wfGain * (r('pyrelord') ? 1.25 : 1),
    trailMult: r('pyrelord') ? 2 : 1,
    embersInDark: r('embers') > 0,
    unbroken: r('unbroken') > 0,
  };
}

export function byId(list, id) {
  return list.find((x) => x.id === id) || list[0];
}
