// Hidden packages: 10 glowing crates tucked on rooftops, alleys, the pier and
// the beaches. Walk into one on foot to collect it for cash.
import * as THREE from 'three';
import { PACKAGE_SPOTS } from './city.js';
import { groundHeightAt, dist2d } from './util.js';

export const PACKAGE_REWARD = 150;

export class Collectibles {
  constructor(scene, platforms, foundIds = []) {
    this.items = [];
    this.onCollect = null;
    const crateMat = new THREE.MeshStandardMaterial({
      color: 0x2fae5f, emissive: 0x2fae5f, emissiveIntensity: 0.55, roughness: 0.5,
    });
    const bandMat = new THREE.MeshBasicMaterial({ color: 0xd8ffd8 });
    PACKAGE_SPOTS.forEach((spot, i) => {
      if (foundIds.includes(i)) { this.items.push({ id: i, spot, found: true, group: null }); return; }
      const y = groundHeightAt(platforms, spot.x, spot.z, 0);
      const g = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), crateMat);
      crate.position.y = 0.85;
      crate.castShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 1.0), bandMat);
      band.position.y = 0.85;
      const glowC = document.createElement('canvas');
      glowC.width = glowC.height = 64;
      const gg = glowC.getContext('2d');
      const rg = gg.createRadialGradient(32, 32, 2, 32, 32, 30);
      rg.addColorStop(0, 'rgba(120,255,150,0.8)');
      rg.addColorStop(1, 'rgba(120,255,150,0)');
      gg.fillStyle = rg; gg.fillRect(0, 0, 64, 64);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowC), transparent: true, depthWrite: false }));
      glow.scale.setScalar(3.4);
      glow.position.y = 0.9;
      g.add(crate, band, glow);
      g.position.set(spot.x, y, spot.z);
      scene.add(g);
      this.items.push({ id: i, spot, found: false, group: g, crate, y });
    });
  }

  get foundCount() { return this.items.filter((i) => i.found).length; }
  get total() { return this.items.length; }
  foundIds() { return this.items.filter((i) => i.found).map((i) => i.id); }
  remainingPositions() { return this.items.filter((i) => !i.found).map((i) => i.spot); }

  update(dt, t, player) {
    for (const item of this.items) {
      if (item.found || !item.group) continue;
      item.crate.rotation.y += dt * 1.6;
      item.group.position.y = item.y + Math.sin(t * 2 + item.id) * 0.12;
      if (player.mode === 'foot') {
        const dy = Math.abs(player.pos.y - item.y);
        if (dy < 1.6 && dist2d(player.pos.x, player.pos.z, item.spot.x, item.spot.z) < 1.9) {
          item.found = true;
          this.sceneRemove(item);
          if (this.onCollect) this.onCollect(item);
        }
      }
    }
  }

  sceneRemove(item) {
    if (item.group && item.group.parent) item.group.parent.remove(item.group);
    item.group = null;
  }
}
