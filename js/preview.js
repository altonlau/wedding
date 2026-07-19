/* ─────────────────────────────────────────────────────────────────────────────
   Preview — review a capture, then discard or upload
───────────────────────────────────────────────────────────────────────────── */

import { updateShotCounter } from "./album.js";
import { showScreen } from "./screens.js";
import { persistState, state } from "./state.js";
import { uploadMedia } from "./upload.js";

let pendingBlob = null;
let pendingType = null;

export function showPreview(blob, type) {
  pendingBlob = blob;
  pendingType = type;
  showScreen("preview-screen");

  const img = document.getElementById("preview-img");
  const vid = document.getElementById("preview-vid");
  const url = URL.createObjectURL(blob);

  if (type === "photo") {
    img.src = url;
    img.style.display = "block";
    vid.pause();
    vid.src = "";
    vid.style.display = "none";
  } else {
    vid.src = url;
    vid.style.display = "block";
    img.style.display = "none";
  }
}

export function discardPreview() {
  const vid = document.getElementById("preview-vid");
  vid.pause();
  vid.src = "";
  pendingBlob = null;
  pendingType = null;
  showScreen("camera-screen");
}

export function confirmUpload() {
  if (!pendingBlob) return;
  const blob = pendingBlob;
  const type = pendingType;
  pendingBlob = null;
  pendingType = null;

  // Immediately return to camera
  const vid = document.getElementById("preview-vid");
  vid.pause();
  vid.src = "";
  showScreen("camera-screen");

  // Update counts now so the UI feels instant
  state.shotCount++;
  persistState();
  updateShotCounter();

  // Fire upload in background
  uploadMedia(blob, type);
}
