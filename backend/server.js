import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import { OAuth2Client } from "google-auth-library";
import multer from "multer";
import fetch from "node-fetch";
import os from "os";
import path from "path";

// ── Config ────────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 8080;
const ALBUM_NAME = process.env.ALBUM_NAME || "Abie & Alton's Wedding";
const PHOTOS_BASE = "https://photoslibrary.googleapis.com/v1";

app.set("trust proxy", 1);
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ── Auth ──────────────────────────────────────────────────────────────────────
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

async function getToken() {
  const { token } = await oauth2Client.getAccessToken();
  if (!token)
    throw new Error("Failed to obtain access token — check credentials.");
  return token;
}

// ── ffmpeg conversion (webm → mp4) ────────────────────────────────────────────
async function toMp4(buffer, filename) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ext = path.extname(filename) || ".webm";
  const inp = path.join(os.tmpdir(), `in-${id}${ext}`);
  const out = path.join(os.tmpdir(), `out-${id}.mp4`);

  await fs.writeFile(inp, buffer);

  try {
    await new Promise((resolve, reject) =>
      ffmpeg(inp)
        .outputOptions([
          "-c:v libx264",
          "-preset veryfast",
          "-crf 26",
          "-c:a aac",
          "-b:a 96k",
          "-movflags +faststart",
          "-vf",
          "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ])
        .on("end", resolve)
        .on("error", reject)
        .save(out),
    );
    return await fs.readFile(out);
  } finally {
    await Promise.allSettled([
      fs.rm(inp, { force: true }),
      fs.rm(out, { force: true }),
    ]);
  }
}

// ── Google Photos ─────────────────────────────────────────────────────────────
async function photosGet(token, url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function photosPost(token, url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function getOrCreateAlbum(token) {
  // Page through existing albums looking for a title match
  let pageToken;
  do {
    const url = new URL(`${PHOTOS_BASE}/albums`);
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await photosGet(token, url.toString());
    const match = (data.albums || []).find(
      (a) => a.title?.trim().toLowerCase() === ALBUM_NAME.trim().toLowerCase(),
    );
    if (match) return match;
    pageToken = data.nextPageToken;
  } while (pageToken);

  // Not found — create it
  const { data } = await photosPost(token, `${PHOTOS_BASE}/albums`, {
    album: { title: ALBUM_NAME },
  });
  if (!data.id)
    throw new Error("Failed to create album: " + JSON.stringify(data));
  return data;
}

async function shareAlbum(token, albumId) {
  const { data } = await photosPost(
    token,
    `${PHOTOS_BASE}/albums/${albumId}:share`,
    {
      sharedAlbumOptions: { isCollaborative: false, isCommentable: false },
    },
  );
  if (data.shareInfo?.shareableUrl) return data.shareInfo.shareableUrl;

  // Already shared — fetch the album to get the URL
  const album = await photosGet(token, `${PHOTOS_BASE}/albums/${albumId}`);
  return album.shareInfo?.shareableUrl || "https://photos.google.com";
}

async function uploadToPhotos(token, buffer, mimeType, filename, albumId) {
  // Step 1: upload bytes
  const uploadRes = await fetch(`${PHOTOS_BASE}/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "X-Goog-Upload-Content-Type": mimeType,
      "X-Goog-Upload-Protocol": "raw",
    },
    body: buffer,
  });
  if (!uploadRes.ok)
    throw new Error(
      `Byte upload failed (${uploadRes.status}): ${await uploadRes.text()}`,
    );
  const uploadToken = (await uploadRes.text()).trim();
  if (!uploadToken) throw new Error("Empty upload token from Google Photos.");

  const mediaItem = {
    description: filename,
    simpleMediaItem: { fileName: filename, uploadToken },
  };

  // Step 2: create media item in album
  const { data } = await photosPost(
    token,
    `${PHOTOS_BASE}/mediaItems:batchCreate`,
    {
      albumId,
      newMediaItems: [mediaItem],
    },
  );
  const result = data.newMediaItemResults?.[0];

  // Success path
  if (result?.status?.message === "Success" || !result?.status?.message) {
    return result?.mediaItem;
  }

  console.warn(
    "[uploadToPhotos] batchCreate with album failed, trying library-only fallback",
  );

  // Fallback: add to library first, then move to album
  const { data: libData } = await photosPost(
    token,
    `${PHOTOS_BASE}/mediaItems:batchCreate`,
    {
      newMediaItems: [mediaItem],
    },
  );
  const libResult = libData.newMediaItemResults?.[0];
  if (libResult?.status?.message !== "Success") {
    throw new Error(
      `Photos API error: ${libResult?.status?.message} — ${JSON.stringify(libResult?.status)}`,
    );
  }

  const id = libResult.mediaItem?.id;
  if (id && albumId) {
    const { status, data: addData } = await photosPost(
      token,
      `${PHOTOS_BASE}/albums/${albumId}:batchAddMediaItems`,
      { mediaItemIds: [id] },
    );
    if (status !== 200)
      throw new Error(`batchAddMediaItems failed: ${JSON.stringify(addData)}`);
  }

  return libResult.mediaItem;
}

// ── Album cache ───────────────────────────────────────────────────────────────
let cache = null;

async function getAlbumInfo() {
  if (cache) return cache;
  const token = await getToken();
  const album = await getOrCreateAlbum(token);
  const shareUrl = await shareAlbum(token, album.id);
  cache = { albumId: album.id, shareUrl };
  return cache;
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: [
      "https://altonlau.github.io",
      /http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    ],
    methods: ["GET", "POST", "OPTIONS"],
  }),
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, _file, cb) => cb(null, true), // mobile browsers send unreliable mimetypes
});

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many uploads. Try again later." },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/album", async (_req, res) => {
  try {
    const { shareUrl } = await getAlbumInfo();
    res.json({ ok: true, shareUrl });
  } catch (err) {
    console.error("[GET /album]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/upload", limiter, upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ ok: false, error: "No file received." });

    const { buffer, originalname } = req.file;
    const filename = originalname || `upload_${Date.now()}`;
    const ext = filename.split(".").pop().toLowerCase();

    // Always derive mime from extension — browser-reported mimetypes are unreliable
    const mimeMap = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
      heic: "image/heic",
      heif: "image/heif",
    };
    const mime = mimeMap[ext] || "application/octet-stream";

    let uploadBuffer = buffer;
    let uploadFilename = filename;
    let uploadMime = mime;

    // Convert webm to mp4 — Google Photos doesn't accept webm
    if (uploadMime.startsWith("video/")) {
      console.log("[upload] Remuxing video → mp4:", filename);
      uploadBuffer = await toMp4(buffer, filename);
      uploadMime = "video/mp4";
      uploadFilename = filename.replace(/\.[^.]+$/, ".mp4");
    }

    const token = await getToken();
    const { albumId } = await getAlbumInfo();
    const mediaItem = await uploadToPhotos(
      token,
      uploadBuffer,
      uploadMime,
      uploadFilename,
      albumId,
    );

    res.json({ ok: true, mediaId: mediaItem?.id, filename: uploadFilename });
  } catch (err) {
    console.error("[POST /upload]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on :${PORT}`);
  getAlbumInfo()
    .then(({ shareUrl }) => console.log(`✓ Album ready: ${shareUrl}`))
    .catch((err) => console.error("⚠ Album init error:", err.message));
});
