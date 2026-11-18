// Cars for Palmshade City: a small factory that builds stylised low-poly vehicles from
// boxes and cylinders (sedan, sport, van, pickup, and the black-and-white police
// interceptor with its flashing light bar), plus the arcade driving model every car
// shares — player, traffic and police all steer through driveCar(), which handles
// acceleration, steering, building collisions and car-to-car bumps. Badly damaged cars
// smoke from a shared sprite pool.

import * as THREE from 'three';
import { clamp, lerp, rand, pick, circleVsBox } from './util.js';

export const CAR_COLORS = [0xd64541, 0x2e86de, 0xf5b041, 0x27ae60, 0xecf0f1, 0x8e44ad, 0xfd79a8, 0x00cec9, 0xe17055, 0x74b9ff, 0xffeaa7, 0x636e72];

const matCache = new Map();
function mat(color, emissive = 0x000000, emissiveIntensity = 0) {
  const key = `${color}|${emissive}|${emissiveIntensity}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({
      color,
      emissive: new THREE.Color(emissive),
      emissiveIntensity,
    }));
  }
  return matCache.get(key);
}

const boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const key = `${w}|${h}|${d}`;
  if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return boxGeoCache.get(key);
}

function box(parent, w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10);
wheelGeo.rotateZ(Math.PI / 2); // axle along X, so the wheel rolls about its local X
const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8);
hubGeo.rotateZ(Math.PI / 2);

let nextCarId = 1;

/**
 * Build a car and add it to the scene. Options: style ('sedan' | 'sport' | 'van' |
 * 'pickup' | 'police'), color, x, z, heading. The returned object is the car's whole
 * state: physics, health, who is driving it, and the bits police.js flashes.
 */
export function createCar(scene, opts = {}) {
  const style = opts.style || 'sedan';
  const isPolice = style === 'police';
  const color = isPolice ? 0xf2f3f4 : (opts.color ?? pick(CAR_COLORS));
  const group = new THREE.Group();
  const body = mat(color);
  const dark = mat(0x22262b);
  const glass = mat(0x2c3e50, 0x6fb7d6, 0.25);
  const chrome = mat(0xbdc3c7);

  const wheels = [];
  const frontPivots = [];
  function wheel(x, z, steered) {
    const pivot = new THREE.Group(); // steers about Y (front wheels)
    pivot.position.set(x, 0.37, z);
    const spin = new THREE.Group(); // rolls about X
    const tyre = new THREE.Mesh(wheelGeo, dark);
    tyre.castShadow = true;
    spin.add(tyre);
    const hub = new THREE.Mesh(hubGeo, chrome);
    spin.add(hub);
    pivot.add(spin);
    group.add(pivot);
    wheels.push(spin);
    if (steered) frontPivots.push(pivot);
    return pivot;
  }

  let halfLen = 2.2;
  let topSpeed = 37;
  if (style === 'sedan' || isPolice) {
    box(group, 1.9, 0.55, 4.4, body, 0, 0.62, 0); // lower body
    box(group, 1.7, 0.5, 2.2, glass, 0, 1.12, -0.2); // cabin glass
    box(group, 1.76, 0.12, 2.3, body, 0, 1.4, -0.2); // roof
    box(group, 1.94, 0.22, 0.5, body, 0, 0.5, 2.05); // nose
    wheel(-0.88, 1.45, true); wheel(0.88, 1.45, true);
    wheel(-0.88, -1.45, false); wheel(0.88, -1.45, false);
    if (isPolice) {
      box(group, 1.94, 0.3, 1.1, dark, 0, 0.68, 0.9); // black hood panel
      box(group, 1.94, 0.3, 1.1, dark, 0, 0.68, -1.5); // black trunk panel
    }
  } else if (style === 'sport') {
    box(group, 1.9, 0.42, 4.3, body, 0, 0.52, 0);
    box(group, 1.6, 0.4, 1.7, glass, 0, 0.9, -0.35);
    box(group, 1.7, 0.1, 0.7, body, 0, 0.86, -1.95); // spoiler
    box(group, 0.12, 0.22, 0.5, dark, -0.7, 0.68, -1.95);
    box(group, 0.12, 0.22, 0.5, dark, 0.7, 0.68, -1.95);
    wheel(-0.9, 1.4, true); wheel(0.9, 1.4, true);
    wheel(-0.9, -1.4, false); wheel(0.9, -1.4, false);
    topSpeed = 46;
  } else if (style === 'van') {
    box(group, 2.0, 1.5, 5.0, body, 0, 1.15, -0.3); // cargo box
    box(group, 2.0, 0.85, 1.1, body, 0, 0.82, 2.25); // cab
    box(group, 1.8, 0.5, 0.12, glass, 0, 1.05, 2.82); // windshield
    box(group, 1.7, 0.6, 3.4, mat(0xffffff), 0, 1.3, -0.55); // white panel sides read as a delivery van
    wheel(-0.92, 1.7, true); wheel(0.92, 1.7, true);
    wheel(-0.92, -1.7, false); wheel(0.92, -1.7, false);
    halfLen = 2.6;
    topSpeed = 30;
  } else { // pickup
    box(group, 1.95, 0.6, 4.9, body, 0, 0.66, 0);
    box(group, 1.8, 0.55, 1.6, glass, 0, 1.2, 0.75);
    box(group, 1.86, 0.12, 1.7, body, 0, 1.52, 0.75);
    box(group, 1.8, 0.35, 1.9, dark, 0, 0.95, -1.35); // open bed
    wheel(-0.9, 1.6, true); wheel(0.9, 1.6, true);
    wheel(-0.9, -1.6, false); wheel(0.9, -1.6, false);
    halfLen = 2.45;
    topSpeed = 34;
  }

  // Headlights and taillights.
  const headMat = mat(0xfff3b0, 0xffe98a, 0.9);
  const tailMat = mat(0x881111, 0xff2222, 0.7);
  box(group, 0.34, 0.16, 0.08, headMat, -0.62, 0.66, halfLen - 0.02);
  box(group, 0.34, 0.16, 0.08, headMat, 0.62, 0.66, halfLen - 0.02);
  box(group, 0.34, 0.14, 0.08, tailMat, -0.62, 0.7, -halfLen + 0.02);
  box(group, 0.34, 0.14, 0.08, tailMat, 0.62, 0.7, -halfLen + 0.02);

  let lights = null;
  if (isPolice) {
    box(group, 1.3, 0.12, 0.4, dark, 0, 1.52, -0.2); // light bar base
    const redMat = new THREE.MeshLambertMaterial({ color: 0x550000, emissive: new THREE.Color(0xff2020), emissiveIntensity: 0.2 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x000055, emissive: new THREE.Color(0x2266ff), emissiveIntensity: 0.2 });
    const red = box(group, 0.55, 0.16, 0.34, redMat, -0.33, 1.64, -0.2);
    const blue = box(group, 0.55, 0.16, 0.34, blueMat, 0.33, 1.64, -0.2);
    lights = { red: redMat, blue: blueMat, redMesh: red, blueMesh: blue, phase: rand(Math.PI * 2) };
  }

  group.position.set(opts.x || 0, 0, opts.z || 0);
  scene.add(group);

  const car = {
    id: nextCarId++,
    style,
    isPolice,
    group,
    heading: opts.heading || 0,
    speed: 0,
    steerVis: 0,
    health: 100,
    topSpeed,
    radius: 2.15,
    halfLen,
    driver: null, // null | 'player' | 'traffic' | 'police'
    claimed: false, // the player has taken this car before (no second theft charge)
    parked: !!opts.parked,
    wheels,
    frontPivots,
    lights,
    smokeAcc: 0,
    updateVisual(dt) {
      group.rotation.y = this.heading;
      const spin = (this.speed * dt) / 0.37;
      for (const w of this.wheels) w.rotation.x += spin;
      for (const p of this.frontPivots) p.rotation.y = this.steerVis * 0.42;
    },
  };
  group.rotation.y = car.heading;
  return car;
}

// ---- damage smoke -------------------------------------------------------------

let smokePool = null;

function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(60,60,60,0.55)');
  grad.addColorStop(1, 'rgba(60,60,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Create the shared smoke sprite pool. Call once. */
export function initSmoke(scene) {
  const tex = makeSmokeTexture();
  smokePool = [];
  for (let i = 0; i < 70; i += 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    s.scale.set(1, 1, 1);
    s.visible = false;
    scene.add(s);
    smokePool.push({ sprite: s, life: 0, maxLife: 1, vel: new THREE.Vector3() });
  }
}

let smokeCursor = 0;
/** Puff a little smoke (or dust, or a spark burst) at a point. */
export function puff(x, y, z, scale = 1.4, dark = true) {
  if (!smokePool) return;
  const p = smokePool[smokeCursor];
  smokeCursor = (smokeCursor + 1) % smokePool.length;
  p.sprite.visible = true;
  p.sprite.position.set(x, y, z);
  p.sprite.material.opacity = dark ? 0.5 : 0.3;
  p.sprite.scale.set(scale, scale, 1);
  p.vel.set(rand(-0.4, 0.4), rand(1.2, 2.2), rand(-0.4, 0.4));
  p.life = 0;
  p.maxLife = rand(0.7, 1.3);
  p.grow = scale;
}

/** Animate smoke and let wrecked cars smoulder. Call every frame with all cars. */
export function updateSmoke(dt, cars) {
  if (smokePool) {
    for (const p of smokePool) {
      if (!p.sprite.visible) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.sprite.visible = false;
        continue;
      }
      const t = p.life / p.maxLife;
      p.sprite.position.addScaledVector(p.vel, dt);
      const s = p.grow * (1 + t * 1.8);
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = 0.5 * (1 - t);
    }
  }
  for (const car of cars) {
    if (car.health < 45 && car.health > 0) {
      car.smokeAcc += dt * (car.health < 22 ? 9 : 4);
      while (car.smokeAcc > 1) {
        car.smokeAcc -= 1;
        const fx = Math.sin(car.heading) * car.halfLen * 0.8;
        const fz = Math.cos(car.heading) * car.halfLen * 0.8;
        puff(car.group.position.x + fx, 1.1, car.group.position.z + fz, rand(1, 1.9));
      }
    }
  }
}

/** Hurt a car; returns the damage actually applied. */
export function damageCar(car, amount) {
  car.health = Math.max(0, car.health - amount);
  return amount;
}

/**
 * The arcade driving model. input: { throttle: -1..1, steer: -1..1, handbrake: bool }.
 * world: { colliders, cars, onCrash(car, otherCarOrNull, impactSpeed, x, z) }.
 * Mutates car.speed / car.heading / car.group.position. Returns impact speed (0 = none).
 */
export function driveCar(car, dt, input, world) {
  const accel = 15;
  const maxReverse = -11;
  const top = car.topSpeed * (car.health <= 0 ? 0.25 : car.health < 30 ? 0.6 : 1);

  if (input.throttle > 0) {
    car.speed += accel * input.throttle * dt * (car.speed < 0 ? 2.2 : 1); // braking while rolling back
  } else if (input.throttle < 0) {
    car.speed += accel * 1.4 * input.throttle * dt * (car.speed > 0.5 ? 1.6 : 0.8); // brake, then reverse
  } else {
    car.speed -= car.speed * 0.55 * dt; // engine braking / drag
  }
  car.speed -= car.speed * Math.abs(car.speed) * 0.006 * dt; // air drag
  if (input.handbrake) car.speed -= car.speed * 2.4 * dt;
  car.speed = clamp(car.speed, maxReverse, Math.max(top, 0));

  // Steering bites in proportion to speed; the authority carries the sign of the speed,
  // so reversing swings the nose the way a real car's does. Handbrake turns harder.
  // Convention: steer +1 (the D key) turns right, i.e. the heading grows.
  const steerAuthority = clamp(car.speed / 9, -1, 1);
  const turnRate = input.steer * steerAuthority * (input.handbrake ? 2.5 : 1.65);
  car.heading += turnRate * dt;
  car.steerVis = clamp(lerp(car.steerVis, input.steer, dt * 8), -1, 1);

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const pos = car.group.position;
  pos.x += fx * car.speed * dt;
  pos.z += fz * car.speed * dt;

  let impact = 0;

  // Buildings: circle vs footprint boxes.
  for (const box of world.colliders) {
    const hit = circleVsBox(pos.x, pos.z, car.radius, box);
    if (hit) {
      pos.x += hit.x * hit.depth;
      pos.z += hit.z * hit.depth;
      const into = -(fx * hit.x + fz * hit.z); // how head-on the wall is
      const hitSpeed = Math.abs(car.speed) * Math.max(0.25, into);
      if (hitSpeed > impact) impact = hitSpeed;
      if (hitSpeed > 2.5) {
        damageCar(car, hitSpeed * 1.1);
        if (world.onCrash) world.onCrash(car, null, hitSpeed, pos.x, pos.z);
      }
      car.speed *= into > 0.3 ? -0.28 : 0.55;
    }
  }

  // Other cars: soft circles, swap a little momentum, dent both.
  for (const other of world.cars) {
    if (other === car) continue;
    const dx = pos.x - other.group.position.x;
    const dz = pos.z - other.group.position.z;
    const rr = car.radius + other.radius - 0.35;
    const d2 = dx * dx + dz * dz;
    if (d2 > rr * rr || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    const overlap = rr - d;
    const otherMovable = other.driver !== null || !other.parked;
    pos.x += nx * overlap * (otherMovable ? 0.55 : 0.9);
    pos.z += nz * overlap * (otherMovable ? 0.55 : 0.9);
    if (otherMovable) {
      other.group.position.x -= nx * overlap * 0.45;
      other.group.position.z -= nz * overlap * 0.45;
    }
    const relSpeed = Math.abs(car.speed) + (other.driver ? Math.abs(other.speed) * 0.4 : 0);
    if (relSpeed > 3) {
      if (relSpeed > impact) impact = relSpeed;
      damageCar(car, relSpeed * 0.55);
      damageCar(other, relSpeed * 0.55);
      if (world.onCrash) world.onCrash(car, other, relSpeed, pos.x, pos.z);
      car.speed *= 0.45;
      if (other.driver) other.speed *= 0.6;
    } else {
      car.speed *= 0.8;
    }
  }

  car.updateVisual(dt);
  return impact;
}

/**
 * Steering helper for AI drivers: build a driveCar input that chases a ground point.
 * Returns { throttle, steer, handbrake:false } — throttle eases off for sharp turns and
 * the car reverses briefly when the target is right behind it.
 */
export function steerToward(car, tx, tz, opts = {}) {
  const pos = car.group.position;
  const dx = tx - pos.x;
  const dz = tz - pos.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  const diff = ((desired - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const steer = clamp(diff * 1.6, -1, 1);
  let throttle = opts.throttle ?? 1;
  if (Math.abs(diff) > 2.4 && dist < 9 && car.speed < 2) {
    // Target is behind and we are nearly stopped: back up and swing round.
    return { throttle: -0.8, steer: -steer, handbrake: false, dist, diff };
  }
  if (Math.abs(diff) > 1.1) throttle *= 0.45;
  if (opts.slowFor && dist < opts.slowFor) throttle *= clamp(dist / opts.slowFor, 0.25, 1);
  if (opts.stopAt && dist < opts.stopAt) throttle = car.speed > 0.5 ? -0.7 : 0;
  return { throttle, steer, handbrake: false, dist, diff };
}
