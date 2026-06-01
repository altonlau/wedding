/* ─────────────────────────────────────────────────────────────────────────────
   DISPOSABLE CAMERA — App Logic
───────────────────────────────────────────────────────────────────────────── */

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_URL = "https://wedding-mjvd.onrender.com";
const EVENT_NAME = "Abie & Alton's Wedding";
const FILE_NAME = "wedding";
const UNLOCK_AT = 2;
const SHOT_COUNT_KEY = "wedding-shot-count";
const ALBUM_UNLOCKED_KEY = "wedding-album-unlocked";

// ── State ─────────────────────────────────────────────────────────────────────
let stream = null;
let facingMode = "environment";
let currentMode = "photo";
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let shotCount = 0;
let albumUnlocked = false;
let albumShareUrl = "#";
let toastTimer = null;

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
});

// ── Screens ───────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.toggle("active", s.id === id);
  });
}

function applyEventName() {
  document.getElementById("cam-title").textContent = EVENT_NAME;
  document.getElementById("album-bar-title").textContent = EVENT_NAME;
  document.getElementById("album-card-title").textContent = EVENT_NAME;
}

// ── Album URL ─────────────────────────────────────────────────────────────────
function fetchAlbumUrl() {
  fetch(`${BACKEND_URL}/album`)
    .then((r) => r.json())
    .then((d) => {
      if (d.ok && d.shareUrl) {
        albumShareUrl = d.shareUrl;
        document.getElementById("open-photos-btn").href = albumShareUrl;
      }
    })
    .catch(() => {});
}

// ── Camera ────────────────────────────────────────────────────────────────────
function loadPersistedState() {
  try {
    const savedShotCount = parseInt(localStorage.getItem(SHOT_COUNT_KEY), 10);
    if (Number.isFinite(savedShotCount) && savedShotCount >= 0) {
      shotCount = savedShotCount;
    }

    albumUnlocked =
      localStorage.getItem(ALBUM_UNLOCKED_KEY) === "true" ||
      shotCount >= UNLOCK_AT;
  } catch (e) {
    console.warn("Unable to load saved state", e);
  }
}

function persistState() {
  try {
    localStorage.setItem(SHOT_COUNT_KEY, String(shotCount));
    localStorage.setItem(ALBUM_UNLOCKED_KEY, albumUnlocked ? "true" : "false");
  } catch (e) {
    console.warn("Unable to save state", e);
  }
}

async function startCamera() {
  try {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    });
    const video = document.getElementById("video");
    video.srcObject = stream;
  } catch (e) {
    showToast("Camera error: " + e.message, "error", 6000);
  }
}

function flipCamera() {
  facingMode = facingMode === "environment" ? "user" : "environment";
  startCamera();
}

