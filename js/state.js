/* ─────────────────────────────────────────────────────────────────────────────
   State — shared mutable app state + persistence

   ES module exports are read-only live bindings, so cross-module mutable state
   lives on this single object. Modules mutate it in place (e.g. state.shotCount++).
   State used by only one module stays local to that module.
───────────────────────────────────────────────────────────────────────────── */

import { SHOT_COUNT_KEY } from "./config.js";

export const state = {
  stream: null,
  currentMode: "photo",
  isRecording: false,
  shotCount: 0,
};

export function loadPersistedState() {
  try {
    const savedShotCount = parseInt(localStorage.getItem(SHOT_COUNT_KEY), 10);
    if (Number.isFinite(savedShotCount) && savedShotCount >= 0) {
      state.shotCount = savedShotCount;
    }
  } catch (e) {
    console.warn("Unable to load saved state", e);
  }
}

export function persistState() {
  try {
    localStorage.setItem(SHOT_COUNT_KEY, String(state.shotCount));
  } catch (e) {
    console.warn("Unable to save state", e);
  }
}
