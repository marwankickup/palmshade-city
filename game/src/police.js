// Wanted system + police pursuit. Crimes raise the wanted level (witness rules
// live in main). Police route across the intersection grid (BFS) until close,
// then fan into slots around the player. Standing close to a slow/on-foot
// player fills the BUSTED meter; at high wanted they shoot.
import { Car } from './vehicles.js';
import { steerToward } from './traffic.js';
import { V_ROADS, H_ROADS, angleDiff, clamp, dist2d, nearestIntersection } from './util.js';

const CRIME_LEVEL = { theft: 1, hitCar: 1, reckless: 1, hitPed: 2, shot: 2, shotHit: 3 };

function nodeKey(x, z) { return `${x},${z}`; }
function bfsPath(from, to) {
  if (from.x === to.x && from.z === to.z) return [to];
  const prev = new Map();
  const seen = new Set([nodeKey(from.x, from.z)]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    const i = V_ROADS.indexOf(cur.x), j = H_ROADS.indexOf(cur.z);
    const nbs = [];
    if (i > 0) nbs.push({ x: V_ROADS[i - 1], z: cur.z });
    if (i < V_ROADS.length - 1) nbs.push({ x: V_ROADS[i + 1], z: cur.z });
    if (j > 0) nbs.push({ x: cur.x, z: H_ROADS[j - 1] });
    if (j < H_ROADS.length - 1) nbs.push({ x: cur.x, z: H_ROADS[j + 1] });
    for (const n of nbs) {
      const k = nodeKey(n.x, n.z);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, cur);
      if (n.x === to.x && n.z === to.z) {
        const path = [n];
        let c = cur;
        while (c) { path.unshift(c); c = prev.get(nodeKey(c.x, c.z)); }
        return path;
      }
      queue.push(n);
    }
  }
  return [to];
}

