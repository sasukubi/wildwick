// =============================================================
//  Wildwick game data
//  All the numbers and lists that define the game live here.
//  Change these to tune how the game feels.
//  (Distances are in "art pixels": one map tile is 32 of them.)
// =============================================================

// The game's version. Friends can only play together on the same version.
// (Raise this with every update.)
export const VERSION = '1.4.0';
import { PRESTIGE } from './progress.js';

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
  { id: 'warlock',  name: 'Warlock',  available: true,  color: '#9b6bff', blurb: 'Calls shadow hands and imps, and drains enemies for souls.' },
  { id: 'bowman',   name: 'Archer',   available: true,  color: '#8fd36b', blurb: 'Draw longer for stronger, piercing shots.' },
  { id: 'rogue',    name: 'Rogue',    available: true,  color: '#d0d4e0', blurb: 'Strikes from behind; dashes leave decoys.' },
  { id: 'sorcerer', name: 'Sorcerer', available: true,  color: '#58b8ff', blurb: 'Weaves two spells together into one.' },
  { id: 'cleric',   name: 'Cleric',   available: true,  color: '#ffe08a', blurb: 'Fights up close to build Grace, then spends it to heal.' },
];

// ---- Warrior ------------------------------------------------
export const WARRIOR = {
  speed: 120,
  maxFlame: 100,
  atkCd: 0.5, atkRange: 58, atkArc: 2.0, atkDmg: 15, heavyMult: 1.7, heavyRecover: 0.35, // extra wait after the heavy 3rd hit
  dashSpeed: 420, dashTime: 0.2, dashCd: 1.3, dashSafe: 0.12, // only the first part of a dash dodges
  shoveKb: 220, shoveStagger: 0.6,  // dashing into enemies shoves them back and breaks their attack
  // Shockwave: slam the ground around you (no flame cost)
  quakeCd: 9, quakeCost: 0, quakeRadius: 108, quakeDmg: 30,
  // Iron Guard: hold to block hits from the front, release for Retaliation
  guardMax: 2.5, guardCd: 4, guardArc: 2.1, guardSlow: 0.4,
  counterBase: 15, counterPerHeat: 2.0, heatCap: 30, // blocking a whole pack can't make one giant hit
  counterRange: 74, counterArc: 2.8, perfectWindow: 0.25,
  // the Fury gauge: fills when you get hurt (or block), fades out of combat.
  // Abilities (not Strike) use a chunk of it for bonus damage: a full gauge = +160%.
  fury: { gain: 2.0, blockGain: 1.2, fadeAfter: 5, fade: 10, bonus: 1.6, bash: 0.15, retal: 0.25, shock: 0.35, storm: 0.5 },
  lust: { dmg: 0.2, speed: 0.2 },    // Bloodlust: at full Fury, +20% damage and 20% faster Strikes
  bashDmg: 8,                         // Bash hurts a little too
  // Bladestorm (Wildfire ultimate): spin like a whirlwind, hitting everything around you
  storm: { time: 4, every: 0.25, r: 62, dmg: 14, kb: 140 },
  stormSpeed: 2,      // during Bladestorm you move twice as fast (but can't Bash)
  waveDmg: 16, waveSpeed: 300, waveRange: 220,  // Sword Master's slicing wave
  cry: { cd: 14, r: 300, time: 5 },              // Battle Cry (Q): for 5 seconds, every enemy near you turns on you
  pyreDmg: 80, pyreRange: 125, pyreArc: 3.8, pyreTrail: 4, pyreTrailDps: 30, // (old Pyre Cleave, kept for its effect)
  furyMax: 0,        // (old Dark Fury: replaced by Bloodlust)
  lowGuard: 0.3,     // up to 30% less damage taken at almost no flame
};

