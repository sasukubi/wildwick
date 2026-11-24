// =============================================================
//  Sound: every effect, ambience and music track is created by
//  code with the Web Audio API (original, no sound files).
//  Volumes: master / music / sfx / ambience / ui (saved locally).
// =============================================================

const DEFAULTS = { master: 0.8, music: 0.45, sfx: 0.8, amb: 0.6, ui: 0.7 };

function loadVol() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('wildwick.volume') || '{}') }; } catch { return { ...DEFAULTS }; }
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = loadVol();
    this.listener = { x: 0, y: 0 };
    this.track = null;
    this.amb = null;
    this.nextBeat = 0;
    this.beat = 0;
    this.ambTimers = { cricket: 0, crackle: 0, owl: 8 };
  }

  // Browsers only allow sound after the player clicks or presses a key.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.bus = {};
    for (const k of ['music', 'sfx', 'amb', 'ui']) { this.bus[k] = ctx.createGain(); this.bus[k].connect(this.master); }
    // a soft forest echo on sound effects makes them feel less "synthetic"
    const irLen = Math.floor(ctx.sampleRate * 1.4);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2) * (i < 40 ? i / 40 : 1);
    }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500;
    this.bus.sfx.connect(lp); lp.connect(verb); verb.connect(wet); wet.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.pendingTrack) this.setScene(this.pendingTrack);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.bus.music.gain.value = this.vol.music * 0.5;
    this.bus.sfx.gain.value = this.vol.sfx;
    this.bus.amb.gain.value = this.vol.amb * 0.6;
    this.bus.ui.gain.value = this.vol.ui;
  }

  setVolume(key, v) {
    this.vol[key] = v;
    try { localStorage.setItem('wildwick.volume', JSON.stringify(this.vol)); } catch { /* ignore */ }
    this.applyVolumes();
  }

  // ---------------------------------------------------------- building blocks
  tone(freq, dur, o = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = (o.when || ctx.currentTime) + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const peak = o.gain ?? 0.3, a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    node.connect(g);
    g.connect(o.out || this.bus[o.bus || 'sfx']);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib; lg.gain.value = o.vibDepth || 8;
      l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
  }

  noise(dur, o = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = (o.when || ctx.currentTime) + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.out || this.bus[o.bus || 'sfx']);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // positional loudness (quieter the further away it happens)
  near(x, y, range = 650) {
    if (x === undefined) return 1;
    const d = Math.hypot(x - this.listener.x, y - this.listener.y);
    return Math.max(0, 1 - d / range);
  }

  // ---------------------------------------------------------- sound effects
  play(name, o = {}) {
    if (!this.ctx) return;
    const v = this.near(o.x, o.y, o.range) * (o.vol ?? 1);
    if (v <= 0.02) return;
    const T = (f, d, p = {}) => this.tone(f, d, { ...p, gain: (p.gain ?? 0.3) * v });
    const N = (d, p = {}) => this.noise(d, { ...p, gain: (p.gain ?? 0.3) * v });
    switch (name) {
      case 'swing': N(0.16, { freq: 700, slide: 2400, q: 0.7, gain: 0.2, attack: 0.02 }); N(0.1, { filter: 'lowpass', freq: 400, gain: 0.08, attack: 0.02 }); break;
      case 'heavy': N(0.2, { freq: 500, slide: 2200, q: 1, gain: 0.3 }); T(140, 0.18, { slide: 70, type: 'triangle', gain: 0.2 }); break;
      case 'hit': N(0.06, { filter: 'lowpass', freq: 1800, slide: 400, gain: 0.4 }); T(150 + Math.random() * 40, 0.09, { slide: 70, gain: 0.25 }); N(0.025, { filter: 'highpass', freq: 3500, gain: 0.12 }); break;
      case 'hitBig': N(0.1, { filter: 'lowpass', freq: 1400, slide: 250, gain: 0.55 }); T(110, 0.16, { slide: 45, gain: 0.4 }); N(0.04, { filter: 'highpass', freq: 2800, gain: 0.18 }); break;
      case 'die': N(0.4, { filter: 'bandpass', freq: 500, slide: 180, q: 2, gain: 0.3, attack: 0.02 }); N(0.25, { filter: 'lowpass', freq: 700, gain: 0.15, delay: 0.05 }); break;
      case 'growl': { const g = o.big ? 0.45 : 0.3; N(0.55, { filter: 'bandpass', freq: o.big ? 160 : 240, slide: o.big ? 120 : 180, q: 6, gain: g, attack: 0.08 }); N(0.5, { filter: 'bandpass', freq: o.big ? 420 : 600, q: 8, gain: g * 0.4, attack: 0.1 }); break; }
      case 'howl': T(330, 1.6, { slide: 470, type: 'sawtooth', lp: 900, vib: 5, vibDepth: 10, attack: 0.35, gain: 0.07 }); N(1.5, { filter: 'bandpass', freq: 800, slide: 1100, q: 9, gain: 0.12, attack: 0.35 }); break;
      case 'hurt': N(0.12, { filter: 'lowpass', freq: 1200, slide: 300, gain: 0.35 }); T(180, 0.12, { slide: 90, gain: 0.18 }); break;
      case 'dash': N(0.24, { freq: 500, slide: 1800, q: 0.6, gain: 0.16, attack: 0.03 }); N(0.08, { filter: 'lowpass', freq: 300, gain: 0.08 }); break;
      case 'quake': N(0.7, { filter: 'lowpass', freq: 260, slide: 60, gain: 0.7, attack: 0.01 }); T(55, 0.5, { slide: 30, gain: 0.45 }); for (let i = 0; i < 6; i++) N(0.05, { filter: 'bandpass', freq: 900, q: 2, gain: 0.12, delay: 0.05 + Math.random() * 0.3 }); break;
      case 'guardOn': for (const f of [880, 1330, 1990]) T(f, 0.09, { gain: 0.07 }); break;
      case 'block': N(0.05, { filter: 'highpass', freq: 2500, gain: 0.3 }); for (const f of [823, 1290, 1977]) T(f * (0.98 + Math.random() * 0.04), 0.3, { gain: 0.05 }); N(0.2, { filter: 'bandpass', freq: 2200, q: 12, gain: 0.15 }); break;
      case 'perfect': for (const f of [1046, 1568, 2093]) T(f, 0.5, { gain: 0.09 }); break;
      case 'counter': N(0.25, { freq: 700, slide: 3600, q: 1, gain: 0.3 }); T(300, 0.22, { slide: 660, type: 'triangle', gain: 0.2 }); break;
      case 'pyre':
        N(1.1, { filter: 'lowpass', freq: 400, slide: 2400, gain: 0.55, attack: 0.05 });
        T(90, 0.9, { slide: 50, type: 'sawtooth', lp: 700, gain: 0.3 });
        T(92, 0.9, { slide: 52, type: 'sawtooth', lp: 700, gain: 0.25, detune: 15 });
        for (let i = 0; i < 8; i++) N(0.03, { filter: 'highpass', freq: 3000, gain: 0.15, delay: 0.1 + Math.random() * 0.9 });
        break;
      case 'ember': T(880, 0.12, { type: 'triangle', gain: 0.12 }); T(1175, 0.15, { type: 'triangle', gain: 0.1, delay: 0.06 }); break;
      case 'fuel': [660, 880, 1320, 1760].forEach((f, i) => T(f, 0.25, { type: 'triangle', gain: 0.12, delay: i * 0.05 })); break;
      case 'wfReady': [523, 659, 784, 1046, 1318].forEach((f, i) => T(f, 0.8, { gain: 0.09, delay: i * 0.06, vib: 6, vibDepth: 4 })); break;
      case 'lvl': [523, 659, 784, 1046].forEach((f, i) => { T(f, 0.5, { type: 'triangle', gain: 0.16, delay: i * 0.08 }); T(f * 2, 0.3, { gain: 0.04, delay: i * 0.08 + 0.2 }); }); break;
      case 'down': T(420, 0.9, { slide: 90, type: 'triangle', gain: 0.25 }); N(0.8, { filter: 'lowpass', freq: 600, slide: 150, gain: 0.1 }); break;
      case 'revive': [392, 523, 659, 880].forEach((f, i) => T(f, 0.4, { gain: 0.15, delay: i * 0.07 })); break;
      case 'shrine': for (const [f, gg] of [[440, 0.2], [880, 0.08], [1320, 0.05], [1760, 0.03]]) T(f, 1.8, { gain: gg }); break;
      case 'gate': [220, 330, 440, 554].forEach((f, i) => T(f, 2, { gain: 0.1, delay: i * 0.15, type: 'triangle' })); break;
      case 'rootsCall': N(0.9, { filter: 'lowpass', freq: 160, gain: 0.5, attack: 0.2 }); break;
      case 'root': T(95, 0.3, { slide: 40, gain: 0.45 }); N(0.12, { filter: 'highpass', freq: 1500, gain: 0.25 }); break;
      case 'sweep': N(0.5, { filter: 'lowpass', freq: 250, slide: 1400, gain: 0.45 }); break;
      case 'roar': T(58, 1.3, { type: 'sawtooth', lp: 400, vib: 9, vibDepth: 10, attack: 0.1, gain: 0.4 }); N(1.2, { filter: 'lowpass', freq: 500, gain: 0.25, attack: 0.1 }); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => T(f, 0.5, { type: 'triangle', gain: 0.15, delay: i * 0.12 })); break;
      case 'defeat': [440, 392, 349, 262].forEach((f, i) => T(f, 0.7, { type: 'triangle', gain: 0.14, delay: i * 0.25 })); break;
      case 'nope': T(140, 0.12, { type: 'square', lp: 800, gain: 0.12 }); break;
      case 'boon': [784, 988, 1175].forEach((f, i) => T(f, 0.4, { gain: 0.12, delay: i * 0.05 })); break;
      case 'step': N(0.06, { filter: 'bandpass', freq: 900 + Math.random() * 600, q: 1.5, gain: 0.035 }); break;
      case 'fizzle': N(0.18, { filter: 'bandpass', freq: 1800, slide: 500, q: 3, gain: 0.18 }); T(160, 0.12, { type: 'square', lp: 600, gain: 0.06 }); break;
      case 'bow': N(0.08, { filter: 'bandpass', freq: 1500, q: 4, gain: 0.18 }); T(240, 0.08, { slide: 140, type: 'triangle', gain: 0.12 }); break;
      case 'bowFull': N(0.12, { filter: 'bandpass', freq: 1100, q: 3, gain: 0.3 }); T(180, 0.14, { slide: 90, type: 'triangle', gain: 0.18 }); N(0.3, { freq: 2000, slide: 600, q: 1, gain: 0.1, delay: 0.03 }); break;
      case 'thunk': N(0.06, { filter: 'lowpass', freq: 700, gain: 0.25 }); T(260, 0.05, { slide: 140, gain: 0.1 }); break;
      case 'mark': [880, 1320].forEach((f, i) => T(f, 0.25, { gain: 0.08, delay: i * 0.06 })); break;
      case 'rain': for (let i = 0; i < 10; i++) N(0.06, { filter: 'bandpass', freq: 1400 + Math.random() * 800, q: 3, gain: 0.1, delay: 0.1 + i * 0.18 }); break;
      case 'hawk': T(1400, 0.5, { slide: 900, type: 'triangle', vib: 12, vibDepth: 40, gain: 0.08 }); N(0.4, { freq: 3000, slide: 1500, q: 3, gain: 0.08 }); break;
      case 'stab': N(0.1, { freq: 1600, slide: 3000, q: 2, gain: 0.18 }); N(0.06, { filter: 'lowpass', freq: 600, gain: 0.1, delay: 0.05 }); break;
      case 'spin': N(0.3, { freq: 900, slide: 2800, q: 1, gain: 0.22, attack: 0.03 }); break;
      case 'backstab': N(0.08, { filter: 'lowpass', freq: 900, gain: 0.35 }); T(90, 0.2, { slide: 45, gain: 0.3 }); T(1900, 0.15, { gain: 0.05 }); break;
      case 'step2': N(0.3, { freq: 300, slide: 1600, q: 1.5, gain: 0.18 }); T(500, 0.2, { slide: 180, type: 'sine', gain: 0.06 }); break;
      case 'smoke': N(1.0, { filter: 'lowpass', freq: 900, slide: 300, gain: 0.35, attack: 0.02 }); N(0.06, { filter: 'highpass', freq: 2500, gain: 0.15 }); break;
      case 'pop': N(0.15, { freq: 1200, slide: 400, q: 2, gain: 0.15 }); break;
      case 'ping': T(990, 0.18, { type: 'triangle', gain: 0.14 }); T(1320, 0.25, { type: 'triangle', gain: 0.1, delay: 0.09 }); break;
      case 'cancel': N(0.1, { filter: 'lowpass', freq: 800, gain: 0.15 }); break;
      case 'cuts': for (let i = 0; i < 7; i++) N(0.08, { freq: 1800, slide: 3500, q: 2, gain: 0.16, delay: i * 0.06 }); break;
      case 'dodge': N(0.15, { freq: 2500, slide: 5000, q: 2, gain: 0.12 }); break;
      // Sorcerer
      case 'staff': N(0.12, { freq: 600, slide: 1600, q: 1.5, gain: 0.16 }); T(220, 0.08, { type: 'triangle', gain: 0.08 }); break;
      case 'fire': N(0.3, { filter: 'lowpass', freq: 900, slide: 2400, gain: 0.25 }); T(180, 0.25, { slide: 320, type: 'sawtooth', lp: 900, gain: 0.08 }); break;
      case 'frost': for (const f of [1760, 2350, 2790]) T(f, 0.25, { type: 'triangle', gain: 0.05 }); N(0.12, { filter: 'highpass', freq: 4000, gain: 0.1 }); break;
      case 'gale': N(0.45, { freq: 300, slide: 1400, q: 0.7, gain: 0.3, attack: 0.05 }); break;
      case 'weave': [660, 990, 1320, 1980].forEach((f, i) => T(f, 0.4, { gain: 0.08, delay: i * 0.04, vib: 7, vibDepth: 6 })); break;
      case 'boom': T(110, 0.3, { slide: 40, gain: 0.4 }); N(0.35, { filter: 'lowpass', freq: 1400, slide: 200, gain: 0.35 }); break;
      case 'steam': N(0.8, { filter: 'highpass', freq: 1500, slide: 600, gain: 0.3, attack: 0.02 }); T(90, 0.3, { slide: 45, gain: 0.3 }); break;
      case 'starfall': [523, 784, 1046, 1568].forEach((f, i) => T(f, 1.2, { gain: 0.07, delay: i * 0.09, vib: 5, vibDepth: 5 })); break;
      case 'meteor': T(70, 0.35, { slide: 30, gain: 0.45 }); N(0.3, { filter: 'lowpass', freq: 1200, slide: 150, gain: 0.3 }); break;
      // Cleric
      case 'mace': N(0.14, { freq: 500, slide: 1600, q: 0.8, gain: 0.2, attack: 0.02 }); T(120, 0.1, { slide: 80, type: 'triangle', gain: 0.1 }); break;
      case 'mend': [659, 880, 1175].forEach((f, i) => T(f, 0.6, { type: 'triangle', gain: 0.07, delay: i * 0.05, vib: 5, vibDepth: 3 })); N(0.4, { filter: 'highpass', freq: 5000, gain: 0.04 }); break;
      case 'healed': T(1046, 0.3, { type: 'triangle', gain: 0.06 }); break;
      case 'judge': T(80, 0.35, { slide: 40, gain: 0.45 }); N(0.3, { filter: 'lowpass', freq: 1600, slide: 300, gain: 0.35 }); for (const f of [784, 1175]) T(f, 0.5, { gain: 0.05, delay: 0.03 }); break;
      case 'sanct': [523, 659, 784].forEach((f, i) => T(f, 1.4, { gain: 0.06, delay: i * 0.08, attack: 0.1 })); break;
      case 'dawn': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => T(f, 1.6, { type: 'triangle', gain: 0.08, delay: i * 0.07, vib: 4, vibDepth: 4 })); N(1.2, { filter: 'highpass', freq: 3000, gain: 0.06, attack: 0.2 }); break;
      case 'blessStep': N(0.2, { freq: 900, slide: 2400, q: 0.8, gain: 0.12 }); T(1320, 0.3, { type: 'triangle', gain: 0.05 }); break;
      case 'shieldHit': for (const f of [1400, 2100]) T(f, 0.18, { type: 'triangle', gain: 0.06 }); N(0.05, { filter: 'highpass', freq: 3000, gain: 0.12 }); break;
      // Warlock
      case 'bolt': N(0.18, { filter: 'bandpass', freq: 700, slide: 300, q: 3, gain: 0.2 }); T(260, 0.18, { slide: 130, type: 'sawtooth', lp: 700, gain: 0.06 }); break;
      case 'handsCast': N(0.45, { filter: 'lowpass', freq: 300, slide: 120, gain: 0.3, attack: 0.15 }); break;
      case 'hands': T(70, 0.4, { slide: 35, gain: 0.4 }); N(0.3, { filter: 'bandpass', freq: 400, q: 2, gain: 0.3 }); for (let i = 0; i < 5; i++) N(0.04, { filter: 'highpass', freq: 2000, gain: 0.1, delay: 0.03 * i }); break;
      case 'imps': for (let i = 0; i < 3; i++) T(900 + i * 140, 0.12, { slide: 1400 + i * 100, type: 'square', lp: 1800, gain: 0.04, delay: i * 0.08 }); break;
      case 'siphon': T(180, 1.4, { slide: 360, type: 'sawtooth', lp: 600, vib: 7, vibDepth: 8, gain: 0.07, attack: 0.1 }); N(1.3, { filter: 'bandpass', freq: 900, q: 6, gain: 0.08, attack: 0.1 }); break;
      case 'slip': N(0.18, { filter: 'bandpass', freq: 500, slide: 200, q: 2, gain: 0.18 }); T(300, 0.15, { slide: 120, gain: 0.05 }); break;
      case 'eclipse': T(55, 2, { type: 'sawtooth', lp: 300, vib: 3, vibDepth: 6, attack: 0.3, gain: 0.35 }); T(82, 2, { type: 'sawtooth', lp: 300, attack: 0.3, gain: 0.2 }); N(1.8, { filter: 'lowpass', freq: 400, gain: 0.2, attack: 0.3 }); break;
      case 'famSwipe': N(0.25, { filter: 'lowpass', freq: 600, slide: 1600, gain: 0.25 }); break;
      case 'famDie': N(1.0, { filter: 'lowpass', freq: 500, slide: 120, gain: 0.3, attack: 0.05 }); T(120, 0.8, { slide: 40, type: 'triangle', gain: 0.15 }); break;
      // UI
      case 'click': this.tone(1250, 0.04, { gain: 0.12 * v, bus: 'ui' }); break;
      case 'hover': this.tone(1900, 0.025, { gain: 0.04 * v, bus: 'ui' }); break;
      case 'open': this.tone(660, 0.08, { gain: 0.08 * v, bus: 'ui' }); this.tone(990, 0.1, { gain: 0.08 * v, bus: 'ui', delay: 0.05 }); break;
      case 'close': this.tone(880, 0.08, { gain: 0.08 * v, bus: 'ui' }); this.tone(587, 0.1, { gain: 0.08 * v, bus: 'ui', delay: 0.05 }); break;
    }
  }

  // ---------------------------------------------------------- music & ambience
  setScene(name) {
    if (!this.ctx) { this.pendingTrack = name; return; }
    if (this.track === name) return;
    // the menus and the campfire share the main theme: keep it playing without restarting
    const theme = (n) => n === 'menu' || n === 'lobby';
    if (theme(this.track) && theme(name)) { this.track = name; this.startWind(name); return; }
    this.track = name;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.startWind(name);
  }

  startWind(name) {
    const ctx = this.ctx;
    if (this.amb) { const old = this.amb; old.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5); setTimeout(() => { try { old.src.stop(); } catch { /* */ } }, 2000); }
    if (!name || name === 'menu') { this.amb = null; return; } // menus: music only, no wind
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = name === 'boss' ? 260 : 420;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.08; lg.gain.value = 0.06; lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.bus.amb);
    src.start(); lfo.start();
    g.gain.setTargetAtTime(0.12, ctx.currentTime, 1.5);
    this.amb = { src, g, lfo };
  }

  // call every frame
  update(dt) {
    if (!this.ctx || !this.track) return;
    // ambience (not on the menus)
    if (this.track !== 'menu') {
      const A = this.ambTimers;
      A.cricket -= dt; A.crackle -= dt; A.owl -= dt;
      if (A.cricket <= 0 && this.track !== 'boss') {
        A.cricket = 0.6 + Math.random() * 2.5;
        const f = 4000 + Math.random() * 900;
        for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) this.tone(f, 0.03, { gain: 0.02, bus: 'amb', delay: i * 0.07 });
      }
      if (this.track === 'lobby' && A.crackle <= 0) {
        A.crackle = 0.05 + Math.random() * 0.35;
        this.noise(0.02 + Math.random() * 0.03, { filter: 'highpass', freq: 1800 + Math.random() * 3000, gain: 0.05 + Math.random() * 0.08, bus: 'amb' });
      }
      if ((this.track === 'forest' || this.track === 'lobby') && A.owl <= 0) {
        A.owl = 14 + Math.random() * 20;
        this.tone(390, 0.35, { gain: 0.04, bus: 'amb', attack: 0.08, vib: 6, vibDepth: 6 });
        this.tone(360, 0.55, { gain: 0.04, bus: 'amb', attack: 0.08, delay: 0.45, vib: 6, vibDepth: 6 });
      }
    }
    // music: schedule notes a little ahead of time
    const song = SONGS[this.track] || SONGS.forest;
    // the camp theme picks up a little as you walk towards the archway (tempo is set by the game)
    const tempo = this.track === 'lobby' ? this.tempo || 1 : 1;
    const step = 60 / (song.bpm * tempo) / 2; // eighth notes
    while (this.nextBeat < this.ctx.currentTime + 0.3) {
      this.playStep(song, this.beat, this.nextBeat, step);
      this.nextBeat += step;
      this.beat++;
    }
  }

  // ---------------------------------------------------------- instruments (all made by code)
  // breathy wooden flute: soft sine with a slow vibrato and a little air noise
  flute(m, when, dur, gain = 0.08) {
    this.tone(midi(m), dur, { type: 'sine', gain, attack: 0.09, bus: 'music', when, vib: 5, vibDepth: 3, lp: 2200 });
    this.tone(midi(m) * 2, dur * 0.8, { type: 'sine', gain: gain * 0.12, attack: 0.12, bus: 'music', when });
    this.noise(dur * 0.9, { filter: 'bandpass', freq: midi(m) * 2, q: 8, gain: gain * 0.25, attack: 0.08, bus: 'music', when });
  }
  // bowed strings: detuned saws, slow swell, darkened
  strings(notes, when, dur, gain = 0.03, bright = 900) {
    for (const m of notes) for (const d of [-7, 7]) this.tone(midi(m), dur, { type: 'sawtooth', gain, attack: Math.min(1.2, dur * 0.4), bus: 'music', when, detune: d, lp: bright });
  }
  // a low, warm cello drone
  cello(m, when, dur, gain = 0.07) { this.tone(midi(m), dur, { type: 'sawtooth', gain, attack: 0.25, bus: 'music', when, lp: 420, vib: 4, vibDepth: 2 }); }
  // soft plucked harp: a darker, rounder pluck (not a bell)
  harp(m, when, gain = 0.05) { this.tone(midi(m), 1.4, { type: 'triangle', gain, attack: 0.006, bus: 'music', when, lp: 1300 }); }
  drum(kind, when, gain = 0.4) {
    if (kind === 'low') this.tone(85, 0.35, { slide: 45, gain, bus: 'music', when });
    else if (kind === 'kick') this.tone(110, 0.2, { slide: 40, gain, bus: 'music', when });
    else if (kind === 'snare') this.noise(0.14, { filter: 'bandpass', freq: 1700, q: 0.8, gain: gain * 0.5, bus: 'music', when });
    else if (kind === 'frame') this.noise(0.22, { filter: 'lowpass', freq: 500, gain: gain * 0.6, bus: 'music', when, attack: 0.01 });
  }
  brass(notes, when, dur, gain = 0.05) {
    for (const m of notes) this.tone(midi(m), dur, { type: 'sawtooth', gain, attack: 0.04, bus: 'music', when, lp: 1400 });
  }

  playStep(song, b, when, step) {
    const bars = song.chords.length;
    const pos = b % 8, bar = Math.floor(b / 8) % bars;
    const chord = song.chords[bar];
    const loopStep = b % (bars * 8);
    if (song.style === 'theme') {
      // pads and drone at the start of each bar
      if (pos === 0) {
        this.strings(chord.map((n) => n + 12), when, step * 8.6, 0.022, 800);
        this.cello(chord[0] - 12, when, step * 8.4, 0.06);
      }
      // gentle broken-chord harp underneath
      if (pos % 2 === 0) this.harp(chord[(pos / 2) % chord.length] + 12, when, song.soft ? 0.035 : 0.045);
      // the melody
      for (const [s0, m, len] of song.melody) if (s0 === loopStep) this.flute(m, when, step * len * 0.95, song.soft ? 0.055 : 0.075);
      if (song.frame && (pos === 0 || pos === 5)) this.drum('frame', when, 0.25);
      return;
    }
    if (song.style === 'dark') {
      if (pos === 0) { this.strings(chord.map((n) => n + 12), when, step * 8.6, 0.022, 650); this.cello(chord[0] - 12, when, step * 8.2, 0.07); }
      // tense string ostinato
      this.tone(midi(chord[pos % 2 === 0 ? 0 : 2]), step * 0.8, { type: 'sawtooth', gain: 0.028, attack: 0.02, bus: 'music', when, lp: 750 });
      if (pos === 0 || pos === 4) this.drum('low', when, 0.35);
      if (pos === 6 && bar % 2 === 1) this.drum('frame', when, 0.3);
      for (const [s0, m, len] of song.melody) if (s0 === loopStep) this.flute(m, when, step * len * 0.95, 0.05);
      return;
    }
    // boss: driving drums, brass stabs, fast strings
    this.tone(midi(chord[0] - 12), step * 0.85, { type: 'sawtooth', gain: 0.07, attack: 0.01, bus: 'music', when, lp: 500 });
    this.tone(midi(chord[pos % 3] + 12), step * 0.45, { type: 'sawtooth', gain: 0.02, attack: 0.01, bus: 'music', when, lp: 1600 });
    this.tone(midi(chord[(pos + 1) % 3] + 12), step * 0.45, { type: 'sawtooth', gain: 0.02, attack: 0.01, bus: 'music', when: when + step / 2, lp: 1600 });
    if (pos % 2 === 0) this.drum('kick', when, 0.5);
    if (pos === 2 || pos === 6) this.drum('snare', when, 0.5);
    if (pos === 0) { this.brass(chord.map((n) => n + 12), when, step * 1.6, 0.04); this.strings(chord.map((n) => n + 12), when, step * 8, 0.015, 1100); }
    if (pos === 7 && bar % 2 === 1) this.brass(chord.map((n) => n + 12), when, step * 0.8, 0.035);
  }
}

