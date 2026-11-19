// On-foot shooting: hitscan ray vs sphere targets, tracer lines, muzzle flash,
// impact sparks. Whoever gets hit reacts in main (peds fall, cars take damage).
import * as THREE from 'three';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.flash = null;
    this._flashT = 0;
  }

  // targets: [{x,y,z,r,ref}] — returns the nearest hit target or null.
  // origin/dir are THREE.Vector3 (dir normalized).
  fire(origin, dir, targets, muzzlePos) {
    let best = null, bestT = 90;
    const oc = new THREE.Vector3();
    for (const tg of targets) {
      oc.set(origin.x - tg.x, origin.y - tg.y, origin.z - tg.z);
      const b = oc.dot(dir);
      const c = oc.lengthSq() - tg.r * tg.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const tHit = -b - Math.sqrt(disc);
      if (tHit > 0 && tHit < bestT) { bestT = tHit; best = tg; }
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(best ? bestT : 90));
    this._spawnTracer(muzzlePos || origin, end);
    this._spawnFlash(muzzlePos || origin);
    if (best) this._spawnSparks(end);
    return best;
  }

  _spawnTracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  _spawnFlash(pos) {
    if (!this.flash) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      rg.addColorStop(0, 'rgba(255,240,190,1)');
      rg.addColorStop(0.4, 'rgba(255,180,60,0.7)');
      rg.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
      this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      this.flash.scale.setScalar(0.9);
      this.scene.add(this.flash);
    }
    this.flash.position.copy(pos);
    this.flash.material.opacity = 1;
    this._flashT = 0.05;
  }

  _spawnSparks(pos) {
    const geo = new THREE.BufferGeometry().setFromPoints([pos]);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffcf6e, size: 0.55, transparent: true, opacity: 1 }));
    this.scene.add(pts);
    this.tracers.push({ line: pts, life: 0.16 });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.line.material) tr.line.material.opacity = Math.max(0, tr.life / 0.09) * 0.9;
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    if (this.flash && this._flashT > 0) {
      this._flashT -= dt;
      if (this._flashT <= 0) this.flash.material.opacity = 0;
    }
  }
}
