// save.js — SOLMAR's localStorage save: cash, rank, mission progress,
// the Coral Loft, the Comet GT and Milo's bests.

export const SAVE_KEY = 'solmar-v5-save';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Private mode or a full store: the game plays on without saving.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Milo's rank from everything he has ever earned. */
export function rankName(total) {
  if (total >= 8000) return 'Kingpin of Solmar';
  if (total >= 4000) return 'Street Boss';
  if (total >= 1500) return 'Hustler';
  return 'Wheelman';
}
