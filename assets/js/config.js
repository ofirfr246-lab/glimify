/* ==========================================================================
   Glimify site config — the ONE place to change runtime settings.
   (Static files like sitemap.xml / robots.txt / meta tags are updated with
   `python3 scripts/set_domain.py <new-domain>`, which reads site.config.json.)
   ========================================================================== */
window.GLIMIFY_CONFIG = {
  // Public site URL. Placeholder until the domain is bought.
  SITE_URL: "https://glimify.app",

  // Waitlist endpoint: Supabase REST, insert-only RLS on glimify_waitlist.
  // Only a PUBLIC (publishable) key is stored here — never a secret key.
  WAITLIST_ENDPOINT: "https://ksjafkgxvzgfrluzjdzt.supabase.co/rest/v1/glimify_waitlist",
  WAITLIST_HEADERS: {
    apikey: "sb_publishable_YBG2tpGS8qH2K-AI-u9R8A_Z2L1aFyr",
    Authorization: "Bearer sb_publishable_YBG2tpGS8qH2K-AI-u9R8A_Z2L1aFyr",
    Prefer: "return=minimal"
  }
};

/* Private live dashboard (dashboard.html). Uses the same PUBLIC publishable key.
   Data is protected server-side: public.glimify_dashboard_stats() only answers
   for accounts listed in public.glimify_admins (Glimify's own Supabase project). */
window.GLIMIFY_CONFIG.SUPABASE_URL = "https://ksjafkgxvzgfrluzjdzt.supabase.co";
window.GLIMIFY_CONFIG.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YBG2tpGS8qH2K-AI-u9R8A_Z2L1aFyr";
