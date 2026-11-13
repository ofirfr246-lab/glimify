/* Glimify private live dashboard — real MarketScope data.
   Auth: Supabase Auth (Google or email/password, same accounts as MarketScope).
   Data: RPC public.glimify_dashboard_stats(), which runs server-side and only
   answers for accounts in public.glimify_admins. No secret keys live here. */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

var CFG = window.GLIMIFY_CONFIG || {};
var REFRESH_MS = 60000;
var supabase = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: "glimify-dashboard-auth" }
});

var $ = function (id) { return document.getElementById(id); };
var views = ["view-loading", "view-login", "view-denied", "view-dash"];
var timer = null, lastData = null, series = "signups", lastOk = 0;

function show(id) {
  views.forEach(function (v) { $(v).hidden = v !== id; });
  var authed = id === "view-dash" || id === "view-denied";
  $("btn-logout").hidden = !authed;
  $("btn-refresh").hidden = id !== "view-dash";
  $("live-ind").hidden = id !== "view-dash";
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
var nf = new Intl.NumberFormat("en-US");
function num(n) { return nf.format(Number(n) || 0); }
function ago(ts) {
  if (!ts) return "—";
  var s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
function when(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* ---------- auth ---------- */
function authError(err) {
  var m = (err && (err.message || err.error_description)) || "Sign-in failed. Try again.";
  if (/invalid login|invalid credentials/i.test(m)) return "Email or password is incorrect.";
  if (/email not confirmed/i.test(m)) return "Confirm your email first (check your inbox).";
  return m;
}
$("btn-google").addEventListener("click", async function () {
  $("login-err").textContent = "";
  var redirectTo = location.origin + location.pathname;
  var res = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo } });
  if (res.error) $("login-err").textContent = authError(res.error);
});
$("form-login").addEventListener("submit", async function (e) {
  e.preventDefault();
  $("login-err").textContent = "";
  var email = $("in-email").value.trim(), password = $("in-pass").value;
  if (!email || !password) { $("login-err").textContent = "Enter your email and password."; return; }
  var res = await supabase.auth.signInWithPassword({ email: email, password: password });
  $("in-pass").value = "";
  if (res.error) { $("login-err").textContent = authError(res.error); return; }
  boot();
});
async function logout() {
  stopTimer();
  await supabase.auth.signOut();
  lastData = null;
  show("view-login");
}
$("btn-logout").addEventListener("click", logout);
$("btn-logout2").addEventListener("click", logout);
$("btn-refresh").addEventListener("click", function () { load(true); });

/* ---------- data ---------- */
async function load(manual) {
  var res = await supabase.rpc("glimify_dashboard_stats");
  if (res.error) {
    var code = res.error.code;
    if (code === "42501" || /not authorized|permission denied/i.test(res.error.message || "")) {
      stopTimer();
      var u = (await supabase.auth.getUser()).data.user;
      $("denied-email").textContent = (u && u.email) || "this account";
      show("view-denied");
      return;
    }
    if (/jwt|not authenticated/i.test(res.error.message || "")) { stopTimer(); show("view-login"); return; }
    $("dash-err").textContent = (lastData ? "Couldn’t refresh: " : "Couldn’t load data: ") + (res.error.message || "network error") + (lastData ? ". Showing the last data." : ". Retrying in 60s.");
    markStale();
    if (!lastData) show("view-dash");
    return;
  }
  $("dash-err").textContent = "";
  lastData = res.data;
  lastOk = Date.now();
  show("view-dash");
  render(res.data);
  markLive();
}
function markLive() { $("live-ind").classList.remove("stale"); $("live-text").textContent = "LIVE"; }
function markStale() { $("live-ind").classList.add("stale"); $("live-text").textContent = "STALE"; }
function startTimer() { stopTimer(); timer = setInterval(function () { if (!document.hidden) load(); }, REFRESH_MS); }
function stopTimer() { if (timer) clearInterval(timer); timer = null; }
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && lastData && Date.now() - lastOk > REFRESH_MS) load();
});
setInterval(function () { if (lastData) $("updated").textContent = ago(lastData.generated_at); }, 15000);

