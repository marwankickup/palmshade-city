// minimap.js — live canvas minimap: roads, water, blips, mission marker.
import { ROADS, WATER_X, BEACH_X } from './util.js';
const EXT = 300; // world half-extent mapped onto the canvas
export class Minimap {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.t = 0;
  }
  _px(x, size) { return (x + EXT) / (EXT * 2) * size; }
  draw(dt, s) {
    this.t += dt;
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    ctx.fillStyle = '#20242c'; ctx.fillRect(0, 0, W, H);
    // beach + water
    ctx.fillStyle = '#c2a15c'; ctx.fillRect(this._px(BEACH_X, W), 0, this._px(WATER_X, W) - this._px(BEACH_X, W), H);
    ctx.fillStyle = '#1d5f7a'; ctx.fillRect(this._px(WATER_X, W), 0, W - this._px(WATER_X, W), H);
    // blocks
    ctx.fillStyle = '#2c313a';
    for (let i = 0; i < ROADS.length - 1; i++) for (let j = 0; j < ROADS.length - 1; j++) {
      const x0 = this._px((ROADS[i] + ROADS[i + 1]) / 2 - 23, W), z0 = this._px((ROADS[j] + ROADS[j + 1]) / 2 - 23, H);
      ctx.fillRect(x0, z0, 46 / (EXT * 2) * W, 46 / (EXT * 2) * H);
    }
    // roads
    ctx.strokeStyle = '#454c58'; ctx.lineWidth = Math.max(2, W * 0.014);
    for (const r of ROADS) {
      ctx.beginPath(); ctx.moveTo(this._px(r, W), 0); ctx.lineTo(this._px(r, W), H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, this._px(r, H)); ctx.lineTo(W, this._px(r, H)); ctx.stroke();
    }
    const dot = (x, z, color, r = 3) => {
      ctx.fillStyle = color; ctx.beginPath();
      ctx.arc(this._px(x, W), this._px(z, H), r, 0, Math.PI * 2); ctx.fill();
    };
    // packages (nearby only)
    if (s.packages) for (const p of s.packages) {
      if (Math.abs(p.x - s.player.x) < 170 && Math.abs(p.z - s.player.z) < 170) dot(p.x, p.z, '#ff9d2e', 2.4);
    }
    if (s.traffic) for (const c of s.traffic) dot(c.group.position.x, c.group.position.z, '#9aa3ad', 2.2);
    if (s.police) for (const u of s.police) {
      dot(u.group.position.x, u.group.position.z, (this.t % 0.6) < 0.3 ? '#ff4444' : '#4488ff', 3);
    }
    // mission target: pulsing gold ring
    if (s.target) {
      const tx = this._px(s.target.x, W), tz = this._px(s.target.z, H);
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tx, tz, 5 + Math.sin(this.t * 5) * 1.6, 0, Math.PI * 2); ctx.stroke();
      dot(s.target.x, s.target.z, '#ffd23e', 2.4);
    }
    // player arrow
    const px = this._px(s.player.x, W), pz = this._px(s.player.z, H);
    ctx.save(); ctx.translate(px, pz); ctx.rotate(-s.player.heading + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(0, 2.4); ctx.lineTo(-4.4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
