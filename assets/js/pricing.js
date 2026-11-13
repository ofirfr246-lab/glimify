/* Public pricing page for a Glimify product: pricing.html?p=<product id>.
   Uses an anonymous (no session) client. The database only lets anonymous visitors
   read PUBLISHED products and their non-archived plans, and only public columns. */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

var CFG = window.GLIMIFY_CONFIG || {};
var sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "glimify-pricing-anon" } });
var root = document.getElementById("pp");
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function msg(title, text) { root.innerHTML = '<div class="pp-msg"><h1>' + esc(title) + '</h1><p class="muted">' + esc(text) + "</p></div>"; }
function safeUrl(u) { try { var x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch (e) { return null; } }

async function main() {
  var id = new URLSearchParams(location.search).get("p") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return msg("Pricing page not found", "This link is missing or incomplete.");
  var pr = await sb.from("glimify_products").select("id,name,url,currency,pricing_headline,pricing_subtitle").eq("id", id).eq("pricing_published", true).maybeSingle();
  if (pr.error) return msg("Couldn't load pricing", "Please try again in a moment.");
  if (!pr.data) return msg("Pricing page not found", "It may not be published yet.");
  var p = pr.data;
  var pl = await sb.from("glimify_plans").select("id,name,price,interval,currency,description,features,highlighted,sort").eq("product_id", id).eq("archived", false).order("sort").order("price");
  if (pl.error) return msg("Couldn't load pricing", "Please try again in a moment.");
  var plans = pl.data || [];
  document.title = "Pricing · " + p.name;
  var fmt; try { fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }); } catch (e) { fmt = { format: function (v) { return p.currency + " " + v; } }; }
  var intervals = Array.from(new Set(plans.map(function (x) { return x.interval; })));
  var cur = intervals.indexOf("month") > -1 ? "month" : intervals[0];
  var href = safeUrl(p.url);
  function render() {
    var shown = intervals.length > 1 ? plans.filter(function (x) { return x.interval === cur; }) : plans;
    root.innerHTML = '<div class="pp-top"><div class="pp-name">' + esc(p.name) + "</div><h1>" + esc(p.pricing_headline || "Simple pricing for " + p.name) + "</h1>" + (p.pricing_subtitle ? "<p>" + esc(p.pricing_subtitle) + "</p>" : "") +
      (intervals.length > 1 ? '<div class="pp-toggle"><div class="seg">' + intervals.map(function (i) { return '<button data-i="' + esc(i) + '" class="' + (i === cur ? "on" : "") + '">' + (i === "year" ? "Yearly" : i === "week" ? "Weekly" : "Monthly") + "</button>"; }).join("") + "</div></div>" : "") + "</div>" +
      (shown.length ? '<div class="pp-grid">' + shown.map(function (x) {
        var unit = x.interval === "year" ? "/year" : x.interval === "week" ? "/week" : "/month";
        return '<div class="pp-plan' + (x.highlighted ? " hl" : "") + '"><h2>' + esc(x.name) + (x.highlighted ? ' <span class="badge ok">Popular</span>' : "") + '</h2><div class="pp-amt">' + esc(fmt.format(Number(x.price) || 0)) + "<small>" + unit + "</small></div>" +
          (x.description ? "<p>" + esc(x.description) + "</p>" : "") + "<ul>" + (x.features || []).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" +
          (href ? '<a class="btn ' + (x.highlighted ? "btn-primary" : "") + '" href="' + esc(href) + '" rel="noopener nofollow">Get started</a>' : "") + "</div>";
      }).join("") + "</div>" : '<p class="muted" style="text-align:center">No plans are listed yet.</p>');
    Array.prototype.forEach.call(root.querySelectorAll("[data-i]"), function (b) { b.addEventListener("click", function () { cur = b.getAttribute("data-i"); render(); }); });
  }
  render();
}
main().catch(function () { msg("Couldn't load pricing", "Please try again in a moment."); });
