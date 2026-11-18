// Every sound in Palmshade City is synthesised with WebAudio: no audio files, nothing to
// load. The engine is a pair of detuned oscillators through a lowpass, the siren is a
// wailing triangle, gunfire and crashes are shaped noise bursts, and the music is a slow
// warm chord pad (Cmaj7 - Am7 - Fmaj7 - Gadd9) scheduled a step ahead of the clock.
// Audio only starts after a user gesture (browser rule); screenshot scenes stay muted.

const CHORDS = [
  { bass: 65.41, notes: [261.63, 329.63, 392.0, 493.88] }, // Cmaj7
  { bass: 55.0, notes: [220.0, 261.63, 329.63, 392.0] }, //   Am7
  { bass: 43.65, notes: [174.61, 220.0, 261.63, 329.63] }, // Fmaj7
  { bass: 49.0, notes: [196.0, 246.94, 293.66, 440.0] }, //   Gadd9
];
const CHORD_SECONDS = 3.8;

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  let engineNodes = null; // { oscA, oscB, gain, filter }
  let sirenNodes = null; //  { osc, lfo, gain }
  let musicOn = false;
  let chordIndex = 0;
  let nextChordAt = 0;

  /** Create the context and the always-on voices. Call from a click/keypress handler. */
  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    // Engine voice: saw + square an octave down, through a lowpass that opens with speed.
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 55;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 28;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    oscA.start();
    oscB.start();
    engineNodes = { oscA, oscB, gain, filter };

    // Siren voice: a triangle whose pitch a slow LFO sweeps up and down.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 750;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const sGain = ctx.createGain();
    sGain.gain.value = 0;
    osc.connect(sGain);
    sGain.connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, gain: sGain };
  }

  function setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  }

  /** Engine voice: ratio is speed / top speed (0..1); on=false parks the car in silence. */
  function setEngine(on, ratio) {
    if (!ctx || !engineNodes) return;
    const t = ctx.currentTime;
    const target = on && !muted ? 0.055 : 0;
    engineNodes.gain.gain.setTargetAtTime(target, t, 0.09);
    if (on) {
      const f = 52 + ratio * 185;
      engineNodes.oscA.frequency.setTargetAtTime(f, t, 0.06);
      engineNodes.oscB.frequency.setTargetAtTime(f * 0.5, t, 0.06);
      engineNodes.filter.frequency.setTargetAtTime(280 + ratio * 1400, t, 0.1);
    }
  }

  /** Siren loudness from the nearest police car (0 = none or far away). */
  function setSiren(level) {
    if (!ctx || !sirenNodes) return;
    sirenNodes.gain.gain.setTargetAtTime(muted ? 0 : level * 0.045, ctx.currentTime, 0.15);
  }

  function noiseBurst({ seconds = 0.2, from = 3000, to = 300, gain = 0.4, type = 'lowpass' }) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + seconds + 0.02);
  }

  function tone({ freq = 880, freqEnd = null, seconds = 0.12, gain = 0.12, type = 'sine', at = 0 }) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  /** One gunshot: a crack of noise over a low thump. */
  function shoot() {
    noiseBurst({ seconds: 0.14, from: 4200, to: 500, gain: 0.5, type: 'bandpass' });
    tone({ freq: 160, freqEnd: 55, seconds: 0.12, gain: 0.3, type: 'square' });
  }

  /** Crash thud; strength is impact speed in m/s. */
  function crash(strength) {
    const v = Math.min(1, strength / 16);
    if (v <= 0.03) return;
    noiseBurst({ seconds: 0.22 + v * 0.15, from: 900, to: 120, gain: 0.15 + v * 0.45 });
    tone({ freq: 90, freqEnd: 40, seconds: 0.2, gain: v * 0.3, type: 'sine' });
  }

  /** Short UI / pickup blip. */
  function blip() {
    tone({ freq: 740, freqEnd: 990, seconds: 0.09, gain: 0.1, type: 'square' });
  }

  /** Money earned: two bright notes. */
  function cash() {
    tone({ freq: 987.77, seconds: 0.1, gain: 0.11 });
    tone({ freq: 1318.51, seconds: 0.16, gain: 0.11, at: 0.07 });
  }

  /** Sad little descending sting for busted / wasted. */
  function sting() {
    tone({ freq: 392, seconds: 0.22, gain: 0.12, type: 'triangle' });
    tone({ freq: 329.63, seconds: 0.22, gain: 0.12, type: 'triangle', at: 0.18 });
    tone({ freq: 261.63, seconds: 0.4, gain: 0.12, type: 'triangle', at: 0.36 });
  }

  function scheduleChord(when, chord) {
    for (const freq of chord.notes) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.028, when + 0.9);
      g.gain.setValueAtTime(0.028, when + CHORD_SECONDS - 0.9);
      g.gain.linearRampToValueAtTime(0, when + CHORD_SECONDS + 0.4);
      osc.connect(g);
      g.connect(master);
      osc.start(when);
      osc.stop(when + CHORD_SECONDS + 0.5);
    }
    const bass = ctx.createOscillator();
    bass.type = 'sine';
    bass.frequency.value = chord.bass * 2;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, when);
    bg.gain.linearRampToValueAtTime(0.05, when + 0.5);
    bg.gain.linearRampToValueAtTime(0, when + CHORD_SECONDS);
    bass.connect(bg);
    bg.connect(master);
    bass.start(when);
    bass.stop(when + CHORD_SECONDS + 0.1);
  }

  function setMusic(on) {
    musicOn = on;
    if (on && ctx) {
      nextChordAt = ctx.currentTime + 0.1;
      chordIndex = 0;
    }
  }

  /** Per-frame: keep the music scheduler a chord ahead of the clock. */
  function update() {
    if (!ctx || !musicOn || muted) return;
    while (nextChordAt < ctx.currentTime + CHORD_SECONDS * 1.2) {
      scheduleChord(Math.max(nextChordAt, ctx.currentTime + 0.02), CHORDS[chordIndex % CHORDS.length]);
      chordIndex += 1;
      nextChordAt += CHORD_SECONDS;
    }
  }

  return {
    unlock,
    setMuted,
    isMuted: () => muted,
    setEngine,
    setSiren,
    shoot,
    crash,
    blip,
    cash,
    sting,
    setMusic,
    update,
  };
}
