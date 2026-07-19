/* ─────────────────────────────────────────────────────────────────────────────
   Capture — shutter, photo snapshot, video recording
───────────────────────────────────────────────────────────────────────────── */

import { showPreview } from "./preview.js";
import { state } from "./state.js";
import { showToast } from "./toast.js";

let mediaRecorder = null;
let recordedChunks = [];

export function handleShutter() {
  if (state.currentMode === "photo") takePhoto();
  else if (!state.isRecording) startRecording();
  else stopRecording();
}

function takePhoto() {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  const flash = document.getElementById("flash");
  flash.classList.remove("go");
  void flash.offsetWidth;
  flash.classList.add("go");

  canvas.toBlob(
    (blob) => {
      showPreview(blob, "photo");
    },
    "image/jpeg",
    0.93,
  );
}

function pickMimeType() {
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || "";
}

function startRecording() {
  recordedChunks = [];
  const mimeType = pickMimeType();

  if (!mimeType) {
    showToast("Video recording not supported on this browser.", "error", 5000);
    return;
  }

  try {
    mediaRecorder = new MediaRecorder(state.stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000, // ~2.5 Mbps — plenty for phone video, less to convert/upload
    });
  } catch {
    mediaRecorder = new MediaRecorder(state.stream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data?.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const actualMime = mediaRecorder.mimeType || mimeType || "video/webm";
    const blob = new Blob(recordedChunks, { type: actualMime });
    showPreview(blob, "video");
  };

  mediaRecorder.start(1000);
  state.isRecording = true;
  document.getElementById("shutter-btn").classList.add("recording");
  document.getElementById("rec-badge").classList.add("active");
}

function stopRecording() {
  if (mediaRecorder?.state !== "inactive") mediaRecorder.stop();
  state.isRecording = false;
  document.getElementById("shutter-btn").classList.remove("recording");
  document.getElementById("rec-badge").classList.remove("active");
}
