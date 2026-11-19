/* Glimify — features hub filter + feature-page preview animations.
   No sample/demo data: previews animate layout only; figures stay empty (—). Vanilla JS, no deps. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fmt = function (n) { return Math.round(n).toLocaleString("en-US"); };
  var visible = function () { return !document.hidden; };

  /* ---------- Hub filter ---------- */
  var q = $("[data-fx-filter]");
  if (q) {
    var count = $("[data-fx-filtercount]"), empty = $("[data-fx-empty]");
    q.addEventListener("input", function () {
      var v = q.value.trim().toLowerCase(), shown = 0;
      $$(".fgroup").forEach(function (g) {
        var any = 0;
        $$(".fcard", g).forEach(function (c) {
          var ok = !v || c.textContent.toLowerCase().indexOf(v) > -1;
          c.hidden = !ok; if (ok) { any++; shown++; c.classList.add("in"); }
        });
        $$(".ffill", g).forEach(function (f) { f.hidden = !!v; });
        g.hidden = !any;
      });
      if (count) count.textContent = shown + (shown === 1 ? " feature" : " features");
      if (empty) empty.hidden = shown > 0;
    });
  }


  /* ================= Markets previews — layout only, no sample data ================= */
  var NS = "http://www.w3.org/2000/svg";
  var mkEl = function (tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  $$("[data-mk-candles]").forEach(function (svg) {
    var vb = svg.viewBox.baseVal, W = vb.width || 900, H = vb.height || 300;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var g = mkEl("g", { "class": "grid" }, svg);
    for (var k = 1; k < 4; k++) { var yy = H * 0.74 * k / 4; mkEl("line", { x1: 0, x2: W, y1: yy, y2: yy }, g); }
    var t = mkEl("text", { x: W / 2, y: H * 0.42, fill: "#545a62", "text-anchor": "middle", "font-size": 15 }, svg);
    t.textContent = "Your real MRR candles appear here";
  });
  /* gauge bars outside .fx (index) */
  $$(".mk-home [data-fx-w]").forEach(function (el) { el.style.width = el.getAttribute("data-fx-w") + "%"; });

  /* signals toast */
  var toast = $("[data-mk-toast]"), fired = $("[data-mk-fired]");
  if (toast && !reduce) setInterval(function () {
    if (document.hidden) return;
    toast.classList.add("hide");
    setTimeout(function () { toast.classList.remove("hide"); if (fired) { fired.classList.remove("blink"); void fired.offsetWidth; fired.classList.add("blink"); } }, 900);
  }, 5200);

  /* crypto: generated QR-like pattern + confirmation steps */
  var qr = $("[data-mk-qr]");
  if (qr) {
    var s2 = 3, r2 = function () { s2 = (s2 * 9301 + 49297) % 233280; return s2 / 233280; }, h2 = "";
    for (var yq = 0; yq < 13; yq++) for (var xq = 0; xq < 13; xq++) {
      var fin = function (a, b) { return (a < 3 && b < 3) || (a < 3 && b > 9) || (a > 9 && b < 3); };
      var on = fin(xq, yq) ? !(xq % 12 === 1 || yq % 12 === 1) || (xq === 1 && yq === 1) || (xq === 11 && yq === 1) || (xq === 1 && yq === 11) : r2() > 0.5;
      h2 += on ? "<i></i>" : "<b></b>";
    }
    qr.innerHTML = h2;
    var conf = $$("[data-mk-conf] li"), cs = 0;
    var setC = function () { conf.forEach(function (li, i) { li.classList.toggle("on", i <= cs); }); };
    setC(); if (!reduce) setInterval(function () { if (!document.hidden) { cs = (cs + 1) % conf.length; setC(); } }, 1600); else { cs = 2; setC(); }
  }

  /* ---------- Feature page mocks ---------- */
  var win = $(".fpage .window") || null;
  var fx = $(".fx");
  if (!fx) return;

  var started = false;
  var start = function () {
    if (started) return; started = true;
    $$("[data-fx-w]", fx).forEach(function (el) { el.style.width = el.getAttribute("data-fx-w") + "%"; });
    $$(".f-bar span[data-w]", fx).forEach(function (el) { el.style.width = el.getAttribute("data-w") + "%"; });
    run();
  };
  if (win) {
    if (win.classList.contains("in") || reduce || !("IntersectionObserver" in window)) start();
    else new MutationObserver(function () { if (win.classList.contains("in")) start(); }).observe(win, { attributes: true, attributeFilter: ["class"] });
    setTimeout(start, 1800); // safety
  } else start();

  function every(ms, fn) { if (!reduce) setInterval(function () { if (visible()) fn(); }, ms); }

  function run() {
    /* cohort heatmap: empty grid (no sample retention figures) */
    var co = $("[data-fx-cohort]", fx);
    if (co) {
      var h = '<span></span>';
      for (var m = 0; m < 8; m++) h += '<span style="justify-content:center">M' + m + "</span>";
      for (var r = 0; r < 8; r++) {
        h += "<span>Cohort " + (r + 1) + "</span>";
        for (var c = 0; c < 8; c++) h += c >= 8 - r ? '<i class="na"></i>' : '<i style="--a:.06" class="lt">—</i>';
      }
      co.innerHTML = h;
    }

    /* advisor typing */
    var ty = $("[data-fx-type]", fx);
    if (ty) {
      var txt = ty.getAttribute("data-fx-type"), steps = $$("[data-fx-step]", fx);
      var reveal = function () { steps.forEach(function (s, i) { setTimeout(function () { s.classList.add("show"); $$("[data-fx-w]", s).forEach(function (el) { el.style.width = "0"; setTimeout(function () { el.style.width = el.getAttribute("data-fx-w") + "%"; }, 80); }); }, 500 + i * 900); }); };
      if (reduce) { ty.textContent = txt; reveal(); }
      else { var i = 0; (function typeIt() { ty.textContent = txt.slice(0, ++i); if (i < txt.length) setTimeout(typeIt, 38); else reveal(); })(); }
    }

    /* checkout trial-model toggle */
    var tg = $("[data-fx-toggle]", fx);
    if (tg) {
      var modes = {
        nocard: ["Start 14-day free trial", "No card needed. We'll remind you 3 days before the trial ends.", "Due today", "—", false],
        card: ["Start trial · card on file", "You won't be charged until your 14-day trial ends. Cancel anytime.", "Due when the trial ends", "—", true],
        paid: ["Subscribe", "Billed monthly. Prorated if you add seats later.", "Due today", "—", true]
      };
      var setMode = function (k) {
        $$("span", tg).forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-mode") === k); });
        var m = modes[k];
        $("[data-fx-cta]", fx).textContent = m[0]; $("[data-fx-note]", fx).textContent = m[1];
        $("[data-fx-duelabel]", fx).textContent = m[2]; $("[data-fx-due]", fx).textContent = m[3];
        $("[data-fx-cardfields]", fx).classList.toggle("show", m[4]);
      };
      var order = ["nocard", "card", "paid"], oi = 0, userSet = false;
      $$("span", tg).forEach(function (s) { s.style.cursor = "pointer"; s.addEventListener("click", function () { userSet = true; setMode(s.getAttribute("data-mode")); }); });
      fx.removeAttribute("aria-hidden");
      every(3200, function () { if (!userSet) setMode(order[++oi % 3]); });
    }

    /* dunning steps */
    var st = $$("[data-fx-steps] li", fx);
    if (st.length) {
      var si = 0;
      var stepOn = function () { st.forEach(function (li, i) { li.classList.toggle("on", i <= si); }); };
      if (reduce) { si = st.length - 1; stepOn(); }
      else { stepOn(); setInterval(function () { if (!visible()) return; si = (si + 1) % (st.length + 1); if (si === st.length) return; stepOn(); }, 1300); }
    }

    /* currency */
    var cur = $("[data-fx-cur]", fx);
    if (cur) {
      var rows = [["$ —", "—", "Sales tax", "calculated at checkout"], ["€ —", "—", "VAT", "calculated at checkout"], ["£ —", "—", "VAT", "calculated at checkout"], ["¥ —", "—", "Consumption tax", "calculated at checkout"]];
      var ci = 0, pb = $("[data-fx-curprice]", fx);
      var setCur = function (i) {
        ci = i; $$("span", cur).forEach(function (s, k) { s.classList.toggle("on", k === i); });
        pb.classList.add("swap");
        setTimeout(function () { var r = rows[i]; pb.textContent = r[0]; $("[data-fx-cursub]", fx).textContent = r[1]; $("[data-fx-taxlbl]", fx).textContent = r[2]; $("[data-fx-tax]", fx).textContent = r[3]; pb.classList.remove("swap"); }, 220);
      };
      every(2400, function () { setCur((ci + 1) % rows.length); });
    }

    /* churn reasons → offers */
    var rs = $$("[data-fx-reasons] span", fx);
    if (rs.length) {
      var offers = [["A discount you choose", "Stay on your current plan at a lower price while you decide."],
                    ["Get early access to what's next", "Tell us what's missing — we'll show you our roadmap and keep your data safe."],
                    ["Pause your subscription", "Keep your data and settings. Billing resumes when you're back."],
                    ["Switch to a smaller plan", "Keep the essentials for less. Upgrade again anytime."]];
      var ri = 2, of = $("[data-fx-offer]", fx);
      var setR = function (i) {
        rs.forEach(function (s, k) { s.classList.toggle("on", k === i); });
        of.classList.add("swap");
        setTimeout(function () { $("[data-fx-offertitle]", fx).textContent = offers[i][0]; $("[data-fx-offerbody]", fx).textContent = offers[i][1]; of.classList.remove("swap"); }, 250);
      };
      setR(ri); every(2800, function () { setR(ri = (ri + 1) % 4); });
    }

    /* feature flag flip */
    var ff = $("[data-fx-flip]", fx);
    if (ff) every(2200, function () { ff.classList.toggle("on"); });

    /* checkout seats wobble */
    var seats = $("[data-fx-seats]", fx);
    if (seats && !tg) {}
  }
})();
