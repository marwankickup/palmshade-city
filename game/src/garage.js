// garage.js — Palmshade Customs: the parking-garage workshop bay where cash
// buys engine / armor / nitro upgrades for whatever the player drives.
// Upgrades live on the player profile (saved), and are applied to the car
// each time the player gets in.
import * as THREE from 'three';
import { dist2d } from './util.js';

export const BAY = { x: 90, z: 88 };
export const UPGRADES = {
  engine: { name: 'ENGINE', desc: '+8% top speed & +9% accel per level', costs: [300, 650, 1100] },
  armor: { name: 'ARMOR', desc: 'Your ride takes −33% damage per level', costs: [250, 550, 950] },
  nitro: { name: 'NITRO', desc: 'Hold SHIFT to boost · bigger tank per level', costs: [400, 750, 1200] },
};
export const MAX_LEVEL = 3;

export class Garage {
  constructor(game) {
    this.game = game;
    this.openFlag = false;
    // glowing bay marker inside the parking garage ground floor
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.3, 28),
      new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(BAY.x, 0.14, BAY.z);
    game.scene.add(ring);
    this.ring = ring;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    pillar.position.set(BAY.x, 15, BAY.z);
    game.scene.add(pillar);
    // wire the menu buttons
    document.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => this.buy(btn.dataset.buy));
    });
    const rep = document.getElementById('btnRepair');
    if (rep) rep.addEventListener('click', () => this.repair());
    const close = document.getElementById('btnGarageClose');
    if (close) close.addEventListener('click', () => this.close());
  }
  near(pos) { return dist2d(BAY.x, BAY.z, pos.x, pos.z) < 7.5; }
  open() {
    this.openFlag = true;
    this.game.state.mode = 'garage';
    document.getElementById('garageMenu').classList.remove('hidden');
    this.refresh();
    if (document.exitPointerLock) document.exitPointerLock();
  }
  close() {
    this.openFlag = false;
    document.getElementById('garageMenu').classList.add('hidden');
    if (this.game.state.mode === 'garage') this.game.state.mode = 'playing';
    this.game.saveGame();
  }
  repairCost() {
    const car = this.game.currentCar;
    if (!car || car.type === 'boat') return 0;
    return Math.max(0, Math.ceil((100 - car.health) * 2));
  }
  refresh() {
    const G = this.game;
    document.getElementById('garageCash').textContent = '$' + G.state.money;
    for (const id of Object.keys(UPGRADES)) {
      const lvl = G.upgrades[id];
      document.getElementById('lvl-' + id).textContent = '●'.repeat(lvl) + '○'.repeat(MAX_LEVEL - lvl);
      const priceEl = document.getElementById('price-' + id);
      const btn = document.querySelector(`[data-buy="${id}"]`);
      if (lvl >= MAX_LEVEL) { priceEl.textContent = 'MAX'; btn.disabled = true; btn.classList.add('locked'); }
      else {
        const cost = UPGRADES[id].costs[lvl];
        priceEl.textContent = '$' + cost;
        btn.disabled = G.state.money < cost;
        btn.classList.toggle('locked', G.state.money < cost);
      }
    }
    const rc = this.repairCost();
    const repBtn = document.getElementById('btnRepair');
    document.getElementById('repairInfo').textContent = !G.currentCar || G.currentCar.type === 'boat'
      ? 'Bring a car into the bay to repair it.'
      : rc === 0 ? 'Your ride is already mint.' : `Repair to full health — $${rc}`;
    repBtn.disabled = rc === 0 || G.state.money < rc;
    repBtn.classList.toggle('locked', repBtn.disabled);
  }
  buy(id) {
    const G = this.game;
    const lvl = G.upgrades[id];
    if (lvl >= MAX_LEVEL) return;
    const cost = UPGRADES[id].costs[lvl];
    if (G.state.money < cost) { G.notify('Not enough cash for that upgrade.'); return; }
    G.state.money -= cost;
    G.upgrades[id]++;
    if (G.currentCar) G.applyUpgrades(G.currentCar);
    G.sfx('jingle');
    G.notify(`🔧 ${UPGRADES[id].name} upgraded to level ${G.upgrades[id]}!`);
    G.saveGame();
    this.refresh();
  }
  repair() {
    const G = this.game;
    const car = G.currentCar;
    const cost = this.repairCost();
    if (!car || cost === 0 || G.state.money < cost) return;
    G.state.money -= cost;
    car.health = 100;
    car.burnT = 0;
    G.sfx('jingle');
    G.notify('🔧 Ride repaired — good as new.');
    G.saveGame();
    this.refresh();
  }
}
