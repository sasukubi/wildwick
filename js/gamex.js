// =============================================================
//  More of the Game (runs on every player's computer):
//  saving your class progress, camp stations (Skilltree, merchant,
//  leaderboard, path stone, pond, duel ring), chat, the dev console,
//  photo mode, fishing and the new effects.
// =============================================================
import { ROGUE, WARRIOR, byId, CLASSES, BOONS } from './data.js';
import { SHOP, MODES, EVENTS, FISH, rollFish, isDev, MAX_LEVEL, todayKey } from './progress.js';
import { toast, shopPanel, lboardPanel, modePanel, chat, devConsole, settings, pause, campPanel, signPanel, boardPanel } from './ui.js';
import { audio } from './audio.js';
import { prefs, keyName } from './prefs.js';

// what friends may ask the host to do for them
const ACTIONS = ['buyItem', 'useItem', 'reclaimNode', 'prestige', 'chat', 'devCmd'];
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

const X = {
  initExtras() {
    this.bubbles = new Map();   // chat bubbles over heads
    this.photo = false;         // photo mode: no HUD, zoomed out
    this.photoZoom = 0.6;
    this.fishing = null;
    this.saveT = 3;
    this.progKey = '';
    this.dirty = false;
    this.stepAim = null;
    this.lp.lockT = 0;
    chat.attach(this);
    devConsole.attach(this);
  },

  // run something on the host's simulation (or ask the host to)
  act(method, ...args) {
    const sim = this.waitSim || (this.isHost ? this.sim : null);
    if (sim) return sim[method](this.myId, ...args);
    if (this.room) this.room.send({ t: 'act', m: method, a: args });
    return null;
  },
  hostAct(from, msg) {
    if (!ACTIONS.includes(msg.m) || !Array.isArray(msg.a)) return;
    this.sim[msg.m](from, ...msg.a.slice(0, 3));
  },

  extraPanelsOpen() { return shopPanel.open || lboardPanel.open || modePanel.open; },
  closeExtraPanels() { shopPanel.close(); lboardPanel.close(); modePanel.close(); },

  // ---------------------------------------------------- every frame
  updateExtras(dt, me, snap) {
    this.saveProgress(me, dt, false);
    this.lp.lockT -= dt;
    for (const [id, b] of this.bubbles) if (this.t - b.t0 > 5) this.bubbles.delete(id);
    if (shopPanel.open) shopPanel.update(this, me);
    if (modePanel.open && snap.sc !== 'lobby') modePanel.close();
    // the Skilltree only lets you spend points while you stand near it
    if (this.tree.open && this.tree.edit) {
      const t = this.world.props.find((o) => o.type === 'skilltree');
      if (!t || this.world.kind !== 'lobby' || Math.hypot(t.x - this.lp.x, t.y - this.lp.y) > 150) { this.tree.edit = false; this.tree.lastKey = ''; }
    }
    this.updateStepAim(snap, me);
    // Bladestorm: keep everyone who's spinning... spinning
    for (const p of snap.ps) {
      if (!p.bs) continue;
      const v = this.viewFor(p.id);
      if (this.t - (v.spinT ?? -9) > 0.26) { v.spinT = this.t; audio.play('spin', { x: v.x, y: v.y, vol: 0.55 }); }
      const R = p.br || 62;
      if (Math.random() < dt * 40) { const a = Math.random() * Math.PI * 2, rr = R * (0.6 + Math.random() * 0.4); this.particles.push({ x: v.x + Math.cos(a) * rr, y: v.y - 4 + Math.sin(a) * rr, vx: -Math.sin(a) * 140, vy: Math.cos(a) * 140, life: 0.35, max: 0.35, size: 2, color: Math.random() < 0.6 ? '#9a1424' : '#1c0a0c', glow: Math.random() < 0.5, shrink: true }); }
    }
    this.updateFishing(dt, me);
    // photo mode: mouse wheel zooms
    if (this.photo) {
      this.input.wheelOpen = true;
      if (this.input.scroll) { this.photoZoom = Math.max(0.35, Math.min(1.6, this.photoZoom - this.input.scroll * 0.1)); this.input.scroll = 0; }
      this.renderer.zoomMul = this.photoZoom;
    } else this.renderer.zoomMul = 1;
  },

  // your class level, skill tree, coins and items are saved on your character
  saveProgress(me, dt, force) {
    if (me && me.lv) {
      const key = JSON.stringify([me.k, me.lv, Math.floor(me.xp / 10), me.tr, me.np, me.pr, me.rb, me.co, me.it]);
      if (key !== this.progKey) {
        this.progKey = key;
        this.char.prog = this.char.prog || {};
        this.char.prog[me.k] = { lv: me.lv, xp: me.xp, tree: { ...me.tr }, np: me.np, pres: { ...me.pr }, reb: { ...me.rb } };
        this.char.coins = me.co;
        this.char.items = { ...me.it };
        this.dirty = true;
      }
    }
    this.saveT -= dt;
    if (this.dirty && (force || this.saveT <= 0)) {
      this.dirty = false;
      this.saveT = 6;
      this.backend.saveChar(this.char).catch((e) => console.warn('save failed', e));
    }
  },

  // Rogue: a faint ring under whoever Shadowstep would jump behind
  updateStepAim(snap, me) {
    if (me.k !== 'rogue' || me.dn) { this.stepAim = null; return; }
    let best = null, bs = 1e9;
    for (const e of snap.es) {
      const v = this.views.get('e' + e.id);
      if (!v) continue;
      const dx = v.x - this.lp.x, dy = v.y - this.lp.y, d = Math.hypot(dx, dy);
      if (d > ROGUE.stepRange || (e.t === 'duelist' && d < 24)) continue;
      const da = Math.abs(angDiff(Math.atan2(dy, dx), this.lp.aim));
      if (da > 0.8 || !this.world.lineOfSight(this.lp.x, this.lp.y - 8, v.x, v.y - 8)) continue;
      const s = da * 120 + d * 0.3;
      if (s < bs) { bs = s; best = e.id; }
    }
    if (!best) { this.stepAim = null; return; }
    if (!this.stepAim || this.stepAim.id !== best) this.stepAim = { id: best, t0: this.t };
  },

  // ---------------------------------------------------- keys: chat, items, photo, dev console
  extraKeys(me, snap) {
    const c = this.input.counts, l = this.lastExtra || (this.lastExtra = { ...c });
    const pressed = (k) => c[k] > (l[k] || 0);
    const free = !settings.open && !pause.open;
    if (pressed('chat') && free) chat.open();
    if (pressed('photo') && free) this.togglePhoto();
    if (pressed('dev') && free && isDev(this.user)) devConsole.toggle();
    for (const [i, it] of [[1, 'tonic'], [2, 'draught'], [3, 'brew']]) if (pressed('item' + i) && free && snap.sc !== 'lobby') this.useItem(it, me);
    this.lastExtra = { ...c };
  },
  useItem(id, me) {
    if (!(me.it && me.it[id] > 0)) { toast(`No ${byId(SHOP, id).name} left. Buy more from the merchant in camp.`); audio.play('nope'); return; }
    this.act('useItem', id);
  },
  togglePhoto() {
    this.photo = !this.photo;
    document.body.classList.toggle('photo', this.photo);
    if (this.photo) toast(`Photo mode: scroll to zoom, ${keyName(prefs.keys.photo)} to exit`, 2500);
    else { this.input.wheelOpen = false; this.renderer.zoomMul = 1; }
  },

  // ---------------------------------------------------- camp stations
  stationPrompt(best, me, key, go) {
    switch (best.type) {
      case 'skilltree':
        this.prompt = { x: best.x, y: best.y - 92, text: `[${key}] The Skilltree`, sub: me.lv >= MAX_LEVEL ? 'Mastered! Spend points or ignite here' : me.pts ? `${me.pts} skill point${me.pts > 1 ? 's' : ''} to spend` : 'Spend skill points and ignition here' };
        if (go) { this.tree.edit = true; this.tree.lastKey = ''; if (!this.tree.open) this.tree.show(); }
        return true;
      case 'shop':
        this.prompt = { x: best.x, y: best.y - 58, text: `[${key}] The Merchant`, sub: `Potions and Reclaim Seeds · you have ${me.co || 0} coins` };
        if (go) shopPanel.toggle(this);
        return true;
      case 'lboard':
        this.prompt = { x: best.x, y: best.y - 50, text: `[${key}] Leaderboard`, sub: 'Daily runs and the deepest endless runs' };
        if (go) lboardPanel.toggle(this);
        return true;
      case 'pathstone': {
        const snap = this.lastSnap, m = byId(MODES, snap ? snap.md : 'casual');
        this.prompt = { x: best.x, y: best.y - 46, text: `[${key}] The Waystone`, sub: `Next run: ${m.name}${snap && snap.rs ? ` (from forest ${snap.rs})` : ''}${this.isHost && !this.waitSim ? '' : ' · the host chooses'}` };
        if (go) { if (this.isHost && !this.waitSim) modePanel.toggle(this); else { toast('Only the host can choose the path.'); audio.play('nope'); } }
        return true;
      }
      case 'pond': {
        const caught = Object.keys(this.char.fish || {}).filter((k) => k !== 'boot').length;
        const kinds = FISH.filter((f) => f.id !== 'boot').length;
        if (!this.fishing) this.prompt = { x: best.x, y: best.y - 40, text: `[${key}] Fish`, sub: `Fish journal: ${caught}/${kinds} kinds caught` };
        if (go) this.fishInteract(best, me);
        return true;
      }
      case 'duelring': {
        const D = this.lastSnap && this.lastSnap.du;
        const inRing = Math.hypot(best.x - this.lp.x, best.y - this.lp.y) < best.r;
        if (!inRing) return false;
        this.prompt = D ? { x: best.x, y: best.y - best.r - 10, text: 'A duel is on!', sub: 'Step out of the ring to forfeit' }
          : { x: best.x, y: best.y - best.r - 10, text: me.dr ? 'Ready! Waiting for an opponent…' : `[${key}] Ready to duel`, sub: 'Two players ready up inside the ring. Nobody\'s flame can go out.' };
        return true; // the host sees the interact press itself
      }
    }
    return false;
  },

  // ---------------------------------------------------- fishing (just for you, at the camp pond)
  fishInteract(pond, me) {
    const F = this.fishing;
    if (!F) {
      const a = Math.atan2(pond.y - this.lp.y, pond.x - this.lp.x);
      this.fishing = { st: 'wait', t: 2.5 + Math.random() * 5, bx: pond.x - Math.cos(a) * 18 + (Math.random() - 0.5) * 20, by: pond.y - Math.sin(a) * 10 + (Math.random() - 0.5) * 8, t0: this.t };
      this.lp.emote = 'fish'; this.lp.emoteAt = this.t; this.sendEmote('fish');
      audio.play('cast');
      return;
    }
    if (F.st === 'bite') {
      const fish = rollFish();
      this.char.fish = this.char.fish || {};
      const isNew = !this.char.fish[fish.id] && fish.id !== 'boot';
      this.char.fish[fish.id] = (this.char.fish[fish.id] || 0) + 1;
      this.dirty = true;
      audio.play(fish.id === 'boot' ? 'nope' : 'catch');
      this.burst(F.bx, F.by, 14, { color: '#bfe8ff', speed: 70, life: 0.6, up: 40 });
      this.banner(fish.id === 'boot' ? 'An old boot…' : `You caught a ${fish.name}!`, 2, isNew ? 'New fish for your journal!' : `You've caught ${this.char.fish[fish.id]} of these`);
    } else { toast('Too early! Wait for the bobber to dip.'); audio.play('nope'); }
    this.stopFishing();
  },
  updateFishing(dt, me) {
    const F = this.fishing;
    if (!F) return;
    if (this.lp.moving || me.dn || this.world.kind !== 'lobby') { this.stopFishing(); return; }
    F.t -= dt;
    if (F.st === 'wait' && F.t <= 0) { F.st = 'bite'; F.t = 0.85; audio.play('bite'); this.burst(F.bx, F.by, 6, { color: '#cfefff', speed: 40, life: 0.4 }); }
    else if (F.st === 'bite' && F.t <= 0) { toast('It got away…'); this.stopFishing(); }
  },
  stopFishing() {
    this.fishing = null;
    if (this.lp.emote === 'fish') { this.lp.emote = null; this.sendEmote(''); }
  },

  // ---------------------------------------------------- new effects
  extraFx(f, mine, at) {
    switch (f.k) {
      case 'lvl':
        if (mine) {
          audio.play('lvl');
          this.banner(`Level ${f.lvl}!`, 2, f.lvl >= MAX_LEVEL ? `${byId(CLASSES, this.cls).name} mastered! Ignite it at the Skilltree in camp` : '+1 skill point · spend it at the Skilltree in camp');
        } else toast(`${f.n} reached level ${f.lvl}`);
        return true;
      case 'treeBuy': if (mine) audio.play('boon'); return true;
      case 'cry':
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: 140, t0: this.t, life: 0.7, color: 'rgba(170,15,30,1)', light: 160, lcol: [200, 30, 40] });
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: 80, t0: this.t + 0.1, life: 0.6, color: 'rgba(40,0,5,1)' });
        this.burst(f.x, f.y - 20, 18, { color: '#b0162a', speed: 140, life: 0.6, glow: true });
        this.burst(f.x, f.y - 16, 12, { color: '#1c0a0c', speed: 80, life: 0.9, up: 30 });
        audio.play('warcry', at);
        if (mine) { this.addShake(4); if (f.n) toast(`Battle Cry: ${f.n} enem${f.n === 1 ? 'y turns' : 'ies turn'} on you!`, 1800); }
        return true;
      case 'storm':
        audio.play('pyre', at);
        if (mine) { this.banner('BLADESTORM', 1.2); this.addShake(5); }
        return true;
      case 'unquench':
        this.burst(f.x, f.y - 16, 24, { color: '#b0162a', speed: 120, life: 0.7, glow: true, up: 40 });
        audio.play('wfReady', at);
        if (mine) this.banner('Unquenchable!', 1.5, 'Your flame cannot go out for 2 seconds');
        return true;
      case 'furyUse': {
        const v = this.viewFor(f.id);
        this.burst(v.x, v.y - 14, Math.min(20, 4 + f.v / 4), { color: '#b0162a', speed: 90, life: 0.45, glow: true });
        this.burst(v.x, v.y - 14, 5, { color: '#1c0a0c', speed: 50, life: 0.7, up: 20 });
        return true;
      }
      case 'reclaim': if (mine) { audio.play('ember'); toast('Point reclaimed. Spend it somewhere new!'); } return true;
      case 'prestige':
        this.burst(f.x, f.y - 16, 40, { color: '#ffe9a0', speed: 160, life: 1.2, glow: true, up: 60 });
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: 60, t0: this.t, life: 0.8, color: 'rgba(255,230,150,1)', light: 200 });
        audio.play('victory');
        if (mine) this.banner(f.rebirth ? `Rebirth ${f.np / 5}!` : `Ignition ${f.np}!`, 3, 'Back to level 1, stronger than before');
        else toast(`${f.n} reached ignition ${f.np}!`);
        return true;
      case 'bought': if (mine) { audio.play('coin'); toast(`Bought a ${byId(SHOP, f.item).name}`); } return true;
      case 'drink':
        this.burst(f.x, f.y - 16, 12, { color: f.item === 'tonic' ? '#ffb070' : f.item === 'draught' ? '#ffe28a' : '#9fffb0', speed: 60, life: 0.7, glow: true, up: 40 });
        audio.play('drink', at);
        return true;
      case 'phoenix':
        this.burst(f.x, f.y - 16, 40, { color: '#ffb050', speed: 170, life: 1, glow: true, up: 70 });
        audio.play('revive', at);
        if (mine) this.banner('The Phoenix Feather relights you!', 2); else toast(`${f.n}'s Phoenix Feather relit their flame!`);
        return true;
      case 'nope':
        if (!mine || !['coins', 'full', 'fullhp', 'fullwf', 'cuts'].includes(f.what)) return false;
        audio.play('nope');
        toast({ coins: 'Not enough coins.', full: "You can't carry any more of that.", fullhp: 'Your flame is already full.', fullwf: 'Your Wildfire is already full.', cuts: 'No enemies close enough for Thousand Cuts.' }[f.what]);
        return true;
      case 'mode': {
        const m = byId(MODES, f.mode);
        toast(`Next run: ${m.name}${f.rs ? ` (continuing from forest ${f.rs})` : ''}`);
        audio.play('boon');
        return true;
      }
      case 'event': {
        const ev = byId(EVENTS, f.ev);
        setTimeout(() => { if (this.alive) { this.banner(`Forest event: ${ev.name}`, 3, ev.desc); audio.play('gate'); } }, 2600);
        return true;
      }
      case 'combo':
        this.effects.push({ k: 'num', x: f.x, y: f.y, dx: 0, text: f.n, t0: this.t, life: 1.1, big: true, color: '#ffe36a' });
        this.burst(f.x, f.y + 10, 16, { color: '#fff0a0', speed: 130, life: 0.5, glow: true });
        audio.play('combo', at);
        return true;
      case 'surge':
        this.effects.push({ k: 'ring', x: f.x, y: f.y, r: 170, t0: this.t, life: 0.7, color: 'rgba(255,210,120,1)', light: 320 });
        this.burst(f.x, f.y - 10, 60, { color: '#ffcf70', speed: 260, life: 0.9, glow: true });
        this.addShake(10); this.flash = 1;
        audio.play('boom', at);
        this.banner('TWINFLARE!', 1.8, `${f.a} and ${f.b} unleashed their Wildfire together`);
        return true;
      case 'chat':
        this.bubbles.set(f.id, { text: f.text, t0: this.t });
        chat.add(f.n, f.text, f.id === this.myId);
        if (f.id !== this.myId) audio.play('chat');
        return true;
      case 'dev': if (mine) devConsole.log(f.text); return true;
      case 'duelReady': if (f.on) toast(`${f.n} is ready to duel!`); return true;
      case 'duelStart': audio.play('gate'); this.banner(`${f.a} vs ${f.b}`, 3, 'The duel starts in 3…'); return true;
      case 'duelGo': audio.play('roar'); this.banner('Fight!', 0.9); return true;
      case 'duelEnd': audio.play(f.wid === this.myId ? 'victory' : 'boon'); this.banner(`${f.w} wins the duel!`, 2.5, f.forfeit ? `${f.l} stepped out of the ring` : `${f.l} yields`); return true;
      case 'clink': this.burst(f.x, f.y, 4, { color: '#c8d0c0', speed: 70, life: 0.25 }); audio.play('thunk', at); if (prefs.dmgNums) this.effects.push({ k: 'num', x: f.x, y: f.y - 6, dx: 0, text: 'armoured', t0: this.t, life: 0.7, big: false, color: '#b8c4b0' }); return true;
      case 'shamanHeal':
        for (const [x, y] of f.pts) this.effects.push({ k: 'beam', x: f.x, y: f.y - 14, x2: x, y2: y - 10, t0: this.t, life: 0.5, col: [150, 255, 140] });
        audio.play('healed', at);
        return true;
      case 'snare': audio.play('rootsCall', { ...at, vol: 0.5 }); return true;
      case 'webSpit': audio.play('bow', at); return true;
      case 'web': this.burst(f.x, f.y - 4, 10, { color: '#e8eef0', speed: 70, life: 0.5 }); audio.play('thwack', at); return true;
      case 'uproot': audio.play('roar'); this.addShake(12); this.banner('The Oak tears up its roots!', 2.5, 'The thorns are closing in. Stay inside the ring!'); return true;
      case 'bossDown': audio.play('victory'); this.banner('The Creaking Oak falls!', 2.5, 'But the endless forest goes on…'); return true;
      case 'runOver': this.onRunOver(f); return true;
      case 'endlessSave':
        if (this.isHost && !this.waitSim) { this.char.endless = f.save; this.backend.saveChar(this.char).catch(() => {}); }
        toast(`Endless run saved: continue from forest ${f.save.forest} at the Waystone.`, 5000);
        return true;
    }
    return false;
  },

  // leaderboards (the host records the party's run) and endless saves
  onRunOver(f) {
    if (!this.isHost || this.waitSim) return;
    if (f.mode === 'endless' && f.why === 'wipe') { this.char.endless = null; this.backend.saveChar(this.char).catch(() => {}); }
    if ((f.mode === 'daily' || f.mode === 'endless') && f.cleared > 0 && this.backend.submitRun) {
      this.backend.submitRun({ mode: f.mode, day: f.day, forests: f.cleared, time_s: f.time, won: !!f.won, party: f.party, classes: f.cls })
        .then(() => toast(f.mode === 'daily' ? 'Your daily run is on the leaderboard!' : `Endless: ${f.cleared} forest${f.cleared > 1 ? 's' : ''} cleared. Recorded on the leaderboard!`))
        .catch((e) => console.warn('leaderboard', e));
    }
  },

  // is the music "sitting by the fire"? (you, sitting near the campfire)
  firesideMusic(snap) {
    const cf = this.world.campfire;
    return !!cf && snap.sc === 'lobby' && this.lp.emote === 'sit' && Math.hypot(cf.x - this.lp.x, cf.y - this.lp.y) < 120;
  },
};

export function installGameExtras(Game) { Object.assign(Game.prototype, X); }
