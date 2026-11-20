// utils.js — small pure helpers for SOLMAR: math, angles and random picks.
// No game state lives here; every other module imports what it needs.
export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function formatCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function starsText(n) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}
