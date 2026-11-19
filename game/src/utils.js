// utils.js — small shared helpers for SOLMAR. No game logic lives here,
// just the arithmetic and formatting every other module reaches for.

/** Clamp v into [lo, hi]. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** A random float. rand(10) is [0, 10); rand(4, 9) is [4, 9). */
export function rand(lo, hi) {
  if (hi === undefined) {
    hi = lo;
    lo = 0;
  }
  return lo + Math.random() * (hi - lo);
}

/** A random integer in [lo, hi]. */
export function randi(lo, hi) {
  return Math.floor(rand(lo, hi + 1));
}

/** One random element of an array. */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Flat (x, z) distance between two points. */
export function dist2(x1, z1, x2, z2) {
  return Math.hypot(x2 - x1, z2 - z1);
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Move angle a toward target by at most maxStep radians. */
export function turnToward(a, target, maxStep) {
  const d = wrapAngle(target - a);
  return a + clamp(d, -maxStep, maxStep);
}

/** "$1,500" style money text. */
export function cashText(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** "2:30" style countdown text for a number of seconds. */
export function clockText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
