// police.js — the Palmshade PD: a 0–5 star wanted system fed by witnessed
// crimes, interceptors that spawn on roads near the player and route through
// the street grid (BFS) before closing into surround slots, the BUSTED
// meter, wanted decay, and gunfire at high wanted levels.

import { Car, driveToward } from './vehicles.js';
import { roadPath, snapToRoad, clamp } from './util.js';

const CRIME_HEAT = { theft: 1, hitPed: 1, hitCar: 1, gunfire: 1, reckless: 1 };

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.units = []; // { car, path, wp, repath, shootT, slotSeed }
    this.wanted = 0;
    this.bustedMeter = 0;
    this.spawnTimer = 0;
    this.seenTimer = 0;   // time since any unit was close to the player
    this.crimeCooldown = 0;
    this.staged = false;  // screenshot staging: units hold still
    this.onShootAtPlayer = null; // wired by main (tracer + damage)
  }

  get active() { return this.wanted > 0; }

  setWanted(n) {
    this.wanted = clamp(Math.round(n), 0, 5);
    if (this.wanted === 0) this.clearUnits();
  }

  reportCrime(kind, witnessed) {
    if (!witnessed) return;
    if (this.crimeCooldown > 0 && kind === 'hitCar') return;
    this.crimeCooldown = 1.2;
    this.wanted = clamp(this.wanted + (CRIME_HEAT[kind] || 1), 0, 5);
    this.seenTimer = 0;
  }

  clearUnits() {
    for (const u of this.units) u.car.dispose(this.scene);
    this.units = [];
    this.bustedMeter = 0;
  }

  clear() { this.wanted = 0; this.clearUnits(); }

  // Sample candidate road points in a 55–95 ring around the player and keep
  // the best-scoring one (shortest grid route to the player). Falls back to
  // the farthest sample if somehow nothing scored.
  spawnPoint(px, pz) {
    let best = null, bestScore = -Infinity, farthest = null, farD = -1;
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 55 + Math.random() * 40;
      const raw = { x: px + Math.cos(a) * d, z: pz + Math.sin(a) * d };
      const p = snapToRoad(raw.x, raw.z);
      const dist = Math.hypot(p.x - px, p.z - pz);
      if (dist > farD) { farD = dist; farthest = p; }
      if (dist < 38 || dist > 115) continue;
      // score by grid-route (Manhattan) length, not straight-line distance:
      // a point 70 away across a dogleg takes far longer to arrive than one
      // 85 away down a straight avenue.
      const route = Math.abs(p.x - px) + Math.abs(p.z - pz);
      const score = -route + Math.random() * 6;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best || farthest || snapToRoad(px + 70, pz);
  }

  spawnUnit(px, pz) {
    const p = this.spawnPoint(px, pz);
    // face along the road toward the player so the unit never starts
    // nose-first into a building frontage
    const path = roadPath(p.x, p.z, px, pz);
    const aim = path.find(pt => Math.hypot(pt.x - p.x, pt.z - p.z) > 4) || { x: px, z: pz };
    const heading = Math.atan2(aim.x - p.x, aim.z - p.z);
    const car = new Car(this.scene, 'police', 0x1d2733, p.x, p.z, heading);
    this.units.push({ car, path: null, wp: 0, repath: 0, shootT: 1 + Math.random() * 1.5, slotSeed: Math.random() * 6.28, stuckT: 0, lastX: p.x, lastZ: p.z });
  }

  // Place a unit deterministically (screenshot staging + debug).
  stageUnit(x, z, heading) {
    const car = new Car(this.scene, 'police', 0x1d2733, x, z, heading);
    const u = { car, path: null, wp: 0, repath: 0, shootT: 1e9, slotSeed: 0, stuckT: 0, lastX: x, lastZ: z };
    this.units.push(u);
    return u;
  }

  nearestUnitDist(px, pz) {
    let d = Infinity;
    for (const u of this.units) d = Math.min(d, Math.hypot(u.car.x - px, u.car.z - pz));
    return d;
  }

  update(dt, G, t) {
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    const pp = G.player.inVehicle ? G.player.inVehicle.pos : G.player.pos;
    const playerSpeed = G.player.inVehicle ? Math.abs(G.player.inVehicle.speed) : G.player.speedNow;

    for (const u of this.units) u.car.updateLightbar(t);
    if (this.staged) return;

    // maintain unit count: wanted 1..5 -> 2..6 units
    const target = this.wanted === 0 ? 0 : Math.min(6, this.wanted + 1);
    this.spawnTimer -= dt;
    if (this.units.length < target && this.spawnTimer <= 0) {
      this.spawnUnit(pp.x, pp.z);
      this.spawnTimer = 1.6;
    }
    while (this.units.length > target && target > 0) {
      const u = this.units.pop();
      u.car.dispose(this.scene);
    }
    if (this.wanted === 0) { this.bustedMeter = Math.max(0, this.bustedMeter - dt); return; }

    let anyClose = false;
    this.units.forEach((u, idx) => {
      const car = u.car;
      const d = Math.hypot(car.x - pp.x, car.z - pp.z);
      if (d < 55) anyClose = true;

      // stuck recovery: barely moved while trying to drive -> respawn near player
      u.stuckT += dt;
      if (u.stuckT > 4) {
        const moved = Math.hypot(car.x - u.lastX, car.z - u.lastZ);
        if (moved < 4 && d > 18) {
          const p = this.spawnPoint(pp.x, pp.z);
          car.pos.x = p.x; car.pos.z = p.z; car.speed = 0; u.path = null;
          const aim = roadPath(p.x, p.z, pp.x, pp.z).find(pt => Math.hypot(pt.x - p.x, pt.z - p.z) > 4) || pp;
          car.heading = Math.atan2(aim.x - p.x, aim.z - p.z);
        }
        u.lastX = car.x; u.lastZ = car.z; u.stuckT = 0;
      }

      if (d > 30) {
        // route through the grid toward the player
        u.repath -= dt;
        if (!u.path || u.repath <= 0) {
          u.path = roadPath(car.x, car.z, pp.x, pp.z);
          u.wp = 0; u.repath = 1.4;
        }
        const wp = u.path[Math.min(u.wp, u.path.length - 1)];
        const dd = driveToward(car, wp.x, wp.z, dt, G.city, { speedCap: 24, arrive: 3 });
        if (dd < 5 && u.wp < u.path.length - 1) u.wp++;
      } else {
        // final approach: claim a surround slot around the player
        const ang = u.slotSeed + (idx * (Math.PI * 2 / Math.max(3, this.units.length)));
        const sx = pp.x + Math.sin(ang) * 7.5, sz = pp.z + Math.cos(ang) * 7.5;
        driveToward(car, sx, sz, dt, G.city, { speedCap: 14, arrive: 3.5 });
      }

      // gunfire at high wanted
      if (this.wanted >= 4) {
        u.shootT -= dt;
        if (u.shootT <= 0 && d < 42) {
          u.shootT = 0.8 + Math.random() * 0.7;
          if (this.onShootAtPlayer) this.onShootAtPlayer(car);
        }
      }
    });

    // BUSTED meter: a unit close while the player is slow or on foot
    const nd = this.nearestUnitDist(pp.x, pp.z);
    if (nd < 10.5 && playerSpeed < 2.6) {
      this.bustedMeter = Math.min(1, this.bustedMeter + dt / 2.4);
      if (this.bustedMeter >= 1) G.onBusted();
    } else {
      this.bustedMeter = Math.max(0, this.bustedMeter - dt / 1.7);
    }

    // wanted decay when nobody is close
    if (anyClose) this.seenTimer = 0; else this.seenTimer += dt;
    if (this.seenTimer > 13 && this.wanted > 0) {
      this.wanted--;
      this.seenTimer = 0;
      if (this.wanted === 0) this.clearUnits();
    }
  }
}
