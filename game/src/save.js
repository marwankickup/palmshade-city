// save.js — localStorage persistence: money, story progress, position.
const KEY = 'palmshade-city-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
export function saveGame(data) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...data, at: Date.now() })); return true; }
  catch { return false; }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
