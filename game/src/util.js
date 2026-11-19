// util.js — seeded RNG, math helpers, and the shared city-grid constants
// every other module navigates by.

export const ROADS_X = [-150, -90, -30, 30, 90, 150]; // north-south avenues
export const ROADS_Z = [-140, -80, -20, 40, 100];     // east-west streets (100 = beachfront boulevard)
export const ROAD_W = 14;
export const SAND_Z = 128;   // sand starts here
export const WATER_Z = 164;  // open water starts here
export const WORLD = { minX: -196, maxX: 196, minZ: -180, maxZ: 228 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(x1, z1, x2, z2) { const dx = x2 - x1, dz = z2 - z1; return Math.sqrt(dx * dx + dz * dz); }
export function randRange(rng, a, b) { return a + rng() * (b - a); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

// Shortest-path angle interpolation.
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Heading convention: forward = (sin h, cos h). h=0 faces +z (south), h=PI faces -z (north).
export function forwardOf(h) { return { x: Math.sin(h), z: Math.cos(h) }; }
export function headingTo(x1, z1, x2, z2) { return Math.atan2(x2 - x1, z2 - z1); }

export function isOnRoad(x, z) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) <= ROAD_W / 2 + 0.5) return true;
  for (const rz of ROADS_Z) if (Math.abs(z - rz) <= ROAD_W / 2 + 0.5) return true;
  return false;
}

export function nearestIntersection(x, z) {
  let bx = ROADS_X[0], bz = ROADS_Z[0], bd = Infinity;
  for (const rx of ROADS_X) for (const rz of ROADS_Z) {
    const d = (x - rx) * (x - rx) + (z - rz) * (z - rz);
    if (d < bd) { bd = d; bx = rx; bz = rz; }
  }
  return { x: bx, z: bz };
}

// Snap a point onto the nearest road centreline (used for police spawns).
export function snapToRoad(x, z) {
  let bx = ROADS_X[0], bd = Infinity;
  for (const rx of ROADS_X) { const d = Math.abs(x - rx); if (d < bd) { bd = d; bx = rx; } }
  let bz = ROADS_Z[0]; bd = Infinity;
  for (const rz of ROADS_Z) { const d = Math.abs(z - rz); if (d < bd) { bd = d; bz = rz; } }
  return Math.abs(x - bx) < Math.abs(z - bz) ? { x: bx, z: clamp(z, -172, 112) } : { x: clamp(x, -178, 178), z: bz };
}

// BFS over the intersection grid: a drivable route from (x1,z1) to (x2,z2)
// as a list of waypoints ending exactly at the destination.
export function roadPath(x1, z1, x2, z2) {
  const s = nearestIntersection(x1, z1), t = nearestIntersection(x2, z2);
  const key = (x, z) => x + ',' + z;
  const prev = new Map(); prev.set(key(s.x, s.z), null);
  const q = [s];
  while (q.length) {
    const n = q.shift();
    if (n.x === t.x && n.z === t.z) break;
    const ix = ROADS_X.indexOf(n.x), iz = ROADS_Z.indexOf(n.z);
    const nbrs = [];
    if (ix > 0) nbrs.push({ x: ROADS_X[ix - 1], z: n.z });
    if (ix < ROADS_X.length - 1) nbrs.push({ x: ROADS_X[ix + 1], z: n.z });
    if (iz > 0) nbrs.push({ x: n.x, z: ROADS_Z[iz - 1] });
    if (iz < ROADS_Z.length - 1) nbrs.push({ x: n.x, z: ROADS_Z[iz + 1] });
    for (const m of nbrs) {
      const k = key(m.x, m.z);
      if (!prev.has(k)) { prev.set(k, n); q.push(m); }
    }
  }
  if (!prev.has(key(t.x, t.z))) return [{ x: x2, z: z2 }];
  const path = [];
  let cur = t;
  while (cur) { path.unshift(cur); cur = prev.get(key(cur.x, cur.z)); }
  path.push({ x: x2, z: z2 });
  return path;
}
