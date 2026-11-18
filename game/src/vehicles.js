// vehicles.js — stylised cars built from boxes, arcade driving physics,
// parked cars to steal, damage + smoke. Cars face local +Z; heading is a
// Y rotation and the forward vector is (sin h, 0, cos h).
import * as THREE from 'three';
import { collideAABBs, clampToWorld, BLOCKS, ROADS } from './city.js';

export const CAR_COLORS = [0xe84f3d, 0x2a9db5, 0xf2b544, 0x7ec850, 0xe87fb0, 0xf2f2f2, 0x5b7fe8, 0xff7f2a, 0x9b59d0, 0x37c8a3];
export const STYLES = ['sedan', 'sport', 'van', 'pickup'];

const bodyGeoCache = {};
function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = opts.basic
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshLambertMaterial({ color, ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: opts.ei ?? 1 } : {}) });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (!opts.noShadow) m.castShadow = true;
  return m;
}

export function createCarMesh(style, color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22242c });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd4e8, emissive: 0x2c4a5e, emissiveIntensity: 0.4 });
  let L = 4.3, W = 1.85, bodyH = 0.62, bodyY = 0.62, cabH = 0.55, cabL = 2.1, cabZ = -0.2;
  if (style === 'sport') { L = 4.5; bodyH = 0.5; bodyY = 0.52; cabH = 0.42; cabL = 1.8; cabZ = -0.35; }
  if (style === 'van') { L = 4.7; W = 1.95; bodyH = 1.5; bodyY = 1.05; cabH = 0; }
  if (style === 'pickup') { L = 4.7; cabL = 1.5; cabZ = 0.55; }

  const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, L), paint);
  body.position.y = bodyY; body.castShadow = true;
  g.add(body);
  if (cabH > 0) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W - 0.25, cabH, cabL), glass);
    cab.position.set(0, bodyY + bodyH / 2 + cabH / 2 - 0.04, cabZ);
    cab.castShadow = true;
    g.add(cab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.08, cabL - 0.3), paint);
    roof.position.set(0, bodyY + bodyH / 2 + cabH + 0.02, cabZ);
    g.add(roof);
  } else {
    // van windshield
    const shield = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.6, 0.1), glass);
    shield.position.set(0, bodyY + bodyH / 2 - 0.25, L / 2 - 0.25);
    shield.rotation.x = -0.25;
    g.add(shield);
  }
  if (style === 'pickup') g.add(box(W - 0.1, 0.34, 1.7, 0x3a3f4a, 0, bodyY + 0.28, -1.35));
  if (style === 'sport') g.add(box(W - 0.2, 0.1, 0.5, 0x22242c, 0, bodyY + bodyH / 2 + 0.28, -L / 2 + 0.3));

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 10);
  const wheels = [];
  for (const [wx, wz] of [[-W / 2, L / 2 - 0.85], [W / 2, L / 2 - 0.85], [-W / 2, -L / 2 + 0.85], [W / 2, -L / 2 + 0.85]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.37, wz);
    g.add(w); wheels.push(w);
  }
  // lights
  g.add(box(0.34, 0.16, 0.06, 0xfff2b0, -W / 2 + 0.3, bodyY + 0.08, L / 2 + 0.01, { basic: true, noShadow: true }));
  g.add(box(0.34, 0.16, 0.06, 0xfff2b0, W / 2 - 0.3, bodyY + 0.08, L / 2 + 0.01, { basic: true, noShadow: true }));
  g.add(box(0.34, 0.14, 0.06, 0xff3b30, -W / 2 + 0.3, bodyY + 0.08, -L / 2 - 0.01, { basic: true, noShadow: true }));
  g.add(box(0.34, 0.14, 0.06, 0xff3b30, W / 2 - 0.3, bodyY + 0.08, -L / 2 - 0.01, { basic: true, noShadow: true }));
  g.userData.wheels = wheels;
  g.userData.style = style;
  return g;
}

export function createPoliceMesh() {
  const g = createCarMesh('sedan', 0xf4f6f8);
  // black doors stripe
  g.add(box(1.9, 0.4, 2.2, 0x1d2733, 0, 0.66, -0.1));
  const bar = new THREE.Group();
  const red = box(0.55, 0.2, 0.5, 0xff2222, -0.32, 0, 0, { basic: true, noShadow: true });
  const blue = box(0.55, 0.2, 0.5, 0x2266ff, 0.32, 0, 0, { basic: true, noShadow: true });
  bar.add(red, blue);
  bar.position.set(0, 1.62, -0.2);
  g.add(bar);
  g.userData.lightBar = { red, blue };
  return g;
}

