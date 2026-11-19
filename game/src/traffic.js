// traffic.js — AI traffic: cars follow the road grid (right-hand lanes), brake for obstacles, recycle.

import { Car, randomCarType, CAR_COLORS } from './vehicles.js';
import { ROAD_X, ROAD_Z, rand, choice, clamp, dist2d, angleDiff } from './util.js';

function neighbors(node) {
  const out = [];
  const xi = ROAD_X.indexOf(node.x), zi = ROAD_Z.indexOf(node.z);
  if (xi > 0) out.push({ x: ROAD_X[xi - 1], z: node.z });
  if (xi < ROAD_X.length - 1) out.push({ x: ROAD_X[xi + 1], z: node.z });
  if (zi > 0) out.push({ x: node.x, z: ROAD_Z[zi - 1] });
  if (zi < ROAD_Z.length - 1) out.push({ x: node.x, z: ROAD_Z[zi + 1] });
  return out;
}

function lanePoint(node, dirX, dirZ) {
  // right vector for forward (dirX, dirZ) is (-dirZ, dirX)
  return { x: node.x + -dirZ * 3.4, z: node.z + dirX * 3.4 };
}

export class Traffic {
  constructor(scene, count = 10) {
    this.scene = scene;
    this.cars = [];
    for (let i = 0; i < count; i++) {
      const car = new Car(scene, randomCarType(), choice(CAR_COLORS), 0, 0, 0);
      car.driver = 'traffic';
      const t = { car, from: null, to: null, cruise: rand(10.5, 14), brake: 0 };
      this._newRoute(t, null);
      // scatter along the first segment
      const f = t.fromPt, e = t.toPt;
      const k = rand(0.15, 0.85);
      car.pos.set(f.x + (e.x - f.x) * k, 0, f.z + (e.z - f.z) * k);
      car.heading = Math.atan2(e.x - f.x, e.z - f.z);
      car.syncMesh();
      this.cars.push(t);
    }
  }

  _newRoute(t, nearPos) {
    let from;
    if (t.to) from = t.to;
    else {
      // spawn on a random intersection, optionally near a position
      if (nearPos) {
        let bd = Infinity;
        for (const x of ROAD_X) for (const z of ROAD_Z) {
          const d = dist2d(x, z, nearPos.x, nearPos.z);
          if (d < bd) { bd = d; from = { x, z }; }
        }
      } else {
        from = { x: choice(ROAD_X), z: choice(ROAD_Z) };
      }
    }
    const opts = neighbors(from).filter(n => !t.from || n.x !== t.from.x || n.z !== t.from.z);
    const to = choice(opts.length ? opts : neighbors(from));
    t.from = from; t.to = to;
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    const dirX = dx / len, dirZ = dz / len;
    t.fromPt = lanePoint(from, dirX, dirZ);
    t.toPt = lanePoint(to, dirX, dirZ);
    t.dirX = dirX; t.dirZ = dirZ;
  }

  // Player stole this car: stop managing it.
  claim(car) {
    const i = this.cars.findIndex(t => t.car === car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  update(dt, playerPos, obstacles) {
    for (const t of this.cars) {
      const car = t.car;
      // recycle far-away cars back toward the player
      if (dist2d(car.pos.x, car.pos.z, playerPos.x, playerPos.z) > 300) {
        this._newRoute(t, { x: playerPos.x + rand(-140, 140), z: playerPos.z + rand(-140, 140) });
        car.pos.set(t.fromPt.x, 0, t.fromPt.z);
        car.heading = Math.atan2(t.dirX, t.dirZ);
        car.speed = t.cruise;
        car.syncMesh();
      }
      // obstacle braking: anything within 8 ahead in our lane
      let blocked = false;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      for (const o of obstacles) {
        if (o === car) continue;
        const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
        const ahead = dx * fx + dz * fz;
        if (ahead > 0 && ahead < 8.5) {
          const lat = Math.abs(dx * -fz + dz * fx);
          if (lat < 2.3) { blocked = true; break; }
        }
      }
      const targetSpeed = blocked ? 0 : t.cruise;
      car.speed += clamp(targetSpeed - car.speed, -22 * dt, 7 * dt);
      // steer toward the lane point ahead; near the end of the segment, aim at the next one
      const distToEnd = dist2d(car.pos.x, car.pos.z, t.toPt.x, t.toPt.z);
      let aimX = t.toPt.x, aimZ = t.toPt.z;
      if (distToEnd < 9) {
        // peek next segment direction for a smoother corner
        aimX = t.toPt.x + t.dirX * 9; aimZ = t.toPt.z + t.dirZ * 9;
      }
      const desired = Math.atan2(aimX - car.pos.x, aimZ - car.pos.z);
      const diff = angleDiff(car.heading, desired);
      car.heading += clamp(diff, -1.9 * dt, 1.9 * dt);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      car.syncMesh();
      if (distToEnd < 4.5) this._newRoute(t, null);
    }
  }
}
