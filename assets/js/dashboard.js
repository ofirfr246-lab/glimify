/* Glimify private live dashboard — real MarketScope data only.
   Auth: Supabase Auth (Google or email/password, same accounts as MarketScope).
   Data: RPC public.glimify_dashboard_stats() — runs server-side and only answers for
   accounts in public.glimify_admins. No secret keys here. Nothing on this page is invented:
   every number comes from that RPC; missing data shows as 0 / "No data yet". */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

var CFG = window.GLIMIFY_CONFIG || {};
var REFRESH_MS = 60000;
var supabase = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: "glimify-dashboard-auth" }
});

var $ = function (id) { return document.getElementById(id); };
var state = { data: null, range: "30d", metric: "lead_total", route: "home", email: "", lastOk: 0, timer: null };
try { var sr = localStorage.getItem("glimify-dash-range"); if (/^(today|7d|30d)$/.test(sr)) state.range = sr; } catch (e) {}

var METRICS = [
  { k: "visitors", label: "Sessions", title: "Sessions over time", route: "visitors" },
  { k: "pageviews", label: "Page views", title: "Page views over time", route: "visitors" },
  { k: "lead_total", label: "Leads", title: "Leads over time (new accounts + form leads)", route: "leads" },
  { k: "waitlist", label: "Waitlist joins", title: "Waitlist joins over time", route: "waitlist" },
  { k: "reports", label: "Reports run", title: "Reports over time", route: "reports" }
];
var MBY = {}; METRICS.concat([
  { k: "signups", label: "New accounts", title: "New accounts over time", route: "customers" },
  { k: "leads", label: "Form leads", title: "Form leads over time", route: "leads" }
]).forEach(function (m) { MBY[m.k] = m; });
var ROUTES = ["home", "analytics", "visitors", "customers", "leads", "waitlist", "reports", "settings"];
var TITLES = { home: "Home", analytics: "Analytics", visitors: "Visitors", customers: "Customers", leads: "Leads", waitlist: "Waitlist", reports: "Reports", settings: "Settings" };

/* ---------- utils ---------- */
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
var nf = new Intl.NumberFormat("en-US");
function num(n) { return nf.format(Number(n) || 0); }
function sum(a) { return a.reduce(function (s, v) { return s + (Number(v) || 0); }, 0); }
var TZ = "Asia/Jerusalem";
function fmtDate(ts, withTime) {
  if (!ts) return "—";
  var o = { timeZone: TZ, day: "numeric", month: "short" };
  if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; o.hour12 = false; }
  return new Date(ts).toLocaleString("en-GB", o);
}
function dayLabel(d) { var p = String(d).split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }); }
function ago(ts) {
  if (!ts) return "—";
  var s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago"; return Math.floor(s / 86400) + " d ago";
}
function entries(obj) { return Object.keys(obj || {}).map(function (k) { return [k, Number(obj[k]) || 0]; }).sort(function (a, b) { return b[1] - a[1]; }); }

/* ---------- range math (all from returned daily/hourly series) ---------- */
function curHourIndex(d) { var h = parseInt(String(d.local_now || "").slice(11, 13), 10); return isNaN(h) ? 23 : h; }
function series(k) {
  var d = state.data || {}, daily = d.daily || [], hourly = d.hourly || [];
  if (state.range === "today") {
    var hi = curHourIndex(d);
    var y = hourly.slice(0, 24), t = hourly.slice(24, 48);
    return {
      cur: t.slice(0, hi + 1).map(function (x) { return x[k] || 0; }),
      prev: y.map(function (x) { return x[k] || 0; }),
      prevSame: sum(y.slice(0, hi + 1).map(function (x) { return x[k] || 0; })),
      labels: t.map(function (x) { return String(x.hour).slice(11, 16); }),
      n: 24, curLabel: "Today", prevLabel: "Yesterday"
    };
  }
  var n = state.range === "7d" ? 7 : 30;
  var c = daily.slice(-n), p = daily.slice(-2 * n, -n);
  return {
    cur: c.map(function (x) { return x[k] || 0; }),
    prev: p.map(function (x) { return x[k] || 0; }),
    prevSame: sum(p.map(function (x) { return x[k] || 0; })),
    labels: c.map(function (x) { return dayLabel(x.day); }),
    n: n, curLabel: n === 7 ? "Last 7 days" : "Last 30 days", prevLabel: "Previous " + n + " days"
  };
}
function compareText() {
  if (state.range === "today") return "Compared to yesterday (same hours)";
  return "Compared to the previous " + (state.range === "7d" ? "7" : "30") + " days";
}
function change(cur, prev) {
  if (!cur && !prev) return { cls: "", html: "0%" };
  if (!prev) return { cls: "up", html: arrow(true) + "new" };
  var p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return { cls: "", html: "0%" };
  return { cls: p > 0 ? "up" : "down", html: arrow(p > 0) + Math.abs(p) + "%" };
}
function arrow(up) { return up ? '<svg viewBox="0 0 12 12"><path d="M6 2.5 10 8H2z"/></svg>' : '<svg viewBox="0 0 12 12"><path d="M6 9.5 2 4h8z"/></svg>'; }

