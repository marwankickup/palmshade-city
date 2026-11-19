// audio.js — every sound is synthesized with WebAudio. No audio files, no network.
// Starts lazily after the first user gesture; ?shot= scenes stay muted.

export class AudioEngine {
  constructor(muted) {
    this.muted = !!muted;
    this.ctx = null;
    this.started = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.chordIdx = 0;
  }

  // Call from a click / keydown handler.
  unlock() {
    if (this.muted || this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.started = true;
      this._startEngine();
      this._startSiren();
      this._startMusic();
    } catch (e) { /* no audio — silent play */ }
  }

  _startEngine() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineFilter = lp;
  }

  // speedRatio 0..1, active when the player is driving.
  setEngine(speedRatio, driving) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const f = 55 + speedRatio * 165;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(320 + speedRatio * 900, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speedRatio * 0.05 : 0, t, 0.1);
  }

  _startSiren() {
    const c = this.ctx;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    const lfo = c.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.55;
    const lfoGain = c.createGain(); lfoGain.gain.value = 180;
    lfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(); lfo.start();
  }

  // level 0..1 — how present the sirens are (nearest police unit).
  setSiren(level) {
    if (!this.started) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.035, this.ctx.currentTime, 0.2);
  }

  _noiseBuffer() {
    if (this._nb) return this._nb;
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this._nb = buf;
    return buf;
  }

  _burst(dur, filterFreq, gainVal, type = 'lowpass') {
    if (!this.started) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this._noiseBuffer();
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  shot() { this._burst(0.14, 2600, 0.20, 'highpass'); this._burst(0.08, 500, 0.15); }
  crash(hard) { this._burst(hard ? 0.35 : 0.18, 300, hard ? 0.30 : 0.16); }
  spark() { this._burst(0.06, 4000, 0.06, 'highpass'); }

  _tone(freq, dur, gainVal, type = 'sine', when = 0, slideTo = null) {
    if (!this.started) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gainVal, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  pickup() { this._tone(880, 0.12, 0.12); this._tone(1318, 0.2, 0.12, 'sine', 0.07); }
  reward() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 0.10, 'triangle', i * 0.09)); }
  bustedJingle() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.3, 0.10, 'triangle', i * 0.14)); }
  click() { this._tone(660, 0.05, 0.05, 'square'); }

  // Warm chord-pad loop: Fmaj7 — Am7 — Cmaj7 — G6, slow swells + soft bass.
  _startMusic() {
    const chords = [
      [174.6, 220.0, 261.6, 329.6],
      [220.0, 261.6, 329.6, 392.0],
      [130.8, 196.0, 261.6, 329.6],
      [196.0, 246.9, 293.7, 392.0],
    ];
    const playChord = () => {
      if (!this.started) return;
      const c = this.ctx, t = c.currentTime;
      const chord = chords[this.chordIdx % chords.length];
      this.chordIdx++;
      for (const f of chord) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2.003;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.016, t + 1.6);
        g.gain.linearRampToValueAtTime(0.0001, t + 5.8);
        o.connect(g); o2.connect(g); g.connect(this.master);
        o.start(t); o2.start(t); o.stop(t + 6); o2.stop(t + 6);
      }
      const bass = c.createOscillator(); bass.type = 'sine'; bass.frequency.value = chord[0] / 2;
      const bg = c.createGain();
      bg.gain.setValueAtTime(0, t);
      bg.gain.linearRampToValueAtTime(0.028, t + 0.4);
      bg.gain.linearRampToValueAtTime(0.0001, t + 5.6);
      bass.connect(bg); bg.connect(this.master);
      bass.start(t); bass.stop(t + 5.8);
      this.musicTimer = setTimeout(playChord, 4800);
    };
    playChord();
  }
}
