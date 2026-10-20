// =====================================================
// SWIFTFREIGHT – ADMIN.JS
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
  collection, query, orderBy, getDocs,
  doc, updateDoc, addDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// ─── State ────────────────────────────────────────────
let contacts  = [];   // raw Firestore docs: { id, ...data }
let shipments = [];
let activeTab = "contacts";
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
    <div class="submission-card ${c.read ? "" : "unread"}" onclick="openContact('${c.id}')">
      <div class="sub-header">
        <span class="sub-name">
          ${c.name}
          ${!c.read ? '<span class="badge-new">NEW</span>' : ""}
        </span>
        <span class="sub-date">${fmtDate(c.timestamp)}</span>
      </div>
      <div class="sub-meta">
        <span>📧 ${c.email}</span>
        ${c.phone   ? `<span>📞 ${c.phone}</span>` : ""}
        ${c.service ? `<span>📦 ${c.service}</span>` : ""}
      </div>
      <div class="sub-preview">${(c.message || "").slice(0, 140)}${c.message?.length > 140 ? "…" : ""}</div>
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
    <div><strong>Email</strong>${c.email}</div>
    <div><strong>Phone</strong>${c.phone || "—"}</div>
    <div><strong>Service</strong>${c.service || "—"}</div>
    <div><strong>Submitted</strong>${fmtDate(c.timestamp)}</div>
    ${c.subject ? `<div style="grid-column:1/-1"><strong>Subject</strong>${c.subject}</div>` : ""}
  `;
  document.getElementById("mMessage").innerHTML =
    `<strong>Message</strong><p>${(c.message || "").replace(/\n/g, "<br/>")}</p>`;

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
window.renderShipments = function () {
  const q    = (document.getElementById("shipSearch")?.value || "").toLowerCase();
  const list = document.getElementById("shipmentList");

  const filtered = shipments.filter(s =>
    !q ||
    s.trackingId?.toLowerCase().includes(q) ||
    s.client?.toLowerCase().includes(q) ||
    s.status?.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-msg">No shipments yet. Add one from the sidebar.</div>`;
    return;
  }

  const statusColor = {
    "Delivered":         "#22c55e",
    "Out for Delivery":  "#3b82f6",
    "Customs Clearance": "#f59e0b",
    "In Transit":        "var(--accent)",
    "Picked Up":         "var(--text2)"
  };

  list.innerHTML = filtered.map(s => `
    <div class="submission-card" onclick="openShipment('${s.id}')">
      <div class="sub-header">
        <span class="sub-name" style="font-family:var(--font-display);letter-spacing:1px;font-size:1.05rem">
          ${s.trackingId || "—"}
        </span>
        <span style="font-size:0.8rem;font-weight:700;padding:3px 12px;border-radius:50px;background:rgba(255,255,255,0.06);color:${statusColor[s.status] || "var(--text2)"}">
          ${s.status || "—"}
        </span>
      </div>
      <div class="sub-meta">
        ${s.client      ? `<span>👤 ${s.client}</span>`      : ""}
        ${s.origin      ? `<span>🛫 ${s.origin}</span>`      : ""}
        ${s.destination ? `<span>🛬 ${s.destination}</span>` : ""}
        ${s.service     ? `<span>🚚 ${s.service}</span>`     : ""}
      </div>
      <div class="sub-preview">
        📍 ${s.location || "—"} &nbsp;|&nbsp; ETA: ${fmtDate(s.eta)} &nbsp;|&nbsp; Updated: ${fmtDate(s.lastUpdate)}
      </div>
    </div>
  `).join("");
};

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
      </select>
    </div>
    <div class="form-group"><label>Origin</label><input type="text" id="smOrigin" value="${escAttr(s.origin)}"/></div>
    <div class="form-group"><label>Destination</label><input type="text" id="smDest" value="${escAttr(s.destination)}"/></div>
    <div class="form-group"><label>Weight</label><input type="text" id="smWeight" value="${escAttr(s.weight)}"/></div>
    <div class="form-group"><label>ETA</label><input type="datetime-local" id="smEta" value="${toLocalInput(s.eta)}"/></div>
  `;

  // ── 3D live-position map (MapLibre GL, no API key) ──
  document.getElementById("smMapWrap").classList.remove("hidden");
  initShipmentMap(s);

  // ── Photos ──
  const photosWrap = document.getElementById("smPhotosWrap");
  const photosGrid = document.getElementById("smPhotosGrid");
  const photos = s.photos;
  if (photos && photos.length) {
    photosGrid.innerHTML = photos.map(url => `
      <a href="${url}" target="_blank" rel="noopener" style="display:block;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);transition:border-color 0.2s"
         onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <img src="${url}" alt="Shipment photo"
             style="width:100%;height:130px;object-fit:cover;display:block"
             onerror="this.parentElement.style.display='none'"/>
      </a>
    `).join("");
    photosWrap.classList.remove("hidden");
  } else {
    photosGrid.innerHTML = "";
    photosWrap.classList.add("hidden");
  }

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

  try {
    const payload = {
      status,
      location: location || null,
      client:      client  || null,
      service:     service || null,
      origin:      origin  || null,
      destination: dest    || null,
      weight:      weight  || null,
      eta:         etaRaw ? Timestamp.fromDate(new Date(etaRaw)) : null,
      lastUpdate: serverTimestamp()
    };
    if (smCoords) {
      payload.lat = smCoords.lat;
      payload.lng = smCoords.lng;
    }
    await updateDoc(doc(db, "shipments", currentShipmentId), payload);

    // Update local state
    const s = shipments.find(x => x.id === currentShipmentId);
    if (s) {
      Object.assign(s, {
        status, location, client, service,
        origin, destination: dest, weight
      });
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

// ─── Add Shipment ─────────────────────────────────────
window.addShipment = async function () {
  const trackingId = document.getElementById("sTrackId").value.trim().toUpperCase();
  const client     = document.getElementById("sClient").value.trim();
  const status     = document.getElementById("sStatus").value;
  const statusEl   = document.getElementById("addStatus");

  if (!trackingId) {
    statusEl.className = "form-status error";
    statusEl.textContent = "⚠️ Tracking ID is required.";
    statusEl.classList.remove("hidden");
    return;
  }

  const etaRaw        = document.getElementById("sEta").value;
  const lastUpdateRaw = document.getElementById("sLastUpdate").value;

  const steps = [0,1,2,3,4].map(i =>
    document.getElementById(`step${i}`).value.trim()
  );

  const photos = [0,1,2,3]
    .map(i => document.getElementById(`photo${i}`)?.value.trim())
    .filter(Boolean);

  const badPhoto = photos.find(url => /unsplash\.com\/photos\//.test(url) && !/images\.unsplash\.com/.test(url));
  if (badPhoto) {
    statusEl.className = "form-status error";
    statusEl.textContent = `⚠️ That's an Unsplash page link, not an image link: ${badPhoto} — open the photo, right‑click it, choose "Copy image address" (should start with images.unsplash.com), then paste that instead.`;
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
    eta:         etaRaw        ? Timestamp.fromDate(new Date(etaRaw))        : null,
    lastUpdate:  lastUpdateRaw ? Timestamp.fromDate(new Date(lastUpdateRaw)) : serverTimestamp(),
    steps:       steps.some(s => s) ? steps : null,
    photos:      photos.length ? photos : null,
    createdAt:   serverTimestamp()
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
     "photo0","photo1","photo2","photo3"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    document.getElementById("sStatus").selectedIndex  = 1;
    document.getElementById("sService").selectedIndex = 0;
    resetAddMap();

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
