// audio.js — every sound is synthesized with WebAudio: engine, siren, gunshots,
// crashes, chimes and a warm chord-pad music loop. No audio files, no network.
export function createAudio() {
  let ctx = null, master = null, muted = false;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenLfo = null;
  let musicTimer = null, chordIdx = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // engine: sawtooth through a lowpass, gain/freq driven per frame
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 320;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();

    // siren: sine with an LFO sweeping its frequency
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 800;
    sirenLfo = ctx.createOscillator(); sirenLfo.type = 'sine'; sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 260;
    sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start(); sirenLfo.start();

    startMusic();
  }

  function noiseBuffer(dur) {
    const buf = ctx.createBuffer(1, Math.max(1, (ctx.sampleRate * dur) | 0), ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    return buf;
  }
  let sharedNoise = null;
  function burst(dur, filterFreq, gainVal, type = 'lowpass') {
    if (!ctx) return;
    if (!sharedNoise) sharedNoise = noiseBuffer(0.6);
    const src = ctx.createBufferSource(); src.buffer = sharedNoise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(); src.stop(t + dur + 0.05);
  }
  function tone(freq, dur, gainVal, type = 'sine', when = 0, slideTo = null) {
    if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gainVal, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // warm pad chords: Am7 — Fmaj7 — Cmaj7 — G6, one every 4.8 s
  const CHORDS = [
    [110.0, 164.81, 261.63, 329.63],
    [87.31, 174.61, 220.0, 329.63],
    [130.81, 196.0, 261.63, 392.0],
    [98.0, 196.0, 246.94, 293.66],
  ];
  function playChord(freqs) {
    if (!ctx) return;
    for (const f of freqs) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.001;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.028, t + 1.4);
      g.gain.linearRampToValueAtTime(0.0001, t + 4.9);
      o.connect(g); o2.connect(g); g.connect(master);
      o.start(t); o2.start(t); o.stop(t + 5); o2.stop(t + 5);
    }
  }
  function startMusic() {
    playChord(CHORDS[0]);
    musicTimer = setInterval(() => {
      chordIdx = (chordIdx + 1) % CHORDS.length;
      playChord(CHORDS[chordIdx]);
    }, 4800);
  }

  return {
    init,
    setMuted(m) { muted = m; if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05); },
    engine(speed01, driving) {
      if (!ctx || !engineGain) return;
      const t = ctx.currentTime;
      const target = driving && !muted ? 0.05 + speed01 * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, t, 0.09);
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 165, t, 0.09);
      engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.09);
    },
    siren(on, prox01) {
      if (!ctx || !sirenGain) return;
      const target = on && !muted ? 0.012 + prox01 * 0.05 : 0;
      sirenGain.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
    },
    shoot() { burst(0.16, 2600, 0.5, 'highpass'); tone(150, 0.1, 0.3, 'square', 0, 60); },
    crash(v = 1) { burst(0.3, 300, 0.5 * v); tone(70, 0.25, 0.35 * v, 'sine', 0, 40); },
    pickup() { tone(880, 0.12, 0.22); tone(1318, 0.2, 0.22, 'sine', 0.09); },
    reward() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 0.2, 'triangle', i * 0.09)); },
    click() { tone(660, 0.06, 0.15, 'triangle'); },
    busted() { tone(392, 0.3, 0.25, 'square'); tone(311, 0.45, 0.25, 'square', 0.22); },
  };
}
