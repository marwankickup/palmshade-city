// collectibles.js — 10 hidden packages: glowing crates on terraces, pier, rooftops.
import * as THREE from 'three';
import { dist2d } from './util.js';

export const PACKAGE_SPOTS = [
  { x: 171, z: -54, y: 0.9, note: 'café terrace' },
  { x: 272, z: 12, y: 0.9, note: 'pier end' },
  { x: -48, z: -48, y: 6.0, note: 'garage roof' },
  { x: 196, z: 128, y: 7.0, note: 'warehouse roof' },
  { x: 214, z: -90, y: 2.02, note: 'lifeguard stand' },
  { x: -4, z: 84, y: 0, note: 'downtown alley' },
  { x: 218, z: 30, y: 0, note: 'volleyball court' },
  { x: 234, z: 2, y: 0, note: 'marina entrance' },
  { x: 52, z: 52, y: 0, note: 'park' },
  { x: 84, z: -74, y: 0, note: 'bus stop corner' },
];

export class Collectibles {
  constructor(scene) {
    this.items = [];
    const geo = new THREE.BoxGeometry(0.72, 0.72, 0.72);
    PACKAGE_SPOTS.forEach((s, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x8a5a12, emissive: 0xffa726, emissiveIntensity: 1.1, roughness: 0.5 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.x, s.y + 0.75, s.z);
      m.castShadow = true;
      scene.add(m);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: Collectibles.glowTex(), color: 0xffc65c, transparent: true, opacity: 0.55, depthWrite: false,
      }));
      halo.scale.setScalar(2.6); halo.position.copy(m.position);
      scene.add(halo);
      this.items.push({ id: i, ...s, mesh: m, halo, taken: false });
    });
  }
  static _tex = null;
  static glowTex() {
    if (!Collectibles._tex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,210,110,0.9)'); gr.addColorStop(1, 'rgba(255,180,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      Collectibles._tex = new THREE.CanvasTexture(c);
    }
    return Collectibles._tex;
  }
  restore(takenIds) {
    for (const it of this.items) if (takenIds.includes(it.id)) this.hide(it);
  }
  hide(it) { it.taken = true; it.mesh.visible = false; it.halo.visible = false; }
  remaining() { return this.items.filter(i => !i.taken); }
  takenIds() { return this.items.filter(i => i.taken).map(i => i.id); }
  update(t) {
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.rotation.y = t * 1.4 + it.id;
      it.mesh.position.y = it.y + 0.75 + Math.sin(t * 2 + it.id * 1.7) * 0.12;
      it.halo.position.y = it.mesh.position.y;
    }
  }
  // Try collecting near a position (player must be close in 3D, incl. height).
  tryCollect(px, py, pz) {
    for (const it of this.items) {
      if (it.taken) continue;
      if (dist2d(px, pz, it.x, it.z) < 1.9 && Math.abs(py - it.y) < 1.6) {
        this.hide(it);
        return it;
      }
    }
    return null;
  }
}
