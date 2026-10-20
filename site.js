// Swift Air Cargo – loads admin-managed contact settings, WhatsApp links, reviews, live chat
import { db, DEFAULTS } from "./fb.js";
import { doc, getDoc, collection, query, where, addDoc, serverTimestamp, getDocs }
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
  const grid = document.getElementById("reviewsGrid"); if (!grid) return;
  try {
    const snap = await getDocs(query(collection(db, "reviews"), where("status", "==", "approved")));
    const items = snap.docs.map(d => d.data()).filter(r => r.visible !== false && r.text)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 9);
    document.getElementById("reviewsEmpty")?.classList.toggle("hidden", items.length > 0);
    grid.innerHTML = items.map(r => {
      const n = Math.max(1, Math.min(5, +r.stars || 5));
      const ini = esc((r.name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase());
      const av = r.avatar ? `<img src="${esc(r.avatar)}" alt="" width="48" height="48"/>` : "";
      return `<figure class="review-card reveal in"><div class="review-stars" role="img" aria-label="${n} out of 5 stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</div>
        <blockquote>${esc(r.text)}</blockquote>
        <figcaption><span class="review-avatar" data-initials="${ini}">${av}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.role || "")}</small></span></figcaption></figure>`;
    }).join("");
    if (items.length) document.querySelectorAll(".nav-reviews").forEach(el => el.classList.remove("hidden"));
  } catch (e) { console.warn("reviews", e); }
}

window.submitReview = async function (e) {
  e.preventDefault();
  const f = e.target, st = document.getElementById("rvFormStatus");
  if (f.website.value) return false; // honeypot
  const last = +localStorage.getItem("sf_rv_last") || 0;
  if (Date.now() - last < 60000) { st.textContent = "Please wait a minute before sending another review."; st.className = "form-status error"; return false; }
  const name = f.rname.value.trim(), text = f.rtext.value.trim();
  if (name.length < 2 || text.length < 10) { st.textContent = "Please enter your name and a short review."; st.className = "form-status error"; return false; }
  try {
    await addDoc(collection(db, "reviews"), {
      name: name.slice(0, 60), role: f.rrole.value.trim().slice(0, 80), text: text.slice(0, 600),
      stars: +f.rstars.value, trackingRef: f.rtrack.value.trim().toUpperCase().slice(0, 20),
      status: "pending", visible: false, createdAt: serverTimestamp()
    });
    localStorage.setItem("sf_rv_last", Date.now());
    f.reset(); st.textContent = "✅ Thank you! Your review was received and will appear once our team approves it."; st.className = "form-status success";
  } catch (err) { st.textContent = "Sorry, we couldn't send your review. Please try again later."; st.className = "form-status error"; }
  return false;
};

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