/* ---------- charts ---------- */
var CHARTS = {}, chartSeq = 0;
function niceMax(m) {
  if (m <= 4) return 4;
  var pow = Math.pow(10, Math.floor(Math.log10(m))), f = m / pow;
  var nf_ = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf_ * pow;
}
function pathFor(vals, n, top, W, H) {
  if (!vals.length) return "";
  var step = n > 1 ? W / (n - 1) : 0;
  return vals.map(function (v, i) { return (i ? "L" : "M") + (i * step).toFixed(2) + " " + (H - (v / top) * H).toFixed(2); }).join(" ");
}
function lineChart(s, opts) {
  opts = opts || {};
  var H = opts.h || 220, W = 1000, id = "c" + (++chartSeq);
  var top = niceMax(Math.max.apply(null, s.cur.concat(s.prev, [0])));
  var cur = pathFor(s.cur, s.n, top, W, H), prev = pathFor(s.prev, s.n, top, W, H);
  var area = cur ? cur + " L" + ((s.cur.length - 1) * (W / Math.max(1, s.n - 1))).toFixed(2) + " " + H + " L0 " + H + " Z" : "";
  CHARTS[id] = { s: s, label: opts.label || "", n: s.n };
  var g = "";
  [0, .25, .5, .75, 1].forEach(function (f) { g += '<line class="gl" x1="0" x2="' + W + '" y1="' + (H * f) + '" y2="' + (H * f) + '"/>'; });
  var ys = [1, .5, 0].map(function (f) { return '<span style="top:' + ((1 - f) * 100) + '%">' + num(Math.round(top * f * 10) / 10) + "</span>"; }).join("");
  var xi = s.n <= 7 ? range(s.n) : s.n === 24 ? [0, 6, 12, 18, 23] : [0, 7, 14, 21, s.n - 1];
  var xs = xi.map(function (i) { return '<span style="left:' + (s.n > 1 ? (i / (s.n - 1)) * 100 : 0) + '%">' + esc(s.labels[i] || "") + "</span>"; }).join("");
  var empty = !sum(s.cur) && !sum(s.prev) ? '<div class="lc-note">' + esc(opts.emptyText || "No data in this period yet") + "</div>" : "";
  return '<div class="lc" data-chart="' + id + '"><div class="lc-y">' + ys + '</div>' +
    '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" style="height:' + H + 'px" role="img" aria-label="' + esc(opts.label || "chart") + '">' +
    '<defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>' +
    g + (prev ? '<path class="prev" d="' + prev + '"/>' : "") + (area ? '<path class="area" d="' + area + '"/>' : "") + (cur ? '<path class="cur" d="' + cur + '"/>' : "") +
    '<line class="hov" x1="-10" x2="-10" y1="0" y2="' + H + '" style="display:none"/></svg>' + empty +
    '<div class="lc-x">' + xs + "</div></div>";
}
function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
function spark(s) {
  var W = 100, H = 28, top = Math.max(1, Math.max.apply(null, s.cur.concat(s.prev, [0])));
  return '<svg viewBox="0 -2 ' + W + " " + (H + 4) + '" preserveAspectRatio="none"><path class="sp-prev" d="' + pathFor(s.prev, s.n, top, W, H) + '"/><path d="' + pathFor(s.cur, s.n, top, W, H) + '"/></svg>';
}
function bindCharts(root) {
  Array.prototype.forEach.call(root.querySelectorAll(".lc[data-chart]"), function (el) {
    var c = CHARTS[el.getAttribute("data-chart")]; if (!c) return;
    var svg = el.querySelector("svg"), hov = el.querySelector(".hov"), tip = $("tip");
    function move(ev) {
      var r = svg.getBoundingClientRect(), x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      var i = Math.round((x / r.width) * (c.n - 1)); i = Math.max(0, Math.min(c.n - 1, i));
      var hx = (c.n > 1 ? i / (c.n - 1) : 0) * 1000;
      hov.setAttribute("x1", hx); hov.setAttribute("x2", hx); hov.style.display = "";
      var cv = c.s.cur[i], pv = c.s.prev[i];
      var prevLbl = state.range === "today" ? "Yesterday " + (c.s.labels[i] || "") : c.s.prevLabel;
      tip.innerHTML = '<div class="t-row t-cur"><span>' + esc(c.s.labels[i] || "") + "</span><b>" + (cv == null ? "—" : num(cv)) + "</b></div>" +
        '<div class="t-row t-prev"><span>' + esc(state.range === "today" ? prevLbl : "Prev. period") + "</span><b>" + (pv == null ? "—" : num(pv)) + "</b></div>";
      tip.hidden = false;
      var tx = r.left + (hx / 1000) * r.width + 14, ty = r.top + 10;
      if (tx + 170 > window.innerWidth) tx = r.left + (hx / 1000) * r.width - 180;
      tip.style.left = tx + "px"; tip.style.top = ty + "px";
    }
    function out() { hov.style.display = "none"; tip.hidden = true; }
    svg.addEventListener("mousemove", move); svg.addEventListener("touchstart", move, { passive: true });
    svg.addEventListener("touchmove", move, { passive: true }); svg.addEventListener("mouseleave", out); svg.addEventListener("touchend", out);
  });
}

