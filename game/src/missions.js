// missions.js — Cleo Vane's twelve story jobs, plus the chop-shop where
// Milo sells the cars he steals.

import { Vehicle } from './vehicles.js';

/**
 * The story, in order. startAt is where the job begins; time is the
 * countdown in seconds (0 means no clock); steps are the beats of the job.
 * Step kinds: enterCar, goto, hold, race, escort, taxi, stealth, loseHeat.
 */
export const JOBS = [
  {
    title: 'First Wheels', payout: 400, startAt: { x: 0, z: 120 },
    intro: 'Cleo needs a car and she needs it now. Steal one, bring it to her.',
    steps: [
      { type: 'enterCar', text: 'Steal any car (E)' },
      { type: 'goto', at: { x: -150, z: 108 }, r: 10, text: "Bring the car to Cleo's chop-shop" },
    ],
  },
  {
    title: 'Running Late', payout: 500, startAt: { x: -150, z: -170 }, time: 90,
    intro: 'Cleo is waiting at the bank. Ninety seconds, Milo. Do not be late.',
    steps: [
      { type: 'goto', at: { x: 150, z: -170 }, r: 10, text: 'Reach Solmar Bank before the clock runs out' },
    ],
  },
  {
    title: 'The Shakedown', payout: 650, startAt: { x: 60, z: 60 },
    intro: 'Two shops owe Cleo protection money. Go and remind them.',
    steps: [
      { type: 'hold', at: { x: -150, z: -170 }, r: 8, hold: 2, text: 'Collect from Marina Mart (hold E)' },
      { type: 'hold', at: { x: 60, z: 60 }, r: 8, hold: 2, text: 'Collect from the Neon Strip (hold E)' },
    ],
  },
  {
    title: 'Hot Pursuit', payout: 800, startAt: { x: -60, z: -60 }, time: 150,
    intro: 'Four checkpoints, one clock, no brakes. Show the city how you drive.',
    steps: [
      { type: 'race', points: [{ x: -120, z: -120 }, { x: 60, z: -120 }, { x: 120, z: 60 }, { x: -60, z: 180 }], text: 'Race through the checkpoints' },
    ],
  },
  {
    title: 'The Big Score', payout: 1200, startAt: { x: 150, z: -170 }, time: 300,
    intro: 'The bank vault is soft tonight. Crack it, then vanish.',
    steps: [
      { type: 'hold', at: { x: 150, z: -170 }, r: 8, hold: 4, heat: 300, text: 'Crack the bank vault (hold E)' },
      { type: 'goto', at: { x: -120, z: 222 }, r: 10, text: 'Escape to the docks' },
    ],
  },
  {
    title: 'Neon Grand Prix', payout: 1000, startAt: { x: 120, z: 120 }, time: 180,
    intro: 'Six gates around the Neon Strip. The whole city is watching.',
    steps: [
      { type: 'race', points: [{ x: 120, z: 60 }, { x: 120, z: -60 }, { x: 60, z: -120 }, { x: -60, z: -120 }, { x: -120, z: 0 }, { x: -60, z: 120 }], text: 'Race the Grand Prix circuit' },
    ],
  },
  {
    title: 'Three Drops', payout: 900, startAt: { x: -150, z: -170 }, time: 240,
    intro: 'Three packages, three corners of the city. Do not open them.',
    steps: [
      { type: 'goto', at: { x: 150, z: -170 }, r: 8, text: 'Drop 1 of 3: Coral Heights' },
      { type: 'goto', at: { x: -120, z: 222 }, r: 8, text: 'Drop 2 of 3: the docks' },
      { type: 'goto', at: { x: -150, z: -170 }, r: 8, text: 'Drop 3 of 3: Old Marina' },
    ],
  },
  {
    title: 'The Bodyguard', payout: 1100, startAt: { x: -150, z: -170 },
    intro: 'A friend of Cleo is driving across town. Keep him alive.',
    steps: [
      { type: 'escort', text: 'Stay close to the VIP until he reaches the bank' },
    ],
  },
  {
    title: 'The Marina Heist', payout: 2000, startAt: { x: -90, z: 215 },
    intro: 'The warehouse, then the vault, then gone. Cleo is counting on you.',
    steps: [
      { type: 'hold', at: { x: -90, z: 215 }, r: 8, hold: 3, heat: 150, text: 'Crack the warehouse (hold E)' },
      { type: 'hold', at: { x: 150, z: -170 }, r: 8, hold: 4, heat: 500, text: 'Crack the bank vault (hold E)' },
      { type: 'goto', at: { x: -120, z: 222 }, r: 10, text: 'Escape to the docks' },
    ],
  },
  {
    title: 'Quiet Night', payout: 1500, startAt: { x: -120, z: -120 }, stealth: true,
    intro: 'One quiet job at the bank. If the PD sees you, it is over.',
    steps: [
      { type: 'stealth', at: { x: 150, z: -170 }, r: 8, text: 'Reach the bank without being spotted' },
    ],
  },
  {
    title: 'Night Shift', payout: 600, startAt: { x: 60, z: -60 },
    intro: 'Three fares across Solmar. The meter is running, Milo.',
    steps: [
      { type: 'taxi', text: 'Pick up fares and drop them off' },
    ],
  },
  {
    title: 'The Getaway', payout: 1400, startAt: { x: -120, z: 222 }, heat: 700,
    intro: 'Four stars and a full tank. Lose the heat, then reach the docks.',
    steps: [
      { type: 'loseHeat', text: 'Lose the heat (get to zero stars)' },
      { type: 'goto', at: { x: -120, z: 222 }, r: 10, text: 'Reach the docks' },
    ],
  },
];

