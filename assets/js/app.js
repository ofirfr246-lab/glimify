/* Glimify app — phase 1.
   Everything shown here comes from data the signed-in founder entered or imported.
   Auth: Supabase Auth (Google or email/password). Data: glimify_* tables, protected by
   row-level security (each row is visible only to its owner). Only the PUBLIC publishable
   key is used in the browser — never a secret key. */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

var CFG = window.GLIMIFY_CONFIG || {};
var sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: "glimify-app-auth" }
});
var APP_URL = location.origin + location.pathname;
var DAY = 864e5;
var CURRENCIES = ["USD", "EUR", "GBP", "ILS", "CAD", "AUD", "JPY", "CHF", "INR", "BRL", "SEK", "PLN"];

var $ = function (id) { return document.getElementById(id); };
var state = {
  user: null, products: [], pid: null, product: null,
  plans: [], customers: [], subs: [], events: [], signals: [],
  range: 30, route: "home", arg: null, candle: "day", tapeFilter: "all",
  seen: {}, seenCust: {}, loaded: false, muted: false, channel: null, poll: null, lastSync: 0, firedSignals: {}
};
try { state.muted = localStorage.getItem("glimify-app-muted") === "1"; } catch (e) {}
try { var _r = parseInt(localStorage.getItem("glimify-app-range"), 10); if ([7, 30, 90, 365].indexOf(_r) > -1) state.range = _r; } catch (e) {}

/* ---------------- utils ---------------- */
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
function sum(a) { return a.reduce(function (s, v) { return s + (Number(v) || 0); }, 0); }
function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
var nf = new Intl.NumberFormat("en-US");
function num(n) { return nf.format(Number(n) || 0); }
var _mf = {};
function money(n, opts) {
  var c = (state.product && state.product.currency) || "USD";
  var key = c + (opts && opts.compact ? "c" : "") + (opts && opts.whole ? "w" : "");
  if (!_mf[key]) {
    var o = { style: "currency", currency: c };
    if (opts && opts.compact) { o.notation = "compact"; o.maximumFractionDigits = 1; }
    else if (opts && opts.whole) { o.maximumFractionDigits = 0; }
    try { _mf[key] = new Intl.NumberFormat("en-US", o); } catch (e) { _mf[key] = { format: function (v) { return c + " " + num(v); } }; }
  }
  return _mf[key].format(Number(n) || 0);
}
function pct(n, digits) { if (n == null || !isFinite(n)) return "—"; return (Math.round(n * Math.pow(10, digits || 1)) / Math.pow(10, digits || 1)) + "%"; }
function t(ts) { return ts ? new Date(ts).getTime() : 0; }
function fmtDate(ts, withTime) {
  if (!ts) return "—";
  var o = { day: "numeric", month: "short", year: "numeric" };
  if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; o.hour12 = false; delete o.year; }
  return new Date(ts).toLocaleString("en-GB", o);
}
function fmtTime(ts) { return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }
function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dayLabel(ms) { return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
function startOfDay(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function ago(ts) {
  var s = Math.max(0, (Date.now() - t(ts)) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago";
}
function dateInput(ts) { return dayKey(ts ? t(ts) : Date.now()); }
function fromDateInput(v, fallbackNow) {
  if (!v) return fallbackNow ? new Date().toISOString() : null;
  var p = v.split("-"); if (p.length !== 3) return null;
  if (v === dayKey(Date.now())) return new Date().toISOString();
  return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0).toISOString();
}
function isUuid(s) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "")); }
function normUrl(u) { u = String(u || "").trim(); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u; }
function monthly(plan) { if (!plan) return 0; var p = Number(plan.price) || 0; return r2(plan.interval === "year" ? p / 12 : plan.interval === "week" ? (p * 52) / 12 : p); }
function intervalShort(i) { return i === "year" ? "yr" : i === "week" ? "wk" : "mo"; }
function arrow(up) { return up ? '<svg viewBox="0 0 12 12"><path d="M6 2.5 10 8H2z"/></svg>' : '<svg viewBox="0 0 12 12"><path d="M6 9.5 2 4h8z"/></svg>'; }
function chg(cur, prev, invert) {
  if (!cur && !prev) return '<span class="chg">0%</span>';
  if (!prev) return '<span class="chg ' + (invert ? "down" : "up") + '">' + arrow(true) + "new</span>";
  var p = ((cur - prev) / Math.abs(prev)) * 100, r = Math.round(p * 10) / 10;
  if (!r) return '<span class="chg">0%</span>';
  var good = invert ? r < 0 : r > 0;
  return '<span class="chg ' + (good ? "up" : "down") + '">' + arrow(r > 0) + Math.abs(r) + "%</span>";
}
function badge(text, cls) { return '<span class="badge ' + (cls || "") + '">' + esc(text) + "</span>"; }
function statusBadge(s) { return badge(cap(s === "past_due" ? "past due" : s), s === "active" ? "ok" : s === "canceled" ? "bad" : s === "past_due" ? "warn" : ""); }
var EV = {
  signup: { label: "Subscribe", cls: "ok", sound: "renewal-crypto", group: "subscribe" },
  lead: { label: "Lead", cls: "ok", sound: "new-subscription", group: "lead" },
  upgrade: { label: "Upgrade", cls: "ok", sound: "upgrade-market-up", group: "upgrade" },
  reactivation: { label: "Reactivated", cls: "ok", sound: "upgrade-market-up", group: "upgrade" },
  downgrade: { label: "Downgrade", cls: "bad", sound: "churn-market-down", group: "churn" },
  churn: { label: "Churn", cls: "bad", sound: "churn-market-down", group: "churn" },
  payment: { label: "Payment", cls: "info", sound: "renewal-crypto", group: "renewal" },
  renewal: { label: "Renewal", cls: "info", sound: "renewal-crypto", group: "renewal" }
};
function evBadge(type) { var e = EV[type] || { label: type, cls: "" }; return badge(e.label, e.cls); }
function show(id) {
  ["view-loading", "view-auth", "view-reset", "view-onboard", "view-app"].forEach(function (v) { $(v).hidden = v !== id; });
}
function toast(msg, kind) {
  var el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(function () { el.classList.add("out"); }, 3800);
  setTimeout(function () { el.remove(); }, 4300);
}
function errMsg(e) {
  var m = (e && (e.message || e.error_description)) || String(e || "Something went wrong");
  if (/duplicate key.*email/i.test(m)) return "A customer with this email already exists.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Network error — check your connection and try again.";
  return m;
}

/* ---------------- sounds ---------------- */
var SOUNDS = {};
["new-subscription", "renewal-crypto", "upgrade-market-up", "churn-market-down"].forEach(function (k) { SOUNDS[k] = "assets/sounds/" + k + ".mp3"; });
var SOUND_GROUPS = [
  { k: "lead", label: "Lead (new customer or sign-up)", sound: "new-subscription" },
  { k: "subscribe", label: "Subscribe (new paid subscription)", sound: "renewal-crypto" },
  { k: "upgrade", label: "Upgrade / reactivation", sound: "upgrade-market-up" },
  { k: "churn", label: "Churn / cancel / downgrade", sound: "churn-market-down" },
  { k: "renewal", label: "Renewal / payment", sound: "renewal-crypto" }
];
var soundOff = {};
try { soundOff = JSON.parse(localStorage.getItem("glimify-app-sound-off") || "{}") || {}; } catch (e) {}
var lastSoundAt = 0, audioUnlocked = false, pendingSound = null, AUD = {};
/* Browsers block audio until the person interacts with the page: we prime the
   audio elements on the first click / key press, and replay the latest blocked sound. */
function unlockAudio() {
  if (audioUnlocked) return; audioUnlocked = true;
  Object.keys(SOUNDS).forEach(function (k) {
    try { var a = AUD[k] || (AUD[k] = new Audio(SOUNDS[k])); a.preload = "auto"; a.muted = true; var p = a.play(); if (p && p.then) p.then(function () { a.pause(); a.currentTime = 0; a.muted = false; }).catch(function () { a.muted = false; }); else a.muted = false; } catch (e) {}
  });
  updateSoundHint();
  if (pendingSound) { var ps = pendingSound; pendingSound = null; setTimeout(function () { playSound(ps); }, 120); }
}
["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, unlockAudio, { once: false, passive: true, capture: true }); });
function playSound(key) {
  if (!audioUnlocked) { pendingSound = key; updateSoundHint(); return; }
  try { var a = new Audio(SOUNDS[key]); a.volume = 0.7; var p = a.play(); if (p && p.catch) p.catch(function () { audioUnlocked = false; pendingSound = key; updateSoundHint(); }); } catch (e2) {}
}
function playFor(type, force) {
  var e = EV[type]; if (!e) return;
  if (!force && (state.muted || soundOff[e.group])) return;
  var now = Date.now(); if (!force && now - lastSoundAt < 350) return; lastSoundAt = now;
  playSound(e.sound);
}
function updateSoundHint() {
  var b = document.getElementById("btn-sound"); if (!b) return;
  var need = !audioUnlocked && !state.muted;
  b.classList.toggle("needs-tap", need);
  if (need) b.title = "Click anywhere on the page to enable sounds";
  else b.title = state.muted ? "Sounds off" : "Sounds on";
}
function renderSoundBtn() {
  var b = $("btn-sound");
  b.innerHTML = state.muted
    ? '<svg viewBox="0 0 20 20"><path d="M4 8h3l4-3v10l-4-3H4z"/><path d="m14 8 4 4M18 8l-4 4"/></svg>'
    : '<svg viewBox="0 0 20 20"><path d="M4 8h3l4-3v10l-4-3H4z"/><path d="M14 7.5a3.5 3.5 0 0 1 0 5M16 5.5a6.5 6.5 0 0 1 0 9"/></svg>';
  b.setAttribute("aria-label", state.muted ? "Unmute sounds" : "Mute sounds");
  b.title = state.muted ? "Sounds off" : "Sounds on";
  b.classList.toggle("muted-on", state.muted);
  updateSoundHint();
}

/* ---------------- auth ---------------- */
var authMode = /signup/.test(location.hash) ? "signup" : "login";
function setAuthMode(m) {
  authMode = m;
  Array.prototype.forEach.call(document.querySelectorAll(".seg [data-mode]"), function (b) { var on = b.getAttribute("data-mode") === m; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
  $("auth-title").textContent = m === "signup" ? "Create your account" : "Log in";
  $("auth-sub").textContent = m === "signup" ? "Free during early access. Add your SaaS, its plans and subscribers, and watch your revenue like a market." : "Welcome back. Your products and revenue data are private to your account.";
  $("btn-auth-submit").textContent = m === "signup" ? "Create account" : "Log in";
  $("in-pass").setAttribute("autocomplete", m === "signup" ? "new-password" : "current-password");
  $("btn-forgot").hidden = m === "signup";
  $("auth-err").textContent = ""; $("auth-ok").textContent = "";
}
Array.prototype.forEach.call(document.querySelectorAll(".seg [data-mode]"), function (b) { b.addEventListener("click", function () { setAuthMode(b.getAttribute("data-mode")); }); });
setAuthMode(authMode);

$("btn-google").addEventListener("click", async function () {
  $("auth-err").textContent = "";
  var r = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: APP_URL } });
  if (r.error) $("auth-err").textContent = errMsg(r.error);
});
$("form-auth").addEventListener("submit", async function (e) {
  e.preventDefault();
  var email = $("in-email").value.trim(), pass = $("in-pass").value;
  $("auth-err").textContent = ""; $("auth-ok").textContent = "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("auth-err").textContent = "Enter a valid email address."; return; }
  if (pass.length < 8) { $("auth-err").textContent = "Password must be at least 8 characters."; return; }
  var btn = $("btn-auth-submit"); btn.disabled = true;
  try {
    if (authMode === "signup") {
      var r = await sb.auth.signUp({ email: email, password: pass, options: { emailRedirectTo: APP_URL, data: { signup_source: "glimify" } } });
      if (r.error) throw r.error;
      if (!r.data.session) $("auth-ok").textContent = "Almost there — check " + email + " for a confirmation link, then come back and log in.";
    } else {
      var r2_ = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (r2_.error) throw r2_.error;
    }
  } catch (err) {
    $("auth-err").textContent = /Invalid login/i.test(err.message || "") ? "Wrong email or password." : errMsg(err);
  } finally { btn.disabled = false; }
});
$("btn-forgot").addEventListener("click", async function () {
  var email = $("in-email").value.trim();
  $("auth-err").textContent = ""; $("auth-ok").textContent = "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("auth-err").textContent = "Type your email above first, then tap “Forgot password?”."; return; }
  var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
  if (r.error) $("auth-err").textContent = errMsg(r.error);
  else $("auth-ok").textContent = "If an account exists for " + email + ", a reset link is on its way.";
});
$("form-reset").addEventListener("submit", async function (e) {
  e.preventDefault();
  var p = $("in-newpass").value;
  if (p.length < 8) { $("reset-err").textContent = "Password must be at least 8 characters."; return; }
  var r = await sb.auth.updateUser({ password: p });
  if (r.error) { $("reset-err").textContent = errMsg(r.error); return; }
  toast("Password updated", "ok"); recovering = false; boot();
});
async function logout() { stopLive(); await sb.auth.signOut(); state.user = null; state.loaded = false; show("view-auth"); }
$("btn-logout").addEventListener("click", logout);
$("btn-ob-logout").addEventListener("click", logout);

var recovering = false, booting = false;
sb.auth.onAuthStateChange(function (ev, session) {
  if (ev === "PASSWORD_RECOVERY") { recovering = true; show("view-reset"); return; }
  if (ev === "SIGNED_OUT") { state.user = null; show("view-auth"); return; }
  if ((ev === "SIGNED_IN" || ev === "INITIAL_SESSION") && session && !recovering) {
    if (!state.user || state.user.id !== session.user.id) setTimeout(boot, 0);
  }
  if (ev === "INITIAL_SESSION" && !session) show("view-auth");
});

