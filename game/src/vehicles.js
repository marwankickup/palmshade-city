// vehicles.js — 6 car types, arcade physics, damage, police light bars.
import * as THREE from 'three';
import { clamp, collideCircle, WORLD } from './util.js';

export const CAR_TYPES = {
  sedan:       { len: 4.3, wid: 1.9, bodyH: 0.62, cabinH: 0.55, maxSpeed: 30, accel: 15, colors: [0xb03a2e, 0x2e5f8a, 0xbdc3c7, 0x27ae60, 0x7d3c98] },
  sport:       { len: 4.1, wid: 1.9, bodyH: 0.5, cabinH: 0.42, maxSpeed: 39, accel: 21, colors: [0xe74c3c, 0xf39c12, 0xecf0f1, 0x111111] },
  convertible: { len: 4.2, wid: 1.9, bodyH: 0.55, cabinH: 0.18, maxSpeed: 33, accel: 17, colors: [0x1abc9c, 0xf1948a, 0xf9e79f] },
  pickup:      { len: 4.8, wid: 2.0, bodyH: 0.75, cabinH: 0.6, maxSpeed: 28, accel: 14, colors: [0x5d6d7e, 0x935116, 0x1a5276] },
  van:         { len: 5.2, wid: 2.1, bodyH: 1.15, cabinH: 0.75, maxSpeed: 26, accel: 13, colors: [0xecf0f1, 0xf5b041, 0x85c1e9] },
  interceptor: { len: 4.5, wid: 1.95, bodyH: 0.6, cabinH: 0.55, maxSpeed: 37, accel: 20, colors: [0x15181d], police: true },
};

const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.25, metalness: 0.4 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 1 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0xb9bfc6, roughness: 0.4, metalness: 0.6 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffedb5, emissiveIntensity: 1.8 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a0f0f, emissive: 0xd21f1f, emissiveIntensity: 1.2 });

export function createCarMesh(type, color) {
  const cfg = CAR_TYPES[type];
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.wid, cfg.bodyH, cfg.len), paint);
  body.position.y = 0.38 + cfg.bodyH / 2; body.castShadow = true; g.add(body);
  if (type === 'van') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cfg.wid * 0.96, cfg.cabinH, cfg.len * 0.34), paint);
    cab.position.set(0, 0.38 + cfg.bodyH + cfg.cabinH / 2 - 0.1, cfg.len * 0.3); cab.castShadow = true; g.add(cab);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(cfg.wid * 0.8, cfg.cabinH * 0.7, 0.08), glassMat);
    shield.position.set(0, cab.position.y + 0.05, cfg.len * 0.47); g.add(shield);
  } else if (type === 'pickup') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cfg.wid * 0.92, cfg.cabinH, cfg.len * 0.36), paint);
    cab.position.set(0, 0.38 + cfg.bodyH + cfg.cabinH / 2, cfg.len * 0.18); cab.castShadow = true; g.add(cab);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(cfg.wid * 0.84, cfg.cabinH * 0.62, cfg.len * 0.3), glassMat);
    glass.position.set(0, cab.position.y + 0.04, cfg.len * 0.18); g.add(glass);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(cfg.wid * 0.94, 0.3, cfg.len * 0.4), new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 1 }));
    bed.position.set(0, 0.38 + cfg.bodyH + 0.05, -cfg.len * 0.28); g.add(bed);
  } else {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cfg.wid * 0.86, cfg.cabinH, cfg.len * 0.44), type === 'convertible' ? paint : glassMat);
    cab.position.set(0, 0.38 + cfg.bodyH + cfg.cabinH / 2, -cfg.len * 0.04); cab.castShadow = true; g.add(cab);
    if (type === 'convertible') {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(cfg.wid * 0.8, 0.22, cfg.len * 0.3), new THREE.MeshStandardMaterial({ color: 0x6e2c00, roughness: 1 }));
      seat.position.set(0, 0.38 + cfg.bodyH + 0.08, -cfg.len * 0.05); g.add(seat);
    }
  }
  if (cfg.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(cfg.wid + 0.03, 0.3, cfg.len * 0.7), new THREE.MeshStandardMaterial({ color: 0xf2f3f4, roughness: 0.5 }));
    stripe.position.y = 0.72; g.add(stripe);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.5), tyreMat);
    barBase.position.set(0, 0.38 + cfg.bodyH + cfg.cabinH + 0.08, -cfg.len * 0.04); g.add(barBase);
    const redMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.4 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x2266ff, emissiveIntensity: 3 });
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.44), redMat);
    rl.position.set(-0.34, barBase.position.y + 0.12, -cfg.len * 0.04); g.add(rl);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.44), blueMat);
    bl.position.set(0.34, barBase.position.y + 0.12, -cfg.len * 0.04); g.add(bl);
    g.userData.lightMats = { redMat, blueMat };
  }
  // headlights / taillights
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
    hl.position.set(sx * cfg.wid * 0.32, 0.62, cfg.len / 2 + 0.02); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tailMat);
    tl.position.set(sx * cfg.wid * 0.32, 0.66, -cfg.len / 2 - 0.02); g.add(tl);
  }
  // wheels with hubcaps
  const wheels = [], wg = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
  const hg = new THREE.CylinderGeometry(0.19, 0.19, 0.3, 8);
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx * (cfg.wid / 2 - 0.05), 0.38, wz * (cfg.len / 2 - 0.85));
    const tyre = new THREE.Mesh(wg, tyreMat); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true;
    const hub = new THREE.Mesh(hg, hubMat); hub.rotation.z = Math.PI / 2;
    pivot.add(tyre); pivot.add(hub); g.add(pivot);
    wheels.push({ pivot, front: wz > 0 });
  }
  g.userData.wheels = wheels;
  g.userData.cfg = cfg;
  return g;
}

