// missions.js — the twelve story jobs for Cleo Vane, plus the repeatable
// chop-shop. Each job is data (title, payout, timer, kind) and a small state
// machine the game ticks every frame.
import { clamp, dist2, pick } from './utils.js';

export const MISSION_DEFS = [
  { title: 'First Wheels', payout: 300, timer: 120, kind: 'steal', desc: 'Steal a car and bring it to Cleo.' },
  { title: 'Sunfield Shuffle', payout: 400, timer: 150, kind: 'goto', target: [-200, -200], desc: 'Drop a package in Sunfield.' },
  { title: 'Coastal Cruise', payout: 500, timer: 180, kind: 'goto', target: [200, -40], desc: 'Cruise the beachfront and check in.' },
  { title: 'Downtown Dash', payout: 600, timer: 200, kind: 'goto', target: [40, 40], desc: 'Beat the clock across Downtown.' },
  { title: 'Marina Meet', payout: 700, timer: 240, kind: 'goto', target: [200, 120], desc: 'Meet the contact at the marina.' },
  { title: 'Neon Grand Prix', payout: 800, timer: 180, kind: 'grandprix', points: [[120, -120], [-120, 120], [0, -200]], desc: 'Three checkpoints, one fast car.' },
  { title: 'Three Drops', payout: 900, timer: 240, kind: 'drops', points: [[-160, 160], [160, -160], [0, 200]], desc: 'Three packages, three corners of Solmar.' },
  { title: 'The Bodyguard', payout: 1100, timer: 0, kind: 'bodyguard', points: [[80, -80], [-160, -160]], desc: 'Pick the client up, bring them home safe.' },
  { title: 'The Marina Heist', payout: 2000, timer: 0, kind: 'heist', points: [[120, 80], [160, 40], [200, 160]], desc: 'Crack the warehouse, crack the vault, reach the docks.' },
  { title: 'Quiet Night', payout: 1500, timer: 0, kind: 'quiet', target: [-200, 200], desc: 'One drop, no police. Stay invisible.' },
  { title: 'Night Shift', payout: 600, timer: 0, kind: 'taxi', desc: 'Drive fares. $250 a drop, $600 for the shift.' },
  { title: 'The Getaway', payout: 1400, timer: 0, kind: 'getaway', target: [-120, 222], desc: 'Four stars. Lose them, then reach the north edge.' },
];