/* ---------------- boot & data ---------------- */
async function boot() {
  if (booting) return; booting = true;
  try {
    var s = await sb.auth.getSession();
    var session = s.data && s.data.session;
    if (!session) { show("view-auth"); return; }
    state.user = session.user;
    var email = session.user.email || "";
    $("acct-email").textContent = email;
    $("avatar").textContent = (email.charAt(0) || "G").toUpperCase();
    if (/#(login|signup)/.test(location.hash)) history.replaceState(null, "", APP_URL + "#home");
    var pr = await sb.from("glimify_products").select("*").order("created_at");
    if (pr.error) throw pr.error;
    state.products = pr.data || [];
    if (!state.products.length) { fillCurrencies($("ob-cur"), "USD"); show("view-onboard"); return; }
    var saved = null; try { saved = localStorage.getItem("glimify-app-product"); } catch (e) {}
    state.pid = state.products.some(function (p) { return p.id === saved; }) ? saved : state.products[0].id;
    await selectProduct(state.pid);
    show("view-app");
  } catch (e) {
    show("view-auth"); $("auth-err").textContent = "Couldn't load your account: " + errMsg(e);
  } finally { booting = false; }
}
function fillCurrencies(sel, cur) {
  sel.innerHTML = CURRENCIES.map(function (c) { return '<option value="' + c + '"' + (c === cur ? " selected" : "") + ">" + c + "</option>"; }).join("");
}
$("form-onboard").addEventListener("submit", async function (e) {
  e.preventDefault();
  var name = $("ob-name").value.trim();
  if (!name) { $("ob-err").textContent = "Give your product a name."; return; }
  var r = await sb.from("glimify_products").insert({ name: name, url: normUrl($("ob-url").value), currency: $("ob-cur").value }).select().single();
  if (r.error) { $("ob-err").textContent = errMsg(r.error); return; }
  state.products.push(r.data);
  await selectProduct(r.data.id);
  location.hash = "#home";
  show("view-app");
  toast("Product created — now add your first plan", "ok");
});

async function fetchAll(table, order) {
  var out = [], from = 0, size = 1000;
  for (;;) {
    var r = await sb.from(table).select("*").eq("product_id", state.pid).order(order || "created_at").range(from, from + size - 1);
    if (r.error) throw r.error;
    out = out.concat(r.data || []);
    if (!r.data || r.data.length < size) break;
    from += size;
  }
  return out;
}
async function loadData(opts) {
  var res = await Promise.all([fetchAll("glimify_plans", "sort"), fetchAll("glimify_customers"), fetchAll("glimify_subscriptions"), fetchAll("glimify_events", "occurred_at"), fetchAll("glimify_signals")]);
  state.plans = res[0]; state.subs = res[2]; state.signals = res[4];
  res[1].forEach(function (c) { if (!state.seenCust[c.id]) { if (state.loaded && !(opts && opts.silent)) notify({ kind: "cust", c: c }); state.seenCust[c.id] = 1; } });
  state.customers = res[1];
  var evs = res[3], fresh = [];
  evs.forEach(function (ev) { if (!state.seen[ev.id]) { if (state.loaded) fresh.push(ev); state.seen[ev.id] = 1; } });
  state.events = evs;
  state.loaded = true; state.lastSync = Date.now();
  indexData();
  if (fresh.length && !(opts && opts.silent)) fresh.forEach(function (ev) { notify({ kind: "ev", ev: ev }); });
}
function indexData() {
  state.planBy = {}; state.plans.forEach(function (p) { state.planBy[p.id] = p; });
  state.custBy = {}; state.customers.forEach(function (c) { state.custBy[c.id] = c; });
  state.subBy = {}; state.subs.forEach(function (s) { state.subBy[s.id] = s; });
  state.events.sort(function (a, b) { return t(a.occurred_at) - t(b.occurred_at) || t(a.created_at) - t(b.created_at); });
}
async function selectProduct(id) {
  stopLive();
  state.pid = id; state.product = state.products.find(function (p) { return p.id === id; });
  _mf = {}; state.seen = {}; state.seenCust = {}; state.loaded = false; state.firedSignals = {};
  try { localStorage.setItem("glimify-app-product", id); } catch (e) {}
  renderProductSelect(); renderNav();
  $("content").innerHTML = '<p class="empty">Loading…</p>';
  try { await loadData({ silent: true }); $("app-err").textContent = ""; } catch (e) { $("app-err").textContent = "Couldn't load data: " + errMsg(e); }
  startLive();
  route();
}
async function refresh(silentSound) {
  try { await loadData({ silent: silentSound }); $("app-err").textContent = ""; softRoute(); } catch (e) { $("app-err").textContent = "Couldn't refresh: " + errMsg(e); }
}

/* ---------------- live (Realtime + polling fallback) ---------------- */
function startLive() {
  try {
    state.channel = sb.channel("glimify-events-" + state.pid)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "glimify_events", filter: "product_id=eq." + state.pid }, function (payload) {
        var ev = payload.new; if (!ev || state.seen[ev.id]) return;
        state.seen[ev.id] = 1; state.events.push(ev); indexData();
        clearTimeout(state._rt); state._rt = setTimeout(function () { refresh(true); }, 600);
        notify({ kind: "ev", ev: ev });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "glimify_customers", filter: "product_id=eq." + state.pid }, function (payload) {
        var c = payload.new; if (!c || state.seenCust[c.id]) return;
        state.seenCust[c.id] = 1; state.customers.push(c); indexData();
        clearTimeout(state._rt); state._rt = setTimeout(function () { refresh(true); }, 600);
        notify({ kind: "cust", c: c });
      })
      .subscribe(function (status) { setLive(status === "SUBSCRIBED"); });
  } catch (e) { setLive(false); }
  state.poll = setInterval(function () { if (!document.hidden) refresh(false); }, 45000);
}
function stopLive() {
  if (state.channel) { try { sb.removeChannel(state.channel); } catch (e) {} state.channel = null; }
  if (state.poll) { clearInterval(state.poll); state.poll = null; }
}
function setLive(ok) {
  $("live-ind").classList.toggle("stale", !ok);
  $("live-text").textContent = ok ? "Live" : "Syncing";
  $("live-ind").title = ok ? "Live: new events stream in instantly" : "Live stream unavailable — refreshing every 45 seconds";
}
/* New sign-ups and subscription events: one sound + toast each, collapsed when many arrive at once (e.g. an import). */
var nq = [], nqTimer = null;
function notify(item) { nq.push(item); clearTimeout(nqTimer); nqTimer = setTimeout(flushNotify, 350); }
function flushNotify() {
  var items = nq; nq = [];
  if (!items.length) return;
  var types = items.map(function (x) { return x.kind === "cust" ? "lead" : x.ev.type; });
  var prio = ["churn", "downgrade", "signup", "upgrade", "reactivation", "lead", "renewal", "payment"];
  var top = prio.find(function (p) { return types.indexOf(p) > -1; }) || types[0];
  playFor(top);
  if (items.length > 3) { toast(items.length + " new events — " + summarize(types), "ok"); }
  else items.forEach(function (x) {
    if (x.kind === "cust") { toast("Lead · " + (x.c.email || x.c.name || "new customer"), "ok"); return; }
    var ev = x.ev, c = state.custBy && state.custBy[ev.customer_id], e = EV[ev.type] || { label: ev.type };
    toast(e.label + (c && c.email ? " · " + c.email : "") + (Number(ev.mrr_delta) ? " · " + (ev.mrr_delta > 0 ? "+" : "") + money(ev.mrr_delta) + " MRR" : ev.amount ? " · " + money(ev.amount) : ""), e.cls === "bad" ? "bad" : "ok");
  });
  softRoute();
}
function summarize(types) {
  var m = {}; types.forEach(function (x) { var l = (EV[x] || { label: x }).label; m[l] = (m[l] || 0) + 1; });
  return Object.keys(m).map(function (k) { return m[k] + " " + k.toLowerCase(); }).join(", ");
}

/* ---------------- metrics (all derived from the founder's own rows) ---------------- */
function paying(s) { return s.status === "active" || s.status === "past_due"; }
function currentMRR() { return r2(sum(state.subs.filter(paying).map(function (s) { return s.mrr; }))); }
function mrrAt(ms) { var v = 0; for (var i = 0; i < state.events.length; i++) { var e = state.events[i]; if (t(e.occurred_at) > ms) break; v += Number(e.mrr_delta) || 0; } return r2(v); }
function activeAt(ms) {
  return state.subs.filter(function (s) { return s.status !== "trialing" && t(s.started_at) <= ms && (!s.canceled_at || t(s.canceled_at) > ms); }).length;
}
function evIn(type, from, to) { return state.events.filter(function (e) { var x = t(e.occurred_at); return (!type || e.type === type) && x > from && x <= to; }); }
function windowStart(days) { return startOfDay(Date.now()) - (days - 1) * DAY; }
/* Daily (or weekly) OHLC candles of MRR, built by replaying MRR deltas in time order. */
function candles(days, bucket) {
  var size = bucket === "week" ? 7 : 1;
  var n = Math.ceil(days / size), end = startOfDay(Date.now()) + DAY;
  var start = end - n * size * DAY, out = [], evs = state.events, i = 0, v = 0;
  while (i < evs.length && t(evs[i].occurred_at) < start) { v += Number(evs[i].mrr_delta) || 0; i++; }
  for (var k = 0; k < n; k++) {
    var b0 = start + k * size * DAY, b1 = b0 + size * DAY, o = v, h = v, l = v, vol = 0;
    while (i < evs.length && t(evs[i].occurred_at) < b1) {
      var d = Number(evs[i].mrr_delta) || 0; v += d; if (d) vol++;
      if (v > h) h = v; if (v < l) l = v; i++;
    }
    out.push({ t: b0, o: r2(o), h: r2(h), l: r2(l), c: r2(v), vol: vol, label: size === 7 ? "Wk of " + dayLabel(b0) : dayLabel(b0) });
  }
  return out;
}
function dailySeries(days, fn) { var s = windowStart(days), out = []; for (var k = 0; k < days; k++) { var d0 = s + k * DAY; out.push({ t: d0, label: dayLabel(d0), v: fn(d0, d0 + DAY) }); } return out; }
function kpis(days) {
  var now = Date.now(), from = now - days * DAY;
  var mrr = currentMRR(), mrrPrev = mrrAt(from);
  var act = state.subs.filter(paying).length, actPrev = activeAt(from);
  var arpu = act ? mrr / act : 0, arpuPrev = actPrev ? mrrPrev / actPrev : 0;
  var churned = evIn("churn", from, now), churnedMRR = -sum(churned.map(function (e) { return e.mrr_delta; }));
  var newEv = evIn("signup", from, now), newMRR = sum(newEv.map(function (e) { return e.mrr_delta; }));
  var exp = sum(evIn("upgrade", from, now).concat(evIn("reactivation", from, now)).map(function (e) { return e.mrr_delta; }));
  var con = -sum(evIn("downgrade", from, now).map(function (e) { return e.mrr_delta; }));
  var churnRate = actPrev ? (churned.length / actPrev) * 100 : null;
  var revChurn = mrrPrev ? (churnedMRR / mrrPrev) * 100 : null;
  // monthly logo churn over the last 30 days, for LTV
  var a30 = activeAt(now - 30 * DAY), c30 = evIn("churn", now - 30 * DAY, now).length;
  var monthlyChurn = a30 ? c30 / a30 : null;
  var ltv = monthlyChurn ? arpu / monthlyChurn : null;
  var payments = sum(evIn("payment", from, now).concat(evIn("renewal", from, now)).map(function (e) { return e.amount; }));
  var leads = state.customers.filter(function (c) { var x = t(c.created_at); return x > from && x <= now; }).length;
  var leadsPrev = state.customers.filter(function (c) { var x = t(c.created_at); return x > from - days * DAY && x <= from; }).length;
  return { leads: leads, leadsPrev: leadsPrev, mrr: mrr, mrrPrev: mrrPrev, arr: mrr * 12, arrPrev: mrrPrev * 12, act: act, actPrev: actPrev, arpu: arpu, arpuPrev: arpuPrev,
    churned: churned.length, churnedMRR: churnedMRR, newSubs: newEv.length, newMRR: newMRR, exp: exp, con: con,
    net: newMRR + exp - con - churnedMRR, churnRate: churnRate, revChurn: revChurn, monthlyChurn: monthlyChurn, ltv: ltv, payments: payments,
    trials: state.subs.filter(function (s) { return s.status === "trialing"; }).length };
}
function planStats(days) {
  var from = Date.now() - days * DAY, tot = currentMRR();
  var rows = state.plans.map(function (p) {
    var subs = state.subs.filter(function (s) { return s.plan_id === p.id; });
    var live = subs.filter(paying), mrr = sum(live.map(function (s) { return s.mrr; }));
    var prev = sum(subs.filter(function (s) { return s.status !== "trialing" && t(s.started_at) <= from && (!s.canceled_at || t(s.canceled_at) > from); }).map(function (s) { return s.mrr; }));
    var churned = subs.filter(function (s) { return s.canceled_at && t(s.canceled_at) > from; }).length;
    return { plan: p, subs: live.length, mrr: r2(mrr), prev: r2(prev), share: tot ? (mrr / tot) * 100 : 0, churned: churned };
  });
  var none = state.subs.filter(function (s) { return !s.plan_id && paying(s); });
  if (none.length) rows.push({ plan: { id: "", name: "No plan", archived: false }, subs: none.length, mrr: r2(sum(none.map(function (s) { return s.mrr; }))), prev: 0, share: tot ? (sum(none.map(function (s) { return s.mrr; })) / tot) * 100 : 0, churned: 0 });
  return rows.sort(function (a, b) { return b.mrr - a.mrr; });
}
/* Volatility: standard deviation of daily MRR % returns over the window. */
function volatility(days) {
  var cs = candles(days, "day"), rets = [];
  cs.forEach(function (c) { if (c.o > 0) rets.push(((c.c - c.o) / c.o) * 100); });
  if (rets.length < 2) return { vol: null, rets: cs.map(function (c) { return c.o > 0 ? ((c.c - c.o) / c.o) * 100 : 0; }), cs: cs };
  var m = sum(rets) / rets.length, v = sum(rets.map(function (r) { return (r - m) * (r - m); })) / (rets.length - 1);
  return { vol: Math.sqrt(v), rets: cs.map(function (c) { return c.o > 0 ? ((c.c - c.o) / c.o) * 100 : 0; }), cs: cs };
}
/* Signals: compare a metric now vs N days ago. */
function metricValue(metric, at, windowDays) {
  if (metric === "mrr") return mrrAt(at);
  if (metric === "active_subs") return activeAt(at);
  if (metric === "new_subs") return evIn("signup", at - windowDays * DAY, at).length;
  if (metric === "churned_subs") return evIn("churn", at - windowDays * DAY, at).length;
  return 0;
}
var SIG_METRIC = { mrr: "MRR", active_subs: "Active subscribers", new_subs: "New subscribers", churned_subs: "Churned subscribers" };
var SIG_OP = { drops_pct: "drops by", rises_pct: "rises by", below: "falls below", above: "goes above" };
function evalSignal(s) {
  var now = Date.now(), w = s.window_days || 1;
  var cur = s.metric === "mrr" ? currentMRR() : metricValue(s.metric, now, w);
  var prev = metricValue(s.metric, now - w * DAY, w);
  var th = Number(s.threshold), hit = false, change = prev ? ((cur - prev) / Math.abs(prev)) * 100 : null, nodata = false;
  if (s.op === "drops_pct") { if (prev > 0) hit = change <= -th; else nodata = true; }
  else if (s.op === "rises_pct") { if (prev > 0) hit = change >= th; else nodata = true; }
  else if (s.op === "below") hit = cur < th;
  else if (s.op === "above") hit = cur > th;
  return { cur: cur, prev: prev, change: change, hit: !!s.enabled && hit, nodata: nodata };
}
function signalText(s) {
  var isMoney = s.metric === "mrr", pctOp = s.op === "drops_pct" || s.op === "rises_pct";
  var w = s.window_days === 1 ? "in a day" : "in " + s.window_days + " days";
  return SIG_METRIC[s.metric] + " " + SIG_OP[s.op] + " " + (pctOp ? s.threshold + "%" : isMoney ? money(s.threshold) : num(s.threshold)) + (pctOp || s.metric === "new_subs" || s.metric === "churned_subs" ? " " + w : "");
}
function triggeredSignals() { return state.signals.filter(function (s) { return evalSignal(s).hit; }); }

