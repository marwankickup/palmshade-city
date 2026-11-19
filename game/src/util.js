// util.js — seeded RNG, math helpers and shared world constants for Palmshade City.

export const TWO_PI = Math.PI * 2;

// Road layout: vertical streets run along z at these x positions,
// horizontal avenues run along x at these z positions.
export const ROAD_X = [-230, -150, -70, 10, 90, 170];
export const ROAD_Z = [-150, -70, 10, 90];
export const ROAD_HALF = 8;            // half width of a road
export const WORLD = { minX: -282, maxX: 330, minZ: -212, maxZ: 212 };
export const BEACH_X = 205;            // sand starts here
export const WATER_X = 238;            // water starts here

let rngState = 1234567;
export function setSeed(seed) {
  rngState = (seed >>> 0) || 1;
}
export function rng() {
  // mulberry32
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function rand(a, b) { return a + rng() * (b - a); }
export function randi(a, b) { return Math.floor(rand(a, b + 1)); }
export function choice(arr) { return arr[Math.floor(rng() * arr.length)]; }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2d(x1, z1, x2, z2) { const dx = x2 - x1, dz = z2 - z1; return Math.hypot(dx, dz); }

// Shortest signed angular difference from a to b, in [-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDiff(a, b) * t; }

// Is point on any road (within the asphalt)?
export function isOnRoad(x, z) {
  for (const rx of ROAD_X) if (Math.abs(x - rx) <= ROAD_HALF) return true;
  for (const rz of ROAD_Z) if (Math.abs(z - rz) <= ROAD_HALF) return true;
  return false;
}

// Nearest intersection (road crossing) to a point.
export function nearestIntersection(x, z) {
  let bx = ROAD_X[0], bz = ROAD_Z[0], bd = Infinity;
  for (const rx of ROAD_X) for (const rz of ROAD_Z) {
    const d = (rx - x) * (rx - x) + (rz - z) * (rz - z);
    if (d < bd) { bd = d; bx = rx; bz = rz; }
  }
  return { x: bx, z: bz };
}

// Snap a point to the nearest road centre line (used for spawns).
export function snapToRoad(x, z) {
  let best = null, bd = Infinity;
  for (const rx of ROAD_X) { const d = Math.abs(x - rx); if (d < bd) { bd = d; best = { x: rx, z }; } }
  for (const rz of ROAD_Z) { const d = Math.abs(z - rz); if (d < bd) { bd = d; best = { x, z: rz }; } }
  return best;
}
