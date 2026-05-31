import 'dotenv/config';
import express    from 'express';
import cors       from 'cors';
import multer     from 'multer';
import rateLimit  from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import fetch      from 'node-fetch';

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Google OAuth2 client (uses a long-lived refresh token) ───────────────────
// The Photos Library API requires user OAuth — service accounts are not supported.
// Get your refresh token via https://developers.google.com/oauthplayground
// using scope: https://www.googleapis.com/auth/photoslibrary
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

async function getAccessToken() {
  const { token } = await oauth2Client.getAccessToken();
  if (!token) throw new Error('Could not obtain Google access token. Check credentials.');
  return token;
}

// ── Google Photos helpers ─────────────────────────────────────────────────────
const PHOTOS_BASE = 'https://photoslibrary.googleapis.com/v1';

async function getOrCreateAlbum(token, albumName) {
  // Fetch existing albums (first page, up to 50)
  const listRes  = await fetch(`${PHOTOS_BASE}/albums?pageSize=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = await listRes.json();
  const existing = (listData.albums || []).find(a => a.title === albumName);
  if (existing) return existing;

  // Create if not found
  const createRes = await fetch(`${PHOTOS_BASE}/albums`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ album: { title: albumName } }),
  });
  const album = await createRes.json();
  if (!album.id) throw new Error('Failed to create album: ' + JSON.stringify(album));
  return album;
}

async function ensureAlbumShared(token, albumId) {
  const res  = await fetch(`${PHOTOS_BASE}/albums/${albumId}:share`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      sharedAlbumOptions: { isCollaborative: false, isCommentable: false },
    }),
  });
  const data = await res.json();
  // Already shared: shareInfo is on the album; freshly shared: in the response
  if (data.shareInfo?.shareableUrl) return data.shareInfo.shareableUrl;

  // Fetch album to get shareInfo
  const albumRes  = await fetch(`${PHOTOS_BASE}/albums/${albumId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const albumData = await albumRes.json();
  return albumData.shareInfo?.shareableUrl || 'https://photos.google.com';
}

async function uploadMediaItem(token, buffer, mimeType, filename, albumId) {
  // Step 1: Upload raw bytes → receive an upload token
  const uploadRes = await fetch('https://photoslibrary.googleapis.com/v1/uploads', {
    method:  'POST',
    headers: {
      Authorization:                `Bearer ${token}`,
      'Content-Type':               'application/octet-stream',
      'X-Goog-Upload-Content-Type': mimeType,
      'X-Goog-Upload-Protocol':     'raw',
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Byte upload failed (${uploadRes.status}): ${err}`);
  }

  const uploadToken = (await uploadRes.text()).trim();

  // Step 2: Create the media item in the album
  const createRes  = await fetch(`${PHOTOS_BASE}/mediaItems:batchCreate`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      albumId,
      newMediaItems: [{
        description: filename,
        simpleMediaItem: { fileName: filename, uploadToken },
      }],
    }),
  });

  const createData = await createRes.json();
  const result     = createData.newMediaItemResults?.[0];

  if (!result) throw new Error('No result from batchCreate: ' + JSON.stringify(createData));
  if (result.status?.message && result.status.message !== 'Success') {
    throw new Error(`Photos API error: ${result.status.message}`);
  }

  return result.mediaItem;
}

// ── Album cache (avoid re-fetching on every request) ─────────────────────────
let cachedAlbumId  = null;
let cachedShareUrl = null;

async function getAlbumInfo() {
  if (cachedAlbumId) return { albumId: cachedAlbumId, shareUrl: cachedShareUrl };

  const token     = await getAccessToken();
  const albumName = process.env.ALBUM_NAME || "Abie & Alton's Wedding";
  const album     = await getOrCreateAlbum(token, albumName);
  const shareUrl  = await ensureAlbumShared(token, album.id);

  cachedAlbumId  = album.id;
  cachedShareUrl = shareUrl;
  return { albumId: album.id, shareUrl };
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://altonlau.github.io',
    /http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
}));

// Rate limit: 30 uploads per IP per hour
const uploadLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             30,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { ok: false, error: 'Too many uploads. Try again later.' },
});

// Accept files up to 100MB, photos and videos only
const upload = multer({
  storage:    multer.memoryStorage(),
  limits:     { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'video/mp4', 'video/webm', 'video/quicktime'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// Return the shareable Google Photos album URL
app.get('/album', async (_req, res) => {
  try {
    const { shareUrl } = await getAlbumInfo();
    res.json({ ok: true, shareUrl });
  } catch (err) {
    console.error('[GET /album]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Upload a photo or video
app.post('/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file received.' });

    const { buffer, mimetype, originalname } = req.file;
    const filename   = originalname || `upload_${Date.now()}`;

    const token           = await getAccessToken();
    const { albumId }     = await getAlbumInfo();
    const mediaItem       = await uploadMediaItem(token, buffer, mimetype, filename, albumId);

    res.json({ ok: true, mediaId: mediaItem?.id, filename });
  } catch (err) {
    console.error('[POST /upload]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Wedding camera backend running on :${PORT}`);
  getAlbumInfo()
    .then(({ shareUrl }) => console.log(`✓ Album ready — ${shareUrl}`))
    .catch(err => console.error('⚠ Album init failed (will retry on first request):', err.message));
});
