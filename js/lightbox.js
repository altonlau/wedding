/* ─────────────────────────────────────────────────────────────────────────────
   Lightbox — fullscreen photo/video viewer with prev/next navigation
───────────────────────────────────────────────────────────────────────────── */

let currentItems = [];
let currentIndex = 0;
let touchStartX = null;

const el = (id) => document.getElementById(id);

export function initLightbox() {
  el("lightbox-close").addEventListener("click", closeLightbox);
  el("lightbox-prev").addEventListener("click", () => show(currentIndex - 1));
  el("lightbox-next").addEventListener("click", () => show(currentIndex + 1));

  document.addEventListener("keydown", (e) => {
    if (el("lightbox").hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") show(currentIndex - 1);
    else if (e.key === "ArrowRight") show(currentIndex + 1);
  });

  const stage = el("lightbox-stage");
  stage.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.touches[0].clientX;
    },
    { passive: true },
  );
  stage.addEventListener(
    "touchend",
    (e) => {
      if (touchStartX == null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) < 50) return;
      show(currentIndex + (dx < 0 ? 1 : -1));
    },
    { passive: true },
  );
}

export function openLightbox(items, index) {
  currentItems = items;
  el("lightbox").hidden = false;
  show(index);
}

export function closeLightbox() {
  stopVideo();
  el("lightbox").hidden = true;
}

function show(index) {
  if (index < 0 || index >= currentItems.length) return;
  currentIndex = index;

  stopVideo();
  const item = currentItems[index];
  const img = el("lightbox-img");
  const vid = el("lightbox-vid");

  if (item.isVideo) {
    vid.poster = `${item.baseUrl}=w1600-h1600`;
    vid.src = `${item.baseUrl}=dv`;
    vid.hidden = false;
    img.hidden = true;
  } else {
    img.src = `${item.baseUrl}=w1600-h1600`;
    img.hidden = false;
    vid.hidden = true;
  }

  el("lightbox-prev").disabled = index === 0;
  el("lightbox-next").disabled = index === currentItems.length - 1;
}

// Releases the stream so rapid navigation doesn't stack downloads
function stopVideo() {
  const vid = el("lightbox-vid");
  vid.pause();
  vid.removeAttribute("src");
  vid.removeAttribute("poster");
  vid.load();
}
