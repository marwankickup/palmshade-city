// vehicles.js — 6 car types, arcade physics, parked cars, damage smoke.
import * as THREE from 'three';
import { collide, clamp, mulberry32 } from './util.js';

export const cars = [];
export const CAR_TYPES = {
  sedan:       { len: 4.3, wid: 1.9, hgt: 0.62, cabinH: 0.55, maxSpeed: 28, accel: 15, colors: [0xb8bcc2, 0x707880, 0x94503c, 0x3c5a78] },
  sport:       { len: 4.4, wid: 1.95, hgt: 0.5, cabinH: 0.42, maxSpeed: 35, accel: 20, colors: [0xd23b2e, 0xf2a81c, 0x22262c, 0x2e7fd9] },
  convertible: { len: 4.3, wid: 1.9, hgt: 0.52, cabinH: 0.3, maxSpeed: 30, accel: 17, colors: [0xf2e3c2, 0x7fc4bd, 0xe2725b] },
  pickup:      { len: 4.9, wid: 2.0, hgt: 0.78, cabinH: 0.6, maxSpeed: 26, accel: 14, colors: [0x5a6e46, 0x8a8f96, 0x74584a] },
  van:         { len: 5.0, wid: 2.05, hgt: 1.15, cabinH: 0.75, maxSpeed: 24, accel: 13, colors: [0xe8e4da, 0xc7cfd6, 0xd9a441] },
  police:      { len: 4.5, wid: 1.95, hgt: 0.6, cabinH: 0.55, maxSpeed: 33, accel: 19, colors: [0x181c22] },
};
const _rng = mulberry32(777);

