// police.js — wanted level, spawn sampling, BFS road routing, slot pursuit, busted meter.

import * as THREE from 'three';
import { Car } from './vehicles.js';
import { ROAD_X, ROAD_Z, clamp, dist2d, angleDiff, nearestIntersection, snapToRoad } from './util.js';

function bfsPath(start, goal) {
  const key = (x, z) => x + ',' + z;
  if (start.x === goal.x && start.z === goal.z) return [goal];
  const prev = new Map();
  const seen = new Set([key(start.x, start.z)]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    const xi = ROAD_X.indexOf(cur.x), zi = ROAD_Z.indexOf(cur.z);
    const ns = [];
    if (xi > 0) ns.push({ x: ROAD_X[xi - 1], z: cur.z });
    if (xi < ROAD_X.length - 1) ns.push({ x: ROAD_X[xi + 1], z: cur.z });
    if (zi > 0) ns.push({ x: cur.x, z: ROAD_Z[zi - 1] });
    if (zi < ROAD_Z.length - 1) ns.push({ x: cur.x, z: ROAD_Z[zi + 1] });
    for (const n of ns) {
      const k = key(n.x, n.z);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, cur);
      if (n.x === goal.x && n.z === goal.z) {
        const path = [n];
        let c = cur;
        while (c) { path.unshift(c); c = prev.get(key(c.x, c.z)); }
        return path;
      }
      queue.push(n);
    }
  }
  return [goal];
}

