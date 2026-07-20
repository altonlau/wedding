/* ─────────────────────────────────────────────────────────────────────────────
   Camera — stream lifecycle, flip, capture mode toggle
───────────────────────────────────────────────────────────────────────────── */

import { state } from "./state.js";
import { showToast } from "./toast.js";

let facingMode = "environment";

// Mirror the live preview for the front camera so it behaves like a mirror.
// Captured photos/videos come from the raw (un-mirrored) stream. The track's
// own settings say which camera the browser actually picked; fall back to the
// requested facingMode when the device doesn't report one (common on desktop).
function updateMirror() {
  const track = state.stream?.getVideoTracks()[0];
  const actual = track?.getSettings().facingMode ?? facingMode;
  document
    .getElementById("video")
    .classList.toggle("mirrored", actual === "user");
}

export async function startCamera() {
  try {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    });
    const video = document.getElementById("video");
    video.srcObject = state.stream;
    updateMirror();
  } catch (e) {
    showToast("Camera error: " + e.message, "error", 6000);
  }
}

export async function flipCamera() {
  if (state.isRecording) return;
  facingMode = facingMode === "environment" ? "user" : "environment";
  if (!state.stream) return startCamera();

  const oldTrack = state.stream.getVideoTracks()[0];

  // Preferred path: retarget the live track. applyConstraints never triggers
  // a permission prompt, unlike any call to getUserMedia. "exact" is required —
  // with "ideal" the browser may satisfy the constraint by doing nothing.
  if (oldTrack) {
    try {
      await oldTrack.applyConstraints({ facingMode: { exact: facingMode } });
      updateMirror();
      return;
    } catch {
      /* browser can't switch in place — fall through to track swap */
    }
  }

  try {
    // Swap only the video track, keeping the stream and its mic track alive.
    // The old track must stop first: iOS allows one active camera at a time.
    if (oldTrack) {
      oldTrack.stop();
      state.stream.removeTrack(oldTrack);
    }
    const camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    state.stream.addTrack(camStream.getVideoTracks()[0]);
    document.getElementById("video").srcObject = state.stream;
    updateMirror();
  } catch (e) {
    showToast("Camera error: " + e.message, "error", 6000);
  }
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
