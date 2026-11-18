// The player on foot: a stylised low-poly figure (boxes for legs, torso, arms and head,
// with a cap) who walks and sprints around Palmshade, steered relative to the camera.
// Movement is a simple circle collider pushed out of building footprints; the walk cycle
// swings the limbs in time with the actual speed. Driving is vehicles.js' job — this
// module only handles the person.

import * as THREE from 'three';
import { clamp, lerp, angleLerp, circleVsBox } from './util.js';

function limb(w, h, d, material, x, y, z) {
  // A limb pivots at its top: the group sits at the joint, the box hangs below it.
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

function skinMat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

/** Build the player figure and its on-foot controller. */
export function createPlayer(scene) {
  const group = new THREE.Group();
  const shirt = skinMat(0x14b8a6); // teal shirt
  const pants = skinMat(0x2d4059);
  const skin = skinMat(0xc68863);
  const capMat = skinMat(0xff5e78);

  const legL = limb(0.24, 0.82, 0.28, pants, -0.16, 0.86, 0);
  const legR = limb(0.24, 0.82, 0.28, pants, 0.16, 0.86, 0);
  const armL = limb(0.17, 0.72, 0.2, shirt, -0.42, 1.52, 0);
  const armR = limb(0.17, 0.72, 0.2, shirt, 0.42, 1.52, 0);
  group.add(legL, legR, armL, armR);

  const torsoGeo = new THREE.BoxGeometry(0.64, 0.72, 0.34);
  const torso = new THREE.Mesh(torsoGeo, shirt);
  torso.position.y = 1.22;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.4), skin);
  head.position.y = 1.82;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.44), capMat);
  cap.position.y = 2.06;
  group.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.24), capMat);
  brim.position.set(0, 2.0, 0.32);
  group.add(brim);

  scene.add(group);

  const player = {
    group,
    heading: 0,
    health: 100,
    maxHealth: 100,
    speedNow: 0,
    walkPhase: 0,
    car: null, // the car being driven, or null on foot
    radius: 0.55,

    get pos() {
      return group.position;
    },

    /** Place the figure somewhere, facing a heading. */
    place(x, z, heading, groundY = 0) {
      group.position.set(x, groundY, z);
      this.heading = heading;
      group.rotation.y = heading;
    },

    /**
     * Walk for one frame. input: { x: -1..1 strafe, z: -1..1 forward, sprint: bool }
     * in camera space; camYaw is the camera's heading. world: { colliders, groundHeightAt }.
     */
    update(dt, input, camYaw, world) {
      const moving = Math.abs(input.x) > 0.01 || Math.abs(input.z) > 0.01;
      const speedTarget = moving ? (input.sprint ? 8.8 : 5.2) : 0;
      this.speedNow = lerp(this.speedNow, speedTarget, clamp(dt * 10, 0, 1));

      if (moving) {
        // Camera-space wish direction -> world direction.
        const fx = Math.sin(camYaw);
        const fz = Math.cos(camYaw);
        // Screen right for a camera looking along (fx, fz) with Y up: facing +z puts
        // +x on your left, so right is (-fz, fx) — checked against three's lookAt.
        const rx = -fz;
        const rz = fx;
        let wx = fx * input.z + rx * input.x;
        let wz = fz * input.z + rz * input.x;
        const len = Math.hypot(wx, wz) || 1;
        wx /= len;
        wz /= len;
        const targetHeading = Math.atan2(wx, wz);
        this.heading = angleLerp(this.heading, targetHeading, dt * 11);
        group.position.x += wx * this.speedNow * dt;
        group.position.z += wz * this.speedNow * dt;
      }

      // Buildings push the walker out.
      for (const box of world.colliders) {
        const hit = circleVsBox(group.position.x, group.position.z, this.radius, box);
        if (hit) {
          group.position.x += hit.x * hit.depth;
          group.position.z += hit.z * hit.depth;
        }
      }
      // Stay in the world.
      group.position.x = clamp(group.position.x, -302, 268);
      group.position.z = clamp(group.position.z, -268, 268);
      group.position.y = world.groundHeightAt(group.position.x, group.position.z);
      group.rotation.y = this.heading;

      // Walk cycle: limbs swing with speed, settle when idle.
      this.walkPhase += this.speedNow * dt * 1.85;
      const swing = clamp(this.speedNow / 5.2, 0, 1.4) * 0.62;
      const s = Math.sin(this.walkPhase) * swing;
      legL.rotation.x = s;
      legR.rotation.x = -s;
      armL.rotation.x = -s * 0.8;
      armR.rotation.x = s * 0.8;
      group.position.y += Math.abs(Math.sin(this.walkPhase)) * 0.03 * clamp(this.speedNow / 5, 0, 1);
    },

    /** Damage the player; returns true when this kills them. */
    hurt(amount) {
      this.health = Math.max(0, this.health - amount);
      return this.health <= 0;
    },

    healFull() {
      this.health = this.maxHealth;
    },
  };

  return player;
}
