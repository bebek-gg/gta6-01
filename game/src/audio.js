// audio.js — every sound in SOLMAR is synthesized with WebAudio.
// No audio files: the three radio stations are step sequencers, and the
// engine, sirens, rotor and gunshots are oscillators and filtered noise.

import { clamp } from './utils.js';

/** The three stations: tempo, root note (MIDI), chord walk and lead voice. */
const STATIONS = [
  {
    name: 'SOLMAR FM', bpm: 112, root: 45, wave: 'sawtooth', bright: 0.5,
    chords: [[0, 3, 7, 10], [8, 0, 3, 7], [5, 8, 0, 3], [10, 2, 5, 8]],
    lead: [12, -1, 15, -1, 19, -1, 15, 12, -1, 10, 12, -1, 7, -1, 10, 12],
  },
  {
    name: 'NEON NIGHTS', bpm: 128, root: 41, wave: 'square', bright: 0.9,
    chords: [[0, 3, 7], [10, 2, 5], [8, 0, 3], [5, 8, 0]],
    lead: [12, 12, -1, 15, -1, 19, 19, -1, 17, 15, -1, 12, -1, 10, -1, 7],
  },
  {
    name: 'COASTAL JAZZ', bpm: 92, root: 48, wave: 'triangle', bright: 0.25,
    chords: [[0, 4, 7, 11], [5, 9, 0, 4], [7, 11, 2, 5], [10, 2, 5, 9]],
    lead: [12, -1, 16, 19, -1, 16, -1, 12, -1, 14, 16, -1, 19, -1, 16, 14],
  },
];

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.station = 0;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.noiseBuf = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.rotorTimer = null;
  }

  get stationName() {
    return STATIONS[this.station].name;
  }

  /** Create the context on a user gesture; safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.34;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.nextStepTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.scheduleAhead(), 60);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
    return this.muted;
  }

  setStation(i) {
    this.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
  }

  nextStation() {
    this.setStation(this.station + 1);
  }

  /** Quieten the music while a menu is open. */
  duck(on) {
    if (this.musicBus) this.musicBus.gain.value = on ? 0.1 : 0.34;
  }

  /** Schedule sixteenth-note steps a little ahead of playback. */
  scheduleAhead() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const st = STATIONS[this.station];
    const stepDur = 60 / st.bpm / 4;
    while (this.nextStepTime < this.ctx.currentTime + 0.18) {
      const s = this.step;
      const bar = Math.floor(s / 16) % st.chords.length;
      const chord = st.chords[bar];
      if (s % 4 === 0) this.kick(this.nextStepTime);
      if (s % 8 === 4) this.snare(this.nextStepTime);
      if (s % 2 === 0) this.hat(this.nextStepTime, s % 4 === 2 ? 0.05 : 0.025);
      if (s % 2 === 0) this.bassNote(this.nextStepTime, st.root + chord[s % 4 === 0 ? 0 : 2] - 12, stepDur * 1.8);
      if (s % 4 === 0) this.pad(this.nextStepTime, chord.map((n) => st.root + n), stepDur * 4, st.wave, st.bright);
      const leadNote = st.lead[s % 16];
      if (leadNote >= 0) this.leadNote(this.nextStepTime, st.root + leadNote, stepDur * 0.9, st.wave);
      this.step += 1;
      this.nextStepTime += stepDur;
    }
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  snare(t) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.14);
  }

  hat(t, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.05);
  }

  bassNote(t, midi, dur) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midiToFreq(midi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  pad(t, midis, dur, wave, bright) {
    for (const m of midis) {
      const o = this.ctx.createOscillator();
      o.type = wave;
      o.frequency.value = midiToFreq(m);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 400 + bright * 2400;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3);
      g.gain.setValueAtTime(0.05, t + dur * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  leadNote(t, midi, dur, wave) {
    const o = this.ctx.createOscillator();
    o.type = wave;
    o.frequency.value = midiToFreq(midi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Engine hum: two detuned saws through a lowpass, level follows speed. */
  engine(level, on) {
    if (!this.ctx) return;
    if (!on || level <= 0.01) {
      if (this.engineNodes) {
        const { gain, oscA, oscB } = this.engineNodes;
        gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
        setTimeout(() => {
          try { oscA.stop(); oscB.stop(); } catch { /* already stopped */ }
        }, 400);
        this.engineNodes = null;
      }
      return;
    }
    if (!this.engineNodes) {
      const oscA = this.ctx.createOscillator();
      const oscB = this.ctx.createOscillator();
      oscA.type = 'sawtooth';
      oscB.type = 'square';
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 700;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      oscA.connect(filt);
      oscB.connect(filt);
      filt.connect(gain).connect(this.sfxBus);
      oscA.start();
      oscB.start();
      this.engineNodes = { gain, oscA, oscB };
    }
    const t = this.ctx.currentTime;
    const base = 52 + level * 95;
    this.engineNodes.oscA.frequency.setTargetAtTime(base, t, 0.05);
    this.engineNodes.oscB.frequency.setTargetAtTime(base * 1.5 + 3, t, 0.05);
    this.engineNodes.gain.gain.setTargetAtTime(0.05 + level * 0.09, t, 0.08);
  }

  /** Two-tone police siren. */
  siren(on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenNodes) {
        const { osc, lfo, gain } = this.sirenNodes;
        gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        setTimeout(() => {
          try { osc.stop(); lfo.stop(); } catch { /* already stopped */ }
        }, 400);
        this.sirenNodes = null;
      }
      return;
    }
    if (this.sirenNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 750;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(osc.frequency);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.045;
    osc.connect(gain).connect(this.sfxBus);
    osc.start();
    lfo.start();
    this.sirenNodes = { osc, lfo, gain };
  }

  /** Helicopter rotor: a low thump ten times a second. */
  rotor(on) {
    if (!this.ctx) return;
    if (on && !this.rotorTimer) {
      this.rotorTimer = setInterval(() => this.thump(0.1), 100);
    } else if (!on && this.rotorTimer) {
      clearInterval(this.rotorTimer);
      this.rotorTimer = null;
    }
  }

  thump(vol = 0.14) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(70, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(38, this.ctx.currentTime + 0.07);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);
    o.connect(g).connect(this.sfxBus);
    o.start();
    o.stop(this.ctx.currentTime + 0.1);
  }

  blip(freq = 880) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.16, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);
    o.connect(g).connect(this.sfxBus);
    o.start();
    o.stop(this.ctx.currentTime + 0.1);
  }

  shot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.16);
  }

  thud() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.3, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    o.connect(g).connect(this.sfxBus);
    o.start();
    o.stop(this.ctx.currentTime + 0.14);
  }

  chaChing() {
    if (!this.ctx) return;
    [1320, 1760].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime + i * 0.09;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.24);
    });
  }

  win() {
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime + i * 0.11;
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.32);
    });
  }

  lose() {
    if (!this.ctx) return;
    [392, 330, 262].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime + i * 0.16;
      o.type = 'sawtooth';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.32);
    });
  }

  sirenBlip() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(950, t);
    o.frequency.setValueAtTime(700, t + 0.09);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.22);
  }
}
