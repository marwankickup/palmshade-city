// All-synthesized WebAudio: engine, siren, gunshots, crashes, chimes and a warm
// chord-pad music loop. No audio files, no network. Starts after a user gesture;
// shot-staging mode stays muted.
export class AudioEngine {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
    this.started = false;
  }

  start() {
    if (this.started || this.muted) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.started = true;
      this._music();
      this._engineNodes();
      this._sirenNodes();
    } catch {
      this.ctx = null;
    }
  }

  // ---- continuous engine hum, frequency follows speed ----
  _engineNodes() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }
  setEngine(on, speedRatio) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speedRatio * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speedRatio * 165, t, 0.08);
  }

  // ---- two-tone police siren ----
  _sirenNodes() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    this._sirenTimer = setInterval(() => {
      if (!this.started || this.sirenLevel <= 0) return;
      const t = this.ctx.currentTime;
      this.sirenOsc.frequency.setValueAtTime(this._sirenHigh ? 950 : 680, t);
      this._sirenHigh = !this._sirenHigh;
    }, 380);
    this.sirenLevel = 0;
    this._sirenHigh = false;
  }
  setSiren(level) {
    this.sirenLevel = level;
    if (!this.started) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.035, this.ctx.currentTime, 0.2);
  }

  // ---- warm chord-pad loop: Cmaj7 - Am7 - Fmaj7 - G6 ----
  _music() {
    const chords = [
      [130.81, 196.0, 246.94, 329.63],
      [110.0, 164.81, 261.63, 329.63],
      [87.31, 174.61, 220.0, 329.63],
      [98.0, 196.0, 293.66, 392.0],
    ];
    let step = 0;
    const playChord = () => {
      if (!this.started) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const pad = ctx.createGain();
      pad.gain.setValueAtTime(0, t);
      pad.gain.linearRampToValueAtTime(0.045, t + 1.4);
      pad.gain.setValueAtTime(0.045, t + 4.6);
      pad.gain.linearRampToValueAtTime(0, t + 6.2);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      pad.connect(filter).connect(this.master);
      for (const f of chords[step % chords.length]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 7;
        o.connect(pad);
        o.start(t);
        o.stop(t + 6.4);
      }
      step++;
      this._musicTimer = setTimeout(playChord, 6000);
    };
    playChord();
  }

  _noiseBurst(dur, filterFreq, gainVal, type = 'lowpass') {
    if (!this.started) return;
    const ctx = this.ctx;
    const len = Math.max(1, (ctx.sampleRate * dur) | 0);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  _tone(freq, dur, gainVal, type = 'sine', when = 0, slideTo = null) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  shot() { this._noiseBurst(0.14, 2600, 0.5, 'highpass'); this._tone(150, 0.1, 0.3, 'square', 0, 60); }
  crash(hard = 1) { this._noiseBurst(0.28, 500, 0.4 * hard); this._tone(70, 0.25, 0.3 * hard, 'sine', 0, 40); }
  pickup() { this._tone(880, 0.12, 0.22); this._tone(1318, 0.2, 0.22, 'sine', 0.09); }
  reward() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 0.2, 'triangle', i * 0.1)); }
  step() { this._noiseBurst(0.05, 700, 0.05); }
  bustedSting() { this._tone(392, 0.3, 0.25, 'triangle'); this._tone(311, 0.5, 0.25, 'triangle', 0.22); }
  wastedSting() { this._tone(220, 0.8, 0.25, 'sawtooth', 0, 110); }
  door() { this._noiseBurst(0.08, 900, 0.15); }
}
