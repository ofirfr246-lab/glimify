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

  /* ---------- Dashboard preview (all EXAMPLE data) ---------- */
  var fmt = function (n) { return n.toLocaleString("en-US"); };

  // Funnel bars
  var funnelSet = function () {
    document.querySelectorAll(".f-bar span[data-w]").forEach(function (s) { s.style.width = s.getAttribute("data-w") + "%"; });
  };
  var win = document.querySelector(".window");
  if (win) {
    if (reduce) funnelSet();
    else new MutationObserver(function () { if (win.classList.contains("in")) funnelSet(); }).observe(win, { attributes: true, attributeFilter: ["class"] });
    if (win.classList.contains("in")) funnelSet();
  }

  // Pulse chart
  var chart = document.getElementById("pulse-chart");
  var series = [];
  var N = 48;
  var seed = 7;
  var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  var base = 38;
  for (var i = 0; i < N; i++) {
    base += (rnd() - 0.48) * 6; base = Math.max(18, Math.min(62, base));
    series.push(base + (i % 11 === 6 ? 14 : 0));
  }
  var W = 800, H = 210;
  var draw = function () {
    if (!chart) return;
    var max = 80, min = 0;
    var pts = series.map(function (v, i) { return [i * (W / (N - 1)), H - ((v - min) / (max - min)) * H]; });
    var d = "M" + pts[0][0] + "," + pts[0][1];
    for (var j = 1; j < pts.length; j++) {
      var p0 = pts[j - 1], p1 = pts[j], cx = (p0[0] + p1[0]) / 2;
      d += " C" + cx + "," + p0[1] + " " + cx + "," + p1[1] + " " + p1[0] + "," + p1[1];
    }
    chart.querySelector(".line").setAttribute("d", d);
    chart.querySelector(".area").setAttribute("d", d + " L" + W + "," + H + " L0," + H + " Z");
    var last = pts[pts.length - 1];
    var head = chart.querySelector(".head"), halo = chart.querySelector(".halo");
    head.setAttribute("cx", last[0]); head.setAttribute("cy", last[1]);
    halo.setAttribute("cx", last[0]); halo.setAttribute("cy", last[1]);
  };
  draw();

  // Live counter
  var liveEl = document.querySelector("[data-live]");
  var live = liveEl ? parseInt(liveEl.textContent, 10) : 42;
  var todayEl = document.querySelector("[data-today]");
  var today = todayEl ? parseInt(todayEl.textContent.replace(/,/g, ""), 10) : 1284;
  document.querySelectorAll("[data-live-mirror]").forEach(function (el) { el.textContent = live; });

  // Event feed
  var feed = document.querySelector(".feed");
  var icons = {
    trial: '<svg viewBox="0 0 24 24" fill="none" stroke="#8fb8ff" stroke-width="2" stroke-linecap="round"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/></svg>',
    paid: '<svg viewBox="0 0 24 24" fill="none" stroke="#5cf5b0" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="#5cf5b0" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    churn: '<svg viewBox="0 0 24 24" fill="none" stroke="#ff7a85" stroke-width="2" stroke-linecap="round"><path d="M17 7 7 17M16 17H7V8"/></svg>',
    view: '<svg viewBox="0 0 24 24" fill="none" stroke="#b5bac1" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
  var pool = [
    ["paid", "New subscription", "Pro · monthly", "+$49", ""],
    ["view", "Viewing pricing", "Visitor from search", "live", "dim"],
    ["trial", "Trial started", "Team · 14 days", "trial", "dim"],
    ["up", "Upgrade", "Starter → Pro", "+$30", ""],
    ["paid", "Renewal", "Team · yearly", "+$990", ""],
    ["view", "Checkout opened", "Pro · yearly", "live", "dim"],
    ["churn", "Cancellation", "Starter · monthly", "−$19", "neg"],
    ["paid", "Trial converted", "Pro · monthly", "+$49", ""]
  ];
  var pi = 0;
  var pushFeed = function () {
    if (!feed) return;
    var e = pool[pi++ % pool.length];
    var li = document.createElement("li"); li.className = "new";
    li.innerHTML = '<span class="ic">' + icons[e[0]] + '</span><span class="t">' + e[1] + "<small>" + e[2] + ' · just now</small></span><span class="a ' + e[4] + '">' + e[3] + "</span>";
    feed.insertBefore(li, feed.firstChild);
    var items = feed.querySelectorAll("li");
    items.forEach(function (it, idx) {
      var sm = it.querySelector("small");
      if (idx > 0 && sm) sm.textContent = sm.textContent.replace(/just now|\d+m ago/, (idx * 2) + "m ago");
    });
    while (feed.children.length > 4) feed.removeChild(feed.lastChild);
  };

  if (!reduce && chart) {
    var visible = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(chart);
    }
    setInterval(function () {
      if (!visible || document.hidden) return;
      var last = series[series.length - 1];
      var next = last + (Math.random() - 0.5) * 9;
      if (Math.random() < 0.12) next += 12;
      next = Math.max(20, Math.min(66, next));
      series.shift(); series.push(next); draw();
      live = Math.max(28, Math.min(64, live + Math.round((Math.random() - 0.5) * 4)));
      if (liveEl) liveEl.textContent = live;
      document.querySelectorAll("[data-live-mirror]").forEach(function (el) { el.textContent = live; });
      if (Math.random() < 0.6) { today += 1 + Math.floor(Math.random() * 3); if (todayEl) todayEl.textContent = fmt(today); }
    }, 1400);
    setInterval(function () { if (visible && !document.hidden) pushFeed(); }, 3800);
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
