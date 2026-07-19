/* ─────────────────────────────────────────────────────────────────────────────
   Screens — screen switching + event branding
───────────────────────────────────────────────────────────────────────────── */

import { EVENT_NAME } from "./config.js";

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.toggle("active", s.id === id);
  });
}

export function applyEventName() {
  document.getElementById("cam-title").textContent = EVENT_NAME;
  document.getElementById("album-bar-title").textContent = EVENT_NAME;
}
