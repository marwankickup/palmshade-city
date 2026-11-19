// audio.js — fully synthesized WebAudio: engine, siren, shots, chimes, pad loop. No assets.
export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.started = false;
    this.engineOsc = null; this.engineGain = null; this.sirenOsc = null; this.sirenGain = null;
    this.padNodes = null; this.sirenPhase = 0;
  }
  init() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // engine: sawtooth through lowpass
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 60;
      this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 400;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter); this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      // siren: square osc, gain gated by update()
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.startPad();
      this.started = true;
    } catch { /* audio unavailable */ }
  }
  startPad() {
    // warm sunset pad: two detuned triangles + slow filter LFO, very quiet
    const c = this.ctx, g = c.createGain(); g.gain.value = 0.035;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 130.81;
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 196.0;
    const o3 = c.createOscillator(); o3.type = 'sine'; o3.frequency.value = 261.63;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 220;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    o1.connect(f); o2.connect(f); o3.connect(f); f.connect(g); g.connect(this.master);
    o1.start(); o2.start(); o3.start(); lfo.start();
    this.padNodes = { g };
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  update(dt, o) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (o.inCar) {
      const f = 55 + o.speedNorm * 165 + Math.sin(t * 30) * o.speedNorm * 4;
      this.engineOsc.frequency.setTargetAtTime(f, t, 0.05);
      this.engineFilter.frequency.setTargetAtTime(300 + o.speedNorm * 900, t, 0.1);
      this.engineGain.gain.setTargetAtTime(0.05 + o.speedNorm * 0.075, t, 0.08);
    } else {
      this.engineGain.gain.setTargetAtTime(0, t, 0.1);
    }
    if (o.siren > 0) {
      this.sirenPhase += dt * 2.4;
      const hi = Math.sin(this.sirenPhase * Math.PI * 2) > 0;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 880 : 660, t, 0.03);
      this.sirenGain.gain.setTargetAtTime(0.028 * o.siren, t, 0.1);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, t, 0.1);
    }
  }
  blip(freq, dur, type, vol, slideTo) {
    if (!this.started || !this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  shot() {
    if (!this.started || !this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.14);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    const g = c.createGain(); g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    this.blip(150, 0.09, 'square', 0.18, 40);
  }
  hit() { this.blip(220, 0.06, 'square', 0.12, 90); }
  pickup() { this.blip(880, 0.1, 'sine', 0.22); setTimeout(() => this.blip(1318, 0.16, 'sine', 0.22), 70); }
  cash() { this.blip(1046, 0.09, 'triangle', 0.25); setTimeout(() => this.blip(1568, 0.18, 'triangle', 0.25), 80); }
  bustedJingle() { this.blip(392, 0.22, 'triangle', 0.25); setTimeout(() => this.blip(311, 0.34, 'triangle', 0.25), 160); }
  crash() { this.blip(90, 0.2, 'sawtooth', 0.2, 35); }
}