/* ---------------- charts (SVG, no libraries) ---------------- */
var CH = {}, chSeq = 0;
function niceMax(m) {
  if (m <= 0) return 1;
  var pow = Math.pow(10, Math.floor(Math.log10(m))), f = m / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}
function axisFmt(v, isMoney) { return isMoney ? money(v, { compact: true }) : num(Math.round(v * 10) / 10); }
function xTicks(n, labels) {
  var idx = n <= 8 ? labels.map(function (_, i) { return i; }) : [0, Math.round(n * 0.25), Math.round(n * 0.5), Math.round(n * 0.75), n - 1];
  return '<div class="lc-x">' + idx.map(function (i) { return '<span style="left:' + (n > 1 ? (i / (n - 1)) * 100 : 50) + '%">' + esc(labels[i] || "") + "</span>"; }).join("") + "</div>";
}
function lineChart(points, o) {
  o = o || {}; var H = o.h || 220, W = 1000, id = "c" + (++chSeq), n = points.length;
  var vals = points.map(function (p) { return p.v; });
  var lo = Math.min.apply(null, vals.concat([0])), hi = niceMax(Math.max.apply(null, vals.concat([0])));
  var span = hi - lo || 1, step = n > 1 ? W / (n - 1) : 0;
  function y(v) { return H - ((v - lo) / span) * H; }
  var d = points.map(function (p, i) { return (i ? "L" : "M") + (i * step).toFixed(1) + " " + y(p.v).toFixed(1); }).join(" ");
  var area = n ? d + " L" + ((n - 1) * step).toFixed(1) + " " + y(Math.max(lo, 0)) + " L0 " + y(Math.max(lo, 0)) + " Z" : "";
  CH[id] = { kind: "line", pts: points, money: o.money, pct: o.pct, n: n, label: o.label || "" };
  var g = [0, 0.25, 0.5, 0.75, 1].map(function (f) { return '<line class="gl" x1="0" x2="' + W + '" y1="' + H * f + '" y2="' + H * f + '"/>'; }).join("");
  var ys = [1, 0.5, 0].map(function (f) { return '<span style="top:' + (1 - f) * 100 + '%">' + esc(o.pct ? pct(lo + span * f) : axisFmt(lo + span * f, o.money)) + "</span>"; }).join("");
  var empty = o.empty ? '<div class="lc-note">' + esc(o.empty) + "</div>" : "";
  var color = o.color ? ' style="stroke:' + o.color + '"' : "";
  return '<div class="lc ac" data-chart="' + id + '"><div class="lc-y">' + ys + '</div><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" style="height:' + H + 'px" role="img" aria-label="' + esc(o.label || "chart") + '">' +
    '<defs><linearGradient id="ga' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (o.color || "var(--accent)") + '" stop-opacity=".22"/><stop offset="1" stop-color="' + (o.color || "var(--accent)") + '" stop-opacity="0"/></linearGradient></defs>' +
    g + (area ? '<path d="' + area + '" fill="url(#ga' + id + ')"/>' : "") + (d ? '<path class="cur" d="' + d + '"' + color + "/>" : "") +
    '<line class="hov" x1="-10" x2="-10" y1="0" y2="' + H + '" style="display:none"/></svg>' + empty + xTicks(n, points.map(function (p) { return p.label; })) + "</div>";
}
function candleChart(cs, o) {
  o = o || {}; var H = o.h || 280, VH = 46, W = 1000, id = "c" + (++chSeq), n = cs.length;
  var lo = Math.min.apply(null, cs.map(function (c) { return c.l; }).concat([Infinity])), hi = Math.max.apply(null, cs.map(function (c) { return c.h; }).concat([-Infinity]));
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  if (hi === lo) { var pad0 = Math.max(1, Math.abs(hi) * 0.05); hi += pad0; lo = Math.max(0, lo - pad0); }
  var pad = (hi - lo) * 0.08; hi += pad; lo = Math.max(0, lo - pad);
  var span = hi - lo || 1, bw = W / n, vmax = Math.max.apply(null, cs.map(function (c) { return c.vol; }).concat([1]));
  function y(v) { return H - ((v - lo) / span) * H; }
  CH[id] = { kind: "candle", cs: cs, n: n };
  var body = cs.map(function (c, i) {
    var x = i * bw + bw / 2, up = c.c >= c.o, cls = c.c === c.o ? "flat" : up ? "up" : "down";
    var top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c)), hgt = Math.max(1.5, bot - top), w = Math.max(1.5, bw * 0.62);
    var vh = (c.vol / vmax) * (VH - 6);
    return '<g class="cd ' + cls + '"><line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + y(c.h).toFixed(1) + '" y2="' + y(c.l).toFixed(1) + '"/>' +
      '<rect x="' + (x - w / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hgt.toFixed(1) + '"/>' +
      (c.vol ? '<rect class="vol" x="' + (x - w / 2).toFixed(1) + '" y="' + (H + VH - vh).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + vh.toFixed(1) + '"/>' : "") + "</g>";
  }).join("");
  var g = [0, 0.25, 0.5, 0.75, 1].map(function (f) { return '<line class="gl" x1="0" x2="' + W + '" y1="' + H * f + '" y2="' + H * f + '"/>'; }).join("");
  var ys = [1, 0.5, 0].map(function (f) { return '<span style="top:' + ((1 - f) * H / (H + VH)) * 100 + '%">' + esc(axisFmt(lo + span * f, true)) + "</span>"; }).join("");
  var labels = cs.map(function (c) { return c.label; });
  return '<div class="lc ac cc" data-chart="' + id + '"><div class="lc-y">' + ys + '</div><svg viewBox="0 0 ' + W + " " + (H + VH) + '" preserveAspectRatio="none" style="height:' + (H + VH) + 'px" role="img" aria-label="MRR candlestick chart">' + g +
    '<line class="gl" x1="0" x2="' + W + '" y1="' + (H + 4) + '" y2="' + (H + 4) + '"/>' + body + '<line class="hov" x1="-10" x2="-10" y1="0" y2="' + (H + VH) + '" style="display:none"/></svg>' +
    (o.empty ? '<div class="lc-note">' + esc(o.empty) + "</div>" : "") + xTicksC(n, labels) + "</div>";
}
function xTicksC(n, labels) {
  var idx = n <= 8 ? labels.map(function (_, i) { return i; }) : [0, Math.round(n * 0.25), Math.round(n * 0.5), Math.round(n * 0.75), n - 1];
  return '<div class="lc-x cx">' + idx.map(function (i) { return '<span style="left:' + ((i + 0.5) / n) * 100 + '%">' + esc(labels[i] || "") + "</span>"; }).join("") + "</div>";
}
function barChart(points, o) {
  o = o || {}; var H = o.h || 160, W = 1000, id = "c" + (++chSeq), n = points.length;
  var vals = points.map(function (p) { return p.v; });
  var m = Math.max.apply(null, vals.map(Math.abs).concat([0])) || 1, bw = W / Math.max(1, n);
  var hasNeg = vals.some(function (v) { return v < 0; }), zero = hasNeg ? H / 2 : H, scale = hasNeg ? H / 2 / m : H / m;
  CH[id] = { kind: "bar", pts: points, money: o.money, pct: o.pct, n: n };
  var bars = points.map(function (p, i) {
    var h = Math.abs(p.v) * scale, x = i * bw + bw * 0.18, w = Math.max(1.5, bw * 0.64);
    return p.v ? '<rect class="' + (p.v >= 0 ? "bu" : "bd") + '" x="' + x.toFixed(1) + '" y="' + (p.v >= 0 ? zero - h : zero).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(1, h).toFixed(1) + '"/>' : "";
  }).join("");
  var top = hasNeg ? m : m, ys = (hasNeg ? [1, 0, -1] : [1, 0.5, 0]).map(function (f, k) { return '<span style="top:' + (hasNeg ? k * 50 : (1 - f) * 100) + '%">' + esc(o.pct ? pct(top * f) : axisFmt(top * f, o.money)) + "</span>"; }).join("");
  return '<div class="lc ac bc" data-chart="' + id + '"><div class="lc-y">' + ys + '</div><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" style="height:' + H + 'px" role="img" aria-label="' + esc(o.label || "bar chart") + '">' +
    '<line class="gl" x1="0" x2="' + W + '" y1="' + zero + '" y2="' + zero + '"/>' + bars + '<line class="hov" x1="-10" x2="-10" y1="0" y2="' + H + '" style="display:none"/></svg>' +
    (o.empty ? '<div class="lc-note">' + esc(o.empty) + "</div>" : "") + xTicksC(n, points.map(function (p) { return p.label; })) + "</div>";
}
var PALETTE = ["#5cf5b0", "#6aa8ff", "#f5c66b", "#c58bff", "#ff8f6b", "#4fd6e8", "#ff7a85", "#b5e86b"];
function donut(items, centerTop, centerSub) {
  var tot = sum(items.map(function (x) { return x.v; })), C = 2 * Math.PI * 42, off = 0;
  var segs = tot ? items.map(function (x, i) {
    var len = (x.v / tot) * C, s = '<circle r="42" cx="60" cy="60" fill="none" stroke="' + PALETTE[i % PALETTE.length] + '" stroke-width="14" stroke-dasharray="' + len.toFixed(2) + " " + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 60 60)"><title>' + esc(x.label) + "</title></circle>";
    off += len; return s;
  }).join("") : "";
  return '<div class="donut"><svg viewBox="0 0 120 120" role="img" aria-label="Allocation"><circle r="42" cx="60" cy="60" fill="none" stroke="var(--panel-2)" stroke-width="14"/>' + segs + '</svg><div class="donut-c"><b>' + esc(centerTop) + "</b><span>" + esc(centerSub) + "</span></div></div>";
}
function bindCharts(root) {
  Array.prototype.forEach.call(root.querySelectorAll(".lc.ac[data-chart]"), function (el) {
    var c = CH[el.getAttribute("data-chart")]; if (!c || !c.n) return;
    var svg = el.querySelector("svg"), hov = el.querySelector(".hov"), tip = $("tip");
    function move(ev) {
      var r = svg.getBoundingClientRect(), x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, i, hx;
      if (c.kind === "line") { i = Math.round((x / r.width) * (c.n - 1)); i = Math.max(0, Math.min(c.n - 1, i)); hx = c.n > 1 ? (i / (c.n - 1)) * 1000 : 500; }
      else { i = Math.floor((x / r.width) * c.n); i = Math.max(0, Math.min(c.n - 1, i)); hx = ((i + 0.5) / c.n) * 1000; }
      hov.setAttribute("x1", hx); hov.setAttribute("x2", hx); hov.style.display = "";
      if (c.kind === "candle") {
        var k = c.cs[i], ch = k.o ? ((k.c - k.o) / k.o) * 100 : null;
        tip.innerHTML = '<div class="t-row t-cur"><span>' + esc(k.label) + "</span><b class=\"" + (k.c > k.o ? "up" : k.c < k.o ? "down" : "") + '">' + (ch == null ? "—" : (ch > 0 ? "+" : "") + pct(ch)) + "</b></div>" +
          ["Open", "High", "Low", "Close"].map(function (lbl, j) { return '<div class="t-row t-prev"><span>' + lbl + "</span><b>" + money([k.o, k.h, k.l, k.c][j]) + "</b></div>"; }).join("") +
          '<div class="t-row t-prev"><span>Volume</span><b>' + num(k.vol) + " events</b></div>";
      } else {
        var p = c.pts[i];
        tip.innerHTML = '<div class="t-row t-cur"><span>' + esc(p.label) + "</span><b>" + esc(c.pct ? pct(p.v) : c.money ? money(p.v) : num(p.v)) + "</b></div>";
      }
      tip.hidden = false;
      var tx = Math.min(window.innerWidth - tip.offsetWidth - 8, (ev.touches ? ev.touches[0].clientX : ev.clientX) + 14);
      tip.style.left = tx + "px"; tip.style.top = Math.max(8, (ev.touches ? ev.touches[0].clientY : ev.clientY) - tip.offsetHeight - 10) + "px";
    }
    function leave() { hov.style.display = "none"; tip.hidden = true; }
    svg.addEventListener("mousemove", move); svg.addEventListener("touchmove", move, { passive: true });
    svg.addEventListener("mouseleave", leave); svg.addEventListener("touchend", leave);
  });
}

