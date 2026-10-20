// Swift Air Cargo – theme (light/dark) + small UX helpers. Loaded in <head>.
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var saved = null;
  try { saved = localStorage.getItem("sf_theme"); } catch (e) {}
  var prefersDark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
  function apply(t) {
    root.setAttribute("data-theme", t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", t === "light" ? "#f6f7fb" : "#080809");
  }
  apply(saved || (prefersDark ? "dark" : "light"));
  window.sfToggleTheme = function () { var n = root.getAttribute("data-theme") === "light" ? "dark" : "light"; apply(n); try { localStorage.setItem("sf_theme", n); } catch (e) {} };

  document.addEventListener("DOMContentLoaded", function () {
    var host = document.querySelector(".nav-right");
    if (host && !document.getElementById("themeToggle")) {
      var b = document.createElement("button");
      b.id = "themeToggle"; b.className = "theme-toggle"; b.type = "button";
      b.setAttribute("aria-label", "Toggle light / dark mode");
      function paint() { b.textContent = root.getAttribute("data-theme") === "light" ? "🌙" : "☀️"; }
      b.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
        apply(next); paint();
        try { localStorage.setItem("sf_theme", next); } catch (e) {}
      });
      paint();
      host.insertBefore(b, host.firstChild);
    }
    // Footer year
    document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  });

  // Hide third-party "Powered by Netlify" badge if the host injects it
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType === 1 && /powered by netlify/i.test(n.textContent || "") && n.parentNode === document.body && !n.closest("main,section,nav,footer")) {
          n.style.display = "none";
        }
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
