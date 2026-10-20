// =====================================================
// SWIFT AIR CARGO – ADMIN.JS
// Firebase Auth + Firestore admin dashboard
// =====================================================

import { initializeApp, getApps }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection, query, orderBy, getDocs, limit, onSnapshot,
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, serverTimestamp, Timestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ─── Firebase init ────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCSG85Yy2QdOMNmrunf4xp-3WsTG_e7w2I",
  authDomain:        "swiftfreight-8c922.firebaseapp.com",
  projectId:         "swiftfreight-8c922",
  storageBucket:     "swiftfreight-8c922.firebasestorage.app",
  messagingSenderId: "606390365828",
  appId:             "1:606390365828:web:7419fc6378346137d7dcd1",
  measurementId:     "G-9W80DT31FF"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const storage = getStorage(app);

// Escape untrusted text before it goes into innerHTML
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// ─── State ────────────────────────────────────────────
let contacts  = [];   // raw Firestore docs: { id, ...data }
let shipments = [];
let activeTab = "overview";
let currentShipmentId = null;
let smMap = null;
let smMarker = null;
let smCoords = null; // { lat, lng } currently set via drag — shipment detail modal
let addMap = null;
let addMarker = null;
let addMapCoords = null; // { lat, lng } currently set via drag — Add Shipment form
let addMapInited = false;

// ─── Auth ─────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    showDashboard();
  } else {
    showLogin();
  }
});

window.doLogin = async function () {
  const email = document.getElementById("loginEmail").value.trim();
  const pass  = document.getElementById("loginPass").value;
  const err   = document.getElementById("loginError");

  try {
    err.classList.add("hidden");
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    err.textContent = "⚠️ " + friendlyAuthError(e.code);
    err.classList.remove("hidden");
  }
};

window.doLogout = () => signOut(auth);

function friendlyAuthError(code) {
  const map = {
    "auth/invalid-credential":  "Invalid email or password.",
    "auth/user-not-found":       "No account found with that email.",
    "auth/wrong-password":       "Incorrect password.",
    "auth/too-many-requests":    "Too many attempts. Please wait and try again.",
    "auth/network-request-failed": "Network error. Check your connection."
  };
  return map[code] || "Sign-in failed. Please try again.";
}

function showLogin() {
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("dashboard").classList.add("hidden");
}

async function showDashboard() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  await loadAll();
  startRealtime();
}

// ─── Load data ────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadContacts(), loadShipments()]);
}

async function loadContacts() {
  try {
    const snap = await getDocs(
      query(collection(db, "contacts"), orderBy("timestamp", "desc"))
    );
    contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderContacts();
    renderContactStats();
  } catch (e) {
    document.getElementById("contactList").innerHTML =
      `<div class="error-msg">❌ Failed to load: ${e.message}</div>`;
  }
}

async function loadShipments() {
  try {
    const snap = await getDocs(
      query(collection(db, "shipments"), orderBy("createdAt", "desc"))
    );
    shipments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderShipments();
  } catch (e) {
    document.getElementById("shipmentList").innerHTML =
      `<div class="error-msg">❌ Failed to load: ${e.message}</div>`;
  }
}

// ─── Tabs ─────────────────────────────────────────────
window.switchTab = function (tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  document.getElementById(`tab-${tab}`).classList.remove("hidden");
  document.querySelectorAll(".sidebar-link").forEach(el => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });

  if (tab === "overview") renderOverview();
  if (tab === "chats") renderChatList();
  if (tab === "settings") fillSettingsForm();
  if (tab === "reviews") loadReviewsAdmin();
  if (tab === "receipts") initReceiptsTab();
  if (tab === "add") {
    if (!addMapInited) {
      initAddMap();
      addMapInited = true;
    } else {
      // container was hidden since last init — MapLibre needs a resize nudge
      setTimeout(() => addMap && addMap.resize(), 50);
    }
  }
};

// ─── Render Contacts ─────────────────────────────────
window.renderContacts = function () {
  const q    = (document.getElementById("contactSearch")?.value || "").toLowerCase();
  const list = document.getElementById("contactList");

  const filtered = contacts.filter(c =>
    !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-msg">No contact submissions yet.</div>`;
    return;
  }

  list.innerHTML = filtered.map(c => `
    <div class="submission-card ${c.read ? "" : "unread"}" onclick="openContact('${esc(c.id)}')">
      <div class="sub-header">
        <span class="sub-name">
          ${esc(c.name)}
          ${!c.read ? '<span class="badge-new">NEW</span>' : ""}
        </span>
        <span class="sub-date">${fmtDate(c.timestamp)}</span>
      </div>
      <div class="sub-meta">
        <span>📧 ${esc(c.email)}</span>
        ${c.phone ? `<span>📞 ${esc(c.phone)}</span>` : ""}
        ${c.service ? `<span>📦 ${esc(c.service)}</span>` : ""}
      </div>
      <div class="sub-preview">${esc((c.message || "").slice(0, 140))}${c.message?.length > 140 ? "…" : ""}</div>
    </div>
  `).join("");
};

function renderContactStats() {
  const total = contacts.length;
  const unread = contacts.filter(c => !c.read).length;
  document.getElementById("contactStats").innerHTML = `
    <div class="stat-box"><span>${total}</span><label>Total</label></div>
    <div class="stat-box new"><span>${unread}</span><label>Unread</label></div>
    <div class="stat-box"><span>${total - unread}</span><label>Read</label></div>
  `;
}

// ─── Open Contact ─────────────────────────────────────
window.openContact = async function (id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;

  document.getElementById("mName").textContent = c.name;
  document.getElementById("mGrid").innerHTML = `
    <div><strong>Email</strong>${esc(c.email)}</div>
    <div><strong>Phone</strong>${c.phone || "—"}</div>
    <div><strong>Service</strong>${c.service || "—"}</div>
    <div><strong>Submitted</strong>${fmtDate(c.timestamp)}</div>
    ${c.subject ? `<div style="grid-column:1/-1"><strong>Subject</strong>${esc(c.subject)}</div>` : ""}
  `;
  document.getElementById("mMessage").innerHTML =
    `<strong>Message</strong><p>${esc(c.message || "").replace(/\n/g, "<br/>")}</p>`;

  document.getElementById("contactModal").classList.remove("hidden");

  // Mark as read
  if (!c.read) {
    try {
      await updateDoc(doc(db, "contacts", id), { read: true });
      c.read = true;
      renderContacts();
      renderContactStats();
    } catch (e) { console.warn("mark-read failed", e); }
  }
};

window.closeContactModal = () =>
  document.getElementById("contactModal").classList.add("hidden");

window.closeModal = function (e) {
  if (e.target.classList.contains("modal")) {
    document.getElementById("contactModal").classList.add("hidden");
    document.getElementById("shipModal").classList.add("hidden");
    document.getElementById("receiptModal").classList.add("hidden");
    if (smMap) { smMap.remove(); smMap = null; smMarker = null; }
  }
};

// ─── Mark All Read ────────────────────────────────────
window.markAllRead = async function () {
  const unread = contacts.filter(c => !c.read);
  await Promise.all(
    unread.map(c => updateDoc(doc(db, "contacts", c.id), { read: true }))
  );
  unread.forEach(c => (c.read = true));
  renderContacts();
  renderContactStats();
};

// ─── Render Shipments ─────────────────────────────────
const STATUSES = ["Picked Up", "In Transit", "Customs Clearance", "Out for Delivery", "Delivered"];
const STATUS_COLORS = {
  "Delivered": "#22c55e", "Out for Delivery": "#3b82f6", "Customs Clearance": "#f59e0b",
  "In Transit": "#d97706", "Picked Up": "#8b93a7"
};
let shipFilter = "All";
window.setShipFilter = f => { shipFilter = f; renderShipments(); };

window.renderShipments = function () {
  const q    = (document.getElementById("shipSearch")?.value || "").toLowerCase();
  const list = document.getElementById("shipmentList");
  const chips = document.getElementById("shipFilters");
  if (chips) {
    chips.innerHTML = ["All", ...STATUSES].map(f => {
      const n = f === "All" ? shipments.length : shipments.filter(s => s.status === f).length;
      return `<button class="chip ${shipFilter === f ? "active" : ""}" onclick="setShipFilter('${f}')">${f} <b>${n}</b></button>`;
    }).join("");
  }

  const filtered = shipments.filter(s =>
    (shipFilter === "All" || s.status === shipFilter) &&
    (!q || [s.trackingId, s.client, s.status, s.origin, s.destination, s.receiverName, s.senderName, s.orderId]
      .some(v => String(v || "").toLowerCase().includes(q)))
  );

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-msg">No shipments match. Add one from the sidebar.</div>`;
    return;
  }

  list.innerHTML = filtered.map(s => `
    <div class="submission-card" onclick="openShipment('${esc(s.id)}')">
      <div class="sub-header">
        <span class="sub-name" style="font-family:var(--font-display);letter-spacing:1px;font-size:1.05rem">
          ${esc(s.trackingId || "—")}
        </span>
        <span class="pill" style="color:${STATUS_COLORS[s.status] || "var(--text2)"};border-color:${STATUS_COLORS[s.status] || "var(--border2)"}">
          ${esc(s.status || "—")}
        </span>
      </div>
      <div class="sub-meta">
        ${(s.receiverName || s.client) ? `<span>👤 ${esc(s.receiverName || s.client)}</span>` : ""}
        ${s.origin      ? `<span>🛫 ${esc(s.origin)}</span>`      : ""}
        ${s.destination ? `<span>🛬 ${esc(s.destination)}</span>` : ""}
        ${s.service     ? `<span>🚚 ${esc(s.service)}</span>`     : ""}
        ${s.payStatus   ? `<span class="paytag ${esc(String(s.payStatus).toLowerCase())}">💳 ${esc(s.payStatus)}</span>` : ""}
      </div>
      <div class="sub-preview">
        📍 ${esc(s.location || "—")} &nbsp;|&nbsp; ETA: ${fmtDate(s.eta)} &nbsp;|&nbsp; Updated: ${fmtDate(s.lastUpdate)}
      </div>
    </div>
  `).join("");
  renderOverview();
};

