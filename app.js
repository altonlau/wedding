/* ─────────────────────────────────────────────────────────────────────────────
   DISPOSABLE CAMERA — App Logic
───────────────────────────────────────────────────────────────────────────── */

// ── ✏️  CONFIG — update BACKEND_URL after deploying to Railway ─────────────────
const BACKEND_URL = "https://wedding-mjvd.onrender.com"; // ← paste your Railway URL here
const EVENT_NAME = "Abie & Alton's Wedding";
const FILE_NAME = "wedding";
const UNLOCK_AT = 5; // shots needed to unlock the album view
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

// ── Album URL (fetched from backend on load) ──────────────────────────────────
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
  void flash.offsetWidth;
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

  const candidates = ["video/mp4"];
  const mimeType =
    candidates.find((c) => MediaRecorder.isTypeSupported(c)) || "";

  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch {
    mediaRecorder = new MediaRecorder(stream);
  }

  // If the selected/actual MIME isn't MP4, abort — backend conversion is expensive.
  const actualMime = mediaRecorder.mimeType || mimeType || "";
  if (!actualMime.startsWith("video/mp4")) {
    showToast(
      "Cannot record video. Try using a different browser.",
      "error",
      6000,
    );
    mediaRecorder = null;
    return;
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

  mediaRecorder.start(1000);
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

// ── Upload ────────────────────────────────────────────────────────────────────
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
    FILE_NAME.replace(/[^a-zA-Z0-9]/g, "_") + "_" + ts + "." + ext;

  try {
    setProgress(15);

    // Send as multipart/form-data — clean and efficient, no base64 overhead
    const form = new FormData();
    form.append("file", capturedBlob, filename);

    setProgress(30);

    const resp = await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      body: form,
      // Don't set Content-Type — browser sets it with the correct boundary
    });

    setProgress(90);

    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Upload failed");

    setProgress(100);

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
