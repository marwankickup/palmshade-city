// audio.js — all sound is synthesised with WebAudio: engine hum, police
// siren, gunshots, crashes, reward chimes and a warm little synth loop.
// No audio files, nothing loads over the network.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this.musicTimer = null;
    this.chordIdx = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startSiren();
    } catch { /* no audio available */ }
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  // --- continuous engine hum
  startEngine() {
    const c = this.ctx;
    this.engOsc = c.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc.frequency.value = 55;
    this.engFilter = c.createBiquadFilter();
    this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 320;
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter).connect(this.engGain).connect(this.master);
    this.engOsc.start();
  }
  engine(on, speedNorm) {
    if (!this.ctx || !this.engGain) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speedNorm * 0.05 : 0;
    this.engGain.gain.setTargetAtTime(target, t, 0.12);
    this.engOsc.frequency.setTargetAtTime(50 + speedNorm * 130, t, 0.1);
  }
  // --- police siren (two-tone sweep)
  startSiren() {
    const c = this.ctx;
    this.sirOsc = c.createOscillator();
    this.sirOsc.type = 'triangle';
    this.sirGain = c.createGain(); this.sirGain.gain.value = 0;
    this.sirOsc.connect(this.sirGain).connect(this.master);
    this.sirOsc.start();
    this.sirLFO = c.createOscillator();
    this.sirLFO.frequency.value = 0.55;
    const lfoGain = c.createGain(); lfoGain.gain.value = 160;
    this.sirLFO.connect(lfoGain).connect(this.sirOsc.frequency);
    this.sirOsc.frequency.value = 780;
    this.sirLFO.start();
  }
  siren(on, level = 1) {
    if (!this.ctx || !this.sirGain) return;
    this.sirGain.gain.setTargetAtTime(on ? 0.028 * level : 0, this.ctx.currentTime, 0.25);
  }
  // --- one-shots
  blip(freq = 880, dur = 0.09, vol = 0.12, type = 'square') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  cash() { this.blip(740, 0.1, 0.12); setTimeout(() => this.blip(1180, 0.16, 0.12), 70); }
  pickup() { this.blip(520, 0.08, 0.1); setTimeout(() => this.blip(780, 0.1, 0.1), 55); }
  shot() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const len = c.sampleRate * 0.14;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0.32;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }
  crash(intensity = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const len = c.sampleRate * 0.22;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.5;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = c.createGain(); g.gain.value = Math.min(0.4, 0.16 * intensity);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    this.blip(90, 0.18, 0.16, 'sine');
  }
  denied() { this.blip(160, 0.14, 0.1, 'sawtooth'); }
  // --- warm synth loop: slow chord pads (Am – F – C – G in A minor warmth)
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
    const playChord = () => {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const chord = chords[this.chordIdx % chords.length];
      this.chordIdx++;
      for (const f of chord) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.028, t + 0.7);
        g.gain.linearRampToValueAtTime(0, t + 3.8);
        o.connect(g).connect(this.master);
        o.start(t); o.stop(t + 4);
      }
      // soft bass note
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = chord[0] / 2;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 3.8);
    };
    playChord();
    this.musicTimer = setInterval(playChord, 3900);
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
}
