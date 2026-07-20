/* ─────────────────────────────────────────────────────────────────────────────
   Album — shot counter and album screen navigation
───────────────────────────────────────────────────────────────────────────── */

import { refreshGallery } from "./gallery.js";
import { showScreen } from "./screens.js";
import { state } from "./state.js";

// ── Album screen navigation ─────────────────────────────────────────────────
export function openAlbum() {
  document.getElementById("stat-shots").textContent = state.shotCount;
  showScreen("album-screen");
  refreshGallery();
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
