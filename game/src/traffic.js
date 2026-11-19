// traffic.js — AI traffic: lane-following cars that cruise the road grid,
// turn at intersections, brake for obstacles and recycle around the player.
import { Car, CAR_COLORS } from './vehicles.js';
import { ROAD_XS, ROAD_ZS, clamp, angleDelta, dist2 } from './util.js';

const DIRS = [
  { x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 },
];
const rightOf = (d) => ({ x: -d.z, z: d.x });

export function createTraffic(game) {
  const cars = [];
  const rng = game.rng;
  const COUNT = 11;

  function spawnPoint(minD, maxD) {
    const p = game.playerPos();
    for (let tries = 0; tries < 24; tries++) {
      const rx = rng.pick(ROAD_XS), rz = rng.pick(ROAD_ZS);
      const d = dist2(rx, rz, p.x, p.z);
      if (d >= minD && d <= maxD) return { x: rx, z: rz };
    }
    return { x: -180, z: -180 };
  }

  function newCar(at) {
    const type = rng.pick(['sedan', 'sedan', 'sport', 'convertible', 'pickup', 'van']);
    const car = new Car(game.scene, type, rng.pick(CAR_COLORS), game.city.colliders);
    car.driver = 'traffic';
    const dir = rng.pick(DIRS);
    car.place(at.x + rightOf(dir).x * 2.4, at.z + rightOf(dir).z * 2.4, Math.atan2(dir.x, dir.z));
    car.ai = {
      dir,
      tp: { x: at.x + dir.x * 34 + rightOf(dir).x * 2.4, z: at.z + dir.z * 34 + rightOf(dir).z * 2.4 },
      cruise: 10.5 + rng.range(-1.5, 2.5),
    };
    game.cars.push(car);
    cars.push(car);
    return car;
  }

  for (let i = 0; i < COUNT; i++) newCar(spawnPoint(60, 240));

  function pickNextDir(car) {
    const ai = car.ai;
    // the intersection the target point was heading to
    const nearX = ROAD_XS.reduce((a, b) => (Math.abs(b - ai.tp.x) < Math.abs(a - ai.tp.x) ? b : a));
    const nearZ = ROAD_ZS.reduce((a, b) => (Math.abs(b - ai.tp.z) < Math.abs(a - ai.tp.z) ? b : a));
    const options = DIRS.filter((d) => {
      if (d.x === -ai.dir.x && d.z === -ai.dir.z) return false; // no U-turn
      const nx = nearX + d.x * 60, nz = nearZ + d.z * 60;
      return nx >= -245 && nx <= 125 && nz >= -245 && nz <= 245;
    });
    const straight = options.find((d) => d.x === ai.dir.x && d.z === ai.dir.z);
    const nd = (straight && rng.chance(0.62)) ? straight : rng.pick(options.length ? options : [ai.dir]);
    ai.dir = nd;
    ai.tp = { x: nearX + nd.x * 34 + rightOf(nd).x * 2.4, z: nearZ + nd.z * 34 + rightOf(nd).z * 2.4 };
  }

  function update(dt) {
    const pp = game.playerPos();
    for (const car of cars) {
      const ai = car.ai;
      const p = car.pos;
      // recycle far cars near the player
      if (dist2(p.x, p.z, pp.x, pp.z) > 285) {
        const s = spawnPoint(130, 200);
        const dir = rng.pick(DIRS);
        ai.dir = dir;
        car.place(s.x + rightOf(dir).x * 2.4, s.z + rightOf(dir).z * 2.4, Math.atan2(dir.x, dir.z));
        ai.tp = { x: s.x + dir.x * 34 + rightOf(dir).x * 2.4, z: s.z + dir.z * 34 + rightOf(dir).z * 2.4 };
      }
      if (dist2(p.x, p.z, ai.tp.x, ai.tp.z) < 7) pickNextDir(car);
      const desired = Math.atan2(ai.tp.x - p.x, ai.tp.z - p.z);
      const delta = angleDelta(car.heading, desired);
      car.input.steer = clamp(delta * 2.1, -1, 1);
      // obstacle scan: anything solid ahead?
      let blocked = 0;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      for (const other of game.cars) {
        if (other === car) continue;
        const dx = other.pos.x - p.x, dz = other.pos.z - p.z;
        const fwd = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (fwd > 0 && fwd < 9 && lat < 2.1) { blocked = Math.max(blocked, 1 - fwd / 9); }
      }
      if (!game.playerInCar()) {
        const dx = pp.x - p.x, dz = pp.z - p.z;
        const fwd = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (fwd > 0 && fwd < 7 && lat < 1.8) blocked = 1;
      }
      let target = ai.cruise * (Math.abs(delta) > 0.45 ? 0.55 : 1);
      if (blocked > 0) target = Math.min(target, 3.5 * (1 - blocked));
      if (car.speed < target - 0.4) { car.input.throttle = 0.75; car.input.brake = false; }
      else if (car.speed > target + 0.4) { car.input.throttle = 0; car.input.brake = blocked > 0.35; }
      else { car.input.throttle = 0.12; car.input.brake = false; }
      car.update(dt, game.time);
    }
  }

  return { cars, update };
}