function setMode(mode) {
  if (isRecording) return;
  currentMode = mode;
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

// ── Shutter ───────────────────────────────────────────────────────────────────
function handleShutter() {
  if (currentMode === "photo") takePhoto();
  else if (!isRecording) startRecording();
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
    mediaRecorder = new MediaRecorder(stream, { mimeType });
  } catch {
    mediaRecorder = new MediaRecorder(stream);
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
  isRecording = true;
  document.getElementById("shutter-btn").classList.add("recording");
  document.getElementById("rec-badge").classList.add("active");
}

function stopRecording() {
  if (mediaRecorder?.state !== "inactive") mediaRecorder.stop();
  isRecording = false;
  document.getElementById("shutter-btn").classList.remove("recording");
  document.getElementById("rec-badge").classList.remove("active");
}

// ── Preview ───────────────────────────────────────────────────────────────────
let pendingBlob = null;
let pendingType = null;

function showPreview(blob, type) {
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

function discardPreview() {
  const vid = document.getElementById("preview-vid");
  vid.pause();
  vid.src = "";
  pendingBlob = null;
  pendingType = null;
  showScreen("camera-screen");
}

function confirmUpload() {
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
  shotCount++;
  persistState();
  updateProgressDots();
  updateShotCounter();
  updateUnlockDots();
  checkUnlock();

  // Fire upload in background
  uploadMedia(blob, type);
}

// ── Album ─────────────────────────────────────────────────────────────────────
function openAlbum() {
  if (!albumUnlocked) {
    updateUnlockDots();
    document.getElementById("unlock-overlay").classList.add("active");
    return;
  }
  document.getElementById("stat-shots").textContent = shotCount;
  document.getElementById("open-photos-btn").href = albumShareUrl;
  showScreen("album-screen");
}

function goToCamera() {
  showScreen("camera-screen");
}

// ── Upload (fire and forget — call after confirmUpload) ──────────────────────
async function uploadMedia(blob, type) {
  const mime = blob.type || (type === "photo" ? "image/jpeg" : "video/webm");
  const ext = mime.includes("mp4")
    ? "mp4"
    : mime.includes("webm")
      ? "webm"
      : mime.includes("quicktime")
        ? "mov"
        : mime.includes("png")
          ? "png"
          : "jpg";

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${FILE_NAME}_${ts}.${ext}`;

  const form = new FormData();
  form.append("file", blob, filename);

  showToast("Uploading…", "", 30000);

  try {
    const resp = await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      body: form,
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Upload failed");

    showToast("Saved ✓", "success");

    if (shotCount === UNLOCK_AT) {
      updateUnlockDots();
      setTimeout(() => {
        document.getElementById("unlock-overlay").classList.add("active");
      }, 800);
    }
  } catch (e) {
    console.error("Upload error:", e);
    showToast("Upload failed — check your connection", "error", 5000);
  }
}

// ── Progress dots ─────────────────────────────────────────────────────────────
function buildProgressDots() {
  const strip = document.getElementById("progress-strip");
  strip.innerHTML = "";
  for (let i = 0; i < UNLOCK_AT; i++) {
    const d = document.createElement("div");
    d.className = "p-dot locked";
    d.id = "pdot-" + i;
    strip.appendChild(d);
  }
}

function updateProgressDots() {
  for (let i = 0; i < UNLOCK_AT; i++) {
    const d = document.getElementById("pdot-" + i);
    if (d) d.classList.toggle("filled", i < shotCount);
  }
}

function updateShotCounter() {
  document.getElementById("shot-counter").textContent =
    shotCount + " shot" + (shotCount === 1 ? "" : "s");
}

function syncUnlockUI() {
  updateProgressDots();
  updateShotCounter();
  updateUnlockDots();

  const lock = document.getElementById("album-lock");
  const albumBtn = document.getElementById("album-btn");
  if (albumUnlocked) {
    lock.textContent = "✓";
    lock.classList.add("unlocked");
    albumBtn.classList.remove("locked");
  } else {
    lock.textContent = "🔒";
    lock.classList.remove("unlocked");
    albumBtn.classList.add("locked");
  }

  document.getElementById("stat-shots").textContent = shotCount;
}

// ── Unlock overlay ────────────────────────────────────────────────────────────
function buildUnlockDots() {
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

function updateUnlockDots() {
  for (let i = 0; i < UNLOCK_AT; i++) {
    const d = document.getElementById("udot-" + i);
    if (d) d.classList.toggle("filled", i < shotCount);
  }
  document.getElementById("unlock-remaining").textContent = Math.max(
    0,
    UNLOCK_AT - shotCount,
  );
}

function closeUnlockOverlay() {
  document.getElementById("unlock-overlay").classList.remove("active");
}

function checkUnlock() {
  if (shotCount >= UNLOCK_AT && !albumUnlocked) {
    albumUnlocked = true;
    persistState();
    const lock = document.getElementById("album-lock");
    lock.textContent = "✓";
    lock.classList.add("unlocked");
    document.getElementById("album-btn").classList.remove("locked");
    showToast("🎉 Album unlocked!", "success", 3000);
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = "", duration = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = "";
  }, duration);
}
