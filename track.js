// =====================================================
// SWIFTFREIGHT – TRACK.JS
// Full-page animated shipment tracking results
// =====================================================

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, limit }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCSG85Yy2QdOMNmrunf4xp-3WsTG_e7w2I",
  authDomain:        "swiftfreight-8c922.firebaseapp.com",
  projectId:         "swiftfreight-8c922",
  storageBucket:     "swiftfreight-8c922.firebasestorage.app",
  messagingSenderId: "606390365828",
  appId:             "1:606390365828:web:7419fc6378346137d7dcd1",
  measurementId:     "G-9W80DT31FF"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

const STEPS = ["Picked Up", "In Transit", "Customs Clearance", "Out for Delivery", "Delivered"];
const STEP_IDX = { "picked up": 0, "in transit": 1, "customs clearance": 2, "out for delivery": 3, "delivered": 4 };
const STATUS_COLOR = {
  "Delivered":         "#22c55e",
  "Out for Delivery":  "#3b82f6",
  "Customs Clearance": "#f59e0b",
  "In Transit":        "var(--accent)",
  "Picked Up":         "var(--text2)"
};
const SERVICE_ICON = { "Air Freight": "✈️", "Sea Freight": "🚢", "Road Haulage": "🚚" };

const resultEl = document.getElementById("tpResult");
const inputEl  = document.getElementById("tpInput");
const btnEl    = document.getElementById("tpSearchBtn");

let mapInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const idFromUrl = params.get("id");

  if (idFromUrl) {
    inputEl.value = idFromUrl.toUpperCase();
    runSearch(idFromUrl.toUpperCase());
  } else {
    showIdle();
  }

  btnEl.addEventListener("click", handleSearchClick);
  inputEl.addEventListener("keydown", e => { if (e.key === "Enter") handleSearchClick(); });
});

function handleSearchClick() {
  const id = inputEl.value.trim().toUpperCase();
  if (!id) { showIdle("⚠️ Please enter a tracking ID."); return; }
  history.replaceState(null, "", `track.html?id=${encodeURIComponent(id)}`);
  runSearch(id);
}

function showIdle(message) {
  resultEl.innerHTML = `
    <div class="tp-idle">
      <span>📦</span>
      ${message ? message : "Enter a tracking ID above to see full shipment details."}
    </div>`;
}

function showSkeleton() {
  resultEl.innerHTML = `
    <div class="tp-skeleton">
      <div class="tp-skel-block w40"></div>
      <div class="tp-skel-block tall"></div>
      <div class="tp-skel-block w60"></div>
      <div class="tp-skel-block"></div>
      <div class="tp-skel-block w40"></div>
    </div>`;
}

async function runSearch(id) {
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  showSkeleton();

  try {
    const snap = await getDocs(
      query(collection(db, "shipments"), where("trackingId", "==", id), limit(1))
    );

    if (snap.empty) {
      renderError(id);
      return;
    }

    renderSuccess(id, snap.docs[0].data());

  } catch (err) {
    console.error("Tracking error:", err);
    resultEl.innerHTML = `
      <div class="tp-error">
        <div class="tp-error-icon">❌</div>
        <h3>Something went wrong</h3>
        <p>${err.message}</p>
      </div>`;
  }
}

function renderError(id) {
  resultEl.innerHTML = `
    <div class="tp-error">
      <div class="tp-error-icon">🔍</div>
      <h3>Tracking ID not found</h3>
      <p>We couldn't find a shipment matching <strong style="color:var(--white)">${id}</strong>. Double-check the ID and try again.</p>
      <a href="contact.html" class="btn-primary">Contact Support</a>
    </div>`;
}

