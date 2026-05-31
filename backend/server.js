import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { promises as fs } from "fs";
import { OAuth2Client } from "google-auth-library";
import multer from "multer";
import fetch from "node-fetch";
import os from "os";
import path from "path";

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

// ── Google OAuth2 client (uses a long-lived refresh token) ───────────────────
// The Photos Library API requires user OAuth — service accounts are not supported.
// Get your refresh token via https://developers.google.com/oauthplayground
// using scope: https://www.googleapis.com/auth/photoslibrary
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

async function getAccessToken() {
  const { token } = await oauth2Client.getAccessToken();
  if (!token)
    throw new Error("Could not obtain Google access token. Check credentials.");
  return token;
}

// ── Google Photos helpers ─────────────────────────────────────────────────────
const PHOTOS_BASE = "https://photoslibrary.googleapis.com/v1";

async function convertVideoToMp4(buffer, filename) {
  const inputExt = path.extname(filename) || ".webm";
  const inputPath = path.join(
    os.tmpdir(),
    `upload-input-${Date.now()}-${Math.random().toString(36).slice(2)}${inputExt}`,
  );
  const outputPath = path.join(
    os.tmpdir(),
    `upload-output-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
  );
  await fs.writeFile(inputPath, buffer);

  const runFfmpeg = (options) =>
    new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(options)
        .on("end", resolve)
        .on("error", (err) => reject(err))
        .save(outputPath);
    });

  // Primary options: reasonable quality
  const primaryOpts = [
    "-c:v libx264",
    "-preset fast",
    "-crf 23",
    "-c:a aac",
    "-b:a 128k",
    "-movflags +faststart",
  ];

  // Fallback options: lower quality / faster — reduces memory/CPU
  const fallbackOpts = [
    "-c:v libx264",
    "-preset veryfast",
    "-crf 28",
    "-c:a aac",
    "-b:a 96k",
    "-movflags +faststart",
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
  ];

  try {
    await runFfmpeg(primaryOpts);
  } catch (err) {
    console.error("[convertVideoToMp4] ffmpeg primary failed", {
      message: err.message,
      signal: err.signal,
      killed: err.killed,
    });
    // If process was killed (likely OOM), retry with lighter settings once
    if (
      err.killed ||
      err.signal === "SIGKILL" ||
      /killed/i.test(err.message || "")
    ) {
      try {
        console.warn(
          "[convertVideoToMp4] Retrying ffmpeg with lower quality settings due to SIGKILL/kill.",
        );
        await runFfmpeg(fallbackOpts);
      } catch (err2) {
        console.error("[convertVideoToMp4] ffmpeg fallback also failed", {
          message: err2.message,
          signal: err2.signal,
          killed: err2.killed,
        });
        await Promise.all([
          fs.rm(inputPath, { force: true }),
          fs.rm(outputPath, { force: true }),
        ]);
        throw err2;
      }
    } else {
      await Promise.all([
        fs.rm(inputPath, { force: true }),
        fs.rm(outputPath, { force: true }),
      ]);
      throw err;
    }
  }

  const outputBuffer = await fs.readFile(outputPath);
  await Promise.all([
    fs.rm(inputPath, { force: true }),
    fs.rm(outputPath, { force: true }),
  ]);
  return outputBuffer;
}

async function getOrCreateAlbum(token, albumName) {
  const normalizedTitle = albumName.trim().toLowerCase();
  let nextPageToken = undefined;

  do {
    const url = new URL(`${PHOTOS_BASE}/albums`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("excludeNonAppCreatedData", "false");
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);

    const listRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json();
    if (!listRes.ok) {
      throw new Error(
        `Failed to list albums: ${listRes.status} ${JSON.stringify(listData)}`,
      );
    }

    const existing = (listData.albums || []).find(
      (a) => a.title?.trim().toLowerCase() === normalizedTitle,
    );
    if (existing) return existing;

    nextPageToken = listData.nextPageToken;
  } while (nextPageToken);

  // Create if not found
  const createRes = await fetch(`${PHOTOS_BASE}/albums`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ album: { title: albumName } }),
  });
  const album = await createRes.json();
  if (!album.id)
    throw new Error("Failed to create album: " + JSON.stringify(album));
  return album;
}

async function ensureAlbumShared(token, albumId) {
  const res = await fetch(`${PHOTOS_BASE}/albums/${albumId}:share`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sharedAlbumOptions: { isCollaborative: false, isCommentable: false },
    }),
  });
  const data = await res.json();
  // Already shared: shareInfo is on the album; freshly shared: in the response
  if (data.shareInfo?.shareableUrl) return data.shareInfo.shareableUrl;

  // Fetch album to get shareInfo
  const albumRes = await fetch(`${PHOTOS_BASE}/albums/${albumId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const albumData = await albumRes.json();
  return albumData.shareInfo?.shareableUrl || "https://photos.google.com";
}

async function uploadMediaItem(token, buffer, mimeType, filename, albumId) {
  // Step 1: Upload raw bytes → receive an upload token
  const uploadRes = await fetch(
    "https://photoslibrary.googleapis.com/v1/uploads",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "X-Goog-Upload-Content-Type": mimeType,
        "X-Goog-Upload-Protocol": "raw",
      },
      body: buffer,
    },
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Byte upload failed (${uploadRes.status}): ${err}`);
  }

  const uploadToken = (await uploadRes.text()).trim();
  if (!uploadToken)
    throw new Error("Empty upload token returned from Google Photos.");

  async function createItem(requestBody) {
    const res = await fetch(`${PHOTOS_BASE}/mediaItems:batchCreate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();
    const itemResult = data.newMediaItemResults?.[0];
    return { res, data, itemResult };
  }

  const defaultBody = {
    albumId,
    newMediaItems: [
      {
        description: filename,
        simpleMediaItem: { fileName: filename, uploadToken },
      },
    ],
  };

  let createResult = await createItem(defaultBody);
  let result = createResult.itemResult;

  if (result?.status?.message && result.status.message !== "Success") {
    console.error("[Photos create] Primary batchCreate failed:", {
      status: createResult.res.status,
      filename,
      mimeType,
      albumId,
      data: createResult.data,
    });

    // Fallback: create in library first, then add to album separately.
    const libraryBody = {
      newMediaItems: [
        {
          description: filename,
          simpleMediaItem: { fileName: filename, uploadToken },
        },
      ],
    };

    const fallbackResult = await createItem(libraryBody);
    const fallbackItem = fallbackResult.itemResult;

    if (!fallbackItem || fallbackItem?.status?.message !== "Success") {
      const fallbackStatusJson = JSON.stringify(
        fallbackResult.itemResult?.status,
      );
      throw new Error(
        `Photos API error: ${fallbackResult.itemResult?.status?.message || "Unknown"} — ${fallbackStatusJson}`,
      );
    }

    const mediaItem = fallbackItem.mediaItem;
    if (!albumId || !mediaItem?.id) return mediaItem;

    const addRes = await fetch(
      `${PHOTOS_BASE}/albums/${albumId}:batchAddMediaItems`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mediaItemIds: [mediaItem.id] }),
      },
    );

    const addData = await addRes.json();
    if (!addRes.ok || addData.error) {
      throw new Error(
        `Photos API batchAddMediaItems failed: ${JSON.stringify(addData)}`,
      );
    }

    return mediaItem;
  }

  if (!result)
    throw new Error(
      "No result from batchCreate: " + JSON.stringify(createResult.data),
    );

  return result.mediaItem;
}