window.exportShipmentsCsv = function () {
  const cols = ["trackingId","orderId","status","location","client","senderName","senderPhone","senderAddress","originOffice","receiverName","receiverPhone","receiverAddress","destOffice","origin","destination","service","transport","shipType","product","qty","weight","charge","customsCharge","payMode","payStatus"];
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [cols.join(",")].concat(shipments.map(s => cols.map(c => q(s[c])).join(",")));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  a.download = `shipments-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
};

window.deleteShipment = async function () {
  const s = shipments.find(x => x.id === currentShipmentId); if (!s) return;
  if (!confirm(`Delete shipment ${s.trackingId}? This cannot be undone.`)) return;
  await deleteDoc(doc(db, "shipments", s.id));
  shipments = shipments.filter(x => x.id !== s.id);
  closeShipModal(); renderShipments();
};

// ─── Extra order fields (sender / consignee / payment) ────
const PAY_MODES = ["Bank Transfer", "Cash", "Card", "PayPal", "Crypto", "Mobile Money", "Other"];
const EXTRA_FIELDS = [
  { k: "orderId", l: "Order ID", p: "1377" },
  { k: "transport", l: "Mode of transport", t: "select", o: ["Air freight", "Sea freight", "Road haulage", "Rail freight"] },
  { k: "senderName", l: "Sender name" }, { k: "senderPhone", l: "Sender phone", p: "+44 7826 613094" },
  { k: "senderAddress", l: "Sender address", full: true }, { k: "originOffice", l: "Origin office", p: "United Kingdom" },
  { k: "receiverName", l: "Consignee (receiver) name" }, { k: "receiverPhone", l: "Consignee phone", p: "+90 531 835 32 19" },
  { k: "receiverAddress", l: "Consignee address", full: true }, { k: "destOffice", l: "Destination office", p: "Turkey" },
  { k: "shipType", l: "Type of shipment", p: "Parcel" }, { k: "product", l: "Product" },
  { k: "qty", l: "Qty", p: "1" }, { k: "payMode", l: "Payment mode", t: "select", o: PAY_MODES },
  { k: "payStatus", l: "Payment status", t: "select", o: ["Pending", "Paid", "Unpaid", "Partially paid"] },
  { k: "customsCharge", l: "Customs clearance charges", p: "USD 0.00" }
];
function renderExtra(boxId, prefix, data = {}) {
  document.getElementById(boxId).innerHTML = EXTRA_FIELDS.map(f => {
    const id = prefix + f.k, v = data[f.k] ?? "";
    const input = f.t === "select"
      ? `<select id="${id}">${f.o.map(o => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`
      : `<input type="text" id="${id}" value="${escAttr(v)}" placeholder="${escAttr(f.p || "")}"/>`;
    return `<div class="form-group ${f.full ? "full" : ""}"><label>${f.l}</label>${input}</div>`;
  }).join("");
}
function readExtra(prefix) {
  const o = {};
  EXTRA_FIELDS.forEach(f => { const v = document.getElementById(prefix + f.k)?.value.trim(); o[f.k] = v || null; });
  return o;
}
const newOrderId = () => String(Math.floor(100000 + Math.random() * 900000));
document.addEventListener("DOMContentLoaded", () => {
  renderExtra("addExtra", "x_", { orderId: newOrderId(), shipType: "Parcel", qty: "1" });
});

// ─── Open Shipment ────────────────────────────────────
window.openShipment = function (id) {
  const s = shipments.find(x => x.id === id);
  if (!s) return;

  currentShipmentId = id;

  document.getElementById("smTitle").textContent = s.trackingId || "Shipment";
  document.getElementById("smGrid").innerHTML = `
    <div class="form-group"><label>Client</label><input type="text" id="smClient" value="${escAttr(s.client)}"/></div>
    <div class="form-group"><label>Service Type</label>
      <select id="smServiceSelect">
        <option value="Air Freight"   ${s.service==="Air Freight"   ? "selected":""}>✈️ Air Freight</option>
        <option value="Sea Freight"   ${s.service==="Sea Freight"   ? "selected":""}>🚢 Sea Freight</option>
        <option value="Road Haulage"  ${s.service==="Road Haulage"  ? "selected":""}>🚚 Road Haulage</option>
        <option value="Warehousing"   ${s.service==="Warehousing"   ? "selected":""}>🏭 Warehousing</option>
        <option value="Cold Chain"    ${s.service==="Cold Chain"    ? "selected":""}>🧊 Cold Chain</option>
      </select>
    </div>
    <div class="form-group"><label>Origin</label><input type="text" id="smOrigin" value="${escAttr(s.origin)}"/></div>
    <div class="form-group"><label>Destination</label><input type="text" id="smDest" value="${escAttr(s.destination)}"/></div>
    <div class="form-group"><label>Weight</label><input type="text" id="smWeight" value="${escAttr(s.weight)}"/></div>
    <div class="form-group"><label>ETA</label><input type="datetime-local" id="smEta" value="${toLocalInput(s.eta)}"/></div>
    <div class="form-group"><label>Freight charge</label><input type="text" id="smCharge" value="${escAttr(s.charge)}" placeholder="USD 480.00"/></div>
  `;

  renderExtra("smExtra", "sx_", s);
  document.getElementById("smHistory").innerHTML = (s.history && s.history.length)
    ? `<p class="field-title">🕘 Status history</p>` + [...s.history].reverse().map(h =>
        `<div class="h-row"><b style="color:${STATUS_COLORS[h.status] || "inherit"}">${esc(h.status)}</b><span>${esc(h.location || "")}</span><small>${fmtDate(h.at)}</small></div>`).join("")
    : "";

  // ── 3D live-position map (MapLibre GL, no API key) ──
  document.getElementById("smMapWrap").classList.remove("hidden");
  initShipmentMap(s);

  renderModalPhotos(s);

  // Pre-fill update controls
  document.getElementById("smStatusSelect").value = s.status || "In Transit";
  document.getElementById("smLocationInput").value = s.location || "";
  document.getElementById("smUpdateStatus").classList.add("hidden");

  document.getElementById("shipModal").classList.remove("hidden");
};

window.closeShipModal = () => {
  document.getElementById("shipModal").classList.add("hidden");
  if (smMap) { smMap.remove(); smMap = null; smMarker = null; }
};

// ─── 3D Live-Position Map ──────────────────────────────
async function initShipmentMap(s) {
  smCoords = (typeof s.lat === "number" && typeof s.lng === "number")
    ? { lat: s.lat, lng: s.lng }
    : null;

  // No saved coordinates yet? Try a one-time geocode from the
  // typed location/destination/origin so the truck starts somewhere sane.
  if (!smCoords) {
    const guess = s.location || s.destination || s.origin;
    if (guess) smCoords = await geocodePlace(guess);
  }
  if (!smCoords) smCoords = { lat: 9.05, lng: 7.5 }; // fallback: West Africa

  if (smMap) { smMap.remove(); smMap = null; smMarker = null; }

  smMap = new maplibregl.Map({
    container: "smMap3D",
    style: "https://demotiles.maplibre.org/style.json",
    center: [smCoords.lng, smCoords.lat],
    zoom: 4,
    pitch: 55,      // real 3D tilt, not a CSS trick
    bearing: -12,
    attributionControl: false
  });
  smMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  smMap.addControl(new maplibregl.AttributionControl({ compact: true }));

  const el = document.createElement("div");
  el.className = "truck-marker";
  el.textContent = "🚚";

  smMarker = new maplibregl.Marker({ element: el, draggable: true, anchor: "bottom" })
    .setLngLat([smCoords.lng, smCoords.lat])
    .addTo(smMap);

  smMarker.on("dragend", async () => {
    const { lng, lat } = smMarker.getLngLat();
    smCoords = { lat, lng };
    const placeName = await reverseGeocodePlace(lat, lng);
    if (placeName) document.getElementById("smLocationInput").value = placeName;
  });
}

async function geocodePlace(query) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
    );
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) { console.warn("geocode failed", e); }
  return null;
}

async function reverseGeocodePlace(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
    );
    const data = await res.json();
    const a = data?.address;
    if (!a) return data?.display_name || null;
    return [a.city || a.town || a.village || a.county, a.state, a.country]
      .filter(Boolean).join(", ");
  } catch (e) { console.warn("reverse geocode failed", e); return null; }
}

// ─── Add-Shipment form map (starting position) ─────────
function initAddMap(center) {
  addMapCoords = center || null;
  const start = center || { lat: 9.05, lng: 7.5 }; // fallback: West Africa

  addMap = new maplibregl.Map({
    container: "addMap3D",
    style: "https://demotiles.maplibre.org/style.json",
    center: [start.lng, start.lat],
    zoom: 3.2,
    pitch: 55,
    bearing: -12,
    attributionControl: false
  });
  addMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  addMap.addControl(new maplibregl.AttributionControl({ compact: true }));

  const el = document.createElement("div");
  el.className = "truck-marker";
  el.textContent = "🚚";

  addMarker = new maplibregl.Marker({ element: el, draggable: true, anchor: "bottom" })
    .setLngLat([start.lng, start.lat])
    .addTo(addMap);

  addMarker.on("dragend", async () => {
    const { lng, lat } = addMarker.getLngLat();
    addMapCoords = { lat, lng };
    const placeName = await reverseGeocodePlace(lat, lng);
    if (placeName) document.getElementById("sLocation").value = placeName;
  });
}

function resetAddMap() {
  addMapCoords = null;
  if (addMarker && addMap) {
    addMarker.setLngLat([7.5, 9.05]);
    addMap.easeTo({ center: [7.5, 9.05], zoom: 3.2 });
  }
}

// ─── Update Shipment (status + all details) ───────────
window.updateShipmentStatus = async function () {
  if (!currentShipmentId) return;
  const status   = document.getElementById("smStatusSelect").value;
  const location = document.getElementById("smLocationInput").value.trim();
  const statusEl = document.getElementById("smUpdateStatus");

  const client  = document.getElementById("smClient").value.trim();
  const service = document.getElementById("smServiceSelect").value;
  const origin  = document.getElementById("smOrigin").value.trim();
  const dest    = document.getElementById("smDest").value.trim();
  const weight  = document.getElementById("smWeight").value.trim();
  const etaRaw  = document.getElementById("smEta").value;
  const charge  = document.getElementById("smCharge").value.trim();

  try {
    const photos = await commitModalPhotos(statusEl);
    const payload = {
      photos: photos.length ? photos : null,
      charge: charge || null,
      status,
      location: location || null,
      client:      client  || null,
      service:     service || null,
      origin:      origin  || null,
      destination: dest    || null,
      weight:      weight  || null,
      eta:         etaRaw ? Timestamp.fromDate(new Date(etaRaw)) : null,
      lastUpdate: serverTimestamp(),
      ...readExtra("sx_")
    };
    const prev = shipments.find(x => x.id === currentShipmentId);
    if (!prev || prev.status !== status || (prev.location || "") !== location) {
      payload.history = arrayUnion({ status, location: location || "", at: Timestamp.now() });
    }
    if (smCoords) {
      payload.lat = smCoords.lat;
      payload.lng = smCoords.lng;
    }
    await updateDoc(doc(db, "shipments", currentShipmentId), payload);

    // Update local state
    const s = shipments.find(x => x.id === currentShipmentId);
    if (s) {
      Object.assign(s, {
        status, location, client, service, charge,
        origin, destination: dest, weight, photos, ...readExtra("sx_")
      });
      s.history = [...(s.history || []), ...(payload.history ? [{ status, location, at: Timestamp.now() }] : [])];
      if (smCoords) { s.lat = smCoords.lat; s.lng = smCoords.lng; }
    }

    statusEl.className = "form-status success";
    statusEl.textContent = "✅ Shipment updated successfully.";
    statusEl.classList.remove("hidden");

    renderShipments();
    // Refresh modal (re-renders map + photos too)
    openShipment(currentShipmentId);

  } catch (e) {
    statusEl.className = "form-status error";
    statusEl.textContent = `❌ ${e.message}`;
    statusEl.classList.remove("hidden");
  }
};

// ─── Tracking ID generator (12 chars, letters + numbers) ───
const TID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid mix-ups
function genTrackingId() {
  for (;;) {
    const buf = new Uint32Array(12);
    crypto.getRandomValues(buf);
    const id = Array.from(buf, n => TID_CHARS[n % TID_CHARS.length]).join("");
    if (/[A-Z]/.test(id) && /[0-9]/.test(id) && !shipments.some(s => s.trackingId === id)) return id;
  }
}
window.newTrackingId = function () {
  const el = document.getElementById("sTrackId");
  if (el) el.value = genTrackingId();
};
document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("sTrackId");
  if (el) {
    el.value = genTrackingId();
    el.addEventListener("input", () => { el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12); });
  }
});

// ─── Add Shipment ─────────────────────────────────────
window.addShipment = async function () {
  const trackingId = document.getElementById("sTrackId").value.trim().toUpperCase();
  const client     = document.getElementById("sClient").value.trim();
  const status     = document.getElementById("sStatus").value;
  const statusEl   = document.getElementById("addStatus");

  if (!/^[A-Z0-9]{12}$/.test(trackingId)) {
    statusEl.className = "form-status error";
    statusEl.textContent = "⚠️ Tracking ID must be exactly 12 letters/numbers. Tap 🔄 to generate one.";
    statusEl.classList.remove("hidden");
    return;
  }
  if (shipments.some(s => s.trackingId === trackingId)) {
    statusEl.className = "form-status error";
    statusEl.textContent = "⚠️ That tracking ID already exists. Tap 🔄 for a new one.";
    statusEl.classList.remove("hidden");
    return;
  }

  const etaRaw        = document.getElementById("sEta").value;
  const lastUpdateRaw = document.getElementById("sLastUpdate").value;

  const steps = [0,1,2,3,4].map(i =>
    document.getElementById(`step${i}`).value.trim()
  );

  let photos = [];
  try { photos = await uploadPending(addPending, trackingId, statusEl); }
  catch (e) {
    statusEl.className = "form-status error";
    statusEl.textContent = `❌ Photo upload failed: ${e.message}`;
    statusEl.classList.remove("hidden");
    return;
  }

  const payload = {
    trackingId,
    client:      client || null,
    origin:      document.getElementById("sOrigin").value.trim()   || null,
    destination: document.getElementById("sDest").value.trim()     || null,
    status,
    location:    document.getElementById("sLocation").value.trim() || null,
    service:     document.getElementById("sService").value         || null,
    weight:      document.getElementById("sWeight").value.trim()   || null,
    charge:      document.getElementById("sCharge").value.trim()   || null,
    eta:         etaRaw        ? Timestamp.fromDate(new Date(etaRaw))        : null,
    lastUpdate:  lastUpdateRaw ? Timestamp.fromDate(new Date(lastUpdateRaw)) : serverTimestamp(),
    steps:       steps.some(s => s) ? steps : null,
    photos:      photos.length ? photos : null,
    createdAt:   serverTimestamp(),
    history:     [{ status, location: document.getElementById("sLocation").value.trim() || "", at: Timestamp.now() }],
    ...readExtra("x_")
  };
  if (addMapCoords) {
    payload.lat = addMapCoords.lat;
    payload.lng = addMapCoords.lng;
  }

  try {
    const ref = await addDoc(collection(db, "shipments"), payload);

    // Update local list
    shipments.unshift({ id: ref.id, ...payload });

    statusEl.className = "form-status success";
    statusEl.textContent = `✅ Shipment ${trackingId} added successfully!`;
    statusEl.classList.remove("hidden");

    // Clear form
    ["sTrackId","sClient","sOrigin","sDest","sLocation","sWeight","sEta","sLastUpdate",
     "step0","step1","step2","step3","step4",
     "sCharge"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    document.getElementById("sStatus").selectedIndex  = 1;
    document.getElementById("sService").selectedIndex = 0;
    resetAddMap();
    addPending = []; drawAdd();
    window.newTrackingId();
    renderExtra("addExtra", "x_", { orderId: newOrderId(), shipType: "Parcel", qty: "1" });
    renderShipments();

  } catch (e) {
    statusEl.className = "form-status error";
    statusEl.textContent = `❌ ${e.message}`;
    statusEl.classList.remove("hidden");
  }
};

// ─── Helpers ──────────────────────────────────────────
function fmtDate(val) {
  if (!val) return "—";
  const d = val?.toDate ? val.toDate() : new Date(val);
  return isNaN(d) ? String(val) : d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

// Escape a value for safe use inside an HTML attribute (value="...")
function escAttr(val) {
  return String(val ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// Convert a Firestore Timestamp / date-like value into the
// "YYYY-MM-DDTHH:mm" string an <input type="datetime-local"> needs
function toLocalInput(val) {
  if (!val) return "";
  const d = val?.toDate ? val.toDate() : new Date(val);
  if (isNaN(d)) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


// ═════════════════════════════════════════════════════
// PHOTO UPLOAD  (Firebase Storage, with client-side resize)
// ═════════════════════════════════════════════════════
const MAX_PHOTOS = 4;
let addPending = [];            // new files on the Add form: { file, src }
let smKept = [], smPending = []; // shipment modal: existing URLs / new files

function takeFiles(list, files, alreadyHave, statusEl) {
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    if (f.size > 20 * 1024 * 1024) { if (statusEl) flash(statusEl, "⚠️ Skipped a file over 20 MB."); continue; }
    if (list.length + alreadyHave >= MAX_PHOTOS) { if (statusEl) flash(statusEl, `⚠️ Maximum ${MAX_PHOTOS} photos.`); break; }
    list.push({ file: f, src: URL.createObjectURL(f), pending: true });
  }
}
function flash(el, msg) { el.className = "form-status error"; el.textContent = msg; el.classList.remove("hidden"); }

function drawThumbs(el, items, onRemove) {
  el.replaceChildren(...items.map((it, i) => {
    const d = document.createElement("div"); d.className = "thumb";
    const im = document.createElement("img"); im.src = it.src; im.alt = `Product photo ${i + 1}`;
    const b = document.createElement("button"); b.type = "button"; b.textContent = "✕";
    b.setAttribute("aria-label", `Remove photo ${i + 1}`); b.onclick = () => onRemove(i);
    d.append(im, b);
    if (it.pending) { const t = document.createElement("span"); t.textContent = "New"; d.append(t); }
    return d;
  }));
}

function wireDrop(drop, input, onFiles) {
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { onFiles([...input.files]); input.value = ""; });
  ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => onFiles([...e.dataTransfer.files]));
}

// Add Shipment form
function drawAdd() { drawThumbs(document.getElementById("addThumbs"), addPending, i => { addPending.splice(i, 1); drawAdd(); }); }
wireDrop(document.getElementById("addDrop"), document.getElementById("addFiles"), files => {
  takeFiles(addPending, files, 0, document.getElementById("addStatus")); drawAdd();
});

// Shipment modal
function drawModalThumbs() {
  const items = [...smKept.map(src => ({ src })), ...smPending];
  drawThumbs(document.getElementById("smPhotosGrid"), items, i => {
    if (i < smKept.length) smKept.splice(i, 1); else smPending.splice(i - smKept.length, 1);
    drawModalThumbs();
  });
}
function renderModalPhotos(s) { smKept = [...(s.photos || [])]; smPending = []; drawModalThumbs(); }
wireDrop(document.getElementById("smDrop"), document.getElementById("smFiles"), files => {
  takeFiles(smPending, files, smKept.length, document.getElementById("smUpdateStatus")); drawModalThumbs();
});
async function commitModalPhotos(statusEl) {
  const s = shipments.find(x => x.id === currentShipmentId);
  const uploaded = await uploadPending(smPending, s?.trackingId || currentShipmentId, statusEl);
  return [...smKept, ...uploaded];
}

// Resize + re-encode in the browser so uploads are fast and small
async function shrink(file, max, quality) {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, "image/jpeg", quality));
}
const blobToDataUrl = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

async function uploadPending(list, trackingId, statusEl) {
  const urls = [];
  const safeId = String(trackingId).replace(/[^A-Za-z0-9_-]/g, "_");
  for (let i = 0; i < list.length; i++) {
    const tag = `Uploading photo ${i + 1} of ${list.length}`;
    statusEl.className = "form-status"; statusEl.textContent = `${tag}…`; statusEl.classList.remove("hidden");
    try {
      const blob = await shrink(list[i].file, 1600, 0.82);
      const path = `shipments/${safeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const task = uploadBytesResumable(sRef(storage, path), blob, { contentType: "image/jpeg" });
      await new Promise((ok, bad) => task.on("state_changed",
        snap => { statusEl.textContent = `${tag}… ${Math.round(snap.bytesTransferred / snap.totalBytes * 100)}%`; }, bad, ok));
      urls.push(await getDownloadURL(task.snapshot.ref));
    } catch (e) {
      // Storage not enabled / rules not deployed: keep a small inline copy so the demo still works
      console.warn("Storage upload failed, using inline fallback:", e);
      urls.push(await blobToDataUrl(await shrink(list[i].file, 900, 0.7)));
      statusEl.textContent = "⚠️ Firebase Storage unavailable — saved a compressed copy inline instead.";
    }
  }
  return urls;
}

// ═════════════════════════════════════════════════════
// REALTIME: contacts, chats, alerts
// ═════════════════════════════════════════════════════
let SETTINGS = {
  email: "swiftfreightlogistics2026@gmail.com", phone: "+31657446248", whatsapp: "+31657446248",
  hours: "24/7", offices: [{ name: "Head Office", address: "New York City, USA" }],
  waMessage: "Hello Swift Air Cargo 👋 I'd like to talk to a human about my order processes.",
  chatEnabled: true, chatGreeting: "Hi 👋 I'm the Swift Air Cargo assistant. How can I help you today?",
  website: "", payInfo: "", payMethods: "Bank transfer, Card, PayPal", terms: "Goods are carried subject to our terms of carriage. Keep this receipt for claims."
};
let chats = [], activeChatId = null, unsubMsgs = null, realtimeStarted = false;
const digits = v => String(v || "").replace(/[^\d]/g, "");

function beep() {
  if (!document.getElementById("chatSound")?.checked) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.15);
      o.start(ctx.currentTime + i * 0.16); o.stop(ctx.currentTime + i * 0.16 + 0.16);
    });
  } catch (e) {}
}

