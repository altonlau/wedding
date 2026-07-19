/* ─────────────────────────────────────────────────────────────────────────────
   Camera — stream lifecycle, flip, capture mode toggle
───────────────────────────────────────────────────────────────────────────── */

import { state } from "./state.js";
import { showToast } from "./toast.js";

let facingMode = "environment";

export async function startCamera() {
  try {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    });
    const video = document.getElementById("video");
    video.srcObject = state.stream;
  } catch (e) {
    showToast("Camera error: " + e.message, "error", 6000);
  }
}

export function flipCamera() {
  facingMode = facingMode === "environment" ? "user" : "environment";
  startCamera();
}

export function setMode(mode) {
  if (state.isRecording) return;
  state.currentMode = mode;
  document
    .getElementById("pill-photo")
    .classList.toggle("active", mode === "photo");
  document
    .getElementById("pill-video")
    .classList.toggle("active", mode === "video");
  document
    .getElementById("shutter-btn")
    .classList.toggle("video-mode", mode === "video");
}
