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


  /* ================= Markets mode (stock / crypto inspired) — EXAMPLE data ================= */
  var NS = "http://www.w3.org/2000/svg";
  var mkEl = function (tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  var money = function (v) { return "$" + Math.round(v).toLocaleString("en-US"); };

  $$("[data-mk-candles]").forEach(function (svg) {
    var n = +svg.getAttribute("data-mk-candles"), seed = +(svg.getAttribute("data-seed") || 7);
    var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    var vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
    var data = [], c = 8000;
    for (var i = 0; i < n; i++) {
      var o = c, drift = 9;
      var cl = o + drift + (rnd() - 0.5) * 80;
      var hi = Math.max(o, cl) + rnd() * 26, lo = Math.min(o, cl) - rnd() * 26;
      data.push({ o: o, c: cl, h: hi, l: lo, v: 4 + Math.round(rnd() * 14) + (cl > o ? 3 : 0) });
      c = cl;
    }
    var shift = 8420 - data[n - 1].c;
    data.forEach(function (d) { d.o += shift; d.c += shift; d.h += shift; d.l += shift; });
    if (data[n - 1].c < data[n - 1].o) { var dl = data[n - 1]; var tmp = dl.o; dl.o = dl.c - Math.abs(tmp - dl.c) * 0.6; dl.l = Math.min(dl.l, dl.o); }
    var priceH = H * 0.74, volTop = H * 0.80, pad = 8, lblW = 64;
    var plotW = W - lblW;
    var scale = function () {
      var mx = -1e9, mn = 1e9; data.forEach(function (d) { mx = Math.max(mx, d.h); mn = Math.min(mn, d.l); });
      var r = mx - mn; return { mx: mx + r * 0.06, mn: mn - r * 0.06 };
    };
    var levels = svg.hasAttribute("data-levels");
    var draw = function (animate) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var s = scale(), y = function (v) { return pad + (s.mx - v) / (s.mx - s.mn) * (priceH - pad); };
      var g = mkEl("g", { "class": "grid" }, svg);
      for (var k = 1; k < 4; k++) { var yy = priceH * k / 4; mkEl("line", { x1: 0, x2: plotW, y1: yy, y2: yy }, g); }
      var step = plotW / n, bw = Math.max(2, step * 0.62), vmax = 0;
      data.forEach(function (d) { vmax = Math.max(vmax, d.v); });
      data.forEach(function (d, i) {
        var x = i * step + step / 2, cls = d.c >= d.o ? "g" : "r", delay = animate ? (i * 0.012).toFixed(3) + "s" : "0s";
        var vh = (d.v / vmax) * (H - volTop);
        var vb2 = mkEl("rect", { x: x - bw / 2, y: H - vh, width: bw, height: vh, "class": "vol " + cls }, svg);
        mkEl("line", { x1: x, x2: x, y1: y(d.h), y2: y(d.l), "class": "wick " + cls }, svg);
        var top = y(Math.max(d.o, d.c)), bh = Math.max(1.5, Math.abs(y(d.o) - y(d.c)));
        var body = mkEl("rect", { x: x - bw / 2, y: top, width: bw, height: bh, rx: 1, "class": cls }, svg);
        if (animate && !reduce) { body.setAttribute("class", cls + " c-anim"); body.style.animationDelay = delay; vb2.setAttribute("class", "vol " + cls + " c-anim"); vb2.style.animationDelay = delay; }
      });
      [[7, "ma7"], [30, "ma30"]].forEach(function (m) {
        if (n < m[0] + 2) return;
        var dd = "";
        data.forEach(function (d, i) { if (i < m[0] - 1) return; var sum = 0; for (var j = i - m[0] + 1; j <= i; j++) sum += data[j].c; var x = i * step + step / 2; dd += (dd ? " L" : "M") + x.toFixed(1) + " " + y(sum / m[0]).toFixed(1); });
        mkEl("path", { d: dd, "class": "ma " + m[1] }, svg);
      });
      if (levels) {
        var up = s.mn + (s.mx - s.mn) * 0.86, dn = s.mn + (s.mx - s.mn) * 0.2;
        mkEl("line", { x1: 0, x2: plotW, y1: y(up), y2: y(up), "class": "lvl g" }, svg);
        mkEl("line", { x1: 0, x2: plotW, y1: y(dn), y2: y(dn), "class": "lvl r" }, svg);
        var t1 = mkEl("text", { x: plotW + 6, y: y(up) + 4, fill: "#5cf5b0" }, svg); t1.textContent = "alert ▲";
        var t2 = mkEl("text", { x: plotW + 6, y: y(dn) + 4, fill: "#ff7a85" }, svg); t2.textContent = "alert ▼";
      }
      var last = data[data.length - 1];
      mkEl("line", { x1: 0, x2: plotW, y1: y(last.c), y2: y(last.c), "class": "lastline" }, svg);
      var lb = mkEl("rect", { x: plotW + 4, y: y(last.c) - 10, width: lblW - 6, height: 20, rx: 4, fill: last.c >= last.o ? "#5cf5b0" : "#ff7a85" }, svg);
      var tx = mkEl("text", { x: plotW + 9, y: y(last.c) + 4, fill: "#04150d" }, svg); tx.textContent = money(last.c);
      if (!levels) {
        [s.mx - (s.mx - s.mn) * 0.15, s.mn + (s.mx - s.mn) * 0.2].forEach(function (v) { if (Math.abs(y(v) - y(last.c)) < 26) return; var tt = mkEl("text", { x: plotW + 9, y: y(v) + 4, fill: "#545a62" }, svg); tt.textContent = money(v); });
      }
    };
    var drawn = false;
    var go = function () { if (drawn) return; drawn = true; draw(true); };
    if ("IntersectionObserver" in window && !reduce) { var ob = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { go(); ob.disconnect(); } }); ob.observe(svg); setTimeout(go, 2500); } else go();
    var box = svg.closest(".mk-term, .mk-home-chart, .card") || document;
    var lastEl = $("[data-mk-last]", box), chgEl = $("[data-mk-chg]", box), open0 = data[0].o, dayOpen = data[data.length - 1].o;
    if (!reduce) setInterval(function () {
      if (document.hidden || !drawn) return;
      var d = data[data.length - 1];
      d.c = Math.max(d.l + 4, d.c + (Math.random() - 0.4) * 22);
      d.h = Math.max(d.h, d.c); d.l = Math.min(d.l, d.c);
      if (Math.random() < 0.3) d.v += 1;
      draw(false);
      if (lastEl) lastEl.textContent = money(d.c);
      if (chgEl) { var ch = d.c - (dayOpen - 0), pc = (ch / dayOpen) * 100; chgEl.textContent = (ch >= 0 ? "▲ " : "▼ ") + money(Math.abs(ch)) + " (" + Math.abs(pc).toFixed(1) + "%) today"; chgEl.className = ch >= 0 ? "up" : "dn"; }
    }, 1500);
  });

  /* live tape */
  var tapePool = [["b", "New sub", "Pro · mo", "1 seat", "+$49"], ["b", "Upgrade", "Starter→Pro", "1", "+$30"], ["s", "Churn", "Starter · mo", "1", "−$19"],
    ["b", "Seats added", "Team", "+3", "+$36"], ["b", "New sub", "Team · yr", "5 seats", "+$82", 1], ["s", "Downgrade", "Pro→Starter", "1", "−$30"],
    ["b", "Trial → paid", "Pro · mo", "1", "+$49"], ["b", "Usage overage", "API", "120k", "+$48"], ["s", "Seats removed", "Team", "−2", "−$24"], ["b", "Upgrade", "Pro→Team", "8 seats", "+$47", 1]];
  $$("[data-mk-tape]").forEach(function (ul) {
    var k = 0, now = new Date();
    var row = function (e, secsAgo, isNew) {
      var d = new Date(now.getTime() - secsAgo * 1000), ts = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2);
      var li = document.createElement("li"); li.className = e[0] + (e[5] ? " big" : "") + (isNew ? " new" : "");
      li.innerHTML = "<span>" + ts + "</span><span>" + (e[0] === "b" ? "BUY · " : "SELL · ") + e[1] + "</span><span>" + e[2] + "</span><span>" + e[3] + "</span><span>" + e[4] + "</span>";
      return li;
    };
    for (var i = 0; i < 9; i++) ul.appendChild(row(tapePool[(i * 3) % tapePool.length], i * 37 + 4, false));
    k = 4;
    if (!reduce) setInterval(function () { if (document.hidden) return; now = new Date(); ul.insertBefore(row(tapePool[k++ % tapePool.length], 0, true), ul.firstChild); while (ul.children.length > 12) ul.removeChild(ul.lastChild); }, 1900 + Math.random() * 600);
  });
  /* gauge bars outside .fx (index) */
  $$(".mk-home [data-fx-w]").forEach(function (el) { el.style.width = el.getAttribute("data-fx-w") + "%"; });

  /* valuation multiple range */
  var vl = $("[data-mk-vallow]");
  if (vl) {
    var ranges = [[4, 6], [3, 5], [5, 8], [4, 6]], vi = 0, ARR = 101040;
    var setV = function () {
      var r = ranges[vi % ranges.length];
      vl.textContent = "$" + (ARR * r[0] / 1e6).toFixed(2) + "M"; $("[data-mk-valhigh]").textContent = "$" + (ARR * r[1] / 1e6).toFixed(2) + "M";
      $("[data-mk-mult]").textContent = r[0].toFixed(1) + "× – " + r[1].toFixed(1) + "×";
      var f = $("[data-mk-rangefill]"); f.style.left = ((r[0] - 2) / 8 * 100) + "%"; f.style.width = ((r[1] - r[0]) / 8 * 100) + "%";
    };
    setV(); if (!reduce) setInterval(function () { if (!document.hidden) { vi++; setV(); } }, 3000);
  }

  /* portfolio map shimmer */
  var map = $("[data-mk-map]");
  if (map && !reduce) setInterval(function () {
    if (document.hidden) return;
    var tiles = $$("div", map), t = tiles[Math.floor(Math.random() * tiles.length)], em = $("em", t);
    var v = parseFloat(em.textContent.replace(/[^0-9.]/g, "")) * (t.classList.contains("r") ? -1 : 1);
    v = Math.round((v + (Math.random() - 0.5) * 0.6) * 10) / 10;
    em.textContent = (v >= 0 ? "▲ " : "▼ ") + Math.abs(v).toFixed(1) + "%";
    t.classList.toggle("g", v >= 0); t.classList.toggle("r", v < 0);
    t.classList.remove("pulse"); void t.offsetWidth; t.classList.add("pulse");
  }, 1400);

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

  /* backtest scenarios */
  var bp = $("[data-mk-price]");
  if (bp) {
    var sc = [["$54", 25, "+5% to +8%", "+0.2 pts", "−3%", "M0 190 C80 182 140 168 200 156 S320 132 380 116 S500 90 600 78", "M0 190 C80 180 140 164 200 150 S320 124 380 106 S500 78 600 66 L600 90 C500 100 440 112 380 124 S280 144 200 160 S80 186 0 190Z"],
              ["$59", 50, "+11% to +16%", "+0.4 pts", "−6%", "M0 190 C80 180 140 165 200 150 S320 126 380 106 S500 78 600 64", "M0 190 C80 178 140 160 200 146 S320 116 380 98 S500 66 600 50 L600 78 C500 90 440 104 380 114 S280 140 200 154 S80 184 0 190Z"],
              ["$69", 100, "+4% to +19%", "+1.1 pts", "−14%", "M0 190 C80 182 140 170 200 158 S320 136 380 118 S500 92 600 74", "M0 190 C80 176 140 156 200 140 S320 108 380 88 S500 52 600 36 L600 104 C500 112 440 124 380 134 S280 152 200 164 S80 188 0 190Z"]];
    var bi = 1;
    var setB = function () {
      var x = sc[bi]; bp.textContent = x[0]; $("[data-mk-slfill]").style.width = x[1] + "%"; $("[data-mk-slknob]").style.left = x[1] + "%";
      $("[data-mk-res1]").textContent = x[2]; $("[data-mk-res2]").textContent = x[3]; $("[data-mk-res3]").textContent = x[4];
      $("[data-mk-btline]").setAttribute("d", x[5]); $("[data-mk-btband]").setAttribute("d", x[6]);
    };
    setB(); if (!reduce) setInterval(function () { if (!document.hidden) { bi = (bi + 1) % sc.length; setB(); } }, 3200);
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