function updateBadges() {
  const humans = chats.filter(c => c.needsHuman || (c.unreadAdmin > 0 && c.mode === "human")).length;
  const unread = contacts.filter(c => !c.read).length;
  const set = (id, n) => { const el = document.getElementById(id); if (!el) return; el.textContent = n; el.classList.toggle("hidden", !n); };
  set("badgeChats", humans); set("badgeContacts", unread);
  document.title = (humans + unread ? `(${humans + unread}) ` : "") + "Admin – Swift Air Cargo";
}

function startRealtime() {
  if (realtimeStarted) return; realtimeStarted = true;
  loadSettings();
  loadReviewsAdmin();
  let firstC = true;
  onSnapshot(query(collection(db, "contacts"), orderBy("timestamp", "desc")), snap => {
    if (!firstC && snap.docChanges().some(c => c.type === "added")) beep();
    firstC = false;
    contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderContacts(); renderContactStats(); updateBadges(); renderOverview();
  }, e => console.warn("contacts live", e));

  let firstS = true;
  onSnapshot(query(collection(db, "chats"), orderBy("lastAt", "desc"), limit(100)), snap => {
    if (!firstS) snap.docChanges().forEach(ch => {
      const d = ch.doc.data();
      if (ch.type === "added" || (ch.type === "modified" && (d.unreadAdmin || 0) > 0 && ch.doc.id !== activeChatId)) {
        if (d.needsHuman || d.mode === "human") beep();
      }
    });
    firstS = false;
    chats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderChatList(); updateBadges(); renderOverview();
  }, e => console.warn("chats live", e));
}

