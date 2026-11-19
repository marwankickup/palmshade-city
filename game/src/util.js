// Shared helpers: seeded RNG, math, city layout constants, collision helpers.

// Deterministic RNG so ?seed=1 staging is reproducible.
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Shortest-angle interpolation for headings.
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

// ---- City layout (single source of truth) ----
// Roads run along these center lines; blocks sit between them.
export const V_ROADS = [-168, -98, -28, 42, 112]; // north-south roads (constant x)
export const H_ROADS = [-140, -70, 0, 70, 140];   // east-west roads (constant z)
export const ROAD_W = 14;
export const BLOCK = 56;                          // block face size
export const BEACH_X = 126;                       // sand starts east of Ocean Drive
export const WATER_X = 178;                       // ocean starts
export const WORLD = { minX: -202, maxX: 260, minZ: -182, maxZ: 182 };

export function intersections() {
  const pts = [];
  for (const x of V_ROADS) for (const z of H_ROADS) pts.push({ x, z });
  return pts;
}
export function nearestRoadPoint(x, z) {
  // Nearest point on any road center line.
  let best = { x, z, d: Infinity };
  for (const rx of V_ROADS) {
    const d = Math.abs(x - rx);
    if (d < best.d) best = { x: rx, z, d };
  }
  for (const rz of H_ROADS) {
    const d = Math.abs(z - rz);
    if (d < best.d) best = { x, z: rz, d };
  }
  return best;
}
export function nearestIntersection(x, z) {
  let best = null, bd = Infinity;
  for (const ix of V_ROADS) for (const iz of H_ROADS) {
    const d = Math.hypot(x - ix, z - iz);
    if (d < bd) { bd = d; best = { x: ix, z: iz }; }
  }
  return best;
}

// Circle vs AABB colliders: push `pos` ({x,z}) out; returns impact speed factor (0 = no hit).
export function collideCircle(pos, radius, colliders) {
  let hit = 0;
  for (const c of colliders) {
    const nx = clamp(pos.x, c.minX, c.maxX);
    const nz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Center inside the box: push out along the smallest penetration axis.
        const pl = pos.x - c.minX, pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
      hit = 1;
    }
  }
  return hit;
}

// Platforms are walkable raised surfaces (pier deck, café terrace, crate stacks).
// Returns the standing height at (x,z): highest platform top reachable from currentY.
export function groundHeightAt(platforms, x, z, currentY) {
  let g = 0;
  for (const p of platforms) {
    if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
      if (p.top <= currentY + 1.35 && p.top > g) g = p.top;
    }
  }
  return g;
}

export function aabb(x, z, w, d, pad = 0) {
  return { minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad };
}