// ---- Sorcerer -----------------------------------------------
export const SORCERER = {
  speed: 118,
  maxFlame: 85,
  staffCd: 0.55, staffRange: 46, staffArc: 1.9, staffDmg: 7, staffKb: 320, // weak but pushes enemies away
  mana: 100, manaRegen: 16,
  fire:  { cost: 18, cd: 0.9, speed: 250, dmg: 30, r: 34, range: 260 },
  frost: { cost: 15, cd: 0.6, dmg: 12, shards: 3, spread: 0.32, speed: 300, range: 160, slow: 0.5, slowT: 2 },
  gale:  { cost: 0, cd: 0.7, range: 92, arc: 1.7, kb: 440, dmg: 6 },  // free: your always-available push
  weaveWindow: 1.6, weaveExtra: 20, // fusing costs 20 extra mana on top of the second spell
  steam:     { r: 70, dmg: 34, stun: 1.3, range: 150 },
  firestorm: { r: 30, dps: 42, t: 3, speed: 90 },
  blizzard:  { r: 92, dps: 12, t: 4, slow: 0.45, range: 160 },
  starfall:  { r: 120, meteors: 12, t: 3, dmg: 34, hitR: 36, range: 220 },
  trailTime: 0.7, trailHaste: 0.12,     // the dash leaves a trail that speeds up allies who walk through it
};
export const ELEMENTS = {
  fire:  { name: 'Fireball',  color: '#ff8a3c', icon: '' },
  frost: { name: 'Frostbite', color: '#8fd8ff', icon: '' },
  gale:  { name: 'Gale',  color: '#bff5d2', icon: '' },
};
export const WEAVES = {
  'fire+frost': { id: 'steam', name: 'Thermal Shock' },
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
  minDmg: 8, maxDmg: 50,
  minSpeed: 300, maxSpeed: 560,
  minRange: 220, maxRange: 380,
  minRecover: 0.22, maxRecover: 0.9,     // wait after a weak / full shot
  pierceAt: 0.95,                         // draw needed to pierce
  markCd: 6, markTime: 6, markBonus: 0.2, markRange: 320,
  rainCd: 12, rainR: 70, rainTime: 2, rainArrows: 10, rainDmg: 13, rainRange: 240,
  hawkTime: 6, hawkRecover: 0.32,         // Hawk Eye (Wildfire ultimate)
  rollDmg: 9, rollRange: 230,            // the dash is a roll that flicks a small arrow at the nearest enemy
};

// ---- Rogue --------------------------------------------------
export const ROGUE = {
  speed: 128, maxFlame: 90,
  stabCd: 0.33, stabRange: 40, stabArc: 1.3, stabDmg: 9,   // fast, light stabs (about 3 a second)
  spinEvery: 4, spinR: 50, spinDmg: 10,                     // every 4th stab spins
  backstab: 1.0,                                            // +100% from the back half
  dashCd: 0.9,                                              // Rogue dashes recharge faster
  execute: 0.1,                                             // +10% damage to enemies under half health
  hopRange: 48,                                             // stabs hop toward enemies this far away
  decoyTime: 1.2, tauntR: 140,                              // the dash clone pulls nearby enemies for a moment
  stepCd: 4.5, stepRange: 220,                                // Shadowstep
  smokeCd: 14, smokeR: 72, smokeTime: 5, smokeSpeed: 1.4,   // Smoke Bomb
  cutsTargets: 6, cutsRange: 230, cutsDmg: 60,              // Thousand Cuts (ultimate)
};

// ---- Cleric -------------------------------------------------
// A battle healer: mace hits build Grace, heals spend it.
export const CLERIC = {
  speed: 116, maxFlame: 100,
  maceCd: 0.6, maceRange: 50, maceArc: 1.9, maceDmg: 12,
  grace: 100, graceStart: 50, gracePerHit: 7, graceHitCap: 14,  // per swing, however many it hits
  graceIdle: 4, graceDrain: 6, graceFloor: 0.5,                 // drains after 4s out of a fight, but never below 50%
  overheal: 0.2, shieldTime: 8,                                 // heals past full become a shield (up to +20%)
  mendCost: 35, mendCd: 2.5, mendHeal: 30, mendRange: 230, mendAim: 0.55,
  judgeCd: 7, judgeRange: 72, judgeArc: 2.0, judgeDmg: 20, judgeStun: 1.0,
  groundCost: 30, groundCd: 13, groundR: 78, groundTime: 5, groundHeal: 6, groundSlow: 0.5, groundRange: 160,
  stepHeal: 10,                                                  // Blessed Step: allies you dash through
  dawnR: 280, dawnHeal: 50, dawnRevive: 0.5, aegisTime: 3,      // Dawn (ultimate)
};

