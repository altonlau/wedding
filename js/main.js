/* ─────────────────────────────────────────────────────────────────────────────
   DISPOSABLE CAMERA — entry point: boot sequence + event wiring
───────────────────────────────────────────────────────────────────────────── */

import { loadPersistedState } from "./state.js";
import { applyEventName } from "./screens.js";
import { showScreen } from "./screens.js";
import { startCamera, flipCamera, setMode } from "./camera.js";
import { handleShutter } from "./capture.js";
import { discardPreview, confirmUpload } from "./preview.js";
import { fetchAlbumUrl } from "./upload.js";
import {
  openAlbum,
  goToCamera,
  buildProgressDots,
  buildUnlockDots,
  syncUnlockUI,
  closeUnlockOverlay,
} from "./album.js";

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  loadPersistedState();
  applyEventName();
  buildProgressDots();
  buildUnlockDots();
  syncUnlockUI();
  showScreen("camera-screen");
  startCamera();
  fetchAlbumUrl();

  wireEvents();
});

// ── Event wiring (replaces inline onclick handlers) ─────────────────────────────
function wireEvents() {
  const on = (id, event, handler) =>
    document.getElementById(id)?.addEventListener(event, handler);

  on("flip-btn", "click", flipCamera);
  on("pill-photo", "click", () => setMode("photo"));
  on("pill-video", "click", () => setMode("video"));
  on("shutter-btn", "click", handleShutter);
  on("album-btn", "click", openAlbum);
  on("discard-btn", "click", discardPreview);
  on("retake-btn", "click", discardPreview);
  on("upload-btn", "click", confirmUpload);
  on("take-more-btn", "click", goToCamera);
  on("unlock-dismiss-btn", "click", closeUnlockOverlay);
}