// ═════════════════════════════════════════════════════
// OVERVIEW
// ═════════════════════════════════════════════════════
function renderOverview() {
  const grid = document.getElementById("kpiGrid"); if (!grid) return;
  const by = st => shipments.filter(s => s.status === st).length;
  const unpaid = shipments.filter(s => /pending|unpaid|partial/i.test(s.payStatus || "")).length;
  const waiting = chats.filter(c => c.needsHuman).length;
  const kpi = (n, l, ic, tab) => `<div class="kpi" ${tab ? `onclick="switchTab('${tab}')"` : ""}><span class="kpi-ic">${ic}</span><strong>${n}</strong><label>${l}</label></div>`;
  grid.innerHTML =
    kpi(shipments.length, "Total shipments", "📦", "shipments") +
    kpi(by("In Transit") + by("Picked Up") + by("Customs Clearance") + by("Out for Delivery"), "Active", "🚚", "shipments") +
    kpi(by("Delivered"), "Delivered", "✅", "shipments") +
    kpi(waiting, "Chats need you", "💬", "chats") +
    kpi(contacts.filter(c => !c.read).length, "Unread messages", "📩", "contacts") +
    kpi(unpaid, "Payment pending", "💳", "shipments");

  const max = Math.max(1, ...STATUSES.map(by));
  document.getElementById("statusBars").innerHTML = STATUSES.map(st =>
    `<div class="bar-row"><span>${st}</span><div class="bar"><i style="width:${by(st) / max * 100}%;background:${STATUS_COLORS[st]}"></i></div><b>${by(st)}</b></div>`).join("");

  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
  const counts = days.map(d => shipments.filter(s => { const t = s.createdAt?.toDate ? s.createdAt.toDate() : null; return t && t >= d && t < new Date(+d + 864e5); }).length);
  const mx = Math.max(1, ...counts);
  document.getElementById("weekBars").innerHTML = days.map((d, i) =>
    `<div class="wb"><b>${counts[i]}</b><i style="height:${8 + counts[i] / mx * 70}px"></i><span>${d.toLocaleDateString("en-GB", { weekday: "short" })}</span></div>`).join("");

  const attn = [];
  chats.filter(c => c.needsHuman).slice(0, 4).forEach(c => attn.push(`<div class="att" onclick="switchTab('chats');openChat('${c.id}')">💬 <b>${esc(c.name || "Visitor")}</b> wants a human<small>${esc(c.lastMessage || "")}</small></div>`));
  contacts.filter(c => !c.read).slice(0, 4).forEach(c => attn.push(`<div class="att" onclick="switchTab('contacts');openContact('${c.id}')">📩 <b>${esc(c.name)}</b><small>${esc((c.message || "").slice(0, 70))}</small></div>`));
  document.getElementById("attnList").innerHTML = attn.join("") || '<div class="empty-msg" style="padding:18px">All caught up 🎉</div>';
  document.getElementById("recentShips").innerHTML = shipments.slice(0, 5).map(s =>
    `<div class="att" onclick="switchTab('shipments');openShipment('${s.id}')"><b>${esc(s.trackingId)}</b> <span style="color:${STATUS_COLORS[s.status] || "inherit"}">${esc(s.status || "")}</span><small>${esc(s.receiverName || s.client || "")} ${s.destination ? "→ " + esc(s.destination) : ""}</small></div>`).join("")
    || '<div class="empty-msg" style="padding:18px">No shipments yet.</div>';
}

