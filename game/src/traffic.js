// traffic.js — AI traffic: lane following with offsets, intersection turns, braking, recycling.
import { Car, driveToward } from './vehicles.js';
import { ROADS, clamp, dist2d, roadPath } from './util.js';

const TYPES = ['sedan', 'sedan', 'sport', 'convertible', 'pickup', 'van'];

export class Traffic {
  constructor(scene, rng, colliders) {
    this.colliders = colliders;
    this.cars = [];
    for (let i = 0; i < 11; i++) {
      const type = TYPES[i % TYPES.length];
      const color = rng.pick(CAR_TYPES_COLORS[type]);
      const rx = rng.pick(ROADS), rz = rng.pick(ROADS);
      const vertical = rng.chance(0.5);
      const x = vertical ? rx + 3.4 : rx + rng.range(-90, 90);
      const z = vertical ? rz + rng.range(-90, 90) : rz + 3.4;
      const heading = vertical ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
      const car = new Car(scene, type, color, clamp(x, -230, 230), clamp(z, -230, 230), heading);
      car.driver = 'ai';
      car.userData = { path: null, wpi: 0, laneOff: 3.4 };
      this.cars.push(car);
    }
    // parked cars along kerbs
    this.parked = [];
    const parkedSpots = [
      [86, -30, Math.PI / 2, 'sedan'], [86, 46, Math.PI / 2, 'pickup'], [-6, 88, 0, 'sport'],
      [-86, -140, Math.PI, 'sedan'], [166, 60, 0, 'convertible'], [166, -120, Math.PI, 'sedan'],
      [-166, 30, 0, 'van'], [40, 166, -Math.PI / 2, 'sedan'], [-120, -6, Math.PI / 2, 'sport'],
      [6, -88, Math.PI, 'pickup'], [-160, -166, Math.PI / 2, 'sedan'], [74, 160, 0, 'convertible'],
    ];
    for (const [x, z, h, type] of parkedSpots) {
      const car = new Car(scene, type, rng.pick(CAR_TYPES_COLORS[type]), x, z, h);
      car.parked = true;
      this.parked.push(car);
    }
  }

  retarget(car, rng) {
    const tx = rng.pick(ROADS) + rng.range(-30, 30), tz = rng.pick(ROADS) + rng.range(-30, 30);
    car.userData.path = roadPath(car.x, car.z, tx, tz);
    car.userData.wpi = 0;
  }

  update(dt, t, ctx) {
    const rng = ctx.rng;
    for (const car of this.cars) {
      if (car.driver === 'player' || car.dead) continue;
      // recycle far cars to keep the player's neighbourhood alive
      const dp = dist2d(car.x, car.z, ctx.focus.x, ctx.focus.z);
      if (dp > 300) {
        const rx = ctx.focus.x + rng.range(-140, 140), rz = ctx.focus.z + rng.range(-140, 140);
        const s = { x: clamp(rx, -230, 230), z: clamp(rz, -230, 230) };
        car.mesh.position.set(s.x, 0, s.z);
        car.userData.path = null;
      }
      if (!car.userData.path) this.retarget(car, rng);
      const path = car.userData.path;
      let wp = path[Math.min(car.userData.wpi, path.length - 1)];
      // lane offset: drive on the right side of the road
      const next = path[Math.min(car.userData.wpi + 1, path.length - 1)];
      const dx = next.x - wp.x, dz = next.z - wp.z;
      const segLen = Math.hypot(dx, dz) || 1;
      const off = car.userData.laneOff;
      const tx = wp.x + (dz / segLen) * off, tz = wp.z + (-dx / segLen) * off;
      const d = dist2d(car.x, car.z, tx, tz);
      if (d < 7) {
        car.userData.wpi++;
        if (car.userData.wpi >= path.length) { car.userData.path = null; continue; }
      }
      // braking: obstacle ahead?
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      let brake = false;
      const checkObstacle = (ox, oz, r) => {
        const rx = ox - car.x, rz = oz - car.z;
        const ahead = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
        if (ahead > 0 && ahead < r && side < 2.2) brake = true;
      };
      for (const o of ctx.allCars) { if (o !== car && !o.parked) checkObstacle(o.x, o.z, 9); }
      if (ctx.playerOnFoot) checkObstacle(ctx.focus.x, ctx.focus.z, 7);
      if (brake) {
        car.update(dt, { throttle: 0, steer: 0, brake: car.speed > 1 }, this.colliders, t);
      } else {
        driveToward(car, tx, tz, dt, this.colliders, t, { speedCap: 13 });
      }
    }
  }
}

const CAR_TYPES_COLORS = {
  sedan: [0xb03a2e, 0x2e5f8a, 0xbdc3c7, 0x27ae60, 0x7d3c98],
  sport: [0xe74c3c, 0xf39c12, 0xecf0f1, 0x111111],
  convertible: [0x1abc9c, 0xf1948a, 0xf9e79f],
  pickup: [0x5d6d7e, 0x935116, 0x1a5276],
  van: [0xecf0f1, 0xf5b041, 0x85c1e9],
  interceptor: [0x15181d],
};
