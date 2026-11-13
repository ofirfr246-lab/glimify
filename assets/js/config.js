/* ==========================================================================
   Glimify site config — the ONE place to change runtime settings.
   (Static files like sitemap.xml / robots.txt / meta tags are updated with
   `python3 scripts/set_domain.py <new-domain>`, which reads site.config.json.)
   ========================================================================== */
window.GLIMIFY_CONFIG = {
  // Public site URL. Placeholder until the domain is bought.
  SITE_URL: "https://glimify.app",

  // Waitlist endpoint. Leave '' until a backend exists.
  // When set, the form POSTs JSON: { email, product_url, stage, source, created_at }.
  // Example (Supabase REST, table with an insert-only RLS policy):
  //   WAITLIST_ENDPOINT: "https://<project>.supabase.co/rest/v1/waitlist"
  //   WAITLIST_HEADERS: { apikey: "<anon key>", Authorization: "Bearer <anon key>", Prefer: "return=minimal" }
  // Only ever put a PUBLIC (anon / publishable) key here — never a secret key.
  WAITLIST_ENDPOINT: "",
  WAITLIST_HEADERS: {}
};
