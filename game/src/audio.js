// audio.js — all sound is synthesized WebAudio. No samples, no network.
class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
    this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenT = 0;
    this.padTimer = 0; this.padStep = 0;
    this.station = 0;
    // per-station pad character: frequency multiplier + chord period (seconds)
    this.stationDefs = [
      { mult: 1.0, period: 4.0 },
      { mult: Math.pow(2, 2 / 12), period: 3.3 },
      { mult: Math.pow(2, -3 / 12), period: 4.9 },
    ];
  }
  setStation(i) {
    this.station = ((i % 3) + 3) % 3;
    this.padTimer = 99; // restart the pad on the new scale right away
    this._noise(0.18, 3200, 0.06, 'highpass');
    this._tone(990, 0.06, 0.05, 'square');
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // engine: sawtooth through lowpass
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
      this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 400;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      // siren: square osc whose frequency flips in update()
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
    } catch { this.ctx = null; }
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  setEngine(on, speed01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.05 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.1);
  }
  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.018 : 0, this.ctx.currentTime, 0.2);
    this._sirenOn = on;
  }
  _noise(dur, freq, gain, type = 'lowpass') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const len = Math.max(1, (dur * c.sampleRate) | 0);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master); src.start();
  }
  _tone(freq, dur, gain = 0.12, type = 'sine', when = 0, slideTo = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  shot() { this._noise(0.14, 2600, 0.5, 'highpass'); this._tone(150, 0.1, 0.25, 'square', 0, 40); }
  dryFire() { this._tone(900, 0.03, 0.05, 'square'); }
  crash(i = 1) { this._noise(0.35, 500, 0.4 * i); this._tone(70, 0.3, 0.3 * i, 'sine', 0, 35); }
  chime() { this._tone(880, 0.12, 0.12); this._tone(1318, 0.2, 0.12, 'sine', 0.07); }
  hurt() { this._tone(220, 0.15, 0.15, 'sawtooth', 0, 110); }
  jingle() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 0.11, 'triangle', i * 0.09)); }
  busted() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.3, 0.12, 'triangle', i * 0.16)); }
  uiClick() { this._tone(660, 0.05, 0.06, 'square'); }
  update(dt) {
    if (!this.ctx) return;
    if (this._sirenOn) {
      this.sirenT += dt;
      const f = (this.sirenT % 0.9) < 0.45 ? 660 : 880;
      this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.03);
    }
    // warm pad loop: Am7 – Fmaj7 – Cmaj7 – G6; the radio station retunes it
    const def = this.stationDefs[this.station];
    this.padTimer += dt;
    if (this.padTimer > def.period) {
      this.padTimer = 0;
      const chords = [[220, 261.6, 329.6, 493.9], [174.6, 220, 261.6, 329.6], [130.8, 196, 261.6, 329.6], [196, 246.9, 293.7, 392]];
      const ch = chords[this.padStep++ % 4];
      for (const f of ch) this._tone(f * def.mult, def.period * 0.95, 0.016, 'triangle');
    }
  }
}
export const audio = new AudioSys();
