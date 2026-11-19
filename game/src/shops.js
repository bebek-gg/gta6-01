// shops.js — Marina Mart and the two safehouses: what Milo can buy,
// where he can rest, and the Coral Loft he can own.

import { Vehicle } from './vehicles.js';
import { cashText } from './utils.js';

const ITEMS = [
  {
    id: 'repair', label: 'Repair Car', price: 200,
    desc: 'Patch the car up to full health — or patch Milo up, on foot.',
    usable(g) {
      return (g.inCar && g.playerCar.health < 100) || (!g.inCar && g.player.health < 100);
    },
    apply(g) {
      if (g.inCar) g.playerCar.health = 100;
      else g.player.health = 100;
    },
  },
  {
    id: 'armor', label: 'Body Armor', price: 300,
    desc: '+50 armour, up to 100. Armour soaks 60% of every hit.',
    usable() { return true; },
    apply(g) {
      g.player.armor = Math.min(100, g.player.armor + 50);
    },
  },
  {
    id: 'ammo', label: 'Pistol Ammo', price: 120,
    desc: '+12 rounds and the pistol itself, if Milo is not carrying it yet.',
    usable() { return true; },
    apply(g) {
      g.player.ammo += 12;
      g.player.armed = true;
    },
  },
  {
    id: 'comet', label: 'Comet GT', price: 1500,
    desc: 'The fastest car in Solmar, parked outside the mart. Yours to keep.',
    usable(g) { return !g.ownedComet; },
    apply(g) {
      g.ownedComet = true;
      const car = new Vehicle('comet', g.scene);
      const door = g.city.doorstep('mart');
      car.x = door.x;
      car.z = door.z - 10;
      car.angle = Math.PI / 2;
      car.sync();
      g.traffic.park(car);
    },
  },
];

export class Store {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('shop');
    this.listEl = document.getElementById('shopItems');
    this.cashEl = document.getElementById('shopCash');
  }

  atMart() {
    const p = this.game.city.doorstep('mart');
    return Math.hypot(this.game.player.x - p.x, this.game.player.z - p.z) < 10;
  }

  atHome() {
    const p = this.game.city.doorstep('safehouse');
    if (Math.hypot(this.game.player.x - p.x, this.game.player.z - p.z) < 9) return 'safehouse';
    const loft = this.game.city.doorstep('loft');
    if (this.game.ownedLoft && Math.hypot(this.game.player.x - loft.x, this.game.player.z - loft.z) < 9) return 'loft';
    return null;
  }

  atLoft() {
    const p = this.game.city.doorstep('loft');
    return Math.hypot(this.game.player.x - p.x, this.game.player.z - p.z) < 9;
  }

  open() {
    const g = this.game;
    g.state = 'shop';
    g.shopOpen = true;
    this.listEl.innerHTML = '';
    for (const item of ITEMS) {
      const btn = document.createElement('button');
      btn.className = 'shopbtn';
      const ok = item.usable(g);
      btn.disabled = !ok || g.cash < item.price;
      btn.innerHTML = `<span>${item.label}</span><span class="shopprice">${cashText(item.price)}</span><small>${item.desc}</small>`;
      btn.addEventListener('click', () => {
        if (g.cash < item.price || !item.usable(g)) return;
        g.cash -= item.price;
        item.apply(g);
        g.audio.chaChing();
        g.hud.toast(`Bought ${item.label} for ${cashText(item.price)}`);
        this.open();
      });
      this.listEl.appendChild(btn);
    }
    this.cashEl.textContent = `Cash: ${cashText(g.cash)}`;
    this.panel.style.display = 'block';
    g.audio.duck(true);
  }

  close() {
    const g = this.game;
    g.state = 'playing';
    g.shopOpen = false;
    this.panel.style.display = 'none';
    g.audio.duck(false);
  }

  /** Sleep it off: full health, heat gone, two hours pass. */
  rest() {
    const g = this.game;
    const home = this.atHome();
    if (!home) return;
    g.player.health = 100;
    g.police.reset();
    g.city.setHour(g.city.hour + 2);
    g.audio.blip(520);
    g.hud.toast(home === 'loft' ? 'Rested at the Coral Loft — clean slate' : 'Rested at the safehouse — clean slate');
    g.saveProgress();
  }

  /** Buy the Coral Loft as a second safehouse. */
  buyLoft() {
    const g = this.game;
    if (g.ownedLoft || g.cash < 2500) return;
    g.cash -= 2500;
    g.ownedLoft = true;
    g.audio.chaChing();
    g.hud.showBanner('Coral Loft', 'A second safehouse, high above the Neon Strip.');
    g.saveProgress();
  }
}