// ---- Warlock ------------------------------------------------
export const WARLOCK = {
  speed: 118, maxFlame: 85,
  mana: 100, manaRegen: 3,   // the Warlock's "mana" is called Souls
  boltCd: 0.6, boltSpeed: 240, boltRange: 250, boltDmg: 10, curseEvery: 3, curseTime: 3, curseBonus: 0.15,
  hands: { cost: 30, cd: 9, r: 58, range: 230, delay: 0.45, dmg: 22, root: 1.6 },
  imps: { cost: 35, cd: 12, n: 3, life: 8, speed: 150, dmg: 2.5, biteCd: 0.7, mana: 1, aggro: 260 },
  siphon: { cost: 0, cd: 8, range: 210, time: 1.6, dps: 15, mana: 8, breakRange: 260 },
  slipTime: 0.14, slipSpeed: 720,                                // Shadow Slip: a quick untouchable blink
  eclipse: { time: 8, hp: 900, r: 20, speed: 70, dmg: 6, swipeCd: 1, swipeR: 52, taunt: 320 },
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
  name: 'The Creaking Oak', r: 40, hp: 1800, speed: 20, attackCd: 2.8,
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

// ---- Global pace & toughness --------------------------------
// One place to make the whole game calmer or faster.
export const PACE = 0.85;       // movement, dashes, enemies and projectiles (attack speed and cooldowns are unchanged)
export const TOUGH = {
  enemyHp: 1.2,                 // enemies have 20% more health
  playerFlame: 1.2,             // players have 20% more flame
  dmg: 0.9,                     // everyone deals 10% less damage
  xp: 0.85,                     // 15% less EXP
};
for (const o of [WARRIOR, SORCERER, BOWMAN, ROGUE, CLERIC, WARLOCK]) { o.speed *= PACE; o.maxFlame = Math.round(o.maxFlame * TOUGH.playerFlame); }
WARRIOR.dashSpeed *= PACE;
WARLOCK.slipSpeed *= PACE;
SORCERER.fire.speed *= PACE; SORCERER.frost.speed *= PACE; SORCERER.firestorm.speed *= PACE;
BOWMAN.minSpeed *= PACE; BOWMAN.maxSpeed *= PACE;
WARLOCK.boltSpeed *= PACE; WARLOCK.imps.speed *= PACE; WARLOCK.eclipse.speed *= PACE;
for (const e of [WOLF, ALPHA]) {
  e.chaseSpeed *= PACE; e.wanderSpeed *= PACE;
  e.lungeSpeed *= PACE; e.lungeTime /= PACE;   // same reach, just a slower pounce
  e.hp = Math.round(e.hp * TOUGH.enemyHp); e.dmg *= TOUGH.dmg;
}
TREANT.speed *= PACE;
TREANT.hp = Math.round(TREANT.hp * TOUGH.enemyHp);
TREANT.rootDmg *= TOUGH.dmg; TREANT.sweepDmg *= TOUGH.dmg;

// ---- Skill trees --------------------------------------------
// Each class level gives 1 point (up to level 30). Spend them at the Skilltree in camp.
// The last upgrade in each group unlocks after 5 points in that group.
export const CAP_REQUIREMENT = 5;
export const RANK_POWER = 0.6;   // each normal rank is worth 60% of what it used to be
// upgrades that add whole things (an extra shard, an extra imp...) aren't weakened
const WHOLE = new Set(['shard', 'brood', 'quickhex', 'flurry']);
export const TREES = {
  warrior: [
    { id: 'fury', name: 'Wrath', color: '#ff7a4c', blurb: 'More Fury, harder swings.', nodes: [
      { id: 'darkfury', name: 'Fury', max: 3, desc: 'Gain 20% more Fury when you are hit.' },
      { id: 'swift', name: 'Swiftblade', max: 3, desc: 'Strike swings 8% faster.' },
      { id: 'third', name: 'Heavy Finisher', max: 2, desc: 'Every 3rd Strike deals +40% more.' },
      { id: 'embers', name: 'Unquenchable', max: 1, cap: true, desc: "When your Fury fills up, your flame can't drop below 1 for 2 seconds (once every 20 seconds)." },
    ] },
    { id: 'bulwark', name: 'Juggernaut', color: '#7fb6ff', blurb: 'Block, retaliate and outlast.', nodes: [
      { id: 'guard', name: 'Tempered Guard', max: 3, desc: 'Wider block, and blocked hits give 25% more Fury.' },
      { id: 'wick', name: 'Thick Wick', max: 3, desc: '+15 max flame.' },
      { id: 'riposte', name: 'Riposte', max: 2, desc: 'Retaliation deals +30% damage.' },
      { id: 'unbroken', name: 'Unbroken', max: 1, cap: true, desc: 'Blocking right as a hit lands stuns the attacker.' },
    ] },
    { id: 'cinder', name: 'Ravager', color: '#ffc24c', blurb: 'Bigger Shockwaves, reckless power.', nodes: [
      { id: 'wide', name: 'Tremor', max: 3, desc: 'Shockwave reaches 15% further.' },
      { id: 'sear', name: 'Aftershock', max: 3, desc: 'A second Shockwave follows a moment later, dealing 20% of the damage.' },
      { id: 'lean', name: 'Reckless Force', max: 2, desc: 'Fury gives 25% more bonus damage, but you take 5% more damage.' },
      { id: 'pyrelord', name: 'Sword Master', max: 1, cap: true, desc: 'Every 3rd Strike sends a slicing wave forward.' },
    ] },
  ],
  sorcerer: [
    { id: 'pyro', name: 'Pyromancy', color: '#ff8a4c', blurb: 'Bigger, hotter fire.', nodes: [
      { id: 'searing', name: 'Searing Flames', max: 3, desc: 'Fireball spells deal +15% damage.' },
      { id: 'blast', name: 'Wide Blast', max: 2, desc: 'Fireball explosions are 25% bigger.' },
      { id: 'raging', name: 'Raging Storm', max: 2, desc: 'Firestorm lasts 1 second longer.' },
      { id: 'cataclysm', name: 'Cataclysm', max: 1, cap: true, desc: 'Starfall drops 50% more meteors.' },
    ] },
    { id: 'rime', name: 'Rime', color: '#8fd8ff', blurb: 'Slow them down, then shatter them.', nodes: [
      { id: 'shard', name: 'Extra Shard', max: 2, desc: 'Frostbite fires 1 more shard.' },
      { id: 'chill', name: 'Deep Chill', max: 3, desc: 'Slows last 30% longer and Frostbite deals +15% damage.' },
      { id: 'whiteout', name: 'Whiteout', max: 2, desc: 'Blizzard is 25% bigger.' },
      { id: 'shatter', name: 'Permafrost', max: 1, cap: true, desc: 'Slowed enemies take 30% more damage from you.' },
    ] },
    { id: 'tempest', name: 'Tempest', color: '#bff5d2', blurb: 'Wind, mana and faster spellweaving.', nodes: [
      { id: 'gust', name: 'Gale Force', max: 3, desc: 'Gale pushes 25% harder and deals more damage.' },
      { id: 'well', name: 'Deep Well', max: 3, desc: '+20 max mana.' },
      { id: 'quickweave', name: 'Quick Weave', max: 2, desc: '+0.5s to weave, and fusing costs 6 less mana.' },
      { id: 'eye', name: 'Eye of the Storm', max: 1, cap: true, desc: 'Fusing costs no extra mana.' },
    ] },
  ],
  bowman: [
    { id: 'marksman', name: 'Marksman', color: '#ffd36a', blurb: 'Bigger, faster shots.', nodes: [
      { id: 'steady', name: 'Steady Draw', max: 3, desc: 'Draw your bow 8% faster.' },
      { id: 'broadhead', name: 'Broadhead', max: 3, desc: 'Arrows deal +10% damage.' },
      { id: 'nock', name: 'Quick Nock', max: 2, desc: 'Wait 15% less between shots.' },
      { id: 'deadeye', name: 'Bullseye', max: 1, cap: true, desc: 'Fully drawn shots deal +20% damage.' },
    ] },
    { id: 'hunter', name: 'Hunter', color: '#ff8a7a', blurb: 'Mark prey for the whole party.', nodes: [
      { id: 'prey', name: 'Weakpoint', max: 3, desc: 'Marked enemies take +6% more damage.' },
      { id: 'linger', name: 'Lingering Mark', max: 2, desc: 'Mark lasts 2 seconds longer.' },
      { id: 'tracker', name: 'Tracker', max: 2, desc: 'Mark recharges 20% faster.' },
      { id: 'predator', name: 'Predator', max: 1, cap: true, desc: 'Hitting your marked enemy restores 2 flame.' },
    ] },
    { id: 'ranger', name: 'Ranger', color: '#8fd36b', blurb: 'Rain, roam and Deadeye.', nodes: [
      { id: 'downpour', name: 'Downpour', max: 3, desc: 'Barrage drops 25% more arrows.' },
      { id: 'widerain', name: 'Wide Rain', max: 2, desc: 'Barrage covers 20% more ground.' },
      { id: 'fleet', name: 'Light Draw', max: 3, desc: 'Walk 15% faster while drawing.' },
      { id: 'keen', name: 'Apex Sight', max: 1, cap: true, desc: 'Deadeye lasts 3 seconds longer.' },
    ] },
  ],
  rogue: [
    { id: 'shadow', name: 'Shadow', color: '#b08cff', blurb: 'Shadowstep and smoke.', nodes: [
      { id: 'swiftstep', name: 'Swift Step', max: 3, desc: 'Shadowstep recharges 15% faster.' },
      { id: 'ambush', name: 'Ambush', max: 2, desc: 'Your first stab after Shadowstep deals +40%.' },
      { id: 'thick', name: 'Thick Smoke', max: 2, desc: 'Smoke Bomb lasts 1.5s longer and is bigger.' },
      { id: 'shroud', name: 'Shroud', max: 1, cap: true, desc: 'Standing in your smoke restores 3 flame a second.' },
    ] },
    { id: 'blade', name: 'Assassin', color: '#ff8a8a', blurb: 'Hit harder from behind.', nodes: [
      { id: 'edge', name: 'Keen Edge', max: 3, desc: 'Stabs deal +12% damage.' },
      { id: 'assassin', name: 'Lethality', max: 3, desc: 'Backstabs deal +25% more.' },
      { id: 'whirl', name: 'Whirl', max: 2, desc: 'Your combo spin deals +30% and reaches further.' },
      { id: 'bleed', name: 'Deep Cuts', max: 1, cap: true, desc: 'Backstabs make enemies bleed for 3 seconds.' },
    ] },
    { id: 'trick', name: 'Trickster', color: '#9fe8d0', blurb: 'Decoys, dashes and the Wildfire Ability.', nodes: [
      { id: 'mirror', name: 'Mirror Image', max: 2, desc: 'Your dash decoy lasts 1 second longer.' },
      { id: 'lightfeet', name: 'Light Feet', max: 3, desc: 'Dash recharges 12% faster.' },
      { id: 'flurry', name: 'Flurry', max: 2, desc: 'Thousand Cuts hits 2 more enemies.' },
      { id: 'phantom', name: 'Phantom', max: 1, cap: true, desc: 'Decoys explode when they are bitten.' },
    ] },
  ],
};
TREES.cleric = [
  { id: 'devotion', name: 'Devotion', color: '#ffe08a', blurb: 'Stronger heals, bigger shields.', nodes: [
    { id: 'mercy', name: 'Mercy', max: 3, desc: 'Kindle heals 15% more.' },
    { id: 'halo', name: 'Halo', max: 2, desc: 'Overheal shields can reach 10% higher.' },
    { id: 'thrift', name: 'Thrift', max: 2, desc: 'Kindle costs 5 less Grace.' },
    { id: 'beacon', name: 'Beacon', max: 1, cap: true, desc: 'Kindle also heals everyone near the target for half as much.' },
  ] },
  { id: 'zeal', name: 'Crusader', color: '#ff9a5a', blurb: 'Hit harder, earn Grace faster.', nodes: [
    { id: 'zealous', name: 'Zealous', max: 3, desc: 'Swing hits deal +10% damage.' },
    { id: 'fervor', name: 'Radiant', max: 3, desc: 'Swing hits build 20% more Grace.' },
    { id: 'verdict', name: 'Verdict', max: 2, desc: 'Judgement stuns 0.4s longer and recharges 15% faster.' },
    { id: 'smite', name: 'Smite', max: 1, cap: true, desc: 'Every 3rd mace hit calls down light for +60% damage.' },
  ] },
  { id: 'sanctum', name: 'Sanctuary', color: '#bfe8ff', blurb: 'Holy ground and the daybreak.', nodes: [
    { id: 'hallowed', name: 'Hallowed', max: 3, desc: 'Sanctified Ground is 15% bigger and heals 20% more.' },
    { id: 'lasting', name: 'Lasting Light', max: 2, desc: 'Sanctified Ground lasts 1.5s longer.' },
    { id: 'blessed', name: 'Guiding Light', max: 2, desc: 'Your dash spark heals 50% more.' },
    { id: 'sunrise', name: 'Sunrise', max: 1, cap: true, desc: 'Daybreak shields everyone it touches for 20% of their flame.' },
  ] },
];
TREES.warlock = [
  { id: 'dread', name: 'Dread', color: '#b08cff', blurb: 'Bolts and curses.', nodes: [
    { id: 'malice', name: 'Malice', max: 3, desc: 'Bolts deal +12% damage.' },
    { id: 'hex', name: 'Deep Hex', max: 2, desc: 'Cursed enemies take 8% more damage.' },
    { id: 'quickhex', name: 'Quick Hex', max: 2, desc: 'Curse every 2nd bolt instead of every 3rd (at rank 2).' },
    { id: 'plague', name: 'Plague', max: 1, cap: true, desc: 'Cursed enemies spread their curse to one nearby enemy when they die.' },
  ] },
  { id: 'legion', name: 'Summoner', color: '#ff7a9a', blurb: 'More imps, meaner bites.', nodes: [
    { id: 'brood', name: 'Brood', max: 1, desc: 'Summon 1 more imp.' },
    { id: 'fangs', name: 'Sharp Fangs', max: 3, desc: 'Imps deal +12% damage.' },
    { id: 'feast', name: 'Feast', max: 2, desc: 'Imp bites give 50% more souls.' },
    { id: 'colossus', name: 'Nightfall', max: 1, cap: true, desc: 'Eclipse lasts 3 seconds longer.' },
  ] },
  { id: 'void', name: 'Void', color: '#7fd0c0', blurb: 'Hands and soul drain.', nodes: [
    { id: 'grip', name: 'Grave Bind', max: 3, desc: 'Dead Man\'s Reach holds enemies 0.3s longer and deals +15% damage.' },
    { id: 'reach', name: 'Snatch', max: 2, desc: 'Dead Man\'s Reach covers 15% more ground.' },
    { id: 'thirst', name: 'Thirst', max: 3, desc: 'Soul Siphon drains 20% harder and gives more souls.' },
    { id: 'lifetap', name: 'Harvest', max: 1, cap: true, desc: 'Soul Siphon also restores your flame.' },
  ] },
];
export const WARRIOR_TREE = TREES.warrior;

// rewrite the numbers in each normal upgrade's text to match RANK_POWER
for (const cls in TREES) for (const b of TREES[cls]) for (const n of b.nodes) {
  if (n.cap || WHOLE.has(n.id)) continue;
  n.desc = n.desc.replace(/(\d+(?:\.\d+)?)(?!\d|\.\d|st|nd|rd|th)(s?)( seconds?)?/g, (m, num, s, sec) => {
    const v = parseFloat(num) * RANK_POWER;
    const t = v >= 2 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    return t + s + (sec ? (t === '1' ? ' second' : ' seconds') : '');
  });
}

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
  { id: 'sharp',   name: 'Flint',      icon: '', desc: '+12% damage' },
  { id: 'wick',    name: 'Candle',     icon: '', desc: '+15 max flame' },
  { id: 'swift',   name: 'Swift Charm', icon: '', desc: '+10% move speed' },
  { id: 'ember',   name: 'Ember Pouch',    icon: '', desc: 'Embers heal 50% more' },
  { id: 'dash',    name: 'Owl\'s Feather',  icon: '', desc: 'Dash recharges 25% faster' },
  { id: 'focus',   name: 'Focus Stone',    icon: '', desc: 'Skills recharge 15% faster' },
  { id: 'kindle',  name: 'Firewood',       icon: '', desc: '+30 Wildfire now, +15% Wildfire gain' },
  { id: 'leech',   name: 'Siphon Vial',   icon: '', desc: 'Every hit restores 1 flame' },
  { id: 'thorn',   name: 'Bark Shield',      icon: '', desc: 'Take 12% less damage' },
  { id: 'scholar', name: "Ancient Scroll",   icon: '', desc: '+25% EXP for the whole party' },
  { id: 'spring',  name: 'Crystal',    icon: '', desc: '+40% mana regeneration', cls: 'sorcerer' },
  { id: 'wellw',   name: 'Skull',    icon: '', desc: '+40% soul regeneration', cls: 'warlock' },
  { id: 'psalm',   name: 'Ripped Page',     icon: '', desc: 'Swing hits build 25% more Grace', cls: 'cleric' },
];

