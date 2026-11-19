// missions.js — Cleo Vane's twelve jobs: what each one asks, where it
// points, how long it allows, and what it pays. Plus the chop-shop fares.

import { pick, rand } from './utils.js';
import { ROADS } from './city.js';

/** The story, in order. time is the countdown in seconds, 0 means untimed. */
export const JOBS = [
  {
    title: 'First Wheels', reward: 400, time: 0,
    brief: 'Cleo needs a driver with wheels. Steal any car and get moving.',
  },
  {
    title: 'Running Late', reward: 600, time: 150,
    brief: 'A package has to cross town before the clock runs out. Drive fast.',
  },
  {
    title: 'The Shakedown', reward: 800, time: 0,
    brief: 'A shopkeeper on the Strip owes Cleo. Hold E at his door until he pays up.',
  },
  {
    title: 'Hot Pursuit', reward: 900, time: 0,
    brief: 'The PD is on you. Lose them, then reach the far corner in one piece.',
  },
  {
    title: 'The Big Score', reward: 1200, time: 0,
    brief: 'Crack the Solmar Bank vault, then get the cash to the docks.',
  },
  {
    title: 'Neon Grand Prix', reward: 1000, time: 180,
    brief: 'Three checkpoints, one street race, no rules. Beat the clock.',
  },
  {
    title: 'Three Drops', reward: 900, time: 240,
    brief: 'Three packages, three corners of the city. Do not keep Cleo waiting.',
  },
  {
    title: 'The Bodyguard', reward: 1100, time: 0,
    brief: 'Pick up Cleo\u2019s client on the Strip and bring them to the docks, alive.',
  },
  {
    title: 'The Marina Heist', reward: 2000, time: 0,
    brief: 'Crack the warehouse, crack the vault, then vanish at the docks.',
  },
  {
    title: 'Quiet Night', reward: 1500, time: 0,
    brief: 'Slip across town without the PD ever seeing you. One star and it is over.',
  },
  {
    title: 'Night Shift', reward: 600, time: 0,
    brief: 'Drive the cab. Every fare pays $250 — three fares and the night is yours.',
  },
  {
    title: 'The Getaway', reward: 1400, time: 0,
    brief: 'Four stars and the whole city hunting you. Lose the heat, reach the beach house.',
  },
];

/** A point on a road, for fares and drop-offs that move around. */
function roadPoint() {
  const road = pick(ROADS);
  const along = rand(-190, 190);
  const off = pick([-1, 1]) * 2.6;
  return Math.random() < 0.5
    ? { x: road + off, z: along }
    : { x: along, z: road + off };
}

/** Two road points a good drive apart. */
function farePair() {
  const a = roadPoint();
  let b = roadPoint();
  let guard = 0;
  while (Math.hypot(b.x - a.x, b.z - a.z) < 80 && guard < 20) {
    b = roadPoint();
    guard += 1;
  }
  return [a, b];
}

export class Missions {
  constructor(game) {
    this.game = game;
    this.list = JOBS;
    this.index = 0;
    this.active = null;
    this.storyDone = false;
    this.pendingNext = null;
    this.pendingAt = 0;
  }

  /** The current stage of the active job, or 0 when none is running. */
  get stage() {
    return this.active ? this.active.stage : 0;
  }

  /** The countdown of the active job, rounded up, or 0 when untimed. */
  get timer() {
    return this.active ? Math.ceil(this.active.timer) : 0;
  }

  /** Start job i: fresh stage, fresh timer, fresh fares. */
  start(i) {
    const def = JOBS[i];
    if (!def) return;
    this.pendingNext = null;
    this.index = i;
    const job = {
      def,
      title: def.title,
      index: i,
      stage: 0,
      timer: def.time,
      fare: 0,
      fareStage: 0,
      work: 0,
      targets: this.planTargets(i),
      targetIdx: 0,
      pickup: null,
      dropoff: null,
    };
    if (i === 10) {
      const [a, b] = farePair();
      job.pickup = a;
      job.dropoff = b;
    }
    this.active = job;
    const g = this.game;
    if (i === 3) g.police.addHeat(300, 'Hot Pursuit');
    if (i === 11) g.police.addHeat(800, 'The Getaway');
    g.hud.setJob(def.title, def.brief);
    g.hud.showBanner(def.title, def.brief);
    g.audio.blip(660);
  }

