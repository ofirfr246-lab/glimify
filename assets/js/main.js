/* Glimify marketing site — vanilla JS, no dependencies. */
(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.add("js");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CFG = window.GLIMIFY_CONFIG || {};

  /* ---------- Nav ---------- */
  var nav = document.querySelector(".nav");
  if (nav) {
    var onScroll = function () { nav.classList.toggle("scrolled", window.scrollY > 8); };
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    var mb = nav.querySelector(".menu-btn");
    if (mb) {
      mb.addEventListener("click", function () {
        var open = nav.classList.toggle("open");
        mb.setAttribute("aria-expanded", open ? "true" : "false");
        document.body.style.overflow = open ? "hidden" : "";
      });
      nav.querySelectorAll(".mobile-menu a").forEach(function (a) {
        a.addEventListener("click", function () { nav.classList.remove("open"); mb.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; });
      });
    }
  }

  /* ---------- Reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal, .window, [data-animate]");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Live preview: real Glimify site traffic (aggregates only, no sample data) ---------- */
  var fmt = function (n) { return Number(n || 0).toLocaleString("en-US"); };

  // Funnel bars (widths come from markup; previews carry no sample figures)
  var funnelSet = function () {
    document.querySelectorAll(".f-bar span[data-w]").forEach(function (s) { s.style.width = s.getAttribute("data-w") + "%"; });
  };
  var win = document.querySelector(".window");
  if (win) {
    if (reduce) funnelSet();
    else new MutationObserver(function () { if (win.classList.contains("in")) funnelSet(); }).observe(win, { attributes: true, attributeFilter: ["class"] });
    if (win.classList.contains("in")) funnelSet();
  }

  var chart = document.getElementById("pulse-chart");
  var W = 800, H = 210;
  var drawPulse = function (series) {
    if (!chart) return;
    var line = chart.querySelector(".line"), area = chart.querySelector(".area");
    if (!line || !area) return;
    if (!series || !series.length) series = [0, 0];
    var max = Math.max(4, Math.max.apply(null, series) * 1.25), n = series.length;
    var pts = series.map(function (v, i) { return [i * (W / (n - 1)), H - 6 - (v / max) * (H - 16)]; });
    var d = "M" + pts[0][0] + "," + pts[0][1];
    for (var j = 1; j < pts.length; j++) {
      var p0 = pts[j - 1], p1 = pts[j], cx = (p0[0] + p1[0]) / 2;
      d += " C" + cx + "," + p0[1] + " " + cx + "," + p1[1] + " " + p1[0] + "," + p1[1];
    }
    line.setAttribute("d", d);
    area.setAttribute("d", d + " L" + W + "," + H + " L0," + H + " Z");
    var last = pts[pts.length - 1], head = chart.querySelector(".head"), halo = chart.querySelector(".halo");
    if (head) { head.setAttribute("cx", last[0]); head.setAttribute("cy", last[1]); }
    if (halo) { halo.setAttribute("cx", last[0]); halo.setAttribute("cy", last[1]); }
  };
  drawPulse(null);

  var ago = function (iso) {
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 60 ? "just now" : Math.round(s / 60) + "m ago";
  };
  var esc = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var VIEW_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="#b5bac1" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var render = function (p) {
    var now = document.querySelector("[data-live]"), today = document.querySelector("[data-today]"), views = document.querySelector("[data-views]");
    if (now) now.textContent = fmt(p.visitors_now);
    document.querySelectorAll("[data-live-mirror]").forEach(function (el) { el.textContent = fmt(p.visitors_now); });
    if (today) today.textContent = fmt(p.visitors_24h);
    if (views) views.textContent = fmt(p.pageviews_24h) + " page views · glimify site";
    drawPulse(p.pulse_60m);
    var feed = document.querySelector("[data-live-feed]");
    if (feed && p.recent && p.recent.length) {
      feed.innerHTML = p.recent.map(function (r) {
        var path = String(r.path || "/").replace(/^\/glimify/, "") || "/";
        return '<li><span class="ic">' + VIEW_IC + '</span><span class="t">Page view<small>' + esc(path) + " · " + ago(r.at) + '</small></span><span class="a dim">live</span></li>';
      }).join("");
    }
  };
  var pulseUrl = CFG.SUPABASE_URL && CFG.SUPABASE_PUBLISHABLE_KEY ? CFG.SUPABASE_URL + "/rest/v1/rpc/glimify_site_pulse" : null;
  var fetchPulse = function () {
    if (!pulseUrl || document.hidden) return;
    fetch(pulseUrl, { method: "POST", headers: { apikey: CFG.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + CFG.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" }, body: "{}" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) { if (p) render(p); })
      .catch(function () {});
  };
  if (pulseUrl && document.querySelector("[data-live-feed]")) {
    fetchPulse();
    setInterval(fetchPulse, 20000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) fetchPulse(); });
  }

  /* ---------- Waitlist ---------- */
  var form = document.getElementById("waitlist-form");
  if (form) {
    var wrap = form.closest(".waitlist");
    var err = form.querySelector(".wl-error");
    var successTitle = wrap.querySelector("[data-success-title]");
    var successBody = wrap.querySelector("[data-success-body]");
    var btn = form.querySelector("button[type=submit]");
    var showErr = function (m) { err.textContent = m; err.classList.add("show"); };
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      err.classList.remove("show");
      if (form.querySelector(".hp input").value) return; // bot trap
      var email = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showErr("Please enter a valid email address."); form.email.focus(); return; }
      var payload = {
        email: email.toLowerCase(),
        product_url: (form.product_url && form.product_url.value ? form.product_url.value.trim() : "") || null,
        stage: (form.stage && form.stage.value) || null,
        source: "glimify-site"
      };
      var done = function (title, body) {
        if (title) successTitle.textContent = title;
        if (body) successBody.textContent = body;
        wrap.classList.add("done");
      };
      if (!CFG.WAITLIST_ENDPOINT) {
        // No backend configured: nothing is sent or stored anywhere.
        done("Thanks — the waitlist opens soon.",
             "We're still wiring up sign-ups, so your email wasn't saved yet. Check back in a few days — we'd love to have you.");
        return;
      }
      btn.disabled = true; btn.firstChild.textContent = "Joining… ";
      var headers = Object.assign({ "Content-Type": "application/json" }, CFG.WAITLIST_HEADERS || {});
      fetch(CFG.WAITLIST_ENDPOINT, { method: "POST", headers: headers, body: JSON.stringify(payload) })
        .then(function (r) {
          if (r.status === 409) {
            done("You're already on the list.", "We'll email you when early access opens. No spam — just launch news.");
            return;
          }
          if (r.ok) {
            done("You're on the list.", "We'll email you when early access opens. No spam — just launch news.");
            return;
          }
          throw new Error("HTTP " + r.status);
        })
        .catch(function () { showErr("Something went wrong. Please try again in a moment."); })
        .finally(function () { btn.disabled = false; btn.firstChild.textContent = "Join the waitlist "; });
    });
  }
})();