// ── Album cache (avoid re-fetching on every request) ─────────────────────────
let cachedAlbumId = null;
let cachedShareUrl = null;

async function getAlbumInfo() {
  if (cachedAlbumId)
    return { albumId: cachedAlbumId, shareUrl: cachedShareUrl };

  const token = await getAccessToken();
  const albumName = process.env.ALBUM_NAME || "Abie & Alton's Wedding";
  const album = await getOrCreateAlbum(token, albumName);
  const shareUrl = await ensureAlbumShared(token, album.id);

  cachedAlbumId = album.id;
  cachedShareUrl = shareUrl;
  return { albumId: album.id, shareUrl };
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

// Rate limit: 30 uploads per IP per hour
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many uploads. Try again later." },
});

// Accept files up to 100MB, photos and videos only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept all files — mimetype from mobile browsers is unreliable
    cb(null, true);
  },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

// Return the shareable Google Photos album URL
app.get("/album", async (_req, res) => {
  try {
    const { shareUrl } = await getAlbumInfo();
    res.json({ ok: true, shareUrl });
  } catch (err) {
    console.error("[GET /album]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Upload a photo or video
app.post("/upload", uploadLimiter, upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ ok: false, error: "No file received." });

    const { buffer, originalname, mimetype: fileMimeType } = req.file;
    const filename = originalname || `upload_${Date.now()}`;
    const ext = filename.split(".").pop().toLowerCase();
    const mimeMap = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      heic: "image/heic",
      heif: "image/heif",
    };

    // Prefer the cleaned browser MIME when it's specific; otherwise use extension map.
    const cleaned = (fileMimeType || "").split(";")[0].trim();
    const extType = mimeMap[ext];
    const mimeUsed =
      cleaned &&
      cleaned !== "text/plain" &&
      cleaned !== "application/octet-stream"
        ? cleaned
        : extType || "application/octet-stream";

    if (mimeUsed !== fileMimeType)
      console.warn("[POST /upload] MIME fallback", {
        filename,
        from: fileMimeType,
        using: mimeUsed,
      });

    let uploadBuffer = buffer;
    let uploadFilename = filename;
    let uploadMime = mimeUsed;
    const needsConversion =
      ext === "webm" ||
      uploadMime === "video/webm" ||
      uploadMime === "video/quicktime";
    if (needsConversion) {
      console.log("[POST /upload] Converting video to MP4", {
        filename,
        from: uploadMime,
      });
      uploadBuffer = await convertVideoToMp4(buffer, filename);
      uploadMime = "video/mp4";
      uploadFilename = filename.replace(/\.[^.]+$/, ".mp4");
    }

    const token = await getAccessToken();
    const { albumId } = await getAlbumInfo();
    const mediaItem = await uploadMediaItem(
      token,
      uploadBuffer,
      uploadMime,
      uploadFilename,
      albumId,
    );

    res.json({ ok: true, mediaId: mediaItem?.id, filename: uploadFilename });
  } catch (err) {
    console.error("[POST /upload]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Wedding camera backend running on :${PORT}`);
  getAlbumInfo()
    .then(({ shareUrl }) => console.log(`✓ Album ready — ${shareUrl}`))
    .catch((err) =>
      console.error(
        "⚠ Album init failed (will retry on first request):",
        err.message,
      ),
    );
});
