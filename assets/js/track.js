/* Glimify privacy-friendly page-view tracker.
   Sends ONLY: site name, page path (no query string), referrer host (other sites only),
   and a random anonymous session id kept in this browser (rotates after 30 min idle).
   No cookies, no IP stored, no fingerprinting, no personal data. Respects Do Not Track.
   Insert-only table public.site_pageviews; the public key cannot read it back. */
(function () {
  try {
    var SITE = "glimify";
    var URL_ = "https://izcqyzrzjtogsfrffknp.supabase.co/rest/v1/site_pageviews";
    var KEY = "sb_publishable_Q4JbiEEDoJzbcBJsmsq6rA_7I-_dkI2";
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl) return;
    if (/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) return;
    if (navigator.webdriver) return;

    var IDLE = 30 * 60 * 1000, now = Date.now(), sid = null;
    try {
      var s = JSON.parse(localStorage.getItem("glimify_sid") || "null");
      if (s && s.id && now - s.t < IDLE) sid = s.id;
      if (!sid) sid = (crypto.randomUUID ? crypto.randomUUID() : null);
      if (sid) localStorage.setItem("glimify_sid", JSON.stringify({ id: sid, t: now }));
    } catch (e) { sid = null; }

    var ref = null;
    try {
      if (document.referrer) {
        var r = new URL(document.referrer);
        if (r.hostname !== location.hostname) ref = r.hostname.slice(0, 200);
      }
    } catch (e) {}

    var body = JSON.stringify({ site: SITE, path: (location.pathname || "/").slice(0, 300), referrer: ref, session_id: sid });
    fetch(URL_, {
      method: "POST", keepalive: true, credentials: "omit",
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: body
    }).catch(function () {});
  } catch (e) {}
})();