export class Story {
  constructor(game) {
    this.game = game;
    this.list = JOBS;
    this.idx = 0;
    this.current = null;
    this.finished = false;
    this.startedIdx = 0;
  }

  get active() {
    return this.current;
  }

  /** Clearing the active job abandons it (used by the playtest probe). */
  set active(v) {
    if (v === null) this.teardown();
  }

  get index() {
    return this.idx;
  }

  get stage() {
    return this.current ? this.current.stage : 0;
  }

  get timer() {
    return this.current ? this.current.timer : 0;
  }

  get storyDone() {
    return this.finished;
  }

  /** Begin job i: teleport Milo to its start and set up its moving parts. */
  start(i) {
    const g = this.game;
    if (i >= JOBS.length) return;
    // Starting a job abandons any job already running (and its VIP car).
    if (this.current) this.teardown();
    const job = JOBS[i];
    this.startedIdx = i;
    if (g.inCar) g.leaveCar();
    g.player.setPosition(job.startAt.x, job.startAt.z, 0);
    g.player.angle = Math.PI;
    const active = {
      job,
      title: job.title,
      stage: 0,
      timer: job.time || 0,
      holdT: 0,
      raceIdx: 0,
      fares: null,
      fare: 0,
      fareStage: 0,
      farT: 0,
      vip: null,
      vipRoute: null,
      vipLeg: 0,
    };
    if (job.heat) g.police.addHeat(job.heat, 'the getaway');
    const step0 = job.steps[0];
    if (step0.type === 'escort') {
      const vip = new Vehicle('sunrunner', g.scene);
      vip.x = -150;
      vip.z = -170;
      vip.angle = Math.PI / 2;
      vip.sync();
      active.vip = vip;
      active.vipRoute = [
        { x: -60, z: -180 }, { x: 60, z: -180 }, { x: 120, z: -180 }, { x: 150, z: -170 },
      ];
      active.vipLeg = 0;
    }
    if (step0.type === 'taxi') {
      active.fares = [];
      for (let f = 0; f < 3; f++) {
        const a = g.city.roadPoint();
        const b = g.city.roadPoint();
        active.fares.push({ pickup: { x: a.x, z: a.z }, dropoff: { x: b.x, z: b.z } });
      }
    }
    this.current = active;
    g.hud.setJob(job.title, job.intro);
    g.hud.showBanner(job.title, job.intro);
    g.audio.blip(660);
  }

  /** Where the next job begins (null when the story is done). */
  nextStartPoint() {
    if (this.finished || this.idx >= JOBS.length) return null;
    return JOBS[this.idx].startAt;
  }

  /** The current objective's map position, or null when idle. */
  target() {
    if (this.current) {
      const step = this.current.job.steps[this.current.stage];
      if (!step) return null;
      if (step.type === 'race') return step.points[Math.min(this.current.raceIdx, step.points.length - 1)];
      if (step.type === 'escort') {
        return this.current.vip ? { x: this.current.vip.x, z: this.current.vip.z } : null;
      }
      if (step.type === 'taxi') {
        const fare = this.current.fares[this.current.fare];
        if (!fare) return null;
        return this.current.fareStage === 0 ? fare.pickup : fare.dropoff;
      }
      if (step.type === 'loseHeat') return { x: -120, z: 222 };
      if (step.type === 'enterCar') {
        const near = this.game.traffic.closestParked(this.game.player.x, this.game.player.z, 400);
        return near ? { x: near.x, z: near.z } : { x: -150, z: 108 };
      }
      return step.at || null;
    }
    return this.nextStartPoint();
  }

  fail(why) {
    const g = this.game;
    if (!this.current) return;
    const title = this.current.title;
    this.teardown();
    g.hud.showBanner('Job failed', `${title} — ${why}`);
    g.audio.lose();
  }

  complete() {
    const g = this.game;
    const job = this.current.job;
    const payout = job.payout;
    this.teardown();
    g.addCash(payout, `Job done: ${job.title} +$${payout}`);
    g.audio.win();
    this.idx = this.startedIdx + 1;
    if (this.idx >= JOBS.length) {
      this.finished = true;
      g.hud.showBanner('Kingpin of Solmar', 'All twelve jobs done. The city is yours, Milo.');
      g.hud.setJob('Story complete', 'Every job for Cleo is done. Solmar is yours.');
    } else {
      const next = JOBS[this.idx];
      g.hud.setJob('Between jobs', `Next: ${next.title} — ${next.intro}`);
    }
    g.saveProgress();
  }

