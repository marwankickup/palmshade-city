// collectibles.js — 10 hidden packages: glowing crates on terraces, the pier, rooftops.
import * as THREE from 'three';

export function makePackage(color = 0xff9d2e) {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x6e4f26, roughness: 0.8, emissive: color, emissiveIntensity: 0.35 }));
  crate.castShadow = true; g.add(crate);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.9),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4 }));
  g.add(band);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,170,60,0.8)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(3.2); g.add(glow);
  return g;
}
export class Collectibles {
  constructor(scene, spots, collectedIds = [], onCollect = null) {
    this.scene = scene; this.onCollect = onCollect;
    this.items = spots.map((s, id) => {
      const mesh = makePackage();
      mesh.position.set(s.x, s.y + 0.75, s.z);
      scene.add(mesh);
      return { id, spot: s, mesh, taken: collectedIds.includes(id), phase: Math.random() * 6 };
    });
    for (const it of this.items) if (it.taken) it.mesh.visible = false;
    this.count = this.items.filter(i => i.taken).length;
  }
  remaining() { return this.items.filter(i => !i.taken).map(i => i.spot); }
  update(dt, px, py, pz, t) {
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.rotation.y += dt * 1.4;
      it.mesh.position.y = it.spot.y + 0.75 + Math.sin(t * 2 + it.phase) * 0.14;
      const dx = px - it.spot.x, dz = pz - it.spot.z;
      if (dx * dx + dz * dz < 3.1 && Math.abs(py - it.spot.y) < 2.1) {
        it.taken = true; it.mesh.visible = false; this.count++;
        if (this.onCollect) this.onCollect(it.id, it.spot);
      }
    }
  }
}