function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(70,70,70,0.55)'); gr.addColorStop(1, 'rgba(70,70,70,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let _smokeTex = null;

function flameTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 36, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.35, 'rgba(255,160,50,0.9)');
  gr.addColorStop(0.7, 'rgba(230,70,20,0.45)'); gr.addColorStop(1, 'rgba(160,20,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let _flameTex = null;

// main.js registers one handler: explosion damage, shake, ejection.
let explosionHandler = null;
export function setExplosionHandler(fn) { explosionHandler = fn; }

export function createCar(scene, type, x, z, heading = 0, color = null) {
  const spec = CAR_TYPES[type];
  const col = color !== null ? color : spec.colors[(Math.random() * spec.colors.length) | 0];
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.6, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2f42, roughness: 0.12, metalness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, spec.hgt, spec.len), bodyMat);
  body.position.y = 0.38 + spec.hgt / 2; body.castShadow = true; group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.82, spec.cabinH, spec.len * 0.48),
    type === 'convertible' ? darkMat : glassMat);
  cabin.position.set(0, 0.38 + spec.hgt + spec.cabinH / 2 - 0.04, -spec.len * 0.05);
  cabin.castShadow = true; group.add(cabin);
  if (type === 'van') { cabin.material = bodyMat; cabin.scale.set(1.02, 1, 1.7); cabin.position.z = -spec.len * 0.02; }
  if (type === 'pickup') { cabin.position.z = spec.len * 0.14; }
  // police livery stripe + light bar
  let lightMats = null;
  if (type === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.wid + 0.03, 0.3, spec.len * 0.5),
      new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4 }));
    stripe.position.set(0, 0.62, -spec.len * 0.05); group.add(stripe);
    const red = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xff2222, emissiveIntensity: 0.4 });
    const blu = new THREE.MeshStandardMaterial({ color: 0x112288, emissive: 0x2266ff, emissiveIntensity: 0.4 });
    const lb1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), red);
    lb1.position.set(-0.32, 0.38 + spec.hgt + spec.cabinH + 0.06, -spec.len * 0.05); group.add(lb1);
    const lb2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), blu);
    lb2.position.set(0.32, 0.38 + spec.hgt + spec.cabinH + 0.06, -spec.len * 0.05); group.add(lb2);
    lightMats = { red, blu };
  }
  // lights
  const hl = new THREE.MeshStandardMaterial({ color: 0x444433, emissive: 0xffe9a8, emissiveIntensity: 1.4 });
  const tl = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a22, emissiveIntensity: 1.1 });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), hl);
    h.position.set(sx * spec.wid * 0.32, 0.62, spec.len / 2 + 0.01); group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tl);
    t.position.set(sx * spec.wid * 0.32, 0.66, -spec.len / 2 - 0.01); group.add(t);
  }
  // wheels with hubcaps
  const wheelG = new THREE.CylinderGeometry(0.37, 0.37, 0.26, 12);
  const hubG = new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8);
  const wheelM = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });
  const hubM = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.3, metalness: 0.7 });
  const wheels = [], frontWheels = [];
  for (const [wx, wz, front] of [[-1, 1, 1], [1, 1, 1], [-1, -1, 0], [1, -1, 0]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx * (spec.wid / 2 - 0.02), 0.37, wz * (spec.len / 2 - 0.85));
    const w = new THREE.Mesh(wheelG, wheelM); w.rotation.z = Math.PI / 2; w.castShadow = true;
    const hub = new THREE.Mesh(hubG, hubM); hub.rotation.z = Math.PI / 2;
    pivot.add(w); pivot.add(hub); group.add(pivot);
    wheels.push(w); wheels.push(hub);
    if (front) frontWheels.push(pivot);
  }
  group.position.set(x, 0, z); group.rotation.y = heading;
  scene.add(group);
  if (!_smokeTex) _smokeTex = smokeTexture();
  if (!_flameTex) _flameTex = flameTexture();
  const car = {
    group, type, spec, speed: 0, heading, health: 100, driver: null,
    lightMats, wheels, frontWheels, radius: Math.max(spec.len, spec.wid) / 2 + 0.25,
    smoke: [], smokeT: 0, hitCooldown: 0, dead: false,
    // v9 state: fire/explosion, flat tires, PIT spin, garage upgrades
    fire: [], fireT: 0, burnT: 0, exploded: false, wreckT: 0,
    tiresFlat: 0, spin: 0, wobT: 0,
    topMul: 1, accMul: 1, armorMul: 1, nitroFuel: 1, nitroLvl: 0, boosting: false,
    hurt(n) { this.health -= n * (this.armorMul || 1); },
    _spawnFire(dt) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.07;
        const p = this.group.position;
        const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: _flameTex, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
        sp.position.set(p.x + fx * 1.2 + (Math.random() - 0.5) * 1.1, 0.95 + Math.random() * 0.5, p.z + fz * 1.2 + (Math.random() - 0.5) * 1.1);
        sp.scale.setScalar(0.9 + Math.random() * 0.8);
        sp.userData.life = 0; sp.userData.max = 0.34 + Math.random() * 0.22;
        this.group.parent.add(sp); this.fire.push(sp);
        const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: _smokeTex, transparent: true, opacity: 0.8, depthWrite: false }));
        sm.position.set(p.x, 1.6, p.z);
        sm.scale.setScalar(1.1); sm.userData.life = 0;
        this.group.parent.add(sm); this.smoke.push(sm);
      }
    },
    _updateFire(dt) {
      for (let i = this.fire.length - 1; i >= 0; i--) {
        const sp = this.fire[i]; sp.userData.life += dt;
        sp.position.y += dt * 1.9;
        sp.scale.multiplyScalar(Math.max(0.2, 1 - dt * 1.5));
        if (sp.userData.life > sp.userData.max) { sp.parent && sp.parent.remove(sp); this.fire.splice(i, 1); }
      }
    },
    _explode() {
      this.exploded = true; this.speed = 0; this.boosting = false;
      const p = this.group.position;
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: _flameTex, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
      fl.position.set(p.x, 1.7, p.z); fl.scale.setScalar(8.5);
      fl.userData.life = 0; fl.userData.max = 0.5;
      if (this.group.parent) { this.group.parent.add(fl); this.fire.push(fl); }
      for (let i = 0; i < 7; i++) {
        const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: _smokeTex, transparent: true, opacity: 0.85, depthWrite: false }));
        sm.position.set(p.x + (Math.random() - 0.5) * 2.4, 1.4 + Math.random(), p.z + (Math.random() - 0.5) * 2.4);
        sm.scale.setScalar(1.6 + Math.random()); sm.userData.life = -Math.random() * 0.3;
        if (this.group.parent) { this.group.parent.add(sm); this.smoke.push(sm); }
      }
      // char the wreck: clone materials so shared mats stay clean
      this.group.traverse(o => {
        if (o.isMesh && o.material && o.material.color) {
          o.material = o.material.clone();
          o.material.color.setHex(0x17181a);
          if (o.material.emissive) o.material.emissive.setHex(0x000000);
        }
      });
      this.lightMats = null;
      if (explosionHandler) explosionHandler(this);
    },
    update(dt, throttle, steer) {
      const s = this.spec;
      if (this.health <= 0) { throttle = 0; }
      // effective top speed: garage tuning, spike-strip damage, nitro boost
      let topSpeed = s.maxSpeed * this.topMul;
      if (this.tiresFlat > 0) { this.tiresFlat -= dt; topSpeed = Math.min(topSpeed, 7.5); }
      const boosting = this.boosting && this.nitroLvl > 0 && this.nitroFuel > 0 && throttle > 0 && this.health > 0;
      if (boosting) {
        topSpeed *= 1.3;
        this.nitroFuel = Math.max(0, this.nitroFuel - dt * 0.42 / (0.55 + 0.45 * this.nitroLvl));
      } else if (this.nitroLvl > 0) this.nitroFuel = Math.min(1, this.nitroFuel + dt * 0.07);
      const accel = s.accel * this.accMul * (boosting ? 1.7 : 1);
      if (throttle > 0) this.speed += accel * throttle * dt * (1 - Math.max(0, this.speed) / (topSpeed * 1.12));
      else if (throttle < 0) this.speed += (this.speed > 0.5 ? -26 : -9) * dt * -throttle * (this.speed < -10 ? 0.2 : 1);
      else this.speed -= this.speed * 0.7 * dt;
      if (Math.abs(this.speed) < 0.04 && throttle === 0) this.speed = 0;
      if (this.speed > topSpeed) this.speed = Math.max(topSpeed, this.speed - 16 * dt);
      this.speed = clamp(this.speed, -11, topSpeed * 1.15);
      const steerAuthority = clamp(Math.abs(this.speed) / 6, 0, 1) * (0.62 - clamp(Math.abs(this.speed) / s.maxSpeed, 0, 1) * 0.25);
      if (this.speed !== 0) this.heading += steer * steerAuthority * dt * Math.sign(this.speed) * 1.55;
      // PIT spin impulse + flat-tire wobble
      if (this.spin) {
        this.heading += this.spin * dt;
        this.spin *= Math.exp(-2.1 * dt);
        if (Math.abs(this.spin) < 0.02) this.spin = 0;
      }
      if (this.tiresFlat > 0 && Math.abs(this.speed) > 2) {
        this.wobT += dt * 26;
        this.heading += Math.sin(this.wobT) * 0.32 * dt;
      }
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      this.group.position.x += fx * this.speed * dt;
      this.group.position.z += fz * this.speed * dt;
      const p = this.group.position;
      const before = Math.abs(this.speed);
      collide(p, 1.55, 0, 0.45);
      if (Math.abs(p.x) > 330) { p.x = Math.sign(p.x) * 330; this.speed *= 0.4; }
      if (p.z > 330 || p.z < -330) { p.z = clamp(p.z, -330, 330); this.speed *= 0.4; }
      if (before > 6 && this._wasBlocked) { /* handled by main via overlap checks */ }
      this.group.rotation.y = this.heading;
      // wheel visuals
      const wr = this.speed * dt / 0.37;
      for (const w of this.wheels) w.rotation.x += wr;
      for (const pv of this.frontWheels) pv.rotation.y = steer * 0.42;
      // fire & explosion: health gone → burn ~1.5s → boom → smouldering wreck
      if (this.health <= 0 && !this.exploded) {
        this.burnT += dt;
        this._spawnFire(dt);
        if (this.burnT >= 1.5) this._explode();
      }
      if (this.fire.length) this._updateFire(dt);
      if (this.exploded && this.wreckT < 26) {
        this.wreckT += dt;
        this.smokeT -= dt;
        if (this.smokeT <= 0) {
          this.smokeT = 0.24;
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: _smokeTex, transparent: true, opacity: 0.6, depthWrite: false }));
          sp.position.copy(p).add(new THREE.Vector3(0, 1.2, 0));
          sp.scale.setScalar(0.9); sp.userData.life = 0;
          this.group.parent.add(sp); this.smoke.push(sp);
        }
      }
      // damage smoke
      if (this.health < 45 && this.health > 0) {
        this.smokeT -= dt;
        if (this.smokeT <= 0) {
          this.smokeT = 0.09;
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: _smokeTex, transparent: true, opacity: 0.75, depthWrite: false }));
          sp.position.copy(p).add(new THREE.Vector3(fx * 1.6, 1.1, fz * 1.6));
          sp.scale.setScalar(0.7); sp.userData.life = 0;
          this.group.parent.add(sp); this.smoke.push(sp);
        }
      }
      for (let i = this.smoke.length - 1; i >= 0; i--) {
        const sp = this.smoke[i]; sp.userData.life += dt;
        sp.position.y += dt * 2.2; sp.scale.setScalar(0.7 + sp.userData.life * 1.6);
        sp.material.opacity = 0.75 * (1 - sp.userData.life / 1.1);
        if (sp.userData.life > 1.1) { sp.parent.remove(sp); this.smoke.splice(i, 1); }
      }
      if (this.hitCooldown > 0) this.hitCooldown -= dt;
    },
  };
  cars.push(car);
  return car;
}
export function removeCar(scene, car) {
  scene.remove(car.group);
  for (const sp of car.smoke) sp.parent && sp.parent.remove(sp);
  for (const sp of car.fire || []) sp.parent && sp.parent.remove(sp);
  const i = cars.indexOf(car); if (i >= 0) cars.splice(i, 1);
}
export function flashLights(car, t) {
  if (!car.lightMats) return;
  const ph = (t * 2.4) % 1 < 0.5;
  car.lightMats.red.emissiveIntensity = ph ? 3.2 : 0.15;
  car.lightMats.blu.emissiveIntensity = ph ? 0.15 : 3.2;
}
// Parked cars sprinkled on road edges + the garage ground floor.
export function spawnParkedCars(scene) {
  const types = ['sedan', 'sport', 'convertible', 'pickup', 'van'];
  const r = mulberry32(4242);
  const spots = [];
  for (let i = 0; i < 30; i++) {
    const vertical = r() < 0.5;
    const road = [-180, -120, -60, 0, 60, 120, 180][(r() * 7) | 0];
    const along = -200 + r() * 400;
    const lane = (r() < 0.5 ? -5.2 : 5.2);
    const x = vertical ? road + lane : along;
    const z = vertical ? along : road + lane;
    if (Math.abs(x) > 205 || Math.abs(z) > 205) continue;
    if (Math.hypot(x - 172, z + 52) < 9) continue; // keep the café van spot clear
    spots.push({ x, z, heading: vertical ? (lane > 0 ? 0 : Math.PI) : (lane > 0 ? Math.PI / 2 : -Math.PI / 2) });
  }
  spots.push({ x: 82, z: 84, heading: Math.PI / 2 }, { x: 98, z: 96, heading: -Math.PI / 2 }, { x: 90, z: 102, heading: 0 });
  return spots.map(s => {
    const c = createCar(scene, types[(r() * types.length) | 0], s.x, s.z, s.heading);
    c.driver = 'parked';
    return c;
  });
}
