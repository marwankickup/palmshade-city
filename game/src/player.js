// player.js — the on-foot character: a stylized low-poly figure with a walk
// cycle, camera-relative WASD movement, sprinting, AABB collision with
// step-up onto low platforms (piers, terraces, crate stairs).

import * as THREE from 'three';
import { clamp, angleLerp, forwardOf } from './util.js';

// Shared figure builder — also used for pedestrians and NPCs.
export function buildFigure({ shirt = 0x17a398, pants = 0x33424e, skin = 0xe8b08a, cap = 0xe4572e } = {}) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const mkLimb = (w, h, d, c, x, y, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.y = -h / 2;
    m.castShadow = true;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  };
  const lLeg = mkLimb(0.17, 0.92, 0.19, pants, -0.13, 0.95, 0);
  const rLeg = mkLimb(0.17, 0.92, 0.19, pants, 0.13, 0.95, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.66, 0.28), mat(shirt));
  torso.position.y = 1.28; torso.castShadow = true;
  g.add(torso);
  const lArm = mkLimb(0.13, 0.78, 0.15, shirt, -0.34, 1.58, 0);
  const rArm = mkLimb(0.13, 0.78, 0.15, shirt, 0.34, 1.58, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), mat(skin));
  head.position.y = 1.82; head.castShadow = true;
  g.add(head);
  const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.38), mat(cap));
  capTop.position.y = 2.03;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.22), mat(cap));
  brim.position.set(0, 1.97, 0.26);
  g.add(capTop, brim);
  // a little pistol in the right hand (visible when shooting on foot)
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x22242a }));
  gun.position.set(0, -0.78, 0.1);
  rArm.add(gun);
  return { group: g, lLeg, rLeg, lArm, rArm, gun };
}

export class Player {
  constructor(scene) {
    const f = buildFigure({ shirt: 0xef476f, pants: 0x27313b, cap: 0xffd166 });
    this.group = f.group;
    this.parts = f;
    this.pos = this.group.position;
    this.pos.set(0, 0, 92);
    this.heading = Math.PI; // face north, toward the city
    this.health = 100;
    this.maxHealth = 100;
    this.speedNow = 0;
    this.walkPhase = 0;
    this.inVehicle = null;
    this.dead = false;
    scene.add(this.group);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  placeAt(x, z, heading = this.heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.group.rotation.y = heading;
  }

  update(dt, input, city, camYaw) {
    if (this.inVehicle || this.dead) { this.speedNow = 0; return; }
    // camera-relative movement direction
    let mx = 0, mz = 0;
    const f = forwardOf(camYaw), r = { x: -f.z, z: f.x }; // right = forward x up
    if (input.f) { mx += f.x; mz += f.z; }
    if (input.b) { mx -= f.x; mz -= f.z; }
    if (input.r) { mx += r.x; mz += r.z; }
    if (input.l) { mx -= r.x; mz -= r.z; }
    const len = Math.hypot(mx, mz);
    const moving = len > 0.01;
    const speed = input.sprint ? 8.2 : 5.0;
    if (moving) {
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, targetHeading, Math.min(1, dt * 14));
      let nx = this.pos.x + mx * speed * dt;
      let nz = this.pos.z + mz * speed * dt;
      // step UP instantly (so a staircase reads as steps, not walls), then
      // collide at the new height, then settle onto the ground below.
      const up = city.groundAt(nx, nz, this.pos.y);
      if (up > this.pos.y) this.pos.y = up;
      const res = city.collideCircle(nx, nz, 0.38, this.pos.y);
      nx = res.x; nz = res.z;
      this.pos.x = clamp(nx, -192, 192);
      this.pos.z = clamp(nz, -176, 224);
      this.speedNow = speed;
      this.walkPhase += dt * (input.sprint ? 11 : 8.5);
    } else {
      this.speedNow = 0;
      this.walkPhase = 0;
    }
    const gy = city.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (gy > this.pos.y) this.pos.y = gy;
    else this.pos.y = Math.max(gy, this.pos.y - 9 * dt); // capped fall speed
    this.group.rotation.y = this.heading;
    // walk cycle
    const sw = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.parts.lLeg.rotation.x = sw;
    this.parts.rLeg.rotation.x = -sw;
    this.parts.lArm.rotation.x = -sw * 0.8;
    this.parts.rArm.rotation.x = sw * 0.8;
    if (!moving) {
      this.parts.lLeg.rotation.x *= 0.8; this.parts.rLeg.rotation.x *= 0.8;
      this.parts.lArm.rotation.x *= 0.8; this.parts.rArm.rotation.x *= 0.8;
    }
  }
}
