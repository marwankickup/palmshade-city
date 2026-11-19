// util.js — shared math, seeded RNG, road grid, BFS road routing, collision registry.
export const ROADS = [-180, -120, -60, 0, 60, 120, 180];
export const ROAD_W = 14;
export const CITY_HALF = 214;      // painted city ground extends to here
export const BEACH_X = 214;        // sand starts
export const WATER_X = 268;        // water starts
export const WORLD_HALF = 340;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function angleLerp(a, b, t) { return a + wrapAngle(b - a) * t; }
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// ---------- collision registry (axis-aligned boxes with a top height) ----------
export const COLLIDERS = [];
export function addCollider(x, z, w, d, h, y0 = 0) {
  const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, y0 };
  COLLIDERS.push(c);
  return c;
}
// Highest walkable top at a point, given the entity's current foot height (step-up rule).
export function groundAt(x, z, feetY = 0) {
  let g = 0;
  for (const c of COLLIDERS) {
    if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) {
      if (c.h <= feetY + 0.9 && c.y0 <= feetY + 0.9 && c.h > g) g = c.h;
    }
  }
  return g;
}
// Push a circle (pos {x,z}, radius r) out of every collider taller than stepHeight.
// Returns the ground height under the resolved position.
export function collide(pos, r, feetY = 0, stepHeight = 0.9) {
  for (const c of COLLIDERS) {
    if (c.h <= feetY + stepHeight) continue; // walkable, not a wall
    if (c.y0 >= feetY + 1.7) continue;       // overhead slab, not a wall
    const nx = clamp(pos.x, c.minX, c.maxX);
    const nz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = pos.x - c.minX, pr = c.maxX - pos.x, pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - r; else if (m === pr) pos.x = c.maxX + r;
        else if (m === pt) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
      }
    }
  }
  return groundAt(pos.x, pos.z, feetY);
}

// ---------- road grid helpers ----------
export function nearestRoadCoord(v) {
  let best = ROADS[0], bd = Infinity;
  for (const r of ROADS) { const d = Math.abs(r - v); if (d < bd) { bd = d; best = r; } }
  return best;
}
export function snapToRoad(x, z) {
  const rx = nearestRoadCoord(x), rz = nearestRoadCoord(z);
  return Math.abs(rx - x) <= Math.abs(rz - z) ? { x: rx, z } : { x, z: rz };
}
export function nearestIntersection(x, z) {
  return { x: nearestRoadCoord(x), z: nearestRoadCoord(z), i: ROADS.indexOf(nearestRoadCoord(x)), j: ROADS.indexOf(nearestRoadCoord(z)) };
}
const key = (i, j) => i * 10 + j;
// BFS over the intersection graph; returns waypoints from a to b travelling on roads.
export function roadPath(a, b) {
  const s = nearestIntersection(a.x, a.z), e = nearestIntersection(b.x, b.z);
  const prev = new Map(); const q = [[s.i, s.j]]; const seen = new Set([key(s.i, s.j)]);
  while (q.length) {
    const [i, j] = q.shift();
    if (i === e.i && j === e.j) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= ROADS.length || nj >= ROADS.length) continue;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      seen.add(k); prev.set(k, key(i, j)); q.push([ni, nj]);
    }
  }
  const pts = [];
  let cur = key(e.i, e.j);
  const chain = [cur];
  while (cur !== key(s.i, s.j)) { cur = prev.get(cur); if (cur === undefined) break; chain.push(cur); }
  chain.reverse();
  for (const k of chain) pts.push({ x: ROADS[Math.floor(k / 10)], z: ROADS[k % 10] });
  pts.push({ x: b.x, z: b.z });
  return pts;
}
export function manhattan(ax, az, bx, bz) { return Math.abs(ax - bx) + Math.abs(az - bz); }
