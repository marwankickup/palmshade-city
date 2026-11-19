// traffic.js — AI traffic following the road grid with lane offsets, braking, recycling.
import { roadPath, snapToRoad, wrapAngle, clamp, mulberry32 } from './util.js';
import { createCar } from './vehicles.js';

const rng = mulberry32(90210);
const TYPES = ['sedan', 'sport', 'convertible', 'pickup', 'van'];
function randomRoadPoint() {
  const roads = [-180, -120, -60, 0, 60, 120, 180];
  const vertical = rng() < 0.5;
  const r = roads[(rng() * 7) | 0];
  const a = -195 + rng() * 390;
  return vertical ? { x: r, z: a } : { x: a, z: r };
}
export function driveToward(car, tx, tz, dt, cruise = 1) {
  const p = car.group.position;
  const dx = tx - p.x, dz = tz - p.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  const err = wrapAngle(desired - car.heading);
  const steer = clamp(err * 1.7, -1, 1);
  let throttle = cruise;
  if (Math.abs(err) > 1.15) throttle = 0.25;
  if (dist < 3.2) throttle = Math.min(throttle, 0.3);
  car.update(dt, throttle, steer);
  return dist;
}
export class Traffic {
  constructor(scene, count = 9) {
    this.scene = scene; this.enabled = true;
    this.units = [];
    for (let i = 0; i < count; i++) {
      const s = randomRoadPoint();
      const car = createCar(scene, TYPES[(rng() * TYPES.length) | 0], s.x, s.z, rng() * 6.28);
      car.driver = 'traffic';
      const u = { car, path: null, wi: 0, cruise: 0.5 + rng() * 0.25 };
      this._newRoute(u);
      this.units.push(u);
    }
  }
  _newRoute(u) {
    const p = u.car.group.position;
    const dest = randomRoadPoint();
    u.path = roadPath({ x: p.x, z: p.z }, dest);
    u.wi = 0;
  }
  update(dt, playerPos, allCars) {
    if (!this.enabled) { for (const u of this.units) u.car.update(dt, 0, 0); return; }
    for (const u of this.units) {
      const car = u.car, p = car.group.position;
      // a car the player is driving (or stole and parked) is no longer traffic
      if (car.driver !== 'traffic') { car.update(dt, 0, 0); continue; }
      // recycle far-away traffic toward the player
      if (Math.hypot(p.x - playerPos.x, p.z - playerPos.z) > 265) {
        const s = snapToRoad(playerPos.x + (rng() - 0.5) * 260, playerPos.z + (rng() - 0.5) * 260);
        p.set(s.x, 0, s.z); car.heading = (rng() * 4 | 0) * Math.PI / 2;
        this._newRoute(u);
      }
      if (!u.path || u.wi >= u.path.length) this._newRoute(u);
      const wp = u.path[u.wi];
      // lane offset: right-hand side of travel direction
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const tx = wp.x + fz * 3.0, tz = wp.z - fx * 3.0;
      // obstacle braking: anything slow/stopped ahead
      let throttleMul = 1;
      for (const other of allCars) {
        if (other === car) continue;
        const o = other.group.position;
        const ahead = (o.x - p.x) * fx + (o.z - p.z) * fz;
        const side = Math.abs((o.x - p.x) * fz - (o.z - p.z) * fx);
        if (ahead > 0 && ahead < 10 && side < 2.4) {
          throttleMul = ahead < 5.5 ? -0.7 : 0.05;
          break;
        }
      }
      const dist = driveToward(car, tx, tz, dt, u.cruise * (throttleMul < 0 ? 0 : throttleMul));
      if (throttleMul < 0 && car.speed > 1) car.update(dt, -0.8, 0);
      if (dist < 4.5) { u.wi++; if (u.wi >= u.path.length) this._newRoute(u); }
    }
  }
}
