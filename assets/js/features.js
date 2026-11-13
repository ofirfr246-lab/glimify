/* Glimify — features hub filter + feature-page mock animations.
   Every number below is EXAMPLE data for a fictional SaaS. Vanilla JS, no deps. */
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

  /* ---------- Feature page mocks ---------- */
  var win = $(".fpage .window") || null;
  var fx = $(".fx");
  if (!fx) return;

  var started = false;
  var start = function () {
    if (started) return; started = true;
    $$("[data-fx-w]", fx).forEach(function (el) { el.style.width = el.getAttribute("data-fx-w") + "%"; });
    $$(".f-bar span[data-w]", fx).forEach(function (el) { el.style.width = el.getAttribute("data-w") + "%"; });
    $$("[data-fx-count]", fx).forEach(function (el) {
      var to = +el.getAttribute("data-fx-count");
      if (reduce) { el.textContent = fmt(to); return; }
      var t0 = performance.now();
      (function step(t) { var k = Math.min(1, (t - t0) / 1400); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0);
    });
    run();
  };
  if (win) {
    if (win.classList.contains("in") || reduce || !("IntersectionObserver" in window)) start();
    else new MutationObserver(function () { if (win.classList.contains("in")) start(); }).observe(win, { attributes: true, attributeFilter: ["class"] });
    setTimeout(start, 1800); // safety
  } else start();

  function every(ms, fn) { if (!reduce) setInterval(function () { if (visible()) fn(); }, ms); }

  function run() {
    /* tickers: data-fx-tick="min,max,step" */
    $$("[data-fx-tick]", fx).forEach(function (el) {
      var a = el.getAttribute("data-fx-tick").split(",").map(Number), pre = el.getAttribute("data-prefix") || "";
      var v = parseFloat(el.textContent.replace(/[^0-9.]/g, ""));
      every(1600 + Math.random() * 900, function () {
        v = Math.max(a[0], Math.min(a[1], v + Math.round((Math.random() - 0.45) * 2) * a[2]));
        el.textContent = pre + fmt(v);
      });
    });

    /* cohort heatmap */
    var co = $("[data-fx-cohort]", fx);
    if (co) {
      var months = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"], h = '<span></span>';
      for (var m = 0; m < 8; m++) h += '<span style="justify-content:center">M' + m + "</span>";
      months.forEach(function (mo, r) {
        h += "<span>" + mo + " cohort</span>";
        for (var c = 0; c < 8; c++) {
          if (c >= 8 - r) { h += '<i class="na"></i>'; continue; }
          var val = c === 0 ? 100 : Math.round(100 * Math.pow(0.9 + r * 0.004, c) + (c > 3 ? r : 0));
          val = Math.min(val, 100);
          var a = (0.08 + (val / 100) * 0.85).toFixed(2);
          h += '<i style="--a:' + a + ";transition-delay:" + ((r + c) * 0.035).toFixed(2) + 's" class="' + (val < 72 ? "lt" : "") + '">' + val + "</i>";
        }
      });
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
        nocard: ["Start 14-day free trial", "No card needed. We'll remind you 3 days before the trial ends.", "Due today", "$0.00", false],
        card: ["Start trial · card on file", "You won't be charged until your 14-day trial ends. Cancel anytime.", "Due on day 15", "$42.00", true],
        paid: ["Subscribe · $42.00 today", "Billed monthly. Prorated if you add seats later.", "Due today", "$42.00", true]
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

    /* usage meter */
    var mv = $("[data-fx-meter]", fx), mb = $("[data-fx-meterbar]", fx), eps = $("[data-fx-eps]", fx);
    if (mv) {
      var used = 812400;
      every(900, function () {
        var e = 110 + Math.round(Math.random() * 70); if (eps) eps.textContent = e;
        used += e * 9; if (used > 968000) used = 790000;
        mv.textContent = fmt(used); mb.style.width = (used / 10000).toFixed(1) + "%";
      });
    }

    /* currency */
    var cur = $("[data-fx-cur]", fx);
    if (cur) {
      var rows = [["$49", "$49.00", "Sales tax (by state)", "calculated at checkout"], ["€46", "€46.00", "VAT 19%", "€8.74"], ["£39", "£39.00", "VAT 20%", "£7.80"], ["¥7,400", "¥7,400", "Consumption tax 10%", "¥740"], ["A$75", "A$75.00", "GST 10%", "A$7.50"]];
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
      var offers = [["30% off for the next 3 months", "Stay on your current plan at a lower price while you decide."],
                    ["Get early access to what's next", "Tell us what's missing — we'll show you our roadmap and keep your data safe."],
                    ["Pause for up to 2 months", "Keep your data and settings. Billing resumes when you're back."],
                    ["Switch to Starter instead", "Keep the essentials for $19/month. Upgrade again anytime."]];
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

    /* webhook log */
    var log = $("[data-fx-log]", fx);
    if (log) {
      var evs = [["ok", "invoice.paid", "INV-0245 · $120.00"], ["ok", "customer.updated", "cus_77dd · tax ID added"], ["ok", "usage.threshold", "cus_8f2k · 80% of plan"], ["ok", "subscription.upgraded", "Starter → Pro"], ["retry", "invoice.payment_failed", "INV-0231 · retry 1"], ["ok", "trial.converted", "cus_31na · Team"]];
      var li = 0;
      every(2600, function () {
        var e = evs[li++ % evs.length], el = document.createElement("li"); el.className = "new";
        el.innerHTML = '<span class="' + e[0] + '">' + (e[0] === "ok" ? "200" : "retry") + '</span><span class="mono">' + e[1] + "</span><small>" + e[2] + "</small><em>just now</em>";
        log.insertBefore(el, log.firstChild);
        $$("em", log).forEach(function (m, i) { if (i) m.textContent = (i * 2) + "m ago"; });
        while (log.children.length > 4) log.removeChild(log.lastChild);
      });
    }

    /* checkout seats wobble */
    var seats = $("[data-fx-seats]", fx);
    if (seats && !tg) {}
  }
})();