function renderSuccess(id, d) {
  const status   = d.status || "In Transit";
  const cur      = STEP_IDX[status.toLowerCase()] ?? 1;
  const progress = Math.round(((cur + 1) / STEPS.length) * 100);
  const hasCoords = typeof d.lat === "number" && typeof d.lng === "number";
  const svcIcon  = SERVICE_ICON[d.service] || "🚚";
  const photos   = d.photos || [];

  const gridItems = [
    ["🕒", "Last Update", fmtDate(d.lastUpdate)],
    ["🚀", "ETA",         fmtDate(d.eta)],
    ["⚖️", "Weight",       d.weight || "—"],
    ["👤", "Client",       d.client || "—"]
  ].map(([icon, label, val]) => `<div><strong>${icon} ${label}</strong><span>${val}</span></div>`).join("");

  const stepsHtml = STEPS.map((label, i) => {
    const cls  = i < cur ? "done" : i === cur ? "active" : "";
    const note = d.steps?.[i] ?? "";
    return `
      <div class="step ${cls}" style="animation-delay:${0.15 + i * 0.09}s">
        <span class="step-dot"></span>
        <div>
          <strong>${label}</strong>
          ${note ? `<small>${note}</small>` : ""}
        </div>
      </div>`;
  }).join("");

  const photosHtml = photos.length ? `
    <div class="tp-photos tp-reveal" style="animation-delay:0.5s">
      <p style="font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">📷 Shipment Photos</p>
      <div class="tp-photos-grid">
        ${photos.map((url, i) => `
          <button type="button" class="tp-photo-thumb" data-src="${url}" style="animation-delay:${0.55 + i * 0.08}s">
            <img src="${url}" alt="Shipment photo" onerror="this.closest('.tp-photo-thumb').style.display='none'"/>
          </button>`).join("")}
      </div>
    </div>` : "";

  resultEl.innerHTML = `
    <div class="tp-card tp-reveal">
      <div class="tp-status-band">
        <span class="tp-id">${id}</span>
        <span class="tp-status-pill" style="color:${STATUS_COLOR[status] || "var(--text2)"}">${status}</span>
      </div>

      <div class="tp-route">
        <span>🛫 <strong>${d.origin || "—"}</strong></span>
        <span class="tp-route-icon">${svcIcon}</span>
        <span>🛬 <strong>${d.destination || "—"}</strong></span>
        <span style="margin-left:auto">📍 Currently: <strong>${d.location || "—"}</strong></span>
      </div>

      <div class="tp-progress-wrap">
        <div class="tp-progress-track"><div class="tp-progress-fill" id="tpProgressFill"></div></div>
      </div>

      ${hasCoords ? `<div class="tp-map-wrap"><div class="tp-map-canvas" id="tpMap3D"></div></div>` : ""}

      <div class="tp-grid">${gridItems}</div>

      <div class="tp-timeline">
        <div class="track-steps">${stepsHtml}</div>
      </div>

      ${photosHtml}

      <div class="tp-footer-actions">
        <a href="contact.html" class="btn-outline">Need Help? Contact Support</a>
      </div>
    </div>`;

  // Wire up in-page lightbox for photo thumbnails (keeps people on the site)
  resultEl.querySelectorAll(".tp-photo-thumb").forEach(btn => {
    btn.addEventListener("click", () => openLightbox(btn.dataset.src));
  });

  // Animate the progress bar in after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fill = document.getElementById("tpProgressFill");
      if (fill) fill.style.width = progress + "%";
    });
  });

  if (hasCoords) initMap(d.lat, d.lng);
}

function initMap(lat, lng) {
  mapInstance = new maplibregl.Map({
    container: "tpMap3D",
    style: "https://demotiles.maplibre.org/style.json",
    center: [lng, lat],
    zoom: 4,
    pitch: 55,
    bearing: -12,
    attributionControl: false
  });
  mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }));

  const el = document.createElement("div");
  el.className = "truck-marker";
  el.textContent = "🚚";
  new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(mapInstance);
}

function fmtDate(val) {
  if (!val) return "—";
  const d = val?.toDate ? val.toDate() : new Date(val);
  return isNaN(d) ? String(val) : d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

// ── In-page photo lightbox (never navigates away from the site) ──
let lightboxEl = null;
function openLightbox(src) {
  if (!lightboxEl) {
    lightboxEl = document.createElement("div");
    lightboxEl.className = "tp-lightbox";
    lightboxEl.innerHTML = `
      <button type="button" class="tp-lightbox-close" aria-label="Close">✕</button>
      <img alt="Shipment photo"/>
    `;
    document.body.appendChild(lightboxEl);
    lightboxEl.addEventListener("click", e => {
      if (e.target === lightboxEl || e.target.classList.contains("tp-lightbox-close")) closeLightbox();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeLightbox(); });
  }
  lightboxEl.querySelector("img").src = src;
  lightboxEl.classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeLightbox() {
  if (!lightboxEl) return;
  lightboxEl.classList.remove("open");
  document.body.style.overflow = "";
}