export class Police {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx; // { city, audio, onBusted, onPoliceShot }
    this.wanted = 0;
    this.units = [];
    this.bustedMeter = 0;
    this.seesPlayer = false;
    this.lastSeenAt = -99;
    this.spawnCd = 0;
    this.pathTimer = 0;
    this.time = 0;
  }

  get stars() { return Math.ceil(this.wanted - 0.001); }

  reportCrime(points) {
    this.wanted = clamp(this.wanted + points, 0, 5);
    this.lastSeenAt = this.time;
  }
  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    if (n > 0) this.lastSeenAt = this.time;
  }
  clear() {
    this.wanted = 0;
    this.bustedMeter = 0;
    for (const u of this.units) this.scene.remove(u.car.group);
    this.units = [];
  }

  // Sample road points 55–95 units from the player; keep the best-scoring.
  _spawnPoint(px, pz) {
    let best = null, bestScore = -Infinity, farthest = null, farthestDist = -1;
    for (let i = 0; i < 28; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 55 + Math.random() * 40;
      const sx = px + Math.sin(ang) * dist;
      const sz = pz + Math.cos(ang) * dist;
      const snapped = snapToRoad(
        clamp(sx, -268, 196),
        clamp(sz, -204, 204)
      );
      const d = dist2d(snapped.x, snapped.z, px, pz);
      if (d > farthestDist) { farthestDist = d; farthest = snapped; }
      if (d < 42 || d > 115) continue;
      // prefer ~75 units away; slight preference for behind the player
      let score = -Math.abs(d - 75);
      if (score > bestScore) { bestScore = score; best = snapped; }
    }
    return best || farthest || { x: px + 70, z: pz };
  }

  _spawnUnit(px, pz) {
    const sp = this._spawnPoint(px, pz);
    this.stageUnit(sp.x, sp.z, Math.atan2(px - sp.x, pz - sp.z));
  }

  // Place a unit at an exact spot (screenshot staging + debug).
  stageUnit(x, z, heading) {
    const car = new Car(this.scene, 'police', 0xf2f2f2, x, z, heading || 0);
    car.driver = 'police';
    car.syncMesh();
    this.units.push({
      car, path: [], wp: 0, repath: Math.random() * 0.5,
      stuckFor: 0, shootCd: Math.random() * 1.2, slotSeed: Math.random() * Math.PI * 2,
    });
    return car;
  }

  update(dt, player, obstacles) {
    this.time += dt;
    const ctx = this.ctx;
    const desired = Math.round(this.wanted);
    this.spawnCd -= dt;

    // spawn / despawn to match wanted
    if (this.units.length < desired && this.spawnCd <= 0) {
      this._spawnUnit(player.x, player.z);
      this.spawnCd = 0.8;
    }
    if (this.units.length > desired) {
      // remove the farthest unit if it is well away; otherwise let it peel off
      let fi = -1, fd = -1;
      this.units.forEach((u, i) => {
        const d = dist2d(u.car.pos.x, u.car.pos.z, player.x, player.z);
        if (d > fd) { fd = d; fi = i; }
      });
      if (fi >= 0 && fd > 55) {
        this.scene.remove(this.units[fi].car.group);
        this.units.splice(fi, 1);
      }
    }

    // who sees the player?
    let nearest = Infinity;
    this.seesPlayer = false;
    for (const u of this.units) {
      const d = dist2d(u.car.pos.x, u.car.pos.z, player.x, player.z);
      if (d < nearest) nearest = d;
      if (d < 58) this.seesPlayer = true;
    }
    if (this.seesPlayer) this.lastSeenAt = this.time;

    // wanted decay when hidden
    if (this.wanted > 0 && this.time - this.lastSeenAt > 6) {
      this.wanted = Math.max(0, this.wanted - dt * 0.05);
      if (this.wanted <= 0.02) { this.wanted = 0; }
    }

    ctx.audio.setSiren(this.units.length ? clamp(1 - nearest / 75, 0, 1) : 0);

    // busted meter
    const playerSlow = player.speed < 2.3;
    if (this.wanted > 0 && nearest < 10.5 && playerSlow) {
      this.bustedMeter = clamp(this.bustedMeter + dt / 2.6, 0, 1);
      if (this.bustedMeter >= 1) {
        this.bustedMeter = 0;
        ctx.onBusted();
        return;
      }
    } else {
      this.bustedMeter = clamp(this.bustedMeter - dt / 1.7, 0, 1);
    }

    const playerNode = nearestIntersection(player.x, player.z);

    this.units.forEach((u, idx) => {
      const car = u.car;
      // repath occasionally
      u.repath -= dt;
      if (u.repath <= 0) {
        u.repath = 0.9 + Math.random() * 0.5;
        const start = nearestIntersection(car.pos.x, car.pos.z);
        u.path = bfsPath(start, playerNode);
        u.wp = 0;
      }
      const distPlayer = dist2d(car.pos.x, car.pos.z, player.x, player.z);
      let tx, tz, arriveRadius = 3.2;
      if (distPlayer < 17) {
        // slot approach: each unit takes a slot around the player
        const ang = u.slotSeed + idx * (Math.PI * 2 / Math.max(1, this.units.length));
        tx = player.x + Math.sin(ang) * 6.5;
        tz = player.z + Math.cos(ang) * 6.5;
        arriveRadius = 1.2;
      } else {
        // follow BFS path waypoints
        while (u.wp < u.path.length - 1 &&
               dist2d(car.pos.x, car.pos.z, u.path[u.wp].x, u.path[u.wp].z) < 9) u.wp++;
        const wp = u.path[Math.min(u.wp, u.path.length - 1)];
        tx = wp ? wp.x : player.x;
        tz = wp ? wp.z : player.z;
        if (u.wp >= u.path.length - 1) { tx = player.x; tz = player.z; }
      }
      // steering
      const desired = Math.atan2(tx - car.pos.x, tz - car.pos.z);
      const diff = angleDiff(car.heading, desired);
      const distT = dist2d(car.pos.x, car.pos.z, tx, tz);
      let targetSpeed = 31;
      if (distT < arriveRadius + 6) targetSpeed = Math.max(2.5, distT * 1.1);
      if (Math.abs(diff) > 1.9) targetSpeed = Math.min(targetSpeed, 5);
      // separation from other units
      for (const o of this.units) {
        if (o === u) continue;
        if (dist2d(car.pos.x, car.pos.z, o.car.pos.x, o.car.pos.z) < 5) targetSpeed = Math.min(targetSpeed, 6);
      }
      car.speed += clamp(targetSpeed - car.speed, -34 * dt, 17 * dt);
      car.heading += clamp(diff, -2.3 * dt, 2.3 * dt);
      let nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
      let nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
      const before = { x: nx, z: nz };
      [nx, nz] = ctx.city.collide(nx, nz, 1.6);
      if (Math.abs(nx - before.x) > 0.4 || Math.abs(nz - before.z) > 0.4) car.speed *= 0.55;
      car.pos.x = clamp(nx, -276, 232);
      car.pos.z = clamp(nz, -206, 206);
      car.syncMesh();
      car.flashLightbar(this.time);

      // stuck recovery: barely moving while far from the player
      if (Math.abs(car.speed) < 0.8 && distPlayer > 18) {
        u.stuckFor += dt;
        if (u.stuckFor > 2.6) {
          const sp = this._spawnPoint(player.x, player.z);
          car.pos.set(sp.x, 0, sp.z);
          car.heading = Math.atan2(player.x - sp.x, player.z - sp.z);
          car.speed = 8;
          u.stuckFor = 0;
          u.repath = 0;
        }
      } else u.stuckFor = 0;

      // shooting at high wanted
      if (this.wanted >= 3.5 && distPlayer < 30 && distPlayer > 5) {
        u.shootCd -= dt;
        if (u.shootCd <= 0) {
          u.shootCd = 1.3 + Math.random() * 0.5;
          const hit = Math.random() < 0.4;
          ctx.onPoliceShot(
            { x: car.pos.x, y: 1.2, z: car.pos.z },
            { x: player.x, y: 1.1, z: player.z },
            hit
          );
        }
      }
    });
  }
}
