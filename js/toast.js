/* ─────────────────────────────────────────────────────────────────────────────
   Toast — transient status messages
───────────────────────────────────────────────────────────────────────────── */

let toastTimer = null;

export function showToast(msg, type = "", duration = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = "";
  }, duration);
}