  /** The fixed waypoints of a job; the taxi and the first job are dynamic. */
  planTargets(i) {
    const L = this.game.city.landmarks;
    switch (i) {
      case 1: return [{ x: 180, z: -180 }];
      case 2: return [{ x: -60, z: 60 }];
      case 3: return [{ x: -180, z: -180 }];
      case 4: return [{ x: L.bank.x, z: L.bank.z }, { x: L.docks.x, z: L.docks.z }];
      case 5: return [{ x: 180, z: 180 }, { x: -180, z: 180 }, { x: -180, z: -180 }];
      case 6: return [{ x: 150, z: -150 }, { x: -150, z: -30 }, { x: 30, z: 180 }];
      case 7: return [{ x: 0, z: -60 }, { x: L.docks.x, z: L.docks.z }];
      case 8: return [
        { x: L.warehouse.x, z: L.warehouse.z },
        { x: L.bank.x, z: L.bank.z },
        { x: L.docks.x, z: L.docks.z },
      ];
      case 9: return [{ x: -180, z: -180 }];
      case 11: return [{ x: -120, z: 222 }];
      default: return [];
    }
  }

  /** Where the marker points right now, or null when no job is running. */
  target() {
    const job = this.active;
    if (!job) return null;
    const g = this.game;
    if (job.index === 0) {
      // First Wheels: the nearest parked car.
      let best = null;
      let bestD = Infinity;
      for (const car of g.traffic.parked) {
        const d = Math.hypot(car.x - g.player.x, car.z - g.player.z);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      return best ? { x: best.x, z: best.z } : { x: 0, z: 150 };
    }
    if (job.index === 10) {
      return job.fareStage === 0 ? job.pickup : job.dropoff;
    }
    // The bank job, the courier run and the heist walk their waypoints by
    // stage; the race and the escort walk theirs by target index.
    if (job.index === 4 || job.index === 6 || job.index === 8) {
      return job.targets[Math.min(job.stage, job.targets.length - 1)] || null;
    }
    return job.targets[job.targetIdx] || job.targets[job.targets.length - 1] || null;
  }

  /**
   * The hold-to-work spot for the active job, if its current stage is one:
   * {x, z, secs}. Null when the job advances by arriving instead.
   */
  holdTarget() {
    const job = this.active;
    if (!job) return null;
    const at = (i, secs) => {
      const p = job.targets[i];
      return p ? { x: p.x, z: p.z, secs } : null;
    };
    if (job.index === 2 && job.stage === 0) return at(0, 2);
    if (job.index === 4 && job.stage === 0) return at(0, 2.5);
    if (job.index === 8 && job.stage === 0) return at(0, 2.5);
    if (job.index === 8 && job.stage === 1) return at(1, 3);
    return null;
  }

  /** A hold stage finished: what cracking that spot earns or unlocks. */
  advanceHold(job) {
    const g = this.game;
    if (job.index === 2) {
      g.police.addHeat(60, 'The Shakedown');
      this.complete();
    } else if (job.index === 4) {
      job.stage = 1;
      g.police.addHeat(250, 'The Big Score');
      g.hud.toast('Vault cracked — get the cash to the docks');
      g.audio.blip(880);
    } else if (job.index === 8) {
      if (job.stage === 0) {
        job.stage = 1;
        g.hud.toast('Warehouse cracked — now the vault');
        g.audio.blip(880);
      } else if (job.stage === 1) {
        job.stage = 2;
        g.police.addHeat(750, 'The Marina Heist');
        g.hud.toast('Vault cracked — the PD is coming. Run for the docks');
        g.audio.sirenBlip();
      }
    }
  }

  /** One frame of the active job: timers, arrivals, holds, fares, escapes. */
  step(dt) {
    // The next job starts itself a few seconds after the last one ends,
    // but only if the player has not taken another job in the meantime.
    if (!this.active && this.pendingNext != null && this.game.time >= this.pendingAt) {
      const n = this.pendingNext;
      this.pendingNext = null;
      if (n < 12 && !this.storyDone) this.start(n);
    }
    const job = this.active;
    if (!job) return;
    const g = this.game;
    if (job.timer > 0) {
      job.timer -= dt;
      if (job.timer <= 0) {
        job.timer = 0;
        this.fail('Out of time');
        return;
      }
    }
    const px = g.player.x;
    const pz = g.player.z;
    const near = (t, r = 8) => !!t && Math.hypot(px - t.x, pz - t.z) < r;
    const hold = this.holdTarget();
    if (hold) {
      if (near(hold) && g.eHeld) {
        job.work += dt;
        g.hud.setHold(job.work / hold.secs);
        if (job.work >= hold.secs) {
          job.work = 0;
          g.hud.setHold(0);
          this.advanceHold(job);
        }
      } else {
        if (job.work > 0) job.work = 0;
        g.hud.setHold(0);
      }
      return;
    }
    g.hud.setHold(0);
    switch (job.index) {
      case 0:
        if (g.inCar) this.complete();
        break;
      case 1:
      case 3:
        if (near(this.target())) this.complete();
        break;
      case 4:
        if (job.stage === 1 && near(this.target())) this.complete();
        break;
      case 8:
        if (job.stage === 2 && near(this.target())) this.complete();
        break;
      case 5:
      case 6:
      case 7: {
        const t = this.target();
        if (!near(t)) break;
        if (job.index === 5) {
          job.targetIdx += 1;
          if (job.targetIdx >= job.targets.length) this.complete();
          else g.hud.toast(`Checkpoint ${job.targetIdx + 1} of 3`);
        } else if (job.index === 6) {
          job.stage += 1;
          if (job.stage >= 3) this.complete();
          else g.hud.toast(`Drop ${job.stage + 1} of 3`);
        } else {
          job.targetIdx += 1;
          if (job.targetIdx >= job.targets.length) this.complete();
          else g.hud.toast('Client aboard — get them to the docks');
        }
        break;
      }
      case 9:
        if (g.police.stars > 0) this.fail('Spotted by the PD');
        else if (near(this.target())) this.complete();
        break;
      case 10: {
        if (job.fareStage === 0 && near(job.pickup)) {
          job.fareStage = 1;
          g.hud.toast('Passenger aboard — take them to the marker');
          g.audio.blip(760);
        } else if (job.fareStage === 1 && near(job.dropoff)) {
          job.fare += 1;
          g.addCash(250, 'Fare paid: +$250');
          g.audio.chaChing();
          if (job.fare >= 3) {
            this.complete();
            break;
          }
          job.fareStage = 0;
          const [a, b] = farePair();
          job.pickup = a;
          job.dropoff = b;
          g.hud.toast(`Fare ${job.fare} of 3 done — next pickup marked`);
        }
        break;
      }
      case 11:
        if (g.police.heat <= 0 && near(this.target(), 8)) this.complete();
        break;
      default:
        break;
    }
  }

  /** A job done: pay out, advance the story, queue the next job. */
  complete() {
    const job = this.active;
    if (!job) return;
    this.active = null;
    this.index = job.index + 1;
    const g = this.game;
    g.addCash(job.def.reward, `${job.title} complete: +$${job.def.reward.toLocaleString('en-US')}`);
    g.audio.win();
    g.hud.showBanner(job.title, 'Job complete');
    g.hud.setJob('SOLMAR', 'Job done — the next one is coming.');
    g.saveProgress();
    if (this.index >= 12) {
      this.storyDone = true;
      g.hud.showBanner('KINGPIN OF SOLMAR', 'Every job done. The city is yours.');
    } else {
      this.pendingNext = this.index;
      this.pendingAt = g.time + 4;
    }
  }

  /** A job blown: no pay, no progress — the same job comes back around. */
  fail(reason) {
    const job = this.active;
    if (!job) return;
    this.active = null;
    const g = this.game;
    g.audio.lose();
    g.hud.showBanner('JOB FAILED', reason);
    g.hud.setJob(job.title, `Job failed — ${reason}`);
    g.hud.setHold(0);
    this.pendingNext = job.index;
    this.pendingAt = g.time + 4;
  }
}
