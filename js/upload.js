/* ─────────────────────────────────────────────────────────────────────────────
   Upload — fire-and-forget media upload
───────────────────────────────────────────────────────────────────────────── */

import { BACKEND_URL, FILE_NAME } from "./config.js";
import { showToast } from "./toast.js";

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
  } catch (e) {
    console.error("Upload error:", e);
    showToast("Upload failed — check your connection", "error", 5000);
  }
}
