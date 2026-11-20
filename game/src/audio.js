// audio.js — procedural WebAudio for SOLMAR: three radio stations, the engine
// hum, gunshots and UI blips. Everything is synthesised; no audio files.
// All methods are safe when the AudioContext cannot start yet.
const STATIONS = [
  {
    name: 'SOLMAR FM',
    bpm: 112,
    wave: 'square',
    bass: [48, 48, 55, 48, 53, 48, 55, 50],
    lead: [72, 0, 76, 0, 79, 0, 76, 72],
  },
  {
    name: 'NEON NIGHTS',
    bpm: 100,
    wave: 'sawtooth',
    bass: [45, 45, 45, 48, 45, 45, 52, 50],
    lead: [69, 0, 72, 0, 76, 72, 69, 0],
  },
  {
    name: 'PALM 101',
    bpm: 90,
    wave: 'triangle',
    bass: [41, 48, 45, 43, 41, 48, 45, 43],
    lead: [65, 0, 69, 0, 72, 69, 65, 0],
  },
];

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let noiseBuf = null;
  let stationIdx = 0;
  let step = 0;
  let nextStepTime = 0;
  let timer = null;

  function ensure() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        musicGain = ctx.createGain();
        musicGain.gain.value = 0.14;
        musicGain.connect(master);
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 50;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 420;
        engineOsc.connect(filt);
        filt.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
        const len = ctx.sampleRate * 0.25;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        nextStepTime = ctx.currentTime + 0.1;
        timer = setInterval(schedule, 120);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) {
      return false;
    }
  }

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const st = STATIONS[stationIdx];
    const stepDur = 60 / st.bpm;
    while (nextStepTime < ctx.currentTime + 0.3) {
      const i = step % 8;
      const bass = st.bass[i];
      const lead = st.lead[i];
      if (bass) playNote(midiToFreq(bass - 12), nextStepTime, stepDur * 0.9, 'triangle', 0.5);
      if (lead) playNote(midiToFreq(lead), nextStepTime, stepDur * 0.7, st.wave, 0.22);
      nextStepTime += stepDur;
      step += 1;
    }
  }

  function playNote(freq, when, dur, type, vol) {
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      o.connect(g);
      g.connect(musicGain);
      o.start(when);
      o.stop(when + dur + 0.05);
    } catch (e) {
      // A missed note is never worth an error.
    }
  }


  function blip(freq, dur, type, vol) {
    if (!ctx || ctx.state !== 'running') return;
    try {
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    } catch (e) {
      // Silence is fine.
    }
  }

  return {
    get stationName() {
      return STATIONS[stationIdx].name;
    },
    get stationIndex() {
      return stationIdx;
    },
    ensure,
    cycleStation() {
      stationIdx = (stationIdx + 1) % STATIONS.length;
      ensure();
      blip(660, 0.12, 'sine', 0.15);
      return STATIONS[stationIdx].name;
    },
    setStation(i) {
      stationIdx = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
      step = 0;
      ensure();
      return STATIONS[stationIdx].name;
    },
    buy() {
      blip(880, 0.1, 'sine', 0.2);
      setTimeout(() => blip(1174, 0.14, 'sine', 0.18), 90);
    },
    jobDone() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.2), i * 110));
    },
    shoot() {
      if (!ctx || ctx.state !== 'running' || !noiseBuf) return;
      try {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const g = ctx.createGain();
        g.gain.value = 0.5;
        src.connect(g);
        g.connect(master);
        src.start();
      } catch (e) {
        // Silence is fine.
      }
    },
    siren(on) {
      // A two-tone wail is faked by the engine oscillator's pitch; the real
      // siren is a slow LFO on it, kept quiet so it never drowns the radio.
      if (!ctx || !engineOsc) return;
      try {
        engineOsc.frequency.value = on ? 720 : 50;
      } catch (e) {
        // Silence is fine.
      }
    },
    // The engine hum follows the car's speed; silent on foot.
    engine(speed, inCar) {
      if (!ctx || !engineGain || !engineOsc) return;
      try {
        const target = inCar ? 0.05 + Math.min(0.12, Math.abs(speed) / 500) : 0;
        engineGain.gain.value += (target - engineGain.gain.value) * 0.2;
        engineOsc.frequency.value = 45 + Math.abs(speed) * 2.4;
      } catch (e) {
        // Silence is fine.
      }
    },
  };
}