export function createMissions(G) {
  const list = MISSION_DEFS.map((d) => ({ title: d.title, payout: d.payout, timer: d.timer, desc: d.desc }));
  let active = null;
  let index = 0;
  let storyDone = false;

  function start(i) {
    const def = MISSION_DEFS[i];
    if (!def) return null;
    active = {
      i,
      def,
      title: def.title,
      stage: 0,
      timer: def.timer,
      fare: 0,
      fareStage: 0,
      acc: 0,
      crack: 0,
      pickup: null,
      dropoff: null,
    };
    if (def.kind === 'taxi') {
      const p = G.city.randomRoadPoint();
      const d = G.city.randomRoadPoint();
      active.pickup = { x: p.x, z: p.z };
      active.dropoff = { x: d.x, z: d.z };
    }
    if (def.kind === 'getaway') {
      G.police.addHeat(700, 'getaway');
    }
    if (G.hud) G.hud.notify('Job: ' + def.title + ' — ' + def.desc);
    return active;
  }

  function target() {
    if (!active) return null;
    const def = active.def;
    switch (def.kind) {
      case 'steal': {
        const car = G.world.traffic.nearestParked(G.world.playerX, G.world.playerZ, 400);
        return car ? { x: car.x, z: car.z } : { x: 0, z: 0 };
      }
      case 'goto':
      case 'quiet':
      case 'getaway':
        return { x: def.target[0], z: def.target[1] };
      case 'grandprix':
      case 'drops':
      case 'bodyguard':
      case 'heist': {
        const p = def.points[Math.min(active.stage, def.points.length - 1)];
        return { x: p[0], z: p[1] };
      }
      case 'taxi':
        return active.fareStage === 0 ? active.pickup : active.dropoff;
      default:
        return null;
    }
  }


  function complete() {
    if (!active) return;
    const def = active.def;
    const done = active.i;
    G.world.cash += def.payout;
    G.totalEarned = (G.totalEarned || 0) + def.payout;
    index = Math.max(index, done + 1);
    if (done === MISSION_DEFS.length - 1) storyDone = true;
    if (G.hud) G.hud.notify('Job done: ' + def.title + ' +$' + def.payout + '.');
    if (G.audio) G.audio.jobDone();
    active = null;
    if (G.save) G.save.saveGame();
  }

  function fail(reason) {
    if (!active) return;
    if (G.hud) G.hud.notify('Job failed: ' + active.title + (reason ? ' — ' + reason : ''));
    active = null;
  }

  function update(_dt, rawDt) {
    if (!active) return;
    const def = active.def;
    // Whole-second countdown, so the timer reads its starting value at once.
    if (def.timer > 0) {
      active.acc += rawDt;
      if (active.acc >= 1) {
        active.acc -= 1;
        active.timer -= 1;
        if (active.timer <= 0) { fail('Out of time.'); return; }
      }
    }
    // Quiet Night fails the moment the police notice Milo.
    if (def.kind === 'quiet' && G.police.stars > 0) { fail('Spotted.'); return; }
    const px = G.world.playerX;
    const pz = G.world.playerZ;
    const t = target();
    switch (def.kind) {
      case 'steal':
        if (G.world.inCar) complete();
        break;
      case 'goto':
      case 'quiet':
        if (t && dist2(px, pz, t.x, t.z) < 12) complete();
        break;
      case 'grandprix':
      case 'drops':
      case 'bodyguard':
        if (t && dist2(px, pz, t.x, t.z) < 14) {
          active.stage += 1;
          if (active.stage >= def.points.length) complete();
        }
        break;
      case 'heist':
        // Stages 0 and 1 advance by holding E (holdE); the docks finish it.
        if (active.stage === 2 && t && dist2(px, pz, t.x, t.z) < 12) complete();
        break;
      case 'taxi':
        if (!t) break;
        if (dist2(px, pz, t.x, t.z) < 12) {
          if (active.fareStage === 0) {
            active.fareStage = 1;
            if (G.hud) G.hud.notify('Passenger aboard. Drop them off.');
          } else {
            active.fare += 1;
            G.world.cash += 250;
            if (G.hud) G.hud.notify('Fare paid: +$250.');
            if (active.fare >= 2) {
              complete();
            } else {
              const p = G.city.randomRoadPoint();
              const d = G.city.randomRoadPoint();
              active.pickup = { x: p.x, z: p.z };
              active.dropoff = { x: d.x, z: d.z };
              active.fareStage = 0;
            }
          }
        }
        break;
      case 'getaway':
        if (G.police.heat <= 0 && t && dist2(px, pz, t.x, t.z) < 15) complete();
        break;
      default:
        break;
    }
  }

  // Hold E near a heist target to crack it. Called every frame while E is down.
  function holdE(dt) {
    if (!active || active.def.kind !== 'heist') return false;
    if (active.stage >= 2) return false;
    const t = target();
    if (!t) return false;
    if (dist2(G.world.playerX, G.world.playerZ, t.x, t.z) > 10) {
      active.crack = 0;
      return false;
    }
    active.crack += dt / 1.5;
    if (active.crack >= 1) {
      active.crack = 0;
      active.stage += 1;
      if (active.stage === 2) {
        G.police.addHeat(650, 'heist');
        if (G.hud) G.hud.notify('Vault cracked. The PD is coming.');
      } else {
        if (G.hud) G.hud.notify('Warehouse cracked. Now the vault.');
      }
      return true;
    }
    return false;
  }

  // Chop-shop: sell the car Milo is driving for cash, on foot afterwards.
  function chopshop() {
    const car = G.world.playerCar;
    if (!G.world.inCar || !car) return false;
    const chop = G.city.points.chopshop;
    if (dist2(G.world.playerX, G.world.playerZ, chop.x, chop.z) > 10) return false;
    const value = 250 + Math.round(car.top * 4);
    G.world.cash += value;
    G.world.inCar = false;
    G.world.playerCar = null;
    G.player.setPosition(chop.x - 4, chop.z, 0);
    car.dispose();
    if (G.hud) G.hud.notify('Chop-shop paid $' + value + ' for the ' + car.name + '.');
    if (G.save) G.save.saveGame();
    return true;
  }

  return {
    list,
    get active() { return active; },
    set active(v) { active = v; },
    // The playtest reads the running job's stage and timer off the missions
    // object itself, so expose them as live getters over the active job.
    get stage() { return active ? active.stage : 0; },
    get timer() { return active ? active.timer : 0; },
    get index() { return index; },
    set index(v) { index = v; },
    get storyDone() { return storyDone; },
    set storyDone(v) { storyDone = v; },
    start,
    target,
    update,
    holdE,
    chopshop,
    complete,
    fail,
  };
}
