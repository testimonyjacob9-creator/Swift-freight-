// Swift Air Cargo – live chat widget. Automated assistant until the visitor asks for a human;
// then messages go to the admin portal in real time and WhatsApp can be opened with a prefilled message.
import { db } from "./fb.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, query, orderBy, onSnapshot,
  getDocs, where, limit, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid = () => { const a = new Uint8Array(10); crypto.getRandomValues(a); return Array.from(a, b => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join(""); };

export function initChat(S, waLink) {
  let chatId = null, mode = "bot", unsub = null, awaiting = null, chatDocReady = false, seen = new Set(), open = false, firstLoad = true;
  try { chatId = localStorage.getItem("sf_chat_id"); } catch (e) {}

  const btn = document.createElement("button");
  btn.id = "sfChatBtn"; btn.setAttribute("aria-label", "Open live chat"); btn.innerHTML = '💬<span class="dot"></span>';
  const box = document.createElement("div");
  box.id = "sfChat"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Live chat");
  box.innerHTML = `
    <div class="sfc-head"><span style="font-size:1.4rem">✈️</span><div><strong>${esc(S.brand || "Swift Air Cargo")}</strong><small id="sfcSub">Virtual assistant · replies instantly</small></div><button class="sfc-x" aria-label="Close">✕</button></div>
    <div class="sfc-body" id="sfcBody"></div>
    <form class="sfc-foot" id="sfcForm"><input id="sfcInput" placeholder="Type a message…" autocomplete="off" maxlength="500"/><button type="submit" aria-label="Send">➤</button></form>`;
  document.body.append(btn, box);
  const body = box.querySelector("#sfcBody"), input = box.querySelector("#sfcInput"), sub = box.querySelector("#sfcSub");

  const scroll = () => { body.scrollTop = body.scrollHeight; };
  function bubble(from, text, quick) {
    const d = document.createElement("div");
    d.className = "sfc-msg " + from;
    d.innerHTML = (from === "admin" ? "<small>Support agent</small>" : "") + esc(text);
    body.appendChild(d);
    if (quick && quick.length) {
      const q = document.createElement("div"); q.className = "sfc-quick";
      quick.forEach(o => {
        if (o.href) { const a = document.createElement("a"); a.href = o.href; a.target = "_blank"; a.rel = "noopener"; a.className = o.cls || ""; a.textContent = o.label; q.appendChild(a); }
        else { const b = document.createElement("button"); b.type = "button"; b.textContent = o.label; b.onclick = () => { q.remove(); userSay(o.send || o.label); }; q.appendChild(b); }
      });
      body.appendChild(q);
    }
    scroll();
  }

  // ── Firestore plumbing ──
  async function ensureChat() {
    if (!chatId) { chatId = rid(); try { localStorage.setItem("sf_chat_id", chatId); } catch (e) {} }
    if (chatDocReady) return;
    const ref = doc(db, "chats", chatId);
    const snap = await getDoc(ref).catch(() => null);
    if (!snap || !snap.exists()) {
      await setDoc(ref, { mode: "bot", status: "open", needsHuman: false, unreadAdmin: 0, name: "", lang: document.documentElement.lang || "en",
        page: location.pathname, createdAt: serverTimestamp(), lastAt: serverTimestamp(), lastMessage: "" });
    } else { mode = snap.data().mode || "bot"; }
    chatDocReady = true;
  }
  async function store(from, text) {
    try {
      await ensureChat();
      await addDoc(collection(db, "chats", chatId, "messages"), { from, text, at: serverTimestamp() });
      const patch = { lastMessage: text.slice(0, 120), lastAt: serverTimestamp(), status: "open" };
      if (from === "visitor") patch.unreadAdmin = increment(1);
      await updateDoc(doc(db, "chats", chatId), patch);
    } catch (e) { console.warn("chat store failed", e); }
  }
  function listen() {
    if (unsub || !chatId) return;
    unsub = onSnapshot(query(collection(db, "chats", chatId, "messages"), orderBy("at", "asc")), snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== "added") return;
        const m = ch.doc.data(), id = ch.doc.id;
        if (seen.has(id)) return; seen.add(id);
        if (m.from === "admin") {
          bubble("admin", m.text);
          if (!open && !firstLoad) btn.classList.add("has-new");
        }
      });
      firstLoad = false;
    }, () => {});
    onSnapshot(doc(db, "chats", chatId), s => {
      if (!s.exists()) return;
      mode = s.data().mode || "bot";
      sub.textContent = mode === "human" ? "Live agent · replies here" : "Virtual assistant · replies instantly";
    }, () => {});
  }

  // Restore previous conversation
  async function restore() {
    if (!chatId) return false;
    try {
      const snap = await getDocs(query(collection(db, "chats", chatId, "messages"), orderBy("at", "asc"), limit(80)));
      if (snap.empty) return false;
      snap.docs.forEach(d => { const m = d.data(); seen.add(d.id); bubble(m.from, m.text); });
      return true;
    } catch (e) { return false; }
  }

  // ── Bot brain ──
  const MENU = [
    { label: "📦 Track a shipment", send: "Track a shipment" },
    { label: "💰 Get a quote", send: "Get a quote" },
    { label: "✈️ Our services", send: "Our services" },
    { label: "🕐 Offices & hours", send: "Offices and hours" },
    { label: "👤 Talk to a human", send: "Talk to a human" }
  ];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function botSay(text, quick, ms = 500) {
    const t = document.createElement("div"); t.className = "sfc-typing"; t.textContent = "typing…"; body.appendChild(t); scroll();
    await wait(ms); t.remove(); bubble("bot", text, quick); store("bot", text);
  }
  async function handoff() {
    mode = "human";
    await ensureChat();
    await updateDoc(doc(db, "chats", chatId), { mode: "human", needsHuman: true, lastAt: serverTimestamp() }).catch(() => {});
    listen();
    sub.textContent = "Live agent · replies here";
    const wa = waLink(S.waMessage, `(Live chat ref: ${chatId.slice(0, 6).toUpperCase()})`);
    awaiting = "name";
    await botSay("Connecting you to a live agent now 🙌 Our team has been notified and will reply right here in this chat.\n\nPrefer WhatsApp? Tap below and a prefilled message will open.", [{ label: "💬 Continue on WhatsApp", href: wa, cls: "wa" }], 600);
    await botSay("While you wait — what's your name?");
  }
  async function trackLookup(id) {
    try {
      const snap = await getDocs(query(collection(db, "shipments"), where("trackingId", "==", id), limit(1)));
      if (snap.empty) return botSay(`I couldn't find a shipment with tracking number ${id}. Please check it (12 letters/numbers) or talk to a human.`, [{ label: "👤 Talk to a human", send: "Talk to a human" }]);
      const s = snap.docs[0].data();
      const eta = s.eta && s.eta.toDate ? s.eta.toDate().toLocaleDateString() : "—";
      const url = new URL("track.html?id=" + id, location.href).href;
      return botSay(`📦 ${id}\nStatus: ${s.status || "—"}\nLocation: ${s.location || "—"}\nFrom ${s.origin || "—"} → ${s.destination || "—"}\nETA: ${eta}`, [{ label: "🗺 Open live tracking", href: url }, { label: "👤 Talk to a human", send: "Talk to a human" }]);
    } catch (e) { return botSay("I couldn't look that up right now. Please try the Track page or talk to a human.", MENU); }
  }
  async function respond(text) {
    const t = text.toLowerCase();
    const idm = text.toUpperCase().match(/\b[A-Z0-9]{12}\b/);
    if (awaiting === "track") { awaiting = null; const m2 = text.replace(/\s+/g, "").toUpperCase(); if (/^[A-Z0-9]{12}$/.test(m2)) return trackLookup(m2); return botSay("That doesn't look like a 12-character tracking number (letters and numbers, e.g. 7K2M9QX4B8TD). Try again?", [{ label: "📦 Track a shipment", send: "Track a shipment" }, { label: "👤 Talk to a human", send: "Talk to a human" }]); }
    if (/human|agent|person|representative|real someone|support|operator|speak to|talk to/.test(t)) return handoff();
    if (idm) return trackLookup(idm[0]);
    if (/track|where is|status|parcel|package|order/.test(t)) { awaiting = "track"; return botSay("Sure! Please type your 12-character tracking number (letters and numbers)."); }
    if (/quote|price|cost|rate|how much|charge/.test(t)) return botSay("Pricing depends on weight, route and service (air, sea or road). Send us the details through the quote form and we'll reply fast — or talk to a person right now.", [{ label: "📝 Open quote form", href: "contact.html" }, { label: "👤 Talk to a human", send: "Talk to a human" }]);
    if (/service|air|sea|road|cold|warehouse|custom|freight|offer/.test(t)) return botSay("We offer ✈️ Air Freight, 🚢 Sea Freight, 🚚 Road Haulage, 🏭 Warehousing, 🧊 Cold Chain and 📋 Customs Brokerage, with live tracking on every shipment.", [{ label: "See services", href: "index.html#services" }, { label: "💰 Get a quote", send: "Get a quote" }]);
    if (/office|address|location|hour|open|contact|phone|email|call/.test(t)) {
      const offs = (S.offices || []).map(o => `📍 ${o.name ? o.name + ": " : ""}${o.address}`).join("\n");
      return botSay(`${offs}\n📞 ${S.phone}\n📧 ${S.email}\n🕐 ${S.hours || "24/7"}`, [{ label: "💬 WhatsApp us", href: waLink(), cls: "wa" }, { label: "👤 Talk to a human", send: "Talk to a human" }]);
    }
    if (/insur|damage|lost/.test(t)) return botSay("Every shipment is covered by cargo insurance. For a claim or a specific issue, a person can help you best.", [{ label: "👤 Talk to a human", send: "Talk to a human" }]);
    if (/^(hi|hello|hey|good|salam|hola|bonjour)/.test(t)) return botSay("Hello! 👋 What can I help you with?", MENU);
    return botSay("I'm not sure I understood — here's what I can do. Or I can connect you with a person.", MENU);
  }

  async function userSay(text) {
    text = text.trim(); if (!text) return;
    bubble("visitor", text);
    await store("visitor", text);
    listen();
    if (mode === "human") {
      if (awaiting === "name") { awaiting = null; updateDoc(doc(db, "chats", chatId), { name: text.slice(0, 60) }).catch(() => {}); botSay(`Thanks, ${text.slice(0, 40)}! An agent will be with you shortly. You can keep typing here.`, null, 400); }
      return;
    }
    respond(text);
  }

  box.querySelector("#sfcForm").addEventListener("submit", e => { e.preventDefault(); const v = input.value; input.value = ""; userSay(v); });
  box.querySelector(".sfc-x").onclick = () => toggle(false);
  btn.onclick = () => toggle(!open);

  let started = false;
  async function toggle(v) {
    open = v; box.classList.toggle("open", v);
    if (v) {
      btn.classList.remove("has-new");
      if (!started) {
        started = true;
        const had = await restore();
        if (had) { listen(); } else { bubble("bot", S.chatGreeting || "Hi 👋 How can I help?", MENU); }
      }
      setTimeout(() => input.focus(), 150); scroll();
    }
  }
  // Resume listening in the background if there is an active human chat
  if (chatId) getDoc(doc(db, "chats", chatId)).then(s => { if (s.exists() && s.data().mode === "human") { mode = "human"; listen(); } }).catch(() => {});
}
