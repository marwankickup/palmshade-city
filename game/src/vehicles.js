// Car factory + arcade physics. Kinds: sedan, sport, convertible, pickup, van,
// police interceptor. Bodies are box-built with cabins, hubcapped wheels and
// emissive head/taillights; police get a flashing light bar. Damage → smoke →
// dead engine.
import * as THREE from 'three';
import { clamp, collideCircle } from './util.js';

export const CAR_KINDS = {
  sedan: { maxSpeed: 24, accel: 13, len: 4.2, wid: 1.85, radius: 1.95 },
  sport: { maxSpeed: 31, accel: 18, len: 4.4, wid: 1.9, radius: 2.0 },
  convertible: { maxSpeed: 27, accel: 15, len: 4.2, wid: 1.85, radius: 1.95 },
  pickup: { maxSpeed: 22, accel: 12, len: 4.5, wid: 1.95, radius: 2.05 },
  van: { maxSpeed: 20, accel: 11, len: 4.5, wid: 1.98, radius: 2.1 },
  police: { maxSpeed: 29, accel: 17, len: 4.3, wid: 1.9, radius: 2.0 },
};
export const CAR_COLORS = [0xd94f3d, 0x3f7fbf, 0xf2c14e, 0x62b06e, 0xe8e3d9, 0x884ea0, 0x2e86ab, 0xe67e22, 0xec87bf, 0x566573];