/* ---------------- navigation ---------------- */
var I = {
  home: '<path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z"/>',
  ticker: '<path d="M5 4v12M5 7h-1.5v5H5M10 3v14M10 6H8.5v6H10M15 6v10M15 9h1.5v4H15"/>',
  portfolio: '<circle cx="10" cy="10" r="7"/><path d="M10 3v7h7"/>',
  signals: '<path d="M11 2 4 11h5l-1 7 7-9h-5z"/>',
  tape: '<path d="M2 6h16M2 10h16M2 14h10"/>',
  volatility: '<path d="M2 12l3-5 3 7 3-9 3 6 2-3h2"/>',
  subscribers: '<circle cx="10" cy="7" r="3"/><path d="M4 17c.6-3.2 3-5 6-5s5.4 1.8 6 5"/>',
  plans: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 8h14M7 12h3"/>',
  revenue: '<path d="M4 16V9M8 16V5M12 16v-5M16 16V7"/>',
  churn: '<path d="M3 5l5 5 3-3 6 6M17 9v4h-4"/>',
  pricing: '<path d="M10 2 3 6v4c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6z"/><path d="M7.5 10l2 2 3.5-4"/>',
  import: '<path d="M10 3v10M6 9l4 4 4-4M4 17h12"/>',
  settings: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>'
};
var NAV = [
  { k: "home", t: "Home" },
  { sep: "Markets" }, { k: "ticker", t: "MRR Ticker" }, { k: "portfolio", t: "Plan Portfolio" }, { k: "signals", t: "Signals & Alerts" }, { k: "tape", t: "Live Tape" }, { k: "volatility", t: "Volatility Index" },
  { sep: "Business" }, { k: "subscribers", t: "Subscribers" }, { k: "plans", t: "Plans" }, { k: "revenue", t: "Revenue" }, { k: "churn", t: "Churn" }, { k: "pricing", t: "Pricing page" },
  { sep: "Data" }, { k: "import", t: "Import CSV" }, { k: "settings", t: "Settings" }
];
var ROUTES = NAV.filter(function (n) { return n.k; }).map(function (n) { return n.k; }).concat(["subscriber"]);
function renderNav() {
  var trig = state.loaded ? triggeredSignals().length : 0;
  $("sb-nav").innerHTML = NAV.map(function (n) {
    if (n.sep) return '<div class="sb-sec">' + esc(n.sep) + "</div>";
    var on = state.route === n.k || (n.k === "subscribers" && state.route === "subscriber");
    return '<a href="#' + n.k + '" data-route="' + n.k + '"' + (on ? ' class="on" aria-current="page"' : "") + '><svg viewBox="0 0 20 20">' + I[n.k] + "</svg>" + esc(n.t) +
      (n.k === "signals" && trig ? '<span class="nav-badge">' + trig + "</span>" : "") + "</a>";
  }).join("");
}
function renderProductSelect() {
  var sel = $("prod-select");
  sel.innerHTML = state.products.map(function (p) { return '<option value="' + p.id + '"' + (p.id === state.pid ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + '<option value="__new">+ Add product…</option>';
}
$("prod-select").addEventListener("change", function () {
  var v = this.value;
  if (v === "__new") { this.value = state.pid; openProductModal(null); return; }
  selectProduct(v);
});
function route(keepScroll) {
  var h = (location.hash || "#home").slice(1).split("/");
  state.route = ROUTES.indexOf(h[0]) > -1 ? h[0] : "home"; state.arg = h[1] || null;
  if (!state.product) return;
  renderNav();
  CH = {};
  var y = window.scrollY, html;
  try { html = (PAGES[state.route] || PAGES.home)(); } catch (e) { html = '<p class="err">Something went wrong rendering this page: ' + esc(e.message) + "</p>"; console.error(e); }
  $("content").innerHTML = html;
  bindCharts($("content"));
  if (BIND[state.route]) BIND[state.route]();
  renderTape();
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  document.title = (NAV.find(function (n) { return n.k === state.route; }) || { t: "Subscriber" }).t + " · " + state.product.name + " · Glimify";
  notifySignals();
  $("view-app").classList.remove("nav-open");
}
/* Re-render with fresh data without wiping a form the person is using. */
function softRoute() {
  var a = document.activeElement, busy = a && $("content").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  if (busy || ["settings", "import", "pricing"].indexOf(state.route) > -1) { renderNav(); renderTape(); notifySignals(); return; }
  route(true);
}
window.addEventListener("hashchange", function () { if (state.user && state.product) route(false); });
$("range").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-r]"); if (!b) return;
  state.range = parseInt(b.getAttribute("data-r"), 10);
  try { localStorage.setItem("glimify-app-range", state.range); } catch (e2) {}
  syncRange(); route(true);
});
function syncRange() { Array.prototype.forEach.call($("range").querySelectorAll("button"), function (b) { b.classList.toggle("on", parseInt(b.getAttribute("data-r"), 10) === state.range); }); }
syncRange();
function rangeLabel() { return state.range === 365 ? "last 12 months" : "last " + state.range + " days"; }
$("btn-menu").addEventListener("click", function () { $("view-app").classList.add("nav-open"); });
$("sb-overlay").addEventListener("click", function () { $("view-app").classList.remove("nav-open"); });
$("btn-theme").addEventListener("click", function () {
  var cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", cur);
  try { localStorage.setItem("glimify-app-theme", cur); } catch (e) {}
});
$("btn-sound").addEventListener("click", function () {
  state.muted = !state.muted;
  try { localStorage.setItem("glimify-app-muted", state.muted ? "1" : "0"); } catch (e) {}
  renderSoundBtn();
  if (!state.muted) playFor("lead", true);
  updateSoundHint();
});
renderSoundBtn();
$("btn-acct").addEventListener("click", function (e) { e.stopPropagation(); var m = $("acct-menu"); m.hidden = !m.hidden; this.setAttribute("aria-expanded", String(!m.hidden)); });
document.addEventListener("click", function (e) { if (!e.target.closest(".acct")) $("acct-menu").hidden = true; });

function notifySignals() {
  triggeredSignals().forEach(function (s) {
    if (state.firedSignals[s.id]) return;
    state.firedSignals[s.id] = 1;
    toast("Signal: " + signalText(s), "warn");
  });
}

/* ---------------- shared bits ---------------- */
function head(title, sub, actions) {
  return '<div class="page-head"><div><h1>' + esc(title) + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + "</div>" + (actions ? '<div class="ph-actions">' + actions + "</div>" : "") + "</div>";
}
function card(title, body, extra) {
  extra = extra || {};
  return '<div class="card' + (extra.cls ? " " + extra.cls : "") + '"><div class="card-h"><h2>' + esc(title) + "</h2>" + (extra.link ? '<a href="#' + extra.link + '">' + esc(extra.linkText || "View all") + "</a>" : extra.sub ? '<span class="sub">' + extra.sub + "</span>" : "") + "</div>" + body + "</div>";
}
function stat(label, val, change, sub) { return '<div class="card stat"><div class="m-label">' + esc(label) + '</div><div class="m-row"><span class="m-val">' + val + "</span>" + (change || "") + "</div>" + (sub ? '<div class="s-sub">' + sub + "</div>" : "") + "</div>"; }
function emptyState(title, text, actions) {
  return '<div class="card empty-card"><div class="ec-ico"><svg viewBox="0 0 20 20">' + I.ticker + '</svg></div><h2>' + esc(title) + "</h2><p>" + text + "</p>" + (actions ? '<div class="ec-actions">' + actions + "</div>" : "") + "</div>";
}
function btn(label, act, primary, extra) { return '<button type="button" class="btn' + (primary ? " btn-primary" : "") + '" data-act="' + act + '"' + (extra || "") + ">" + esc(label) + "</button>"; }
function setupSteps() {
  var steps = [
    { done: state.plans.length > 0, t: "Add a plan", d: "Name, price and billing interval.", act: "new-plan" },
    { done: state.customers.length > 0, t: "Add or import subscribers", d: "Enter them by hand or upload a CSV.", act: "new-sub" },
    { done: !!state.product.pricing_published, t: "Publish your pricing page", d: "A shareable public page built from your plans.", href: "#pricing" },
    { done: state.signals.length > 0, t: "Set a signal", d: "Get alerted when MRR moves.", href: "#signals" }
  ];
  if (steps.every(function (s) { return s.done; })) return "";
  return card("Get set up", '<ol class="steps">' + steps.map(function (s) {
    return '<li class="' + (s.done ? "done" : "") + '"><span class="st-dot"></span><div><b>' + esc(s.t) + "</b><small>" + esc(s.d) + "</small></div>" +
      (s.done ? '<span class="badge ok">Done</span>' : s.act ? btn("Start", s.act, false) : '<a class="btn" href="' + s.href + '">Open</a>') + "</li>";
  }).join("") + "</ol>", { sub: steps.filter(function (s) { return s.done; }).length + " of " + steps.length + " done" });
}
function noData() { return !state.events.length; }
function noDataCard() {
  return emptyState("No revenue data yet", "Charts here are drawn only from subscriptions you add or import — nothing is simulated. Add a plan, then add your first subscriber.",
    btn("Add a plan", "new-plan", !state.plans.length) + btn("Add subscriber", "new-sub", !!state.plans.length) + '<a class="btn" href="#import">Import CSV</a>');
}
function tapeRow(e) {
  var c = state.custBy[e.customer_id], s = state.subBy[e.subscription_id], p = s && state.planBy[s.plan_id];
  var d = Number(e.mrr_delta) || 0, amt = e.amount != null ? Number(e.amount) : null;
  return '<tr class="tr-' + (EV[e.type] ? EV[e.type].cls : "") + '"><td class="mono">' + esc(fmtDate(e.occurred_at, true)) + "</td><td>" + evBadge(e.type) + '</td><td class="em">' + (c ? '<a href="#subscriber/' + c.id + '">' + esc(c.email || c.name || "Customer") + "</a>" : "—") + "</td><td>" + esc(p ? p.name : "—") +
    '</td><td class="num ' + (d > 0 ? "up" : d < 0 ? "down" : "") + '">' + (d ? (d > 0 ? "▲ +" : "▼ ") + esc(money(d)) : "—") + '</td><td class="num">' + (amt != null ? esc(money(amt)) : "—") + "</td><td class=\"muted\">" + esc(e.note || "") + "</td></tr>";
}
function tapeTable(evs, empty) {
  if (!evs.length) return '<p class="empty">' + esc(empty) + "</p>";
  return '<div class="tbl-wrap"><table class="tbl tape-tbl"><thead><tr><th>Time</th><th>Event</th><th>Customer</th><th>Plan</th><th class="num">MRR Δ</th><th class="num">Amount</th><th>Note</th></tr></thead><tbody>' + evs.map(tapeRow).join("") + "</tbody></table></div>";
}
function renderTape() {
  var evs = state.events.slice(-24).reverse();
  if (!evs.length) { $("tape").hidden = true; return; }
  $("tape").hidden = false;
  var items = evs.map(function (e) {
    var c = state.custBy[e.customer_id], d = Number(e.mrr_delta) || 0, ok = EV[e.type] && EV[e.type].cls;
    return '<span class="tp ' + (ok || "") + '"><b>' + esc((EV[e.type] || { label: e.type }).label.toUpperCase()) + "</b> " + esc(c ? c.email || c.name || "" : "") + " <i>" + (d ? (d > 0 ? "▲ " : "▼ ") + esc(money(Math.abs(d))) : e.amount ? esc(money(e.amount)) : "") + "</i> <small>" + esc(ago(e.occurred_at)) + "</small></span>";
  }).join("");
  $("tape-track").innerHTML = items + items;
  $("tape-track").style.animationDuration = Math.max(30, evs.length * 5) + "s";
}

/* ---------------- pages ---------------- */
var PAGES = {}, BIND = {};

PAGES.home = function () {
  var k = kpis(state.range), p = state.product;
  var out = head(p.name, "Overview · " + rangeLabel(), btn("Add subscriber", "new-sub", true) + btn("Record payment", "new-payment"));
  var trig = triggeredSignals();
  if (trig.length) out += '<div class="alert-strip">' + trig.map(function (s) { return '<a href="#signals"><svg viewBox="0 0 20 20">' + I.signals + "</svg><b>Signal triggered</b> " + esc(signalText(s)) + "</a>"; }).join("") + "</div>";
  out += '<div class="metrics">' + [
    ["MRR", money(k.mrr), chg(k.mrr, k.mrrPrev)], ["ARR · market cap", money(k.arr, { compact: true }), chg(k.arr, k.arrPrev)],
    ["Active subscribers", num(k.act), chg(k.act, k.actPrev)], ["Leads", num(k.leads), chg(k.leads, k.leadsPrev)],
    ["ARPU", money(k.arpu), chg(k.arpu, k.arpuPrev)], ["Churn rate", pct(k.churnRate), ""]
  ].map(function (m) { return '<div class="metric"><span class="m-label">' + esc(m[0]) + '</span><div class="m-row"><span class="m-val">' + m[1] + "</span>" + m[2] + "</div></div>"; }).join("") + "</div>";
  if (noData()) return out + '<div class="stack" style="margin-top:16px">' + setupSteps() + noDataCard() + "</div>";
  var cs = candles(state.range > 90 ? 365 : state.range, state.range > 90 ? "week" : "day");
  out += '<div class="grid g3" style="margin-top:16px"><div class="card span2"><div class="chart-top"><div><h2>' + esc(p.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "MRR") + ' · MRR</h2><div class="chart-total"><b>' + money(k.mrr) + "</b>" + chg(k.mrr, k.mrrPrev) + '</div></div><a class="btn" href="#ticker">Open ticker</a></div>' + candleChart(cs, { h: 220 }) + "</div>" +
    card("Live tape", tapeMini(8), { link: "tape" }) + "</div>";
  out += '<div class="grid g3" style="margin-top:16px">' + card("MRR movement", movement(k), { sub: rangeLabel() }) + card("Plan allocation", allocation(), { link: "portfolio" }) + (setupSteps() || card("Signals", signalsMini(), { link: "signals" })) + "</div>";
  return out;
};
function tapeMini(n) {
  var evs = state.events.slice(-n).reverse();
  if (!evs.length) return '<p class="empty">No events yet</p>';
  return '<div class="tape-mini">' + evs.map(function (e) {
    var c = state.custBy[e.customer_id], d = Number(e.mrr_delta) || 0;
    return '<div class="tm-row"><span class="tm-t">' + esc(ago(e.occurred_at)) + "</span>" + evBadge(e.type) + '<span class="tm-c">' + esc(c ? c.email || c.name || "" : "") + '</span><span class="tm-v ' + (d > 0 ? "up" : d < 0 ? "down" : "") + '">' + (d ? (d > 0 ? "+" : "") + esc(money(d)) : e.amount ? esc(money(e.amount)) : "") + "</span></div>";
  }).join("") + "</div>";
}
function movement(k) {
  var rows = [["New", k.newMRR, "up"], ["Expansion", k.exp, "up"], ["Contraction", -k.con, "down"], ["Churned", -k.churnedMRR, "down"]];
  var m = Math.max.apply(null, rows.map(function (r) { return Math.abs(r[1]); }).concat([1]));
  return '<div class="mv">' + rows.map(function (r) {
    return '<div class="mv-row"><span>' + r[0] + '</span><div class="mv-track"><div class="mv-fill ' + r[2] + '" style="width:' + (Math.abs(r[1]) / m) * 100 + '%"></div></div><b class="' + (r[1] ? r[2] : "") + '">' + (r[1] > 0 ? "+" : "") + esc(money(r[1])) + "</b></div>";
  }).join("") + '<div class="mv-row tot"><span>Net new MRR</span><div></div><b class="' + (k.net > 0 ? "up" : k.net < 0 ? "down" : "") + '">' + (k.net > 0 ? "+" : "") + esc(money(k.net)) + "</b></div></div>";
}
function allocation() {
  var ps = planStats(state.range).filter(function (r) { return r.mrr > 0; });
  if (!ps.length) return '<p class="empty">No paying subscribers yet</p>';
  return '<div class="alloc">' + donut(ps.map(function (r) { return { v: r.mrr, label: r.plan.name }; }), money(currentMRR(), { compact: true }), "MRR") +
    '<div class="legend-l">' + ps.slice(0, 6).map(function (r, i) { return '<div><i style="background:' + PALETTE[i % PALETTE.length] + '"></i><span>' + esc(r.plan.name) + "</span><b>" + pct(r.share) + "</b></div>"; }).join("") + "</div></div>";
}
function signalsMini() {
  if (!state.signals.length) return '<p class="empty">No signals yet. <a href="#signals">Create one</a></p>';
  return '<div class="kv">' + state.signals.slice(0, 5).map(function (s) { var r = evalSignal(s); return "<div><span>" + esc(signalText(s)) + "</span><b>" + (r.hit ? badge("Triggered", "warn") : !s.enabled ? badge("Paused") : badge("Watching", "ok")) + "</b></div>"; }).join("") + "</div>";
}

