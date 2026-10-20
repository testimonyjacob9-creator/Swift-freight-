// =====================================================
// SWIFTFREIGHT – MAIN.JS
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

  // ── Scroll reveal ──
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity   = "1";
        entry.target.style.transform = "translateY(0)";
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll(".service-card, .why-card, .info-card").forEach(el => {
    el.style.opacity    = "0";
    el.style.transform  = "translateY(20px)";
    el.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    observer.observe(el);
  });

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

  const id = input.value.trim().toUpperCase();

  if (!id) {
    if (result) {
      result.className  = "track-result error";
      result.textContent = "⚠️ Please enter a tracking ID.";
      result.classList.remove("hidden");
    }
    return;
  }

  window.location.href = `track.html?id=${encodeURIComponent(id)}`;
};