// Works out a player's real numbers from their class, skill tree, boons,
// and permanent prestiges / rebirths (cp = this class's saved progress).
export function classStats(cls, tree = {}, boons = [], cp = null) {
  const st = baseClassStats(cls, tree, boons);
  const pres = (cp && cp.pres) || {}, reb = (cp && cp.reb) || {};
  const n = (k) => pres[k] || 0;
  st.slot = { atk: 1 + PRESTIGE.power * n('atk'), s1: 1 + PRESTIGE.power * n('s1'), s2: 1 + PRESTIGE.power * n('s2'), s3: 1 + PRESTIGE.power * n('s3'), dash: 1 + PRESTIGE.power * n('dash'), ult: 1 };
  st.slotCd = { s1: Math.pow(PRESTIGE.cd, n('s1')), s2: Math.pow(PRESTIGE.cd, n('s2')), s3: Math.pow(PRESTIGE.cd, n('s3')) };
  st.atkCd *= Math.pow(PRESTIGE.cd, n('atk'));
  if (st.recoverMult) st.recoverMult *= Math.pow(PRESTIGE.cd, n('atk'));
  st.dashCd *= Math.pow(PRESTIGE.cd, n('dash'));
  st.ultMult = 1 + 0.15 * (reb.power || 0);
  st.ultSize = 1 + 0.15 * (reb.reach || 0);
  st.wfGain *= 1 + 0.15 * (reb.charge || 0);
  return st;
}

