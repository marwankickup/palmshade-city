// save.js — localStorage persistence: money, mission index, packages, position,
// garage upgrades, district standing, stats and recruited crew (v9).
const KEY = 'palmshade-city-save-v1';
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, v | 0));
export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d !== 'object' || d === null) return null;
    const up = d.upgrades && typeof d.upgrades === 'object' ? d.upgrades : {};
    const st = d.standing && typeof d.standing === 'object' ? d.standing : {};
    const stats = d.stats && typeof d.stats === 'object' ? d.stats : {};
    return {
      money: d.money | 0,
      missionIndex: d.missionIndex | 0,
      packages: Array.isArray(d.packages) ? d.packages.filter(n => Number.isInteger(n)) : [],
      pos: d.pos && isFinite(d.pos.x) && isFinite(d.pos.z) ? { x: d.pos.x, z: d.pos.z } : { x: 150, z: -8 },
      finished: !!d.finished,
      upgrades: {
        engine: clampInt(up.engine, 0, 3),
        armor: clampInt(up.armor, 0, 3),
        nitro: clampInt(up.nitro, 0, 3),
      },
      standing: {
        beach: clampInt(st.beach, 0, 100),
        centro: clampInt(st.centro, 0, 100),
        west: clampInt(st.west, 0, 100),
      },
      stats: { carjacks: Math.max(0, stats.carjacks | 0) },
      crew: Array.isArray(d.crew) ? d.crew.filter(id => id === 'vex' || id === 'tito') : [],
    };
  } catch { return null; }
}
export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
