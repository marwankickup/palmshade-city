// collectibles.js — 10 hidden packages: glowing crates on terraces, rooftops, the pier…

import * as THREE from 'three';
import { dist2d } from './util.js';

export const PACKAGE_SPOTS = [
  { id: 0, x: 155, y: 0.9, z: -38, where: 'Café Marisol terrace' },
  { id: 1, x: 288, y: 0.85, z: 38, where: 'end of the marina pier' },
  { id: 2, x: -164, y: 2.4, z: 122, where: 'warehouse annex roof' },
  { id: 3, x: -24, y: 3.65, z: -24, where: 'parking garage, deck 1' },
  { id: 4, x: 224, y: 1.83, z: -64, where: 'lifeguard stand' },
  { id: 5, x: 196, y: 0, z: 120, where: 'the promenade' },
  { id: 6, x: 222, y: 0, z: 52, where: 'volleyball court' },
  { id: 7, x: -186, y: 0, z: 158, where: 'warehouse yard' },
  { id: 8, x: -30, y: 0, z: -44, where: 'parking garage, ground floor' },
  { id: 9, x: 262, y: 0.85, z: 33, where: 'the marina pier' },
];

export class Collectibles {
  constructor(scene, foundIds = []) {
    this.packages = [];
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xd8a03c, emissive: 0xa86e10, emissiveIntensity: 0.7 });
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x53e0d0, transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const spot of PACKAGE_SPOTS) {
      const grp = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), crateMat);
      crate.position.y = 0.55;
      crate.castShadow = true;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 5.2, 8, 1, true), beamMat);
      beam.position.y = 2.8;
      grp.add(crate); grp.add(beam);
      grp.position.set(spot.x, spot.y, spot.z);
      const found = foundIds.includes(spot.id);
      grp.visible = !found;
      scene.add(grp);
      this.packages.push({ ...spot, grp, crate, found });
    }
  }

  foundCount() { return this.packages.filter(p => p.found).length; }
  foundIds() { return this.packages.filter(p => p.found).map(p => p.id); }

  setFound(ids) {
    for (const p of this.packages) {
      p.found = ids.includes(p.id);
      p.grp.visible = !p.found;
    }
  }

  // onCollect(pkg) fires when the on-foot player reaches a package.
  update(dt, t, playerPos, playerY, onFoot, onCollect) {
    for (const p of this.packages) {
      if (p.found) continue;
      p.crate.rotation.y = t * 1.4 + p.id;
      p.crate.position.y = 0.55 + Math.sin(t * 2.2 + p.id * 1.7) * 0.1;
      if (onFoot && Math.abs(playerY - p.y) < 1.7 && dist2d(playerPos.x, playerPos.z, p.x, p.z) < 1.7) {
        p.found = true;
        p.grp.visible = false;
        onCollect(p);
      }
    }
  }
}