export class PoliceSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.cars = [];
    this.wanted = 0;
    this.bustedMeter = 0;
    this.lastSeenT = 99;      // seconds since a unit last saw the player
    this.decayT = 0;
    this.shootT = 0;
    this.onBusted = null;     // callback
    this.onShootPlayer = null; // callback(damage)
  }

  reportCrime(kind, levelOverride = null) {
    const lvl = levelOverride !== null ? levelOverride : (CRIME_LEVEL[kind] || 1);
    if (lvl > this.wanted) this.wanted = Math.min(5, lvl);
    if (this.wanted > 0) { this.lastSeenT = 0; this.decayT = 0; }
  }

  addHeat(levels) {
    this.wanted = clamp(this.wanted + levels, 0, 5);
    this.lastSeenT = 0; this.decayT = 0;
  }

  clearWanted() {
    this.wanted = 0;
    this.bustedMeter = 0;
    this.lastSeenT = 99;
  }

  desiredCount() {
    return this.wanted === 0 ? 0 : Math.min(2 + this.wanted, 6);
  }

  _spawnUnit(playerPos) {
    // spawn at an intersection 105-175 away, preferably out of the player's view
    const options = [];
    for (const x of V_ROADS) for (const z of H_ROADS) {
      const d = dist2d(x, z, playerPos.x, playerPos.z);
      if (d > 100 && d < 185) options.push({ x, z });
    }
    const spot = options.length ? options[(this.rng() * options.length) | 0] : { x: V_ROADS[0], z: H_ROADS[0] };
    const car = new Car(this.scene, 'police', 0xf2f2f0, spot.x, spot.z, 0);
    car.occupiedBy = 'police';
    car.userData_ai = { path: [], pathIdx: 0, repathT: 0, slotSeed: this.rng() * Math.PI * 2 };
    this.cars.push(car);
    return car;
  }

  _removeUnit(car) {
    this.scene.remove(car.group);
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  update(dt, ctx) {
    const { player, playerCar, colliders, t } = ctx;
    const playerPos = player.pos;
    const playerSpeed = player.mode === 'car' && playerCar ? Math.abs(playerCar.speed) : player.speedNow;

    // spawn / despawn to match the wanted level
    const want = this.desiredCount();
    while (this.cars.length < want) this._spawnUnit(playerPos);
    while (this.cars.length > want) {
      // remove the farthest unit first
      let far = null, fd = -1;
      for (const c of this.cars) {
        const d = dist2d(c.pos.x, c.pos.z, playerPos.x, playerPos.z);
        if (d > fd) { fd = d; far = c; }
      }
      this._removeUnit(far);
    }

    let anySee = false;
    let nearest = Infinity;
    const n = this.cars.length;
    this.cars.forEach((car, idx) => {
      const ai = car.userData_ai;
      const d = dist2d(car.pos.x, car.pos.z, playerPos.x, playerPos.z);
      nearest = Math.min(nearest, d);
      if (d < 58) anySee = true;

      if (d > 46) {
        // route across the grid toward the player's nearest intersection
        ai.repathT -= dt;
        if (ai.repathT <= 0 || ai.pathIdx >= ai.path.length) {
          const from = nearestIntersection(car.pos.x, car.pos.z);
          const to = nearestIntersection(playerPos.x, playerPos.z);
          ai.path = bfsPath(from, to);
          ai.pathIdx = ai.path.length > 1 ? 1 : 0;
          ai.repathT = 1.2;
        }
        const wp = ai.path[Math.min(ai.pathIdx, ai.path.length - 1)];
        if (wp) {
          const fx = wp.x - car.pos.x, fz = wp.z - car.pos.z;
          const fl = Math.hypot(fx, fz) || 1;
          const tx = wp.x + (-fz / fl) * 2.3, tz = wp.z + (fx / fl) * 2.3;
          const dist = steerToward(car, tx, tz, 1, 0, dt);
          if (dist < 8 && ai.pathIdx < ai.path.length - 1) ai.pathIdx++;
        }
      } else {
        // slot pursuit: fan around the player, then close in
        const ang = ai.slotSeed + (idx / Math.max(1, n)) * Math.PI * 2 + t * 0.05;
        const slotDist = playerSpeed > 6 ? 13 : 7.5;
        const sx = playerPos.x + Math.sin(ang) * slotDist;
        const sz = playerPos.z + Math.cos(ang) * slotDist;
        const dist = steerToward(car, sx, sz, 1, 0, dt);
        // close-quarters: if basically on the slot and player slow, nose in
        if (dist < 3 && d > 4.5) steerToward(car, playerPos.x, playerPos.z, 0.6, 0, dt);
        if (d < 4.2) { car.input.throttle = 0; car.input.brake = car.speed > 0.5; }
      }
      // stuck recovery: barely moving while throttling → respawn at a mid-range intersection
      if (Math.abs(car.speed) < 0.6 && car.input.throttle > 0) {
        ai.stuckT = (ai.stuckT || 0) + dt;
        if (ai.stuckT > 3.5) {
          ai.stuckT = 0;
          const spot = nearestIntersection(playerPos.x + (this.rng() - 0.5) * 130, playerPos.z + (this.rng() - 0.5) * 130);
          car.pos.set(spot.x, 0, spot.z);
          car.speed = 0;
          ai.path = []; ai.pathIdx = 0;
        }
      } else ai.stuckT = 0;

      car.update(dt, colliders, t);
    });

    // ---- wanted decay: hidden long enough, the heat cools one star at a time
    if (anySee) { this.lastSeenT = 0; this.decayT = 0; }
    else if (this.wanted > 0) {
      this.lastSeenT += dt;
      if (this.lastSeenT > 9) {
        this.decayT += dt;
        if (this.decayT > 8) {
          this.decayT = 0;
          this.wanted = Math.max(0, this.wanted - 1);
          if (this.wanted === 0) this.bustedMeter = 0;
        }
      }
    }

    // ---- busted meter
    const slowOrFoot = player.mode === 'foot' || playerSpeed < 2.6;
    if (this.wanted > 0 && slowOrFoot && nearest < 9.5) {
      this.bustedMeter = Math.min(1, this.bustedMeter + dt / 2.6);
      if (this.bustedMeter >= 1 && this.onBusted) {
        this.bustedMeter = 0;
        this.onBusted();
      }
    } else {
      this.bustedMeter = Math.max(0, this.bustedMeter - dt / 1.7);
    }

    // ---- shooting at high wanted
    this.shootT -= dt;
    if (this.wanted >= 4 && this.shootT <= 0 && nearest < 36 && this.onShootPlayer) {
      this.shootT = 1.3;
      this.onShootPlayer(player.mode === 'car' ? 2.2 : 5.5);
    }

    return { nearest, anySee };
  }

  sirenLevel() {
    if (!this.cars.length) return 0;
    return 1;
  }
}
