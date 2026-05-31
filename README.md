# Abie & Alton's Wedding — Disposable Camera

A mobile-first disposable camera web app. Guests scan a QR code, take photos and videos, and everything uploads directly to a shared Google Photos album.

## Repo Structure

```
wedding/
├── index.html          ← Frontend (served by GitHub Pages)
├── style.css
├── app.js              ← Update BACKEND_URL before deploying
└── backend/
    ├── server.js       ← Node.js + Express (deploy to Railway)
    ├── package.json
    ├── .env.example    ← Copy to .env for local dev
    └── .gitignore      ← Never commit .env
```

---

## 1. Google Cloud Setup (one-time)

### Enable the Photos Library API
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or reuse your existing one)
3. **APIs & Services → Enable APIs → Google Photos Library API** → Enable

### Create a Service Account
1. **IAM & Admin → Service Accounts → Create Service Account**
2. Name it `wedding-camera`, click through to finish
3. Click the service account → **Keys → Add Key → Create new key → JSON**
4. Download the JSON file — you'll need it in the next step

> ⚠️ The Google Photos Library API **cannot** be used with service accounts directly (it requires user OAuth). Instead, you'll need to grant the service account access via **domain-wide delegation** OR use a long-lived user OAuth refresh token. See the note below.

### ⚠️ Important: Google Photos & Service Accounts

Google Photos Library API does not support service account authentication for personal libraries — it only works with user OAuth tokens. The recommended workaround is:

1. Do a **one-time OAuth flow** as yourself
2. Capture the **refresh token**
3. Store it in Railway as `GOOGLE_REFRESH_TOKEN`
4. The backend uses it to get fresh access tokens automatically

**To get your refresh token:**

```bash
# Install the Google Auth CLI tool
npx google-auth-library-nodejs

# Or use OAuth Playground:
# 1. Go to https://developers.google.com/oauthplayground
# 2. Select "Photos Library API v1" scope
# 3. Authorise and copy the refresh token
```

Add to your Railway Variables:
- `GOOGLE_CLIENT_ID` — from your OAuth 2.0 Client ID (type: Web Application)
- `GOOGLE_CLIENT_SECRET` — from the same credential
- `GOOGLE_REFRESH_TOKEN` — from the OAuth playground
- `ALBUM_NAME` — `Abie & Alton's Wedding`

---

## 2. Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Select `altonlau/wedding`, set **Root Directory** to `backend`
3. Railway auto-detects Node.js and runs `npm start`
4. In **Variables**, add:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `ALBUM_NAME=Abie & Alton's Wedding`
5. Copy the generated Railway URL (e.g. `https://wedding-production-xxxx.up.railway.app`)

---

## 3. Update Frontend

In `app.js`, set:

```js
const BACKEND_URL = 'https://wedding-production-xxxx.up.railway.app';
```

Then commit and push — GitHub Pages auto-deploys.

---

## 4. Generate QR Code

Point any QR generator at `https://altonlau.github.io/wedding/` and print it for your tables.

---

## Local Development

```bash
cd backend
cp .env.example .env
# Fill in .env with your credentials
npm install
npm run dev
```