/* ---------- render ---------- */
function delta(cur, prev) {
  if (!prev && !cur) return "";
  if (!prev) return ' <span class="up">new</span>';
  var p = Math.round(((cur - prev) / prev) * 100);
  return ' <span class="' + (p >= 0 ? "up" : "down") + '">' + (p >= 0 ? "+" : "") + p + "%</span>";
}
function kpi(label, val, sub) {
  return '<div class="dash-card kpi"><div class="k-label">' + esc(label) + '</div><div class="k-val">' + num(val) + '</div><div class="k-sub">' + sub + "</div></div>";
}
function render(d) {
  var u = d.users || {}, l = d.leads || {}, w = d.waitlist || {}, r = d.reports || {};
  $("updated").textContent = ago(d.generated_at);
  $("kpis").innerHTML =
    kpi("Total signups", u.total, num(u.last_24h) + " in 24h · " + num(u.last_7d) + " in 7d" + delta(u.last_7d, u.prev_7d)) +
    kpi("Active users · 7d", u.active_7d, "signed in during the last 7 days") +
    kpi("Paid users", u.paid, Object.keys(u.plans || {}).map(function (k) { return esc(k) + ": " + num(u.plans[k]); }).join(" · ") || "no profiles yet") +
    kpi("Leads", l.total, num(l.last_24h) + " in 24h · " + num(l.last_7d) + " in 7d") +
    kpi("Glimify waitlist", w.total, num(w.last_24h) + " in 24h · " + num(w.last_7d) + " in 7d") +
    kpi("Reports run", r.total, num(r.last_7d) + " in 7d");
  renderChart(d.daily || []);
  $("t-signups").innerHTML = table(d.recent_signups, ["Email", "Plan", "Via", "Joined"], function (x) {
    return ['<td class="mono">' + esc(x.email) + "</td>", "<td>" + esc(x.plan || "—") + "</td>", "<td>" + esc(x.provider || "—") + "</td>", '<td title="' + esc(when(x.created_at)) + '">' + esc(ago(x.created_at)) + "</td>"];
  }, "No signups yet.");
  $("t-leads").innerHTML = table(d.recent_leads, ["Email", "Source", "Page", "When"], function (x) {
    return ['<td class="mono">' + esc(x.email || "—") + "</td>", "<td>" + esc(x.source || "—") + "</td>", "<td>" + esc(x.page || "—") + "</td>", '<td title="' + esc(when(x.created_at)) + '">' + esc(ago(x.created_at)) + "</td>"];
  }, "No leads yet.");
  $("t-waitlist").innerHTML = table(d.recent_waitlist, ["Email", "Stage", "Source", "When"], function (x) {
    return ['<td class="mono">' + esc(x.email || "—") + "</td>", "<td>" + esc(x.stage || "—") + "</td>", "<td>" + esc(x.source || "—") + "</td>", '<td title="' + esc(when(x.created_at)) + '">' + esc(ago(x.created_at)) + "</td>"];
  }, "No one on the waitlist yet.");
  var e = d.engagement || {}, b = d.billing || {};
  var rows = [["Watchlist items", e.watchlist], ["Portfolio positions", e.portfolio], ["Tracked stores", e.tracked_stores], ["Stripe fulfillments", b.fulfillments], ["Stripe live events", b.live_events]];
  $("t-usage").innerHTML = '<table class="dash-table"><tbody>' + rows.map(function (x) {
    return "<tr><td>" + esc(x[0]) + '</td><td class="mono" style="text-align:right">' + num(x[1]) + "</td></tr>";
  }).join("") + "</tbody></table>";
}
function table(rows, heads, cells, emptyText) {
  if (!rows || !rows.length) return '<p class="dash-empty">' + esc(emptyText) + "</p>";
  return '<table class="dash-table"><thead><tr>' + heads.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
    "</tr></thead><tbody>" + rows.map(function (x) { return "<tr>" + cells(x).join("") + "</tr>"; }).join("") + "</tbody></table>";
}
function renderChart(daily) {
  var W = 900, H = 220, padL = 28, padB = 22, padT = 10;
  var vals = daily.map(function (x) { return Number(x[series]) || 0; });
  var max = Math.max.apply(null, vals.concat([0]));
  var top = Math.max(1, max), n = vals.length || 1, bw = (W - padL) / n;
  var s = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Daily ' + esc(series) + '">';
  (top >= 2 ? [0, 0.5, 1] : [0, 1]).forEach(function (f) {
    var y = padT + (H - padT - padB) * (1 - f);
    s += '<line class="grid" x1="' + padL + '" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text x="0" y="' + (y + 3) + '">' + Math.round(top * f) + "</text>";
  });
  vals.forEach(function (v, i) {
    var h = (H - padT - padB) * (v / top), x = padL + i * bw + bw * 0.18, y = H - padB - h;
    s += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="2"><title>' + esc(daily[i].day) + ": " + v + "</title></rect>";
    if (i % 5 === 0 || i === n - 1) s += '<text x="' + (padL + i * bw) + '" y="' + (H - 6) + '">' + esc(String(daily[i].day).slice(5)) + "</text>";
  });
  if (max === 0) s += '<text class="empty-note" x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">No ' + esc(series) + " in the last 30 days</text>";
  $("chart").innerHTML = s + "</svg>";
}
$("series-seg").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-s]");
  if (!b) return;
  series = b.getAttribute("data-s");
  Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) { x.classList.toggle("on", x === b); });
  if (lastData) renderChart(lastData.daily || []);
});

/* ---------- boot ---------- */
async function boot() {
  var s = (await supabase.auth.getSession()).data.session;
  if (!s) { show("view-login"); return; }
  if (location.search || location.hash) history.replaceState(null, "", location.pathname);
  await load();
  if (!$("view-dash").hidden) startTimer();
}
supabase.auth.onAuthStateChange(function (event) {
  if (event === "SIGNED_OUT") { stopTimer(); show("view-login"); }
});
boot();