PAGES.ticker = function () {
  var k = kpis(state.range), bucket = state.candle, days = state.range;
  if (bucket === "week" && days < 28) days = 28;
  var cs = candles(days, bucket), last = cs[cs.length - 1] || { o: 0, c: 0, h: 0, l: 0 };
  var hi = Math.max.apply(null, cs.map(function (c) { return c.h; }).concat([0])), lo = Math.min.apply(null, cs.map(function (c) { return c.l; }).concat([hi]));
  var dayCh = last.o ? ((last.c - last.o) / last.o) * 100 : null;
  var sym = (state.product.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "MRR");
  var out = head("MRR Ticker", "Your MRR charted like a stock — every candle is built from the subscription events you recorded.",
    '<div class="seg sm" id="candle-seg"><button data-b="day" class="' + (bucket === "day" ? "on" : "") + '">Daily</button><button data-b="week" class="' + (bucket === "week" ? "on" : "") + '">Weekly</button></div>');
  out += '<div class="card ticker-card"><div class="tk-head"><div><div class="tk-sym">' + esc(sym) + ' <span class="muted">· ' + esc(state.product.currency) + '</span></div><div class="tk-price">' + money(k.mrr) + ' <small>MRR</small></div>' +
    '<div class="tk-chg">' + chg(k.mrr, k.mrrPrev) + ' <span class="muted">' + rangeLabel() + "</span>" + (dayCh != null ? ' · Today <span class="' + (dayCh > 0 ? "up" : dayCh < 0 ? "down" : "") + '">' + (dayCh > 0 ? "+" : "") + pct(dayCh) + "</span>" : "") + "</div></div>" +
    '<div class="tk-stats"><div><span>Market cap (ARR)</span><b>' + money(k.arr, { compact: true }) + "</b></div><div><span>Range high</span><b>" + money(hi) + "</b></div><div><span>Range low</span><b>" + money(lo) + "</b></div><div><span>Open</span><b>" + money(cs.length ? cs[0].o : 0) + "</b></div><div><span>Volume</span><b>" + num(sum(cs.map(function (c) { return c.vol; }))) + " events</b></div><div><span>Subscribers</span><b>" + num(k.act) + "</b></div></div></div>" +
    candleChart(cs, { h: 300, empty: noData() ? "No subscription events yet — add a subscriber to start the chart" : "" }) +
    '<p class="note">Open / high / low / close are your MRR at the start, peak, trough and end of each ' + (bucket === "week" ? "week" : "day") + ". Volume bars count MRR-moving events. Market cap here simply means ARR (MRR × 12).</p></div>";
  if (noData()) out += '<div style="margin-top:16px">' + noDataCard() + "</div>";
  return out;
};
BIND.ticker = function () {
  var s = $("candle-seg"); if (!s) return;
  s.addEventListener("click", function (e) { var b = e.target.closest("button[data-b]"); if (!b) return; state.candle = b.getAttribute("data-b"); route(true); });
};

PAGES.portfolio = function () {
  var rows = planStats(state.range), tot = currentMRR();
  var out = head("Plan Portfolio", "Each plan is a holding in your revenue portfolio — its weight, its growth and how many subscribers back it.", btn("Add plan", "new-plan", true));
  if (!state.plans.length) return out + emptyState("No plans yet", "Create your plans first — then every subscriber you add shows up here as a position in that plan.", btn("Add a plan", "new-plan", true));
  var live = rows.filter(function (r) { return r.mrr > 0; });
  out += '<div class="grid g3"><div class="card">' + '<div class="card-h"><h2>Allocation</h2><span class="sub">by MRR</span></div>' + (live.length ? allocation() : '<p class="empty">No paying subscribers yet</p>') + "</div>" +
    '<div class="card span2"><div class="card-h"><h2>Holdings</h2><span class="sub">change vs ' + state.range + ' days ago</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Plan</th><th class="num">Price</th><th class="num">Subscribers</th><th class="num">MRR</th><th class="num">Weight</th><th class="num">Change</th><th class="num">Churned</th></tr></thead><tbody>' +
    rows.map(function (r, i) {
      var p = r.plan;
      return '<tr><td><i class="sw" style="background:' + (r.mrr > 0 ? PALETTE[live.indexOf(r) % PALETTE.length] : "var(--line-2)") + '"></i>' + esc(p.name) + (p.archived ? " " + badge("Archived") : "") + '</td><td class="num">' + (p.id ? esc(money(p.price)) + "/" + intervalShort(p.interval) : "—") + '</td><td class="num">' + num(r.subs) + '</td><td class="num">' + esc(money(r.mrr)) + '</td><td class="num">' + pct(r.share) + '</td><td class="num">' + chg(r.mrr, r.prev) + '</td><td class="num">' + num(r.churned) + "</td></tr>";
    }).join("") + '</tbody></table></div><p class="note">Total MRR ' + esc(money(tot)) + ". Weight is each plan's share of current MRR. Change compares plan MRR with " + state.range + " days ago, using each subscription's current price.</p></div></div>";
  if (live.length) {
    var max = Math.max.apply(null, live.map(function (r) { return r.mrr; }));
    out += '<div class="card" style="margin-top:16px"><div class="card-h"><h2>Market map</h2><span class="sub">size = MRR · colour = change</span></div><div class="heat">' + live.map(function (r) {
      var c = r.prev ? ((r.mrr - r.prev) / r.prev) * 100 : r.mrr ? 100 : 0;
      return '<div class="hm ' + (c > 0 ? "up" : c < 0 ? "down" : "") + '" style="flex-grow:' + Math.max(1, Math.round((r.mrr / max) * 10)) + '"><b>' + esc(r.plan.name) + "</b><span>" + esc(money(r.mrr, { compact: true })) + "</span><small>" + (r.prev ? (c > 0 ? "+" : "") + pct(c) : "new") + "</small></div>";
    }).join("") + "</div></div>";
  }
  return out;
};

PAGES.signals = function () {
  var out = head("Signals & Alerts", "Price alerts for your business. Set a threshold and Glimify flags it here the moment your numbers cross it.", btn("New signal", "new-signal", true));
  if (!state.signals.length) return out + emptyState("No signals yet", "Examples: “MRR drops 5% in a day”, “Churned subscribers goes above 3 in 7 days”, “MRR goes above " + esc(money(10000, { whole: true })) + "”.", btn("Create a signal", "new-signal", true));
  out += '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Signal</th><th>Status</th><th class="num">Now</th><th class="num">Before</th><th class="num">Change</th><th></th></tr></thead><tbody>' + state.signals.map(function (s) {
    var r = evalSignal(s), isMoney = s.metric === "mrr";
    var st = !s.enabled ? badge("Paused") : r.hit ? badge("Triggered", "warn") : r.nodata ? badge("Waiting for data") : badge("Watching", "ok");
    return "<tr><td>" + esc(signalText(s)) + "</td><td>" + st + '</td><td class="num">' + esc(isMoney ? money(r.cur) : num(r.cur)) + '</td><td class="num">' + esc(isMoney ? money(r.prev) : num(r.prev)) + '</td><td class="num">' + (r.change == null ? "—" : chg(r.cur, r.prev)) + '</td><td class="num row-act"><button class="linkish" data-act="toggle-signal" data-id="' + s.id + '">' + (s.enabled ? "Pause" : "Resume") + '</button> <button class="linkish danger" data-act="del-signal" data-id="' + s.id + '">Delete</button></td></tr>';
  }).join("") + '</tbody></table></div><p class="note">Signals are checked every time data changes in this app (and every 45 seconds while it is open). “Before” is the value ' + "one window ago.</p></div>";
  return out;
};