// ═════════════════════════════════════════════════════
// LIVE CHAT (admin side)
// ═════════════════════════════════════════════════════
const chatName = c => c.name || `Visitor ${c.id.slice(0, 4).toUpperCase()}`;
const ago = v => {
  const d = v?.toDate ? v.toDate() : null; if (!d) return "";
  const m = Math.round((Date.now() - d) / 60000);
  return m < 1 ? "now" : m < 60 ? m + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d";
};
window.renderChatList = function () {
  const el = document.getElementById("chatList"); if (!el) return;
  if (!chats.length) { el.innerHTML = '<div class="empty-msg" style="padding:24px">No conversations yet.</div>'; return; }
  const rank = c => (c.needsHuman ? 0 : c.status === "closed" ? 2 : 1);
  const sorted = [...chats].sort((a, b) => rank(a) - rank(b));
  el.innerHTML = sorted.map(c => `
    <div class="cl-item ${c.id === activeChatId ? "active" : ""}" onclick="openChat('${c.id}')">
      <div class="cl-top"><b>${esc(chatName(c))}</b><small>${ago(c.lastAt)}</small></div>
      <div class="cl-msg">${esc(c.lastMessage || "…")}</div>
      <div class="cl-tags">
        ${c.needsHuman ? '<span class="tag red">Needs human</span>' : c.mode === "human" ? '<span class="tag amber">Live</span>' : '<span class="tag">Bot</span>'}
        ${c.status === "closed" ? '<span class="tag">Closed</span>' : ""}
        ${c.unreadAdmin > 0 ? `<span class="tag blue">${c.unreadAdmin} new</span>` : ""}
      </div>
    </div>`).join("");
};

const QUICK = ["Hello! How can I help you today?", "Please share your 12-character tracking number.", "One moment while I check that for you.", "Your shipment is on its way — thanks for your patience.", "Is there anything else I can help with?"];

window.openChat = async function (id) {
  activeChatId = id;
  const c = chats.find(x => x.id === id); if (!c) return;
  document.getElementById("chatAdmin").classList.add("show-thread");
  ["ctHead", "ctMsgs", "ctQuick", "ctForm"].forEach(i => document.getElementById(i).classList.remove("hidden"));
  document.getElementById("chatEmpty").classList.add("hidden");
  document.getElementById("ctName").textContent = chatName(c);
  document.getElementById("ctMeta").textContent = `Ref ${id.slice(0, 6).toUpperCase()} · ${c.page || ""} · ${(c.lang || "en").toUpperCase()}`;
  document.getElementById("ctQuick").innerHTML = QUICK.map((q, i) => `<button type="button" onclick="chatQuick(${i})">${esc(q.slice(0, 28))}…</button>`).join("");
  if (unsubMsgs) unsubMsgs();
  const box = document.getElementById("ctMsgs"); box.innerHTML = "";
  unsubMsgs = onSnapshot(query(collection(db, "chats", id, "messages"), orderBy("at", "asc")), snap => {
    box.innerHTML = snap.docs.map(d => {
      const m = d.data(), t = m.at?.toDate ? m.at.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      return `<div class="cm ${m.from}"><small>${m.from === "admin" ? "You" : m.from === "bot" ? "Bot" : "Visitor"} · ${t}</small>${esc(m.text)}</div>`;
    }).join("");
    box.scrollTop = box.scrollHeight;
    if (snap.docChanges().some(ch => ch.type === "added" && ch.doc.data().from === "visitor") && activeChatId === id) {
      updateDoc(doc(db, "chats", id), { unreadAdmin: 0 }).catch(() => {});
    }
  });
  if ((c.unreadAdmin || 0) > 0) updateDoc(doc(db, "chats", id), { unreadAdmin: 0 }).catch(() => {});
  renderChatList();
};
window.chatBack = () => { document.getElementById("chatAdmin").classList.remove("show-thread"); };
window.chatQuick = i => { const inp = document.getElementById("ctInput"); inp.value = QUICK[i]; inp.focus(); };
window.chatSend = async function (e) {
  e.preventDefault();
  const inp = document.getElementById("ctInput"), text = inp.value.trim();
  if (!text || !activeChatId) return false;
  inp.value = "";
  await addDoc(collection(db, "chats", activeChatId, "messages"), { from: "admin", text, at: serverTimestamp() });
  await updateDoc(doc(db, "chats", activeChatId), { lastMessage: "You: " + text.slice(0, 100), lastAt: serverTimestamp(), mode: "human", needsHuman: false, unreadAdmin: 0, status: "open" });
  return false;
};
window.chatResumeBot = async () => {
  if (!activeChatId) return;
  await updateDoc(doc(db, "chats", activeChatId), { mode: "bot", needsHuman: false });
  await addDoc(collection(db, "chats", activeChatId, "messages"), { from: "admin", text: "You're now back with our automated assistant. Type 'human' any time to reach an agent.", at: serverTimestamp() });
};
window.chatClose = async () => { if (activeChatId) await updateDoc(doc(db, "chats", activeChatId), { status: "closed", needsHuman: false }); };
window.chatDelete = async () => {
  if (!activeChatId || !confirm("Delete this conversation permanently?")) return;
  const id = activeChatId;
  const snap = await getDocs(collection(db, "chats", id, "messages"));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "chats", id));
  activeChatId = null; if (unsubMsgs) unsubMsgs();
  ["ctHead", "ctMsgs", "ctQuick", "ctForm"].forEach(i => document.getElementById(i).classList.add("hidden"));
  document.getElementById("chatEmpty").classList.remove("hidden"); chatBack();
};

// ═════════════════════════════════════════════════════
// SETTINGS (office locations, phone, email, WhatsApp…)
// ═════════════════════════════════════════════════════
async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    if (snap.exists()) SETTINGS = Object.assign(SETTINGS, snap.data());
  } catch (e) { console.warn("settings", e); }
}
function officeRow(o = {}) {
  return `<div class="office-row"><input placeholder="Label (e.g. Head Office)" value="${escAttr(o.name)}" data-f="name"/>
    <input placeholder="Full address" value="${escAttr(o.address)}" data-f="address"/>
    <button class="btn-outline danger" type="button" onclick="this.parentElement.remove()">✕</button></div>`;
}
window.addOfficeRow = () => document.getElementById("stOffices").insertAdjacentHTML("beforeend", officeRow());
async function fillSettingsForm() {
  await loadSettings();
  const S = SETTINGS, v = (id, val) => { document.getElementById(id).value = val ?? ""; };
  v("stEmail", S.email); v("stPhone", S.phone); v("stWa", S.whatsapp); v("stHours", S.hours);
  v("stWaMsg", S.waMessage); v("stGreeting", S.chatGreeting); v("stSite", S.website); v("stPayInfo", S.payInfo); v("stPayMethods", S.payMethods); v("stTerms", S.terms);
  document.getElementById("stChatOn").checked = S.chatEnabled !== false;
  document.getElementById("stOffices").innerHTML = (S.offices || []).map(officeRow).join("");
}
window.saveSettings = async function () {
  const g = id => document.getElementById(id).value.trim();
  const st = document.getElementById("settingsStatus");
  const offices = [...document.querySelectorAll("#stOffices .office-row")].map(r => ({
    name: r.querySelector('[data-f="name"]').value.trim(), address: r.querySelector('[data-f="address"]').value.trim()
  })).filter(o => o.address);
  const data = {
    email: g("stEmail"), phone: g("stPhone"), whatsapp: g("stWa"), hours: g("stHours"), offices,
    waMessage: g("stWaMsg"), chatGreeting: g("stGreeting"), chatEnabled: document.getElementById("stChatOn").checked,
    website: g("stSite"), payInfo: g("stPayInfo"), payMethods: g("stPayMethods"), terms: g("stTerms"), updatedAt: serverTimestamp()
  };
  try {
    await setDoc(doc(db, "settings", "site"), data, { merge: true });
    SETTINGS = Object.assign(SETTINGS, data);
    st.className = "form-status success"; st.textContent = "✅ Saved. The website now shows your new details.";
  } catch (e) { st.className = "form-status error"; st.textContent = "❌ " + e.message + " (deploy the updated firestore.rules)"; }
  st.classList.remove("hidden");
};

// ═════════════════════════════════════════════════════
// REVIEWS (visitor submissions are moderated; admin sets avatar)
// ═════════════════════════════════════════════════════
const avatarFromFile = async file => blobToDataUrl(await shrink(file, 160, 0.82));
const reviewAvatarHtml = r => r.avatar
  ? `<img class="rv-av" src="${esc(r.avatar)}" alt=""/>`
  : `<span class="rv-av ini">${esc((r.name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase())}</span>`;