let smokeTex = null;
function getSmokeTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(60,60,60,0.55)');
  grad.addColorStop(1, 'rgba(60,60,60,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

// A drivable / pushable car in the world.
export class Car {
  constructor(scene, style, color, x, z, heading = 0) {
    this.mesh = createCarMesh(style, color);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.style = style;
    this.radius = 1.75;
    this.maxSpeed = style === 'sport' ? 36 : style === 'van' ? 24 : 29;
    this.accel = style === 'sport' ? 17 : 13.5;
    this.occupied = false;
    this.dead = false;
    // smoke sprite for damage
    const sm = new THREE.SpriteMaterial({ map: getSmokeTexture(), transparent: true, opacity: 0 });
    this.smoke = new THREE.Sprite(sm);
    this.smoke.scale.set(2.2, 2.2, 1);
    this.smoke.position.set(0, 1.6, 0.8);
    this.mesh.add(this.smoke);
    this.smokeT = 0;
  }
  get forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  // input: {throttle -1..1, steer -1..1, handbrake bool}
  drive(dt, input, onCrash) {
    const maxF = this.maxSpeed, maxR = 11;
    if (input.throttle > 0) this.speed += this.accel * input.throttle * dt * (this.speed < 0 ? 2.4 : 1);
    else if (input.throttle < 0) this.speed += this.accel * 1.25 * input.throttle * dt * (this.speed > 0.5 ? 2.2 : 1);
    // drag + rolling friction
    const drag = input.handbrake ? 3.2 : 0.55;
    this.speed -= this.speed * drag * dt;
    if (!input.throttle && Math.abs(this.speed) < 0.4) this.speed = 0;
    this.speed = Math.max(-maxR, Math.min(maxF, this.speed));
    // steering: more authority at low speed, less at very high speed
    const sf = Math.min(1, Math.abs(this.speed) / 7) * (1 - Math.min(0.45, Math.abs(this.speed) / 90));
    const targetSteer = input.steer * 0.62 * sf;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 7);
    if (this.speed !== 0) this.heading += this.steer * (this.speed / 3.4) * dt * 0.62;
    const f = this.forward;
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.integrate(dt, onCrash);
  }
  // shared movement integration for AI cars (they set pos/heading themselves, then call this)
  integrate(dt, onCrash) {
    const before = Math.abs(this.speed);
    // two collision circles (front/back)
    for (const off of [1.25, -1.25]) {
      const f = this.forward;
      const p = { x: this.pos.x + f.x * off, z: this.pos.z + f.z * off };
      const ox = p.x, oz = p.z;
      if (collideAABBs(p, 1.3)) {
        this.pos.x += p.x - ox; this.pos.z += p.z - oz;
        if (before > 7) {
          this.damage((before - 6) * 2.2);
          if (onCrash) onCrash(before);
        }
        this.speed *= 0.35;
      }
    }
    clampToWorld(this.pos);
    this.mesh.rotation.y = this.heading;
    // wheel spin + front wheel yaw
    const wheels = this.mesh.userData.wheels;
    if (wheels) {
      const spin = this.speed * dt / 0.37;
      wheels.forEach((w, i) => {
        w.rotation.x += spin;
        if (i < 2) w.rotation.y = this.steer * 0.9;
      });
    }
    // smoke when damaged
    this.smokeT += dt;
    const target = this.health < 55 ? (55 - this.health) / 60 : 0;
    this.smoke.material.opacity += (target * (0.5 + 0.3 * Math.sin(this.smokeT * 7)) - this.smoke.material.opacity) * dt * 3;
    if (this.health <= 0 && !this.dead) { this.dead = true; this.smoke.material.opacity = 0.85; }
  }
  damage(n) {
    this.health = Math.max(0, this.health - n);
    if (this.health < 40) this.maxSpeed = Math.min(this.maxSpeed, 16);
  }
  dispose(scene) { scene.remove(this.mesh); }
}

// parked cars scattered on roadsides + the two parking-lot blocks
export function spawnParkedCars(scene, rng) {
  const cars = [];
  const spots = [];
  // roadside parking: along block edges, parallel parked
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    if (rng() < 0.45) continue;
    const edge = Math.floor(rng() * 4);
    const t = (rng() - 0.5) * 22;
    let x, z, h;
    if (edge === 0) { x = bx + t; z = bz - BLOCK_SPREAD_Z; h = Math.PI / 2; }
    else if (edge === 1) { x = bx + t; z = bz + BLOCK_SPREAD_Z; h = Math.PI / 2; }
    else if (edge === 2) { x = bx - BLOCK_SPREAD_Z; z = bz + t; h = 0; }
    else { x = bx + BLOCK_SPREAD_Z; z = bz + t; h = 0; }
    spots.push({ x, z, h });
  }
  // parking lots on blocks (1,3) and (3,1)
  for (const [bi, bj] of [[1, 3], [3, 1]]) {
    const bx = BLOCKS[bi], bz = BLOCKS[bj];
    for (let i = 0; i < 5; i++) spots.push({ x: bx - 14 + i * 7, z: bz - 8, h: 0 });
    for (let i = 0; i < 4; i++) spots.push({ x: bx - 10 + i * 7, z: bz + 9, h: Math.PI });
  }
  for (const s of spots) {
    const style = STYLES[Math.floor(rng() * STYLES.length)];
    const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    const car = new Car(scene, style, color, s.x, s.z, s.h + (rng() - 0.5) * 0.06);
    cars.push(car);
  }
  return cars;
}
const BLOCK_SPREAD_Z = 40 / 2 + 1.7; // just off the block edge, on the road shoulder

// a few named colours for mission vehicles
export const VAN_COLOR = 0xff8c1a;
