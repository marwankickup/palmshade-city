// collectibles.js — 10 hidden packages (glowing crates) scattered over
// Palmshade City: rooftops reached by crate stairs, the café terrace, the
// pier end, the lifeguard stand, alleys and the warehouse dock.

import * as THREE from 'three';

export const PACKAGE_SPOTS = [
  { x: -8, z: 110.5, y: 0.9 },    // café terrace
  { x: 122, z: 208, y: 0.5 },     // pier end
  { x: -59, z: -52, y: 3.2 },     // hideout rooftop (crate stairs)
  { x: 48, z: 76, y: 3.2 },       // beachfront rooftop (crate stairs)
  { x: 60, z: 140, y: 0.9 },      // lifeguard stand
  { x: 130, z: -91, y: 0.45 },    // warehouse dock
  { x: -121, z: -70, y: 0 },      // behind the police station
  { x: -60, z: 150, y: 0 },       // volleyball beach
  { x: 56, z: -124, y: 0 },       // parking garage ground floor
  { x: -145, z: 60, y: 0 },       // west-side alley by the beachfront blocks
];

export const PACKAGE_REWARD = 150;

export class Collectibles {
  constructor(scene, foundIds = []) {
    this.found = new Set(foundIds);
    this.items = [];
    const geo = new THREE.BoxGeometry(0.72, 0.72, 0.72);
    PACKAGE_SPOTS.forEach((s, i) => {
      const grp = new THREE.Group();
      const crate = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        color: 0xa9743f, emissive: 0x39d353, emissiveIntensity: 0.35,
      }));
      crate.castShadow = true;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0x39d353, transparent: true, opacity: 0.4, depthWrite: false,
      }));
      glow.scale.set(2.6, 2.6, 1);
      grp.add(crate, glow);
      grp.position.set(s.x, s.y + 0.55, s.z);
      grp.visible = !this.found.has(i);
      scene.add(grp);
      this.items.push({ grp, crate, spot: s, id: i });
    });
  }

  get count() { return this.found.size; }
  get total() { return PACKAGE_SPOTS.length; }

  update(dt, t, G) {
    for (const it of this.items) {
      if (this.found.has(it.id)) continue;
      it.grp.rotation.y = t * 1.4 + it.id;
      it.grp.position.y = it.spot.y + 0.55 + Math.sin(t * 2 + it.id * 1.7) * 0.12;
      if (G.state === 'playing' && !G.player.inVehicle) {
        const d = Math.hypot(G.player.x - it.spot.x, G.player.z - it.spot.z);
        if (d < 1.7 && Math.abs(G.player.pos.y - it.spot.y) < 1.7) {
          this.found.add(it.id);
          it.grp.visible = false;
          G.onPackage(it.id);
        }
      }
    }
  }
}
