// audio.js — every sound is synthesized with WebAudio: engine, siren, gunshots,
// crashes, chimes and a warm chord-pad music loop. No audio files, no network.

export class AudioSys {
  constructor() {
    this.started = false;
    this.muted = false;
    this.ctx = null;
    this.chordTimer = 0;
    this.chordIdx = 0;
  }

  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(c.destination);

    // Engine: sawtooth through a lowpass, pitch follows speed.
    this.engOsc = c.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 55;
    this.engOsc2 = c.createOscillator(); this.engOsc2.type = 'square'; this.engOsc2.frequency.value = 28;
    this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 320;
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter); this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.engOsc.start(); this.engOsc2.start();

    // Siren: triangle whose pitch is swept by an LFO.
    this.sirOsc = c.createOscillator(); this.sirOsc.type = 'triangle'; this.sirOsc.frequency.value = 950;
    this.sirLfo = c.createOscillator(); this.sirLfo.frequency.value = 0.55;
    this.sirLfoGain = c.createGain(); this.sirLfoGain.gain.value = 320;
    this.sirLfo.connect(this.sirLfoGain); this.sirLfoGain.connect(this.sirOsc.frequency);
    this.sirGain = c.createGain(); this.sirGain.gain.value = 0;
    this.sirOsc.connect(this.sirGain); this.sirGain.connect(this.master);
    this.sirOsc.start(); this.sirLfo.start();

    // Music bus with a gentle lowpass for the pad loop.
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.16;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    this.musicBus.connect(lp); lp.connect(this.master);
    this.started = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  setEngine(ratio, driving) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const f = 55 + Math.abs(ratio) * 165;
    this.engOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(280 + Math.abs(ratio) * 900, t, 0.08);
    this.engGain.gain.setTargetAtTime(driving ? 0.055 + Math.abs(ratio) * 0.05 : 0, t, 0.09);
  }

  setSiren(on, dist) {
    if (!this.started) return;
    const v = on ? Math.max(0.008, 0.05 - dist * 0.0006) : 0;
    this.sirGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
  }

  noiseBurst(dur, freq, gain, type = 'lowpass') {
    if (!this.started) return;
    const c = this.ctx, t = c.currentTime;
    const len = Math.max(1, (dur * c.sampleRate) | 0);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }

  shot() { this.noiseBurst(0.16, 2600, 0.5, 'highpass'); this.noiseBurst(0.1, 500, 0.4); }
  crash(v = 1) { this.noiseBurst(0.28, 300, 0.35 * v); }
  click() { this.blip(660, 0.07, 0.12, 'sine'); }

  blip(freq, dur, gain, type = 'sine', when = 0) {
    if (!this.started) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  pickup() { this.blip(880, 0.12, 0.18); this.blip(1318, 0.2, 0.18, 'sine', 0.07); }
  reward() { [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.24, 0.16, 'triangle', i * 0.09)); }
  bustedJingle() { [392, 330, 262].forEach((f, i) => this.blip(f, 0.3, 0.16, 'triangle', i * 0.14)); }

  playChord(freqs) {
    if (!this.started) return;
    const c = this.ctx, t = c.currentTime;
    for (const f of freqs) {
      for (const det of [0, 4]) {
        const o = c.createOscillator(); o.type = 'triangle';
        o.frequency.value = f; o.detune.value = det;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 1.1);
        g.gain.setValueAtTime(0.05, t + 3.1);
        g.gain.linearRampToValueAtTime(0, t + 4.4);
        o.connect(g); g.connect(this.musicBus);
        o.start(t); o.stop(t + 4.5);
      }
    }
  }

  update(dt) {
    if (!this.started || this.muted) return;
    this.chordTimer -= dt;
    if (this.chordTimer <= 0) {
      // Warm sunset progression: Am(add9) — F — C — G.
      const chords = [
        [110.0, 164.8, 220.0, 246.9],
        [87.3, 174.6, 220.0, 261.6],
        [130.8, 196.0, 261.6, 329.6],
        [98.0, 196.0, 246.9, 293.7],
      ];
      this.playChord(chords[this.chordIdx % chords.length]);
      this.chordIdx++;
      this.chordTimer = 4.2;
    }
  }
}
