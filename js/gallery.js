/* ─────────────────────────────────────────────────────────────────────────────
   Gallery — in-app album grid: paged fetch + infinite scroll
───────────────────────────────────────────────────────────────────────────── */

import { BACKEND_URL } from "./config.js";
import { openLightbox } from "./lightbox.js";
import { showToast } from "./toast.js";

const PAGE_SIZE = 50;
const STALE_MS = 45 * 60 * 1000; // Google Photos baseUrls expire after ~60 min
const WAKING_MS = 8000; // Render free tier cold start can take 30-60s

const items = []; // kept as one live array — cleared in place on reset
const seenIds = new Set(); // guards against duplicates across page fetches
let nextPageToken = null;
let loading = false;
let done = false;
let lastLoadedAt = 0;
let observer = null;
let wakingTimer = null;

const el = (id) => document.getElementById(id);

// ── Init & refresh ──────────────────────────────────────────────────────────
export function initGallery() {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) loadNextPage();
    },
    { root: document.querySelector(".album-body"), rootMargin: "600px 0px" },
  );
  observer.observe(el("gallery-sentinel"));
  initPullToRefresh();
}

export function refreshGallery(force = false) {
  if (!force && items.length > 0 && Date.now() - lastLoadedAt < STALE_MS) {
    return Promise.resolve();
  }
  resetGallery();
  return loadNextPage();
}

function resetGallery() {
  items.length = 0;
  seenIds.clear();
  nextPageToken = null;
  done = false;
  el("gallery-grid").innerHTML = "";
  el("gallery-empty").hidden = true;
  document.querySelector(".album-body").scrollTop = 0;
}

// ── Pull to refresh ─────────────────────────────────────────────────────────
function initPullToRefresh() {
  const body = document.querySelector(".album-body");
  const ptr = el("gallery-ptr");
  const THRESHOLD = 64; // px of (damped) pull needed to trigger a refresh
  const MAX_PULL = 90;
  let startY = 0;
  let pulling = false;
  let refreshing = false;
  let dist = 0;

  const setPull = (px) => {
    ptr.style.setProperty("--pull", px);
  };

  const onStart = (y) => {
    if (refreshing || body.scrollTop > 0) return;
    startY = y;
    pulling = true;
    dist = 0;
    ptr.classList.remove("settle");
  };

  const onMove = (y) => {
    if (!pulling || refreshing) return;
    const dy = y - startY;
    if (dy <= 0 || body.scrollTop > 0) {
      dist = 0;
      setPull(0);
      return;
    }
    dist = Math.min(dy * 0.5, MAX_PULL);
    setPull(dist);
  };

  const onRelease = async () => {
    if (!pulling) return;
    pulling = false;
    ptr.classList.add("settle");
    if (dist >= THRESHOLD && !refreshing) {
      refreshing = true;
      setPull(THRESHOLD);
      try {
        await refreshGallery(true);
      } finally {
        refreshing = false;
      }
    }
    dist = 0;
    setPull(0);
  };

  body.addEventListener(
    "touchstart",
    (e) => onStart(e.touches[0].clientY),
    { passive: true },
  );
  body.addEventListener(
    "touchmove",
    (e) => onMove(e.touches[0].clientY),
    { passive: true },
  );
  body.addEventListener("touchend", onRelease);
  body.addEventListener("touchcancel", onRelease);

  // Mouse fallback so the gesture also works when testing on desktop
  body.addEventListener("mousedown", (e) => onStart(e.clientY));
  window.addEventListener("mousemove", (e) => {
    if (pulling) onMove(e.clientY);
  });
  window.addEventListener("mouseup", onRelease);
}

// ── Paging ──────────────────────────────────────────────────────────────────
async function loadNextPage() {
  if (loading || done) return;
  loading = true;
  setStatus("Loading…");

  try {
    const url = new URL(`${BACKEND_URL}/album/media`);
    url.searchParams.set("pageSize", PAGE_SIZE);
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);

    const d = await (await fetch(url)).json();
    if (!d.ok) throw new Error(d.error || "Failed to load album");

    lastLoadedAt = Date.now();
    const fresh = d.items.filter((it) => !seenIds.has(it.id));
    fresh.forEach((it) => seenIds.add(it.id));
    appendItems(fresh);
    items.push(...fresh);
    nextPageToken = d.nextPageToken;
    done = !nextPageToken;
    el("gallery-empty").hidden = !(done && items.length === 0);
    setStatus(null);
    loading = false;
    // If the sentinel is still in view (short album, tall viewport), the
    // observer won't refire on its own — re-arm it to force a fresh check.
    rearmObserver();
  } catch (e) {
    console.error("Gallery load error:", e);
    showToast("Couldn't load album", "error", 4000);
    setStatus(null);
    loading = false;
    // No re-arm on error: retries only when the sentinel re-enters view.
  }
}

function rearmObserver() {
  const sentinel = el("gallery-sentinel");
  observer.unobserve(sentinel);
  observer.observe(sentinel);
}

// ── Rendering ───────────────────────────────────────────────────────────────
function appendItems(newItems) {
  const frag = document.createDocumentFragment();
  newItems.forEach((item, i) => frag.appendChild(buildCell(item, items.length + i)));
  el("gallery-grid").appendChild(frag);
}

function buildCell(item, index) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "gallery-cell";

  const img = document.createElement("img");
  img.loading = "lazy";
  img.decoding = "async";
  img.draggable = false; // native image drag would swallow the mouse pull gesture
  img.alt = item.isVideo ? "Video" : "Photo";
  img.src = `${item.baseUrl}=w400-h400-c`;
  btn.appendChild(img);

  if (item.isVideo) {
    const badge = document.createElement("div");
    badge.className = "gallery-play-badge";
    btn.appendChild(badge);
  }

  btn.addEventListener("click", () => openLightbox(items, index));

  return btn;
}

function setStatus(text) {
  clearTimeout(wakingTimer);
  const box = el("gallery-status");
  if (text == null) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  el("gallery-status-text").textContent = text;
  if (items.length === 0) {
    wakingTimer = setTimeout(() => {
      el("gallery-status-text").textContent = "Waking up the album server…";
    }, WAKING_MS);
  }
}