  teardown() {
    if (this.current && this.current.vip) {
      this.game.scene.remove(this.current.vip.group);
      this.current.vip = null;
    }
    this.current = null;
  }

  /** Advance the active job one frame. */
  step(dt) {
    const g = this.game;
    const a = this.current;
    if (!a) return;
    if (a.timer > 0) {
      a.timer -= dt;
      if (a.timer <= 0) {
        a.timer = 0;
        this.fail('Out of time');
        return;
      }
    }
    const step = a.job.steps[a.stage];
    if (!step) {
      this.complete();
      return;
    }
    const px = g.player.x;
    const pz = g.player.z;
    const near = (at, r) => Math.hypot(px - at.x, pz - at.z) < r;
    const advance = () => {
      a.stage += 1;
      a.holdT = 0;
      if (a.stage >= a.job.steps.length) this.complete();
      else g.hud.setJob(a.job.title, a.job.steps[a.stage].text);
    };

    if (step.type === 'enterCar') {
      if (g.inCar) advance();
    } else if (step.type === 'goto') {
      if (near(step.at, step.r)) advance();
    } else if (step.type === 'hold') {
      const onFoot = !g.inCar;
      if (onFoot && near(step.at, step.r) && g.input.eHeld) {
        a.holdT += dt;
        g.hud.setHold(a.holdT / step.hold);
        if (a.holdT >= step.hold) {
          g.hud.setHold(0);
          if (step.heat) g.police.addHeat(step.heat, 'cracking a safe');
          advance();
        }
      } else {
        a.holdT = Math.max(0, a.holdT - dt * 2);
        g.hud.setHold(a.holdT / step.hold);
      }
    } else if (step.type === 'race') {
      const cp = step.points[a.raceIdx];
      if (cp && near(cp, 9)) {
        a.raceIdx += 1;
        g.audio.blip(990);
        g.hud.flash(`Checkpoint ${a.raceIdx} of ${step.points.length}`);
        if (a.raceIdx >= step.points.length) {
          g.bests.bestRace = Math.min(g.bests.bestRace || 999, Math.round((a.job.time || 0) - a.timer));
          advance();
        }
      }
    } else if (step.type === 'escort') {
      const vip = a.vip;
      if (!vip) {
        this.fail('The VIP is gone');
        return;
      }
      const dest = a.vipRoute[a.vipLeg];
      const dx = dest.x - vip.x;
      const dz = dest.z - vip.z;
      const d = Math.hypot(dx, dz);
      if (d < 6) {
        a.vipLeg += 1;
        if (a.vipLeg >= a.vipRoute.length) {
          advance();
          return;
        }
      } else {
        vip.angle = Math.atan2(dx, dz);
        const sp = 13;
        vip.x += Math.sin(vip.angle) * sp * dt;
        vip.z += Math.cos(vip.angle) * sp * dt;
        vip.sync();
      }
      const gap = Math.hypot(px - vip.x, pz - vip.z);
      if (gap > 70) {
        a.farT += dt;
        if (a.farT > 8) {
          this.fail('You lost the VIP');
          return;
        }
      } else {
        a.farT = 0;
      }
    } else if (step.type === 'taxi') {
      const fare = a.fares[a.fare];
      if (!fare) {
        this.complete();
        return;
      }
      if (a.fareStage === 0 && near(fare.pickup, 8)) {
        a.fareStage = 1;
        g.hud.flash('Passenger aboard — take them to the marker');
        g.audio.blip(880);
      } else if (a.fareStage === 1 && near(fare.dropoff, 8)) {
        g.addCash(250, 'Fare paid +$250');
        g.audio.chaChing();
        a.fare += 1;
        a.fareStage = 0;
        if (a.fare >= a.fares.length) {
          advance();
        }
      }
    } else if (step.type === 'stealth') {
      if (g.police.level > 0) {
        this.fail('The PD spotted you');
        return;
      }
      if (near(step.at, step.r)) advance();
    } else if (step.type === 'loseHeat') {
      if (g.police.heat <= 0) advance();
    }
  }

  /** Sell the car Milo is driving to Cleo: 60% of its value, $150 floor. */
  sellStolen() {
    const g = this.game;
    const car = g.playerCar;
    if (!car || !g.inCar) return;
    if (car.key === 'cruiser') {
      g.hud.flash("Cleo won't touch a PD cruiser");
      return;
    }
    const value = car.wrecked ? 150 : Math.max(150, Math.round((car.def.price || 1000) * 0.6));
    g.leaveCar();
    g.traffic.drop(car);
    g.addCash(value, `Sold the ${car.name} to Cleo +$${value}`);
    g.audio.chaChing();
  }
}
