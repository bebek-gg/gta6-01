// hud.js — DOM HUD: cash, wanted stars, health, speed, objective, timer,
// prompts, toasts, overlays, and the canvas minimap.
import { fmtCash, fmtTime } from './utils.js';
import { LANDMARKS } from './city.js';

const RANKS = [[0, 'WHEELMAN'], [1500, 'HUSTLER'], [4000, 'MADE'], [10000, 'KINGPIN OF SOLMAR']];

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['cash', 'rank', 'wanted', 'health', 'hpfill', 'speed', 'speedv', 'carname',
      'objective', 'objtag', 'objtext', 'prompt', 'toast', 'timer', 'cross', 'hint',
      'title', 'pause', 'busted', 'bustedText', 'pauseStats', 'btnStart', 'btnContinue',
      'btnResume', 'btnRestart', 'btnSave', 'btnBusted', 'status']) {
      this.el[id] = document.getElementById(id);
    }
    this.mm = document.getElementById('minimap').getContext('2d');
    this.toastTimer = null;
  }
  rankFor(cash) {
    let r = RANKS[0][1];
    for (const [min, name] of RANKS) if (cash >= min) r = name;
    return r;
  }
  setCash(cash) {
    this.el.cash.firstChild.nodeValue = fmtCash(cash);
    this.el.rank.textContent = this.rankFor(cash);
  }
  setWanted(stars) {
    const w = this.el.wanted;
    if (stars <= 0) { w.style.display = 'none'; return; }
    w.style.display = 'block';
    w.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  }
  setHealth(hp) {
    this.el.hpfill.style.width = Math.max(0, hp) + '%';
    this.el.hpfill.style.background = hp > 50 ? 'linear-gradient(90deg,#37e08b,#a5f04a)'
      : hp > 25 ? 'linear-gradient(90deg,#e0a337,#f0d24a)' : 'linear-gradient(90deg,#e03737,#f04a4a)';
  }
  setSpeed(kmh, label) {
    const s = this.el.speed;
    if (label) { s.style.display = 'block'; this.el.speedv.textContent = Math.round(kmh); this.el.carname.textContent = label; }
    else s.style.display = 'none';
  }
  setObjective(tag, text) {
    this.el.objtag.textContent = tag;
    this.el.objtext.textContent = text;
  }
  setTimer(sec) {
    const t = this.el.timer;
    if (sec == null) { t.style.display = 'none'; return; }
    t.style.display = 'block';
    t.textContent = fmtTime(sec);
  }
  prompt(html) {
    const p = this.el.prompt;
    if (!html) { p.style.display = 'none'; return; }
    p.style.display = 'block';
    p.innerHTML = html;
  }
  toast(text, ms) {
    const t = this.el.toast;
    t.textContent = text;
    t.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.style.display = 'none'; }, ms || 4200);
  }
  announce(text) { this.el.status.textContent = text; }
  show(id) { this.el[id].style.display = 'flex'; }
  hide(id) { this.el[id].style.display = 'none'; }
  setBusted(title, text) {
    this.el.busted.querySelector('h1').textContent = title;
    this.el.bustedText.textContent = text;
  }
  setPauseStats(text) { this.el.pauseStats.textContent = text; }
  setCrosshair(on) { this.el.cross.style.display = on ? 'block' : 'none'; }
  // whole-city minimap: roads, beach, player, mission target, police, traffic
  drawMinimap(world) {
    const g = this.mm, S = 210;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#16233a'; g.fillRect(0, 0, S, S);
    const px = (x) => (x + 290) / 530 * S, pz = (z) => (z + 240) / 480 * S;
    g.fillStyle = '#2f7fb8'; g.fillRect(0, 0, px(-272), S); // ocean
    g.fillStyle = '#c2a878'; g.fillRect(px(-272), 0, px(-229) - px(-272), S); // beach
    g.strokeStyle = '#7a8296'; g.lineWidth = 6; // roads
    for (let i = 0; i < 7; i++) {
      const c = -222 + i * 74;
      g.beginPath(); g.moveTo(px(c), 0); g.lineTo(px(c), S); g.stroke();
      g.beginPath(); g.moveTo(0, pz(c)); g.lineTo(S, pz(c)); g.stroke();
    }
    g.fillStyle = '#3f8f5f'; g.fillRect(px(7), pz(7), 60 / 530 * S, 60 / 480 * S); // park
    // landmark pads (garage, bank, safehouse, docks): small gold squares
    g.fillStyle = 'rgba(255,210,62,0.85)';
    for (const k of ['garage', 'bank', 'safehouse', 'docks']) {
      const p = LANDMARKS[k];
      g.fillRect(px(p.x) - 2.5, pz(p.z) - 2.5, 5, 5);
    }
    const dot = (x, z, r, color) => {
      g.fillStyle = color; g.beginPath(); g.arc(px(x), pz(z), r, 0, Math.PI * 2); g.fill();
    };
    const t = world.missions.target();
    if (t) { // mission target: pulsing yellow diamond
      const r = 5 + Math.sin(performance.now() / 300) * 1.5;
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.moveTo(px(t.x), pz(t.z) - r); g.lineTo(px(t.x) + r, pz(t.z));
      g.lineTo(px(t.x), pz(t.z) + r); g.lineTo(px(t.x) - r, pz(t.z)); g.closePath(); g.fill();
    }
    for (const c of world.traffic.cars) dot(c.x, c.z, 2, 'rgba(255,255,255,0.7)');
    for (const c of world.police.cars) dot(c.x, c.z, 3.5, '#5db4ff');
    for (const c of world.police.cops) dot(c.x, c.z, 2.5, '#5db4ff');
    // player arrow
    const x = px(world.playerX), z = pz(world.playerZ);
    g.save();
    g.translate(x, z); g.rotate(-world.playerHeading);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = '#ffd23e'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, z, 8, 0, Math.PI * 2); g.stroke();
  }
}
