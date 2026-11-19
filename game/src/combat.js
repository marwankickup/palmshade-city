// combat.js — hitscan shooting: tracer, muzzle flash, sparks, hit reactions.
import * as THREE from 'three';
import { dist2d } from './util.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.effects = []; // {obj, ttl, max, vel?}
    this.flashLight = new THREE.PointLight(0xffc873, 0, 18);
    scene.add(this.flashLight);
    this.ray = new THREE.Raycaster();
    this.ray.far = 90;
  }
  tracer(a, b, color = 0xffe9a8) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.effects.push({ obj: line, ttl: 0.06, max: 0.06, fade: true });
  }
  muzzle(pos) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: Combat.glowTex(), color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    s.position.copy(pos); s.scale.setScalar(0.7);
    this.scene.add(s);
    this.effects.push({ obj: s, ttl: 0.05, max: 0.05, fade: true });
    this.flashLight.position.copy(pos); this.flashLight.intensity = 26;
  }
  sparks(pos, n = 7) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: Combat.glowTex(), color: 0xffb84d, transparent: true, opacity: 1, depthWrite: false,
      }));
      s.position.copy(pos); s.scale.setScalar(0.22);
      this.scene.add(s);
      this.effects.push({
        obj: s, ttl: 0.32, max: 0.32, fade: true,
        vel: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4 + 1, (Math.random() - 0.5) * 5),
      });
    }
  }
  static _tex = null;
  static glowTex() {
    if (!Combat._tex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,200,90,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      Combat._tex = new THREE.CanvasTexture(c);
    }
    return Combat._tex;
  }
  update(dt) {
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 380);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.ttl -= dt;
      if (e.vel) {
        e.vel.y -= 12 * dt;
        e.obj.position.addScaledVector(e.vel, dt);
      }
      if (e.fade && e.obj.material) e.obj.material.opacity = Math.max(0, e.ttl / e.max);
      if (e.ttl <= 0) {
        this.scene.remove(e.obj);
        if (e.obj.geometry) e.obj.geometry.dispose();
        if (e.obj.material) e.obj.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }
  // Hitscan from origin along dir. Targets: peds (cylinders) and cars (spheres).
  // Returns {kind:'ped'|'car'|'none', target, point:Vector3, dist}.
  shoot(origin, dir, targets) {
    let best = null;
    const consider = (dist, kind, target, point) => {
      if (dist > 0 && dist < 90 && (!best || dist < best.dist)) best = { kind, target, point, dist };
    };
    for (const ped of targets.peds) {
      if (ped.state === 'down') continue;
      // ray vs vertical segment (feet..head)
      const cx = ped.pos.x - origin.x, cz = ped.pos.z - origin.z;
      const tAlong = cx * dir.x + cz * dir.z;
      if (tAlong < 0) continue;
      const px = origin.x + dir.x * tAlong, pz = origin.z + dir.z * tAlong;
      const side = dist2d(px, pz, ped.pos.x, ped.pos.z);
      const py = origin.y + dir.y * tAlong;
      if (side < 0.55 && py > ped.pos.y - 0.1 && py < ped.pos.y + 1.95) {
        consider(tAlong, 'ped', ped, new THREE.Vector3(ped.pos.x, Math.min(Math.max(py, 0.3), 1.7), ped.pos.z));
      }
    }
    for (const car of targets.cars) {
      if (car.dead && car.health <= 0) { /* wrecks still block */ }
      const cx = car.x - origin.x, cz = car.z - origin.z;
      const tAlong = cx * dir.x + cz * dir.z;
      if (tAlong < 0) continue;
      const px = origin.x + dir.x * tAlong, pz = origin.z + dir.z * tAlong;
      const side = dist2d(px, pz, car.x, car.z);
      const py = origin.y + dir.y * tAlong;
      if (side < 2.1 && py > -0.2 && py < 2.6) {
        consider(tAlong, 'car', car, new THREE.Vector3(px, Math.max(0.4, py), pz));
      }
    }
    const end = best ? best.point : origin.clone().addScaledVector(dir, 90);
    return { ...(best || { kind: 'none', target: null, dist: 90 }), end };
  }
}