PAGES.tape = function () {
  var f = state.tapeFilter, evs = state.events.slice().reverse().filter(function (e) {
    if (f === "all") return true; if (f === "up") return ["signup", "upgrade", "reactivation"].indexOf(e.type) > -1; if (f === "down") return ["downgrade", "churn"].indexOf(e.type) > -1; return ["payment", "renewal"].indexOf(e.type) > -1;
  }).slice(0, 300);
  var out = head("Live Tape", "Every subscription event as it prints — like a trade tape. New events stream in live" + (state.muted ? " (sound is muted)." : " with a sound for each."), btn("Record payment / renewal", "new-payment", true));
  out += '<div class="toolbar"><div class="seg sm" id="tape-seg">' + [["all", "All"], ["up", "Buys ▲"], ["down", "Sells ▼"], ["pay", "Payments"]].map(function (x) { return '<button data-f="' + x[0] + '" class="' + (f === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + '</div><span class="muted sm-t">Last sync ' + esc(fmtTime(state.lastSync || Date.now())) + "</span></div>";
  out += '<div class="card">' + tapeTable(evs, noData() ? "The tape is empty. Events appear here automatically when you add, change or cancel a subscription." : "No events match this filter") + "</div>";
  return out;
};
BIND.tape = function () {
  var s = $("tape-seg"); if (!s) return;
  s.addEventListener("click", function (e) { var b = e.target.closest("button[data-f]"); if (!b) return; state.tapeFilter = b.getAttribute("data-f"); route(true); });
};

PAGES.volatility = function () {
  var days = Math.max(7, state.range), v = volatility(days);
  var churnIdx = dailySeries(days, function (d0, d1) { var m = mrrAt(d0 - 1); var ch = -sum(evIn("churn", d0 - 1, d1 - 1).concat(evIn("downgrade", d0 - 1, d1 - 1)).map(function (e) { return e.mrr_delta; })); return m ? r2((ch / m) * 100) : 0; });
  var k = kpis(state.range);
  var level = v.vol == null ? "—" : v.vol < 1 ? "Calm" : v.vol < 3 ? "Moderate" : v.vol < 8 ? "Elevated" : "High";
  var out = head("Volatility & Churn Index", "How much your MRR swings day to day, and how much of it is lost to churn and downgrades.");
  out += '<div class="stat-row">' + stat("Volatility (σ daily)", v.vol == null ? "—" : pct(v.vol, 2), "", v.vol == null ? "Needs at least 2 days with MRR" : level + " · std. dev. of daily MRR % moves") +
    stat("Revenue churn", pct(k.revChurn), "", "Churned MRR ÷ MRR " + state.range + " days ago") + stat("Logo churn", pct(k.churnRate), "", num(k.churned) + " of " + num(k.actPrev) + " subscribers") +
    stat("Peak churn day", (function () { var m = Math.max.apply(null, churnIdx.map(function (p) { return p.v; }).concat([0])); return m ? pct(m) : "—"; })(), "", "Highest daily churn index") + "</div>";
  out += '<div class="grid g2" style="margin-top:16px">' + card("Daily MRR returns", barChart(v.cs.map(function (c, i) { return { label: c.label, v: r2(v.rets[i]) }; }), { pct: true, h: 180, empty: noData() ? "No data yet" : "" }), { sub: "% change per day" }) +
    card("Churn index", lineChart(churnIdx, { h: 180, pct: true, label: "Churn index", color: "var(--down)", empty: noData() ? "No data yet" : "" }), { sub: "churned + downgraded MRR as % of MRR, per day" }) + "</div>";
  if (noData()) out += '<div style="margin-top:16px">' + noDataCard() + "</div>";
  return out;
};

/* ----- subscribers ----- */
function latestSub(cid) {
  var ss = state.subs.filter(function (s) { return s.customer_id === cid; });
  ss.sort(function (a, b) { return (paying(b) - paying(a)) || t(b.started_at) - t(a.started_at); });
  return ss[0] || null;
}
PAGES.subscribers = function () {
  var q = (state.q || "").toLowerCase();
  var out = head("Subscribers", num(state.customers.length) + " customers · " + num(state.subs.filter(paying).length) + " paying", btn("Add customer", "new-customer") + btn("Add subscription", "new-sub", true));
  if (!state.customers.length) return out + emptyState("No subscribers yet", "Add your customers by hand, or import them from a CSV export of your current billing tool.", btn("Add subscription", "new-sub", true) + '<a class="btn" href="#import">Import CSV</a>');
  var rows = state.customers.map(function (c) { return { c: c, s: latestSub(c.id) }; }).filter(function (r) {
    if (!q) return true; return ((r.c.email || "") + " " + (r.c.name || "") + " " + (r.s && state.planBy[r.s.plan_id] ? state.planBy[r.s.plan_id].name : "")).toLowerCase().indexOf(q) > -1;
  }).sort(function (a, b) { return t(b.c.created_at) - t(a.c.created_at); });
  out += '<div class="toolbar"><input class="search" id="sub-q" type="search" placeholder="Search email, name or plan" value="' + esc(state.q || "") + '"></div>';
  out += '<div class="card"><div class="tbl-wrap"><table class="tbl click"><thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th class="num">MRR</th><th>Customer since</th></tr></thead><tbody>' + (rows.length ? rows.map(function (r) {
    var p = r.s && state.planBy[r.s.plan_id];
    return '<tr data-href="#subscriber/' + r.c.id + '"><td class="em"><a href="#subscriber/' + r.c.id + '">' + esc(r.c.email || r.c.name || "Unnamed") + "</a>" + (r.c.name && r.c.email ? ' <span class="muted">' + esc(r.c.name) + "</span>" : "") + "</td><td>" + esc(p ? p.name : r.s ? "—" : "No subscription") + "</td><td>" + (r.s ? statusBadge(r.s.status) : badge("Lead")) + '</td><td class="num">' + (r.s && paying(r.s) ? esc(money(r.s.mrr)) : "—") + "</td><td>" + esc(fmtDate(r.c.created_at)) + "</td></tr>";
  }).join("") : '<tr><td colspan="5" class="empty">No matches</td></tr>') + "</tbody></table></div></div>";
  return out;
};
BIND.subscribers = function () {
  var q = $("sub-q");
  if (q) q.addEventListener("input", function () { state.q = q.value; clearTimeout(state._q); state._q = setTimeout(function () { route(true); var n = $("sub-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); });
  Array.prototype.forEach.call($("content").querySelectorAll("tr[data-href]"), function (tr) { tr.addEventListener("click", function (e) { if (!e.target.closest("a,button")) location.hash = tr.getAttribute("data-href"); }); });
};
PAGES.subscriber = function () {
  var c = state.custBy[state.arg];
  if (!c) return head("Subscriber", "") + emptyState("Not found", "This customer doesn't exist in this product (it may have been deleted).", '<a class="btn" href="#subscribers">Back to subscribers</a>');
  var subs = state.subs.filter(function (s) { return s.customer_id === c.id; }).sort(function (a, b) { return t(b.started_at) - t(a.started_at); });
  var evs = state.events.filter(function (e) { return e.customer_id === c.id; }).slice().reverse();
  var mrr = sum(subs.filter(paying).map(function (s) { return s.mrr; }));
  var paid = sum(evs.filter(function (e) { return e.type === "payment" || e.type === "renewal"; }).map(function (e) { return e.amount; }));
  var out = '<a class="crumb" href="#subscribers">← Subscribers</a>' + head(c.email || c.name || "Customer", esc(c.name && c.email ? c.name + " · " : "") + "Customer since " + esc(fmtDate(c.created_at)) + (c.country ? " · " + esc(c.country) : ""),
    btn("Edit", "edit-customer", false, ' data-id="' + c.id + '"') + btn("Add subscription", "new-sub", true, ' data-cid="' + c.id + '"'));
  out += '<div class="stat-row">' + stat("MRR", esc(money(mrr))) + stat("Subscriptions", num(subs.length), "", num(subs.filter(paying).length) + " paying") + stat("Recorded payments", esc(money(paid))) + stat("Events", num(evs.length)) + "</div>";
  out += '<div class="grid g2" style="margin-top:16px">' + card("Subscriptions", subs.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Plan</th><th>Status</th><th class="num">MRR</th><th>Started</th><th>Canceled</th><th></th></tr></thead><tbody>' + subs.map(function (s) {
    var p = state.planBy[s.plan_id];
    return "<tr><td>" + esc(p ? p.name : "—") + "</td><td>" + statusBadge(s.status) + '</td><td class="num">' + esc(money(s.mrr)) + "</td><td>" + esc(fmtDate(s.started_at)) + "</td><td>" + esc(s.canceled_at ? fmtDate(s.canceled_at) : "—") + '</td><td class="num row-act"><button class="linkish" data-act="edit-sub" data-id="' + s.id + '">Change</button>' + (s.status !== "canceled" ? ' <button class="linkish danger" data-act="cancel-sub" data-id="' + s.id + '">Cancel</button>' : "") + "</td></tr>";
  }).join("") + "</tbody></table></div>" : '<p class="empty">No subscriptions — this customer is a lead.</p>') +
    card("Notes", c.notes ? '<p class="pre">' + esc(c.notes) + "</p>" : '<p class="empty">No notes</p>') + "</div>";
  out += '<div style="margin-top:16px">' + card("Activity", tapeTable(evs, "No events yet"), { sub: '<button class="linkish" data-act="new-payment" data-cid="' + c.id + '">+ Record payment</button>' }) + "</div>";
  out += '<div class="danger-zone"><button class="linkish danger" data-act="del-customer" data-id="' + c.id + '">Delete customer and all of their subscriptions & events</button></div>';
  return out;
};

/* ----- plans ----- */
PAGES.plans = function () {
  var out = head("Plans", "The plans you sell. They power your pricing page, the portfolio view and default MRR for new subscriptions.", btn("Add plan", "new-plan", true));
  if (!state.plans.length) return out + emptyState("No plans yet", "Add your first plan — for example “Pro”, " + esc(money(29)) + " per month.", btn("Add a plan", "new-plan", true));
  var st = {}; planStats(state.range).forEach(function (r) { st[r.plan.id] = r; });
  out += '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Plan</th><th class="num">Price</th><th class="num">Monthly value</th><th class="num">Subscribers</th><th class="num">MRR</th><th>On pricing page</th><th></th></tr></thead><tbody>' + state.plans.map(function (p) {
    var r = st[p.id] || { subs: 0, mrr: 0 };
    return "<tr><td>" + esc(p.name) + (p.highlighted ? " " + badge("Featured", "ok") : "") + '</td><td class="num">' + esc(money(p.price)) + " / " + esc(p.interval) + '</td><td class="num">' + esc(money(monthly(p))) + '</td><td class="num">' + num(r.subs) + '</td><td class="num">' + esc(money(r.mrr)) + "</td><td>" + (p.archived ? badge("Hidden (archived)") : badge("Shown", "ok")) + '</td><td class="num row-act"><button class="linkish" data-act="edit-plan" data-id="' + p.id + '">Edit</button> <button class="linkish danger" data-act="del-plan" data-id="' + p.id + '">Delete</button></td></tr>';
  }).join("") + "</tbody></table></div></div>";
  return out;
};

/* ----- revenue ----- */
PAGES.revenue = function () {
  var k = kpis(state.range), days = state.range;
  var out = head("Revenue analytics", "MRR, ARR, ARPU, churn and LTV — calculated from your subscriptions and events · " + rangeLabel());
  out += '<div class="stat-row">' + stat("MRR", esc(money(k.mrr)), chg(k.mrr, k.mrrPrev)) + stat("ARR", esc(money(k.arr)), chg(k.arr, k.arrPrev)) + stat("ARPU", esc(money(k.arpu)), chg(k.arpu, k.arpuPrev), "MRR ÷ paying subscribers") +
    stat("LTV", k.ltv == null ? "—" : esc(money(k.ltv)), "", k.ltv == null ? "Needs at least one churn in the last 30 days" : "ARPU ÷ monthly churn (" + pct(k.monthlyChurn * 100) + ")") + "</div>";
  out += '<div class="stat-row" style="margin-top:16px">' + stat("Paying subscribers", num(k.act), chg(k.act, k.actPrev)) + stat("Trials", num(k.trials)) + stat("Churn rate", pct(k.churnRate), "", num(k.churned) + " churned · " + rangeLabel()) + stat("Payments recorded", esc(money(k.payments)), "", rangeLabel()) + "</div>";
  if (noData()) return out + '<div style="margin-top:16px">' + noDataCard() + "</div>";
  var mrrLine = dailySeries(days, function (d0, d1) { return d1 > Date.now() ? currentMRR() : mrrAt(d1 - 1); });
  var net = dailySeries(days, function (d0, d1) { return r2(sum(evIn(null, d0 - 1, d1 - 1).map(function (e) { return e.mrr_delta; }))); });
  var subsLine = dailySeries(days, function (d0, d1) { return activeAt(Math.min(Date.now(), d1 - 1)); });
  var arpuLine = dailySeries(days, function (d0, d1) { var a = activeAt(Math.min(Date.now(), d1 - 1)); return a ? r2(mrrAt(d1 - 1) / a) : 0; });
  out += '<div class="grid g2" style="margin-top:16px">' + card("MRR", lineChart(mrrLine, { money: true, label: "MRR" })) + card("Net new MRR per day", barChart(net, { money: true, label: "Net new MRR" })) +
    card("Paying subscribers", lineChart(subsLine, { label: "Paying subscribers" })) + card("ARPU", lineChart(arpuLine, { money: true, label: "ARPU" })) + "</div>";
  out += '<div style="margin-top:16px">' + card("MRR movement", movement(k), { sub: rangeLabel() }) + "</div>";
  return out;
};

/* ----- churn ----- */
PAGES.churn = function () {
  var k = kpis(state.range), from = Date.now() - state.range * DAY;
  var canceled = state.subs.filter(function (s) { return s.status === "canceled" && s.canceled_at && t(s.canceled_at) > from; }).sort(function (a, b) { return t(b.canceled_at) - t(a.canceled_at); });
  var out = head("Churn analysis", "Who left, when, from which plan and after how long · " + rangeLabel());
  out += '<div class="stat-row">' + stat("Logo churn", pct(k.churnRate), "", num(k.churned) + " subscribers") + stat("Revenue churn", pct(k.revChurn), "", esc(money(k.churnedMRR)) + " MRR lost") + stat("Contraction", esc(money(k.con)), "", "MRR lost to downgrades") +
    stat("Net revenue retention", k.mrrPrev ? pct(((k.mrrPrev + k.exp - k.con - k.churnedMRR) / k.mrrPrev) * 100) : "—", "", "excluding new subscribers") + "</div>";
  if (!state.subs.some(function (s) { return s.status === "canceled"; })) return out + '<div style="margin-top:16px">' + emptyState("No churn recorded", "When you cancel a subscription (or import canceled ones), the breakdown appears here.", '<a class="btn" href="#subscribers">Subscribers</a>') + "</div>";
  var byPlan = {}, tenure = { "< 1 month": 0, "1–3 months": 0, "3–6 months": 0, "6–12 months": 0, "12+ months": 0 };
  canceled.forEach(function (s) {
    var p = state.planBy[s.plan_id], n = p ? p.name : "No plan"; byPlan[n] = (byPlan[n] || 0) + 1;
    var m = (t(s.canceled_at) - t(s.started_at)) / (30 * DAY);
    tenure[m < 1 ? "< 1 month" : m < 3 ? "1–3 months" : m < 6 ? "3–6 months" : m < 12 ? "6–12 months" : "12+ months"]++;
  });
  function bars(obj) {
    var e = Object.keys(obj).map(function (x) { return [x, obj[x]]; }), tot = sum(e.map(function (x) { return x[1]; })), max = Math.max.apply(null, e.map(function (x) { return x[1]; }).concat([1]));
    if (!tot) return '<p class="empty">No churn in this period</p>';
    return '<div class="bars">' + e.map(function (x) { return '<div class="bar-row"><span class="lbl">' + esc(x[0]) + '</span><span class="val">' + num(x[1]) + ' <span class="muted" style="font-weight:400">· ' + Math.round((x[1] / tot) * 100) + '%</span></span><div class="bar-track"><div class="bar-fill neg" style="width:' + (x[1] / max) * 100 + '%"></div></div></div>'; }).join("") + "</div>";
  }
  var daily = dailySeries(state.range, function (d0, d1) { return -evIn("churn", d0 - 1, d1 - 1).length; });
  out += '<div class="grid g3" style="margin-top:16px">' + card("Churn by plan", bars(byPlan)) + card("Tenure before churn", bars(tenure)) + card("Churned per day", barChart(daily, { h: 150, empty: canceled.length ? "" : "No churn in this period" })) + "</div>";
  out += '<div style="margin-top:16px">' + card("Recently churned", canceled.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Plan</th><th class="num">MRR lost</th><th>Started</th><th>Canceled</th></tr></thead><tbody>' + canceled.slice(0, 100).map(function (s) {
    var c = state.custBy[s.customer_id], p = state.planBy[s.plan_id];
    return '<tr><td class="em">' + (c ? '<a href="#subscriber/' + c.id + '">' + esc(c.email || c.name || "Customer") + "</a>" : "—") + "</td><td>" + esc(p ? p.name : "—") + '</td><td class="num down">' + esc(money(s.mrr)) + "</td><td>" + esc(fmtDate(s.started_at)) + "</td><td>" + esc(fmtDate(s.canceled_at)) + "</td></tr>";
  }).join("") + "</tbody></table></div>" : '<p class="empty">No churn in this period</p>') + "</div>";
  return out;
};

/* ----- pricing page builder ----- */
function pricingUrl() { return new URL("pricing.html?p=" + state.pid, location.href).href; }
PAGES.pricing = function () {
  var p = state.product, shown = state.plans.filter(function (x) { return !x.archived; });
  var out = head("Pricing page", "A public pricing page generated from your plans. Only the product name, website, headline and visible plans are public — never your subscribers or revenue.");
  out += '<div class="grid g2"><div class="card"><div class="card-h"><h2>Page settings</h2>' + (p.pricing_published ? badge("Published", "ok") : badge("Draft")) + '</div><form id="pricing-form" class="auth-form">' +
    '<label>Headline<input id="pp-head" maxlength="120" value="' + esc(p.pricing_headline || "") + '" placeholder="Simple pricing for ' + esc(p.name) + '"></label>' +
    '<label>Subtitle<textarea id="pp-sub" maxlength="300" rows="3" placeholder="Start free, upgrade when you grow.">' + esc(p.pricing_subtitle || "") + "</textarea></label>" +
    '<label class="check"><input type="checkbox" id="pp-pub"' + (p.pricing_published ? " checked" : "") + "> Publish — anyone with the link can view this page</label>" +
    '<button class="btn btn-primary" type="submit">Save</button></form>' +
    (p.pricing_published ? '<div class="share"><input readonly id="pp-url" value="' + esc(pricingUrl()) + '"><button class="btn" type="button" data-act="copy-pricing">Copy link</button><a class="btn" target="_blank" rel="noopener" href="' + esc(pricingUrl()) + '">Open</a></div>' : '<p class="note">Publish to get a shareable link.</p>') +
    (!p.url ? '<p class="note">Tip: add your website in Settings so the “Get started” buttons link to it.</p>' : "") + "</div>" +
    '<div class="card"><div class="card-h"><h2>Preview</h2><span class="sub">' + num(shown.length) + " visible plan" + (shown.length === 1 ? "" : "s") + "</span></div>" +
    (shown.length ? '<div class="pp-prev"><h3>' + esc(p.pricing_headline || "Simple pricing for " + p.name) + "</h3>" + (p.pricing_subtitle ? "<p>" + esc(p.pricing_subtitle) + "</p>" : "") + '<div class="pp-cards">' + shown.map(function (pl) {
      return '<div class="pp-card' + (pl.highlighted ? " hl" : "") + '"><b>' + esc(pl.name) + '</b><div class="pp-price">' + esc(money(pl.price)) + "<small>/" + esc(intervalShort(pl.interval)) + "</small></div>" + (pl.description ? "<p>" + esc(pl.description) + "</p>" : "") + (pl.features && pl.features.length ? "<ul>" + pl.features.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
    }).join("") + "</div></div>" : '<p class="empty">Add plans (and don\'t archive them) to see them here. ' + '<a href="#plans">Manage plans</a></p>') + "</div></div>";
  return out;
};
BIND.pricing = function () {
  var f = $("pricing-form"); if (!f) return;
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    var patch = { pricing_headline: $("pp-head").value.trim() || null, pricing_subtitle: $("pp-sub").value.trim() || null, pricing_published: $("pp-pub").checked };
    var r = await sb.from("glimify_products").update(patch).eq("id", state.pid).select().single();
    if (r.error) { toast(errMsg(r.error), "bad"); return; }
    Object.assign(state.product, r.data); toast(patch.pricing_published ? "Pricing page published" : "Saved as draft", "ok"); route(true);
  });
};

/* ----- CSV import ----- */
function parseCSV(text) {
  var rows = [], row = [], f = "", q = false, i = 0, c;
  text = text.replace(/^\uFEFF/, "");
  for (; i < text.length; i++) {
    c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some(function (x) { return x.trim(); })) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some(function (x) { return x.trim(); })) rows.push(row);
  if (!rows.length) return [];
  var hdr = rows[0].map(function (h) { return h.trim().toLowerCase().replace(/[\s-]+/g, "_"); });
  return rows.slice(1).map(function (r) { var o = {}; hdr.forEach(function (h, j) { o[h] = (r[j] || "").trim(); }); return o; });
}
function parseDate(v) { if (!v) return null; var d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T12:00:00" : v); return isNaN(d.getTime()) ? undefined : d.toISOString(); }
PAGES.import = function () {
  var out = head("Import CSV", "Bring in real customers and subscriptions from your current billing tool or a spreadsheet. Nothing is uploaded until you confirm.");
  out += '<div class="grid g2"><div class="card"><div class="card-h"><h2>1 · Choose a file</h2></div><form class="auth-form" id="imp-form">' +
    '<label>What are you importing?<select id="imp-kind"><option value="subs">Subscriptions (creates customers too)</option><option value="customers">Customers only (leads)</option></select></label>' +
    '<label>CSV file<input type="file" id="imp-file" accept=".csv,text/csv"></label>' +
    '<label class="check"><input type="checkbox" id="imp-plans" checked> Create plans that don\'t exist yet (subscriptions only)</label></form>' +
    '<div class="tmpl"><b>Columns</b><p><code>email, name, plan, status, started_at, canceled_at, mrr</code> for subscriptions · <code>email, name, country, created_at</code> for customers. Status is active, trialing, past_due or canceled. Dates as YYYY-MM-DD. If mrr is empty, the plan\'s monthly price is used.</p>' +
    '<button class="linkish" type="button" data-act="tmpl-subs">Download subscriptions template</button> · <button class="linkish" type="button" data-act="tmpl-customers">Download customers template</button></div></div>' +
    '<div class="card"><div class="card-h"><h2>2 · Review & import</h2></div><div id="imp-preview"><p class="empty">Choose a CSV file to preview it here.</p></div></div></div>';
  return out;
};
var importRows = null;
BIND.import = function () {
  var file = $("imp-file"); if (!file) return;
  function preview() {
    var f = file.files && file.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { $("imp-preview").innerHTML = '<p class="err">File is larger than 5 MB.</p>'; return; }
    var rd = new FileReader();
    rd.onload = function () {
      var kind = $("imp-kind").value, rows = parseCSV(String(rd.result)), errs = [];
      rows = rows.slice(0, 5000);
      rows.forEach(function (r, i) {
        if (!r.email && !r.name) errs.push("Row " + (i + 2) + ": needs an email or name");
        else if (r.email && !/^[^@\s]+@[^@\s]+$/.test(r.email)) errs.push("Row " + (i + 2) + ": invalid email “" + r.email + "”");
        if (kind === "subs") {
          if (r.status && ["active", "trialing", "past_due", "canceled", "cancelled"].indexOf(r.status.toLowerCase()) < 0) errs.push("Row " + (i + 2) + ": unknown status “" + r.status + "”");
          if (parseDate(r.started_at) === undefined || parseDate(r.canceled_at) === undefined) errs.push("Row " + (i + 2) + ": unreadable date");
          if (r.mrr && !(Number(r.mrr.replace(/[^0-9.\-]/g, "")) >= 0)) errs.push("Row " + (i + 2) + ": invalid mrr");
          if (!r.plan && !r.mrr) errs.push("Row " + (i + 2) + ": needs a plan or an mrr");
        } else if (parseDate(r.created_at) === undefined) errs.push("Row " + (i + 2) + ": unreadable created_at");
      });
      importRows = errs.length ? null : { kind: kind, rows: rows };
      var cols = kind === "subs" ? ["email", "name", "plan", "status", "started_at", "canceled_at", "mrr"] : ["email", "name", "country", "created_at"];
      $("imp-preview").innerHTML = (errs.length ? '<div class="err-list"><b>Fix these and choose the file again:</b><ul>' + errs.slice(0, 12).map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + (errs.length > 12 ? "<li>…and " + (errs.length - 12) + " more</li>" : "") + "</ul></div>" : "") +
        '<p class="muted">' + num(rows.length) + " rows found" + "</p>" +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + cols.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.slice(0, 8).map(function (r) { return "<tr>" + cols.map(function (c) { return "<td>" + esc(r[c] || "") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" +
        (importRows && rows.length ? '<button class="btn btn-primary" style="margin-top:12px" data-act="run-import">Import ' + num(rows.length) + " rows</button>" : "");
    };
    rd.readAsText(f);
  }
  file.addEventListener("change", preview);
  $("imp-kind").addEventListener("change", preview);
};
async function runImport(btnEl) {
  if (!importRows) return;
  btnEl.disabled = true; btnEl.textContent = "Importing…";
  var kind = importRows.kind, rows = importRows.rows, made = { customers: 0, plans: 0, subs: 0, skipped: 0 };
  try {
    var byEmail = {}; state.customers.forEach(function (c) { if (c.email) byEmail[c.email.toLowerCase()] = c; });
    var newCust = [], seen = {};
    rows.forEach(function (r) {
      var em = (r.email || "").toLowerCase();
      if (em && (byEmail[em] || seen[em])) return;
      if (em) seen[em] = 1;
      newCust.push({ product_id: state.pid, email: r.email || null, name: r.name || null, country: r.country || null, created_at: parseDate(r.created_at) || parseDate(r.started_at) || new Date().toISOString() });
    });
    for (var i = 0; i < newCust.length; i += 500) {
      var cr = await sb.from("glimify_customers").insert(newCust.slice(i, i + 500)).select();
      if (cr.error) throw cr.error;
      cr.data.forEach(function (c) { if (c.email) byEmail[c.email.toLowerCase()] = c; state.customers.push(c); });
      made.customers += cr.data.length;
    }
    if (kind === "subs") {
      var planBy = {}; state.plans.forEach(function (p) { planBy[p.name.toLowerCase()] = p; });
      var wantPlans = {};
      rows.forEach(function (r) { if (r.plan && !planBy[r.plan.toLowerCase()]) wantPlans[r.plan.toLowerCase()] = r; });
      var names = Object.keys(wantPlans);
      if (names.length && $("imp-plans") && $("imp-plans").checked) {
        var pr = await sb.from("glimify_plans").insert(names.map(function (n, k) { var r = wantPlans[n]; return { product_id: state.pid, name: r.plan.slice(0, 60), price: Number(String(r.mrr || "0").replace(/[^0-9.]/g, "")) || 0, interval: "month", currency: state.product.currency, sort: state.plans.length + k }; })).select();
        if (pr.error) throw pr.error;
        pr.data.forEach(function (p) { planBy[p.name.toLowerCase()] = p; state.plans.push(p); }); made.plans = pr.data.length;
      }
      var subs = [];
      rows.forEach(function (r) {
        var c = r.email ? byEmail[r.email.toLowerCase()] : null;
        if (!c) { c = state.customers.find(function (x) { return !x.email && x.name === r.name; }); }
        if (!c) { made.skipped++; return; }
        var p = r.plan ? planBy[r.plan.toLowerCase()] : null;
        var st = (r.status || "active").toLowerCase(); if (st === "cancelled") st = "canceled";
        var mrr = r.mrr ? Number(r.mrr.replace(/[^0-9.]/g, "")) : monthly(p);
        var started = parseDate(r.started_at) || c.created_at || new Date().toISOString(), canceled = parseDate(r.canceled_at);
        if (canceled && t(canceled) < t(started)) canceled = started;
        subs.push({ product_id: state.pid, customer_id: c.id, plan_id: p ? p.id : null, status: canceled && st !== "canceled" ? "canceled" : st, started_at: started, canceled_at: st === "canceled" || canceled ? canceled : null, mrr: r2(mrr) });
      });
      for (var j = 0; j < subs.length; j += 500) {
        var sr = await sb.from("glimify_subscriptions").insert(subs.slice(j, j + 500)).select("id");
        if (sr.error) throw sr.error; made.subs += sr.data.length;
      }
    }
    importRows = null;
    toast("Imported " + made.customers + " customers" + (kind === "subs" ? ", " + made.subs + " subscriptions" + (made.plans ? ", " + made.plans + " new plans" : "") : "") + (made.skipped ? " · " + made.skipped + " skipped" : ""), "ok");
    await loadData({ silent: true }); location.hash = "#subscribers"; route();
  } catch (e) {
    toast("Import stopped: " + errMsg(e) + ". Rows imported before the error were kept.", "bad");
    btnEl.disabled = false; btnEl.textContent = "Retry import";
    await loadData({ silent: true });
  }
}
function download(name, text) {
  var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ----- settings ----- */
PAGES.settings = function () {
  var p = state.product;
  return head("Settings", "Product and account") + '<div class="grid g2"><div class="card"><div class="card-h"><h2>Product</h2></div><form class="auth-form" id="set-form">' +
    '<label>Name<input id="set-name" maxlength="80" value="' + esc(p.name) + '"></label><label>Website<input id="set-url" maxlength="300" value="' + esc(p.url || "") + '" placeholder="https://"></label>' +
    '<label>Currency<select id="set-cur"></select></label><p class="note" style="margin:0">Changing currency only relabels amounts — it does not convert them.</p><button class="btn btn-primary" type="submit">Save</button></form></div>' +
    '<div class="stack"><div class="card"><div class="card-h"><h2>Account</h2></div><div class="kv"><div><span>Signed in as</span><b>' + esc(state.user.email || "") + "</b></div><div><span>Sign-in method</span><b>" + esc(cap((state.user.app_metadata && state.user.app_metadata.provider) || "email")) + "</b></div><div><span>Products</span><b>" + num(state.products.length) + '</b></div></div><div class="ec-actions">' + btn("Add another product", "new-product") + btn("Log out", "logout") + "</div></div>" +
    '<div class="card danger-card"><div class="card-h"><h2>Danger zone</h2></div><p class="muted">Deleting “' + esc(p.name) + '” permanently removes its plans, customers, subscriptions, events and signals.</p>' + btn("Delete this product", "del-product") + "</div></div></div>";
};
BIND.settings = function () {
  fillCurrencies($("set-cur"), state.product.currency);
  $("set-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var name = $("set-name").value.trim(); if (!name) { toast("Name can't be empty", "bad"); return; }
    var r = await sb.from("glimify_products").update({ name: name, url: normUrl($("set-url").value), currency: $("set-cur").value }).eq("id", state.pid).select().single();
    if (r.error) { toast(errMsg(r.error), "bad"); return; }
    Object.assign(state.product, r.data); _mf = {}; renderProductSelect(); toast("Saved", "ok"); route(true);
  });
};

/* sound settings (Settings page) */
function soundSettings() {
  return '<div class="card"><div class="card-h"><h2>Notification sounds</h2>' + badge(state.muted ? "All muted" : "On", state.muted ? "" : "ok") + '</div><div class="kv snd">' + SOUND_GROUPS.map(function (g) {
    return '<div><label class="check"><input type="checkbox" data-snd="' + g.k + '"' + (soundOff[g.k] ? "" : " checked") + "> " + esc(g.label) + '</label><button class="linkish" type="button" data-act="test-sound" data-s="' + g.sound + '">▶ Play</button></div>';
  }).join("") + '</div><p class="note">Sounds play when a new lead or subscription event arrives while this app is open. Browsers only allow sound after you click somewhere on the page once. The speaker button in the top bar mutes everything.</p></div>';
}
var _settingsPage = PAGES.settings;
PAGES.settings = function () { return _settingsPage().replace('<div class="card danger-card">', soundSettings() + '<div class="card danger-card">'); };
var _settingsBind = BIND.settings;
BIND.settings = function () {
  _settingsBind();
  Array.prototype.forEach.call($("content").querySelectorAll("[data-snd]"), function (cb) {
    cb.addEventListener("change", function () {
      if (cb.checked) delete soundOff[cb.getAttribute("data-snd")]; else soundOff[cb.getAttribute("data-snd")] = 1;
      try { localStorage.setItem("glimify-app-sound-off", JSON.stringify(soundOff)); } catch (e) {}
    });
  });
};

/* ---------------- modals ---------------- */
var modalSubmit = null;
function openModal(title, fields, onSubmit, submitLabel, danger) {
  $("modal-title").textContent = title;
  $("modal-form").innerHTML = fields + '<div class="modal-f"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn ' + (danger ? "btn-danger" : "btn-primary") + '">' + esc(submitLabel || "Save") + "</button></div>";
  $("modal-err").textContent = "";
  modalSubmit = onSubmit;
  $("modal").hidden = false;
  var first = $("modal-form").querySelector("input:not([type=hidden]),select,textarea"); if (first) setTimeout(function () { first.focus(); }, 30);
}
function closeModal() { $("modal").hidden = true; modalSubmit = null; }
$("modal-x").addEventListener("click", closeModal);
$("modal").addEventListener("click", function (e) { if (e.target === $("modal") || e.target.hasAttribute("data-close")) closeModal(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });
$("modal-form").addEventListener("submit", async function (e) {
  e.preventDefault(); if (!modalSubmit) return;
  var b = $("modal-form").querySelector("button[type=submit]"); b.disabled = true; $("modal-err").textContent = "";
  try { var keep = await modalSubmit(); if (!keep) closeModal(); }
  catch (err) { $("modal-err").textContent = errMsg(err); }
  finally { b.disabled = false; }
});
function fv(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
function field(label, inner, hint) { return '<label><span class="lbl-t">' + label + "</span>" + inner + (hint ? '<small class="hint">' + hint + "</small>" : "") + "</label>"; }
function sel(id, opts, cur) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"; }
async function after(msg) { await loadData({ silent: true }); route(true); if (msg) toast(msg, "ok"); }

function openPlanModal(p) {
  p = p || {};
  openModal(p.id ? "Edit plan" : "New plan",
    field("Name", '<input id="m-name" maxlength="60" value="' + esc(p.name || "") + '" placeholder="Pro">') +
    '<div class="row2">' + field("Price (" + esc(state.product.currency) + ")", '<input id="m-price" type="number" min="0" step="0.01" value="' + esc(p.price != null ? p.price : "") + '" placeholder="29">') + field("Billing", sel("m-int", [["month", "Monthly"], ["year", "Yearly"], ["week", "Weekly"]], p.interval || "month")) + "</div>" +
    field("Description <span class=\"opt\">optional</span>", '<input id="m-desc" maxlength="300" value="' + esc(p.description || "") + '">') +
    field("Features <span class=\"opt\">one per line</span>", '<textarea id="m-feat" rows="4" maxlength="2000">' + esc((p.features || []).join("\n")) + "</textarea>") +
    '<label class="check"><input type="checkbox" id="m-hl"' + (p.highlighted ? " checked" : "") + "> Feature this plan on the pricing page</label>" +
    '<label class="check"><input type="checkbox" id="m-arch"' + (p.archived ? " checked" : "") + "> Archived (hidden from pricing page; existing subscribers keep it)</label>",
    async function () {
      var name = fv("m-name"), price = Number(fv("m-price"));
      if (!name) throw new Error("Give the plan a name.");
      if (!(price >= 0) || fv("m-price") === "") throw new Error("Enter a price (0 for a free plan).");
      var row = { name: name, price: r2(price), interval: fv("m-int"), currency: state.product.currency, description: fv("m-desc") || null,
        features: fv("m-feat").split("\n").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 20).map(function (x) { return x.slice(0, 120); }), highlighted: $("m-hl").checked, archived: $("m-arch").checked };
      var r = p.id ? await sb.from("glimify_plans").update(row).eq("id", p.id) : await sb.from("glimify_plans").insert(Object.assign({ product_id: state.pid, sort: state.plans.length }, row));
      if (r.error) throw r.error;
      await after(p.id ? "Plan updated" : "Plan created");
    }, p.id ? "Save plan" : "Create plan");
}
function customerOptions(cur) { return [["__new", "+ New customer…"]].concat(state.customers.slice().sort(function (a, b) { return (a.email || a.name || "").localeCompare(b.email || b.name || ""); }).map(function (c) { return [c.id, c.email || c.name || "Unnamed"]; })); }
function openSubModal(cid) {
  if (!state.plans.length) { toast("Add a plan first", "warn"); openPlanModal(null); return; }
  var plans = state.plans.filter(function (p) { return !p.archived; }); if (!plans.length) plans = state.plans;
  openModal("New subscription",
    field("Customer", sel("m-cust", customerOptions(), cid || "__new")) +
    '<div id="m-newcust" class="row2"' + (cid ? " hidden" : "") + ">" + field("Email", '<input id="m-email" type="email" maxlength="254" placeholder="name@company.com">') + field("Name <span class=\"opt\">optional</span>", '<input id="m-cname" maxlength="120">') + "</div>" +
    '<div class="row2">' + field("Plan", sel("m-plan", plans.map(function (p) { return [p.id, p.name + " · " + money(p.price) + "/" + intervalShort(p.interval)]; }), plans[0].id)) + field("Status", sel("m-status", [["active", "Active"], ["trialing", "Trialing"], ["past_due", "Past due"]], "active")) + "</div>" +
    '<div class="row2">' + field("MRR (" + esc(state.product.currency) + ")", '<input id="m-mrr" type="number" min="0" step="0.01" value="' + monthly(plans[0]) + '">', "Monthly value. Defaults from the plan.") + field("Started", '<input id="m-start" type="date" value="' + dateInput() + '" max="' + dateInput() + '">') + "</div>",
    async function () {
      var c = fv("m-cust");
      if (c === "__new") {
        var em = fv("m-email"), nm = fv("m-cname");
        if (!em && !nm) throw new Error("Enter the customer's email or name.");
        if (em && !/^[^@\s]+@[^@\s]+$/.test(em)) throw new Error("That email doesn't look right.");
        var cr = await sb.from("glimify_customers").insert({ product_id: state.pid, email: em || null, name: nm || null, created_at: fromDateInput(fv("m-start"), true) }).select().single();
        if (cr.error) throw cr.error; c = cr.data.id;
      }
      var mrr = Number(fv("m-mrr")); if (!(mrr >= 0)) throw new Error("Enter a valid MRR.");
      var r = await sb.from("glimify_subscriptions").insert({ product_id: state.pid, customer_id: c, plan_id: fv("m-plan"), status: fv("m-status"), mrr: r2(mrr), started_at: fromDateInput(fv("m-start"), true) });
      if (r.error) throw r.error;
      await after("Subscription added");
    }, "Add subscription");
  $("m-cust").addEventListener("change", function () { $("m-newcust").hidden = this.value !== "__new"; });
  $("m-plan").addEventListener("change", function () { $("m-mrr").value = monthly(state.planBy[this.value]); });
}
function openEditSubModal(s) {
  openModal("Change subscription",
    '<div class="row2">' + field("Plan", sel("m-plan", [["", "No plan"]].concat(state.plans.map(function (p) { return [p.id, p.name + " · " + money(p.price) + "/" + intervalShort(p.interval)]; })), s.plan_id || "")) + field("Status", sel("m-status", [["active", "Active"], ["trialing", "Trialing"], ["past_due", "Past due"], ["canceled", "Canceled"]], s.status)) + "</div>" +
    '<div class="row2">' + field("MRR (" + esc(state.product.currency) + ")", '<input id="m-mrr" type="number" min="0" step="0.01" value="' + esc(s.mrr) + '">', "Raising it records an upgrade, lowering it a downgrade.") + field("Started", '<input id="m-start" type="date" value="' + dateInput(s.started_at) + '" max="' + dateInput() + '">') + "</div>" +
    '<div id="m-canwrap"' + (s.status === "canceled" ? "" : " hidden") + ">" + field("Canceled on", '<input id="m-can" type="date" value="' + (s.canceled_at ? dateInput(s.canceled_at) : dateInput()) + '" max="' + dateInput() + '">') + "</div>" +
    '<p class="note">Changes are written to the Live Tape automatically (upgrade, downgrade, churn or reactivation).</p><button type="button" class="linkish danger" data-act="del-sub" data-id="' + s.id + '">Delete this subscription and its events</button>',
    async function () {
      var st = fv("m-status"), mrr = Number(fv("m-mrr")); if (!(mrr >= 0)) throw new Error("Enter a valid MRR.");
      var start = fv("m-start") === dateInput(s.started_at) ? s.started_at : fromDateInput(fv("m-start"), true);
      var can = st === "canceled" ? (s.status === "canceled" && fv("m-can") === dateInput(s.canceled_at) ? s.canceled_at : fromDateInput(fv("m-can"), true)) : null;
      if (can && t(can) < t(start)) throw new Error("Cancel date can't be before the start date.");
      var r = await sb.from("glimify_subscriptions").update({ plan_id: fv("m-plan") || null, status: st, mrr: r2(mrr), started_at: start, canceled_at: can }).eq("id", s.id);
      if (r.error) throw r.error;
      await after("Subscription updated");
    }, "Save changes");
  $("m-status").addEventListener("change", function () { $("m-canwrap").hidden = this.value !== "canceled"; });
  $("m-plan").addEventListener("change", function () { if (this.value) $("m-mrr").value = monthly(state.planBy[this.value]); });
}
function openCustomerModal(c) {
  c = c || {};
  openModal(c.id ? "Edit customer" : "New customer (lead)",
    '<div class="row2">' + field("Email", '<input id="m-email" type="email" maxlength="254" value="' + esc(c.email || "") + '">') + field("Name", '<input id="m-cname" maxlength="120" value="' + esc(c.name || "") + '">') + "</div>" +
    '<div class="row2">' + field("Country <span class=\"opt\">optional</span>", '<input id="m-country" maxlength="60" value="' + esc(c.country || "") + '">') + field("Customer since", '<input id="m-since" type="date" value="' + dateInput(c.created_at) + '" max="' + dateInput() + '">') + "</div>" +
    field("Notes", '<textarea id="m-notes" rows="3" maxlength="2000">' + esc(c.notes || "") + "</textarea>"),
    async function () {
      var em = fv("m-email"), nm = fv("m-cname");
      if (!em && !nm) throw new Error("Enter an email or a name.");
      if (em && !/^[^@\s]+@[^@\s]+$/.test(em)) throw new Error("That email doesn't look right.");
      var row = { email: em || null, name: nm || null, country: fv("m-country") || null, notes: fv("m-notes") || null, created_at: c.id && fv("m-since") === dateInput(c.created_at) ? c.created_at : fromDateInput(fv("m-since"), true) };
      var r = c.id ? await sb.from("glimify_customers").update(row).eq("id", c.id) : await sb.from("glimify_customers").insert(Object.assign({ product_id: state.pid }, row));
      if (r.error) throw r.error;
      await after(c.id ? "Customer updated" : "Lead added");
    }, c.id ? "Save" : "Add lead");
}
function openPaymentModal(cid) {
  openModal("Record payment or renewal",
    '<div class="row2">' + field("Type", sel("m-type", [["payment", "Payment"], ["renewal", "Renewal"]], "payment")) + field("Amount (" + esc(state.product.currency) + ")", '<input id="m-amt" type="number" min="0" step="0.01">') + "</div>" +
    '<div class="row2">' + field("Customer <span class=\"opt\">optional</span>", sel("m-cust", [["", "—"]].concat(customerOptions().slice(1)), cid || "")) + field("Date", '<input id="m-date" type="date" value="' + dateInput() + '" max="' + dateInput() + '">') + "</div>" +
    field("Note <span class=\"opt\">optional</span>", '<input id="m-note" maxlength="300">') + '<p class="note">Payments are logged on the Live Tape. They don\'t change MRR — MRR comes from subscriptions.</p>',
    async function () {
      var amt = Number(fv("m-amt")); if (!(amt > 0)) throw new Error("Enter the amount received.");
      var cust = fv("m-cust") || null, sub = null;
      if (cust) { var ls = latestSub(cust); if (ls) sub = ls.id; }
      var r = await sb.from("glimify_events").insert({ product_id: state.pid, customer_id: cust, subscription_id: sub, type: fv("m-type"), amount: r2(amt), mrr_delta: 0, occurred_at: fromDateInput(fv("m-date"), true), note: fv("m-note") || null });
      if (r.error) throw r.error;
      await after("Recorded");
    }, "Record");
}
function openSignalModal() {
  openModal("New signal",
    field("When", sel("m-metric", Object.keys(SIG_METRIC).map(function (k) { return [k, SIG_METRIC[k]]; }), "mrr")) +
    '<div class="row2">' + field("Condition", sel("m-op", Object.keys(SIG_OP).map(function (k) { return [k, SIG_OP[k] + (k.indexOf("pct") > -1 ? " … %" : " …")]; }), "drops_pct")) + field("Threshold", '<input id="m-th" type="number" min="0" step="0.01" value="5">') + "</div>" +
    field("Window", sel("m-win", [[1, "1 day"], [7, "7 days"], [30, "30 days"]], 1), "For % changes: compared with this long ago. For new / churned subscribers: counted over this window."),
    async function () {
      var th = Number(fv("m-th")); if (!(th >= 0)) throw new Error("Enter a threshold.");
      var r = await sb.from("glimify_signals").insert({ product_id: state.pid, metric: fv("m-metric"), op: fv("m-op"), threshold: th, window_days: parseInt(fv("m-win"), 10) });
      if (r.error) throw r.error;
      await after("Signal created");
    }, "Create signal");
}
function openProductModal() {
  openModal("Add product",
    field("Product name", '<input id="m-name" maxlength="80">') + field("Website <span class=\"opt\">optional</span>", '<input id="m-url" maxlength="300" placeholder="https://">') + field("Currency", '<select id="m-cur"></select>'),
    async function () {
      var name = fv("m-name"); if (!name) throw new Error("Give the product a name.");
      var r = await sb.from("glimify_products").insert({ name: name, url: normUrl(fv("m-url")), currency: fv("m-cur") }).select().single();
      if (r.error) throw r.error;
      state.products.push(r.data); closeModal(); await selectProduct(r.data.id); location.hash = "#home"; toast("Product created", "ok"); return true;
    }, "Create product");
  fillCurrencies($("m-cur"), state.product ? state.product.currency : "USD");
}
function confirmModal(title, text, label, fn) { openModal(title, '<p class="muted">' + text + "</p>", fn, label, true); }

/* ---------------- actions (event delegation) ---------------- */
document.addEventListener("click", async function (e) {
  var b = e.target.closest("[data-act]"); if (!b) return;
  var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
  if (b.tagName === "A") e.preventDefault();
  switch (act) {
    case "new-plan": return openPlanModal(null);
    case "edit-plan": return openPlanModal(state.planBy[id]);
    case "del-plan": {
      var p = state.planBy[id], n = state.subs.filter(function (s) { return s.plan_id === id; }).length;
      return confirmModal("Delete plan “" + p.name + "”?", n ? n + " subscription(s) use this plan. They'll keep their MRR but show “No plan”. To just hide it from your pricing page, archive it instead." : "This can't be undone.", "Delete plan", async function () {
        var r = await sb.from("glimify_plans").delete().eq("id", id); if (r.error) throw r.error; await after("Plan deleted");
      });
    }
    case "new-sub": return openSubModal(b.getAttribute("data-cid"));
    case "edit-sub": return openEditSubModal(state.subBy[id]);
    case "cancel-sub": return confirmModal("Cancel this subscription?", "It will be marked canceled today and recorded as churn on the Live Tape.", "Cancel subscription", async function () {
      var r = await sb.from("glimify_subscriptions").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("id", id); if (r.error) throw r.error; await after("Subscription canceled");
    });
    case "del-sub": return confirmModal("Delete subscription?", "This removes the subscription and its events from your history (MRR history changes as if it never existed). To record churn instead, cancel it.", "Delete", async function () {
      var r = await sb.from("glimify_subscriptions").delete().eq("id", id); if (r.error) throw r.error; await after("Subscription deleted");
    });
    case "new-customer": return openCustomerModal(null);
    case "edit-customer": return openCustomerModal(state.custBy[id]);
    case "del-customer": return confirmModal("Delete customer?", "Their subscriptions and events are deleted too, and your MRR history is recalculated without them.", "Delete customer", async function () {
      var r = await sb.from("glimify_customers").delete().eq("id", id); if (r.error) throw r.error; location.hash = "#subscribers"; await after("Customer deleted");
    });
    case "new-payment": return openPaymentModal(b.getAttribute("data-cid"));
    case "new-signal": return openSignalModal();
    case "toggle-signal": {
      var sg = state.signals.find(function (x) { return x.id === id; });
      var r = await sb.from("glimify_signals").update({ enabled: !sg.enabled }).eq("id", id); if (r.error) return toast(errMsg(r.error), "bad");
      delete state.firedSignals[id]; return after(sg.enabled ? "Signal paused" : "Signal resumed");
    }
    case "del-signal": {
      var r2s = await sb.from("glimify_signals").delete().eq("id", id); if (r2s.error) return toast(errMsg(r2s.error), "bad"); return after("Signal deleted");
    }
    case "copy-pricing": try { await navigator.clipboard.writeText(pricingUrl()); toast("Link copied", "ok"); } catch (e2) { $("pp-url").select(); } return;
    case "tmpl-subs": return download("glimify-subscriptions-template.csv", "email,name,plan,status,started_at,canceled_at,mrr\n");
    case "tmpl-customers": return download("glimify-customers-template.csv", "email,name,country,created_at\n");
    case "run-import": return runImport(b);
    case "test-sound": return playSound(b.getAttribute("data-s"));
    case "new-product": return openProductModal();
    case "logout": return logout();
    case "del-product": {
      var pr = state.product;
      openModal("Delete “" + pr.name + "”?", '<p class="muted">Type the product name to confirm. All of its data is deleted permanently.</p>' + field("Product name", '<input id="m-confirm" autocomplete="off">'), async function () {
        if (fv("m-confirm") !== pr.name) throw new Error("The name doesn't match.");
        var r = await sb.from("glimify_products").delete().eq("id", pr.id); if (r.error) throw r.error;
        state.products = state.products.filter(function (x) { return x.id !== pr.id; });
        closeModal();
        if (!state.products.length) { stopLive(); state.product = null; fillCurrencies($("ob-cur"), "USD"); show("view-onboard"); return true; }
        await selectProduct(state.products[0].id); location.hash = "#home"; toast("Product deleted", "ok"); return true;
      }, "Delete forever", true);
      return;
    }
  }
});

/* Safety net in case the auth library never reports an initial session. */
setTimeout(function () { if (!$("view-loading").hidden) boot(); }, 4000);
