// shops.js — the three Old Marina shops: hold E to browse, spend cash on
// repairs, body armor, pistol ammo and a Comet GT of your own. A shop only
// opens while no story job is running, so it never fights the Shakedown.
import { LANDMARKS } from './city.js';
import { dist2, fmtCash } from './utils.js';
import { makeCar, placeCar } from './vehicles.js';

export const SHOP_ITEMS = [
  { id: 'repair', name: 'Full Repair', desc: 'Your car, good as new', price: 200 },
  { id: 'armor', name: 'Body Armor', desc: 'Heal to full + 50 armor', price: 300 },
  { id: 'ammo', name: 'Pistol Ammo ×60', desc: 'Sixty rounds for the pistol', price: 120 },
  { id: 'comet', name: 'Comet GT', desc: 'Your own sports car, parked outside', price: 1500 },
];

export class Shops {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
  }
  // the nearest shop within reach, or null
  nearest(x, z) {
    let best = null, bd = 9;
    for (const s of LANDMARKS.shops) {
      const d = dist2(x, z, s.x, s.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  buy(itemId) {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    const w = this.world;
    if (!item) return false;
    if (w.cash < item.price) {
      w.audio.denied();
      w.hud.toast('Not enough cash — ' + item.name + ' costs ' + fmtCash(item.price) + '.');
      return false;
    }
    if (itemId === 'repair' && !w.playerCar) {
      w.audio.denied();
      w.hud.toast('No car to repair — bring a ride first.');
      return false;
    }
    if (itemId === 'comet' && w.inCar) {
      w.audio.denied();
      w.hud.toast('Get out of your car first — the Comet parks outside.');
      return false;
    }
    w.cash -= item.price;
    w.hud.setCash(w.cash);
    if (itemId === 'repair') {
      w.playerCar.health = 100;
      w.hud.toast('Car repaired — good as new.');
    } else if (itemId === 'armor') {
      w.player.health = 100;
      w.armor = 50;
      w.hud.setHealth(100);
      w.hud.setArmor(50);
      w.hud.toast('Body armor on — 50 armor, health full.');
    } else if (itemId === 'ammo') {
      w.player.ammo = (w.player.ammo || 0) + 60;
      w.hud.setAmmo(w.player.ammo);
      w.hud.toast('Sixty rounds in the pocket.');
    } else if (itemId === 'comet') {
      const shop = this.nearest(w.playerX, w.playerZ) || LANDMARKS.shops[0];
      const car = makeCar('comet', 0xd21f2b);
      car.owned = true; // yours: stealing it back costs no heat
      placeCar(car, shop.x + 10, shop.z + 6, Math.PI / 2);
      this.scene.add(car.group);
      w.traffic.parked.push(car);
      w.hud.toast('Your Comet GT is parked outside the shop.');
    }
    w.audio.pickup();
    w.saveGame && w.saveGame();
    return true;
  }
}
