// missions.js — Milo's story: five jobs for Cleo Vane, from a first stolen
// car to the Coral Bank score, plus the repeatable chop-shop sell.
import * as THREE from 'three';
import { LANDMARKS } from './city.js';
import { dist2, fmtCash } from './utils.js';

const JOBS = [
  {
    id: 'wheels', title: 'First Wheels', giver: 'Cleo Vane',
    brief: 'Cleo: "You owe me, Milo. Start simple — bring me a car. Any car. My garage, Portside side."',
    objective: 'Steal a car and deliver it to Cleo\u2019s Garage',
    reward: 400,
  },
  {
    id: 'late', title: 'Running Late', giver: 'Cleo Vane',
    brief: 'Cleo: "Package for Coral Heights. Two and a half minutes. Drive like the rent is due — it is."',
    objective: 'Deliver the package to Coral Heights before time runs out',
    reward: 600, timer: 150,
  },
  {
    id: 'shakedown', title: 'The Shakedown', giver: 'Cleo Vane',
    brief: 'Cleo: "Three shops in Old Marina owe me. Walk in, hold your ground, walk out with my cut."',
    objective: 'Collect from all 3 shops in Old Marina (hold E at each door)',
    reward: 800,
  },
  {
    id: 'pursuit', title: 'Hot Pursuit', giver: 'Cleo Vane',
    brief: 'Cleo: "You made the front page, Milo. Three stars. Lose them, then get to the Sunfield safehouse."',
    objective: 'Lose the wanted level, then reach the Safehouse',
    reward: 1000,
  },
  {
    id: 'score', title: 'The Big Score', giver: 'Cleo Vane',
    brief: 'Cleo: "Coral Bank. Four minutes of chaos, then the docks. Do this and the debt is gone, Milo."',
    objective: 'Rob the Coral Bank, then escape to the Portside Docks',
    reward: 5000,
  },
  {
    id: 'race', title: 'The Neon Grand Prix', giver: 'Cleo Vane',
    brief: 'Cleo: "Debt paid — now the fun part. The Strip runs a midnight race: four gates, three minutes, in a car. Winner takes $1,200 and the whole city watches."',
    objective: 'Hit all 4 race gates in order, in a car, before time runs out',
    reward: 1200, timer: 180,
  },
  {
    id: 'courier', title: 'Three Drops', giver: 'Cleo Vane',
    brief: 'Cleo: "Three drops, one run, four minutes. Coral Heights, the docks, then Solmar General. Don\'t keep my customers waiting."',
    objective: 'Deliver to all 3 stops in order before time runs out',
    reward: 900, timer: 240,
  },
  {
    id: 'escort', title: 'The Bodyguard', giver: 'Cleo Vane',
    brief: 'Cleo: "My associate rides with you to the Safehouse. The PD knows his face — three stars and counting. Get him there in one piece."',
    objective: 'Drive the associate to the Safehouse with 3 stars on you',
    reward: 1100,
  },
  {
    id: 'heist', title: 'The Marina Heist', giver: 'Cleo Vane',
    brief: 'Cleo: "Two vaults, one night. Crack the docks warehouse, then the Coral Bank vault — and get out before the whole city wakes up."',
    objective: 'Crack the warehouse, then the bank vault, then escape to the Garage',
    reward: 2000,
  },
  {
    id: 'stealth', title: 'Quiet Night', giver: 'Cleo Vane',
    brief: 'Cleo: "The bank vault, no noise, no heat. One star on you and the job is blown. Walk in quiet, walk out rich."',
    objective: 'Crack the Coral Bank vault without ever gaining a wanted star',
    reward: 1500,
  },
  {
    id: 'taxi', title: 'Night Shift', giver: 'Cleo Vane',
    brief: 'Cleo: "The cab needs a driver tonight. Three fares around town — pick them up, drop them off, keep the meter running."',
    objective: 'Pick up 3 fares in a car and drop each one off ($250 a fare)',
    reward: 600,
  },
  {
    id: 'getaway', title: 'The Getaway', giver: 'Cleo Vane',
    brief: 'Cleo: "Four stars, Milo, and every cruiser in Solmar is on you. Lose them, then vanish at the docks."',
    objective: 'Lose the 4-star wanted level, then reach the Portside Docks',
    reward: 1400,
  },
];

export const JOB_TOTAL = JOBS.length;

