// Live 2D minimap: roads, beach and water, player arrow, traffic dots,
// blinking police, the gold mission marker and nearby package blips.
import { V_ROADS, H_ROADS, BEACH_X, WATER_X } from './util.js';

const MX0 = -210, MX1 = 262, MZ0 = -190, MZ1 = 190; // world window shown

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;
    this.sx = this.w / (MX1 - MX0);
    this.sz = this.h / (MZ1 - MZ0);
  }

  _x(x) { return (x - MX0) * this.sx; }
  _z(z) { return (z - MZ0) * this.sz; }

  draw(ctx) {
    const { g, w, h } = this;
    const { player, trafficCars, policeCars, marker, packages, t } = ctx;
    g.clearRect(0, 0, w, h);
    // land + beach + water
    g.fillStyle = '#6f7f5c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8d8672'; g.fillRect(this._x(-182), 0, (BEACH_X + 182) * this.sx, h);
    g.fillStyle = '#ecd29a'; g.fillRect(this._x(BEACH_X), 0, (WATER_X - BEACH_X) * this.sx, h);
    g.fillStyle = '#2e7f9a'; g.fillRect(this._x(WATER_X), 0, w - this._x(WATER_X), h);
    // roads
    g.strokeStyle = '#3c3f45';
    g.lineWidth = Math.max(2, 14 * this.sx);
    for (const x of V_ROADS) {
      g.beginPath(); g.moveTo(this._x(x), 0); g.lineTo(this._x(x), h); g.stroke();
    }
    for (const z of H_ROADS) {
      g.beginPath(); g.moveTo(0, this._z(z)); g.lineTo(this._x(BEACH_X + 4), this._z(z)); g.stroke();
    }
    // packages (only when fairly near — they're hidden, after all)
    if (packages) {
      g.fillStyle = '#51e07a';
      for (const p of packages) {
        if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) > 65) continue;
        g.fillRect(this._x(p.x) - 2, this._z(p.z) - 2, 4, 4);
      }
    }
    // traffic
    g.fillStyle = '#e8e3d9';
    for (const c of trafficCars) {
      g.fillRect(this._x(c.pos.x) - 1.5, this._z(c.pos.z) - 1.5, 3, 3);
    }
    // police (blinking red/blue)
    for (const c of policeCars) {
      g.fillStyle = Math.sin(t * 10) > 0 ? '#ff4444' : '#4488ff';
      g.beginPath();
      g.arc(this._x(c.pos.x), this._z(c.pos.z), 3, 0, Math.PI * 2);
      g.fill();
    }
    // mission marker
    if (marker) {
      g.fillStyle = '#ffd94d';
      g.strokeStyle = '#8a6d1f';
      g.beginPath();
      g.arc(this._x(marker.x), this._z(marker.z), 4.5, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
    // player arrow (canvas y grows downward like world z, so rotate by PI - heading)
    const px = this._x(player.pos.x), pz = this._z(player.pos.z);
    const heading = player.mode === 'car' && ctx.playerCar ? ctx.playerCar.heading : player.heading;
    g.save();
    g.translate(px, pz);
    g.rotate(Math.PI - heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#222';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.4, 5);
    g.lineTo(0, 2.6);
    g.lineTo(-4.4, 5);
    g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
}
