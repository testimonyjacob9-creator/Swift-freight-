// Swift Air Cargo – loads admin-managed contact settings, WhatsApp links, reviews, live chat
import { db, DEFAULTS } from "./fb.js";
import { doc, getDoc, collection, query, orderBy, limit, getDocs }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const digits = v => String(v || "").replace(/[^\d]/g, "");
let S = Object.assign({}, DEFAULTS);
try { Object.assign(S, JSON.parse(localStorage.getItem("sf_settings") || "{}")); } catch (e) {}

export const waLink = (msg, extra) =>
  `https://wa.me/${digits(S.whatsapp || S.phone)}?text=${encodeURIComponent((msg || S.waMessage) + (extra ? "\n" + extra : ""))}`;
window.sfWaLink = waLink;

function render() {
  document.querySelectorAll('[data-site="email"]').forEach(el => { el.textContent = S.email; if (el.tagName === "A") el.href = "mailto:" + S.email; });
  document.querySelectorAll('[data-site="phone"]').forEach(el => { el.textContent = S.phone; if (el.tagName === "A") el.href = "tel:" + S.phone.replace(/[^\d+]/g, ""); });
  document.querySelectorAll('[data-site="hours"]').forEach(el => { el.textContent = S.hours; });
  document.querySelectorAll('[data-site="offices"]').forEach(el => {
    el.innerHTML = (S.offices || []).map(o => `<p>📍 ${o.name ? `<strong>${esc(o.name)}</strong> — ` : ""}${esc(o.address)}</p>`).join("");
  });
  document.querySelectorAll("[data-wa]").forEach(a => {
    a.href = waLink(a.dataset.waMsg); a.target = "_blank"; a.rel = "noopener";
  });
}

async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    if (snap.exists()) { Object.assign(S, snap.data()); localStorage.setItem("sf_settings", JSON.stringify(snap.data())); }
  } catch (e) { console.warn("settings", e); }
  render();
}

async function loadReviews() {
  const sec = document.getElementById("reviews"); if (!sec) return;
  try {
    const snap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc"), limit(9)));
    const items = snap.docs.map(d => d.data()).filter(r => r.visible !== false && r.text);
    if (!items.length) return;
    document.getElementById("reviewsGrid").innerHTML = items.map(r => {
      const n = Math.max(1, Math.min(5, +r.stars || 5));
      const ini = esc((r.name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase());
      return `<figure class="review-card reveal in"><div class="review-stars" role="img" aria-label="${n} out of 5 stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</div>
        <blockquote>${esc(r.text)}</blockquote>
        <figcaption><span class="review-avatar" data-initials="${ini}"></span><span><strong>${esc(r.name)}</strong><small>${esc(r.role || "")}</small></span></figcaption></figure>`;
    }).join("");
    sec.classList.remove("hidden");
    document.querySelectorAll(".nav-reviews").forEach(el => el.classList.remove("hidden"));
  } catch (e) { console.warn("reviews", e); }
}

render();
document.addEventListener("DOMContentLoaded", async () => {
  render();
  await loadSettings();
  loadReviews();
  if (S.chatEnabled !== false) {
    const m = await import("./chat.js");
    m.initChat(S, waLink);
  }
});
