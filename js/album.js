/* ─────────────────────────────────────────────────────────────────────────────
   Album — shot counter and album screen navigation
───────────────────────────────────────────────────────────────────────────── */

import { showScreen } from "./screens.js";
import { state } from "./state.js";

// ── Album screen navigation ─────────────────────────────────────────────────
export function openAlbum() {
  document.getElementById("stat-shots").textContent = state.shotCount;
  document.getElementById("open-photos-btn").href = state.albumShareUrl;
  showScreen("album-screen");
}

export function goToCamera() {
  showScreen("camera-screen");
}

// ── Shot counter ────────────────────────────────────────────────────────────
export function updateShotCounter() {
  document.getElementById("shot-counter").textContent =
    state.shotCount + " shot" + (state.shotCount === 1 ? "" : "s");
}

export function syncShotUI() {
  updateShotCounter();
  document.getElementById("stat-shots").textContent = state.shotCount;
}
