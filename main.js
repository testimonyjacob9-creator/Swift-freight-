// =====================================================
// SWIFT AIR CARGO – MAIN.JS
// Shared nav/scroll behavior across all pages.
// Actual shipment lookup + rendering lives in track.js
// =====================================================

// ─── DOM READY ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  // ── Navbar scroll effect ──
  const navbar = document.getElementById("navbar");
  if (navbar) {
    window.addEventListener("scroll", () =>
      navbar.classList.toggle("scrolled", window.scrollY > 50)
    );
  }

  // ── Hamburger menu ──
  const hamburger = document.getElementById("hamburger");
  const navLinks  = document.getElementById("navLinks");
  if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => navLinks.classList.toggle("open"));
    navLinks.querySelectorAll("a").forEach(link =>
      link.addEventListener("click", () => navLinks.classList.remove("open"))
    );
  }

  // ── Scroll reveal (class-based, respects reduced motion) ──
  const reveals = document.querySelectorAll(".reveal");
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  reveals.forEach((el, i) => {
    el.style.setProperty("--d", ((i % 3) * 0.08) + "s");
    io.observe(el);
  });

  // ── Animated stat counters ──
  const counters = document.querySelectorAll("[data-count]");
  const cio = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target; cio.unobserve(el);
      const end = parseFloat(el.dataset.count), suffix = el.dataset.suffix || "";
      const dec = (el.dataset.count.split(".")[1] || "").length;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const t0 = performance.now(), dur = 1400;
      (function tick(now) {
        const p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
        el.textContent = (end * e).toFixed(dec) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }, { threshold: 0.6 });
  counters.forEach(el => cio.observe(el));

  // ── Smooth scroll for anchor links ──
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function (e) {
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // ── Allow Enter key in tracking input ──
  const trackInput = document.getElementById("trackInput");
  if (trackInput) {
    trackInput.addEventListener("keydown", e => {
      if (e.key === "Enter") window.trackShipment();
    });
  }
});

// ─── TRACKING (redirects to the full tracking page) ──
window.trackShipment = function () {
  const input  = document.getElementById("trackInput");
  const result = document.getElementById("trackResult");
  if (!input) return;

  const id = input.value.replace(/\s+/g, "").toUpperCase();

  if (!id) {
    if (result) {
      result.className  = "track-result error";
      result.textContent = (window.sfT && window.sfT("track_empty")) || "⚠️ Please enter your tracking number.";
      result.classList.remove("hidden");
    }
    return;
  }

  window.location.href = `track.html?id=${encodeURIComponent(id)}`;
};
