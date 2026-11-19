// vehicles.js — the car factory (6 silhouettes) and arcade driving physics.
import * as THREE from 'three';
import { clamp, lerp, collideAABBs } from './util.js';

export const CAR_COLORS = [0xd8544a, 0x3f7fbf, 0xf2b13c, 0x3fae8a, 0xe8e2d4, 0x8a5fb0, 0xef7fb0, 0x4a4f57, 0x7fb069, 0xe2603f];
export const CAR_TYPES = ['sedan', 'sport', 'convertible', 'pickup', 'van', 'police'];

const SPECS = {
  sedan:       { len: 4.3, wid: 1.9, bodyH: 0.62, cabH: 0.55, cabLen: 2.0, cabOff: -0.15, topSpeed: 34, accel: 15, grip: 3.4 },
  sport:       { len: 4.4, wid: 1.95, bodyH: 0.5, cabH: 0.42, cabLen: 1.7, cabOff: -0.3, topSpeed: 44, accel: 21, grip: 3.9 },
  convertible: { len: 4.3, wid: 1.9, bodyH: 0.58, cabH: 0.16, cabLen: 1.6, cabOff: -0.3, topSpeed: 38, accel: 17, grip: 3.6 },
  pickup:      { len: 4.9, wid: 2.0, bodyH: 0.72, cabH: 0.62, cabLen: 1.5, cabOff: 0.85, topSpeed: 32, accel: 14, grip: 3.2 },
  van:         { len: 5.1, wid: 2.05, bodyH: 1.5, cabH: 0.35, cabLen: 1.1, cabOff: 1.55, topSpeed: 29, accel: 12, grip: 3.0 },
  police:      { len: 4.6, wid: 1.95, bodyH: 0.6, cabH: 0.52, cabLen: 2.0, cabOff: -0.15, topSpeed: 42, accel: 20, grip: 3.9 },
};

const glassMat = new THREE.MeshStandardMaterial({ color: 0x1d2a38, roughness: 0.25, metalness: 0.4 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 1 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.35, metalness: 0.7 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe9a0, emissiveIntensity: 1.6 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0xb02020, emissive: 0xff2a2a, emissiveIntensity: 1.2 });

function box(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function buildCarMesh(type, color) {
  const s = SPECS[type];
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.8 });

  box(g, s.wid, s.bodyH, s.len, paint, 0, 0.42 + s.bodyH / 2, 0);                    // body
  box(g, s.wid * 0.92, 0.16, s.len * 0.96, dark, 0, 0.4, 0);                        // skirt
  if (type === 'van') {
    box(g, s.wid, s.cabH + 0.5, s.cabLen, paint, 0, 0.42 + s.bodyH + (s.cabH + 0.5) / 2 - 0.25, s.cabOff);
    box(g, s.wid * 0.9, 0.5, 0.1, glassMat, 0, 1.55, s.cabOff + s.cabLen / 2);
  } else if (type === 'convertible') {
    box(g, s.wid * 0.86, s.cabH, s.cabLen, dark, 0, 0.42 + s.bodyH + s.cabH / 2, s.cabOff); // open tub
    box(g, s.wid * 0.8, 0.34, 0.12, glassMat, 0, 0.42 + s.bodyH + 0.22, s.cabOff + s.cabLen / 2 + 0.2); // windshield
  } else {
    box(g, s.wid * 0.84, s.cabH, s.cabLen, paint, 0, 0.42 + s.bodyH + s.cabH / 2, s.cabOff);
    box(g, s.wid * 0.86, s.cabH * 0.62, s.cabLen * 0.94, glassMat, 0, 0.42 + s.bodyH + s.cabH * 0.45, s.cabOff);
  }
  if (type === 'sport') box(g, s.wid * 0.9, 0.09, 0.5, dark, 0, 1.12, -s.len / 2 + 0.4); // spoiler
  if (type === 'pickup') box(g, s.wid * 0.9, 0.3, 1.6, dark, 0, 0.95, -s.len / 2 + 1.0); // bed walls hint

  // wheels + hubcaps
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.37, 0.37, 0.26, 12);
  const hg = new THREE.CylinderGeometry(0.19, 0.19, 0.28, 10);
  for (const [wx, wz] of [[-s.wid / 2, s.len / 2 - 0.85], [s.wid / 2, s.len / 2 - 0.85], [-s.wid / 2, -s.len / 2 + 0.85], [s.wid / 2, -s.len / 2 + 0.85]]) {
    const w = new THREE.Mesh(wg, tyreMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.37, wz);
    w.castShadow = true;
    const hub = new THREE.Mesh(hg, hubMat);
    hub.rotation.z = Math.PI / 2;
    w.add(hub);
    g.add(w); wheels.push(w);
  }
  // lights
  box(g, 0.42, 0.14, 0.06, headMat, -s.wid / 2 + 0.35, 0.78, s.len / 2 + 0.01);
  box(g, 0.42, 0.14, 0.06, headMat, s.wid / 2 - 0.35, 0.78, s.len / 2 + 0.01);
  box(g, 0.42, 0.12, 0.06, tailMat, -s.wid / 2 + 0.35, 0.82, -s.len / 2 - 0.01);
  box(g, 0.42, 0.12, 0.06, tailMat, s.wid / 2 - 0.35, 0.82, -s.len / 2 - 0.01);

  let lightBar = null;
  if (type === 'police') {
    box(g, s.wid * 1.02, 0.3, s.len * 0.5, new THREE.MeshStandardMaterial({ color: 0x22242c, roughness: 0.6 }), 0, 0.62, 0.4);
    const lb = box(g, 1.25, 0.17, 0.42, dark, 0, 0.42 + s.bodyH + s.cabH + 0.1, s.cabOff);
    const red = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xff2222, emissiveIntensity: 0.4 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x112288, emissive: 0x2266ff, emissiveIntensity: 0.4 });
    const r = box(lb, 0.56, 0.15, 0.4, red, -0.32, 0.05, 0);
    const b = box(lb, 0.56, 0.15, 0.4, blue, 0.32, 0.05, 0);
    r.castShadow = b.castShadow = false;
    lightBar = { red, blue };
    const badge = box(g, s.wid * 0.5, 0.34, 0.02, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }), 0, 0.75, s.len / 2 + 0.02);
    badge.castShadow = false;
  }
  return { group: g, wheels, lightBar, spec: s };
}