async function loadReviewsAdmin() {
  const el = document.getElementById("reviewList");
  try {
    const snap = await getDocs(collection(db, "reviews"));
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const pending = all.filter(r => r.status === "pending");
    const live = all.filter(r => r.status !== "pending");
    const card = r => {
      const known = r.trackingRef && shipments.some(s => s.trackingId === String(r.trackingRef).toUpperCase());
      return `<div class="submission-card rv-card ${r.status === "pending" ? "unread" : ""}">
        <div class="rv-row">${reviewAvatarHtml(r)}
          <div style="flex:1;min-width:0"><div class="sub-header"><span class="sub-name">${esc(r.name)} <small style="color:var(--text3)">${esc(r.role || "")}</small></span><span style="color:var(--accent)">${"★".repeat(r.stars || 5)}</span></div>
          <div class="sub-preview">${esc(r.text)}</div>
          ${r.trackingRef ? `<small class="${known ? "ok" : "warn"}">Tracking ref: ${esc(r.trackingRef)} ${known ? "✔ matches a shipment" : "✖ no matching shipment"}</small>` : '<small class="warn">No tracking ref given</small>'}</div></div>
        <div class="rv-actions">
          ${r.status === "pending" ? `<button class="btn-primary" onclick="approveReview('${r.id}')">✔ Approve</button>` : `<button class="btn-outline" onclick="toggleReview('${r.id}',${r.visible === false})">${r.visible === false ? "Show" : "Hide"}</button>`}
          <label class="btn-outline filebtn">🖼 ${r.avatar ? "Change" : "Add"} photo<input type="file" accept="image/*" hidden onchange="setReviewAvatar('${r.id}',this)"/></label>
          ${r.avatar ? `<button class="btn-outline" onclick="clearReviewAvatar('${r.id}')">Remove photo</button>` : ""}
          <button class="btn-outline danger" onclick="deleteReview('${r.id}')">${r.status === "pending" ? "Reject" : "Delete"}</button>
        </div></div>`;
    };
    el.innerHTML =
      `<h3 class="rv-h">Pending approval <span class="nav-badge ${pending.length ? "" : "hidden"}">${pending.length}</span></h3>` +
      (pending.map(card).join("") || '<div class="empty-msg" style="padding:18px">Nothing waiting.</div>') +
      `<h3 class="rv-h">On your website</h3>` +
      (live.map(card).join("") || '<div class="empty-msg" style="padding:18px">No published reviews yet. The Reviews list on your site stays empty until you approve or add one.</div>');
    const nb = document.getElementById("badgeReviews"); if (nb) { nb.textContent = pending.length; nb.classList.toggle("hidden", !pending.length); }
  } catch (e) { el.innerHTML = `<div class="error-msg">❌ ${esc(e.message)} (deploy the updated firestore.rules)</div>`; }
}
window.addReview = async function () {
  const name = document.getElementById("rvName").value.trim(), text = document.getElementById("rvText").value.trim();
  if (!name || !text) return alert("Name and review text are required.");
  const f = document.getElementById("rvAvatar").files[0];
  const data = { name, role: document.getElementById("rvRole").value.trim(), text, stars: +document.getElementById("rvStars").value, visible: true, status: "approved", createdAt: serverTimestamp() };
  if (f) data.avatar = await avatarFromFile(f);
  await addDoc(collection(db, "reviews"), data);
  ["rvName", "rvRole", "rvText", "rvAvatar"].forEach(i => document.getElementById(i).value = ""); loadReviewsAdmin();
};
window.approveReview = async id => { await updateDoc(doc(db, "reviews", id), { status: "approved", visible: true }); loadReviewsAdmin(); };
window.toggleReview = async (id, show) => { await updateDoc(doc(db, "reviews", id), { visible: show }); loadReviewsAdmin(); };
window.deleteReview = async id => { if (confirm("Delete this review?")) { await deleteDoc(doc(db, "reviews", id)); loadReviewsAdmin(); } };
window.setReviewAvatar = async (id, input) => { const f = input.files[0]; if (!f) return; await updateDoc(doc(db, "reviews", id), { avatar: await avatarFromFile(f) }); loadReviewsAdmin(); };
window.clearReviewAvatar = async id => { await updateDoc(doc(db, "reviews", id), { avatar: null }); loadReviewsAdmin(); };

// ═════════════════════════════════════════════════════
// ORDER RECEIPT  (on-screen preview, PDF, image, print, WhatsApp)
// ═════════════════════════════════════════════════════
const TRACK_URL = id => new URL(`track.html?id=${encodeURIComponent(id || "")}`, location.href).href;
let receiptShipment = null;

function stampSvg(s) {
  const paid = /paid/i.test(s.payStatus || "") && !/un|part/i.test(s.payStatus || "");
  const d = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  const c = paid ? "#16a34a" : "#1d4ed8", mid = paid ? "PAID" : "ISSUED";
  return `<svg viewBox="0 0 120 120" width="104" height="104" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(-12deg)">
    <defs><path id="rcArcT" d="M16,60 a44,44 0 1,1 88,0"/><path id="rcArcB" d="M10,60 a50,50 0 0,0 100,0"/></defs>
    <circle cx="60" cy="60" r="56" fill="none" stroke="${c}" stroke-width="3"/>
    <circle cx="60" cy="60" r="50" fill="none" stroke="${c}" stroke-width="1"/>
    <circle cx="60" cy="60" r="33" fill="none" stroke="${c}" stroke-width="1.5"/>
    <text font-family="Arial,sans-serif" font-size="11" font-weight="800" fill="${c}" letter-spacing="1.5"><textPath href="#rcArcT" startOffset="50%" text-anchor="middle">SWIFT AIR CARGO</textPath></text>
    <text font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="${c}" letter-spacing="1"><textPath href="#rcArcB" startOffset="50%" text-anchor="middle">OFFICIAL RECEIPT</textPath></text>
    <text x="60" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="900" fill="${c}">${mid}</text>
    <text x="60" y="73" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" font-weight="700" fill="${c}">${d}</text>
  </svg>`;
}
function receiptHtml(s) {
  const S = SETTINGS, o = (S.offices && S.offices[0]) || {};
  const f = v => esc(v || "—");
  const site = S.website || location.origin;
  const eta = s.eta ? new Date(s.eta.toDate ? s.eta.toDate() : s.eta).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const col = STATUS_COLORS[s.status] || "#64748b";
  const photo = (s.photos || [])[0];
  const items = Array.isArray(s.items) ? s.items.filter(i => i.desc || +i.unit) : [];
  const itemsMode = items.length > 0, hp = !!s.hidePrices, cur = s.currency || "";
  const money = n => esc(cur) + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sub = items.reduce((a, i) => a + (+i.qty || 0) * (+i.unit || 0), 0), disc = +s.discount || 0, total = Math.max(0, sub - disc);
  const itemsTable = `<table class="rc-table"><thead><tr><th>Qty</th><th>Description</th>${hp ? "" : '<th class="r">Unit price</th><th class="r">Amount</th>'}</tr></thead><tbody>
    ${items.map(i => `<tr><td>${esc(i.qty || 1)}</td><td>${f(i.desc)}</td>${hp ? "" : `<td class="r">${money(i.unit)}</td><td class="r">${money((+i.qty || 0) * (+i.unit || 0))}</td>`}</tr>`).join("")}</tbody></table>
    ${hp ? "" : `<table class="rc-sum"><tr><td>Subtotal</td><td class="r">${money(sub)}</td></tr>${disc ? `<tr><td>Discount</td><td class="r">− ${money(disc)}</td></tr>` : ""}<tr class="tot"><td>TOTAL</td><td class="r">${money(total)}</td></tr></table>`}`;
  const methods = String(S.payMethods || "").split(",").map(x => x.trim()).filter(Boolean);
  return `
  <div class="rc-top">
    <div class="rc-brand"><div class="rc-logo">⬡ Swift <b>Air Cargo</b></div><small>Global logistics · Air · Sea · Road</small></div>
    <div class="rc-track"><small>TRACKING NUMBER</small><strong>${esc(s.trackingId)}</strong></div>
  </div>
  <div class="rc-company">
    <div><b>${esc("Swift Air Cargo")}</b></div>
    ${(S.offices || []).map(x => `<div>📍 ${x.name ? esc(x.name) + ": " : ""}${esc(x.address)}</div>`).join("")}
    <div>✉ ${esc(S.email)} &nbsp;·&nbsp; ☎ ${esc(S.phone)}</div>
    <div>🌐 ${esc(site)}</div>
  </div>
  <div class="rc-parties">
    <div><h4>FROM (SENDER)</h4><b>${f(s.senderName || s.client)}</b>
      <p><u>Address:</u> ${f(s.senderAddress || s.origin)}</p><p><u>Phone No:</u> ${f(s.senderPhone)}</p><p><u>Origin Office:</u> ${f(s.originOffice || s.origin)}</p></div>
    <div><h4>TO (CONSIGNEE)</h4><b>${f(s.receiverName)}</b>
      <p><u>Address:</u> ${f(s.receiverAddress || s.destination)}</p><p><u>Phone No:</u> ${f(s.receiverPhone)}</p><p><u>Destination Office:</u> ${f(s.destOffice || s.destination)}</p></div>
  </div>
  <div class="rc-mid">
    <div class="rc-barcode"><svg id="rcBar"></svg><span>${esc(s.trackingId)}</span></div>
    <div class="rc-info">
      ${s.receiptNo ? `<p><u>Receipt No:</u> ${esc(s.receiptNo)}</p>` : ""}
      <p><u>Order ID:</u> ${f(s.orderId)}</p>
      <p><u>Est. Delivery Date:</u> ${esc(eta)}</p>
      <p><u>Payment Mode:</u> <b class="rc-pill pay">${f(s.payMode)}</b> · <b class="rc-pill ${/paid/i.test(s.payStatus || "") && !/un|part/i.test(s.payStatus) ? "ok" : "warn"}">${f(s.payStatus || "Pending")}</b></p>
      <p><u>Mode of Transport:</u> ${f(s.transport || s.service)}</p>
      ${itemsMode ? `<p><u>Shipment:</u> ${f(s.shipType || s.service)}${s.weight ? " · " + esc(s.weight) : ""}</p><p><u>Status:</u> <b style="color:${col}">${f(s.status)}</b></p>` : ""}
      <p><u>Issued:</u> ${esc(s.issued || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}</p>
    </div>
  </div>
  ${itemsMode ? itemsTable : `<table class="rc-table"><thead><tr><th>Qty</th><th>Type of Shipment</th><th>Product</th><th>Weight</th><th>Status</th><th>Total Amount</th><th>Custom Clearance Charges</th></tr></thead>
    <tbody><tr><td>${f(s.qty || "1")}</td><td>${f(s.shipType || s.service)}</td><td>${f(s.product)}</td><td>${f(s.weight)}</td>
    <td><b class="rc-pill" style="color:${col}">● ${f(s.status)}</b></td><td><b>${f(s.charge)}</b></td><td>${f(s.customsCharge)}</td></tr></tbody></table>`}
  ${photo ? `<img class="rc-photo" crossorigin="anonymous" src="${esc(photo)}" alt="Shipment photo" onerror="this.remove()"/>` : ""}
  <div class="rc-bottom">
    <div class="rc-pay"><h4>Payment Methods / Instructions</h4>
      ${methods.length ? `<div class="rc-methods">${methods.map(m => `<span>${esc(m)}</span>`).join("")}</div>` : ""}
      <pre>${esc(s.payInfo || S.payInfo || "Contact us for payment instructions.")}</pre></div>
    <div class="rc-qr"><div id="rcQr"></div><small>Scan to track live</small></div>
  </div>
  ${s.note ? `<div class="rc-note"><h4>Note</h4><div>${esc(s.note)}</div></div>` : ""}
  <div class="rc-verify">
    ${s.noStamp ? "" : `<div class="rc-stamp">${stampSvg(s)}</div>`}
    <p><b>Verify this receipt.</b> Open <u>${esc(site.replace(/^https?:\/\//, "").replace(/\/$/, ""))}/track.html</u> and enter tracking number <b>${esc(s.trackingId)}</b>, or scan the QR code. Only pay using the instructions shown on this receipt.</p>
  </div>
  <div class="rc-terms">${esc(S.terms || "")}</div>
  <div class="rc-sign"><div><span></span>Authorised signature</div><div><span></span>Receiver signature</div></div>
  <div class="rc-thanks">Thank you for shipping with Swift Air Cargo.</div>`;
}
function mountReceipt(el, s) {
  el.innerHTML = receiptHtml(s);
  try { if (window.JsBarcode) JsBarcode(el.querySelector("#rcBar"), s.trackingId || "000000000000", { format: "CODE128", height: 44, width: 1.6, displayValue: false, margin: 0 }); } catch (e) {}
  try { if (window.QRCode) new QRCode(el.querySelector("#rcQr"), { text: TRACK_URL(s.trackingId), width: 84, height: 84, correctLevel: QRCode.CorrectLevel.M }); } catch (e) {}
}
window.openReceipt = async function (id) {
  const s = shipments.find(x => x.id === id); if (!s) return;
  await loadSettings();
  receiptShipment = s;
  mountReceipt(document.getElementById("receiptPaper"), s);
  document.getElementById("receiptMsg").classList.add("hidden");
  document.getElementById("receiptModal").classList.remove("hidden");
};
window.closeReceipt = () => document.getElementById("receiptModal").classList.add("hidden");

