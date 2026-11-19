// hud.js — everything on top of the 3D view: cash, rank, wanted stars,
// health and armour, speed, radio, the mission panel, the minimap, banners
// and the menus.

import { rankName } from './save.js';
import { cashText, clamp, clockText } from './utils.js';

export class Hud {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.cashEl = $('cash');
    this.rankEl = $('rank');
    this.starsEl = $('stars');
    this.speedEl = $('speed');
    this.radioEl = $('radio');
    this.radioNameEl = $('radioName');
    this.missionTitleEl = $('missionTitle');
    this.missionTextEl = $('missionText');
    this.missionTimerEl = $('missionTimer');
    this.promptEl = $('prompt');
    this.holdWrapEl = $('holdWrap');
    this.holdBarEl = $('holdBar');
    this.bannerEl = $('banner');
    this.bannerTitleEl = $('bannerTitle');
    this.bannerSubEl = $('bannerSub');
    this.toastEl = $('toast');
    this.menuEl = $('menu');
    this.pauseEl = $('pauseMenu');
    this.bustedEl = $('busted');
    this.bustedTextEl = $('bustedText');
    this.healthEl = $('healthFill');
    this.armorEl = $('armorFill');
    this.crossEl = $('crosshair');
    this.mapEl = $('minimap');
    this.mapCtx = this.mapEl.getContext('2d');
    this.bannerTimer = null;
    this.toastTimer = null;
  }

  refresh() {
    const g = this.game;
    this.cashEl.textContent = cashText(g.cash);
    this.rankEl.textContent = rankName(g.totalEarned);
    const stars = g.police.level;
    this.starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    this.starsEl.classList.toggle('hot', stars >= 3);
    const speed = g.inCar && g.playerCar ? Math.abs(g.playerCar.speed) : g.player.speed;
    this.speedEl.innerHTML = `${Math.round(speed * 2.2)}<small> mph</small>`;
    this.radioNameEl.textContent = g.audio.stationName;
    this.radioEl.style.display = 'block';
    this.healthEl.style.width = `${clamp(g.player.health, 0, 100)}%`;
    this.armorEl.style.width = `${clamp(g.player.armor, 0, 100)}%`;
    this.crossEl.style.display = g.player.armed && g.state === 'playing' ? 'block' : 'none';
    const a = g.missions.active;
    this.missionTimerEl.textContent = a && a.timer > 0 ? clockText(a.timer) : '';
    this.drawMap();
  }

  setJob(title, text) {
    this.missionTitleEl.textContent = title;
    this.missionTextEl.textContent = text;
  }

  setHint(text) {
    if (this.promptEl.textContent !== text) this.promptEl.textContent = text;
  }

  setHold(frac) {
    if (frac > 0) {
      this.holdWrapEl.style.display = 'block';
      this.holdBarEl.style.width = `${clamp(frac, 0, 1) * 100}%`;
    } else {
      this.holdWrapEl.style.display = 'none';
    }
  }

  /** The live top-down map: roads, sea, landmarks, the objective, units. */
  drawMap() {
    const g = this.game;
    const ctx = this.mapCtx;
    const S = 180 / 520;
    const X = (x) => 90 + x * S;
    const Z = (z) => 90 + z * S;
    ctx.clearRect(0, 0, 180, 180);
    ctx.fillStyle = '#10151c';
    ctx.fillRect(0, 0, 180, 180);
    // Sea and sand along the bottom.
    ctx.fillStyle = '#1f6f9e';
    ctx.fillRect(0, Z(258), 180, 180 - Z(258));
    ctx.fillStyle = '#e0c98f';
    ctx.fillRect(0, Z(215), 180, Z(258) - Z(215));
    // Roads.
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = 3;
    for (const r of [-180, -120, -60, 0, 60, 120, 180]) {
      ctx.beginPath();
      ctx.moveTo(X(r), Z(-210));
      ctx.lineTo(X(r), Z(210));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(-210), Z(r));
      ctx.lineTo(X(210), Z(r));
      ctx.stroke();
    }
    // Landmarks.
    const lmColors = { mart: '#ffd23a', bank: '#5ab8ff', warehouse: '#ff9a3a', safehouse: '#3affc8', loft: '#ff4fd8', docks: '#e8e4da', chopShop: '#3affc8', pdhq: '#5ab8ff' };
    for (const [name, lm] of Object.entries(g.city.landmarks)) {
      ctx.fillStyle = lmColors[name] || '#e8e4da';
      ctx.fillRect(X(lm.x) - 2, Z(lm.z) - 2, 4, 4);
    }
    // Objective: a pulsing ring.
    const t = g.missions.target();
    if (t) {
      const pulse = 5 + Math.sin(g.time * 4) * 2;
      ctx.strokeStyle = '#ff4fd8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(t.x), Z(t.z), pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Traffic, cops, cruisers, helicopter.
    ctx.fillStyle = '#c8c8c8';
    for (const car of g.traffic.cars) ctx.fillRect(X(car.x) - 1, Z(car.z) - 1, 2, 2);
    ctx.fillStyle = '#5ab8ff';
    for (const cop of g.police.cops) ctx.fillRect(X(cop.x) - 1.5, Z(cop.z) - 1.5, 3, 3);
    for (const car of g.police.cars) ctx.fillRect(X(car.x) - 2, Z(car.z) - 2, 4, 4);
    if (g.police.heli) {
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.arc(X(g.police.heli.x), Z(g.police.heli.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Milo: a white arrow pointing along his heading.
    const px = X(g.player.x);
    const pz = Z(g.player.z);
    const hx = Math.sin(g.player.angle);
    const hz = Math.cos(g.player.angle);
    const bx = -hz;
    const bz = hx;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(px + hx * 8, pz + hz * 8);
    ctx.lineTo(px - hx * 5 + bx * 5, pz - hz * 5 + bz * 5);
    ctx.lineTo(px - hx * 5 - bx * 5, pz - hz * 5 - bz * 5);
    ctx.closePath();
    ctx.fill();
  }

  showBanner(title, sub) {
    this.bannerTitleEl.textContent = title;
    this.bannerSubEl.textContent = sub || '';
    this.bannerEl.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.bannerEl.style.opacity = '0';
    }, 3600);
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, 2400);
  }

  /** A short flash message: the same toast, under the name the jobs use. */
  flash(text) {
    this.toast(text);
  }

  showTitle() {
    this.menuEl.style.display = 'flex';
  }

  hideTitle() {
    this.menuEl.style.display = 'none';
  }

  showPause() {
    this.pauseEl.style.display = 'flex';
  }

  hidePause() {
    this.pauseEl.style.display = 'none';
  }

  showBusted(text) {
    this.bustedTextEl.textContent = text;
    this.bustedEl.style.display = 'flex';
  }

  hideBusted() {
    this.bustedEl.style.display = 'none';
  }
}
