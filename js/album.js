/* ─────────────────────────────────────────────────────────────────────────────
   Album — shot-progress dots, unlock overlay, and album screen navigation
───────────────────────────────────────────────────────────────────────────── */

import { UNLOCK_AT } from "./config.js";
import { state, persistState } from "./state.js";
import { showToast } from "./toast.js";
import { showScreen } from "./screens.js";

// ── Album screen navigation ─────────────────────────────────────────────────
export function openAlbum() {
  if (!state.albumUnlocked) {
    updateUnlockDots();
    document.getElementById("unlock-overlay").classList.add("active");
    return;
  }
  document.getElementById("stat-shots").textContent = state.shotCount;
  document.getElementById("open-photos-btn").href = state.albumShareUrl;
  showScreen("album-screen");
}

export function goToCamera() {
  showScreen("camera-screen");
}

// ── Progress dots ───────────────────────────────────────────────────────────
export function buildProgressDots() {
  const strip = document.getElementById("progress-strip");
  strip.innerHTML = "";
  for (let i = 0; i < UNLOCK_AT; i++) {
    const d = document.createElement("div");
    d.className = "p-dot locked";
    d.id = "pdot-" + i;
    strip.appendChild(d);
  }
}

export function updateProgressDots() {
  for (let i = 0; i < UNLOCK_AT; i++) {
    const d = document.getElementById("pdot-" + i);
    if (d) d.classList.toggle("filled", i < state.shotCount);
  }
}

export function updateShotCounter() {
  document.getElementById("shot-counter").textContent =
    state.shotCount + " shot" + (state.shotCount === 1 ? "" : "s");
}

export function syncUnlockUI() {
  updateProgressDots();
  updateShotCounter();
  updateUnlockDots();

  const lock = document.getElementById("album-lock");
  const albumBtn = document.getElementById("album-btn");
  if (state.albumUnlocked) {
    lock.textContent = "✓";
    lock.classList.add("unlocked");
    albumBtn.classList.remove("locked");
  } else {
    lock.textContent = "🔒";
    lock.classList.remove("unlocked");
    albumBtn.classList.add("locked");
  }

  document.getElementById("stat-shots").textContent = state.shotCount;
}

// ── Unlock overlay ──────────────────────────────────────────────────────────
export function buildUnlockDots() {
  const wrap = document.getElementById("unlock-dots");
  wrap.innerHTML = "";
  for (let i = 0; i < UNLOCK_AT; i++) {
    const d = document.createElement("div");
    d.className = "u-dot";
    d.id = "udot-" + i;
    wrap.appendChild(d);
  }
  document.getElementById("unlock-needed").textContent = UNLOCK_AT;
  document.getElementById("unlock-remaining").textContent = UNLOCK_AT;
}

export function updateUnlockDots() {
  for (let i = 0; i < UNLOCK_AT; i++) {
    const d = document.getElementById("udot-" + i);
    if (d) d.classList.toggle("filled", i < state.shotCount);
  }
  document.getElementById("unlock-remaining").textContent = Math.max(
    0,
    UNLOCK_AT - state.shotCount,
  );
}

export function closeUnlockOverlay() {
  document.getElementById("unlock-overlay").classList.remove("active");
}

export function checkUnlock() {
  if (state.shotCount >= UNLOCK_AT && !state.albumUnlocked) {
    state.albumUnlocked = true;
    persistState();
    const lock = document.getElementById("album-lock");
    lock.textContent = "✓";
    lock.classList.add("unlocked");
    document.getElementById("album-btn").classList.remove("locked");
    showToast("🎉 Album unlocked!", "success", 3000);
  }
}
