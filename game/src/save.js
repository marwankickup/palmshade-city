// localStorage save/load: money, mission progress, packages found, player position.
const KEY = 'palmshade-city-save-v2';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: game still runs, just without persistence */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function hasSave() {
  return loadSave() !== null;
}