let smokeTex = null;
function getSmokeTex() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, 'rgba(70,70,70,0.55)');
  rg.addColorStop(1, 'rgba(70,70,70,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

const glassMat = new THREE.MeshStandardMaterial({ color: 0x223544, roughness: 0.22, metalness: 0.45 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.95 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.35, metalness: 0.6 });
const bumperMat = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.7 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

function box(w, h, d, mat, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (shadow) m.castShadow = true;
  parent.add(m);
  return m;
}

function buildBody(kind, color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.25 });
  const parts = { wheels: [], frontWheels: [] };

  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 12);
  const hubGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.32, 10);
  function wheel(x, z, front) {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    w.add(tire, hub);
    w.position.set(x, 0.37, z);
    g.add(w);
    parts.wheels.push(w);
    if (front) parts.frontWheels.push(w);
    return w;
  }

  if (kind === 'van') {
    box(1.98, 1.55, 4.5, paint, 0, 1.15, 0, g);
    box(1.9, 0.5, 0.9, glassMat, 0, 1.45, 1.95, g);         // windshield block
    box(2.0, 0.35, 0.5, bumperMat, 0, 0.32, 2.3, g);
    box(2.0, 0.35, 0.5, bumperMat, 0, 0.32, -2.3, g);
    wheel(-0.95, 1.45, true); wheel(0.95, 1.45, true);
    wheel(-0.95, -1.45, false); wheel(0.95, -1.45, false);
  } else if (kind === 'pickup') {
    box(1.95, 0.62, 4.5, paint, 0, 0.62, 0, g);
    box(1.8, 0.62, 1.7, paint, 0, 1.2, 0.85, g);            // cab
    box(1.66, 0.45, 1.5, glassMat, 0, 1.24, 0.85, g);
    box(1.9, 0.4, 1.9, paint, 0, 1.05, -1.25, g);           // bed walls hint
    box(2.0, 0.35, 0.4, bumperMat, 0, 0.32, 2.3, g);
    box(2.0, 0.35, 0.4, bumperMat, 0, 0.32, -2.3, g);
    wheel(-0.95, 1.5, true); wheel(0.95, 1.5, true);
    wheel(-0.95, -1.5, false); wheel(0.95, -1.5, false);
  } else {
    // sedan / sport / convertible / police share a silhouette family
    const low = kind === 'sport' ? 0.12 : 0;
    box(1.88, 0.58 - low, 4.3, paint, 0, 0.6 - low / 2, 0, g);
    box(1.7, 0.16, 1.1, paint, 0, 0.92 - low, 1.35, g);     // hood hint
    if (kind === 'convertible') {
      box(1.7, 0.3, 2.1, paint, 0, 0.98, -0.35, g);         // open tub
      box(0.62, 0.34, 0.5, bumperMat, -0.42, 1.05, -0.6, g); // seats
      box(0.62, 0.34, 0.5, bumperMat, 0.42, 1.05, -0.6, g);
      const shield = box(1.66, 0.5, 0.07, glassMat, 0, 1.25, 0.62, g);
      shield.rotation.x = -0.3;
    } else {
      box(1.68, 0.55, 2.05, glassMat, 0, 1.12 - low, -0.25, g); // glasshouse
      box(1.74, 0.1, 2.1, paint, 0, 1.42 - low, -0.25, g);      // roof
    }
    if (kind === 'sport') {
      box(1.7, 0.09, 0.5, bumperMat, 0, 1.0, -2.05, g);     // spoiler
      box(0.09, 0.22, 0.3, bumperMat, -0.6, 0.85, -2.0, g);
      box(0.09, 0.22, 0.3, bumperMat, 0.6, 0.85, -2.0, g);
    }
    box(1.92, 0.3, 0.35, bumperMat, 0, 0.3, 2.18, g);
    box(1.92, 0.3, 0.35, bumperMat, 0, 0.3, -2.18, g);
    wheel(-0.92, 1.42, true); wheel(0.92, 1.42, true);
    wheel(-0.92, -1.42, false); wheel(0.92, -1.42, false);
  }

  // lights
  const hl = kind === 'van' ? 2.32 : 2.2;
  box(0.42, 0.14, 0.06, headMat, -0.62, 0.72, hl, g, false);
  box(0.42, 0.14, 0.06, headMat, 0.62, 0.72, hl, g, false);
  box(0.42, 0.12, 0.06, tailMat, -0.62, 0.74, -hl, g, false);
  box(0.42, 0.12, 0.06, tailMat, 0.62, 0.74, -hl, g, false);

  if (kind === 'police') {
    box(1.7, 0.34, 0.06, bumperMat, -0.96, 0.75, 0.4, g, false); // door stripe hints
    box(1.7, 0.34, 0.06, bumperMat, 0.96, 0.75, 0.4, g, false);
    const barBase = box(1.15, 0.1, 0.44, bumperMat, 0, 1.55, -0.25, g);
    barBase.castShadow = false;
    parts.lightRed = box(0.52, 0.16, 0.4, new THREE.MeshBasicMaterial({ color: 0xff2222 }), -0.29, 1.66, -0.25, g, false);
    parts.lightBlue = box(0.52, 0.16, 0.4, new THREE.MeshBasicMaterial({ color: 0x2266ff }), 0.29, 1.66, -0.25, g, false);
  }
  return { group: g, parts };
}

export class Car {
  constructor(scene, kind, color, x = 0, z = 0, heading = 0) {
    this.kind = kind;
    this.spec = CAR_KINDS[kind];
    const { group, parts } = buildBody(kind, color);
    this.group = group;
    this.parts = parts;
    this.group.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.health = 100;
    this.input = { throttle: 0, steer: 0, brake: false };
    this.occupiedBy = null;       // 'player' | 'traffic' | 'police' | null
    this.stolen = false;
    this.missionVehicle = false;
    this.dead = false;
    this._smokeTimer = 0;
    this._smokes = [];
    scene.add(group);
    this.syncTransform();
  }

  get pos() { return this.group.position; }
  forwardX() { return Math.sin(this.heading); }
  forwardZ() { return Math.cos(this.heading); }
  get speedRatio() { return Math.abs(this.speed) / this.spec.maxSpeed; }

  syncTransform() {
    this.group.rotation.y = this.heading;
  }

