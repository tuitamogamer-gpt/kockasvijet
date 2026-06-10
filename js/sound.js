// ===== KockaSvijet — zvuk (sve sintetizovano u WebAudio) =====
(function () {

let ctx = null;
let masterGain, sfxGain, musicGain, reverb;
let started = false;

const snd = KS.snd = {
  volumes: { master: 0.8, music: 0.5, sfx: 1.0 },

  init () {
    if (started) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    started = true;
    masterGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain = ctx.createGain();
    // jednostavan reverb: impuls od šuma s opadanjem
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 1.6;
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8) * 0.4;
    }
    reverb.buffer = imp;
    const revGain = ctx.createGain(); revGain.gain.value = 0.25;
    sfxGain.connect(masterGain);
    musicGain.connect(masterGain);
    musicGain.connect(reverb); reverb.connect(revGain); revGain.connect(masterGain);
    masterGain.connect(ctx.destination);
    this.applyVolumes();
    this._musicTimer = 0;
    this._nextMotif = 2 + Math.random() * 4;
  },
  resume () { if (ctx && ctx.state === 'suspended') ctx.resume(); },
  applyVolumes () {
    if (!ctx) return;
    masterGain.gain.value = this.volumes.master * this.volumes.master;
    musicGain.gain.value = this.volumes.music * 0.34;
    sfxGain.gain.value = this.volumes.sfx;
  },

  // prostorni gain/pan u odnosu na igrača
  _spatial (pos) {
    let vol = 1, pan = 0;
    const g = KS.game;
    if (pos && g && g.player) {
      const p = g.player;
      const dx = pos.x - p.x, dy = pos.y - (p.y + 1.6), dz = pos.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      vol = KS.clamp(1 - d / 22, 0, 1); vol *= vol;
      if (d > 0.5) {
        const yaw = p.yaw;
        const rx = dx * Math.cos(-yaw) - dz * Math.sin(-yaw);
        pan = KS.clamp(rx / Math.max(4, d), -1, 1) * 0.7;
      }
    }
    return [vol, pan];
  },
  _out (vol, pan, when) {
    const g = ctx.createGain(); g.gain.value = vol;
    let node = g;
    if (Math.abs(pan) > 0.01 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); node = p; p.connect(sfxGain);
    } else g.connect(sfxGain);
    return g;
  },

  _noiseBuf () {
    if (this.__nb) return this.__nb;
    const len = ctx.sampleRate * 0.7;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.__nb = b;
    return b;
  },

  // kratki nalet filtriranog šuma (kopanje, koraci, lom)
  _thud (vol, pan, freq, dur, type, pitchMul) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf();
    src.playbackRate.value = pitchMul || 1;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = this._out(vol, pan);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g);
    src.start(t); src.stop(t + dur + 0.05);
  },
  _tone (vol, pan, f0, f1, dur, type, delay) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(); o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this._out(0.0001, pan);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    o.start(t); o.stop(t + dur + 0.05);
  },

  // materijal → karakter zvuka
  _matFreq (mat) {
    switch (mat) {
      case 'stone': return [900, 0.9];
      case 'wood': return [520, 1.0];
      case 'sand': return [1800, 0.55];
      case 'grass': return [1300, 0.7];
      case 'snow': return [2400, 0.45];
      case 'glass': return [3200, 1.4];
      case 'wool': return [700, 0.4];
      default: return [1100, 0.8];
    }
  },

  play (name, opts) {
    if (!ctx) return;
    opts = opts || {};
    let [vol, pan] = this._spatial(opts.pos);
    vol *= (opts.vol !== undefined ? opts.vol : 1);
    if (vol <= 0.01) return;
    const pm = (opts.pitch || 1) * (0.92 + Math.random() * 0.16);
    switch (name) {
      case 'dig': { const [f, v] = this._matFreq(opts.mat); this._thud(vol * 0.5 * v, pan, f * pm, 0.09, 'lowpass', pm * 1.4); break; }
      case 'break': { const [f, v] = this._matFreq(opts.mat); this._thud(vol * 0.85 * v, pan, f * pm, 0.16, 'lowpass', pm); this._thud(vol * 0.4, pan, f * 0.5 * pm, 0.22, 'lowpass', pm * 0.7); break; }
      case 'place': { const [f, v] = this._matFreq(opts.mat); this._thud(vol * 0.7 * v, pan, f * 0.8 * pm, 0.12, 'lowpass', pm * 0.9); break; }
      case 'step': { const [f, v] = this._matFreq(opts.mat); this._thud(vol * 0.16 * v, pan, f * 0.9 * pm, 0.07, 'lowpass', pm * 1.2); break; }
      case 'glass': this._thud(vol * 0.8, pan, 3400 * pm, 0.25, 'highpass', pm * 1.6); this._tone(vol * 0.2, pan, 1800 * pm, 600, 0.18, 'triangle'); break;
      case 'pop': this._tone(vol * 0.32, pan, 420 * pm, 900 * pm, 0.09, 'square'); break;
      case 'click': this._thud(0.25, 0, 2600, 0.045, 'bandpass', 1.5); break;
      case 'hurt': this._tone(vol * 0.5, pan, 360 * pm, 160, 0.18, 'square'); this._thud(vol * 0.3, pan, 700, 0.12, 'lowpass', 1); break;
      case 'die': this._tone(vol * 0.55, pan, 320, 60, 0.7, 'sawtooth'); break;
      case 'eat': this._thud(vol * 0.45, pan, 900 * pm, 0.07, 'bandpass', 0.8 + Math.random() * 0.4); break;
      case 'burp': this._tone(vol * 0.4, pan, 140, 70, 0.25, 'sawtooth'); break;
      case 'jump': this._thud(vol * 0.1, pan, 1500, 0.05, 'lowpass', 1.3); break;
      case 'splash': this._thud(vol * 0.6, pan, 1300 * pm, 0.4, 'bandpass', 0.8); break;
      case 'swim': this._thud(vol * 0.2, pan, 1100 * pm, 0.18, 'bandpass', 0.9); break;
      case 'fuse': this._thud(vol * 0.5, pan, 4200, 0.5, 'highpass', 1.2); break;
      case 'explode':
        this._thud(vol * 1.5, pan, 320, 0.9, 'lowpass', 0.5);
        this._thud(vol * 0.8, pan, 140, 1.4, 'lowpass', 0.3);
        this._tone(vol * 0.4, pan, 90, 30, 0.8, 'sine');
        break;
      case 'oink': this._tone(vol * 0.45, pan, 300 * pm, 480 * pm, 0.09, 'sawtooth'); this._tone(vol * 0.4, pan, 420 * pm, 260 * pm, 0.12, 'sawtooth', 0.1); break;
      case 'moo': this._tone(vol * 0.4, pan, 180 * pm, 130 * pm, 0.5, 'sawtooth'); this._tone(vol * 0.22, pan, 360 * pm, 250 * pm, 0.45, 'triangle', 0.04); break;
      case 'groan': this._tone(vol * 0.4, pan, 120 * pm, 85 * pm, 0.55, 'sawtooth'); this._tone(vol * 0.18, pan, 245 * pm, 160 * pm, 0.5, 'square', 0.08); break;
      case 'zombieHurt': this._tone(vol * 0.5, pan, 200 * pm, 110, 0.22, 'sawtooth'); break;
      case 'attack': this._thud(vol * 0.4, pan, 1800 * pm, 0.07, 'bandpass', 1.5); break;
      case 'lava': this._thud(vol * 0.35, pan, 280, 0.5, 'lowpass', 0.5); break;
      case 'levelup': this._tone(0.25, 0, 660, 0, 0.1, 'square'); this._tone(0.25, 0, 880, 0, 0.18, 'square', 0.11); break;
      case 'furnace': this._thud(vol * 0.2, pan, 900, 0.4, 'bandpass', 0.7); break;
      case 'chestOpen': this._thud(vol * 0.4, pan, 600, 0.2, 'lowpass', 0.8); this._tone(vol * 0.1, pan, 220, 320, 0.18, 'triangle'); break;
      case 'chestClose': this._thud(vol * 0.45, pan, 500, 0.15, 'lowpass', 0.7); break;
    }
  },

  // ---------- generativna muzika ----------
  _note (freq, when, dur, vel) {
    const t = ctx.currentTime + when;
    for (const [mult, mv, type] of [[1, 1, 'sine'], [2, 0.28, 'sine'], [3, 0.07, 'triangle']]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel * mv, t + 0.06 + Math.random() * 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + dur + 0.1);
    }
  },
  tickMusic (dt, isNight) {
    if (!ctx || this.volumes.music <= 0.01) return;
    this._musicTimer += dt;
    if (this._musicTimer < this._nextMotif) return;
    this._musicTimer = 0;
    this._nextMotif = 14 + Math.random() * 18;
    // pentatonika: C D E G A (durska) ili A C D E G (molska za noć)
    const baseDay = [261.63, 293.66, 329.63, 392.0, 440.0];
    const baseNight = [220.0, 261.63, 293.66, 329.63, 392.0];
    const scale = isNight ? baseNight : baseDay;
    let when = 0.1;
    const phrases = 3 + (Math.random() * 4 | 0);
    let degree = (Math.random() * scale.length) | 0;
    for (let i = 0; i < phrases; i++) {
      degree = KS.clamp(degree + ((Math.random() * 5) | 0) - 2, 0, scale.length - 1);
      const oct = Math.random() < 0.3 ? 2 : 1;
      const dur = 1.6 + Math.random() * 2.2;
      this._note(scale[degree] * oct, when, dur, 0.16 + Math.random() * 0.1);
      if (Math.random() < 0.45) { // kvintni sloj
        this._note(scale[(degree + 2) % scale.length] * 0.5, when + 0.12, dur * 1.2, 0.08);
      }
      when += 0.9 + Math.random() * 1.4;
    }
  },
};

})();
