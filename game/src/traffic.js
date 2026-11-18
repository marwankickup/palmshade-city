// traffic.js — AI traffic: cars that cruise the road grid in the correct
// lane, turn at intersections, brake for obstacles, and recycle around
// the player so the city always feels alive.
import * as THREE from 'three';
import { Car, CAR_COLORS, STYLES } from './vehicles.js';
import { ROADS, LANE, HALF } from './city.js';

const COUNT = 11;
const DESPAWN = 235, SPAWN_MIN = 120, SPAWN_MAX = 210;

class TrafficCar {
  constructor(scene, rng) {
    const style = STYLES[Math.floor(rng() * STYLES.length)];
    const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    this.car = new Car(scene, style, color, 0, 0, 0);
    this.rng = rng;
    this.reset(scene, null, true);
  }
  // place on a random road; if near is given, place SPAWN_MIN..MAX away from it
  reset(scene, near, anywhere = false) {
    const rng = this.rng;
    this.turnAt = null;
    for (let tries = 0; tries < 12; tries++) {
      this.axis = rng() < 0.5 ? 'x' : 'z';
      this.dir = rng() < 0.5 ? 1 : -1;
      this.road = ROADS[Math.floor(rng() * ROADS.length)];
      this.along = -HALF + rng() * (HALF * 2);
      this.lat = this.laneTarget();
      this.speed = 0;
      this.cruise = 10 + rng() * 4.5;
      this.syncTransform();
      if (!near) return;
      const d = Math.hypot(this.car.pos.x - near.x, this.car.pos.z - near.z);
      if (anywhere ? d > 40 : (d > SPAWN_MIN && d < SPAWN_MAX)) return;
    }
  }
  laneTarget() { return this.axis === 'x' ? this.dir * LANE : -this.dir * LANE; }
  laneCoord() { return this.road + this.lat; }
  syncTransform(dt = 1) {
    if (this.axis === 'x') {
      this.car.pos.x = this.along; this.car.pos.z = this.laneCoord();
      this.car.heading = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      this.car.pos.z = this.along; this.car.pos.x = this.laneCoord();
      this.car.heading = this.dir > 0 ? 0 : Math.PI;
    }
    // ease the visible heading so turns sweep instead of snapping
    if (this.visHeading === undefined || dt >= 1) this.visHeading = this.car.heading;
    else {
      let d = this.car.heading - this.visHeading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.visHeading += d * Math.min(1, dt * 3.2);
    }
    this.car.mesh.position.copy(this.car.pos);
    this.car.mesh.rotation.y = this.visHeading;
  }
  // obstacle ahead? look at other traffic + extra blockers (player car, police…)
  blockedAhead(others, extras) {
    const ahead = 6.5;
    for (const o of others) {
      if (o === this) continue;
      const dx = o.car.pos.x - this.car.pos.x, dz = o.car.pos.z - this.car.pos.z;
      const f = this.car.forward;
      const fwd = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (fwd > 0 && fwd < ahead && side < 2.1) return true;
    }
    for (const b of extras) {
      const dx = b.x - this.car.pos.x, dz = b.z - this.car.pos.z;
      const f = this.car.forward;
      const fwd = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (fwd > 0 && fwd < ahead - 1.5 && side < 2.1) return true;
    }
    return false;
  }
  update(dt, others, extras, playerPos) {
    // turn decision when close to an intersection (crossing road coordinate)
    const nextIntersection = this.nextCrossing();
    const distToCross = Math.abs(nextIntersection - this.along);
    let target = this.cruise;
    if (this.blockedAhead(others, extras)) target = 0;
    else if (distToCross < 7 && this.turnAt === nextIntersection) target = Math.min(target, 6);
    this.speed += Math.max(-26 * dt, Math.min(9 * dt, target - this.speed));
    if (this.speed < 0) this.speed = 0;
    this.along += this.dir * this.speed * dt;
    // reached the crossing we planned to turn at?
    if (this.turnAt !== null && ((this.dir > 0 && this.along >= this.turnAt) || (this.dir < 0 && this.along <= this.turnAt))) {
      this.along = this.turnAt;
      this.makeTurn();
    } else if (distToCross < 26 && this.turnAt === null && Math.abs(nextIntersection) < HALF - 4) {
      if (this.rng() < 0.4) this.turnAt = nextIntersection;
    }
    if (Math.abs(this.along) > HALF + 30) { this.dir *= -1; this.along = Math.sign(this.along) * (HALF + 28); }
    this.car.speed = this.dir * this.speed; // for wheel spin direction
    // ease the lateral offset toward the lane centre (smooth turns)
    const lt = this.laneTarget();
    const dl = lt - this.lat;
    this.lat += Math.max(-3.4 * dt, Math.min(3.4 * dt, dl));
    this.syncTransform(dt);
    // gentle wheel spin visuals
    const wheels = this.car.mesh.userData.wheels;
    if (wheels) { const spin = this.speed * dt / 0.37; wheels.forEach((w) => { w.rotation.x += spin; }); }
    // recycle far cars near the player
    const d = Math.hypot(this.car.pos.x - playerPos.x, this.car.pos.z - playerPos.z);
    if (d > DESPAWN) this.reset(null, playerPos);
  }
  nextCrossing() {
    // nearest road coordinate ahead on the travel axis
    let best = null;
    for (const r of ROADS) {
      const rel = (r - this.along) * this.dir;
      if (rel > 0.5 && (best === null || rel < best.rel)) best = { r, rel };
    }
    return best ? best.r : (this.dir > 0 ? HALF + 40 : -HALF - 40);
  }
  makeTurn() {
    // swap axis at the intersection: the crossing road becomes our road,
    // our cross-axis world position becomes the new 'along', and the
    // lateral offset restarts near 0 and eases into the new lane.
    const crossCoord = this.turnAt;
    this.turnAt = null;
    const px = this.car.pos.x, pz = this.car.pos.z;
    if (this.axis === 'x') {
      this.axis = 'z';
      this.road = crossCoord;
      this.along = pz;
      this.lat = px - crossCoord;
    } else {
      this.axis = 'x';
      this.road = crossCoord;
      this.along = px;
      this.lat = pz - crossCoord;
    }
    this.dir = this.rng() < 0.5 ? 1 : -1;
    this.syncTransform();
  }
}

export class Traffic {
  constructor(scene, rng) {
    this.cars = [];
    for (let i = 0; i < COUNT; i++) this.cars.push(new TrafficCar(scene, rng));
    this.scene = scene;
  }
  update(dt, extras, playerPos) {
    for (const c of this.cars) c.update(dt, this.cars, extras, playerPos);
  }
  // flat list for ped hit checks / minimap
  movers() {
    return this.cars.map((c) => ({ x: c.car.pos.x, z: c.car.pos.z, speed: c.speed, radius: 1.8, isPlayer: false, car: c.car }));
  }
  meshes() { return this.cars.map((c) => c.car); }
}