export class Car {
  constructor(scene, type, color, x, z, heading = 0) {
    this.type = type; this.cfg = CAR_TYPES[type];
    this.mesh = createCarMesh(type, color);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.heading = heading; this.speed = 0; this.health = 100;
    this.steerVis = 0; this.wheelSpin = 0; this.dead = false;
    this.isPolice = !!this.cfg.police;
    this.userData = {};
    this.lightsOn = false; this.owned = false; this.driver = null; // null | 'player' | 'ai'
    this.lastImpact = 0;
  }
  get pos() { return this.mesh.position; }
  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  // input: {throttle -1..1, steer -1..1, brake bool}. Returns impact speed this step.
  update(dt, input, colliders, t) {
    const cfg = this.cfg;
    if (this.dead) input = { throttle: 0, steer: 0, brake: true };
    const maxRev = -9;
    if (input.brake) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
    } else if (input.throttle > 0) {
      this.speed += cfg.accel * (1 - Math.max(0, this.speed) / cfg.maxSpeed) * input.throttle * dt;
    } else if (input.throttle < 0) {
      this.speed += cfg.accel * 0.7 * (1 - Math.max(0, -this.speed) / -maxRev) * input.throttle * dt;
    }
    this.speed -= this.speed * 0.35 * dt; // drag
    if (!input.brake && input.throttle === 0) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 4 * dt);
    this.speed = clamp(this.speed, maxRev, cfg.maxSpeed);
    if (Math.abs(this.speed) < 0.02 && input.throttle === 0) this.speed = 0;
    // steering with minimum turn authority so a nosed-in car can still turn out
    if (Math.abs(this.speed) > 0.25) {
      const authority = clamp(Math.abs(this.speed) * 0.21, 0.55, 1.85);
      this.heading += input.steer * authority * dt * (this.speed >= 0 ? 1 : -1);
    }
    this.steerVis = input.steer;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.mesh.position.x += fx * this.speed * dt;
    this.mesh.position.z += fz * this.speed * dt;
    this.mesh.position.x = clamp(this.mesh.position.x, WORLD.minX + 3, WORLD.maxX - 3);
    this.mesh.position.z = clamp(this.mesh.position.z, WORLD.minZ + 3, WORLD.maxZ - 3);
    // collisions (buildings: tall colliders only)
    const before = this.speed;
    const p = { x: this.mesh.position.x, z: this.mesh.position.z };
    const hit = collideCircle(p, Math.max(cfg.wid, cfg.len) * 0.36, colliders, 1.6);
    this.mesh.position.x = p.x; this.mesh.position.z = p.z;
    let impact = 0;
    if (hit && Math.abs(before) > 3) {
      impact = Math.abs(before);
      this.health -= Math.max(0, (impact - 7)) * 2.4;
      this.speed = -before * 0.22;
      if (this.health <= 0) { this.health = 0; this.dead = true; }
    } else if (hit) {
      this.speed = Math.min(this.speed, 0);
    }
    this.lastImpact = impact;
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = -input.steer * clamp(Math.abs(this.speed) / cfg.maxSpeed, 0, 1) * 0.045;
    this.mesh.position.y = 0;
    // wheels
    this.wheelSpin += this.speed * dt / 0.38;
    for (const w of this.mesh.userData.wheels) {
      w.pivot.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = this.steerVis * 0.42;
    }
    // police light bar
    const lm = this.mesh.userData.lightMats;
    if (lm) {
      const on = this.lightsOn ? (Math.sin(t * 11) > 0 ? 1 : 0) : 0;
      lm.redMat.emissiveIntensity = this.lightsOn ? (on ? 3.4 : 0.25) : 0.4;
      lm.blueMat.emissiveIntensity = this.lightsOn ? (on ? 0.25 : 3.4) : 0.4;
    }
    return impact;
  }
}

// Shared AI steering: drive a Car toward a target point. Returns distance to target.
export function driveToward(car, tx, tz, dt, colliders, t, opts = {}) {
  const dx = tx - car.x, dz = tz - car.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp(diff * 1.6, -1, 1);
  let throttle = 1, brake = false;
  const maxSp = opts.maxSpeed ?? 1;
  if (Math.abs(diff) > 2.3 && dist < 9) { throttle = -0.7; } // reverse to re-align
  else if (Math.abs(diff) > 1.1) throttle = 0.45;
  if (opts.stopAt && dist < opts.stopAt) { throttle = 0; brake = true; }
  if (opts.slowNear && dist < 14) throttle = Math.min(throttle, 0.45);
  const spdCap = opts.speedCap ?? car.cfg.maxSpeed;
  if (car.speed > spdCap * maxSp) { throttle = 0; if (car.speed > spdCap * maxSp + 4) brake = true; }
  car.update(dt, { throttle, steer, brake }, colliders, t);
  return dist;
}
