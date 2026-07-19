/* ─────────────────────────────────────────────────────────────────────────────
   DISPOSABLE CAMERA — entry point: boot sequence + event wiring
───────────────────────────────────────────────────────────────────────────── */

import { goToCamera, openAlbum, syncShotUI } from "./album.js";
import { flipCamera, setMode, startCamera } from "./camera.js";
import { handleShutter } from "./capture.js";
import { confirmUpload, discardPreview } from "./preview.js";
import { applyEventName, showScreen } from "./screens.js";
import { loadPersistedState } from "./state.js";
import { fetchAlbumUrl } from "./upload.js";

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  loadPersistedState();
  applyEventName();
  syncShotUI();
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
}