function baseClassStats(cls, tree = {}, boons = []) {
  const rr = (id) => tree[id] || 0;                    // whole ranks
  const r = (id) => rr(id) * (WHOLE.has(id) ? 1 : RANK_POWER); // normal ranks are worth a bit less
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
      fireMult: 1 + 0.15 * r('searing'),
      blastR: S.fire.r * (1 + 0.25 * r('blast')),
      stormT: S.firestorm.t + r('raging'),
      meteors: Math.round(S.starfall.meteors * (r('cataclysm') ? 1.5 : 1)),
      shards: S.frost.shards + rr('shard'),
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
      drawTime: B.drawTime * Math.pow(0.92, r('steady')),
      drawSlow: Math.min(1, B.drawSlow + 0.15 * r('fleet')),
      arrowMult: 1 + 0.1 * r('broadhead'),
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
  if (cls === 'cleric') {
    const C = CLERIC;
    return {
      ...base,
      maxFlame: C.maxFlame + 15 * b('wick'),
      speed: C.speed * (1 + 0.1 * b('swift')),
      atkCd: C.maceCd,
      maxMana: C.grace, manaRegen: 0,
      maceMult: 1 + 0.1 * r('zealous'),
      graceMult: (1 + 0.2 * r('fervor')) * (1 + 0.25 * b('psalm')),
      smite: r('smite') > 0,
      mendHeal: C.mendHeal * (1 + 0.15 * r('mercy')),
      mendCost: C.mendCost - 5 * r('thrift'),
      mendCd: C.mendCd * focus,
      beacon: r('beacon') > 0,
      overheal: C.overheal + 0.1 * r('halo'),
      judgeCd: C.judgeCd * Math.pow(0.85, r('verdict')) * focus,
      judgeStun: C.judgeStun + 0.4 * r('verdict'),
      groundR: C.groundR * (1 + 0.15 * r('hallowed')),
      groundHeal: C.groundHeal * (1 + 0.2 * r('hallowed')),
      groundTime: C.groundTime + 1.5 * r('lasting'),
      groundCd: C.groundCd * focus,
      stepHeal: C.stepHeal * (1 + 0.5 * r('blessed')),
      sunrise: r('sunrise') > 0,
      furyMax: 0,
    };
  }
  if (cls === 'warlock') {
    const L = WARLOCK;
    return {
      ...base,
      maxFlame: L.maxFlame + 15 * b('wick'),
      speed: L.speed * (1 + 0.1 * b('swift')),
      atkCd: L.boltCd,
      maxMana: L.mana, manaRegen: L.manaRegen * (1 + 0.4 * b('wellw')),
      spellCd: focus,
      boltMult: 1 + 0.12 * r('malice'),
      curseBonus: L.curseBonus + 0.08 * r('hex'),
      curseEvery: rr('quickhex') >= 2 ? 2 : L.curseEvery,
      plague: r('plague') > 0,
      imps: L.imps.n + rr('brood'),
      impMult: 1 + 0.12 * r('fangs'),
      impMana: L.imps.mana * (1 + 0.5 * r('feast')),
      eclipseTime: L.eclipse.time + (r('colossus') ? 3 : 0),
      handsRoot: L.hands.root + 0.3 * r('grip'),
      handsMult: 1 + 0.15 * r('grip'),
      handsR: L.hands.r * (1 + 0.15 * r('reach')),
      siphonMult: 1 + 0.2 * r('thirst'),
      lifetap: r('lifetap') > 0,
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
      cutsTargets: G.cutsTargets + 2 * rr('flurry'),
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
    furyMax: 0,
    maxMana: 100, manaRegen: 0,                 // the Fury gauge (it is never a cost)
    furyGain: 1 + 0.2 * r('darkfury'),
    blockFury: 1 + 0.25 * r('guard'),
    furyBonus: W.fury.bonus * (1 + 0.25 * r('lean')),
    dmgTaken: base.dmgTaken * (1 + 0.05 * r('lean')),
    quakeCd: W.quakeCd * focus,
    cryCd: W.cry.cd * focus,
    guardCd: W.guardCd * focus,
    quakeRadius: W.quakeRadius * (1 + 0.15 * r('wide')),
    quakeDmg: W.quakeDmg,
    aftershock: 0.2 * r('sear'),
    guardArc: W.guardArc + 0.25 * r('guard'),
    heatMult: 1 + 0.25 * r('guard'),
    counterMult: 1 + 0.3 * r('riposte'),
    unquench: r('embers') > 0,
    swordMaster: r('pyrelord') > 0,
    unbroken: r('unbroken') > 0,
  };
}

export function byId(list, id) {
  return list.find((x) => x.id === id) || list[0];
}