let smokeTexCache = null;
function smokeTexture() {
  if (smokeTexCache) return smokeTexCache;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  gr.addColorStop(0, 'rgba(60,58,60,0.55)'); gr.addColorStop(1, 'rgba(60,58,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  smokeTexCache = new THREE.CanvasTexture(c);
  return smokeTexCache;
}

export class Car {
  constructor(scene, type, color, colliders) {
    const built = buildCarMesh(type, color);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.lightBar = built.lightBar;
    this.spec = built.spec;
    scene.add(this.mesh);
    this.type = type;
    this.colliders = colliders;
    this.heading = 0;
    this.speed = 0;              // m/s, signed
    this.steer = 0;
    this.health = 100;
    this.radius = 1.75;
    this.input = { throttle: 0, steer: 0, brake: false, handbrake: false };
    this.driver = null;          // 'player' | 'traffic' | 'police' | null (parked)
    this.wasStolen = false;
    this.lastHitAt = 0;
    this.smoke = null;
    this.smokeAcc = 0;
  }
  get pos() { return this.mesh.position; }
  place(x, z, heading) {
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.syncMesh();
  }
  syncMesh() {
    this.mesh.rotation.y = this.heading;
  }
  flashLights(t) {
    if (!this.lightBar) return;
    const ph = Math.floor(t * 2.6) % 2 === 0;
    this.lightBar.red.emissiveIntensity = ph ? 3.2 : 0.15;
    this.lightBar.blue.emissiveIntensity = ph ? 0.15 : 3.2;
  }
  // Integrate one physics step from this.input. Returns impact speed if a hard
  // wall hit happened this frame (for crash sounds / damage), else 0.
  update(dt, t) {
    const s = this.spec, inp = this.input;
    const top = s.topSpeed;
    if (inp.throttle > 0) this.speed += s.accel * inp.throttle * dt * (this.speed < 0 ? 2.2 : 1);
    else if (inp.throttle < 0) {
      if (this.speed > 0.6 && !inp.brake) this.speed += s.accel * inp.throttle * dt * 0.4;
      else this.speed += s.accel * inp.throttle * dt * 0.55; // reverse
    }
    if (inp.brake) this.speed = Math.abs(this.speed) < 0.4 ? 0 : this.speed - Math.sign(this.speed) * 30 * dt;
    // drag + rolling resistance
    this.speed -= this.speed * 0.35 * dt;
    if (Math.abs(this.speed) < 0.12 && inp.throttle === 0) this.speed = 0;
    this.speed = clamp(this.speed, -11, top);
    // steering: less at speed, scaled by direction of travel
    const steerTarget = inp.steer * clamp(1.15 - Math.abs(this.speed) / (top * 1.7), 0.32, 1);
    this.steer = lerp(this.steer, steerTarget, 1 - Math.exp(-8 * dt));
    const grip = inp.handbrake ? 1.4 : s.grip;
    if (Math.abs(this.speed) > 0.05) {
      // steer > 0 turns toward the driver's left; the speed sign makes
      // reverse steering behave like a real car.
      this.heading += this.steer * grip * dt * clamp(this.speed / 6, -1, 1);
    }
    if (inp.handbrake) this.speed -= this.speed * 1.6 * dt;
    const vx = Math.sin(this.heading) * this.speed, vz = Math.cos(this.heading) * this.speed;
    this.mesh.position.x += vx * dt;
    this.mesh.position.z += vz * dt;
    // building collision (circle vs AABB)
    const before = Math.abs(this.speed);
    if (collideAABBs(this.mesh.position, this.radius, this.colliders)) {
      if (before > 7) { this.damage((before - 6) * 2.4); this.lastHitAt = t; this.speed *= -0.18; return before; }
      this.speed *= 0.45;
    }
    this.mesh.position.x = clamp(this.mesh.position.x, -262, 168);
    this.mesh.position.z = clamp(this.mesh.position.z, -262, 262);
    this.syncMesh();
    // wheel spin + front wheel yaw
    const spin = (this.speed * dt) / 0.37;
    for (let i = 0; i < 4; i++) {
      this.wheels[i].rotation.x += spin;
      if (i < 2) this.wheels[i].rotation.y = -this.steer * 0.55;
    }
    // damage smoke
    if (this.health < 45) {
      this.smokeAcc += dt;
      if (!this.smoke) {
        this.smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, opacity: 0.7, depthWrite: false }));
        this.smoke.scale.setScalar(1.6);
        this.mesh.add(this.smoke);
        this.smoke.position.set(0, 1.5, this.spec.len / 2 - 0.4);
      }
      this.smoke.material.opacity = 0.35 + Math.sin(t * 7) * 0.15;
      const sc = 1.3 + Math.sin(t * 3.1) * 0.35 + (45 - this.health) * 0.012;
      this.smoke.scale.setScalar(sc);
    } else if (this.smoke) {
      this.mesh.remove(this.smoke); this.smoke = null;
    }
    return 0;
  }
  damage(n) { this.health = clamp(this.health - n, 0, 100); }
  get speedKmh() { return Math.abs(this.speed) * 3.6; }
}
