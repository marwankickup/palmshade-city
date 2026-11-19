// police.js — wanted system: witness-based crimes, road spawns scored by route distance,
// BFS pursuit with surround slots, BUSTED meter, decay, gunfire at high wanted.
import { Car, driveToward } from './vehicles.js';
import { ROADS, clamp, dist2d, roadPath, routeDist } from './util.js';

export class Police {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders;
    this.units = []; this.wanted = 0;
    this.bustedMeter = 0; this.spawnTimer = 0;
    this.seenTimer = 0; this.decayTimer = 0;
    this.onBusted = null; this.onShootPlayer = null;
    this.shootTimers = new Map();
  }
  desiredUnits() { return this.wanted <= 0 ? 0 : Math.min(1 + this.wanted, 6); }

  addWanted(n) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    if (this.wanted > before) this.seenTimer = 0;
    return this.wanted;
  }
  setWanted(n) { this.wanted = clamp(n, 0, 5); if (n > 0) this.seenTimer = 0; }

  spawnSpot(px, pz, rng) {
    // sample intersections; score by grid-route distance, prefer the 55–95 band
    let best = null, bestScore = -Infinity, far = null, farDist = -1;
    for (let i = 0; i < ROADS.length; i++) for (let j = 0; j < ROADS.length; j++) {
      const x = ROADS[i], z = ROADS[j];
      const rd = routeDist(x, z, px, pz);
      if (rd > farDist) { farDist = rd; far = { x, z, i, j }; }
      if (rd >= 50 && rd <= 105) {
        const score = -Math.abs(rd - 76) + rng.range(0, 6);
        if (score > bestScore) { bestScore = score; best = { x, z, i, j }; }
      }
    }
    const s = best || far || { x: 0, z: 0, i: 2, j: 2 };
    // heading aligned to a road direction (toward the player, roughly)
    const heading = Math.abs(px - s.x) > Math.abs(pz - s.z)
      ? (px > s.x ? Math.PI / 2 : -Math.PI / 2)
      : (pz > s.z ? 0 : Math.PI);
    return { x: s.x + rng.range(-2, 2), z: s.z + rng.range(-2, 2), heading };
  }

  spawnUnit(px, pz, rng) {
    const s = this.spawnSpot(px, pz, rng);
    const car = new Car(this.scene, 'interceptor', 0x15181d, s.x, s.z, s.heading);
    car.driver = 'ai'; car.lightsOn = true;
    car.userData = { path: null, wpi: 0, repath: 0, stuckT: 0, slot: this.units.length % 4 };
    this.units.push(car);
    this.shootTimers.set(car, rng.range(0.4, 1.2));
    return car;
  }

  clearAll() {
    for (const u of this.units) this.scene.remove(u.mesh);
    this.units = []; this.wanted = 0; this.bustedMeter = 0; this.shootTimers.clear();
  }
  removeUnit(u) {
    this.scene.remove(u.mesh);
    this.units = this.units.filter(x => x !== u);
    this.shootTimers.delete(u);
  }

  update(dt, t, ctx) {
    const { playerPos, playerSpeed, onFoot, rng } = ctx;
    // spawning
    this.spawnTimer -= dt;
    if (this.units.length < this.desiredUnits() && this.spawnTimer <= 0) {
      this.spawnUnit(playerPos.x, playerPos.z, rng);
      this.spawnTimer = 2.2;
    }
    // trim excess units that are far away when wanted drops
    if (this.units.length > this.desiredUnits()) {
      const far = this.units.find(u => dist2d(u.x, u.z, playerPos.x, playerPos.z) > 60);
      if (far) this.removeUnit(far);
    }
    let nearest = Infinity, anyClose = false, seen = false;
    const slots = [[7, 0], [-7, 0], [0, 7], [0, -7], [6, 6], [-6, -6]];
    for (const u of this.units) {
      const d = dist2d(u.x, u.z, playerPos.x, playerPos.z);
      nearest = Math.min(nearest, d);
      if (d < 60) seen = true;
      if (d < 11) anyClose = true;
      u.lightsOn = this.wanted > 0;
      // pursuit: far → follow road path to the player's intersection; near → surround slot
      let tx, tz, stopAt = 0, speedCap = u.cfg.maxSpeed;
      if (d > 26) {
        // repath only when the player's nearest intersection changes (a timed repath
        // that resets wpi makes units turn back toward the intersection behind them)
        const pk = `${Math.round(playerPos.x / 80)},${Math.round(playerPos.z / 80)}`;
        if (!u.userData.path || u.userData.pKey !== pk) {
          u.userData.path = roadPath(u.x, u.z, playerPos.x, playerPos.z);
          u.userData.wpi = 0; u.userData.pKey = pk;
        }
        const path = u.userData.path;
        while (u.userData.wpi < path.length - 1 && dist2d(u.x, u.z, path[u.userData.wpi].x, path[u.userData.wpi].z) < 9) u.userData.wpi++;
        const wp = path[Math.min(u.userData.wpi, path.length - 1)];
        tx = wp.x; tz = wp.z;
      } else {
        const s = slots[u.userData.slot % slots.length];
        const ca = Math.cos(ctx.playerHeading || 0), sa = Math.sin(ctx.playerHeading || 0);
        tx = playerPos.x + s[0] * ca - s[1] * sa;
        tz = playerPos.z + s[0] * sa + s[1] * ca;
        stopAt = 1.6; speedCap = 24;
      }
      driveToward(u, tx, tz, dt, this.colliders, t, { stopAt, speedCap, slowNear: d < 30 });
      // stuck recovery: barely moving while far from the player → respawn at a fresh spot
      if (Math.abs(u.speed) < 0.8 && d > 16) {
        u.userData.stuckT += dt;
        if (u.userData.stuckT > 3) {
          const s = this.spawnSpot(playerPos.x, playerPos.z, rng);
          u.mesh.position.set(s.x, 0, s.z); u.heading = s.heading; u.speed = 0;
          u.userData.path = null; u.userData.stuckT = 0;
        }
      } else u.userData.stuckT = 0;
      // gunfire at high wanted
      if (this.wanted >= 4 && d < 40 && d > 6) {
        let st = (this.shootTimers.get(u) || 1) - dt;
        if (st <= 0) {
          st = rng.range(0.7, 1.3);
          if (this.onShootPlayer) this.onShootPlayer(u, clamp(1 - d / 55, 0.25, 0.8));
        }
        this.shootTimers.set(u, st);
      }
      // ramming damage to the player's car is handled by main via proximity checks
      if (ctx.playerCar && u !== ctx.playerCar) {
        const dc = dist2d(u.x, u.z, ctx.playerCar.x, ctx.playerCar.z);
        if (dc < 3.4 && Math.abs(u.speed) > 8 && ctx.playerCar.userData.ramCd <= 0) {
          ctx.playerCar.health -= 4; ctx.playerCar.userData.ramCd = 0.8;
          if (ctx.onRam) ctx.onRam();
        }
      }
    }
    if (ctx.playerCar) ctx.playerCar.userData.ramCd = Math.max(0, (ctx.playerCar.userData.ramCd || 0) - dt);
    // BUSTED meter: a unit close while the player is slow / on foot
    const slowEnough = onFoot ? true : Math.abs(playerSpeed) < 2.2;
    if (this.wanted > 0 && anyClose && slowEnough && nearest < 10.5) {
      this.bustedMeter += dt / 2.1;
    } else {
      this.bustedMeter -= dt / 1.4;
    }
    this.bustedMeter = clamp(this.bustedMeter, 0, 1);
    if (this.bustedMeter >= 1 && this.onBusted) {
      this.bustedMeter = 0;
      this.onBusted();
    }
    // wanted decay when unseen
    if (this.wanted > 0) {
      if (seen) { this.seenTimer = 0; this.decayTimer = 0; }
      else {
        this.seenTimer += dt;
        if (this.seenTimer > 6) {
          this.decayTimer += dt;
          if (this.decayTimer > 5) { this.decayTimer = 0; this.wanted = Math.max(0, this.wanted - 1); }
        }
      }
    }
    return nearest;
  }
}
