// =============================================================
//  Sound: every effect, ambience and music track is created by
//  code with the Web Audio API (original, no sound files).
//  Volumes: master / music / sfx / ambience / ui (saved locally).
// =============================================================

const DEFAULTS = { master: 0.8, music: 0.45, sfx: 0.8, amb: 0.6, ui: 0.7 };

function loadVol() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('wildwick.volume') || '{}') }; } catch { return { ...DEFAULTS }; }
}

const SCALES = {
  lobby: { root: 50, steps: [0, 2, 3, 5, 7, 9, 10], bpm: 84, chords: [[0, 3, 7], [-2, 2, 5], [-5, -1, 2], [0, 3, 7]] },
  rest: { root: 53, steps: [0, 2, 4, 5, 7, 9, 11], bpm: 72, chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]] },
  forest: { root: 45, steps: [0, 2, 3, 5, 7, 8, 10], bpm: 96, chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]] },
  boss: { root: 40, steps: [0, 1, 3, 5, 7, 8, 10], bpm: 132, chords: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 1, 5]] },
};
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
    this.track = name;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.startWind(name);
  }

  startWind(name) {
    const ctx = this.ctx;
    if (this.amb) { const old = this.amb; old.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5); setTimeout(() => { try { old.src.stop(); } catch { /* */ } }, 2000); }
    if (!name || name === 'menu') { this.amb = null; return; }
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
    if (!this.ctx || !this.track || this.track === 'menu') return;
    // ambience
    const A = this.ambTimers;
    A.cricket -= dt; A.crackle -= dt; A.owl -= dt;
    if (A.cricket <= 0 && this.track !== 'boss') {
      A.cricket = 0.6 + Math.random() * 2.5;
      const f = 4000 + Math.random() * 900;
      for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) this.tone(f, 0.03, { gain: 0.025, bus: 'amb', delay: i * 0.07 });
    }
    if (this.track === 'lobby' && A.crackle <= 0) {
      A.crackle = 0.05 + Math.random() * 0.35;
      this.noise(0.02 + Math.random() * 0.03, { filter: 'highpass', freq: 1800 + Math.random() * 3000, gain: 0.05 + Math.random() * 0.08, bus: 'amb' });
    }
    if (this.track === 'forest' && A.owl <= 0) {
      A.owl = 14 + Math.random() * 20;
      this.tone(390, 0.35, { gain: 0.05, bus: 'amb', attack: 0.08, vib: 6, vibDepth: 6 });
      this.tone(360, 0.55, { gain: 0.05, bus: 'amb', attack: 0.08, delay: 0.45, vib: 6, vibDepth: 6 });
    }
    // music: schedule notes a little ahead of time
    const S = SCALES[this.track] || SCALES.forest;
    const step = 60 / S.bpm / 2; // eighth notes
    while (this.nextBeat < this.ctx.currentTime + 0.25) {
      this.playBeat(S, this.beat, this.nextBeat, step);
      this.nextBeat += step;
      this.beat++;
    }
  }

  playBeat(S, b, when, step) {
    const bar = Math.floor(b / 8) % 4, pos = b % 8;
    const chord = S.chords[bar];
    const out = 'music';
    const note = (deg, oct) => S.root + oct * 12 + deg;
    if (this.track === 'boss') {
      // driving bass, kick and snare
      this.tone(midi(note(chord[0], 0)), step * 0.9, { type: 'sawtooth', lp: 500, gain: 0.18, bus: out, when });
      if (pos % 4 === 0) this.tone(110, 0.18, { slide: 40, gain: 0.5, bus: out, when });
      if (pos % 4 === 2) this.noise(0.12, { filter: 'bandpass', freq: 1800, q: 0.7, gain: 0.18, bus: out, when });
      if (pos === 0) for (const c of chord) this.tone(midi(note(c, 2)), step * 7, { type: 'sawtooth', lp: 900, gain: 0.035, attack: 0.3, bus: out, when });
      if (Math.random() < 0.35) this.tone(midi(note(S.steps[Math.floor(Math.random() * 7)], 3)), step * 1.5, { type: 'square', lp: 1600, gain: 0.04, bus: out, when });
      return;
    }
    // pads at the start of each bar
    if (pos === 0) {
      for (const c of chord) {
        this.tone(midi(note(c, 1)), step * 8.5, { type: 'sawtooth', lp: 700, gain: 0.03, attack: 0.6, bus: out, when, detune: -6 });
        this.tone(midi(note(c, 1)), step * 8.5, { type: 'sawtooth', lp: 700, gain: 0.03, attack: 0.6, bus: out, when, detune: 6 });
      }
      this.tone(midi(note(chord[0], 0)), step * 8, { type: 'sine', gain: 0.12, attack: 0.2, bus: out, when });
    }
    // plucked arpeggio / melody
    const sparse = this.track === 'forest' ? 0.45 : 0.75;
    if (Math.random() < sparse) {
      const deg = pos % 2 === 0 ? chord[(pos / 2) % 3] : S.steps[Math.floor(Math.random() * 7)];
      this.tone(midi(note(deg, 2)), step * 2.2, { type: 'triangle', gain: 0.09, bus: out, when });
    }
  }
}

export const audio = new AudioEngine();
