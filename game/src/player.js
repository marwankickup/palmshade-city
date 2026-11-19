// player.js — stylized on-foot figure, walk cycle, WASD movement, step-up, health.
import * as THREE from 'three';
import { clamp, collideCircle, groundYAt, WORLD } from './util.js';

export function makeFigure(shirt, pants, skin = 0xd9a066, hair = 0x2c1c10) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), mat(shirt));
  torso.position.y = 1.06; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), mat(skin));
  head.position.y = 1.66; head.castShadow = true; g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), mat(hair));
  cap.position.y = 1.9; g.add(cap);
  const limbs = {};
  const mkLimb = (w, h, d, c, x, y, z) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.y = -h / 2; m.castShadow = true; pivot.add(m); g.add(pivot); return pivot;
  };
  limbs.armL = mkLimb(0.16, 0.62, 0.16, shirt, -0.4, 1.38, 0);
  limbs.armR = mkLimb(0.16, 0.62, 0.16, shirt, 0.4, 1.38, 0);
  limbs.legL = mkLimb(0.2, 0.72, 0.2, pants, -0.16, 0.72, 0);
  limbs.legR = mkLimb(0.2, 0.72, 0.2, pants, 0.16, 0.72, 0);
  // pistol in right hand (visible while on foot)
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5, metalness: 0.5 }));
  gun.position.set(0, -0.66, 0.1); limbs.armR.add(gun);
  g.userData.limbs = limbs;
  return g;
}

export class Player {
  constructor(scene) {
    this.group = makeFigure(0x148f77, 0xe8dcc0);
    scene.add(this.group);
    this.pos = this.group.position;
    this.pos.set(171, 0, -14);
    this.heading = Math.PI; // face along the promenade toward Café Marisol
    this.y = 0; this.vy = 0; this.health = 100;
    this.walkPhase = 0; this.moving = false; this.speedNow = 0;
  }
  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  // move: {x,z} camera-relative wish direction (world space, normalised), sprint bool
  update(dt, move, sprint, platforms, colliders) {
    const speed = sprint ? 8.4 : 5.2;
    this.moving = Math.abs(move.x) > 0.01 || Math.abs(move.z) > 0.01;
    if (this.moving) {
      const targetHeading = Math.atan2(move.x, move.z);
      let d = targetHeading - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, dt * 14);
      this.pos.x += move.x * speed * dt;
      this.pos.z += move.z * speed * dt;
      this.walkPhase += dt * (sprint ? 11 : 8.5);
      this.speedNow = speed;
    } else {
      this.speedNow = 0;
      this.walkPhase = 0;
    }
    this.pos.x = clamp(this.pos.x, WORLD.minX + 1, WORLD.maxX - 1);
    this.pos.z = clamp(this.pos.z, WORLD.minZ + 1, WORLD.maxZ - 1);
    // walls: colliders taller than the ground we stand on + step allowance
    const gy = groundYAt(platforms, this.pos.x, this.pos.z, this.y);
    const p = { x: this.pos.x, z: this.pos.z };
    collideCircle(p, 0.45, colliders.filter(c => c.h > gy + 0.95), 0);
    this.pos.x = p.x; this.pos.z = p.z;
    // vertical: step up instantly, fall (or jump) with gravity
    const target = groundYAt(platforms, this.pos.x, this.pos.z, this.y);
    if (this.vy > 0 || target < this.y - 0.001) {
      this.vy -= 26 * dt; this.y += this.vy * dt;
      if (this.y <= target) { this.y = target; this.vy = 0; }
    } else { this.y = target; this.vy = 0; }
    this.pos.y = this.y;
    this.group.rotation.y = this.heading;
    // walk cycle
    const L = this.group.userData.limbs;
    const sw = this.moving ? Math.sin(this.walkPhase) * 0.62 : 0;
    L.legL.rotation.x = sw; L.legR.rotation.x = -sw;
    L.armL.rotation.x = -sw * 0.8; L.armR.rotation.x = sw * 0.8;
    if (!this.moving) { L.legL.rotation.x = 0; L.legR.rotation.x = 0; L.armL.rotation.x = 0; L.armR.rotation.x = 0; }
  }
  jump() { if (this.vy === 0) this.vy = 7.6; }
  aimPose() {
    const L = this.group.userData.limbs;
    L.armR.rotation.x = -Math.PI / 2 + 0.12;
  }
}
