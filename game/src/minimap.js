// minimap.js — a live 2D canvas map: roads, beach and water, the player
// arrow (rotated by true heading), traffic and police blips, the mission
// marker and nearby hidden packages.

import { ROADS_X, ROADS_Z, WATER_Z } from './util.js';

export class Minimap {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.frame = 0;
  }

  // world -> map: x -205..205, z -190..235 fitted into the square canvas
  px(x, S) { return (x + 205) / 410 * S; }
  pz(z, S) { return (z + 190) / 425 * S; }

  draw(G, t) {
    this.frame++;
    if (this.frame % 2) return; // every other frame is plenty
    const g = this.g, S = this.cv.width;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#20242c';
    g.fillRect(0, 0, S, S);
    // water + sand
    g.fillStyle = '#1d6f8f';
    g.fillRect(0, this.pz(WATER_Z, S), S, S - this.pz(WATER_Z, S));
    g.fillStyle = '#c9ae76';
    g.fillRect(0, this.pz(128, S), S, this.pz(WATER_Z, S) - this.pz(128, S));
    // roads
    g.strokeStyle = '#5a6068';
    g.lineWidth = Math.max(2, S * 0.016);
    g.beginPath();
    for (const rx of ROADS_X) { g.moveTo(this.px(rx, S), this.pz(-178, S)); g.lineTo(this.px(rx, S), this.pz(104, S)); }
    for (const rz of ROADS_Z) { g.moveTo(this.px(-194, S), this.pz(rz, S)); g.lineTo(this.px(194, S), this.pz(rz, S)); }
    g.stroke();
    const pp = G.player.inVehicle ? G.player.inVehicle.pos : G.player.pos;
    // nearby packages
    g.fillStyle = '#39d353';
    for (const it of G.collectibles.items) {
      if (G.collectibles.found.has(it.id)) continue;
      if (Math.hypot(it.spot.x - pp.x, it.spot.z - pp.z) < 65) {
        g.beginPath(); g.arc(this.px(it.spot.x, S), this.pz(it.spot.z, S), 2.6, 0, 7); g.fill();
      }
    }
    // traffic
    g.fillStyle = '#cfd8dc';
    for (const c of G.traffic.cars) {
      g.beginPath(); g.arc(this.px(c.x, S), this.pz(c.z, S), 2.2, 0, 7); g.fill();
    }
    // police (flashing)
    for (const u of G.police.units) {
      g.fillStyle = Math.floor(t * 4) % 2 ? '#ff3b30' : '#3b82f6';
      g.beginPath(); g.arc(this.px(u.car.x, S), this.pz(u.car.z, S), 3, 0, 7); g.fill();
    }
    // mission marker
    if (G.missionTarget) {
      g.fillStyle = '#ffd60a';
      g.strokeStyle = 'rgba(255,214,10,0.5)';
      const mx = this.px(G.missionTarget.x, S), mz = this.pz(G.missionTarget.z, S);
      g.beginPath(); g.arc(mx, mz, 4 + Math.sin(t * 5) * 1.2, 0, 7); g.fill();
      g.beginPath(); g.arc(mx, mz, 7.5, 0, 7); g.stroke();
    }
    // player arrow — canvas angle from true heading: forward (sin h, cos h)
    const h = G.player.inVehicle ? G.player.inVehicle.heading : G.player.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const ang = Math.atan2(fx, -fz);
    const ax = this.px(pp.x, S), az = this.pz(pp.z, S);
    g.save();
    g.translate(ax, az);
    g.rotate(ang);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111318';
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(0, 2.6); g.lineTo(-4.4, 5);
    g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
