/* ─────────────────────────────────────────────────────────────────────────────
   Upload — album URL fetch + fire-and-forget media upload
───────────────────────────────────────────────────────────────────────────── */

import { BACKEND_URL, FILE_NAME, UNLOCK_AT } from "./config.js";
import { state } from "./state.js";
import { showToast } from "./toast.js";
import { updateUnlockDots } from "./album.js";

export function fetchAlbumUrl() {
  fetch(`${BACKEND_URL}/album`)
    .then((r) => r.json())
    .then((d) => {
      if (d.ok && d.shareUrl) {
        state.albumShareUrl = d.shareUrl;
        document.getElementById("open-photos-btn").href = state.albumShareUrl;
      }
    })
    .catch(() => {});
}

export async function uploadMedia(blob, type) {
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

    if (state.shotCount === UNLOCK_AT) {
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