// ---------------------------------------------------------- the songs (original)
// Chords and melodies are MIDI note numbers. Steps are eighth notes.
// "Wildwick" main theme: an enchanted, slightly mysterious forest in D minor.
const THEME_CHORDS = [[50, 53, 57], [46, 50, 53], [41, 45, 48], [48, 52, 55], [50, 53, 57], [43, 46, 50], [45, 49, 52], [50, 53, 57]];
const THEME_MELODY = [
  [0, 69, 3], [3, 74, 2], [5, 72, 1], [6, 69, 2],
  [8, 70, 2], [10, 69, 2], [12, 67, 2], [14, 65, 2],
  [16, 69, 3], [19, 72, 2], [21, 77, 1], [22, 76, 2],
  [24, 76, 2], [26, 74, 2], [28, 72, 4],
  [32, 69, 2], [34, 74, 2], [36, 76, 2], [38, 77, 2],
  [40, 79, 2], [42, 77, 2], [44, 74, 2], [46, 70, 2],
  [48, 73, 2], [50, 76, 2], [52, 69, 4],
  [56, 74, 8],
];
const SONGS = {
  menu: { style: 'theme', bpm: 70, chords: THEME_CHORDS, melody: THEME_MELODY },
  lobby: { style: 'theme', bpm: 70, chords: THEME_CHORDS, melody: THEME_MELODY, frame: true },
  rest: { style: 'theme', bpm: 62, chords: THEME_CHORDS, melody: THEME_MELODY.filter((_, i) => i % 2 === 0), soft: true },
  forest: {
    style: 'dark', bpm: 84,
    chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52], [50, 53, 57], [48, 51, 55], [46, 50, 53], [45, 49, 52]],
    melody: [[0, 62, 4], [6, 65, 2], [16, 64, 3], [19, 62, 1], [24, 61, 6], [40, 69, 3], [43, 67, 1], [44, 65, 4], [56, 64, 6]],
  },
  boss: {
    style: 'boss', bpm: 132,
    chords: [[40, 43, 47], [41, 44, 48], [40, 43, 47], [38, 42, 45], [40, 43, 47], [43, 47, 50], [41, 44, 48], [39, 43, 46]],
    melody: [],
  },
};

export const audio = new AudioEngine();