  // Advance physics one step. Returns impact intensity (0 = none) for crash sfx/crimes.
  update(dt, colliders, t) {
    const spec = this.spec;
    const inp = this.input;
    let impact = 0;
    if (!this.dead) {
      if (inp.throttle > 0) this.speed += spec.accel * inp.throttle * dt;
      else if (inp.throttle < 0) this.speed += spec.accel * 0.7 * inp.throttle * dt;
      if (inp.brake) this.speed -= Math.sign(this.speed) * 26 * dt;
      // drag + rolling resistance
      this.speed -= this.speed * 0.55 * dt;
      if (inp.throttle === 0 && !inp.brake) this.speed -= Math.sign(this.speed) * 1.6 * dt;
      if (Math.abs(this.speed) < 0.12 && inp.throttle === 0) this.speed = 0;
      this.speed = clamp(this.speed, -9, spec.maxSpeed);
      // steering scales with speed, reverses in reverse
      const steerAuthority = clamp(this.speed / 7, -1.25, 1.25);
      this.heading -= inp.steer * steerAuthority * 1.65 * dt;
    } else {
      this.speed -= this.speed * 3 * dt;
    }

    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.forwardX() * this.speed * dt;
    this.pos.z += this.forwardZ() * this.speed * dt;

    // two collision circles (front/rear) read much better than one for a long car
    let hit = 0;
    for (const off of [1.25, -1.25]) {
      const p = { x: this.pos.x + this.forwardX() * off, z: this.pos.z + this.forwardZ() * off };
      if (collideCircle(p, 1.05, colliders)) {
        this.pos.x += p.x - (this.pos.x + this.forwardX() * off);
        this.pos.z += p.z - (this.pos.z + this.forwardZ() * off);
        hit = 1;
      }
    }
    if (hit) {
      const spd = Math.abs(this.speed);
      if (spd > 3.5) {
        impact = clamp(spd / 16, 0.2, 1);
        this.damage(spd * 1.1);
      }
      this.speed = -this.speed * 0.22;
      this.pos.x = ox + (this.pos.x - ox) * 0.4;
      this.pos.z = oz + (this.pos.z - oz) * 0.4;
    }

    // world bounds + water barrier
    this.pos.x = clamp(this.pos.x, -196, 172);
    this.pos.z = clamp(this.pos.z, -176, 176);

    this.syncTransform();
    // wheel spin + front steer visuals
    const spin = (this.speed * dt) / 0.37;
    for (const w of this.parts.wheels) w.rotation.x += spin;
    for (const w of this.parts.frontWheels) w.rotation.y = -inp.steer * 0.42;

    // police light bar strobing
    if (this.parts.lightRed) {
      const phase = Math.sin(t * 11) > 0;
      this.parts.lightRed.material.color.setHex(phase ? 0xff2222 : 0x661111);
      this.parts.lightBlue.material.color.setHex(phase ? 0x112266 : 0x2266ff);
    }
    this._updateSmoke(dt);
    return impact;
  }

  damage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.dead = true;
      this.speed = 0;
    }
  }

  repair() {
    this.health = 100;
    this.dead = false;
  }

  _updateSmoke(dt) {
    // recycle a small pool of smoke sprites from the hood when hurt
    if (this.health < 48 && !this._smokePool) {
      this._smokePool = [];
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSmokeTex(), transparent: true, opacity: 0, depthWrite: false }));
        s.scale.setScalar(0.8);
        this.group.add(s);
        this._smokePool.push({ s, life: Math.random() });
      }
    }
    if (!this._smokePool) return;
    const rate = this.dead ? 0.5 : 1.1;
    for (const p of this._smokePool) {
      p.life += dt * rate;
      if (p.life > 1) p.life = 0;
      const l = p.life;
      p.s.position.set(0, 1 + l * 2.4, 1.5);
      p.s.scale.setScalar(0.7 + l * 2.2);
      p.s.material.opacity = (this.health < 48 ? 0.5 : 0) * (1 - l) * l * 4 * 0.4;
    }
  }
}

export function randomKind(rng, policeBias = false) {
  if (policeBias) return 'police';
  const kinds = ['sedan', 'sedan', 'sport', 'convertible', 'pickup', 'van'];
  return kinds[(rng() * kinds.length) | 0];
}
