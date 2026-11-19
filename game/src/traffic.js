// traffic.js — ambient AI cars that cruise the road grid: right-hand lane
// offsets, BFS routes between intersections, braking for obstacles ahead,
// and recycling so traffic always lives near the player.

import { Car, CAR_TYPES, driveToward } from './vehicles.js';
import { ROADS_X, ROADS_Z, roadPath, pick, mulberry32 } from './util.js';

const TYPES = ['sedan', 'sedan', 'convertible', 'pickup', 'van', 'sport'];

export class Traffic {
  constructor(scene, rng, count = 11) {
    this.cars = [];
    this.frozen = false;
    this.rng = rng;
    for (let i = 0; i < count; i++) {
      const type = TYPES[i % TYPES.length];
      const color = pick(rng, CAR_TYPES[type].colors);
      const rx = pick(rng, ROADS_X), rz = pick(rng, ROADS_Z);
      const car = new Car(scene, type, color, rx + (rng() - 0.5) * 30, rz, (rng() * 4 | 0) * Math.PI / 2);
      car.traffic = { path: null, wp: 0 };
      this.cars.push(car);
      this.newRoute(car, null);
    }
  }

  newRoute(car, playerPos) {
    let tx, tz;
    if (playerPos && Math.random() < 0.6) {
      tx = pick(this.rng, ROADS_X) + (this.rng() - 0.5) * 40;
      tz = pick(this.rng, ROADS_Z) + (this.rng() - 0.5) * 40;
    } else {
      tx = pick(this.rng, ROADS_X); tz = pick(this.rng, ROADS_Z);
    }
    car.traffic.path = roadPath(car.x, car.z, tx, tz);
    car.traffic.wp = 0;
  }

  update(dt, G) {
    if (this.frozen) return;
    const playerPos = G.player.inVehicle ? G.player.inVehicle.pos : G.player.pos;
    for (const car of this.cars) {
      const dPlayer = Math.hypot(car.x - playerPos.x, car.z - playerPos.z);
      if (dPlayer > 210) { // recycle near the player
        const rx = pick(this.rng, ROADS_X), rz = pick(this.rng, ROADS_Z);
        car.pos.x = Math.max(-180, Math.min(180, playerPos.x + (rx - playerPos.x) * 0.6 + (this.rng() - 0.5) * 30));
        car.pos.z = Math.max(-170, Math.min(105, rz));
        car.speed = 0;
        this.newRoute(car, playerPos);
      }
      const t = car.traffic;
      if (!t.path || t.wp >= t.path.length) this.newRoute(car, playerPos);
      const wp = t.path[Math.min(t.wp, t.path.length - 1)];
      // right-hand lane offset relative to travel direction
      const dx = wp.x - car.x, dz = wp.z - car.z;
      const dl = Math.hypot(dx, dz) || 1;
      const ox = wp.x - (dz / dl) * 3.1, oz = wp.z + (dx / dl) * 3.1; // right-hand lane
      // obstacle scan: anything slow or stopped ahead?
      let blocked = false;
      const f = car.forward();
      const all = [...this.cars, ...G.police.units.map(u => u.car)];
      if (G.player.inVehicle) all.push(G.player.inVehicle);
      for (const o of all) {
        if (o === car) continue;
        const ax = o.x - car.x, az = o.z - car.z;
        const ahead = ax * f.x + az * f.z;
        const side = Math.abs(ax * f.z - az * f.x);
        if (ahead > 0 && ahead < 7.5 && side < 2.1) { blocked = true; break; }
      }
      if (!blocked && !G.player.inVehicle) {
        const ax = G.player.x - car.x, az = G.player.z - car.z;
        const ahead = ax * f.x + az * f.z;
        const side = Math.abs(ax * f.z - az * f.x);
        if (ahead > 0 && ahead < 6.5 && side < 2) blocked = true;
      }
      if (blocked) {
        car.update(dt, { throttle: car.speed > 0.5 ? -0.8 : 0, steer: 0 }, G.city);
      } else {
        const d = driveToward(car, ox, oz, dt, G.city, { speedCap: 12.5, arrive: 2.5 });
        if (d < 4) t.wp++;
      }
    }
  }
}
