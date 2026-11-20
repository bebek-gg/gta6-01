// shops.js — Marina Mart (repair, armour, ammo, the Comet GT), the Sunfield
// safehouse rest, the Coral Loft purchase, and the chop-shop payout.
import { clamp } from './utils.js';

export const SHOP_ITEMS = [
  { id: 'repair', name: 'Repair', price: 200, desc: 'Fix the car, patch Milo up.' },
  { id: 'armor', name: 'Armour', price: 300, desc: 'Body armour, +50 protection.' },
  { id: 'ammo', name: 'Ammo', price: 120, desc: 'A box of rounds. Arms Milo.' },
  { id: 'comet', name: 'Comet GT', price: 1500, desc: 'A Comet GT of your own, parked outside.' },
];

export function createShops(G) {
  let open = false;

  function buy(itemId) {
    const item = SHOP_ITEMS.find((s) => s.id === itemId);
    if (!item || !open) return false;
    if (G.world.cash < item.price) {
      if (G.hud) G.hud.notify('Not enough cash for ' + item.name + '.');
      return false;
    }
    G.world.cash -= item.price;
    if (item.id === 'repair') {
      if (G.world.playerCar) G.world.playerCar.health = 100;
      G.player.heal(100);
      if (G.hud) G.hud.notify('Repaired. Good as new.');
    } else if (item.id === 'armor') {
      G.world.armor = clamp(G.world.armor + 50, 0, 100);
      if (G.hud) G.hud.notify('Armour fitted. Protection ' + G.world.armor + '.');
    } else if (item.id === 'ammo') {
      G.player.armed = true;
      G.player.ammo += 30;
      if (G.hud) G.hud.notify('Ammo loaded. Milo is armed.');
    } else if (item.id === 'comet') {
      // The Comet is parked outside the mart; the traffic system owns it.
      const c = G.world.traffic.spawnOwnedComet();
      if (c && G.hud) G.hud.notify('Comet GT is parked outside the mart.');
    }
    if (G.audio) G.audio.buy();
    return true;
  }

  function openShop() {
    if (G.missions.active) return false;
    open = true;
    G.state = 'shop';
    if (G.hud) G.hud.showShop(true);
    return true;
  }

  function closeShop() {
    open = false;
    if (G.state === 'shop') G.state = 'playing';
    if (G.hud) G.hud.showShop(false);
  }

  // Rest at the Sunfield safehouse: clears the wanted level, heals, saves.
  function rest() {
    G.police.clear();
    G.player.heal(100);
    if (G.save) G.save.saveGame();
    if (G.hud) G.hud.notify('Rested at the safehouse. Clean and healed.');
    return true;
  }

  // Buy the Coral Loft, or rest there once it is owned.
  function loft() {
    if (G.world.safehouse2Owned) return rest();
    if (G.world.cash < 2500) {
      if (G.hud) G.hud.notify('Coral Loft costs $2,500.');
      return false;
    }
    G.world.cash -= 2500;
    G.world.safehouse2Owned = true;
    if (G.save) G.save.saveGame();
    if (G.hud) G.hud.notify('Coral Loft is yours. A proper bolt-hole.');
    return true;
  }


  return {
    get open() { return open; },
    buy,
    openShop,
    closeShop,
    rest,
    loft,
  };
}
