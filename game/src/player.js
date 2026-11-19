// On-foot player: stylized figure with a walk cycle, camera-relative movement,
// sprint, AABB collision, platform step-up and a shallow-water limit.
import * as THREE from 'three';
import { clamp, collideCircle, groundHeightAt, WATER_X } from './util.js';

export class Player {
  constructor(scene, x, z, heading = 0) {
    this.group = new THREE.Group();
    this.heading = heading;
    this.health = 100;
    this.mode = 'foot';           // 'foot' | 'car'
    this.car = null;
    this.speedNow = 0;
    this._walkPhase = 0;
    this._buildFigure();
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  _buildFigure() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xc68863, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xff7847, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2c4a6e, roughness: 0.9 });
    const cap = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.8 });
    const mk = (geo, mat, x, y, z, parent = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // legs pivot at the hip for the walk swing
    this.legL = new THREE.Group(); this.legL.position.set(-0.14, 0.85, 0); this.group.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.14, 0.85, 0); this.group.add(this.legR);
    mk(new THREE.BoxGeometry(0.2, 0.85, 0.24), pants, 0, -0.42, 0, this.legL);
    mk(new THREE.BoxGeometry(0.2, 0.85, 0.24), pants, 0, -0.42, 0, this.legR);
    mk(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt, 0, 1.2, 0);            // torso
    this.armL = new THREE.Group(); this.armL.position.set(-0.4, 1.5, 0); this.group.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(0.4, 1.5, 0); this.group.add(this.armR);
    mk(new THREE.BoxGeometry(0.16, 0.66, 0.2), shirt, 0, -0.3, 0, this.armL);
    mk(new THREE.BoxGeometry(0.16, 0.66, 0.2), skin, 0, -0.3, 0, this.armR);
    mk(new THREE.BoxGeometry(0.4, 0.42, 0.4), skin, 0, 1.82, 0);              // head
    mk(new THREE.BoxGeometry(0.46, 0.12, 0.46), cap, 0, 2.06, 0);            // cap
    mk(new THREE.BoxGeometry(0.46, 0.06, 0.3), cap, 0, 2.0, 0.3);
  }

  get pos() { return this.group.position; }

  // wishX/wishZ: desired world-space move direction (already camera-relative), length 0..1
  update(dt, wishX, wishZ, sprint, colliders, platforms) {
    if (this.mode !== 'foot') return;
    const mag = Math.hypot(wishX, wishZ);
    const speed = sprint ? 8.6 : 5.2;
    if (mag > 0.01) {
      const nx = wishX / Math.max(1, mag), nz = wishZ / Math.max(1, mag);
      const step = Math.min(1, mag) * speed * dt;
      this.pos.x += nx * step;
      this.pos.z += nz * step;
      this.heading = Math.atan2(nx, nz);
      this.speedNow = speed * Math.min(1, mag);
      this._walkPhase += dt * (sprint ? 11 : 8);
    } else {
      this.speedNow = 0;
      this._walkPhase *= 0.8;
    }
    collideCircle(this.pos, 0.55, colliders);
    // shallow-water limit: can't wade past the shoreline unless standing on the pier
    const gy = groundHeightAt(platforms, this.pos.x, this.pos.z, this.pos.y);
    if (gy === 0 && this.pos.x > WATER_X + 5) this.pos.x = WATER_X + 5;
    this.pos.x = clamp(this.pos.x, -198, 246);
    this.pos.z = clamp(this.pos.z, -178, 178);
    this.pos.y = groundHeightAt(platforms, this.pos.x, this.pos.z, this.pos.y);

    // walk cycle
    const swing = Math.sin(this._walkPhase) * (this.speedNow > 0 ? 0.55 : 0);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.group.position.y = this.pos.y + Math.abs(Math.sin(this._walkPhase)) * 0.05;
    this.group.rotation.y = this.heading;
  }

  teleport(x, z, heading = this.heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.group.rotation.y = heading;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  setVisible(v) { this.group.visible = v; }
}