async function receiptCanvas() {
  // Render a fixed-width copy off-screen so the PDF is identical on phone and desktop
  const host = document.createElement("div");
  host.className = "receipt rc-export"; host.style.cssText = "position:fixed;left:-10000px;top:0;width:780px";
  document.body.appendChild(host);
  mountReceipt(host, receiptShipment);
  await new Promise(r => setTimeout(r, 250));
  await Promise.all([...host.querySelectorAll("img")].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  const canvas = await html2canvas(host, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  host.remove();
  return canvas;
}
const rName = ext => `SwiftAirCargo-Receipt-${(receiptShipment?.trackingId || "order").replace(/[^\w-]/g, "_")}.${ext}`;
function rErr(e) { const m = document.getElementById("receiptMsg"); m.className = "form-status error"; m.textContent = "❌ " + e.message; m.classList.remove("hidden"); }

async function receiptPdfBlob() {
  if (!window.jspdf || !window.html2canvas) throw new Error("PDF library still loading — try again in a moment.");
  const canvas = await receiptCanvas();
  const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
  const pw = 210, ph = 297, m = 8;
  let w = pw - m * 2, h = canvas.height * w / canvas.width;
  if (h > ph - m * 2) { h = ph - m * 2; w = canvas.width * h / canvas.height; }
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", (pw - w) / 2, m, w, h);
  return pdf.output("blob");
}
async function receiptPngBlob() {
  if (!window.html2canvas) throw new Error("Image library still loading — try again in a moment.");
  const canvas = await receiptCanvas();
  return new Promise(res => canvas.toBlob(res, "image/png"));
}
function saveBlob(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// Share the actual receipt FILE (PDF or image) via the device share sheet → WhatsApp, Telegram, email, etc.
window.shareReceiptFile = async function (kind = "pdf") {
  const s = receiptShipment; if (!s) return;
  try {
    const isPdf = kind === "pdf";
    const blob = isPdf ? await receiptPdfBlob() : await receiptPngBlob();
    const file = new File([blob], rName(isPdf ? "pdf" : "png"), { type: isPdf ? "application/pdf" : "image/png" });
    const text = `Swift Air Cargo 📦\nTracking number: ${s.trackingId}\nTrack live: ${TRACK_URL(s.trackingId)}`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Shipment receipt", text });
    } else {
      // Desktop / unsupported browsers: download the file, then open WhatsApp so it can be attached
      saveBlob(blob, file.name);
      const m = document.getElementById("receiptMsg");
      m.className = "form-status success"; m.textContent = "✅ Receipt downloaded — attach it in WhatsApp (opening now).";
      m.classList.remove("hidden");
      setTimeout(() => window.open(`https://wa.me/${digits(s.receiverPhone || s.senderPhone)}?text=${encodeURIComponent(text)}`, "_blank", "noopener"), 600);
    }
  } catch (e) { if (e.name !== "AbortError") rErr(e); }
};

window.downloadReceiptPdf = async function () {
  try { saveBlob(await receiptPdfBlob(), rName("pdf")); } catch (e) { rErr(e); }
};
window.downloadReceipt = async function () {
  try { saveBlob(await receiptPngBlob(), rName("png")); } catch (e) { rErr(e); }
};
window.printReceipt = function () {
  document.body.classList.add("printing-receipt");
  const done = () => { document.body.classList.remove("printing-receipt"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
};
window.shareReceiptWa = function () {
  const s = receiptShipment; if (!s) return;
  const to = digits(s.receiverPhone || s.senderPhone);
  const txt = `Swift Air Cargo 📦\nTracking number: ${s.trackingId}\nStatus: ${s.status || "—"}\nTrack live: ${TRACK_URL(s.trackingId)}`;
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
};


// ═════════════════════════════════════════════════════
// RECEIPTS TAB  (build a receipt, add note / payment method / prices, preview live, then save/print/share)
// ═════════════════════════════════════════════════════
let rpItems = [], rpInited = false, rpTimer = null, rpEditId = null;
const $r = id => document.getElementById(id);
const rpNewNo = () => { const d = new Date(); return `RC-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`; };
const isoDay = v => { if (!v) return ""; const d = v.toDate ? v.toDate() : new Date(v); return isNaN(d) ? "" : d.toISOString().slice(0, 10); };
const numOf = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "").replace(/[^\d.]/g, "")); return isNaN(n) ? 0 : n; };
const curOf = v => (String(v || "").match(/^[^\d\s.,-]+/) || [""])[0];

async function initReceiptsTab() {
  await loadSettings();
  const pick = $r("rpPick"), cur = pick.value;
  pick.innerHTML = '<option value="">— Blank receipt —</option>' + shipments.map(s => `<option value="${esc(s.id)}">${esc(s.trackingId)} — ${esc(s.receiverName || s.client || "")}</option>`).join("");
  pick.value = cur;
  const methods = String(SETTINGS.payMethods || "Bank transfer, Card, PayPal").split(",").map(x => x.trim()).filter(Boolean);
  const pm = $r("rpPayMode"), keep = pm.value;
  pm.innerHTML = [...methods, "Cash", "Other"].filter((v, i, a) => a.indexOf(v) === i).map(m => `<option>${esc(m)}</option>`).join("");
  if (keep) pm.value = keep;
  if (!rpInited) {
    rpInited = true;
    $r("tab-receipts").addEventListener("input", rpQueue);
    $r("tab-receipts").addEventListener("change", rpQueue);
    rpNew();
  }
  rpLoadHistory();
}
function rpQueue() { clearTimeout(rpTimer); rpTimer = setTimeout(rpPreview, 150); }

window.rpNew = function () {
  rpEditId = null; $r("rpPick").value = "";
  rpSet({ receiptNo: rpNewNo(), issued: new Date().toISOString().slice(0, 10), payInfo: SETTINGS.payInfo || "", items: [{ desc: "", qty: 1, unit: "" }], payStatus: "Pending", payMode: String(SETTINGS.payMethods || "").split(",")[0]?.trim() || "Bank transfer" });
};
window.rpFill = function (id) {
  const s = shipments.find(x => x.id === id); if (!s) return rpNew();
  const items = [];
  if (numOf(s.charge)) items.push({ desc: `Freight charge${s.product ? " — " + s.product : ""}`, qty: s.qty || 1, unit: numOf(s.charge) });
  if (numOf(s.customsCharge)) items.push({ desc: "Customs clearance charges", qty: 1, unit: numOf(s.customsCharge) });
  if (!items.length) items.push({ desc: "", qty: 1, unit: "" });
  rpEditId = null;
  rpSet({
    receiptNo: rpNewNo(), issued: new Date().toISOString().slice(0, 10), trackingId: s.trackingId, orderId: s.orderId, transport: s.transport || s.service, eta: isoDay(s.eta),
    shipType: s.shipType || s.service, status: s.status,
    senderName: s.senderName || s.client, senderPhone: s.senderPhone, senderAddress: s.senderAddress || s.origin, originOffice: s.originOffice || s.origin,
    receiverName: s.receiverName, receiverPhone: s.receiverPhone, receiverAddress: s.receiverAddress || s.destination, destOffice: s.destOffice || s.destination,
    currency: curOf(s.charge), items, payMode: s.payMode, payStatus: /paid/i.test(s.payStatus || "") && !/un|part/i.test(s.payStatus) ? "Paid" : (s.payStatus || "Pending"),
    payInfo: SETTINGS.payInfo || "", weight: s.weight
  });
};
let rpExtra = {};
function rpSet(d) {
  rpExtra = { weight: d.weight || "" };
  const v = (id, val) => { $r(id).value = val ?? ""; };
  v("rpNo", d.receiptNo); v("rpDate", d.issued); v("rpTrack", d.trackingId); v("rpOrder", d.orderId); v("rpTransport", d.transport); v("rpEta", d.eta);
  v("rpType", d.shipType); v("rpStatus", d.status);
  v("rpFromName", d.senderName); v("rpFromPhone", d.senderPhone); v("rpFromAddr", d.senderAddress); v("rpFromOffice", d.originOffice);
  v("rpToName", d.receiverName); v("rpToPhone", d.receiverPhone); v("rpToAddr", d.receiverAddress); v("rpToOffice", d.destOffice);
  v("rpCur", d.currency); v("rpDisc", d.discount || ""); v("rpPayInfo", d.payInfo); v("rpNote", d.note);
  if (d.payMode && ![...$r("rpPayMode").options].some(o => o.value === d.payMode)) $r("rpPayMode").add(new Option(d.payMode));
  if (d.payMode) $r("rpPayMode").value = d.payMode;
  $r("rpPayStatus").value = d.payStatus || "Pending";
  $r("rpShowPrices").checked = !d.hidePrices; $r("rpStamp").checked = !d.noStamp;
  rpItems = (d.items && d.items.length ? d.items : [{ desc: "", qty: 1, unit: "" }]).map(i => ({ ...i }));
  rpDrawItems(); rpPreview();
}
function rpDrawItems() {
  $r("rpItems").innerHTML = rpItems.map((it, i) => `<div class="rp-item">
    <input type="number" min="0" step="1" value="${esc(it.qty)}" data-i="${i}" data-k="qty" placeholder="Qty"/>
    <input value="${esc(it.desc)}" data-i="${i}" data-k="desc" placeholder="Description"/>
    <input type="number" min="0" step="0.01" value="${esc(it.unit)}" data-i="${i}" data-k="unit" placeholder="Price"/>
    <button type="button" onclick="rpDelItem(${i})" title="Remove">✕</button></div>`).join("");
  $r("rpItems").querySelectorAll("input").forEach(el => el.addEventListener("input", () => { rpItems[+el.dataset.i][el.dataset.k] = el.value; }));
}
window.rpAddItem = function () { rpItems.push({ desc: "", qty: 1, unit: "" }); rpDrawItems(); rpPreview(); };
window.rpDelItem = function (i) { rpItems.splice(i, 1); if (!rpItems.length) rpItems.push({ desc: "", qty: 1, unit: "" }); rpDrawItems(); rpPreview(); };

function rpRead() {
  const g = id => $r(id).value.trim();
  const d = g("rpDate");
  return {
    receiptNo: g("rpNo"), issued: d ? new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "", issuedIso: d,
    trackingId: g("rpTrack").toUpperCase(), orderId: g("rpOrder"), transport: g("rpTransport"), eta: g("rpEta"), shipType: g("rpType"), status: g("rpStatus"), weight: rpExtra.weight || "",
    senderName: g("rpFromName"), senderPhone: g("rpFromPhone"), senderAddress: g("rpFromAddr"), originOffice: g("rpFromOffice"),
    receiverName: g("rpToName"), receiverPhone: g("rpToPhone"), receiverAddress: g("rpToAddr"), destOffice: g("rpToOffice"),
    currency: g("rpCur"), discount: parseFloat($r("rpDisc").value) || 0, items: rpItems.map(i => ({ desc: String(i.desc || "").trim(), qty: +i.qty || 1, unit: +i.unit || 0 })),
    payMode: $r("rpPayMode").value, payStatus: $r("rpPayStatus").value, payInfo: $r("rpPayInfo").value, note: g("rpNote"),
    hidePrices: !$r("rpShowPrices").checked, noStamp: !$r("rpStamp").checked
  };
}
function rpPreview() {
  const d = rpRead();
  const sub = d.items.reduce((a, i) => a + i.qty * i.unit, 0), tot = Math.max(0, sub - d.discount);
  $r("rpTotal").textContent = d.hidePrices ? "Prices hidden on receipt" : `Total: ${d.currency}${tot.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  mountReceipt($r("rpPaper"), d);
}
window.rpDo = async function (action) {
  const d = rpRead();
  if (!d.trackingId) { rpMsg("Add a tracking number first.", true); return; }
  receiptShipment = d;
  try {
    if (action === "pdf") await downloadReceiptPdf();
    else if (action === "png") await downloadReceipt();
    else if (action === "sharepdf") await shareReceiptFile("pdf");
    else if (action === "shareimg") await shareReceiptFile("png");
    else if (action === "print") {
      mountReceipt($r("receiptPaper"), d);
      $r("receiptMsg").classList.add("hidden");
      $r("receiptModal").classList.remove("hidden");
      await new Promise(r => setTimeout(r, 300));
      const close = () => { closeReceipt(); window.removeEventListener("afterprint", close); };
      window.addEventListener("afterprint", close);
      printReceipt();
    }
  } catch (e) { rpMsg(e.message, true); }
};
function rpMsg(t, err) { const m = $r("rpMsg"); m.className = "form-status " + (err ? "error" : "success"); m.textContent = (err ? "❌ " : "✅ ") + t; m.classList.remove("hidden"); setTimeout(() => m.classList.add("hidden"), 4000); }

window.rpSave = async function () {
  const d = rpRead();
  if (!d.trackingId) return rpMsg("Add a tracking number first.", true);
  try {
    const data = { ...d, items: d.items, updatedAt: serverTimestamp() };
    if (rpEditId) await setDoc(doc(db, "receipts", rpEditId), data, { merge: true });
    else { data.createdAt = serverTimestamp(); const r = await addDoc(collection(db, "receipts"), data); rpEditId = r.id; }
    rpMsg("Receipt saved."); rpLoadHistory();
  } catch (e) { rpMsg("Could not save — deploy the updated firestore.rules (" + e.message + ")", true); }
};
async function rpLoadHistory() {
  const box = $r("rpHistory");
  try {
    const snap = await getDocs(query(collection(db, "receipts"), orderBy("createdAt", "desc"), limit(30)));
    window.__rp = Object.fromEntries(snap.docs.map(x => [x.id, x.data()]));
    box.innerHTML = snap.empty ? '<p class="hint">No saved receipts yet.</p>' : snap.docs.map(x => { const r = x.data(); return `<div class="rp-hist"><div><b>${esc(r.receiptNo || x.id)}</b> · ${esc(r.trackingId)}<small>${esc(r.receiverName || "—")} · ${esc(r.issued || "")}</small></div>
      <div><button class="btn-outline" onclick="rpOpen('${x.id}')">Open</button><button class="btn-outline" onclick="rpDelete('${x.id}')">🗑</button></div></div>`; }).join("");
  } catch (e) { box.innerHTML = '<p class="hint">Saved receipts need the updated Firestore rules (see README).</p>'; }
}
window.rpOpen = function (id) {
  const r = window.__rp?.[id]; if (!r) return;
  rpEditId = id; $r("rpPick").value = "";
  rpSet({ ...r, issued: r.issuedIso || "" });
  window.scrollTo({ top: 0, behavior: "smooth" });
};
window.rpDelete = async function (id) {
  if (!confirm("Delete this saved receipt?")) return;
  await deleteDoc(doc(db, "receipts", id)); if (rpEditId === id) rpEditId = null; rpLoadHistory();
};
