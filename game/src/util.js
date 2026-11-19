// util.js — seeded RNG, math helpers, city grid constants, road routing, collision helpers.
export const ROADS = [-160, -80, 0, 80, 160];
export const ROAD_W = 16;
export const WORLD = { minX: -240, maxX: 288, minZ: -240, maxZ: 240 };
export const SAND_X = 206;
export const WATER_X = 238;

export function makeRng(seed) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export const angleLerp = (a, b, t) => a + wrapAngle(b - a) * t;

function nearestRoad(v) {
  let best = ROADS[0], bd = Infinity;
  for (const r of ROADS) { const d = Math.abs(v - r); if (d < bd) { bd = d; best = r; } }
  return best;
}

// Snap a point onto the nearest road centreline.
export function snapToRoad(x, z) {
  const rx = nearestRoad(x), rz = nearestRoad(z);
  if (Math.abs(x - rx) < Math.abs(z - rz)) return { x: rx, z, vertical: true };
  return { x, z: rz, vertical: false };
}

export function nearestIntersection(x, z) {
  const rx = nearestRoad(x), rz = nearestRoad(z);
  return { x: rx, z: rz, i: ROADS.indexOf(rx), j: ROADS.indexOf(rz) };
}

// BFS over the intersection graph; returns waypoints (intersection centres) ending at the
// intersection nearest b, then b itself.
export function roadPath(ax, az, bx, bz) {
  const start = nearestIntersection(ax, az), goal = nearestIntersection(bx, bz);
  const key = (i, j) => i * 10 + j;
  const prev = new Map(); const seen = new Set([key(start.i, start.j)]);
  const q = [[start.i, start.j]];
  while (q.length) {
    const [i, j] = q.shift();
    if (i === goal.i && j === goal.j) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= ROADS.length || nj >= ROADS.length) continue;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      seen.add(k); prev.set(k, key(i, j)); q.push([ni, nj]);
    }
  }
  const pts = [];
  let k = key(goal.i, goal.j);
  const chain = [k];
  while (k !== key(start.i, start.j) && prev.has(k)) { k = prev.get(k); chain.push(k); }
  chain.reverse();
  for (const c of chain) pts.push({ x: ROADS[Math.floor(c / 10)], z: ROADS[c % 10] });
  pts.push({ x: bx, z: bz });
  return pts;
}

// Manhattan route distance along the grid between two points.
export function routeDist(ax, az, bx, bz) {
  const a = snapToRoad(ax, az), b = snapToRoad(bx, bz);
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(ax - a.x) + Math.abs(az - a.z) + Math.abs(bx - b.x) + Math.abs(bz - b.z);
}

// Push a circle (pos {x,z}) out of AABB colliders taller than maxStep. Returns true on hit.
export function collideCircle(pos, radius, colliders, maxStep = 0) {
  let hit = false;
  for (const c of colliders) {
    if (c.h <= maxStep) continue;
    const nx = clamp(pos.x, c.minX, c.maxX), nz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius; pos.z = nz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = pos.x - c.minX, pr = c.maxX - pos.x, pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius; else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius; else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

// Highest platform top at (x,z) that the entity can step onto from curY (step-up 0.95).
export function groundYAt(platforms, x, z, curY) {
  let g = 0;
  for (const p of platforms) {
    if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
      if (p.topY <= curY + 0.95 && p.topY > g) g = p.topY;
    }
  }
  return g;
}
