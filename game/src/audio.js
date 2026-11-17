// audio.js — fully procedural WebAudio: no samples, no network. Engine hum,
// sirens, gunshots, punches, pickups, UI jingles and a laid-back bass loop.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.muted = false; this.musicTimer = 0; this.step = 0;
    this.engineOsc = null; this.engineGain = null; this.sirenNodes = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startMusic();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, cutoff) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 1200;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  gunshot() { this.noise(0.14, 0.5, 900); this.blip(160, 0.1, 'square', 0.25, 60); }
  punch() { this.noise(0.08, 0.35, 500); this.blip(90, 0.09, 'sine', 0.3, 50); }
  pickup() { this.blip(660, 0.09, 'sine', 0.22); setTimeout(() => this.blip(990, 0.12, 'sine', 0.22), 70); }
  denied() { this.blip(180, 0.16, 'sawtooth', 0.2, 120); }
  jingle() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.25), i * 95)); }
  sirenStart() {
    if (!this.ctx || this.sirenNodes || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 700;
    lfo.type = 'square'; lfo.frequency.value = 0.9; lg.gain.value = 220;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0.045; o.connect(g); g.connect(this.master);
    o.start(); lfo.start();
    this.sirenNodes = { o, lfo, g };
  }
  sirenStop() {
    if (!this.sirenNodes) return;
    try { this.sirenNodes.o.stop(); this.sirenNodes.lfo.stop(); } catch (e) { /* already stopped */ }
    this.sirenNodes = null;
  }
  engineStart() {
    if (!this.ctx || this.engineOsc) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 55;
    f.type = 'lowpass'; f.frequency.value = 420;
    g.gain.value = 0.0;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start();
    this.engineOsc = o; this.engineGain = g;
  }
  engineSet(speed01, on) {
    if (!this.engineOsc || !this.engineGain) return;
    const t = this.now();
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(48 + speed01 * 130, t, 0.06);
  }
  engineStop() {
    if (!this.engineOsc) return;
    try { this.engineOsc.stop(); } catch (e) { /* already stopped */ }
    this.engineOsc = null; this.engineGain = null;
  }
  // a slow, warm bassline + hats loop, scheduled a bar at a time
  startMusic() {
    if (!this.ctx) return;
    const bar = () => {
      if (!this.ctx) return;
      const root = [55, 55, 65.41, 49][this.step % 4];
      const t0 = this.now() + 0.05;
      for (let i = 0; i < 8; i++) {
        const t = t0 + i * 0.22;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = (i % 4 === 0) ? root : (i % 2 === 0 ? root * 1.5 : root);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.22);
        if (i % 2 === 1) {
          const n = this.ctx.createBufferSource();
          const len = Math.floor(this.ctx.sampleRate * 0.03);
          const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / len);
          n.buffer = buf;
          const hf = this.ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 6000;
          const hg = this.ctx.createGain(); hg.gain.value = 0.05;
          n.connect(hf); hf.connect(hg); hg.connect(this.master);
          n.start(t);
        }
      }
      this.step++;
      this.musicTimer = setTimeout(bar, 1760);
    };
    bar();
  }
}
