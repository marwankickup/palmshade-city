// util.js — shared helpers for Palmshade City: seeded RNG, math, the road grid
// that traffic/police/missions all agree on, and AABB collision resolution.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const lerpAngle = (a, b, t) => a + angleDelta(a, b) * clamp(t, 0, 1);
export const dist2 = (x1, z1, x2, z2) => Math.hypot(x2 - x1, z2 - z1);

// ---------------------------------------------------------------------------
// Road grid. Vertical roads run along z at ROAD_XS, horizontal along x at
// ROAD_ZS. The coast is east: sand from x=132, water from x=176.
// ---------------------------------------------------------------------------
export const ROAD_W = 16;
export const ROAD_XS = [-240, -180, -120, -60, 0, 60, 120];
export const ROAD_ZS = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
export const WORLD = { minX: -264, maxX: 264, minZ: -264, maxZ: 264 };
export const BEACH_X = 132;   // sand starts
export const WATER_X = 176;   // open water starts

export function nearestOf(list, v) {
  let best = list[0], bd = Infinity;
  for (const x of list) { const d = Math.abs(x - v); if (d < bd) { bd = d; best = x; } }
  return best;
}
export const nearestRoadX = (x) => nearestOf(ROAD_XS, x);
export const nearestRoadZ = (z) => nearestOf(ROAD_ZS, z);

export function isOnRoad(x, z) {
  const hw = ROAD_W / 2 + 1.5;
  return Math.abs(x - nearestRoadX(x)) < hw || Math.abs(z - nearestRoadZ(z)) < hw;
}

export function nearestIntersection(x, z) {
  const rx = nearestRoadX(x), rz = nearestRoadZ(z);
  return { x: rx, z: rz, xi: ROAD_XS.indexOf(rx), zi: ROAD_ZS.indexOf(rz) };
}

// BFS over the intersection graph; returns a list of {x, z} waypoints from the
// intersection nearest (fx, fz) to the one nearest (tx, tz), inclusive.
export function gridPath(fx, fz, tx, tz) {
  const a = nearestIntersection(fx, fz), b = nearestIntersection(tx, tz);
  const key = (xi, zi) => xi + ',' + zi;
  const prev = new Map(), seen = new Set([key(a.xi, a.zi)]);
  const queue = [[a.xi, a.zi]];
  while (queue.length) {
    const [xi, zi] = queue.shift();
    if (xi === b.xi && zi === b.zi) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = xi + dx, nz = zi + dz;
      if (nx < 0 || nz < 0 || nx >= ROAD_XS.length || nz >= ROAD_ZS.length) continue;
      const k = key(nx, nz);
      if (seen.has(k)) continue;
      seen.add(k); prev.set(k, key(xi, zi)); queue.push([nx, nz]);
    }
  }
  const path = [];
  let cur = key(b.xi, b.zi);
  if (!seen.has(cur)) return [{ x: b.x, z: b.z }];
  while (cur) {
    const [xi, zi] = cur.split(',').map(Number);
    path.push({ x: ROAD_XS[xi], z: ROAD_ZS[zi] });
    cur = prev.get(cur);
  }
  path.reverse();
  return path;
}

// Push a circle (x, z, r) out of every AABB in `boxes` ({minX,maxX,minZ,maxZ}).
// Returns true if any box was hit. Mutates the passed point object.
export function collideAABBs(p, r, boxes) {
  let hit = false;
  for (const b of boxes) {
    const nx = clamp(p.x, b.minX, b.maxX), nz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - nx, dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r;
    } else {
      // centre inside the box: push out along the smallest penetration axis
      const pl = p.x - b.minX, pr = b.maxX - p.x, pt = p.z - b.minZ, pb = b.maxZ - p.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) p.x = b.minX - r; else if (m === pr) p.x = b.maxX + r;
      else if (m === pt) p.z = b.minZ - r; else p.z = b.maxZ + r;
    }
  }
  return hit;
}

// Ground height from walkable platforms ({minX,maxX,minZ,maxZ,h}); 0 elsewhere.
export function platformHeightAt(x, z, platforms) {
  let h = 0;
  for (const p of platforms) {
    if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && p.h > h) h = p.h;
  }
  return h;
}

export const fmtMoney = (n) => '$' + Math.max(0, Math.round(n)).toLocaleString('en-US');
