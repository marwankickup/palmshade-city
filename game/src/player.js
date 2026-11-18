// player.js — the on-foot character: camera-relative WASD movement,
// sprint, building collision, walk animation, health. Also the
// third-person orbit camera rig used on foot and (loosely) in cars.
import * as THREE from 'three';
import { makeFigure, animateFigure } from './peds.js';
import { collideAABBs, clampToWorld } from './city.js';

export class Player {
  constructor(scene, rng, x, z) {
    this.mesh = makeFigure(rng, { shirt: 0xff5a3c, pants: 0x2c3550, skin: 0xc68863 });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = Math.PI * 0.75;
    this.health = 100;
    this.maxHealth = 100;
    this.phase = 0;
    this.moving = 0;
    this.radius = 0.5;
    this.dead = false;
  }
  // input: {x: strafe -1..1, z: forward -1..1 (camera relative), sprint}
  update(dt, input, camYaw) {
    const mag = Math.hypot(input.x, input.z);
    this.moving = mag > 0.1 ? 1 : 0;
    if (mag > 0.1) {
      const speed = input.sprint ? 8.6 : 5.2;
      const ang = camYaw - Math.atan2(input.x, input.z);
      const targetHeading = ang;
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 11);
      this.pos.x += Math.sin(ang) * speed * dt;
      this.pos.z += Math.cos(ang) * speed * dt;
      this.phase += dt * speed * 1.9;
    }
    collideAABBs(this.pos, this.radius);
    clampToWorld(this.pos);
    this.mesh.rotation.y = this.heading;
    this.mesh.position.y = this.moving ? Math.abs(Math.sin(this.phase)) * 0.06 : 0;
    animateFigure(this.mesh, this.phase, this.moving ? 0.62 : 0);
    // slow health regen when calm
    if (this.health > 0 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + dt * 1.6);
  }
  damage(n) {
    if (this.dead) return;
    this.health -= n;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }
  heal() { this.health = this.maxHealth; this.dead = false; }
  setVisible(v) { this.mesh.visible = v; }
}

// Orbit camera: yaw/pitch driven by mouse (drag or pointer lock) and keys.
// Smoothly follows a target (player or car) at a distance.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI * 0.75;
    this.pitch = 0.32;
    this.dist = 8.5;
    this.smooth = new THREE.Vector3(0, 2, 0);
    this.init = false;
  }
  addLook(dx, dy) {
    this.yaw -= dx * 0.0032;
    this.pitch = Math.max(0.04, Math.min(1.15, this.pitch + dy * 0.0028));
  }
  update(dt, targetPos, targetHeading, inCar) {
    const wantDist = inCar ? 10.5 : 7.6;
    this.dist += (wantDist - this.dist) * Math.min(1, dt * 3);
    // when driving, ease the camera behind the car: the view direction
    // (sin yaw, cos yaw) should settle onto the car's forward (sin h, cos h)
    if (inCar) {
      let d = targetHeading - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 1.5);
    }
    const cx = targetPos.x - Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist;
    const cz = targetPos.z - Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist;
    const cy = targetPos.y + Math.sin(this.pitch) * this.dist + 1.6;
    if (!this.init) { this.smooth.set(cx, cy, cz); this.init = true; }
    const k = Math.min(1, dt * 9);
    this.smooth.x += (cx - this.smooth.x) * k;
    this.smooth.y += (cy - this.smooth.y) * k;
    this.smooth.z += (cz - this.smooth.z) * k;
    // keep camera out of the ground and out of the ocean dip
    this.camera.position.set(this.smooth.x, Math.max(1.1, this.smooth.y), this.smooth.z);
    this.camera.lookAt(targetPos.x, targetPos.y + 1.7, targetPos.z);
  }
  viewDir() {
    // direction the camera looks, on XZ plane: from camera toward target
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
}
