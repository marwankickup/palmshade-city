// vehicles.js — the car factory (six silhouettes built from boxes: sedan,
// sport, convertible, pickup, van, police interceptor) and the arcade
// driving model every car in the city shares.

import * as THREE from 'three';
import { clamp, angleDiff, forwardOf } from './util.js';

export const CAR_TYPES = {
  sedan:       { len: 4.3, wid: 1.9, hBody: 0.62, hCab: 0.55, maxSpeed: 27, accel: 13, colors: [0xc0c6cc, 0x3f6fb5, 0x8a2f35, 0x2e7d5b, 0xe8e3d8, 0x59486e] },
  sport:       { len: 4.4, wid: 1.95, hBody: 0.5, hCab: 0.42, maxSpeed: 35, accel: 18, colors: [0xd92323, 0xff8c1a, 0xffd60a, 0x118ab2, 0x9b2226] },
  convertible: { len: 4.3, wid: 1.9, hBody: 0.58, hCab: 0.2, maxSpeed: 30, accel: 15, colors: [0xef476f, 0x06d6a0, 0xf7ede2, 0x118ab2] },
  pickup:      { len: 4.8, wid: 2.0, hBody: 0.72, hCab: 0.62, maxSpeed: 25, accel: 12, colors: [0xb5651d, 0x5d7d99, 0x707880, 0x386641] },
  van:         { len: 5.0, wid: 2.05, hBody: 1.5, hCab: 0.1, maxSpeed: 23, accel: 11, colors: [0xf2f2f2, 0x17a398, 0xf2a65a, 0x8896a3] },
  police:      { len: 4.5, wid: 1.95, hBody: 0.6, hCab: 0.52, maxSpeed: 33, accel: 17, colors: [0x1d2733] },
};

const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2b38 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
const hubMat = new THREE.MeshLambertMaterial({ color: 0xd8dde2 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

export function createCarMesh(type, color) {
  const spec = CAR_TYPES[type];
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const L = spec.len, W = spec.wid;

  const body = new THREE.Mesh(new THREE.BoxGeometry(W, spec.hBody, L), paint);
  body.position.y = 0.35 + spec.hBody / 2;
  body.castShadow = true;
  g.add(body);

  if (type === 'van') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.3, L - 0.6),
      new THREE.MeshLambertMaterial({ color: 0x27313b }));
    stripe.position.y = 1.45;
    g.add(stripe);
  } else if (type === 'pickup') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W - 0.15, spec.hCab, 1.5), paint);
    cab.position.set(0, 0.35 + spec.hBody + spec.hCab / 2, -L / 2 + 1.15);
    cab.castShadow = true;
    const win = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, spec.hCab - 0.18, 1.3), glassMat);
    win.position.copy(cab.position);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.3, L - 2.1),
      new THREE.MeshLambertMaterial({ color: 0x27313b }));
    bed.position.set(0, 0.35 + spec.hBody + 0.05, 0.75);
    g.add(cab, win, bed);
  } else {
    const cabLen = type === 'convertible' ? 1.5 : L * 0.48;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W - 0.24, spec.hCab, cabLen),
      type === 'convertible' ? new THREE.MeshLambertMaterial({ color: 0x27313b }) : glassMat);
    cab.position.set(0, 0.35 + spec.hBody + spec.hCab / 2, type === 'sport' ? -0.2 : 0.05);
    cab.castShadow = true;
    g.add(cab);
    if (type === 'sport') {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.08, 0.4), paint);
      spoiler.position.set(0, 1.05, -L / 2 + 0.25);
      g.add(spoiler);
    }
  }
  if (type === 'police') {
    const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.3, L - 0.5),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    band.position.y = 0.72;
    g.add(band);
  }

  // lights
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    hl.position.set(sx * (W / 2 - 0.3), 0.72, L / 2 + 0.01);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), tailMat);
    tl.position.set(sx * (W / 2 - 0.3), 0.78, -L / 2 - 0.01);
    g.add(hl, tl);
  }

  // wheels with hubcaps
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8);
  for (const [wx, wz] of [[-W / 2 + 0.05, L / 2 - 0.85], [W / 2 - 0.05, L / 2 - 0.85], [-W / 2 + 0.05, -L / 2 + 0.85], [W / 2 - 0.05, -L / 2 + 0.85]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    tyre.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    pivot.add(tyre, hub);
    g.add(pivot);
    wheels.push(pivot);
  }

  // police light bar with separately-flashable halves
  let lightbar = null;
  if (type === 'police') {
    lightbar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.09, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x111318 }));
    base.position.y = 0.05;
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2266ff });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.3), redMat);
    red.position.set(-0.33, 0.16, 0);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.3), blueMat);
    blue.position.set(0.33, 0.16, 0);
    lightbar.add(base, red, blue);
    lightbar.position.set(0, 0.35 + spec.hBody + spec.hCab + 0.02, 0.05);
    g.add(lightbar);
    lightbar = { group: lightbar, redMat, blueMat };
  }
  g.userData.wheels = wheels;
  g.userData.lightbar = lightbar;
  return g;
}

let CAR_ID = 1;

