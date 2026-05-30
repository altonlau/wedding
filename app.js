/* ─────────────────────────────────────────────────────────────────────────────
   DISPOSABLE CAMERA — App Logic
───────────────────────────────────────────────────────────────────────────── */

// ── ✏️  CONFIG — edit these before deploying ──────────────────────────────────
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzbDGcv3XTT3BcP7VykygRChwSwvpVJMtGipwDwNoc2sgAh1GGDLBH4vXWtZ4KhivPlkQ/exec";
const EVENT_NAME = "Abie & Alton's Wedding";
const UNLOCK_AT = 5; // number of uploads required to unlock the album view
// ─────────────────────────────────────────────────────────────────────────────

// ── State ─────────────────────────────────────────────────────────────────────
let stream = null;
let facingMode = "environment";
let currentMode = "photo";
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let capturedBlob = null;
let capturedType = null;
let shotCount = 0;
let albumUnlocked = false;
let albumShareUrl = "#";
let toastTimer = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  applyEventName();
  buildProgressDots();
  buildUnlockDots();
  showScreen("camera-screen");
  startCamera();
  fetchAlbumUrl();
});

// ── Screen navigation ─────────────────────────────────────────────────────────
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
  fetch(SCRIPT_URL + "?action=getAlbum", { redirect: "follow" })
    .then((r) => {
      if (!r.ok) throw new Error(`Album endpoint ${r.status}`);
      return r.json();
    })
    .then((d) => {
      if (d.ok && d.shareUrl) {
        albumShareUrl = d.shareUrl;
        document.getElementById("open-photos-btn").href = albumShareUrl;
      }
    })
    .catch((err) => {
      console.warn("Album fetch failed:", err);
      showToast("Album endpoint unavailable", "error", 4000);
    });
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    });
    document.getElementById("video").srcObject = stream;
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
  canvas.getContext("2d").drawImage(video, 0, 0);

  // Flash effect
  const flash = document.getElementById("flash");
  flash.classList.remove("go");
  void flash.offsetWidth; // force reflow to restart animation
  flash.classList.add("go");

  canvas.toBlob(
    (blob) => {
      capturedBlob = blob;
      capturedType = "photo";
      showPreview(blob, "photo");
    },
    "image/jpeg",
    0.93,
  );
}

function startRecording() {
  recordedChunks = [];

  // Pick the best supported codec
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const mimeType =
    candidates.find((c) => MediaRecorder.isTypeSupported(c)) || "";

  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch {
    mediaRecorder = new MediaRecorder(stream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const finalMime = mediaRecorder.mimeType || "video/webm";
    const blob = new Blob(recordedChunks, { type: finalMime });
    capturedBlob = blob;
    capturedType = "video";
    showPreview(blob, "video");
  };

  mediaRecorder.start(1000); // flush chunks every second
  isRecording = true;
  document.getElementById("shutter-btn").classList.add("recording");
  document.getElementById("rec-badge").classList.add("active");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  isRecording = false;
  document.getElementById("shutter-btn").classList.remove("recording");
  document.getElementById("rec-badge").classList.remove("active");
}

// ── Preview ───────────────────────────────────────────────────────────────────
function showPreview(blob, type) {
  document.getElementById("upload-bar").style.width = "0%";
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

  const btn = document.getElementById("save-btn");
  btn.disabled = false;
  btn.textContent = "Save to Album";
}

function closePreview() {
  const vid = document.getElementById("preview-vid");
  vid.pause();
  vid.src = "";
  capturedBlob = null;
  capturedType = null;
  showScreen("camera-screen");
}

// ── Album navigation ──────────────────────────────────────────────────────────
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

// ── Upload to Apps Script → Google Photos ─────────────────────────────────────
async function saveToDrive() {
  if (!capturedBlob) return;

  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "Uploading…";

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const mime =
    capturedBlob.type ||
    (capturedType === "photo" ? "image/jpeg" : "video/webm");
  const ext = mime.includes("mp4")
    ? "mp4"
    : mime.includes("webm")
      ? "webm"
      : mime.includes("jpeg") || mime.includes("jpg")
        ? "jpg"
        : mime.includes("png")
          ? "png"
          : capturedType === "photo"
            ? "jpg"
            : "webm";

  const filename =
    EVENT_NAME.replace(/[^a-zA-Z0-9]/g, "_") + "_" + ts + "." + ext;

  try {
    setProgress(20);
    const base64 = await blobToBase64(capturedBlob);

    setProgress(50);
    const formData = new FormData();
    formData.append("action", "upload");
    formData.append("filename", filename);
    formData.append("mimeType", mime);
    formData.append("fileData", base64);

    const resp = await fetch(SCRIPT_URL, {
      method: "POST",
      body: formData,
      redirect: "follow",
    });

    setProgress(90);

    // Apps Script may return HTML on redirect — parse defensively
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text.trim());
    } catch {
      data = { ok: false, error: text.slice(0, 120) };
    }

    if (!resp.ok && data.ok !== true) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    if (data.ok === false) throw new Error(data.error || "Upload failed");

    setProgress(100);

    // Increment confirmed shot count
    shotCount++;
    updateProgressDots();
    updateShotCounter();
    checkUnlock();

    showToast("Saved to album ✓", "success");
    btn.textContent = "Saved ✓";

    setTimeout(() => {
      closePreview();
      if (shotCount === UNLOCK_AT) {
        updateUnlockDots();
        document.getElementById("unlock-overlay").classList.add("active");
      }
    }, 900);
  } catch (e) {
    console.error("Upload error:", e);
    btn.disabled = false;
    btn.textContent = "Save to Album";
    setProgress(0);
    showToast("Upload failed — try again", "error", 5000);
  }
}

function setProgress(pct) {
  document.getElementById("upload-bar").style.width = pct + "%";
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
  const rem = Math.max(0, UNLOCK_AT - shotCount);
  document.getElementById("unlock-remaining").textContent = rem;
}

function closeUnlockOverlay() {
  document.getElementById("unlock-overlay").classList.remove("active");
}

function checkUnlock() {
  if (shotCount >= UNLOCK_AT && !albumUnlocked) {
    albumUnlocked = true;
    const lock = document.getElementById("album-lock");
    lock.textContent = "✓";
    lock.classList.add("unlocked");
    document.getElementById("album-btn").disabled = false;
    showToast("🎉 Album unlocked!", "success", 3000);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function showToast(msg, type = "", duration = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = "";
  }, duration);
}
