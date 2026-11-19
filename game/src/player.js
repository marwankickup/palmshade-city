// player.js — stylized on-foot figure: walk cycle, sprint, step-up, health.
import * as THREE from 'three';
import { collide, groundAt, clamp, angleLerp, wrapAngle } from './util.js';

export function createFigure({ shirt = 0xe2725b, pants = 0x2e3d52, skin = 0xc98a5e, hat = 0xf2c14e } = {}) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.78, 0.24), mat(pants));
  const legR = legL.clone();
  legL.geometry.translate(0, -0.39, 0); legR.geometry = legL.geometry;
  legL.position.set(-0.13, 0.8, 0); legR.position.set(0.13, 0.8, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.3), mat(shirt));
  torso.position.y = 1.14;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.17), mat(shirt));
  const armR = armL.clone();
  armL.geometry.translate(0, -0.26, 0); armR.geometry = armL.geometry;
  armL.position.set(-0.36, 1.44, 0); armR.position.set(0.36, 1.44, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), mat(skin));
  head.position.y = 1.68;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), mat(hat));
  cap.position.y = 1.9;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.24), mat(hat));
  brim.position.set(0, 1.85, 0.3);
  for (const m of [legL, legR, torso, armL, armR, head, cap, brim]) { m.castShadow = true; g.add(m); }
  return { group: g, legL, legR, armL, armR, torso, head };
}

export class Player {
  constructor(scene) {
    const f = createFigure({});
    this.fig = f; this.group = f.group;
    this.group.position.set(168, 0, -14);
    scene.add(this.group);
    this.heading = -Math.PI / 2;
    this.health = 100; this.maxHealth = 100;
    this.y = 0; this.vy = 0; this.walkT = 0; this.speedNow = 0;
    this.lastHurt = -99; this.time = 0; this.dead = false;
  }
  get pos() { return this.group.position; }
  teleport(x, z, heading) {
    this.group.position.set(x, groundAt(x, z, 0), z);
    this.y = this.group.position.y; this.vy = 0;
    if (heading !== undefined) this.heading = heading;
  }
  damage(n) {
    if (this.dead) return;
    this.health -= n; this.lastHurt = this.time;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }
  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }
  update(dt, moveX, moveZ, sprint) {
    this.time += dt;
    if (this.lastHurt < this.time - 6 && this.health > 0) this.heal(3.2 * dt);
    const moving = Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01;
    const speed = sprint ? 9.6 : 5.8;
    this.speedNow = moving ? speed : 0;
    if (moving) {
      const len = Math.hypot(moveX, moveZ) || 1;
      const dx = moveX / len, dz = moveZ / len;
      this.group.position.x += dx * speed * dt;
      this.group.position.z += dz * speed * dt;
      const target = Math.atan2(dx, dz);
      this.heading = angleLerp(this.heading, target, Math.min(1, dt * 12));
      this.walkT += dt * speed * 1.55;
    }
    const p = this.group.position;
    collide(p, 0.42, this.y, 0.9);
    p.x = clamp(p.x, -320, 320); p.z = clamp(p.z, -320, 320);
    const ground = groundAt(p.x, p.z, this.y);
    if (this.y <= ground + 0.001) { this.y = ground; this.vy = 0; }
    else { this.vy -= 26 * dt; this.y += this.vy * dt; if (this.y < ground) { this.y = ground; this.vy = 0; } }
    p.y = this.y;
    this.group.rotation.y = this.heading;
    // walk cycle
    const sw = moving ? Math.sin(this.walkT) * 0.62 : 0;
    this.fig.legL.rotation.x = sw; this.fig.legR.rotation.x = -sw;
    this.fig.armL.rotation.x = -sw * 0.8; this.fig.armR.rotation.x = sw * 0.8;
    if (!moving) {
      this.fig.legL.rotation.x *= 0.8; this.fig.legR.rotation.x *= 0.8;
      this.fig.armL.rotation.x *= 0.8; this.fig.armR.rotation.x *= 0.8;
    }
    return moving;
  }
}