export class Car {
  constructor(scene, type, color, x, z, heading = 0) {
    this.id = CAR_ID++;
    this.type = type;
    this.spec = CAR_TYPES[type];
    this.group = createCarMesh(type, color);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    this.pos = this.group.position;
    this.heading = heading;
    this.speed = 0;
    this.health = 100;
    this.steerVis = 0;
    this.onCrash = null;
    this.smokeT = 0;
    scene.add(this.group);
    // damage smoke: a small recycled particle cloud
    const n = 22;
    this.smokePos = new Float32Array(n * 3);
    this.smokeLife = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.smokeLife[i] = Math.random(); this.smokePos[i * 3 + 1] = -10; }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.smokePos, 3));
    this.smoke = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0x555a60, size: 1.5, transparent: true, opacity: 0.4, depthWrite: false,
    }));
    this.smoke.visible = false;
    scene.add(this.smoke);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }
  forward() { return forwardOf(this.heading); }

  damage(amount) { this.health = Math.max(0, this.health - amount); }

  updateLightbar(t) {
    const lb = this.group.userData.lightbar;
    if (!lb) return;
    const phase = Math.floor(t * 5) % 2;
    lb.redMat.color.setHex(phase ? 0xff2a20 : 0x57120e);
    lb.blueMat.color.setHex(phase ? 0x0e2a57 : 0x2266ff);
  }

  // control: { throttle: -1..1, steer: -1..1 (positive = right), handbrake }
  update(dt, control, city) {
    const spec = this.spec;
    const th = control.throttle || 0, st = control.steer || 0;
    if (th > 0) {
      this.speed += spec.accel * th * dt * (1 - Math.max(0, this.speed) / (spec.maxSpeed * 1.25));
    } else if (th < 0) {
      if (this.speed > 0.6) this.speed -= 30 * dt; // braking
      else this.speed = Math.max(-9, this.speed - 8 * dt * -th);
    } else {
      this.speed -= this.speed * 0.7 * dt;
      if (Math.abs(this.speed) < 0.08) this.speed = 0;
    }
    this.speed = clamp(this.speed, -9, spec.maxSpeed);
    // turn authority scales with speed but never vanishes while throttle is
    // applied — otherwise a car nosed into a wall can barely turn at all.
    const sf = clamp(this.speed / 7, -1, 1);
    let turnAuth = Math.abs(sf);
    if (Math.abs(th) > 0.05) turnAuth = Math.max(turnAuth, 0.34);
    const dirSign = sf < -0.02 ? -1 : 1;
    const turnRate = 1.75 * (control.handbrake ? 1.45 : 1);
    this.heading += st * turnRate * turnAuth * dirSign * dt * (control.handbrake ? 1 : 0.92);
    const f = this.forward();
    let nx = this.pos.x + f.x * this.speed * dt;
    let nz = this.pos.z + f.z * this.speed * dt;
    // collide with solids as two axle circles
    const before = Math.abs(this.speed);
    for (const s of [-1.45, 1.45]) {
      const px = nx + f.x * s, pz = nz + f.z * s;
      const res = city.collideCircle(px, pz, 1.02, 0);
      if (res.hit) {
        nx += res.x - px; nz += res.z - pz;
        if (before > 9) {
          this.damage((before - 8) * 1.6);
          if (this.onCrash) this.onCrash(Math.min(1, before / 26));
        }
        this.speed *= 0.32;
      }
    }
    this.pos.x = clamp(nx, -193, 193);
    this.pos.z = clamp(nz, -177, 160);
    this.group.rotation.y = this.heading;
    // wheels
    const wheels = this.group.userData.wheels;
    this.steerVis += ((st * 0.42) - this.steerVis) * Math.min(1, dt * 10);
    wheels.forEach((w, i) => {
      w.rotation.x += (this.speed * dt) / 0.36;
      if (i < 2) w.rotation.y = this.steerVis;
    });
    // smoke when hurt
    const hurt = this.health < 55;
    this.smoke.visible = hurt;
    if (hurt) {
      const n = this.smokeLife.length;
      for (let i = 0; i < n; i++) {
        this.smokeLife[i] += dt * 0.55;
        if (this.smokeLife[i] > 1) {
          this.smokeLife[i] = 0;
          this.smokePos[i * 3] = this.pos.x + (Math.random() - 0.5) * 0.5;
          this.smokePos[i * 3 + 1] = 1.2;
          this.smokePos[i * 3 + 2] = this.pos.z + (Math.random() - 0.5) * 0.5;
        } else {
          this.smokePos[i * 3 + 1] += dt * 2.2;
          this.smokePos[i * 3] += dt * 0.4;
        }
      }
      this.smoke.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    scene.remove(this.smoke);
  }
}

// Shared steering brain: drive a car toward a point. Returns distance to it.
export function driveToward(car, tx, tz, dt, city, { speedCap = 14, arrive = 3, throttleScale = 1 } = {}) {
  const dx = tx - car.x, dz = tz - car.z;
  const dist = Math.hypot(dx, dz);
  const targetHeading = Math.atan2(dx, dz);
  const diff = angleDiff(car.heading, targetHeading);
  const steer = clamp(diff * 1.6, -1, 1);
  let throttle = 0.85 * throttleScale;
  if (Math.abs(diff) > 2.2 && car.speed > 3) throttle = -0.7; // reverse to re-aim
  else if (Math.abs(diff) > 1.1) throttle = 0.35 * throttleScale;
  const capHere = dist < arrive * 2.2 ? speedCap * 0.45 : speedCap;
  if (car.speed > capHere) throttle = Math.min(throttle, 0);
  if (dist < arrive && car.speed < 2) throttle = 0;
  car.update(dt, { throttle, steer, handbrake: Math.abs(diff) > 0.9 && car.speed > 10 }, city);
  return dist;
}
