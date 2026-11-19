// combat.js — hitscan shooting on foot, tracers, muzzle flash, plus the shared particle pool.

import * as THREE from 'three';
import { dist2d } from './util.js';

// Tiny CPU particle pool rendered as THREE.Points.
export class Particles {
  constructor(scene, n = 260) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.baseCol = new Float32Array(n * 3);
    this.grav = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.head = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, r, g, b, grav = 0) {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.baseCol[i * 3] = r; this.baseCol[i * 3 + 1] = g; this.baseCol[i * 3 + 2] = b;
    this.grav[i] = grav;
  }
  burst(x, y, z, count, color, speed = 5, life = 0.5, up = 2) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      this.spawn(x, y, z,
        Math.cos(a) * Math.cos(e) * speed, Math.abs(Math.sin(e)) * speed * 0.6 + up, Math.sin(a) * Math.cos(e) * speed,
        life * (0.5 + Math.random() * 0.8), color[0], color[1], color[2], -4);
    }
  }
  smoke(x, y, z) {
    this.spawn(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.4, 1.6 + Math.random(), (Math.random() - 0.5) * 0.4,
      1.1, 0.16, 0.16, 0.16, 1.2);
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.col[i * 3] = this.baseCol[i * 3] * f;
      this.col[i * 3 + 1] = this.baseCol[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.baseCol[i * 3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class Combat {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx; // { camera, player, peds, cars, police, audio, particles, onCrime }
    this.cooldown = 0;
    this.tracers = [];
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffd98c, transparent: true, opacity: 0 })
    );
    scene.add(this.flash);
  }

  // Fire one shot from the camera centre. Returns true if something was hit.
  fire() {
    const ctx = this.ctx;
    if (this.cooldown > 0) return false;
    this.cooldown = 0.17;
    ctx.audio.shot();
    const cam = ctx.camera;
    const origin = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const gunPos = ctx.player.pos.clone(); gunPos.y += 1.45;
    const from = gunPos.add(dir.clone().multiplyScalar(0.4));
    this.flash.position.copy(from.clone().add(dir.clone().multiplyScalar(0.5)));
    this.flash.material.opacity = 0.95;
    this.flash.scale.setScalar(1 + Math.random() * 0.7);

    let bestT = 70, hitKind = null, hitObj = null;
    const testPoint = (p, radius, kind, obj) => {
      const to = new THREE.Vector3(p.x - origin.x, (p.y || 1) - origin.y, p.z - origin.z);
      const t = to.dot(dir);
      if (t < 1.5 || t > 75) return;
      const closest = origin.clone().add(dir.clone().multiplyScalar(t));
      const d = Math.hypot(closest.x - p.x, closest.y - (p.y || 1), closest.z - p.z);
      if (d < radius && t < bestT) { bestT = t; hitKind = kind; hitObj = obj; }
    };
    for (const p of ctx.peds.list) {
      if (p.state === 'down') continue;
      testPoint({ x: p.x, y: 1.1, z: p.z }, 0.75, 'ped', p);
    }
    for (const car of ctx.allCars()) {
      testPoint({ x: car.pos.x, y: 0.9, z: car.pos.z }, 1.9, 'car', car);
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(bestT));
    this._tracer(from, end);
    if (hitKind === 'ped') {
      ctx.peds.knockDown(hitObj);
      ctx.particles.burst(end.x, end.y, end.z, 6, [1, 0.5, 0.3], 3, 0.4);
      ctx.onCrime('shootPed', ctx.player.pos.x, ctx.player.pos.z);
    } else if (hitKind === 'car') {
      hitObj.hp -= 9;
      ctx.particles.burst(end.x, end.y, end.z, 7, [1, 0.8, 0.3], 4, 0.35);
      ctx.audio.spark();
      ctx.onCrime('shootCar', ctx.player.pos.x, ctx.player.pos.z);
    } else {
      ctx.onCrime('gunshot', ctx.player.pos.x, ctx.player.pos.z);
    }
    ctx.peds.scare(ctx.player.pos.x, ctx.player.pos.z, 15);
    return true;
  }

  _tracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.9,
    }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }

  tracerFromTo(a, b) { this._tracer(new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)); }

  update(dt) {
    this.cooldown -= dt;
    if (this.flash.material.opacity > 0) this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 9);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
