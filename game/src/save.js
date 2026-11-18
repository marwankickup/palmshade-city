// Save games live in localStorage: money, finished missions, where the player stood and
// which car was theirs. One slot is plenty for a city this size.

const KEY = 'palmshade-city-save-v1';

/** The saved game object, or null when there is none (or it is unreadable). */
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

/** Persist a save object. Never throws: a full or blocked store just skips the save. */
export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: play on without saving */
  }
}

/** Forget the saved game. */
export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to forget */
  }
}

/** True when a Continue button is worth showing. */
export function hasSave() {
  return loadSave() !== null;
}
