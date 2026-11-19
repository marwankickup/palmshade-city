// AI traffic: cars follow the intersection grid with right-side lane offsets,
// brake for obstacles ahead, turn at intersections and recycle near the player.
import * as THREE from 'three';
import { Car, randomKind, CAR_COLORS } from './vehicles.js';
import { V_ROADS, H_ROADS, angleDiff, clamp, dist2d } from './util.js';

function neighborsOf(node) {
  const out = [];
  const i = V_ROADS.indexOf(node.x), j = H_ROADS.indexOf(node.z);
  if (i > 0) out.push({ x: V_ROADS[i - 1], z: node.z });
  if (i < V_ROADS.length - 1) out.push({ x: V_ROADS[i + 1], z: node.z });
  if (j > 0) out.push({ x: node.x, z: H_ROADS[j - 1] });
  if (j < H_ROADS.length - 1) out.push({ x: node.x, z: H_ROADS[j + 1] });
  return out;
}

export function steerToward(car, tx, tz, throttle, brakeDist, dt) {
  const dx = tx - car.pos.x, dz = tz - car.pos.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  const diff = angleDiff(desired, car.heading);
  car.input.steer = clamp(diff * 1.7, -1, 1);
  car.input.throttle = throttle;
  car.input.brake = false;
  return dist;
}

export class TrafficSystem {
  constructor(scene, rng, count = 12) {
    this.cars = [];
    this.rng = rng;
    for (let i = 0; i < count; i++) {
      const kind = randomKind(rng);
      const car = new Car(scene, kind, CAR_COLORS[(rng() * CAR_COLORS.length) | 0]);
      car.occupiedBy = 'traffic';
      this._placeAtRandomNode(car, null, rng);
      this.cars.push(car);
    }
  }

  _placeAtRandomNode(car, nearPos, rng) {
    let node;
    if (nearPos) {
      // recycle: pick an intersection 110-190 away from the player
      const options = [];
      for (const x of V_ROADS) for (const z of H_ROADS) {
        const d = dist2d(x, z, nearPos.x, nearPos.z);
        if (d > 110 && d < 200) options.push({ x, z });
      }
      node = options.length ? options[(rng() * options.length) | 0] : { x: V_ROADS[0], z: H_ROADS[0] };
    } else {
      node = {
        x: V_ROADS[(rng() * V_ROADS.length) | 0],
        z: H_ROADS[(rng() * H_ROADS.length) | 0],
      };
    }
    car.pos.set(node.x, 0, node.z);
    car.speed = 0;
    car.repair();
    const nbs = neighborsOf(node);
    const target = nbs[(rng() * nbs.length) | 0];
    car.userData_ai = { node, target, prev: null };
    car.heading = Math.atan2(target.x - node.x, target.z - node.z);
    car.syncTransform();
  }

  update(dt, ctx) {
    const { playerPos, allCars, colliders, t } = ctx;
    for (const car of this.cars) {
      if (car.occupiedBy !== 'traffic') continue; // stolen by player etc.
      if (dist2d(car.pos.x, car.pos.z, playerPos.x, playerPos.z) > 290) {
        this._placeAtRandomNode(car, playerPos, this.rng);
      }
      const ai = car.userData_ai;
      // lane offset: perpendicular to travel direction (consistent side)
      const fx = ai.target.x - car.pos.x, fz = ai.target.z - car.pos.z;
      const fl = Math.hypot(fx, fz) || 1;
      const offX = (-fz / fl) * 2.3, offZ = (fx / fl) * 2.3;
      const tx = ai.target.x + offX, tz = ai.target.z + offZ;
      const dist = steerToward(car, tx, tz, 0.72, 0, dt);

      // obstacle braking: anything ahead within 8
      let blocked = false;
      const aheadX = car.pos.x + car.forwardX() * 6.5;
      const aheadZ = car.pos.z + car.forwardZ() * 6.5;
      for (const other of allCars) {
        if (other === car) continue;
        if (dist2d(other.pos.x, other.pos.z, aheadX, aheadZ) < 3.4) { blocked = true; break; }
      }
      if (!blocked && ctx.peds) {
        for (const ped of ctx.peds) {
          if (ped.state !== 'down' && dist2d(ped.pos.x, ped.pos.z, aheadX, aheadZ) < 2.6) { blocked = true; break; }
        }
      }
      if (blocked) { car.input.throttle = 0; car.input.brake = car.speed > 1; }

      if (dist < 7) {
        const nbs = neighborsOf(ai.target).filter((n) => !ai.prev || n.x !== ai.prev.x || n.z !== ai.prev.z);
        const next = nbs.length ? nbs[(this.rng() * nbs.length) | 0] : ai.prev || ai.target;
        ai.prev = ai.node;
        ai.node = ai.target;
        ai.target = next;
      }
      car.update(dt, colliders, t);
    }
  }
}
