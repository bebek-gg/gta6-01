// hud.js — the heads-up display: cash, stars, health, armour, the mission
// card, the radio, the minimap, the menu, the shop panel and the toasts.
// All of it is DOM over the canvas; the game only ever calls these methods.
import { formatCash, starsText, fmtTime } from './utils.js';

const RANKS = [
  { at: 0, name: 'Street Punk' },
  { at: 1500, name: 'Hustler' },
  { at: 4000, name: 'Wheelman' },
  { at: 8000, name: 'Kingpin' },
  { at: 14000, name: 'Don of Solmar' },
];

export function rankFor(earned) {
  let r = RANKS[0].name;
  for (const row of RANKS) if (earned >= row.at) r = row.name;
  return r;
}

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const el = {
    cash: $('cash'),
    stars: $('stars'),
    health: $('healthFill'),
    armor: $('armorFill'),
    mission: $('missionTitle'),
    objective: $('missionObj'),
    timer: $('missionTimer'),
    speed: $('speed'),
    station: $('station'),
    rank: $('rank'),
    toast: $('notify'),
    map: $('minimap'),
    menu: $('menu'),
    shop: $('shop'),
    busted: $('busted'),
    wasted: $('wasted'),
  };
  const mapCtx = el.map ? el.map.getContext('2d') : null;
  let toastT = 0;

  function notify(text) {
    if (!el.toast) return;
    el.toast.textContent = text;
    el.toast.style.opacity = '1';
    toastT = 3.2;
  }

  function showShop(open) {
    if (el.shop) el.shop.style.display = open ? 'block' : 'none';
  }

  function showMenu(show) {
    if (el.menu) el.menu.style.display = show ? 'flex' : 'none';
  }

  function showBusted(show, bail) {
    if (!el.busted) return;
    el.busted.style.display = show ? 'flex' : 'none';
    if (show && bail != null) {
      const t = el.busted.querySelector('div');
      if (t) t.textContent = 'BUSTED — bail $' + bail;
    }
  }

  function showWasted(show) {
    if (el.wasted) el.wasted.style.display = show ? 'flex' : 'none';
  }

  // Wire the shop buttons to the shop system. The button order in the panel
  // is repair, armour, ammo, Comet GT.
  const shopBtns = document.querySelectorAll('.shopbtn');
  shopBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (G.shops) G.shops.buy(btn.dataset.item);
    });
  });

  // Wire the start button. The game itself starts from main.js.
  const startBtn = $('btnStart');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (G.onStart) G.onStart();
    });
  }


  function drawMinimap() {
    if (!mapCtx || !el.map) return;
    const W = el.map.width;
    const H = el.map.height;
    const sx = (x) => ((x + 260) / 520) * W;
    const sz = (z) => ((z + 260) / 520) * H;
    mapCtx.fillStyle = '#20242a';
    mapCtx.fillRect(0, 0, W, H);
    // Ocean and beach on the east edge.
    mapCtx.fillStyle = '#1e6f9e';
    mapCtx.fillRect(sx(235), 0, W - sx(235), H);
    mapCtx.fillStyle = '#e8d8a0';
    mapCtx.fillRect(sx(208), 0, sx(235) - sx(208), H);
    // Roads.
    mapCtx.strokeStyle = '#5a5a60';
    mapCtx.lineWidth = 2;
    for (let v = -240; v <= 240; v += 40) {
      mapCtx.beginPath();
      mapCtx.moveTo(sx(v), 0);
      mapCtx.lineTo(sx(v), H);
      mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(0, sz(v));
      mapCtx.lineTo(W, sz(v));
      mapCtx.stroke();
    }
    // Points of interest.
    const pois = G.city ? G.city.points : null;
    if (pois) {
      mapCtx.fillStyle = '#ffd23e';
      for (const k of ['mart', 'safehouse', 'loft', 'chopshop']) {
        const p = pois[k];
        mapCtx.beginPath();
        mapCtx.arc(sx(p.x), sz(p.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
    }
    // Mission target.
    if (G.missions) {
      const t = G.missions.target();
      if (t) {
        mapCtx.fillStyle = '#ff4a4a';
        mapCtx.beginPath();
        mapCtx.arc(sx(t.x), sz(t.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.strokeStyle = '#ff4a4a';
        mapCtx.beginPath();
        mapCtx.arc(sx(t.x), sz(t.z), 7, 0, Math.PI * 2);
        mapCtx.stroke();
      }
    }
    // Police.
    if (G.police) {
      mapCtx.fillStyle = '#4a8aff';
      for (const c of G.police.cops) {
        mapCtx.fillRect(sx(c.x) - 2, sz(c.z) - 2, 4, 4);
      }
      for (const c of G.police.cars) {
        mapCtx.fillRect(sx(c.x) - 2, sz(c.z) - 2, 4, 4);
      }
    }
    // The player, always on top.
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.arc(sx(G.world.playerX), sz(G.world.playerZ), 4, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.strokeStyle = '#000000';
    mapCtx.beginPath();
    mapCtx.arc(sx(G.world.playerX), sz(G.world.playerZ), 4, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  function update(dt) {
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0 && el.toast) el.toast.style.opacity = '0';
    }
    if (el.cash) el.cash.textContent = formatCash(G.world.cash);
    if (el.stars) el.stars.textContent = starsText(G.police ? G.police.stars : 0);
    if (el.health) el.health.style.width = Math.max(0, G.player.health) + '%';
    if (el.armor) el.armor.style.width = Math.max(0, G.world.armor) + '%';
    if (el.station && G.audio) el.station.textContent = '♪ ' + G.audio.stationName;
    if (el.rank) el.rank.textContent = rankFor(G.totalEarned || 0);
    if (el.speed) {
      el.speed.textContent = G.world.inCar
        ? Math.round(Math.abs(G.world.playerSpeed) * 2.2) + ' mph'
        : '';
    }
    if (G.missions && G.missions.active) {
      const m = G.missions.active;
      if (el.mission) el.mission.textContent = m.title;
      if (el.objective) {
        const t = G.missions.target();
        el.objective.textContent = t
          ? 'Objective ' + Math.round(Math.hypot(t.x - G.world.playerX, t.z - G.world.playerZ)) + 'm away'
          : m.def.desc;
      }
      if (el.timer) el.timer.textContent = m.timer > 0 ? fmtTime(m.timer) : '';
    } else if (el.mission) {
      el.mission.textContent = G.missions && G.missions.storyDone
        ? 'Story complete — free roam'
        : 'No job. Visit Cleo or take the next job.';
      if (el.objective) el.objective.textContent = '';
      if (el.timer) el.timer.textContent = '';
    }
    drawMinimap();
  }

  return { notify, showShop, showMenu, showBusted, showWasted, update, rankFor };
}
