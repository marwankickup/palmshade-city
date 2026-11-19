// collectibles.js — 10 hidden packages: glowing crates tucked on the café
// terrace, the pier, a crate-stair rooftop, the garage and other corners.
import * as THREE from 'three';
import { dist2 } from './util.js';

export function packageSpots(city) {
  const s = city.spots;
  return [
    { x: s.cafeTerrace.x, y: s.cafeTerrace.y, z: s.cafeTerrace.z },
    { x: s.pierEnd.x, y: s.pierEnd.y, z: s.pierEnd.z },
    { x: s.crateRoof.x, y: s.crateRoof.y, z: s.crateRoof.z },
    { x: -16, y: 0, z: -184 },
    { x: -100, y: 0.1, z: -80 },
    { x: 155, y: 0, z: 50 },
    { x: 168, y: 0, z: 96 },
    { x: 140, y: 0, z: -120 },
    { x: -130.6, y: 0, z: 30 },
    { x: 130.6, y: 0, z: -34 },
  ];
}

export function createCollectibles(game) {
  const spots = packageSpots(game.city);
  const found = new Set();
  const items = [];
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xd88f2e, roughness: 0.55, emissive: 0xa35c00, emissiveIntensity: 0.55 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x3a2c18, roughness: 0.8 });

  spots.forEach((sp, i) => {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), crateMat);
    box.position.y = 0.31; box.castShadow = true;
    g.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.14, 0.66), bandMat);
    band.position.y = 0.31; g.add(band);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffb84d, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(2.4); glow.position.y = 0.4;
    g.add(glow);
    g.position.set(sp.x, sp.y, sp.z);
    game.scene.add(g);
    items.push({ g, glow, spot: sp, id: i });
  });

  function refreshHud() { game.hud.setPackages(found.size, spots.length); }

  function update(dt) {
    const t = game.time;
    const pp = game.player.pos;
    for (const it of items) {
      if (found.has(it.id)) continue;
      it.g.rotation.y = t * 1.4 + it.id;
      it.g.position.y = it.spot.y + Math.sin(t * 2 + it.id * 1.7) * 0.08;
      it.glow.material.opacity = 0.26 + Math.sin(t * 3 + it.id) * 0.12;
      if (!game.playerInCar() && Math.abs(pp.y - it.spot.y) < 1.7 && dist2(pp.x, pp.z, it.spot.x, it.spot.z) < 1.7) {
        found.add(it.id);
        it.g.visible = false;
        game.addMoney(150);
        game.audio.pickup();
        game.hud.toast('Package found! +$150 (' + found.size + '/10)');
        refreshHud();
      }
    }
    void dt;
  }

  return {
    update,
    get count() { return found.size; },
    get total() { return spots.length; },
    spotAt: (i) => spots[i] || null,
    reset() {
      found.clear();
      for (const it of items) it.g.visible = true;
      refreshHud();
    },
    foundIds: () => [...found],
    applySave(ids) {
      for (const id of ids) {
        if (items[id]) { found.add(id); items[id].g.visible = false; }
      }
      refreshHud();
    },
    markerPositions: () => items.filter((it) => !found.has(it.id)).map((it) => it.spot),
  };
}
