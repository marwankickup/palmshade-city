// minimap.js — live canvas minimap: roads, water, blips, player arrow, mission marker.
import { ROADS, ROAD_W, SAND_X, WATER_X, WORLD } from './util.js';

export class Minimap {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.W = canvas.width; this.H = canvas.height;
  }
  sx(x) { return ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * this.W; }
  sz(z) { return ((z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)) * this.H; }
  draw(s) {
    const g = this.g, W = this.W, H = this.H;
    g.fillStyle = '#23262c'; g.fillRect(0, 0, W, H);
    // sand + water
    g.fillStyle = '#c9a86a'; g.fillRect(this.sx(SAND_X), 0, this.sx(WATER_X) - this.sx(SAND_X), H);
    g.fillStyle = '#17607e'; g.fillRect(this.sx(WATER_X), 0, W - this.sx(WATER_X), H);
    // park
    g.fillStyle = '#2e5230'; g.fillRect(this.sx(8), this.sz(8), this.sx(72) - this.sx(8), this.sz(72) - this.sz(8));
    // roads
    g.fillStyle = '#3d4149';
    for (const r of ROADS) {
      g.fillRect(this.sx(r - ROAD_W / 2), 0, this.sx(r + ROAD_W / 2) - this.sx(r - ROAD_W / 2), H);
      g.fillRect(0, this.sz(r - ROAD_W / 2), this.sx(SAND_X), this.sz(r + ROAD_W / 2) - this.sz(r - ROAD_W / 2));
    }
    const dot = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(this.sx(x), this.sz(z), r, 0, 7); g.fill(); };
    // packages
    for (const p of s.packages) dot(p.x, p.z, 2, '#37e08b');
    // traffic
    for (const c of s.traffic) dot(c.mesh.position.x, c.mesh.position.z, 2, '#cfd4da');
    // peds
    g.fillStyle = '#e8b4b8';
    for (const p of s.peds) { if (p.state !== 'down') dot(p.pos.x, p.pos.z, 1.3, '#e8b4b8'); }
    // police (flash)
    const flash = Math.sin(performance.now() * 0.012) > 0;
    for (const u of s.police) dot(u.mesh.position.x, u.mesh.position.z, 2.6, flash ? '#ff4444' : '#4488ff');
    // mission marker
    if (s.marker) {
      const x = this.sx(s.marker.x), y = this.sz(s.marker.z);
      g.fillStyle = '#ffd23e'; g.strokeStyle = '#ffd23e'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, y, 5, 0, 7); g.stroke();
      dot(s.marker.x, s.marker.z, 2.2, '#ffd23e');
    }
    // player arrow
    const px = this.sx(s.player.x), py = this.sz(s.player.z), a = s.player.heading;
    g.save(); g.translate(px, py); g.rotate(Math.PI - a);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#111'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(0, 2.6); g.lineTo(-4.4, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