/* ---------- building blocks ---------- */
function metricStrip() {
  return '<div class="metrics m' + METRICS.length + '" role="tablist">' + METRICS.map(function (m) {
    var s = series(m.k), total = sum(s.cur), ch = change(total, s.prevSame);
    return '<button class="metric' + (state.metric === m.k ? " on" : "") + '" data-metric="' + m.k + '" role="tab" aria-selected="' + (state.metric === m.k) + '">' +
      '<span class="m-label">' + esc(m.label) + '</span><div class="m-row"><span class="m-val">' + num(total) + '</span><span class="chg ' + ch.cls + '">' + ch.html + "</span></div>" +
      '<div class="spark">' + spark(s) + "</div></button>";
  }).join("") + "</div>";
}
function chartCard(k, opts) {
  opts = opts || {};
  var m = MBY[k], s = series(k), total = sum(s.cur), ch = change(total, s.prevSame);
  var emptyText = k === "visitors" || k === "pageviews" ? trackingEmpty() : "No " + m.label.toLowerCase() + " in this period yet";
  return '<div class="card' + (opts.cls ? " " + opts.cls : "") + '"><div class="chart-top"><div><h2>' + esc(m.title) + '</h2><div class="chart-total"><b>' + num(total) + '</b><span class="chg ' + ch.cls + '">' + ch.html + "</span></div></div>" +
    '<div class="legend"><span><i></i>' + esc(s.curLabel) + '</span><span><i class="prev"></i>' + esc(s.prevLabel) + "</span>" + (opts.link ? '<a href="#' + m.route + '" class="muted">View →</a>' : "") + "</div></div>" +
    lineChart(s, { h: opts.h || 220, label: m.title, emptyText: emptyText }) + "</div>";
}
function trackingEmpty() {
  var v = (state.data || {}).visitors || {};
  return v.tracking_since ? "No visits in this period" : "Visitor tracking just started — visits will appear here";
}
function barList(pairs, empty, fmtLabel) {
  if (!pairs.length || !sum(pairs.map(function (p) { return p[1]; }))) return '<p class="empty">' + esc(empty) + "</p>";
  var max = Math.max.apply(null, pairs.map(function (p) { return p[1]; }));
  var tot = sum(pairs.map(function (p) { return p[1]; }));
  return '<div class="bars">' + pairs.map(function (p) {
    return '<div class="bar-row"><span class="lbl">' + esc(fmtLabel ? fmtLabel(p[0]) : p[0]) + '</span><span class="val">' + num(p[1]) + ' <span class="muted" style="font-weight:400">· ' + Math.round((p[1] / tot) * 100) + '%</span></span><div class="bar-track"><div class="bar-fill" style="width:' + (max ? (p[1] / max) * 100 : 0) + '%"></div></div></div>';
  }).join("") + "</div>";
}
function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
function card(title, body, extra) { return '<div class="card' + (extra && extra.cls ? " " + extra.cls : "") + '"><div class="card-h"><h2>' + esc(title) + "</h2>" + (extra && extra.link ? '<a href="#' + extra.link + '">View all</a>' : extra && extra.sub ? '<span class="sub">' + esc(extra.sub) + "</span>" : "") + "</div>" + body + "</div>"; }
function table(rows, heads, cells, empty, limit) {
  rows = rows || [];
  if (!rows.length) return '<p class="empty">' + esc(empty) + "</p>";
  if (limit) rows = rows.slice(0, limit);
  return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + heads.map(function (h) { return "<th" + (h.charAt(0) === "#" ? ' class="num"' : "") + ">" + esc(h.replace(/^#/, "")) + "</th>"; }).join("") + "</tr></thead><tbody>" +
    rows.map(function (x) { return "<tr>" + cells(x).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
}
function badge(text, ok) { return '<span class="badge' + (ok ? " ok" : "") + '">' + esc(text) + "</span>"; }
function signupCells(x) {
  var active = x.last_sign_in_at && Date.now() - new Date(x.last_sign_in_at).getTime() < 7 * 864e5;
  var plan = x.plan || "none";
  return ['<td class="em">' + esc(x.email || "—") + "</td>", "<td>" + '<span class="badge plain' + (plan !== "free" && plan !== "none" ? " ok" : "") + '">' + esc(cap(plan)) + "</span></td>",
    "<td>" + esc(cap(x.provider || "—")) + "</td>", '<td title="' + esc(fmtDate(x.created_at, true)) + '">' + esc(fmtDate(x.created_at, true)) + "</td>", "<td>" + badge(active ? "Active" : "Inactive", active) + "</td>"];
}
var SIGNUP_HEADS = ["Customer", "Plan", "Sign-in", "Joined", "Status"];
function leadCells(x) { return ['<td class="em">' + esc(x.email || "—") + "</td>", "<td>" + (x.source ? badge(x.source) : "—") + "</td>", "<td>" + esc(x.page || "—") + "</td>", "<td>" + esc(fmtDate(x.created_at, true)) + "</td>"]; }
function waitCells(x) { return ['<td class="em">' + esc(x.email || "—") + "</td>", "<td>" + (x.stage ? badge(x.stage) : "—") + "</td>", "<td>" + esc(x.source || "—") + "</td>", "<td>" + esc(fmtDate(x.created_at, true)) + "</td>"]; }
function reportCells(x) { return ["<td>" + esc(x.product || "—") + "</td>", "<td>" + esc(x.market || "—") + "</td>", "<td>" + esc(x.verdict || "—") + "</td>", "<td>" + (x.status ? badge(x.status, x.status === "done" || x.status === "complete" || x.status === "completed") : "—") + "</td>", "<td>" + esc(fmtDate(x.created_at, true)) + "</td>"]; }
function usageList(d) {
  var e = d.engagement || {}, b = d.billing || {};
  return '<div class="kv">' + [["Watchlist items", e.watchlist], ["Portfolio positions", e.portfolio], ["Tracked stores", e.tracked_stores], ["Stripe fulfillments", b.fulfillments], ["Stripe live events", b.live_events]]
    .map(function (r) { return "<div><span>" + esc(r[0]) + "</span><b>" + num(r[1]) + "</b></div>"; }).join("") + "</div>";
}
function stat(label, val, sub) { return '<div class="card stat"><span class="m-label">' + esc(label) + '</span><div class="m-row"><span class="m-val">' + val + "</span></div>" + (sub ? '<div class="s-sub">' + sub + "</div>" : "") + "</div>"; }
function rangeStat(label, k) { var s = series(k), t = sum(s.cur), ch = change(t, s.prevSame); return stat(label, num(t), '<span class="chg ' + ch.cls + '">' + ch.html + "</span> " + esc(s.curLabel.toLowerCase())); }
function head(title, sub) { return '<div class="page-head"><div><h1>' + esc(title) + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + "</div></div>"; }
function liveBanner(d) {
  var v = d.visitors || {};
  if (v.tracking_since) {
    return '<div class="card live-banner"><span class="big"><span class="dot"></span>' + num(v.right_now) + " visitor" + (Number(v.right_now) === 1 ? "" : "s") + ' right now</span><span class="muted">Active sessions in the last 5 minutes · ' + num(v.visitors_24h) + " sessions in 24h · tracking since " + esc(fmtDate(v.tracking_since)) + "</span></div>";
  }
  return '<div class="card live-banner"><span class="live-pill"><span class="dot"></span>Live</span><span class="muted">Connected to MarketScope. Visitor tracking is installed and will show real visits as they happen — no visits recorded yet.</span></div>';
}

/* ---------- views ---------- */
var VIEWS = {
  home: function (d) {
    var u = d.users || {};
    return head("Home", "Real MarketScope data · " + esc(compareText().toLowerCase())) +
      '<div class="stack">' + liveBanner(d) + metricStrip() + chartCard(state.metric, { h: 260, link: true }) +
      '<div class="grid g2">' +
      card("Top plans", barList(entries(u.plans).map(function (p) { return [cap(p[0]), p[1]]; }), "No customer profiles yet"), { sub: num(u.total) + " customers" }) +
      card("Sign-in methods", barList(entries(u.providers).map(function (p) { return [cap(p[0]), p[1]]; }), "No customers yet")) +
      card("Recent leads · new accounts", table(d.recent_signups, SIGNUP_HEADS, signupCells, "No new accounts yet", 6), { cls: "span2", link: "customers" }) +
      card("Recent leads · forms", table(d.recent_leads, ["Lead", "Source", "Page", "Date"], leadCells, "No form leads yet", 5), { link: "leads" }) +
      card("Waitlist", table(d.recent_waitlist, ["Email", "Stage", "Source", "Date"], waitCells, "No one on the Glimify waitlist yet", 5), { link: "waitlist" }) +
      card("Top pages · 30 days", barList(((d.visitors || {}).top_pages_30d || []).map(function (p) { return [p.site + " " + p.path, p.views]; }), trackingEmpty())) +
      card("Product usage", usageList(d)) +
      "</div></div>";
  },
  analytics: function (d) {
    var u = d.users || {};
    return head("Analytics", "One chart per metric · " + esc(compareText().toLowerCase())) +
      '<div class="grid g2">' + METRICS.map(function (m) { return chartCard(m.k, { h: 170, link: true }); }).join("") +
      cumulativeCard(d) +
      card("Customers by plan", barList(entries(u.plans).map(function (p) { return [cap(p[0]), p[1]]; }), "No customer profiles yet")) +
      "</div>";
  },
  visitors: function (d) {
    var v = d.visitors || {};
    return head("Visitors", v.tracking_since ? "Tracking since " + esc(fmtDate(v.tracking_since, true)) + " · anonymous, no IPs or personal data" : "Tracking just started · anonymous, no IPs or personal data") +
      '<div class="stack"><div class="stat-row">' +
      stat("Visitors right now", num(v.right_now), "sessions in the last 5 min") + rangeStat("Sessions", "visitors") + rangeStat("Page views", "pageviews") + stat("All-time page views", num(v.pageviews_total), "since tracking began") +
      "</div>" + chartCard("visitors") + chartCard("pageviews") + '<div class="grid g3">' +
      card("Top pages · 30 days", barList((v.top_pages_30d || []).map(function (p) { return [p.site + " " + p.path, p.views]; }), trackingEmpty())) +
      card("Top referrers · 30 days", barList((v.top_referrers_30d || []).map(function (p) { return [p.referrer, p.views]; }), trackingEmpty())) +
      card("By site · 30 days", barList(entries(v.by_site_30d).map(function (p) { return [cap(p[0]), p[1]]; }), trackingEmpty())) +
      "</div></div>";
  },
  customers: function (d) {
    var u = d.users || {};
    return head("Customers", "MarketScope accounts · emails masked") +
      '<div class="stack"><div class="stat-row">' + stat("Total customers", num(u.total), "all time") + rangeStat("New customers", "signups") +
      stat("Active · 7 days", num(u.active_7d), "signed in recently") + stat("Paid", num(u.paid), num(u.total ? Math.round((u.paid / u.total) * 100) : 0) + "% of customers") + "</div>" +
      '<div class="grid g2">' + chartCard("signups", { h: 200 }) + cumulativeCard(d) + "</div>" +
      card("All recent customers", table(d.recent_signups, SIGNUP_HEADS, signupCells, "No customers yet"), { sub: "latest 25" }) + "</div>";
  },
  leads: function (d) {
    var l = d.leads || {};
    return head("Leads", "New MarketScope accounts + contact / lead form submissions") +
      '<div class="stack"><div class="stat-row">' + stat("Total leads", num((Number(l.total) || 0) + (Number((d.users || {}).total) || 0)), num(l.total) + " form · " + num((d.users || {}).total) + " accounts") + rangeStat("New leads", "lead_total") + stat("Last 24 hours", num(l.last_24h)) + stat("Last 7 days", num(l.last_7d)) + "</div>" +
      chartCard("lead_total", { h: 220 }) + '<div class="grid g2">' + chartCard("leads", { h: 200 }) + card("Leads by source", barList(entries(l.by_source), "No leads yet")) + "</div>" +
      card("Recent form leads", table(d.recent_leads, ["Lead", "Source", "Page", "Date"], leadCells, "No form leads yet"), { sub: "latest 25" }) +
      card("Recent new accounts", table(d.recent_signups, SIGNUP_HEADS, signupCells, "No new accounts yet"), { sub: "latest 25" }) + "</div>";
  },
  waitlist: function (d) {
    var w = d.waitlist || {};
    return head("Waitlist", "Glimify early-access waitlist") +
      '<div class="stack"><div class="stat-row">' + stat("On the waitlist", num(w.total), "all time") + rangeStat("New joins", "waitlist") + stat("Last 24 hours", num(w.last_24h)) + stat("Last 7 days", num(w.last_7d)) + "</div>" +
      '<div class="grid g2">' + chartCard("waitlist", { h: 200 }) + card("By stage", barList(entries(w.by_stage).map(function (p) { return [cap(p[0]), p[1]]; }), "No one on the waitlist yet")) + "</div>" +
      card("Recent joins", table(d.recent_waitlist, ["Email", "Stage", "Source", "Date"], waitCells, "No one on the waitlist yet"), { sub: "latest 25" }) + "</div>";
  },
  reports: function (d) {
    var r = d.reports || {};
    return head("Reports", "MarketScope market reports (examples excluded)") +
      '<div class="stack"><div class="stat-row">' + stat("Total reports", num(r.total), "all time") + rangeStat("Reports run", "reports") + stat("Last 7 days", num(r.last_7d)) + stat("Watchlist items", num((d.engagement || {}).watchlist)) + "</div>" +
      '<div class="grid g2">' + chartCard("reports", { h: 200 }) + card("By status", barList(entries(r.by_status).map(function (p) { return [cap(p[0]), p[1]]; }), "No reports yet")) + "</div>" +
      card("Recent reports", table(d.recent_reports, ["Product", "Market", "Verdict", "Status", "Date"], reportCells, "No reports yet"), { sub: "latest 25" }) +
      card("Product usage", usageList(d)) + "</div>";
  },
  settings: function (d) {
    var v = d.visitors || {};
    var theme = document.documentElement.getAttribute("data-theme") || "dark";
    return head("Settings") + '<div class="grid g2">' +
      card("Account", '<div class="kv"><div><span>Signed in as</span><b>' + esc(state.email || "—") + '</b></div><div><span>Access</span><b>Admin</b></div></div><p class="note"><button class="btn" id="btn-logout3">Log out</button></p>') +
      card("Appearance", '<div class="kv"><div><span>Theme</span><b>' + (theme === "light" ? "Light" : "Dark") + '</b></div></div><p class="note"><button class="btn" id="btn-theme2">Switch to ' + (theme === "light" ? "dark" : "light") + "</button></p>") +
      card("Data", '<div class="kv"><div><span>Source</span><b>MarketScope · Supabase</b></div><div><span>Auto-refresh</span><b>Every 60 seconds</b></div><div><span>Time zone</span><b>' + esc(d.timezone || TZ) + '</b></div><div><span>Last updated</span><b>' + esc(fmtDate(d.generated_at, true)) + "</b></div></div>") +
      card("Visitor tracking", '<div class="kv"><div><span>Status</span><b>' + (v.tracking_since ? "Recording" : "Installed · no visits yet") + '</b></div><div><span>Tracking since</span><b>' + esc(v.tracking_since ? fmtDate(v.tracking_since, true) : "—") + '</b></div><div><span>Page views stored</span><b>' + num(v.pageviews_total) + '</b></div></div><p class="note">Anonymous: page path, referring site and a random session id only. No IPs, cookies or personal data. Do Not Track is respected.</p>') +
      "</div>";
  }
};
function cumulativeCard(d) {
  var u = d.users || {}, daily = d.daily || [];
  var base = Number(u.before_window) || 0, run = base, cum = daily.map(function (x) { run += Number(x.signups) || 0; return run; });
  var n = state.range === "30d" ? 30 : state.range === "7d" ? 7 : 7;
  var s = { cur: cum.slice(-n), prev: cum.slice(-2 * n, -n), labels: daily.slice(-n).map(function (x) { return dayLabel(x.day); }), n: n, curLabel: n === 7 ? "Last 7 days" : "Last 30 days", prevLabel: "Previous " + n + " days" };
  s.prevSame = s.prev.length ? s.prev[s.prev.length - 1] : 0;
  var last = s.cur.length ? s.cur[s.cur.length - 1] : 0;
  return '<div class="card"><div class="chart-top"><div><h2>Total customers over time</h2><div class="chart-total"><b>' + num(last) + '</b><span class="muted" style="font-size:12px">' + (state.range === "today" ? "daily · last 7 days" : "cumulative") + "</span></div></div>" +
    '<div class="legend"><span><i></i>' + esc(s.curLabel) + '</span><span><i class="prev"></i>' + esc(s.prevLabel) + "</span></div></div>" + lineChart(s, { h: 170, label: "Total customers", emptyText: "No customers yet" }) + "</div>";
}

/* ---------- render ---------- */
function render() {
  var d = state.data; if (!d) return;
  CHARTS = {};
  var html = (VIEWS[state.route] || VIEWS.home)(d);
  var c = $("content"); c.innerHTML = html; bindCharts(c);
  Array.prototype.forEach.call(document.querySelectorAll("#sb-nav a"), function (a) { a.classList.toggle("on", a.getAttribute("data-route") === state.route); });
  Array.prototype.forEach.call(document.querySelectorAll("#range button"), function (b) { b.classList.toggle("on", b.getAttribute("data-r") === state.range); });
  $("compare-label").textContent = compareText();
  document.title = TITLES[state.route] + " · Glimify dashboard";
  var t3 = $("btn-logout3"); if (t3) t3.addEventListener("click", logout);
  var th2 = $("btn-theme2"); if (th2) th2.addEventListener("click", toggleTheme);
}
$("content").addEventListener("click", function (e) {
  var m = e.target.closest("[data-metric]");
  if (m) { state.metric = m.getAttribute("data-metric"); render(); }
});
$("range").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-r]"); if (!b) return;
  state.range = b.getAttribute("data-r"); try { localStorage.setItem("glimify-dash-range", state.range); } catch (x) {}
  render();
});
function route() {
  var r = (location.hash || "#home").slice(1);
  state.route = ROUTES.indexOf(r) >= 0 ? r : "home";
  $("view-dash").classList.remove("nav-open");
  $("acct-menu").hidden = true;
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
$("btn-menu").addEventListener("click", function () { $("view-dash").classList.toggle("nav-open"); });
$("sb-overlay").addEventListener("click", function () { $("view-dash").classList.remove("nav-open"); });
$("btn-acct").addEventListener("click", function (e) { e.stopPropagation(); var m = $("acct-menu"); m.hidden = !m.hidden; $("btn-acct").setAttribute("aria-expanded", String(!m.hidden)); });
document.addEventListener("click", function (e) { if (!e.target.closest(".acct")) $("acct-menu").hidden = true; });
function toggleTheme() {
  var t = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("glimify-dash-theme", t); } catch (e) {}
  render();
}
$("btn-theme").addEventListener("click", toggleTheme);

/* ---------- auth ---------- */
var VIEW_IDS = ["view-loading", "view-login", "view-denied", "view-dash"];
function show(id) { VIEW_IDS.forEach(function (v) { $(v).hidden = v !== id; }); }
function authError(err) {
  var m = (err && (err.message || err.error_description)) || "Sign-in failed. Try again.";
  if (/invalid login|invalid credentials/i.test(m)) return "Email or password is incorrect.";
  if (/email not confirmed/i.test(m)) return "Confirm your email first (check your inbox).";
  return m;
}
$("btn-google").addEventListener("click", async function () {
  $("login-err").textContent = "";
  var res = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  if (res.error) $("login-err").textContent = authError(res.error);
});
$("form-login").addEventListener("submit", async function (e) {
  e.preventDefault(); $("login-err").textContent = "";
  var email = $("in-email").value.trim(), password = $("in-pass").value;
  if (!email || !password) { $("login-err").textContent = "Enter your email and password."; return; }
  var res = await supabase.auth.signInWithPassword({ email: email, password: password });
  $("in-pass").value = "";
  if (res.error) { $("login-err").textContent = authError(res.error); return; }
  boot();
});
async function logout() { stopTimer(); await supabase.auth.signOut(); state.data = null; show("view-login"); }
$("btn-logout").addEventListener("click", logout);
$("btn-logout2").addEventListener("click", logout);
$("btn-refresh").addEventListener("click", function () { load(); });

/* ---------- leads = new accounts + form leads; alert sounds ---------- */
function addLeadTotals(d) {
  (d.daily || []).concat(d.hourly || []).forEach(function (x) { x.lead_total = (Number(x.signups) || 0) + (Number(x.leads) || 0); });
}
var SND = { lead: "assets/sounds/new-subscription.mp3", subscribe: "assets/sounds/renewal-crypto.mp3" };
var sndMuted = false, sndUnlocked = false, sndPending = null, prevCounts = null;
try { sndMuted = localStorage.getItem("glimify-dash-muted") === "1"; } catch (e) {}
function playSnd(k) {
  if (sndMuted) return;
  if (!sndUnlocked) { sndPending = k; syncSndBtn(); return; }
  try { var a = new Audio(SND[k]); a.volume = 0.7; var p = a.play(); if (p && p.catch) p.catch(function () { sndUnlocked = false; sndPending = k; syncSndBtn(); }); } catch (e) {}
}
/* Browsers allow sound only after the first click / key press on the page. */
function unlockSnd() {
  if (sndUnlocked) return; sndUnlocked = true; syncSndBtn();
  if (sndPending) { var k = sndPending; sndPending = null; setTimeout(function () { playSnd(k); }, 100); }
}
["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, unlockSnd, { capture: true, passive: true }); });
function syncSndBtn() {
  var b = $("btn-sound"); if (!b) return;
  b.innerHTML = sndMuted ? '<svg viewBox="0 0 20 20"><path d="M4 8h3l4-3v10l-4-3H4z"/><path d="m14 8 4 4M18 8l-4 4"/></svg>' : '<svg viewBox="0 0 20 20"><path d="M4 8h3l4-3v10l-4-3H4z"/><path d="M14 7.5a3.5 3.5 0 0 1 0 5M16 5.5a6.5 6.5 0 0 1 0 9"/></svg>';
  b.setAttribute("aria-label", sndMuted ? "Unmute lead sounds" : "Mute lead sounds");
  b.title = sndMuted ? "Lead sounds off" : !sndUnlocked ? "Click anywhere to enable lead sounds" : "Lead sounds on";
  b.style.color = sndMuted ? "var(--faint)" : !sndUnlocked ? "var(--warn)" : "";
}
(function addSndBtn() {
  var b = document.createElement("button");
  b.className = "icon-btn"; b.id = "btn-sound"; b.type = "button";
  var right = document.querySelector(".tb-right"), ref = $("btn-theme");
  if (right) right.insertBefore(b, ref || null);
  b.addEventListener("click", function () {
    sndMuted = !sndMuted; try { localStorage.setItem("glimify-dash-muted", sndMuted ? "1" : "0"); } catch (e) {}
    unlockSnd(); syncSndBtn(); if (!sndMuted) playSnd("lead");
  });
  syncSndBtn();
})();
/* Between refreshes: a new MarketScope account or form lead plays the lead chime;
   a new paid subscription (Stripe fulfillment) plays the coin sound. */
function alertNew(d) {
  var c = { lead: (Number((d.users || {}).total) || 0) + (Number((d.leads || {}).total) || 0), subscribe: Number((d.billing || {}).fulfillments) || 0 };
  if (prevCounts) {
    if (c.subscribe > prevCounts.subscribe) playSnd("subscribe");
    else if (c.lead > prevCounts.lead) playSnd("lead");
    var n = c.lead - prevCounts.lead;
    if (n > 0 && document.hidden) document.title = "(" + n + " new lead" + (n === 1 ? "" : "s") + ") " + document.title;
  }
  prevCounts = c;
}

/* ---------- data ---------- */
async function load() {
  var res = await supabase.rpc("glimify_dashboard_stats");
  if (res.error) {
    var msg = res.error.message || "";
    if (res.error.code === "42501" || /not authorized|permission denied/i.test(msg)) {
      stopTimer(); $("denied-email").textContent = state.email || "this account"; show("view-denied"); return;
    }
    if (/jwt|not authenticated/i.test(msg)) { stopTimer(); show("view-login"); return; }
    $("dash-err").textContent = (state.data ? "Couldn’t refresh: " : "Couldn’t load data: ") + (msg || "network error") + (state.data ? ". Showing the last data." : ". Retrying in 60s.");
    markLive(false);
    if (!state.data) { show("view-dash"); $("content").innerHTML = ""; }
    return;
  }
  $("dash-err").textContent = "";
  addLeadTotals(res.data);
  alertNew(res.data);
  state.data = res.data; state.lastOk = Date.now();
  show("view-dash"); render(); markLive(true);
}
function markLive(ok) { $("live-ind").classList.toggle("stale", !ok); $("live-text").textContent = ok ? "Live" : "Stale"; $("live-ind").title = ok ? "Updated " + ago(state.data && state.data.generated_at) : "Last refresh failed"; }
function startTimer() { stopTimer(); state.timer = setInterval(function () { if (!document.hidden) load(); }, REFRESH_MS); }
function stopTimer() { if (state.timer) clearInterval(state.timer); state.timer = null; }
document.addEventListener("visibilitychange", function () { if (!document.hidden && state.data && Date.now() - state.lastOk > REFRESH_MS) load(); });

async function boot() {
  var s = (await supabase.auth.getSession()).data.session;
  if (!s) { show("view-login"); return; }
  state.email = (s.user && s.user.email) || "";
  $("acct-email").textContent = state.email; $("avatar").textContent = (state.email.charAt(0) || "G").toUpperCase();
  if (location.search) history.replaceState(null, "", location.pathname + location.hash);
  var r = (location.hash || "#home").slice(1); state.route = ROUTES.indexOf(r) >= 0 ? r : "home";
  await load();
  if (!$("view-dash").hidden && state.data) startTimer();
}
supabase.auth.onAuthStateChange(function (event) { if (event === "SIGNED_OUT") { stopTimer(); show("view-login"); } });
boot();
