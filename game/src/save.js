// save.js — localStorage persistence.
const KEY = 'palmshade-save-v1';
export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.money !== 'number' || typeof d.missionIndex !== 'number') return null;
    return d;
  } catch { return null; }
}
export function writeSave(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage unavailable */ }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
