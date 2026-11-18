// Shared helpers for Palmshade City: a seedable random generator (so ?seed= always builds
// the same city and the screenshot scenes are reproducible), plus the small maths helpers
// every other module reaches for.

let state = 123456789;

/** Seed the shared generator. Call once at boot, before the city is built. */
export function setSeed(n) {
  state = (n >>> 0) || 1;
}

/** Next float in [0, 1) from the shared generator (mulberry32). */
export function nextRandom() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** rand() -> [0,1); rand(a) -> [0,a); rand(a,b) -> [a,b). */
export const rand = (a = 1, b) => (b === undefined ? nextRandom() * a : a + nextRandom() * (b - a));

/** Random integer in [a, b] inclusive. */
export const randi = (a, b) => Math.floor(rand(a, b + 1));

/** Random element of an array. */
export const pick = (arr) => arr[Math.floor(nextRandom() * arr.length) % arr.length];

/** True with probability p. */
export const chance = (p) => nextRandom() < p;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Shortest-path interpolation between two headings. */
export const angleLerp = (a, b, t) => a + wrapAngle(b - a) * clamp(t, 0, 1);

/** Distance between two points on the ground plane. */
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/**
 * Circle (x, z, r) against an axis-aligned box {minX, maxX, minZ, maxZ}.
 * Returns a push-out {x, z, depth} (unit direction plus penetration), or null when clear.
 */
export function circleVsBox(x, z, r, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: dx / d, z: dz / d, depth: r - d };
  }
  // Centre is inside the box: leave by the nearest face.
  const exits = [
    { x: -1, z: 0, depth: x - box.minX + r },
    { x: 1, z: 0, depth: box.maxX - x + r },
    { x: 0, z: -1, depth: z - box.minZ + r },
    { x: 0, z: 1, depth: box.maxZ - z + r },
  ];
  exits.sort((a, b) => a.depth - b.depth);
  return exits[0];
}

/** Format a dollar amount the way the HUD shows it: 1250 -> "$1,250". */
export function formatMoney(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
