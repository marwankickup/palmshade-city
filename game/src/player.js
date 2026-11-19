// player.js — the on-foot character: stylized figure, walk cycle, camera-
// relative movement, building collision and platform step-up.
import * as THREE from 'three';
import { clamp, lerp, lerpAngle, collideAABBs, platformHeightAt } from './util.js';

function limb(w, h, d, mat, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0); // pivot at the top so limbs swing from the joint
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class Player {
  constructor(scene) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xe2603f, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 });

    this.group = new THREE.Group();
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
    this.torso.position.y = 1.06; this.torso.castShadow = true;
    this.group.add(this.torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skin);
    head.position.y = 1.66; head.castShadow = true;
    this.group.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), hair);
    cap.position.y = 1.9; this.group.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.3), hair);
    brim.position.set(0, 1.84, 0.32); this.group.add(brim);
    this.armL = limb(0.17, 0.66, 0.17, shirt, -0.4, 1.36, 0);
    this.armR = limb(0.17, 0.66, 0.17, shirt, 0.4, 1.36, 0);
    this.legL = limb(0.21, 0.72, 0.21, pants, -0.16, 0.72, 0);
    this.legR = limb(0.21, 0.72, 0.21, pants, 0.16, 0.72, 0);
    this.group.add(this.armL, this.armR, this.legL, this.legR);
    scene.add(this.group);

    this.heading = Math.PI; // face the beach (east) at spawn
    this.health = 100;
    this.walkPhase = 0;
    this.speedNow = 0;
    this.lastDamageAt = -99;
    this.gunArm = 0; // raises right arm briefly after shooting
  }
  get pos() { return this.group.position; }
  place(x, z, heading = this.heading) {
    this.group.position.set(x, 0, z);
    this.heading = heading;
  }
  // input: {f, b, l, r, sprint} booleans; camYaw is the camera orbit yaw.
  update(dt, input, camYaw, colliders, platforms) {
    let mx = 0, mz = 0;
    if (input.f) mz += 1;
    if (input.b) mz -= 1;
    if (input.l) mx -= 1;
    if (input.r) mx += 1;
    const moving = (mx !== 0 || mz !== 0);
    const speed = input.sprint ? 8.4 : 4.6;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      // Camera sits at target + (sin yaw, cos yaw) * dist and looks back, so
      // its ground-projected forward is (-sin yaw, -cos yaw); right is that
      // vector rotated -90 degrees.
      const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw);
      const rightX = -fwdZ, rightZ = fwdX;
      const wx = fwdX * mz + rightX * mx;
      const wz = fwdZ * mz + rightZ * mx;
      const targetHeading = Math.atan2(wx, wz);
      this.heading = lerpAngle(this.heading, targetHeading, 1 - Math.exp(-12 * dt));
      const p = this.group.position;
      p.x += wx * speed * dt;
      p.z += wz * speed * dt;
      this.speedNow = lerp(this.speedNow, speed, 1 - Math.exp(-10 * dt));
      this.walkPhase += dt * (input.sprint ? 11 : 8);
    } else {
      this.speedNow = lerp(this.speedNow, 0, 1 - Math.exp(-10 * dt));
      this.walkPhase += dt * 2;
    }
    const p = this.group.position;
    // platforms: step up if the platform top is within reach, else it blocks
    const targetY = platformHeightAt(p.x, p.z, platforms);
    const curY = p.y;
    if (targetY > curY + 0.62) {
      // too tall to step: treat platform footprints as walls this frame
      const solids = platforms.filter((pl) => pl.h > curY + 0.62)
        .map((pl) => ({ minX: pl.minX, maxX: pl.maxX, minZ: pl.minZ, maxZ: pl.maxZ }));
      collideAABBs(p, 0.42, solids);
    }
    collideAABBs(p, 0.42, colliders);
    const newY = platformHeightAt(p.x, p.z, platforms);
    p.y = newY > curY + 0.62 ? curY : newY; // snap to ground (flat world + low platforms)
    p.x = clamp(p.x, -262, 262);
    p.z = clamp(p.z, -262, 262);

    // animation
    const sw = clamp(this.speedNow / 5, 0, 1.4) * 0.62;
    const ph = this.walkPhase;
    this.legL.rotation.x = Math.sin(ph) * sw;
    this.legR.rotation.x = -Math.sin(ph) * sw;
    this.armL.rotation.x = -Math.sin(ph) * sw * 0.8;
    if (this.gunArm > 0) {
      this.gunArm -= dt;
      this.armR.rotation.x = lerp(this.armR.rotation.x, -Math.PI / 2 + 0.12, 0.5);
    } else {
      this.armR.rotation.x = Math.sin(ph) * sw * 0.8;
    }
    this.torso.position.y = 1.06 + Math.abs(Math.sin(ph)) * 0.045 * clamp(this.speedNow / 4, 0, 1);
    this.group.rotation.y = this.heading;
    // slow health regen after 6 s without damage
    // (main owns the clock; it passes regen eligibility via this.canRegen)
    if (this.canRegen && this.health > 0) this.health = Math.min(100, this.health + dt * 2.2);
  }
  damage(n, t) {
    this.health = clamp(this.health - n, 0, 100);
    this.lastDamageAt = t;
  }
}