// three-drops route: three landmarks, in order, against the clock
const COURIER_DROPS = [LANDMARKS.delivery, LANDMARKS.docks, LANDMARKS.hospital];
// night-shift fares: pickup -> drop-off, $250 a fare, in a car
const TAXI_FARES = [
  // the fare waits on the street outside PD HQ: the station itself is a
  // solid building, and no car (or pedestrian) can reach its centre
  { pick: { x: 74, z: 37, label: 'Solmar PD HQ' }, drop: LANDMARKS.bank, fare: 250 },
  { pick: LANDMARKS.hospital, drop: LANDMARKS.garage, fare: 250 },
  { pick: LANDMARKS.docks, drop: LANDMARKS.safehouse, fare: 250 },
];

// the grand prix route: four road intersections, one per corner of the city
const RACE_GATES = [
  { x: 148, z: -148, label: 'Race Gate 1' },
  { x: -148, z: -148, label: 'Race Gate 2' },
  { x: -148, z: 148, label: 'Race Gate 3' },
  { x: 148, z: 148, label: 'Race Gate 4' },
];

export class Missions {
  constructor(scene, world) {
    this.world = world;
    this.index = 0; // next job to start
    this.active = null;
    this.stage = 0; // per-job stage
    this.holdT = 0; this.holdNeed = 0;
    this.shopsDone = 0;
    this.timer = 0;
    this.storyDone = false;
    // 3D beacon: light pillar + bouncing arrow
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, depthWrite: false });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), mat);
    this.beacon.visible = false;
    scene.add(this.beacon);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    arrow.rotation.x = Math.PI;
    this.arrow = arrow; this.arrow.visible = false;
    scene.add(arrow);
    this.beaconT = 0;
  }
  current() { return this.active ? JOBS[this.index] : null; }
  start(index) {
    this.index = index;
    this.active = JOBS[index];
    this.stage = 0; this.holdT = 0; this.shopsDone = 0;
    this.timer = this.active.timer || 0;
    if (this.active.id === 'pursuit') this.world.police.addHeat(500, 'mission');
    if (this.active.id === 'escort') this.world.police.addHeat(500, 'mission');
    if (this.active.id === 'getaway') this.world.police.addHeat(800, 'mission');
    if (this.active.id === 'stealth') {
      this.world.police.clear(); // Quiet Night starts clean
      this.world.audio.heliStop && this.world.audio.heliStop();
    }
    this.world.hud.toast(this.active.giver + ': ' + this.active.brief);
    this.world.hud.setObjective(this.active.title, this.active.objective);
    this.world.audio.jingle();
  }
  complete() {
    const job = this.active;
    this.world.cash += job.reward;
    this.world.hud.toast('JOB DONE — ' + job.title + '  +' + fmtCash(job.reward));
    this.world.audio.missionFanfare();
    // first job done: Cleo trusts Milo with a pistol from here on
    if (job.id === 'wheels' && this.world.player && !this.world.player.armed) {
      this.world.player.armed = true;
      this.world.player.ammo = 60;
      this.world.hud.setAmmo(60);
      this.world.hud.toast('Cleo: "You\'re one of us now, Milo. Take this — you\'ll need it."');
    }
    // save AFTER the index moves, or continuing replays the job just done
    this.active = null;
    this.beacon.visible = false; this.arrow.visible = false;
    this.index++;
    if (this.index >= JOBS.length) {
      this.storyDone = true;
      this.world.hud.setObjective('KINGPIN OF SOLMAR', 'Story complete. The city is yours — free roam.');
      this.world.hud.toast('Cleo: "Debt paid, Milo. Solmar is yours now."');
    } else {
      this.world.hud.setObjective('Next job incoming…', 'Cleo is calling with the next job.');
      this.world.nextJobIn = 4;
    }
    this.world.saveGame && this.world.saveGame();
  }
  fail(why) {
    this.world.hud.toast('JOB FAILED — ' + why + '. Try again.');
    this.world.audio.denied();
    this.active = null;
    this.beacon.visible = false; this.arrow.visible = false;
    this.world.nextJobIn = 3;
  }
  target() {
    if (!this.active) return null;
    switch (this.active.id) {
      case 'wheels': return this.stage === 0 ? null : LANDMARKS.garage;
      case 'late': return LANDMARKS.delivery;
      case 'shakedown': return this.shopsDone < 3 ? LANDMARKS.shops[this.shopsDone] : null;
      case 'pursuit': return LANDMARKS.safehouse;
      case 'score': return this.stage === 0 ? LANDMARKS.bank : LANDMARKS.docks;
      case 'race': return RACE_GATES[this.stage] || null;
      case 'courier': return COURIER_DROPS[this.stage] || null;
      case 'escort': return LANDMARKS.safehouse;
      case 'heist': return this.stage === 0 ? LANDMARKS.docks : this.stage === 1 ? LANDMARKS.bank : LANDMARKS.garage;
      case 'stealth': return LANDMARKS.bank;
      case 'taxi': {
        const f = TAXI_FARES[Math.floor(this.stage / 2)];
        return f ? (this.stage % 2 === 0 ? f.pick : f.drop) : null;
      }
      case 'getaway': return LANDMARKS.docks;
      default: return null;
    }
  }
  // hold-E interaction at the current target; returns {label, progress} or null
  interact() {
    if (!this.active) return null;
    const t = this.target();
    if (!t) return null;
    const d = dist2(this.world.playerX, this.world.playerZ, t.x, t.z);
    if (d > 7) return null;
    // the vault, warehouse and shakedown jobs are on-foot work: while driving,
    // E just parks the car (the taxi is the one job done from the driver's seat)
    const onFootJob = ['shakedown', 'score', 'heist', 'stealth'].includes(this.active.id);
    if (onFootJob && this.world.inCar) return null;
    if (this.active.id === 'shakedown') return { label: 'Collecting protection money…', need: 3 };
    if (this.active.id === 'score' && this.stage === 0) return { label: 'Cracking the vault…', need: 4 };
    if (this.active.id === 'heist' && this.stage === 0) return { label: 'Cracking the warehouse…', need: 4 };
    if (this.active.id === 'heist' && this.stage === 1) return { label: 'Cracking the bank vault…', need: 4 };
    if (this.active.id === 'stealth' && this.stage === 0) return { label: 'Cracking the vault, quietly…', need: 5 };
    if (this.active.id === 'taxi' && this.stage % 2 === 0) {
      if (!this.world.inCar) return null; // fares only ride in a car
      return { label: 'Picking up the fare…', need: 2 };
    }
    return null;
  }
  advanceHold(dt) {
    const it = this.interact();
    if (!it) { this.holdT = 0; return 0; }
    this.holdT += dt;
    const p = Math.min(1, this.holdT / it.need);
    if (p >= 1) {
      this.holdT = 0;
      if (this.active.id === 'shakedown') {
        this.shopsDone++;
        this.world.cash += 150;
        this.world.audio.pickup();
        if (this.shopsDone === 3) { this.complete(); return 1; }
        if (this.shopsDone === 2) this.world.police.addHeat(200, 'shopkeeper called the cops');
        this.world.hud.toast('Collected $150. ' + (3 - this.shopsDone) + ' shop(s) left.');
        this.world.hud.setObjective(this.active.title, 'Collect from all 3 shops (' + this.shopsDone + '/3 done)');
      } else if (this.active.id === 'score' && this.stage === 0) {
        this.stage = 1;
        this.world.police.addHeat(700, 'bank alarm');
        this.world.audio.jingle();
        this.world.hud.toast('Vault open — $5,000 in the bag. RUN to the docks!');
        this.world.hud.setObjective(this.active.title, 'Escape to the Portside Docks — 4 stars on you');
      } else if (this.active.id === 'heist' && this.stage === 0) {
        this.stage = 1;
        this.world.audio.pickup();
        this.world.hud.toast('Warehouse cracked — now the Coral Bank vault!');
        this.world.hud.setObjective(this.active.title, 'Crack the Coral Bank vault');
      } else if (this.active.id === 'heist' && this.stage === 1) {
        this.stage = 2;
        this.world.police.addHeat(700, 'bank alarm');
        this.world.audio.jingle();
        this.world.hud.toast('Both vaults cracked — $2,000 in the bag. RUN to the garage!');
        this.world.hud.setObjective(this.active.title, 'Escape to Cleo\u2019s Garage — 4 stars on you');
      } else if (this.active.id === 'stealth' && this.stage === 0) {
        this.stage = 1;
        this.world.audio.missionFanfare();
        this.world.hud.toast('Vault cracked — not a single star. Cleo is impressed.');
        this.complete(); return 1;
      } else if (this.active.id === 'taxi' && this.stage % 2 === 0) {
        const f = TAXI_FARES[Math.floor(this.stage / 2)];
        this.stage++;
        this.world.audio.pickup();
        this.world.hud.toast('Fare aboard — take them to ' + f.drop.label + '.');
        this.world.hud.setObjective(this.active.title, 'Drop the fare at ' + f.drop.label + '  ·  $250');
      }
    }
    return p;
  }
  update(dt, world) {
    if (!this.active) {
      // chop-shop: sell a stolen car at the garage when free-roaming
      if (world.playerCar && dist2(world.playerX, world.playerZ, LANDMARKS.garage.x, LANDMARKS.garage.z) < 8) {
        world.chopOffer = world.playerCar;
      } else world.chopOffer = null;
      this.beacon.visible = false; this.arrow.visible = false;
      return;
    }
    const job = this.active;
    if (job.timer) {
      this.timer -= dt;
      world.hud.setTimer(this.timer);
      if (this.timer <= 0) { world.hud.setTimer(null); this.fail('Out of time'); return; }
    }
    const t = this.target();
    if (t) {
      this.beacon.visible = true; this.arrow.visible = true;
      this.beacon.position.set(t.x, 30, t.z);
      this.beaconT += dt;
      this.arrow.position.set(t.x, 14 + Math.sin(this.beaconT * 3) * 1.5, t.z);
      // the race objective counts gates as they fall
      const label = job.id === 'race'
        ? 'Race gate ' + (this.stage + 1) + ' of ' + RACE_GATES.length + ' — drive!'
        : job.id === 'courier'
          ? 'Drop ' + (this.stage + 1) + ' of 3 — ' + t.label
          : job.id === 'taxi'
            ? (this.stage % 2 === 0
              ? 'Pick up fare ' + (Math.floor(this.stage / 2) + 1) + ' of 3 at ' + t.label + ' (in a car)'
              : 'Drop the fare at ' + t.label + '  ·  $250')
            : job.objective;
      world.hud.setObjective(job.title, label + '  ·  ' + Math.round(dist2(world.playerX, world.playerZ, t.x, t.z)) + 'm');
    } else {
      this.beacon.visible = false; this.arrow.visible = false;
    }
    // arrival checks
    if (job.id === 'wheels' && this.stage === 0 && world.playerCar) {
      this.stage = 1;
      world.hud.setObjective(job.title, 'Deliver the car to Cleo\u2019s Garage');
    }
    if (job.id === 'wheels' && this.stage === 1 && world.playerCar &&
      dist2(world.playerX, world.playerZ, LANDMARKS.garage.x, LANDMARKS.garage.z) < 9) {
      world.removePlayerCar();
      this.complete(); return;
    }
    if (job.id === 'late' && dist2(world.playerX, world.playerZ, LANDMARKS.delivery.x, LANDMARKS.delivery.z) < 8) {
      world.hud.setTimer(null); this.complete(); return;
    }
    if (job.id === 'pursuit' && world.police.stars === 0 &&
      dist2(world.playerX, world.playerZ, LANDMARKS.safehouse.x, LANDMARKS.safehouse.z) < 9) {
      this.complete(); return;
    }
    if (job.id === 'score' && this.stage === 1 &&
      dist2(world.playerX, world.playerZ, LANDMARKS.docks.x, LANDMARKS.docks.z) < 9) {
      this.complete(); return;
    }
    if (job.id === 'race') {
      const gate = RACE_GATES[this.stage];
      if (gate && dist2(world.playerX, world.playerZ, gate.x, gate.z) < 9) {
        this.stage++;
        this.world.audio.pickup();
        if (this.stage >= RACE_GATES.length) { world.hud.setTimer(null); this.complete(); return; }
        this.world.hud.toast('Gate ' + this.stage + '/' + RACE_GATES.length + ' — next gate is marked. Keep it pinned!');
      }
    }
    if (job.id === 'courier') {
      const drop = COURIER_DROPS[this.stage];
      if (drop && dist2(world.playerX, world.playerZ, drop.x, drop.z) < 8) {
        this.stage++;
        this.world.audio.pickup();
        if (this.stage >= COURIER_DROPS.length) { world.hud.setTimer(null); this.complete(); return; }
        this.world.hud.toast('Drop ' + this.stage + '/3 done — next: ' + COURIER_DROPS[this.stage].label + '.');
      }
    }
    if (job.id === 'escort' &&
      dist2(world.playerX, world.playerZ, LANDMARKS.safehouse.x, LANDMARKS.safehouse.z) < 9) {
      this.complete(); return;
    }
    if (job.id === 'heist' && this.stage === 2 &&
      dist2(world.playerX, world.playerZ, LANDMARKS.garage.x, LANDMARKS.garage.z) < 9) {
      this.complete(); return;
    }
    if (job.id === 'stealth' && world.police.stars > 0) {
      this.fail('Spotted — the job is blown');
      return;
    }
    if (job.id === 'taxi' && this.stage % 2 === 1) {
      const f = TAXI_FARES[Math.floor(this.stage / 2)];
      if (f && dist2(world.playerX, world.playerZ, f.drop.x, f.drop.z) < 8) {
        this.world.cash += f.fare;
        this.world.audio.cashChime();
        this.world.hud.toast('Fare paid +' + fmtCash(f.fare) + '.');
        this.stage++;
        if (this.stage >= TAXI_FARES.length * 2) { this.complete(); return; }
      }
    }
    if (job.id === 'getaway' && world.police.stars === 0 &&
      dist2(world.playerX, world.playerZ, LANDMARKS.docks.x, LANDMARKS.docks.z) < 9) {
      this.complete(); return;
    }
  }
}
