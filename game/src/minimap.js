// minimap.js — live 2D canvas minimap: roads, beach, blips for traffic/police/missions/packages.

import { ROAD_X, ROAD_Z, WATER_X, clamp } from './util.js';

// world → map transform (map is square; world x[-290,330], z[-215,215])
const MX0 = -290, MZ0 = -215, MW = 620, MH = 430;

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.size = canvas.width;
    // pre-render static layer
    this.bg = document.createElement('canvas');
    this.bg.width = canvas.width; this.bg.height = canvas.height;
    const g = this.bg.getContext('2d');
    const sx = (x) => (x - MX0) / MW * this.size;
    const sz = (z) => (z - MZ0) / MH * this.size;
    this.sx = sx; this.sz = sz;
    g.fillStyle = '#565049';
    g.fillRect(0, 0, this.size, this.size);
    // water + beach
    g.fillStyle = '#e3cd9c';
    g.fillRect(sx(205), 0, sx(WATER_X) - sx(205), this.size);
    g.fillStyle = '#2b7f96';
    g.fillRect(sx(WATER_X), 0, this.size - sx(WATER_X), this.size);
    // roads
    g.fillStyle = '#33363b';
    for (const rx of ROAD_X) g.fillRect(sx(rx - 8), 0, sx(rx + 8) - sx(rx - 8), this.size);
    for (const rz of ROAD_Z) g.fillRect(0, sz(rz - 8), this.size, sz(rz + 8) - sz(rz - 8));
    // marina pier
    g.fillStyle = '#9a7c56';
    g.fillRect(sx(234), sz(29), sx(294) - sx(234), sz(47) - sz(29));
  }

  draw(state) {
    const g = this.g, s = this.size;
    g.clearRect(0, 0, s, s);
    g.drawImage(this.bg, 0, 0);
    const px = (x) => clamp(this.sx(x), 0, s);
    const pz = (z) => clamp(this.sz(z), 0, s);
    const dot = (x, z, color, r) => {
      g.fillStyle = color;
      g.beginPath(); g.arc(px(x), pz(z), r, 0, 7); g.fill();
    };
    // packages (nearby only)
    if (state.packages) {
      for (const p of state.packages) {
        if (p.found) continue;
        const d = Math.hypot(p.x - state.player.x, p.z - state.player.z);
        if (d < 90) dot(p.x, p.z, '#53e0d0', 2.4);
      }
    }
    // traffic
    if (state.traffic) for (const t of state.traffic) dot(t.car.pos.x, t.car.pos.z, '#cfd4d9', 2);
    // police (blink)
    if (state.police && (performance.now() % 700) < 420) {
      for (const u of state.police) dot(u.car.pos.x, u.car.pos.z, '#ff4444', 3);
    }
    // mission target
    if (state.target) {
      const pulse = 3.4 + Math.sin(performance.now() / 240) * 0.9;
      g.strokeStyle = '#ffc93c';
      g.lineWidth = 2;
      g.beginPath(); g.arc(px(state.target.x), pz(state.target.z), pulse + 2.5, 0, 7); g.stroke();
      dot(state.target.x, state.target.z, '#ffc93c', 2.6);
    }
    // player arrow (canvas rotation for world heading θ is π − θ)
    const x = px(state.player.x), y = pz(state.player.z);
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI - state.player.heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#222';
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(0, 2.4); g.lineTo(-4.4, 5);
    g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
