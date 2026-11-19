// player.js — the on-foot character: stylized figure, walk cycle, step-up, gravity.

import * as THREE from 'three';
import { clamp, angleLerp, dist2d } from './util.js';

export class Player {
  constructor(scene, x, z) {
    this.group = new THREE.Group();
    this.heading = Math.PI; // face west-ish toward the city at spawn (promenade looks west)
    this.speed = 0;
    this.vy = 0;
    this.y = 0;
    this.health = 100;
    this.walkPhase = 0;
    this.dead = false;

    const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
    const shirt = new THREE.MeshLambertMaterial({ color: 0xe84f3d });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const capM = new THREE.MeshLambertMaterial({ color: 0xf5d13d });

    const mk = (geo, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      (parent || this.group).add(m);
      return m;
    };
    // torso + head (in a body subgroup so legs/arms can pivot)
    mk(new THREE.BoxGeometry(0.54, 0.68, 0.3), shirt, 0, 1.18, 0);
    mk(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin, 0, 1.72, 0);
    mk(new THREE.BoxGeometry(0.4, 0.1, 0.4), capM, 0, 1.93, 0);
    mk(new THREE.BoxGeometry(0.4, 0.08, 0.22), capM, 0, 1.88, 0.26);
    // legs pivot at hip
    this.legL = new THREE.Group(); this.legL.position.set(-0.14, 0.86, 0); this.group.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.14, 0.86, 0); this.group.add(this.legR);
    mk(new THREE.BoxGeometry(0.17, 0.86, 0.2), pants, 0, -0.43, 0, this.legL);
    mk(new THREE.BoxGeometry(0.17, 0.86, 0.2), pants, 0, -0.43, 0, this.legR);
    // arms pivot at shoulder
    this.armL = new THREE.Group(); this.armL.position.set(-0.35, 1.46, 0); this.group.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(0.35, 1.46, 0); this.group.add(this.armR);
    mk(new THREE.BoxGeometry(0.14, 0.72, 0.16), shirt, 0, -0.32, 0, this.armL);
    mk(new THREE.BoxGeometry(0.14, 0.72, 0.16), shirt, 0, -0.32, 0, this.armR);
    // gun (appears when shooting)
    this.gun = mk(new THREE.BoxGeometry(0.07, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x222226 }), 0, -0.62, 0.18, this.armR);
    this.gun.visible = false;

    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  get pos() { return this.group.position; }

  // moveDir: normalized world-space {x,z} or null; returns actual speed.
  update(dt, moveDir, sprint, city) {
    const maxSpeed = sprint ? 8.6 : 5.4;
    let vx = 0, vz = 0;
    if (moveDir) {
      vx = moveDir.x * maxSpeed; vz = moveDir.z * maxSpeed;
      const targetHeading = Math.atan2(moveDir.x, moveDir.z);
      this.heading = angleLerp(this.heading, targetHeading, clamp(dt * 12, 0, 1));
    }
    let nx = this.pos.x + vx * dt;
    let nz = this.pos.z + vz * dt;
    [nx, nz] = city.collide(nx, nz, 0.45);
    // wading slows you down
    const inWater = nx > 238;
    if (inWater && moveDir) {
      nx = this.pos.x + (nx - this.pos.x) * 0.55;
      nz = this.pos.z + (nz - this.pos.z) * 0.55;
    }
    this.speed = dist2d(this.pos.x, this.pos.z, nx, nz) / Math.max(dt, 0.001);
    this.pos.x = clamp(nx, -278, 302);
    this.pos.z = clamp(nz, -208, 208);

    // vertical: ground support + gravity (for platform edges)
    const ground = city.groundHeightAt(this.pos.x, this.pos.z, this.y);
    if (this.y > ground + 0.001) {
      this.vy -= 26 * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) { this.y = ground; this.vy = 0; }
    } else {
      this.y = ground;
      this.vy = 0;
    }
    this.pos.y = this.y;
    this.group.rotation.y = this.heading;

    // walk cycle
    const moving = this.speed > 0.4;
    this.walkPhase += dt * (moving ? this.speed * 1.9 : 0);
    const swing = moving ? Math.sin(this.walkPhase) * 0.62 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    if (!this.aiming) {
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
    }
    this.group.position.y = this.y + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0);
    return this.speed;
  }

  setAiming(on) {
    this.aiming = on;
    this.gun.visible = on;
    if (on) {
      this.armR.rotation.x = -Math.PI / 2 + 0.12;
      this.armL.rotation.x = 0;
    }
  }
}
